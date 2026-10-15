<?php
/**
 * api/v2/lib/fetch.php — reaching out to somebody else's server, without reaching into ours.
 *
 * Two builder actions follow a link that a person pasted: `fetch_page` (pick sections from another site's
 * page) and `import_url` (pull a stock image in). Both are server-side requests to an address the user
 * controls, which is the definition of SSRF — the interesting target is never the page they pasted, it is
 * `http://169.254.169.254/` (cloud metadata), `http://127.0.0.1/api/v2/index.php?action=appr_apply`, or a
 * hostname that resolves to one of those.
 *
 * v2.1 grew a set of rules for this (security audit F-06) and they are rules worth keeping, so they are
 * ported here rather than reinvented:
 *
 *   1. **https only**, no credentials in the URL, no port other than 443;
 *   2. the host must be a name, not an address — `https://127.0.0.1/` is refused before it is resolved;
 *   3. names that only exist inside a network are refused by their shape (`localhost`, `*.local`,
 *      `*.internal`, `*.localhost`);
 *   4. **every** address the name resolves to must be public. A name that resolves to one public address
 *      and one private one is a name that is trying to be both, and it is refused;
 *   5. redirects are followed **by hand**, at most 3, and every hop passes rules 1–4 again — a public URL
 *      that redirects to `http://10.0.0.5/` is the ordinary way to walk around a check that only looks at
 *      the first URL;
 *   6. the body is capped (3 MB of HTML, 8 MB of image), read with the cap rather than after it;
 *   7. the certificate and the name are verified, and no request is ever sent with our cookies or headers.
 *
 * The transport is injected (`$opts['get']` / `$opts['resolve']`) for one reason: the rules above are the
 * part that must be right, and a rule that can only be exercised by a real network call in a test suite is
 * a rule that is only tested when somebody remembers. Every refusal below is asserted against a fake
 * transport in `tests/run.php` — including the redirect into a private address.
 */

declare(strict_types=1);

/** Redirects a fetch will follow, re-checking the rules on each one. */
const WX_FETCH_HOPS = 3;

/** The most HTML a section picker may pull back (v2.1's own limit). */
const WX_FETCH_MAX_HTML = 3145728;

/** The most image data an import may pull back (v2.1's upload limit). */
const WX_FETCH_MAX_IMAGE = 8388608;

/** The user agent a fetch announces itself with. A fetch is not a browser and does not pretend to be one. */
const WX_FETCH_UA = 'WoodexBuilder/1.0 (+https://woodex.pk)';

/**
 * Rule 1, 2 and 3: may this URL be requested at all?
 *
 * Query strings are allowed (a stock image often has one), fragments are not sent by anything and are
 * stripped, and the path is not inspected — the path is the *destination*, not the risk.
 *
 * @return array{ok:bool,why:string,host:string}
 */
function wx_fetch_url_ok(string $url): array
{
    $url = trim($url);
    if ($url === '' || strlen($url) > 2000) {
        return ['ok' => false, 'why' => 'Paste a public https:// link', 'host' => ''];
    }
    $p = @parse_url($url);
    if (!is_array($p) || ($p['scheme'] ?? '') !== 'https' || ($p['host'] ?? '') === '') {
        return ['ok' => false, 'why' => 'Only public https:// links are allowed', 'host' => ''];
    }
    if (isset($p['user']) || isset($p['pass'])) {
        return ['ok' => false, 'why' => 'A link with a username or password in it is refused', 'host' => ''];
    }
    if (isset($p['port']) && (int) $p['port'] !== 443) {
        return ['ok' => false, 'why' => 'Only the ordinary https port is allowed', 'host' => ''];
    }
    $host = strtolower((string) $p['host']);
    $bare = trim($host, '[]');
    if (filter_var($bare, FILTER_VALIDATE_IP)) {
        /* Rule 2: an address in the link means the person knows the address, and an address can be changed
           between the check and the request. Names only — and a name is resolved below. */
        return ['ok' => false, 'why' => 'Use the site address (a name), not a numeric IP address', 'host' => ''];
    }
    if (preg_match('~^(localhost|.*\.local|.*\.internal|.*\.localhost)$~', $host)) {
        return ['ok' => false, 'why' => 'Only public websites are allowed', 'host' => ''];
    }
    if (!preg_match('~^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$~', $host)) {
        return ['ok' => false, 'why' => 'That is not a website address', 'host' => ''];
    }
    return ['ok' => true, 'why' => '', 'host' => $host];
}

/**
 * Rule 4, one address at a time: is this address on the public internet?
 *
 * `FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE` is v2.1's check and it covers the private and
 * reserved blocks, but it quietly accepts an IPv4 address written as IPv6 (`::ffff:127.0.0.1` is a
 * *reserved* address, not a private one, so the flags pass it). That form is exactly how a check like this
 * gets walked around, so it is refused explicitly, together with the two addresses that mean "here".
 */
function wx_fetch_ip_ok(string $ip): bool
{
    $ip = trim($ip);
    if ($ip === '') {
        return false;
    }
    $low = strtolower($ip);
    if ($low === '::' || $low === '::1' || $low === '0.0.0.0') {
        return false;
    }
    if (preg_match('~^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$~', $low, $m)) {
        return wx_fetch_ip_ok($m[1]);
    }
    return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

/**
 * Rule 4, for the whole name: resolve it and check every answer.
 *
 * Fail closed: a name that does not resolve, or resolves to anything that is not public, is refused with
 * the same message — the difference is not something the caller needs, and saying "it resolved to an
 * internal address" out loud is a small map of our network for whoever asked.
 *
 * @return array{ok:bool,why:string,ips:array<int,string>}
 */
function wx_fetch_resolve(string $host): array
{
    $ips = [];
    /* `gethostbynamel()` is IPv4 only, and an AAAA-only host would then be refused for no good reason — so
       try the general resolver first and fall back to it. */
    $found = @dns_get_record($host, DNS_A | DNS_AAAA);
    if (is_array($found)) {
        foreach ($found as $rec) {
            if (!empty($rec['ip'])) {
                $ips[] = (string) $rec['ip'];
            }
            if (!empty($rec['ipv6'])) {
                $ips[] = (string) $rec['ipv6'];
            }
        }
    }
    if (!$ips) {
        $ips = @gethostbynamel($host) ?: [];
    }
    $ips = array_values(array_unique($ips));
    if (!$ips) {
        return ['ok' => false, 'why' => 'Could not find that website', 'ips' => []];
    }
    foreach ($ips as $ip) {
        if (!wx_fetch_ip_ok($ip)) {
            return ['ok' => false, 'why' => 'Only public websites are allowed', 'ips' => []];
        }
    }
    return ['ok' => true, 'why' => '', 'ips' => $ips];
}

/**
 * The transport: one request, no redirects followed, the body read up to the cap.
 *
 * `follow_location` is off on purpose. Letting PHP follow redirects would mean the rules above were applied
 * to the first address with nothing looking at the second, which is the whole attack.
 *
 * @return array{code:int,body:string,location:string,type:string}
 */
function wx_fetch_get(string $url, int $maxBytes, string $accept): array
{
    $ctx = stream_context_create([
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        'http' => [
            'method' => 'GET',
            'timeout' => 20,
            'follow_location' => 0,
            'max_redirects' => 1,
            'ignore_errors' => true,
            'user_agent' => WX_FETCH_UA,
            'header' => "Accept: " . $accept . "\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx, 0, $maxBytes + 1);
    $code = 0;
    $loc = '';
    $type = '';
    foreach ((array) ($http_response_header ?? []) as $h) {
        if (preg_match('~^HTTP/\S+\s+(\d{3})~', (string) $h, $m)) {
            $code = (int) $m[1];
        } elseif (preg_match('~^Location:\s*(\S+)~i', (string) $h, $m)) {
            $loc = $m[1];
        } elseif (preg_match('~^Content-Type:\s*([^;]+)~i', (string) $h, $m)) {
            $type = strtolower(trim($m[1]));
        }
    }
    return ['code' => $code, 'body' => $body === false ? '' : (string) $body, 'location' => $loc, 'type' => $type];
}

/**
 * Fetch a URL, following up to three redirects and re-checking every rule on every hop.
 *
 * @param array{resolve?:callable,get?:callable} $opts injected for tests; the defaults are the two functions above
 * @return array{body:string,url:string,type:string,code:int,hops:int}
 */
function wx_fetch_https(string $url, int $maxBytes, string $accept, array $opts = []): array
{
    $resolve = $opts['resolve'] ?? 'wx_fetch_resolve';
    $get = $opts['get'] ?? 'wx_fetch_get';
    $current = $url;

    for ($hop = 0; $hop <= WX_FETCH_HOPS; $hop++) {
        $u = wx_fetch_url_ok($current);
        if (!$u['ok']) {
            throw ApiError::validation($u['why'], 'url');
        }
        $r = $resolve($u['host']);
        if (!$r['ok']) {
            throw ApiError::validation($r['why'], 'url');
        }
        $res = $get($current, $maxBytes, $accept);
        $code = (int) ($res['code'] ?? 0);
        if ($code >= 300 && $code < 400 && (string) ($res['location'] ?? '') !== '') {
            /* A relative Location is resolved against the address we asked for; an absolute one is taken as
               it is and gets the full treatment on the next pass. */
            $loc = (string) $res['location'];
            $current = str_starts_with($loc, 'http://') || str_starts_with($loc, 'https://')
                ? $loc
                : 'https://' . $u['host'] . '/' . ltrim($loc, '/');
            continue;
        }
        if ($code < 200 || $code >= 300) {
            throw ApiError::validation('That website answered ' . ($code > 0 ? (string) $code : 'with nothing') . ', so there is nothing to use', 'url');
        }
        if ((string) ($res['body'] ?? '') === '') {
            throw ApiError::validation('That page came back empty', 'url');
        }
        if (strlen((string) $res['body']) > $maxBytes) {
            throw ApiError::validation('That is larger than ' . (int) round($maxBytes / 1048576) . ' MB', 'url');
        }
        return [
            'body' => (string) $res['body'],
            'url' => $current,
            'type' => (string) ($res['type'] ?? ''),
            'code' => $code,
            'hops' => $hop,
        ];
    }
    /* Falling out of the loop means every hop was a redirect. A chain that never ends is a way to keep a
       request open, so it is refused rather than followed further. */
    throw ApiError::validation('That link redirects too many times — paste the address it ends at', 'url');
}

/** Rule 6 for HTML, and the shape check v2.1 made: a JSON or PDF answer is not a page to pick sections from. */
function wx_fetch_html_ok(string $html): bool
{
    return strlen($html) <= WX_FETCH_MAX_HTML
        && preg_match('~<(html|body|section|div)[\s>]~i', $html) === 1;
}

/** Fetch a page for the section picker: HTML only, 3 MB, and it has to look like a page. */
function wx_fetch_page(string $url, array $opts = []): array
{
    $r = wx_fetch_https($url, WX_FETCH_MAX_HTML, 'text/html,application/xhtml+xml', $opts);
    if (!wx_fetch_html_ok($r['body'])) {
        throw ApiError::validation('That link is not an HTML page', 'url');
    }
    return $r;
}

/** Fetch an image for the media library: image types only, 8 MB. */
function wx_fetch_image(string $url, array $opts = []): array
{
    $r = wx_fetch_https($url, WX_FETCH_MAX_IMAGE, 'image/*', $opts);
    if (strlen($r['body']) > WX_FETCH_MAX_IMAGE) {
        throw ApiError::validation('Image is larger than 8 MB', 'url');
    }
    return $r;
}
