<?php
/**
 * Phase 8 — Google sign-in (existing Admin users only), AI Agent (MCP) tokens, WhatsApp click stats.
 * Required by admin.php. Files: _private/google.json {clientId}, _private/mcp.json {tokens[], log[]}, _private/wa-stats.json.
 */
const GOOGLE_FILE = PRIVATE_DIR . '/google.json';
const MCP_FILE    = PRIVATE_DIR . '/mcp.json';
const WA_FILE     = PRIVATE_DIR . '/wa-stats.json';

function g_client_id(): string { return trim((string)(jread(GOOGLE_FILE)['clientId'] ?? '')); }
/** Verify a Google ID token (Google Identity Services "credential") with Google's tokeninfo endpoint. */
function g_verify(string $cred): array {
    $cid = g_client_id(); if ($cid === '') fail('Google sign-in is not set up yet');
    if (!preg_match('~^[\w-]+\.[\w-]+\.[\w-]+$~', $cred)) fail('Invalid Google response');
    $ctx = stream_context_create(['ssl' => ['cafile' => __DIR__ . '/cacert.pem', 'verify_peer' => true], 'http' => ['timeout' => 10, 'ignore_errors' => true]]);
    $r = @file_get_contents('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($cred), false, $ctx);
    $t = $r ? (json_decode($r, true) ?: []) : [];
    if (empty($t['sub']) || ($t['aud'] ?? '') !== $cid || !in_array($t['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true) || (int)($t['exp'] ?? 0) < time()) fail('Google sign-in could not be verified', 401);
    if (($t['email_verified'] ?? '') !== 'true' && ($t['email_verified'] ?? null) !== true) fail('Your Google email is not verified', 401);
    return ['sub' => (string)$t['sub'], 'email' => strtolower((string)($t['email'] ?? ''))];
}

function mcp_load(): array { $m = jread(MCP_FILE); $m['tokens'] = $m['tokens'] ?? []; $m['log'] = $m['log'] ?? []; return $m; }
function mcp_pub(array $t): array { return ['id' => $t['id'], 'name' => $t['name'], 'user' => $t['user_name'] ?? '', 'hint' => $t['hint'], 'created_at' => $t['created_at'], 'last_used' => $t['last_used'] ?? null, 'uses' => (int)($t['uses'] ?? 0), 'off' => !empty($t['off'])]; }

function p8_actions(string $action, array $in): bool {
    if (!preg_match('~^(google_|mcp_|wa_stats$)~', $action)) return false;
    $OA = ['owner', 'admin'];
    switch ($action) {
        case 'google_cfg': // public: login screen shows the Google button only when a client ID is saved
            out(['ok' => true, 'clientId' => g_client_id()]);

        case 'google_login':
            throttle(); $g = g_verify((string)($in['credential'] ?? ''));
            $uid = 0; foreach (sec_all() as $id => $s) if (($s['google_sub'] ?? '') === $g['sub']) { $uid = (int)$id; break; }
            $u = $uid ? q('SELECT * FROM wx_users WHERE id=?', [$uid])->fetch() : null;
            if (!$u && $g['email'] !== '') $u = q('SELECT * FROM wx_users WHERE email=?', [$g['email']])->fetch();
            if (!$u || !$u['active']) { throttle(true); log_act(null, 'login.google_denied', $g['email']); fail('This Google account is not an Admin user. Ask the owner to add ' . ($g['email'] ?: 'your email') . ' in Users.', 403); }
            $s = sec_get_u((int)$u['id']); if (empty($s['google_sub'])) { $s['google_sub'] = $g['sub']; $s['google_email'] = $g['email']; sec_put_u((int)$u['id'], $s); }
            sec_login_after_password($u); // two-step verification still applies

        case 'google_me':
            $u = need(); $s = sec_get_u((int)$u['id']); out(['ok' => true, 'clientId' => g_client_id(), 'linked' => !empty($s['google_sub']), 'email' => $s['google_email'] ?? '']);
        case 'google_link':
            $u = need(); $g = g_verify((string)($in['credential'] ?? ''));
            foreach (sec_all() as $id => $s) if ((int)$id !== (int)$u['id'] && ($s['google_sub'] ?? '') === $g['sub']) fail('That Google account is linked to another user');
            $s = sec_get_u((int)$u['id']); $s['google_sub'] = $g['sub']; $s['google_email'] = $g['email']; sec_put_u((int)$u['id'], $s);
            log_act($u, 'google.link', $g['email']); out(['ok' => true, 'linked' => true, 'email' => $g['email']]);
        case 'google_unlink':
            $u = need(); $s = sec_get_u((int)$u['id']); unset($s['google_sub'], $s['google_email']); sec_put_u((int)$u['id'], $s);
            log_act($u, 'google.unlink'); out(['ok' => true, 'linked' => false]);
        case 'google_save':
            $u = need(['owner']); $cid = trim((string)($in['clientId'] ?? ''));
            if ($cid !== '' && !preg_match('~^[\w-]+\.apps\.googleusercontent\.com$~', $cid)) fail('The client ID should end with .apps.googleusercontent.com');
            jwrite(GOOGLE_FILE, ['clientId' => $cid]); log_act($u, 'google.settings', $cid ? 'on' : 'off'); out(['ok' => true, 'clientId' => $cid]);

        case 'mcp_tokens':
            need($OA); $m = mcp_load(); out(['ok' => true, 'tokens' => array_map('mcp_pub', array_reverse($m['tokens']))]);
        case 'mcp_token_new':
            $u = need($OA); $name = clip($in['name'] ?? '', 60) ?: 'AI agent'; $m = mcp_load();
            if (count($m['tokens']) >= 20) fail('Maximum 20 tokens. Revoke an old one first.');
            $raw = 'wxmcp_' . bin2hex(random_bytes(24));
            $m['tokens'][] = ['id' => bin2hex(random_bytes(6)), 'name' => $name, 'hash' => hash('sha256', $raw), 'hint' => substr($raw, -4), 'user_id' => (int)$u['id'], 'user_name' => $u['name'], 'created_at' => now(), 'last_used' => null, 'uses' => 0];
            jwrite(MCP_FILE, $m); log_act($u, 'mcp.token_new', $name);
            out(['ok' => true, 'token' => $raw, 'tokens' => array_map('mcp_pub', array_reverse($m['tokens']))]);
        case 'mcp_token_revoke':
            $u = need($OA); $m = mcp_load(); $id = (string)($in['id'] ?? ''); $n = count($m['tokens']);
            $m['tokens'] = array_values(array_filter($m['tokens'], fn($t) => $t['id'] !== $id)); if (count($m['tokens']) === $n) fail('Token not found', 404);
            jwrite(MCP_FILE, $m); log_act($u, 'mcp.token_revoke', $id); out(['ok' => true, 'tokens' => array_map('mcp_pub', array_reverse($m['tokens']))]);
        case 'mcp_token_toggle': // P18 I: switch a token off/on without deleting it
            $u = need($OA); $m = mcp_load(); $id = (string)($in['id'] ?? ''); $f = false;
            foreach ($m['tokens'] as &$t) if ($t['id'] === $id) { $t['off'] = empty($in['on']); $f = true; } unset($t);
            if (!$f) fail('Token not found', 404);
            jwrite(MCP_FILE, $m); log_act($u, empty($in['on']) ? 'mcp.token_off' : 'mcp.token_on', $id); out(['ok' => true, 'tokens' => array_map('mcp_pub', array_reverse($m['tokens']))]);
        case 'mcp_token_regen': // P18 I: new secret, same name and settings; the old secret stops working at once
            $u = need($OA); $m = mcp_load(); $id = (string)($in['id'] ?? ''); $raw = null;
            foreach ($m['tokens'] as &$t) if ($t['id'] === $id) { $raw = 'wxmcp_' . bin2hex(random_bytes(24)); $t['hash'] = hash('sha256', $raw); $t['hint'] = substr($raw, -4); $t['regen_at'] = now(); } unset($t);
            if (!$raw) fail('Token not found', 404);
            jwrite(MCP_FILE, $m); log_act($u, 'mcp.token_regen', $id); out(['ok' => true, 'token' => $raw, 'tokens' => array_map('mcp_pub', array_reverse($m['tokens']))]);
        case 'mcp_log':
            need($OA); out(['ok' => true, 'log' => array_reverse(array_slice(mcp_load()['log'], -100))]);

        case 'wa_stats':
            need(); $w = jread(WA_FILE); $days = $w['days'] ?? []; ksort($days);
            $sum = fn(int $n) => array_sum(array_filter($days, fn($k) => $k >= date('Y-m-d', strtotime("-" . ($n - 1) . " days")), ARRAY_FILTER_USE_KEY));
            $pages = $w['pages'] ?? []; arsort($pages); $svc = $w['services'] ?? []; arsort($svc);
            crm_migrate(); $leads30 = (int)q("SELECT COUNT(*) FROM wx_leads WHERE source='whatsapp' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchColumn();
            out(['ok' => true, 'today' => (int)($days[date('Y-m-d')] ?? 0), 'd7' => $sum(7), 'd30' => $sum(30), 'leads30' => $leads30, 'days' => array_slice($days, -30, null, true), 'pages' => array_slice($pages, 0, 10, true), 'services' => array_slice($svc, 0, 10, true)]);
    }
    return false;
}
