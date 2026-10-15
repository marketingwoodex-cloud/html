<?php
/**
 * Woodex Admin v2 — Phase A8: security (sessions, two-step sign-in, login alerts) + settings & integrations.
 * Included by api/admin.php. Mirrors tools/frontend-v1-admin.mjs (tokenFor / finishLogin / sec_* / a8) one-to-one.
 * Per-user security state lives in _private/security.json (no schema change needed on existing installs).
 */
declare(strict_types=1);
if (!defined('PRIVATE_DIR')) { http_response_code(404); exit; }

const SEC_FILE = PRIVATE_DIR . '/security.json';
const SET_FILE = PRIVATE_DIR . '/settings.json';
const GEN_DEF = ['siteName' => 'Woodex Interior', 'logo' => '/assets/img/img-f941b08b9510.png', 'favicon' => '/assets/img/favicon.svg', 'share' => '/assets/img/img-c7d3a3ebd62b.jpg'];
const TRK_DEF = ['ga4' => '', 'gtm' => '', 'pixel' => '', 'gsc' => ''];

function sec_all(): array { return jread(SEC_FILE); }
function sec_get_u(int $id): array { $a = sec_all(); return $a[(string)$id] ?? []; }
function sec_put_u(int $id, array $s): void { $fp = fopen(SEC_FILE . '.lock', 'c'); flock($fp, LOCK_EX); $a = sec_all(); $a[(string)$id] = $s; jwrite(SEC_FILE, $a); flock($fp, LOCK_UN); fclose($fp); }
function sec_sha(string $x): string { return hash('sha256', $x); }
function sec_new_session(array $u, int $exp): string {
    $s = sec_get_u((int)$u['id']); $sid = bin2hex(random_bytes(8));
    $list = array_values(array_filter($s['sessions'] ?? [], fn($x) => $x['exp'] > time())); $list = array_slice($list, -9);
    $list[] = ['sid' => $sid, 'exp' => $exp, 'ip' => ip(), 'ua' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200), 'created' => gmdate('Y-m-d H:i:s'), 'seen' => gmdate('Y-m-d H:i:s')];
    $s['sessions'] = $list; sec_put_u((int)$u['id'], $s); return $sid;
}
/** Returns true if the session still exists (not signed out remotely); refreshes "last active" at most once a minute. */
function sec_session_ok(int $uid, string $sid): bool {
    $s = sec_get_u($uid);
    foreach ($s['sessions'] ?? [] as $i => $x) if ($x['sid'] === $sid) {
        if (strtotime($x['seen'] . ' UTC') < time() - 60) { $s['sessions'][$i]['seen'] = gmdate('Y-m-d H:i:s'); sec_put_u($uid, $s); }
        return true;
    }
    return false;
}
// ---- TOTP (RFC 6238)
function b32_enc(string $bin): string { $A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT); $o = ''; foreach (str_split($bits, 5) as $ch) $o .= $A[bindec(str_pad($ch, 5, '0'))]; return $o; }
function b32_dec(string $s): string { $A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; foreach (str_split(preg_replace('~[^A-Z2-7]~', '', strtoupper($s))) as $c) $bits .= str_pad(decbin(strpos($A, $c)), 5, '0', STR_PAD_LEFT); $o = ''; foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $o .= chr(bindec($b)); return $o; }
function hotp(string $key, int $ctr): string { $h = hash_hmac('sha1', pack('J', $ctr), $key, true); $o = ord($h[19]) & 15; $v = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]); return str_pad((string)($v % 1000000), 6, '0', STR_PAD_LEFT); }
/** $s passed by reference to remember the last used time-step (a code can't be replayed). */
function totp_ok(string $secret, string $code, ?array &$s = null): bool {
    $code = preg_replace('~\s~', '', $code); if (!preg_match('~^\d{6}$~', $code)) return false; $key = b32_dec($secret); $t = intdiv(time(), 30);
    foreach ([-1, 0, 1] as $d) if (hash_equals(hotp($key, $t + $d), $code)) { if ($s !== null) { if (($s['totp_last'] ?? 0) >= $t + $d) return false; $s['totp_last'] = $t + $d; } return true; }
    return false;
}
function sec_codes(): array { $c = []; for ($i = 0; $i < 8; $i++) $c[] = bin2hex(random_bytes(4)); return $c; }
function sec_fmt_codes(array $c): array { return array_map(fn($x) => substr($x, 0, 4) . '-' . substr($x, 4), $c); }

/** Called after password (and two-step) succeeded. Sends a login alert for a new device. */
function sec_finish_login(array $u): void {
    q('UPDATE wx_users SET last_login=? WHERE id=?', [now(), $u['id']]); log_act($u, 'login');
    $s = sec_get_u((int)$u['id']); $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? ''); $dev = substr(sec_sha(ip() . '|' . preg_replace('~[\d.]+~', '', $ua)), 0, 16);
    $known = $s['known'] ?? [];
    if (!in_array($dev, $known, true)) {
        if ($known && ($s['alerts'] ?? true) !== false) {
            try { $c = crm_cfg(); if ($c['smtpHost'] !== '') smtp_send($c, [$u['email']], 'New sign-in to Woodex Admin', "Hello {$u['name']},\n\nYour Woodex Admin account was just signed in to from a new device.\n\nTime: " . gmdate('Y-m-d H:i') . " UTC\nIP address: " . ip() . "\nDevice: " . substr($ua, 0, 160) . "\n\nIf this was you, ignore this email. If not, sign in, change your password and use Security → \"Sign out all other devices\"."); } catch (Throwable $e) { error_log('login alert: ' . $e->getMessage()); }
        }
        $known[] = $dev; $s['known'] = array_slice($known, -20); sec_put_u((int)$u['id'], $s);
    }
    out(['ok' => true, 'token' => token_for($u), 'builderToken' => in_array($u['role'], ['owner', 'admin', 'editor'], true) ? builder_token((int)$u['id']) : null, 'user' => pub($u)]);
}
function sec_login_after_password(array $u): void {
    $s = sec_get_u((int)$u['id']);
    if (!empty($s['totp_on'])) { $exp = time() + 300; out(['ok' => true, 'need2fa' => true, 'ticket' => $u['id'] . '.' . $exp . '.' . hash_hmac('sha256', '2fa|' . $u['id'] . '|' . $exp . '|' . $u['pw_ver'], bsecret())]); }
    sec_finish_login($u);
}

function security_actions(string $action, array $in): bool {
    if (!preg_match('~^(sec_|set_|login_2fa$)~', $action)) return false;
    $OA = ['owner', 'admin'];
    switch ($action) {
        case 'login_2fa':
            throttle();
            if (!preg_match('~^(\d+)\.(\d{10})\.([a-f0-9]{64})$~', (string)($in['ticket'] ?? ''), $m) || (int)$m[2] < time()) fail('Sign-in expired, enter your password again', 401);
            $u = q('SELECT * FROM wx_users WHERE id=? AND active=1', [(int)$m[1]])->fetch();
            if (!$u || !hash_equals(hash_hmac('sha256', '2fa|' . $u['id'] . '|' . $m[2] . '|' . $u['pw_ver'], bsecret()), $m[3])) fail('Sign-in expired, enter your password again', 401);
            $s = sec_get_u((int)$u['id']); $code = trim((string)($in['code'] ?? '')); $ok = !empty($s['totp']) && totp_ok($s['totp'], $code, $s); $used = false;
            if (!$ok && preg_match('~^[a-z0-9]{4}-?[a-z0-9]{4}$~i', $code)) { $h = sec_sha(strtolower(str_replace('-', '', $code))); $i = array_search($h, $s['recovery'] ?? [], true); if ($i !== false) { array_splice($s['recovery'], (int)$i, 1); $ok = $used = true; } }
            if (!$ok) { throttle(true); usleep(400000); fail('That code is not right. Check the time on your phone', 401); }
            sec_put_u((int)$u['id'], $s); if ($used) log_act($u, '2fa.recovery_used', count($s['recovery']) . ' left');
            sec_finish_login($u);
        case 'sec_get':
            $u = need(); $s = sec_get_u((int)$u['id']); $cur = $GLOBALS['WX_SID'] ?? '';
            $sess = array_reverse(array_values(array_map(fn($x) => ['sid' => $x['sid'], 'ip' => $x['ip'], 'ua' => $x['ua'], 'created' => $x['created'], 'seen' => $x['seen'], 'current' => $x['sid'] === $cur], array_filter($s['sessions'] ?? [], fn($x) => $x['exp'] > time()))));
            $logins = q("SELECT action, ip, created_at FROM wx_activity WHERE user_id=? AND (action='login' OR action LIKE '2fa.%') ORDER BY id DESC LIMIT 10", [$u['id']])->fetchAll();
            $team = null;
            if (in_array($u['role'], $OA, true)) { $all = sec_all(); $team = array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'role' => $x['role'], 'totp' => !empty($all[(string)$x['id']]['totp_on']), 'sessions' => count(array_filter($all[(string)$x['id']]['sessions'] ?? [], fn($y) => $y['exp'] > time()))], q('SELECT id,name,role FROM wx_users ORDER BY id')->fetchAll()); }
            out(['ok' => true, 'totp' => !empty($s['totp_on']), 'recoveryLeft' => count($s['recovery'] ?? []), 'alerts' => ($s['alerts'] ?? true) !== false, 'sessions' => $sess, 'logins' => $logins, 'team' => $team]);
        case 'sec_2fa_begin':
            $u = need(); $s = sec_get_u((int)$u['id']); $s['totp_pending'] = b32_enc(random_bytes(20)); sec_put_u((int)$u['id'], $s);
            out(['ok' => true, 'secret' => $s['totp_pending'], 'uri' => 'otpauth://totp/' . rawurlencode('Woodex Admin:' . $u['email']) . '?secret=' . $s['totp_pending'] . '&issuer=' . rawurlencode('Woodex Admin')]);
        case 'sec_2fa_enable':
            $u = need(); $s = sec_get_u((int)$u['id']); if (empty($s['totp_pending'])) fail('Start the setup again');
            if (!totp_ok($s['totp_pending'], (string)($in['code'] ?? ''))) fail("That code is not right. Scan again or check your phone's time");
            $s['totp'] = $s['totp_pending']; unset($s['totp_pending']); $s['totp_on'] = true; $codes = sec_codes(); $s['recovery'] = array_map('sec_sha', $codes);
            sec_put_u((int)$u['id'], $s); log_act($u, '2fa.enable'); out(['ok' => true, 'codes' => sec_fmt_codes($codes)]);
        case 'sec_2fa_disable':
        case 'sec_recovery_new':
            $u = need(); if (!password_verify((string)($in['password'] ?? ''), $u['pass_hash'])) fail('Password is wrong', 401); $s = sec_get_u((int)$u['id']);
            if ($action === 'sec_2fa_disable') { $s['totp_on'] = false; unset($s['totp']); $s['recovery'] = []; sec_put_u((int)$u['id'], $s); log_act($u, '2fa.disable'); out(['ok' => true]); }
            if (empty($s['totp_on'])) fail('Two-factor is not on'); $codes = sec_codes(); $s['recovery'] = array_map('sec_sha', $codes); sec_put_u((int)$u['id'], $s); log_act($u, '2fa.recovery_new'); out(['ok' => true, 'codes' => sec_fmt_codes($codes)]);
        case 'sec_2fa_reset':
            $me = need($OA); $t = q('SELECT * FROM wx_users WHERE id=?', [(int)($in['user_id'] ?? 0)])->fetch(); if (!$t) fail('User not found', 404);
            if ($t['role'] === 'owner' && $me['role'] !== 'owner') fail('Only the owner can do this', 403);
            $s = sec_get_u((int)$t['id']); $s['totp_on'] = false; unset($s['totp']); $s['recovery'] = []; $s['sessions'] = []; sec_put_u((int)$t['id'], $s); log_act($me, '2fa.reset', $t['email']); out(['ok' => true]);
        case 'sec_revoke':
            $u = need(); $cur = $GLOBALS['WX_SID'] ?? '';
            if (!empty($in['user_id']) && (int)$in['user_id'] !== (int)$u['id']) {
                if (!in_array($u['role'], $OA, true)) fail('No permission', 403); $t = q('SELECT * FROM wx_users WHERE id=?', [(int)$in['user_id']])->fetch(); if (!$t) fail('User not found', 404);
                if ($t['role'] === 'owner' && $u['role'] !== 'owner') fail('Only the owner can do this', 403);
                $s = sec_get_u((int)$t['id']); $s['sessions'] = []; sec_put_u((int)$t['id'], $s); log_act($u, 'session.revoke_all', $t['email']); out(['ok' => true]);
            }
            $s = sec_get_u((int)$u['id']); $sid = (string)($in['sid'] ?? '');
            $s['sessions'] = array_values(array_filter($s['sessions'] ?? [], fn($x) => !empty($in['others']) ? $x['sid'] === $cur : ($x['sid'] !== $sid || $x['sid'] === $cur)));
            sec_put_u((int)$u['id'], $s); log_act($u, 'session.revoke', !empty($in['others']) ? 'all other devices' : 'one device'); out(['ok' => true]);
        case 'sec_alerts':
            $u = need(); $s = sec_get_u((int)$u['id']); $s['alerts'] = !empty($in['on']); sec_put_u((int)$u['id'], $s); out(['ok' => true, 'alerts' => $s['alerts']]);

        // ------------------------------------------------ settings
        case 'set_get':
            need($OA); $x = set_load(); $c = crm_cfg(); $ai = cms_load()['ai']; $h = jread(PRIVATE_DIR . '/health.json');
            $du = 0; foreach (a7_walk(ROOT_DIR, '~.~') as $f) $du += filesize($f);
            out(['ok' => true] + $x + ['mail' => ['emailOn' => $c['emailOn'], 'emailTo' => $c['emailTo'], 'smtpHost' => $c['smtpHost'], 'smtpPort' => $c['smtpPort'], 'smtpUser' => $c['smtpUser'], 'smtpFrom' => $c['smtpFrom'], 'smtpPassSet' => $c['smtpPass'] !== ''],
                'turnstile' => ['tsSite' => $c['tsSite'], 'tsSecretSet' => $c['tsSecret'] !== ''], 'ai' => ['provider' => $ai['provider'], 'ready' => $ai[$ai['provider'] . 'Key'] !== ''], 'psi' => !empty($h['psiKey']),
                'system' => ['server' => 'PHP ' . PHP_VERSION, 'zip' => class_exists('ZipArchive'), 'curl' => function_exists('curl_init'), 'openssl' => extension_loaded('openssl'), 'cron' => $h['lastCron'] ?? null, 'disk' => round($du / 1048576, 1) . ' MB']]);
        case 'set_general_save':
            $u = need($OA); $g = is_array($in['general'] ?? null) ? $in['general'] : []; $x = jread(SET_FILE); $o = [];
            $o['siteName'] = clip($g['siteName'] ?? '', 80) ?: GEN_DEF['siteName']; if (preg_match('~[<>"]~', $o['siteName'])) fail('Site name cannot contain < > or quotes');
            foreach (['logo', 'favicon', 'share'] as $k) { $o[$k] = clip($g[$k] ?? '', 200) ?: GEN_DEF[$k]; if (!preg_match('~^/assets/(img|uploads)/[a-z0-9/_.-]+\.(png|jpe?g|webp|svg|gif|ico)$~i', $o[$k]) || strpos($o[$k], '..') !== false) fail('Pick the ' . $k . ' from the media library'); }
            $x['general'] = $o; if (!empty($in['applied'])) $x['generalApplied'] = $o; jwrite(SET_FILE, $x); log_act($u, !empty($in['applied']) ? 'settings.general_apply' : 'settings.general');
            out(['ok' => true] + set_load());
        case 'set_tracking_save':
            $u = need($OA); $t = is_array($in['tracking'] ?? null) ? $in['tracking'] : []; $x = jread(SET_FILE);
            $o = ['ga4' => strtoupper(clip($t['ga4'] ?? '', 20)), 'gtm' => strtoupper(clip($t['gtm'] ?? '', 20)), 'pixel' => preg_replace('~\D~', '', clip($t['pixel'] ?? '', 20)), 'gsc' => preg_replace('~^.*content="([^"]+)".*$~', '$1', clip($t['gsc'] ?? '', 120))];
            if ($o['ga4'] && !preg_match('~^G-[A-Z0-9]{4,15}$~', $o['ga4'])) fail('GA4 measurement ID looks like G-XXXXXXXXXX');
            if ($o['gtm'] && !preg_match('~^GTM-[A-Z0-9]{4,12}$~', $o['gtm'])) fail('Tag Manager ID looks like GTM-XXXXXXX');
            if ($o['pixel'] && !preg_match('~^\d{8,20}$~', $o['pixel'])) fail('Meta Pixel ID is a number (8-20 digits)');
            if ($o['gsc'] && !preg_match('~^[A-Za-z0-9_-]{10,100}$~', $o['gsc'])) fail('Search Console code: paste the content value of the meta tag');
            $x['tracking'] = $o; if (!empty($in['applied'])) $x['trackingApplied'] = $o + ['at' => gmdate('Y-m-d H:i:s')]; jwrite(SET_FILE, $x); log_act($u, !empty($in['applied']) ? 'settings.tracking_apply' : 'settings.tracking');
            out(['ok' => true] + set_load());
        case 'set_ts_test':
            need($OA); $c = crm_cfg(); if ($c['tsSite'] === '' || $c['tsSecret'] === '') fail('Add both Turnstile keys first');
            $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify'); curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['secret' => $c['tsSecret'], 'response' => 'wx-test']), CURLOPT_TIMEOUT => 8]);
            $raw = curl_exec($ch); $err = curl_error($ch); curl_close($ch); if ($raw === false) fail('Could not reach Cloudflare: ' . $err);
            $j = json_decode((string)$raw, true) ?: []; if (in_array('invalid-input-secret', $j['error-codes'] ?? [], true)) fail('Cloudflare says the secret key is wrong');
            out(['ok' => true, 'result' => 'Secret key accepted by Cloudflare']);
    }
    return false;
}
function set_load(): array { $x = jread(SET_FILE); return ['general' => array_merge(GEN_DEF, $x['general'] ?? []), 'generalApplied' => array_merge(GEN_DEF, $x['generalApplied'] ?? []), 'tracking' => array_merge(TRK_DEF, $x['tracking'] ?? []), 'trackingApplied' => $x['trackingApplied'] ?? null]; }
