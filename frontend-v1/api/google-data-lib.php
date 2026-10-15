<?php
/**
 * P16 — Google Analytics 4 + Search Console data (free) via a Google Cloud SERVICE ACCOUNT.
 * No OAuth pop-ups: the owner uploads the service-account JSON key once and adds its e-mail as
 * Viewer in GA4 and as User in Search Console. Files: _private/google-sa.json (key + ids), _private/google-cache.json.
 * Actions: gdata_status, gdata_save, gdata_clear, gdata_report.
 */
const GSA_FILE   = PRIVATE_DIR . '/google-sa.json';
const GDATA_CACHE = PRIVATE_DIR . '/google-cache.json';

function gsa_cfg(): array { return array_merge(['key' => null, 'ga4' => '', 'gsc' => ''], jread(GSA_FILE)); }
function gsa_b64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

/** Exchange a signed JWT for a 1-hour access token (RS256 with openssl). */
function gsa_token(array $key): string {
    static $tok = null; if ($tok) return $tok;
    if (!function_exists('openssl_sign')) fail('The server has no OpenSSL extension (Settings → System check)', 500);
    $now = time();
    $head = gsa_b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claim = gsa_b64(json_encode(['iss' => $key['client_email'], 'scope' => 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
        'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600]));
    $sig = ''; if (!openssl_sign($head . '.' . $claim, $sig, (string)$key['private_key'], 'sha256WithRSAEncryption')) fail('The key file could not be used (private key invalid)');
    $r = gsa_http('https://oauth2.googleapis.com/token', ['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $head . '.' . $claim . '.' . gsa_b64($sig)], null, true);
    if (empty($r['access_token'])) fail('Google refused the key: ' . ($r['error_description'] ?? $r['error'] ?? 'unknown error'), 502);
    return $tok = (string)$r['access_token'];
}

/** Small HTTPS helper (uses the bundled CA list). */
function gsa_http(string $url, ?array $body, ?string $tok, bool $form = false): array {
    $ch = curl_init($url); $h = [];
    if ($tok) $h[] = 'Authorization: Bearer ' . $tok;
    $o = [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 8];
    if ($body !== null) { $o[CURLOPT_POST] = true; if ($form) $o[CURLOPT_POSTFIELDS] = http_build_query($body); else { $o[CURLOPT_POSTFIELDS] = json_encode($body); $h[] = 'Content-Type: application/json'; } }
    $o[CURLOPT_HTTPHEADER] = $h; curl_setopt_array($ch, $o);
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($raw === false) fail('Could not reach Google: ' . mb_substr($err, 0, 160), 502);
    $j = json_decode((string)$raw, true) ?: [];
    if ($code >= 400 && !$form) { $m = (string)($j['error']['message'] ?? "HTTP $code"); return ['_error' => $m, '_code' => $code]; }
    return $j;
}

function gdata_ga4(string $tok, string $pid, int $days): array {
    $u = 'https://analyticsdata.googleapis.com/v1beta/properties/' . rawurlencode($pid) . ':runReport';
    $range = [['startDate' => $days . 'daysAgo', 'endDate' => 'yesterday']];
    $daily = gsa_http($u, ['dateRanges' => $range, 'dimensions' => [['name' => 'date']], 'metrics' => [['name' => 'activeUsers'], ['name' => 'sessions'], ['name' => 'screenPageViews']], 'orderBys' => [['dimension' => ['dimensionName' => 'date']]]], $tok);
    if (isset($daily['_error'])) return ['error' => gdata_hint($daily['_error'], 'ga4')];
    $pages = gsa_http($u, ['dateRanges' => $range, 'dimensions' => [['name' => 'pagePath']], 'metrics' => [['name' => 'screenPageViews']], 'orderBys' => [['metric' => ['metricName' => 'screenPageViews'], 'desc' => true]], 'limit' => 8], $tok);
    $src = gsa_http($u, ['dateRanges' => $range, 'dimensions' => [['name' => 'sessionDefaultChannelGroup']], 'metrics' => [['name' => 'sessions']], 'orderBys' => [['metric' => ['metricName' => 'sessions'], 'desc' => true]], 'limit' => 6], $tok);
    $rows = fn($r) => array_map(fn($x) => ['k' => $x['dimensionValues'][0]['value'] ?? '', 'v' => array_map(fn($m) => (float)$m['value'], $x['metricValues'] ?? [])], $r['rows'] ?? []);
    $d = $rows($daily); $tot = [0, 0, 0]; foreach ($d as $x) foreach ($x['v'] as $i => $v) $tot[$i] += $v;
    return ['daily' => array_map(fn($x) => ['date' => substr($x['k'], 0, 4) . '-' . substr($x['k'], 4, 2) . '-' . substr($x['k'], 6, 2), 'users' => $x['v'][0], 'sessions' => $x['v'][1], 'views' => $x['v'][2]], $d),
        'totals' => ['users' => $tot[0], 'sessions' => $tot[1], 'views' => $tot[2]], 'pages' => array_map(fn($x) => ['path' => $x['k'], 'views' => $x['v'][0]], $rows($pages)),
        'sources' => array_map(fn($x) => ['name' => $x['k'], 'sessions' => $x['v'][0]], $rows($src))];
}

function gdata_gsc(string $tok, string $site, int $days): array {
    $u = 'https://www.googleapis.com/webmasters/v3/sites/' . rawurlencode($site) . '/searchAnalytics/query';
    $s = date('Y-m-d', strtotime('-' . ($days + 2) . ' days')); $e = date('Y-m-d', strtotime('-2 days')); // GSC data lags ~2 days
    $daily = gsa_http($u, ['startDate' => $s, 'endDate' => $e, 'dimensions' => ['date']], $tok);
    if (isset($daily['_error'])) return ['error' => gdata_hint($daily['_error'], 'gsc')];
    $q = gsa_http($u, ['startDate' => $s, 'endDate' => $e, 'dimensions' => ['query'], 'rowLimit' => 10], $tok);
    $tot = ['clicks' => 0, 'impressions' => 0, 'position' => 0]; $n = 0;
    $dl = array_map(function ($r) use (&$tot, &$n) { $tot['clicks'] += $r['clicks']; $tot['impressions'] += $r['impressions']; $tot['position'] += $r['position']; $n++; return ['date' => $r['keys'][0], 'clicks' => $r['clicks'], 'impressions' => $r['impressions']]; }, $daily['rows'] ?? []);
    $tot['ctr'] = $tot['impressions'] ? round($tot['clicks'] / $tot['impressions'] * 100, 1) : 0; $tot['position'] = $n ? round($tot['position'] / $n, 1) : 0;
    return ['daily' => $dl, 'totals' => $tot, 'queries' => array_map(fn($r) => ['q' => $r['keys'][0], 'clicks' => $r['clicks'], 'impressions' => $r['impressions'], 'position' => round($r['position'], 1)], $q['rows'] ?? [])];
}

function gdata_hint(string $m, string $which): string {
    $email = (string)(gsa_cfg()['key']['client_email'] ?? 'the service account');
    if (stripos($m, 'permission') !== false || stripos($m, 'not have') !== false || stripos($m, 'forbidden') !== false)
        return $which === 'ga4' ? "No access yet. In Google Analytics → Admin → Property access management, add $email as Viewer." : "No access yet. In Search Console → Settings → Users and permissions, add $email (Restricted is enough).";
    if (stripos($m, 'has not been used') !== false || stripos($m, 'disabled') !== false)
        return 'Turn on the ' . ($which === 'ga4' ? 'Google Analytics Data API' : 'Google Search Console API') . ' in Google Cloud → APIs & Services → Library (free).';
    return mb_substr($m, 0, 220);
}

function gdata_actions(string $action, array $in): bool {
    if (strpos($action, 'gdata_') !== 0) return false;
    switch ($action) {
        case 'gdata_status':
            need(['owner', 'admin', 'sales', 'editor']); $c = gsa_cfg(); $ca = jread(GDATA_CACHE);
            out(['ok' => true, 'connected' => !empty($c['key']['client_email']), 'email' => (string)($c['key']['client_email'] ?? ''), 'ga4' => $c['ga4'], 'gsc' => $c['gsc'], 'cachedAt' => $ca['at'] ?? null]);
        case 'gdata_save':
            $u = need(['owner', 'admin']); $c = gsa_cfg();
            if (!empty($in['keyJson'])) {
                $k = json_decode((string)$in['keyJson'], true);
                if (!is_array($k) || ($k['type'] ?? '') !== 'service_account' || empty($k['client_email']) || empty($k['private_key'])) fail('This is not a service-account key file (it must contain "type": "service_account")');
                $c['key'] = ['client_email' => $k['client_email'], 'private_key' => $k['private_key'], 'project_id' => $k['project_id'] ?? ''];
            }
            if (array_key_exists('ga4', $in)) { $g = preg_replace('~\D~', '', (string)$in['ga4']); $c['ga4'] = $g; }
            if (array_key_exists('gsc', $in)) { $s = trim((string)$in['gsc']); if ($s !== '' && !preg_match('~^(sc-domain:[a-z0-9.-]+|https?://[^\s]+/)$~i', $s)) fail('Search Console property: use sc-domain:woodex.com.pk or https://woodex.com.pk/ (with the ending /)'); $c['gsc'] = $s; }
            jwrite(GSA_FILE, $c); @unlink(GDATA_CACHE); log_act($u, 'google.data', 'saved');
            out(['ok' => true, 'connected' => !empty($c['key']['client_email']), 'email' => (string)($c['key']['client_email'] ?? ''), 'ga4' => $c['ga4'], 'gsc' => $c['gsc']]);
        case 'gdata_clear':
            $u = need(['owner', 'admin']); @unlink(GSA_FILE); @unlink(GDATA_CACHE); log_act($u, 'google.data', 'removed'); out(['ok' => true]);
        case 'gdata_report':
            need(['owner', 'admin', 'sales', 'editor']); $c = gsa_cfg(); if (empty($c['key']['client_email'])) out(['ok' => true, 'connected' => false]);
            $days = in_array((int)($in['days'] ?? 28), [7, 28, 90], true) ? (int)$in['days'] : 28;
            $ca = jread(GDATA_CACHE); if (empty($in['fresh']) && ($ca['days'] ?? 0) === $days && (time() - (int)($ca['ts'] ?? 0)) < 6 * 3600) out(['ok' => true, 'connected' => true, 'cached' => true] + $ca);
            if (!function_exists('curl_init')) fail('cURL missing', 500);
            $tok = gsa_token($c['key']);
            $res = ['days' => $days, 'ts' => time(), 'at' => date('c'),
                'ga4' => $c['ga4'] ? gdata_ga4($tok, $c['ga4'], $days) : ['error' => 'Add your GA4 Property ID (Analytics → Admin → Property details).'],
                'gsc' => $c['gsc'] ? gdata_gsc($tok, $c['gsc'], $days) : ['error' => 'Add your Search Console property (e.g. sc-domain:woodex.com.pk).']];
            jwrite(GDATA_CACHE, $res); out(['ok' => true, 'connected' => true, 'cached' => false] + $res);
    }
    return false;
}
