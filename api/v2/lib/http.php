<?php
/**
 * api/v2/lib/http.php — request parsing, the response envelope, request-id, headers.
 *
 * Master plan §6.1: every response is one envelope, including errors. This file is the only place
 * that writes to the output stream, which is what makes "no exceptions" checkable.
 */

declare(strict_types=1);

/* ------------------------------------------------------------------ request */

/**
 * A per-request value, computed once.
 *
 * The naive version of this is a `static` inside each accessor, which is correct for one request and
 * wrong for tests/roundtrip.php, which drives several requests in one process. A generation counter
 * keeps both honest: the cache is keyed by generation, and wx_reset_request_cache() starts a new one.
 * Production never calls the reset, so the behaviour is a plain static.
 */
function wx_request_generation(): int
{
    return (int) ($GLOBALS['WX_REQ_GEN'] ?? 1);
}

function wx_once(string $key, callable $fn)
{
    $gen = wx_request_generation();
    if (!isset($GLOBALS['WX_ONCE'][$gen]) || !array_key_exists($key, $GLOBALS['WX_ONCE'][$gen])) {
        $GLOBALS['WX_ONCE'][$gen][$key] = $fn();
    }
    return $GLOBALS['WX_ONCE'][$gen][$key];
}

/** Begin a new logical request. Only tests call this; nothing in production resets mid-request. */
function wx_reset_request_cache(): void
{
    $GLOBALS['WX_REQ_GEN'] = wx_request_generation() + 1;
    // Drop older generations so a long test run does not accumulate request state.
    foreach (array_keys($GLOBALS['WX_ONCE'] ?? []) as $gen) {
        if ((int) $gen !== wx_request_generation()) {
            unset($GLOBALS['WX_ONCE'][$gen]);
        }
    }
    unset($GLOBALS['WX_SESSION']);
}

/**
 * A request-id is minted per request unless the caller supplied one, and is echoed in meta so a
 * user-reported error can be found in the log. Format: r_ + 8 hex chars.
 */
function wx_request_id(): string
{
    return wx_once('request_id', static function (): string {
        $given = (string) ($_SERVER['HTTP_X_WX_REQUEST_ID'] ?? '');
        return preg_match('~^r_[a-f0-9]{6,16}$~', $given) ? $given : 'r_' . bin2hex(random_bytes(4));
    });
}

function wx_method(): string
{
    return wx_once('method', static function (): string {
        $m = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        // A browser form (or a proxy that cannot send PATCH) can override with ?_method=.
        $override = strtoupper((string) ($_GET['_method'] ?? ''));
        if ($override !== '' && in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) {
            $m = $override;
        }
        return $m;
    });
}

/**
 * The path after the API mount, e.g. "/leads/12". Works with mod_rewrite, with PATH_INFO, and when
 * the host serves index.php directly with ?path=. Apache on Hostinger has mod_rewrite; the other
 * two forms exist so the CLI test harness and a locked-down host behave identically.
 */
function wx_path(): string
{
    return wx_once('path', static function (): string {
    $raw = '';
    if (isset($_GET['path']) && $_GET['path'] !== '') {
        $raw = (string) $_GET['path'];
    } elseif (!empty($_SERVER['PATH_INFO'])) {
        $raw = (string) $_SERVER['PATH_INFO'];
    } else {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        $uri = (string) (explode('?', $uri)[0] ?? '');
        // Strip the mount point: /api/v2 or /api/v2/index.php
        $mount = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/v2/index.php'))), '/');
        if ($mount !== '' && str_starts_with($uri, $mount)) {
            $uri = substr($uri, strlen($mount));
        }
        $raw = (string) (preg_replace('~^/index\.php~', '', $uri) ?? '');
    }
    return '/' . trim($raw, '/');
    });
}

/** Segments of the path with empty parts removed: "/leads/12" → ['leads','12'] */
function wx_segments(): array
{
    return wx_once('segments', static function (): array {
        return array_values(array_filter(explode('/', wx_path()), static function ($x) { return $x !== ''; }));
    });
}

/**
 * The JSON body, decoded once. Accepts a form-encoded body too so a plain HTML form works before
 * the React client exists. Returns [] for an empty body rather than throwing.
 */
function wx_body(): array
{
    return wx_once('body', static function (): array {
    // A test can hand the body over directly, because a CLI process cannot write to php://input.
    if (isset($GLOBALS['WX_TEST_BODY']) && is_array($GLOBALS['WX_TEST_BODY'])) {
        return $GLOBALS['WX_TEST_BODY'];
    }
    $raw = (string) file_get_contents('php://input');
    if ($raw === '') {
        return $_POST;
    }
    $type = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
    if (stripos($type, 'json') !== false) {
        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw ApiError::validation('The request body is not valid JSON');
        }
        if (!is_array($decoded)) {
            throw ApiError::validation('The request body must be a JSON object');
        }
        return $decoded;
    }
    return $_POST + $_GET;
    });
}

/** A body value with a default, without the caller repeating isset(). */
function wx_in(string $key, $default = null)
{
    $b = wx_body();
    return array_key_exists($key, $b) ? $b[$key] : $default;
}

function wx_query(string $key, $default = null)
{
    return array_key_exists($key, $_GET) ? $_GET[$key] : $default;
}

/** First address in X-Forwarded-For when a proxy is in front, else the socket peer. */
function wx_ip(): string
{
    $fwd = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($fwd !== '') {
        $first = trim(explode(',', $fwd)[0]);
        if ($first !== '' && filter_var($first, FILTER_VALIDATE_IP)) {
            return substr($first, 0, 64);
        }
    }
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

/**
 * A per-key request limit, kept in `wx_throttle` — the same table and the same namespaced-key trick
 * v2.1 used (`c|1.2.3.4`, `book:1.2.3.4`), because the live widget and the old admin share this table
 * and neither should see the other's counters.
 *
 * The key is the caller's idea of identity: an IP for a public form, something more specific when a
 * limit is about one thing rather than one person. Callers pass a namespaced key so two features cannot
 * spend each other's budget.
 *
 * `n` counts up to `max` inside `window` seconds, then refuses until the window rolls over. A refusal is
 * a 429 with a sentence a person can act on — never a silent drop.
 */
function wx_rate(string $key, int $max, int $window, string $message = 'Too many requests — please wait a few minutes'): void
{
    $row = wx_one('SELECT n, t FROM wx_throttle WHERE ip = ?', [$key]);
    $now = time();
    if ($row === null) {
        wx_insert('wx_throttle', ['ip' => $key, 'n' => 1, 't' => $now]);
        return;
    }
    if ($now - (int) $row['t'] >= $window) {
        wx_q('UPDATE wx_throttle SET n = 1, t = ? WHERE ip = ?', [$now, $key]);
        return;
    }
    if ((int) $row['n'] >= $max) {
        throw new ApiError('RATE_LIMIT', $message, 429);
    }
    wx_q('UPDATE wx_throttle SET n = n + 1 WHERE ip = ?', [$key]);
}

function wx_ua(): string
{
    return substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200);
}

/* ------------------------------------------------------------------ response */

/** Headers every v2 response carries. Same-origin, so no Access-Control-* at all. */
function wx_send_headers(): void
{
    if (headers_sent()) {
        return;
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('X-WX-Request-Id: ' . wx_request_id());
    header('Referrer-Policy: same-origin');
    // The API is never framed; the SPA is a separate origin-free page.
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
}

/**
 * The single exit point. Buffers are discarded so a stray echo or a PHP warning can never corrupt
 * the JSON (this is what made "blank failure" possible in v2.1).
 */
function wx_respond(array $envelope, int $status = 200): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    /* WX_RESPOND_CAPTURE lets tests/roundtrip.php drive several requests in one process: a response is
       recorded and returned instead of written and exited. Only a test defines that constant, so the
       production path is unchanged — one exit, one envelope. */
    if (defined('WX_RESPOND_CAPTURE')) {
        $GLOBALS['WX_RESPONSES'][] = ['status' => $status, 'body' => $envelope, 'headers' => wx_test_headers()];
        return;
    }
    wx_send_headers();
    http_response_code($status);
    echo json_encode($envelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send a file as the response body instead of JSON.
 *
 * There are exactly two places in the product that have to answer with bytes: the file manager's zip
 * download, and — in Phase 5 — a backup download. Both are "the browser asked for a file and the admin
 * has already decided the person may have it", so the rule is that a route never streams: it returns a
 * spec (`path`, `name`, `mime`, and whether to delete the file afterwards) and this is the single place
 * that writes it out. Keeping the readfile() here, next to the one JSON output, is what makes "only the
 * front controller writes output" still true.
 *
 * The name is stripped to a safe set before it reaches the header: a file name is attacker-influenced
 * text, and a newline in a Content-Disposition filename is a header injection.
 */
function wx_send_file(array $spec): void
{
    $path = (string) ($spec['path'] ?? '');
    $delete = !empty($spec['delete']);
    if ($path === '' || !is_file($path)) {
        throw ApiError::notFound('That file is no longer there');
    }
    $name = (string) preg_replace('~[^a-zA-Z0-9._ -]~', '-', (string) ($spec['name'] ?? basename($path)));
    $mime = (string) ($spec['mime'] ?? 'application/octet-stream');
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (defined('WX_RESPOND_CAPTURE')) {
        $GLOBALS['WX_RESPONSES'][] = ['status' => 200, 'file' => ['name' => $name, 'size' => (int) filesize($path), 'mime' => $mime], 'headers' => wx_test_headers()];
        if ($delete) {
            @unlink($path);
        }
        return;
    }
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) filesize($path));
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('X-WX-Request-Id: ' . wx_request_id());
    header('Cache-Control: private, no-store');
    readfile($path);
    if ($delete) {
        @unlink($path);
    }
    exit;
}

/**
 * Send a page as the response body instead of JSON.
 *
 * The third and last exit, and it exists for the same reason as the file one: the client's progress page is
 * a document a person opens in a browser, not an API response, and a route must not `echo` it — the rule
 * that only this file writes output is what makes "a stray warning can never corrupt the response"
 * checkable. The handler decides *whether* the caller may see it (it holds the token); this decides how it
 * leaves.
 *
 * The headers are the client-link headers v2.1's quotation page set: not indexed, no referrer, no framing,
 * and no caching — a page about somebody's project should not sit in a shared cache, and a view that was
 * recorded should be the view that happened.
 */
function wx_send_html(array $spec): void
{
    $body = (string) ($spec['body'] ?? '');
    $status = (int) ($spec['status'] ?? 200);
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (defined('WX_RESPOND_CAPTURE')) {
        $GLOBALS['WX_RESPONSES'][] = ['status' => $status, 'html' => $body, 'headers' => wx_test_headers()];
        return;
    }
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header('Cache-Control: private, no-store, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('X-WX-Request-Id: ' . wx_request_id());
    http_response_code($status);
    echo $body;
    exit;
}

/** The headers a response would have sent, for the capture mode above and for tests. */
function wx_test_headers(): array
{
    return [
        'X-WX-Request-Id' => wx_request_id(),
        'Set-Cookie' => $GLOBALS['WX_TEST_SET_COOKIE'] ?? null,
    ];
}

/** Success envelope. $meta is merged under the standard fields. */
function wx_ok($data, array $meta = []): void
{
    wx_respond([
        'ok' => true,
        'data' => $data === null ? new stdClass() : $data,
        'meta' => array_merge(wx_base_meta(), $meta),
    ]);
}

function wx_base_meta(): array
{
    static $t0 = null;
    if ($t0 === null) {
        $t0 = microtime(true);
    }
    return [
        'requestId' => wx_request_id(),
        'took' => round((microtime(true) - $t0) * 1000, 1),
        'version' => WX_V2_VERSION,
    ];
}

/** Failure envelope, from an ApiError. */
function wx_fail(ApiError $e): void
{
    wx_respond($e->toEnvelope(wx_request_id(), (float) (wx_base_meta()['took'] ?? 0)), $e->status);
}

/**
 * Failure to whichever door the request came through. Kept here rather than in index.php so the
 * success and failure paths cannot disagree about which shape a legacy client expects.
 */
function wx_fail_request(ApiError $e): void
{
    if (wx_is_legacy_request()) {
        require_once WX_V2_DIR . '/routes/legacy.php';
        wx_legacy_fail($e);
    }
    wx_fail($e);
}

/** True when the request arrived through the v2.1 alias door (?action=…). */
function wx_is_legacy_request(): bool
{
    return wx_legacy_action() !== '';
}

/* ------------------------------------------------------------------ cookies */

/**
 * Cookies are HttpOnly + Secure + SameSite=Lax, path-scoped to the API and the SPA.
 * $secure is on unless the request is plainly local, so a developer on http://localhost can work.
 */
function wx_set_cookie(string $name, string $value, int $expires, bool $httpOnly = true): void
{
    $secure = wx_is_https();
    $opts = [
        'expires' => $expires,
        'path' => '/',
        'secure' => $secure,
        'httponly' => $httpOnly,
        'samesite' => 'Lax',
    ];
    // PHP 7.3+ array form; PHP 7.4 is the floor for this tree.
    if (defined('WX_RESPOND_CAPTURE')) {
        // Record what would have been sent, so a test can assert the flags. This is checked before
        // headers_sent(): a test runner prints its progress first, which counts as output under the CLI,
        // and capture mode sends no header anyway. Only tests/roundtrip.php and money-path.php define it.
        $GLOBALS['WX_TEST_SET_COOKIE'] = sprintf(
            '%s=%s; Expires=%s; Path=%s%s%s; SameSite=%s',
            $name,
            $value,
            gmdate('D, d M Y H:i:s', $expires) . ' GMT',
            $opts['path'],
            $opts['secure'] ? '; Secure' : '',
            $opts['httponly'] ? '; HttpOnly' : '',
            $opts['samesite']
        );
        $_COOKIE[$name] = $value;
        return;
    }
    if (headers_sent()) {
        return;
    }
    setcookie($name, $value, $opts);
    $_COOKIE[$name] = $value;
}

function wx_clear_cookie(string $name): void
{
    wx_set_cookie($name, '', time() - 3600);
    unset($_COOKIE[$name]);
}

function wx_cookie(string $name): string
{
    return (string) ($_COOKIE[$name] ?? '');
}

function wx_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
        return true;
    }
    // Plain http on a loopback host is a development session, not a production one.
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    return !preg_match('~^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$~', $host);
}


/* ============================================================ the one outward call

   Everything this API says to somebody else's server goes through `wx_http_call()`: the AI providers, the
   connector tests and (later) the mail transport. It lives here rather than in whichever slice needed it
   first, because a second cURL wrapper is how two of them drift — one grows the CA bundle, the other grows
   the timeout, and the difference is invisible until a host with no system certificate store fails one call
   and not the other.

   It throws `ApiError::upstream` for a transport failure and for an HTTP error, with a message that names
   the host and never the headers: the headers carry the key. What it deliberately does not do is decide
   anything — the request that was sent is built by the caller, where it can be tested without a network. */

/** The CA bundle's file name, looked for in the two places an installation may keep it. */
const WX_HTTP_CAFILE = 'cacert.pem';

/** Where the CA bundle is, if this installation has one. cURL needs it on a host whose PHP has no system store. */
function wx_http_cafile(): ?string
{
    $p = WX_V2_DIR . '/../' . WX_HTTP_CAFILE;
    $p = is_file($p) ? $p : WX_SITE_ROOT . '/api/' . WX_HTTP_CAFILE;
    return is_file($p) ? $p : null;
}

/**
 * One HTTP request — the API's only `curl_exec()`.
 *
 * @param array<int,string> $headers
 * @return array{code:int,json:array,raw:string}
 */
function wx_http_call(string $url, array $headers, ?array $body = null, int $timeout = 20, ?string $method = null, bool $throwOnStatus = true): array
{
    if (!function_exists('curl_init')) {
        throw ApiError::upstream('This server has no cURL extension, so the console cannot reach a provider');
    }
    $ch = curl_init($url);
    $opts = [
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => false,
    ];
    /* The two options the connectors need and no AI call does. A method, because GitHub takes a file through
       the contents API with a PUT; and the choice of whether a refused status is an exception or an answer,
       because a *test* action exists to report "the token was rejected" — the sentence that tells somebody
       what to fix — while a *call* action must not swallow it. One implementation either way. */
    if ($method !== null) {
        $opts[CURLOPT_CUSTOMREQUEST] = strtoupper($method);
    }
    $ca = wx_http_cafile();
    if ($ca !== null) {
        $opts[CURLOPT_CAINFO] = $ca;
    }
    if ($body !== null) {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        /* A message that names the host and the error, and never the headers — the headers carry the key. */
        $host = (string) (parse_url($url, PHP_URL_HOST) ?: $url);
        throw ApiError::upstream('Could not reach ' . $host . ': ' . mb_substr($err, 0, 200));
    }
    $json = json_decode((string) $raw, true);
    $json = is_array($json) ? $json : [];
    if ($code >= 400 && $throwOnStatus) {
        $said = (string) ($json['error']['message'] ?? $json['message'] ?? ('HTTP ' . $code));
        throw ApiError::upstream('The provider refused it: ' . mb_substr($said, 0, 240));
    }
    return ['code' => $code, 'json' => $json, 'raw' => (string) $raw];
}
