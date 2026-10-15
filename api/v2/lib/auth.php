<?php
/**
 * api/v2/lib/auth.php — cookie sessions, CSRF, 2FA, lockout.
 *
 * Master plan §6.3. The v2.1 model kept an HMAC token in sessionStorage and sent it as X-WX-ADM,
 * so any XSS — of which the audit found several vectors — handed over the whole account. v2.5 keeps
 * the token model's statelessness where it is useful (the signature still binds user + password
 * version) but moves the credential somewhere script cannot read:
 *
 *   · the browser holds an opaque session id in an HttpOnly · Secure · SameSite=Lax cookie;
 *   · the server stores only sha256(sid), so a database leak does not yield live sessions;
 *   · every state change needs X-WX-CSRF, a token bound to the session row and returned by
 *     /auth/login and /me — never readable by another origin;
 *   · the application secret lives in MySQL with a checksum, so an empty read can no longer
 *     silently regenerate it and invalidate every session (a v2.1 High finding).
 *
 * 2FA is preserved: the RFC 6238 implementation is a direct port of security-lib.php, which was
 * already correct, including the replay guard on the last used time-step.
 */

declare(strict_types=1);

/* ------------------------------------------------------------------ app secret */

/**
 * The signing secret. Stored in MySQL with a checksum so corruption is detectable.
 * A creation or a checksum mismatch is a Critical event: it means sessions are about to be
 * invalidated (or worse), and it is exactly the failure v2.1 hid behind `if (empty($c['secret']))`.
 */
function wx_secret(): string
{
    static $secret = null;
    if ($secret !== null) {
        return $secret;
    }
    if (!wx_table_exists('wx_secrets')) {
        throw ApiError::internal('The database is not migrated yet (wx_secrets missing) — see db/migrations');
    }
    $row = wx_one('SELECT v, checksum FROM wx_secrets WHERE k = ?', ['app']);
    if ($row === null) {
        $secret = bin2hex(random_bytes(32));
        wx_insert('wx_secrets', [
            'k' => 'app',
            'v' => $secret,
            'checksum' => hash('sha256', $secret),
            'created_at' => wx_now(),
            'rotated_at' => wx_now(),
        ]);
        wx_audit(null, 'security.secret_created', 'wx_secrets:app', ['reason' => 'first use']);
        return $secret;
    }
    $stored = (string) $row['v'];
    if (!hash_equals((string) $row['checksum'], hash('sha256', $stored))) {
        // Detectable corruption. Regenerate *and* say so loudly: every session dies here.
        $secret = bin2hex(random_bytes(32));
        wx_update('wx_secrets', ['v' => $secret, 'checksum' => hash('sha256', $secret), 'rotated_at' => wx_now()], ['k' => 'app']);
        wx_audit(null, 'security.secret_checksum_mismatch', 'wx_secrets:app', ['action' => 'regenerated; all sessions invalidated']);
        error_log('[wx-v2] app secret checksum mismatch — regenerated');
        return $secret;
    }
    $secret = $stored;
    return $secret;
}

/** Sign a value with the app secret. */
function wx_sign(string $purpose, string $value): string
{
    return hash_hmac('sha256', $purpose . '|' . $value, wx_secret());
}

/* ------------------------------------------------------------------ sessions */

/** True when the session tables are present, i.e. the platform migration has been applied. */
function wx_sessions_ready(): bool
{
    return wx_table_exists('wx_sessions');
}

/**
 * Create a session for a user and return [sid, csrf]. The caller sets the cookie and returns the
 * csrf token to the client exactly once per session.
 */
function wx_session_create(array $user): array
{
    $sid = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    wx_insert('wx_sessions', [
        'id' => hash('sha256', $sid),
        'user_id' => (int) $user['id'],
        'pw_ver' => (int) $user['pw_ver'],
        'csrf_hash' => hash('sha256', $csrf),
        'ip' => wx_ip(),
        'ua' => wx_ua(),
        'created_at' => wx_now(),
        'seen_at' => wx_now(),
        'expires_at' => date('Y-m-d H:i:s', time() + WX_SESSION_TTL),
    ]);
    return [$sid, $csrf];
}

/** Attach the session cookie. Domain-free, path-wide, HttpOnly, SameSite=Lax. */
function wx_session_set_cookie(string $sid): void
{
    wx_set_cookie(WX_SESSION_COOKIE, $sid, time() + WX_SESSION_TTL);
}

/**
 * Resolve the current user from the cookie, or null. Also prunes this user's expired rows when it
 * happens to run — cheap housekeeping that keeps the table from growing forever on a shared host
 * with no cron.
 */
/**
 * The Master. v2.1 calls this role `owner`, and the approval feature is built entirely around it:
 * the owner acts, everyone else proposes. Kept as a named check so "who may do this" has one answer.
 */
function wx_is_master(array $u): bool
{
    return (string) ($u['role'] ?? '') === 'owner';
}

function wx_current_user(): ?array
{
    /* Cached per request with wx_once(), not in a function static. tests/roundtrip.php and money-path.php run
       many requests in one process; a static kept the first request's answer and skipped setting WX_SESSION,
       so every later write failed its CSRF check with a valid token. A request is a process in production,
       so nothing changes there. */
    return wx_once('current_user', static function (): ?array {
        $sid = wx_cookie(WX_SESSION_COOKIE);
        if ($sid === '' || !preg_match('~^[a-f0-9]{64}$~', $sid) || !wx_sessions_ready()) {
            return null;
        }
        $row = wx_one(
            'SELECT * FROM wx_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1',
            [hash('sha256', $sid), wx_now()]
        );
        if ($row === null) {
            return null;
        }
        $u = wx_one('SELECT * FROM wx_users WHERE id = ? AND active = 1', [(int) $row['user_id']]);
        if ($u === null) {
            return null;
        }
        // A password change bumps pw_ver, which must end every session minted under the old one.
        if ((int) $u['pw_ver'] !== (int) $row['pw_ver']) {
            wx_audit(null, 'session.stale_credential', 'user:' . $u['id']);
            return null;
        }
        if (wx_demo_expired((string) $u['email'])) {
            return null;
        }

        // Touch "last seen" at most once a minute, so a polling UI does not write on every request.
        if (strtotime((string) $row['seen_at'] . ' UTC') < time() - 60) {
            wx_q('UPDATE wx_sessions SET seen_at = ? WHERE id = ?', [gmdate('Y-m-d H:i:s'), (string) $row['id']]);
        }
        $GLOBALS['WX_SESSION'] = $row;
        return $u;
    });
}

/** The session row for the current request, if any. */
function wx_session_row(): ?array
{
    return $GLOBALS['WX_SESSION'] ?? null;
}

/**
 * Require a signed-in user. $action is checked against the capability matrix when given.
 * This is the v2 equivalent of v2.1's need() — same idea, database-backed rules, coded errors.
 */
function wx_require_user(?string $action = null, array $legacyRoles = []): array
{
    $u = wx_current_user();
    if ($u === null) {
        throw ApiError::auth();
    }
    if (!wx_csrf_ok_for_method()) {
        throw new ApiError('FORBIDDEN', 'The security token is missing or stale — reload the page', 403, 'X-WX-CSRF');
    }
    if ($action !== null && !wx_can($u, $action, $legacyRoles)) {
        $label = WX_ROLE_LABELS[$u['role']] ?? (string) $u['role'];
        wx_audit($u, 'auth.denied', $action, ['role' => $u['role']]);
        throw ApiError::forbidden('Your role (' . $label . ') does not have permission for this');
    }
    return $u;
}

/**
 * CSRF for unsafe methods. A GET/HEAD/OPTIONS needs no token — it must not change anything, and
 * requiring one would break every read after a reload.
 */
function wx_csrf_ok_for_method(): bool
{
    $m = wx_method();
    if ($m === 'GET' || $m === 'HEAD' || $m === 'OPTIONS') {
        return true;
    }
    return wx_csrf_ok();
}

function wx_csrf_ok(): bool
{
    $sent = (string) ($_SERVER['HTTP_X_WX_CSRF'] ?? '');
    if ($sent === '' && isset($_POST['_csrf'])) {
        $sent = (string) $_POST['_csrf']; // a plain HTML form fallback
    }
    if ($sent === '' || !preg_match('~^[a-f0-9]{64}$~', $sent)) {
        return false;
    }
    $row = wx_session_row();
    if ($row === null) {
        return false;
    }
    return hash_equals((string) $row['csrf_hash'], hash('sha256', $sent));
}

/** The CSRF token is not recoverable from the row, so /me rotates it and returns the new value. */
function wx_csrf_rotate(): string
{
    $row = wx_session_row();
    if ($row === null) {
        throw ApiError::auth();
    }
    $csrf = bin2hex(random_bytes(32));
    wx_q('UPDATE wx_sessions SET csrf_hash = ? WHERE id = ?', [hash('sha256', $csrf), (string) $row['id']]);
    return $csrf;
}

function wx_session_revoke(?string $sid = null): void
{
    $hash = $sid !== null ? hash('sha256', $sid) : (string) (wx_session_row()['id'] ?? '');
    if ($hash === '') {
        return;
    }
    wx_q('UPDATE wx_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [wx_now(), $hash]);
}

/* ------------------------------------------------------------------ login */

/** Demo accounts (@demo.woodex.pk) stop working after the date in _private/demo.json. Ported from v2.1. */
function wx_demo_expired(string $email): bool
{
    if (substr(strtolower($email), -15) !== '@demo.woodex.pk') {
        return false;
    }
    $d = wx_store('demo.json', true)->tryRead();
    return empty($d['until']) || (int) $d['until'] < time();
}

/**
 * Per-account lockout, which v2.1 lacked: it throttled by IP only, so a distributed attempt against
 * one known email was unlimited. Returns the seconds to wait, or 0 when clear.
 */
function wx_login_locked(string $email): int
{
    if (!wx_table_exists('wx_login_attempts')) {
        return 0;
    }
    $key = hash('sha256', strtolower($email));
    $row = wx_one('SELECT * FROM wx_login_attempts WHERE email_hash = ?', [$key]);
    if ($row === null || empty($row['locked_until'])) {
        return 0;
    }
    $left = strtotime((string) $row['locked_until'] . ' UTC') - time();
    return $left > 0 ? $left : 0;
}

/** Record a failed attempt; lock for 15 minutes after 8 failures inside 15 minutes. */
function wx_login_fail(string $email): void
{
    if (!wx_table_exists('wx_login_attempts')) {
        return;
    }
    $key = hash('sha256', strtolower($email));
    $row = wx_one('SELECT * FROM wx_login_attempts WHERE email_hash = ?', [$key]);
    $now = time();
    if ($row === null || ($now - strtotime((string) $row['first_at'] . ' UTC')) > 900) {
        wx_q('REPLACE INTO wx_login_attempts (email_hash, n, first_at, last_at, locked_until) VALUES (?,?,?,?,NULL)', [
            $key, 1, gmdate('Y-m-d H:i:s', $now), gmdate('Y-m-d H:i:s', $now),
        ]);
        return;
    }
    $n = (int) $row['n'] + 1;
    $lockedUntil = $n >= 8 ? gmdate('Y-m-d H:i:s', $now + 900) : null;
    wx_q('UPDATE wx_login_attempts SET n = ?, last_at = ?, locked_until = ? WHERE email_hash = ?', [
        $n, gmdate('Y-m-d H:i:s', $now), $lockedUntil, $key,
    ]);
    if ($lockedUntil !== null) {
        wx_audit(null, 'security.login_lockout', 'email:' . substr($key, 0, 12), ['attempts' => $n, 'until' => $lockedUntil]);
    }
}

function wx_login_clear(string $email): void
{
    if (!wx_table_exists('wx_login_attempts')) {
        return;
    }
    wx_q('DELETE FROM wx_login_attempts WHERE email_hash = ?', [hash('sha256', strtolower($email))]);
}

/** IP throttle, kept from v2.1 (same table, same thresholds) so the host behaves unchanged. */
function wx_throttle(bool $failed = false): void
{
    $row = wx_one('SELECT n, t FROM wx_throttle WHERE ip = ?', [wx_ip()]);
    if (!$failed) {
        if ($row && (int) $row['n'] >= 8 && time() - (int) $row['t'] < 600) {
            throw ApiError::rateLimit('Too many attempts — wait 10 minutes');
        }
        return;
    }
    $n = ($row && time() - (int) $row['t'] < 600) ? (int) $row['n'] + 1 : 1;
    wx_q('REPLACE INTO wx_throttle (ip, n, t) VALUES (?,?,?)', [wx_ip(), $n, time()]);
}

/**
 * Step 1 of sign-in. Returns either a session (cookie set) or a 2FA ticket. Never reveals whether
 * an address exists: wrong email and wrong password are the same answer.
 */
function wx_login(string $email, string $password): array
{
    wx_throttle();
    $wait = wx_login_locked($email);
    if ($wait > 0) {
        throw ApiError::rateLimit('Too many attempts on this account — try again in ' . (int) ceil($wait / 60) . ' minute(s)');
    }
    $u = wx_one('SELECT * FROM wx_users WHERE email = ?', [strtolower($email)]);
    $ok = $u !== null && (int) $u['active'] === 1 && password_verify($password, (string) $u['pass_hash']);
    if (!$ok) {
        wx_throttle(true);
        wx_login_fail($email);
        wx_audit(null, 'login.failed', 'email:' . substr(hash('sha256', strtolower($email)), 0, 12));
        throw ApiError::auth('Email or password is not correct');
    }
    if (wx_demo_expired((string) $u['email'])) {
        throw ApiError::auth('This demo login has expired');
    }
    // Transparent upgrade: a hash made under an older cost is re-hashed on the first good login.
    if (password_needs_rehash((string) $u['pass_hash'], PASSWORD_DEFAULT)) {
        wx_update('wx_users', ['pass_hash' => password_hash($password, PASSWORD_DEFAULT)], ['id' => (int) $u['id']]);
    }

    $sec = wx_user_security((int) $u['id']);
    if (!empty($sec['twofa']) && !empty($sec['secret'])) {
        $ticket = wx_2fa_ticket((int) $u['id']);
        wx_audit($u, 'login.need2fa', 'user:' . $u['id']);
        return ['need2fa' => true, 'ticket' => $ticket];
    }
    return wx_login_finish($u);
}

/** Everything after the credential check: session, audit, envelope payload. */
function wx_login_finish(array $u): array
{
    wx_login_clear((string) $u['email']);
    list($sid, $csrf) = wx_session_create($u);
    wx_session_set_cookie($sid);
    wx_update('wx_users', ['last_login' => wx_now()], ['id' => (int) $u['id']]);
    wx_audit($u, 'login', 'user:' . $u['id']);
    $GLOBALS['WX_SESSION'] = wx_one('SELECT * FROM wx_sessions WHERE id = ?', [hash('sha256', $sid)]);
    return [
        'need2fa' => false,
        'csrf' => $csrf,
        'user' => wx_user_public($u),
        'caps' => wx_caps($u),
    ];
}

/* ------------------------------------------------------------------ recovery codes
   Eight one-time codes, in v2.1's format: eight hex characters shown as `xxxx-xxxx`, stored as the
   sha256 of the undashed string. The dashed form is what a person reads off a printout and types; the
   undashed form is what is hashed. Both sides go through the three functions below, because the bug
   they exist to prevent is a comparison that hashes the dashes or the case differently from the
   enrolment that stored it — a code that looks right and is silently refused. */

function wx_recovery_codes(int $count = 8): array
{
    $out = [];
    for ($i = 0; $i < $count; $i++) {
        $out[] = bin2hex(random_bytes(4));
    }
    return $out;
}

function wx_recovery_fmt(array $codes): array
{
    return array_map(static fn($x) => substr((string) $x, 0, 4) . '-' . substr((string) $x, 4), $codes);
}

function wx_recovery_hash(string $code): string
{
    return hash('sha256', strtolower(str_replace('-', '', trim($code))));
}

/* ------------------------------------------------------------------ 2FA tickets */

/** A short-lived, signed ticket that carries "password already verified for user N". */
function wx_2fa_ticket(int $userId): string
{
    $exp = time() + 300;
    $payload = $userId . '.' . $exp;
    return $payload . '.' . wx_sign('2fa', $payload);
}

function wx_2fa_ticket_verify(string $ticket): int
{
    $parts = explode('.', $ticket);
    if (count($parts) !== 3) {
        throw ApiError::auth('That sign-in attempt expired — sign in again');
    }
    list($uid, $exp, $sig) = $parts;
    if (!ctype_digit($uid) || !ctype_digit($exp) || (int) $exp < time()) {
        throw ApiError::auth('That sign-in attempt expired — sign in again');
    }
    if (!hash_equals(wx_sign('2fa', $uid . '.' . $exp), $sig)) {
        throw ApiError::auth('That sign-in attempt expired — sign in again');
    }
    return (int) $uid;
}

/** Step 2: TOTP code, or a one-time recovery code. */
function wx_login_2fa(string $ticket, string $code): array
{
    wx_throttle();
    $uid = wx_2fa_ticket_verify($ticket);
    $u = wx_one('SELECT * FROM wx_users WHERE id = ? AND active = 1', [$uid]);
    if ($u === null) {
        throw ApiError::auth('Sign in again');
    }
    $sec = wx_user_security($uid);
    $secret = (string) ($sec['secret'] ?? '');
    $okTotp = $secret !== '' && wx_totp_ok($secret, $code, $sec);
    if (!$okTotp) {
        $codes = $sec['recovery'] ?? [];
        $found = null;
        if (preg_match('~^[a-z0-9]{4}-?[a-z0-9]{4}$~i', $code)) {
            $want = wx_recovery_hash($code);
            foreach ((array) $codes as $i => $hash) {
                if (hash_equals((string) $hash, $want)) {
                    $found = $i;
                    break;
                }
            }
        }
        if ($found === null) {
            wx_throttle(true);
            wx_login_fail((string) $u['email']);
            wx_audit($u, 'login.2fa_failed', 'user:' . $uid);
            throw ApiError::auth('That code is not correct');
        }
        unset($codes[$found]);
        $sec['recovery'] = array_values((array) $codes);
        wx_user_security_put($uid, $sec);
        wx_audit($u, 'login.recovery_code_used', 'user:' . $uid, ['remaining' => count($sec['recovery'])]);
    } else {
        // Persist the replay guard advanced by wx_totp_ok().
        wx_user_security_put($uid, $sec);
    }
    return wx_login_finish($u);
}

/* ------------------------------------------------------------------ security state
   The two-factor secret, the recovery hashes, the replay guard and the alerts preference live on the
   user row (`wx_users.totp_secret`, `totp_on`, `recovery_json`, `totp_last`, `alerts` — migration 000
   and 008). v2.1 kept them in `_private/security.json`, keyed by user id, which meant a lost file locked
   everyone out and a read-modify-write race could drop a recovery code.

   Rows written before the move are read from the file **once**, returned as they were, and written back
   to the columns on the next write: no backfill script, no window where both copies disagree, and the
   file empties itself out as people use the screens. */

function wx_security_store(): JsonStore
{
    return wx_store('security.json', true);
}

/** The 2FA state for one user, in the column shape, whoever wrote it. */
/** The per-request cache for the state below. A static local cannot be cleared from outside, and a
    write that leaves a stale read behind is how a screen shows "two-factor off" right after turning it
    on. Held by reference so wx_security_state_put() can drop one user's entry. */
function &wx_security_cache(): array
{
    static $cache = [];
    return $cache;
}

function wx_security_state(int $userId): array
{
    $cache = &wx_security_cache();
    if (isset($cache[$userId])) {
        return $cache[$userId];
    }
    $row = wx_one('SELECT totp_secret, totp_on, recovery_json, totp_last, alerts FROM wx_users WHERE id = ?', [$userId]);
    $state = [
        'secret' => (string) ($row['totp_secret'] ?? ''),
        'on' => !empty($row['totp_on']),
        'recovery' => is_string($row['recovery_json'] ?? null) && $row['recovery_json'] !== ''
            ? (array) json_decode((string) $row['recovery_json'], true)
            : [],
        'last' => (int) ($row['totp_last'] ?? 0),
        'alerts' => !isset($row['alerts']) || (int) $row['alerts'] === 1,
        'legacy' => false,
    ];
    if ($state['secret'] === '' && $state['recovery'] === [] && wx_table_exists('wx_migrations')) {
        $old = wx_security_store()->tryRead() ?? [];
        $prev = is_array($old[(string) $userId] ?? null) ? $old[(string) $userId] : null;
        if ($prev !== null) {
            $state['secret'] = (string) ($prev['totp'] ?? ($prev['secret'] ?? ''));
            $state['on'] = !empty($prev['totp_on']) || !empty($prev['twofa']);
            $state['recovery'] = array_values((array) ($prev['recovery'] ?? []));
            $state['last'] = (int) ($prev['totp_last'] ?? 0);
            $state['alerts'] = !isset($prev['alerts']) || !empty($prev['alerts']);
            $state['legacy'] = true;
        }
    }
    $cache = &wx_security_cache();
    $cache[$userId] = $state;
    return $state;
}

/** Write the state back to the user row, and drop the legacy file row it came from. */
function wx_security_state_put(int $userId, array $state): void
{
    $cache = &wx_security_cache();
    unset($cache[$userId]);
    $recovery = array_values(array_filter(array_map('strval', (array) ($state['recovery'] ?? []))));
    wx_update('wx_users', [
        'totp_secret' => (string) ($state['secret'] ?? '') !== '' ? (string) $state['secret'] : null,
        'totp_on' => !empty($state['on']) ? 1 : 0,
        'recovery_json' => $recovery ? json_encode($recovery) : null,
        'totp_last' => (int) ($state['last'] ?? 0) ?: null,
        'alerts' => array_key_exists('alerts', $state) ? (!empty($state['alerts']) ? 1 : 0) : 1,
    ], ['id' => $userId]);

    /* Always offer to drop the legacy row: the columns are now the truth, and a stale copy of a secret
       in a file is exactly the kind of thing that outlives its reason. The update is a no-op when the
       file has no row for this user. */
    wx_security_store()->update(static function (array $all) use ($userId) {
        unset($all[(string) $userId]);
        return $all;
    });
}

/* The names v2.1 used, kept as thin aliases so a call site that reads `wx_user_security()` keeps
   working while there is exactly one implementation. `twofa` is the flag the UI reads. */
function wx_user_security(int $userId): array
{
    $s = wx_security_state($userId);
    return [
        'totp' => $s['secret'],
        'totp_on' => $s['on'],
        'twofa' => $s['on'],
        'recovery' => $s['recovery'],
        'totp_last' => $s['last'],
        'alerts' => $s['alerts'],
    ];
}

function wx_user_security_put(int $userId, array $state): void
{
    wx_security_state_put($userId, [
        'secret' => (string) ($state['totp'] ?? ($state['secret'] ?? '')),
        'on' => !empty($state['totp_on']) || !empty($state['twofa']),
        'recovery' => (array) ($state['recovery'] ?? []),
        'last' => (int) ($state['totp_last'] ?? 0),
        'alerts' => array_key_exists('alerts', $state) ? !empty($state['alerts']) : true,
    ]);
}

/** The otpauth:// URI the QR code is drawn from. */
function wx_2fa_uri(string $secret, string $email): string
{
    return 'otpauth://totp/' . rawurlencode('Woodex Admin:' . $email)
        . '?secret=' . $secret . '&issuer=' . rawurlencode('Woodex Admin') . '&algorithm=SHA1&digits=6&period=30';
}

/**
 * The last few sign-ins and 2FA events for one account.
 *
 * Read from `wx_activity`, which has recorded them all along — v2.1 kept a copy in its security file as
 * well, so the two could disagree about whether a login happened.
 */
function wx_login_alerts(int $userId, int $limit = 10): array
{
    $rows = wx_all(
        "SELECT action, ip, created_at FROM wx_activity
          WHERE user_id = ? AND (action = 'login' OR action LIKE 'login.%' OR action LIKE '2fa.%')
          ORDER BY id DESC LIMIT " . max(1, min(50, $limit)),
        [$userId]
    );
    $out = [];
    foreach ($rows as $r) {
        $out[] = ['action' => (string) $r['action'], 'ip' => (string) ($r['ip'] ?? ''), 'at' => (string) $r['created_at']];
    }
    return $out;
}

/* ------------------------------------------------------------------ TOTP (RFC 6238)
   A direct port of security-lib.php, which was already correct. Base32, HMAC-SHA1, ±1 time-step,
   plus the replay guard: a code cannot be used twice. */

function wx_b32_dec(string $b32): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $clean = (string) preg_replace('~[^A-Z2-7]~', '', strtoupper($b32));
    $bits = '';
    foreach (str_split($clean) as $c) {
        $pos = strpos($alphabet, $c);
        if ($pos === false) {
            continue;
        }
        $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 8) as $byte) {
        if (strlen($byte) === 8) {
            $out .= chr((int) bindec($byte));
        }
    }
    return $out;
}

/** Base32 (RFC 4648, no padding) — what an authenticator app expects. Ported from b32_enc(). */
function wx_b32_enc(string $bin): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $c) {
        $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 5) as $chunk) {
        $out .= $alphabet[(int) bindec(str_pad($chunk, 5, '0'))];
    }
    return $out;
}

function wx_hotp(string $key, int $counter): string
{
    // pack('J') is 64-bit big-endian, available on 64-bit PHP (Hostinger is 64-bit).
    $hash = hash_hmac('sha1', pack('J', $counter), $key, true);
    $offset = ord($hash[19]) & 0x0F;
    $value = ((ord($hash[$offset]) & 0x7F) << 24)
        | (ord($hash[$offset + 1]) << 16)
        | (ord($hash[$offset + 2]) << 8)
        | ord($hash[$offset + 3]);
    return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
}

function wx_totp_ok(string $secret, string $code, ?array &$state = null): bool
{
    $code = (string) preg_replace('~\s~', '', $code);
    if (!preg_match('~^\d{6}$~', $code)) {
        return false;
    }
    $key = wx_b32_dec($secret);
    if ($key === '') {
        return false;
    }
    $step = intdiv(time(), 30);
    foreach ([-1, 0, 1] as $delta) {
        if (hash_equals(wx_hotp($key, $step + $delta), $code)) {
            if ($state !== null) {
                if ((int) ($state['totp_last'] ?? 0) >= $step + $delta) {
                    return false; // replay
                }
                $state['totp_last'] = $step + $delta;
            }
            return true;
        }
    }
    return false;
}

/* ------------------------------------------------------------------ public shape */

/** The user object the browser is allowed to see. Same keys as v2.1's pub() so the UI ports cleanly. */
function wx_user_public(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'name' => (string) $u['name'],
        'email' => (string) $u['email'],
        'role' => (string) $u['role'],
        'roleLabel' => WX_ROLE_LABELS[$u['role']] ?? (string) $u['role'],
        'perms' => wx_user_perms((int) $u['id']),
        'active' => (bool) $u['active'],
        'created_at' => $u['created_at'] ?? null,
        'last_login' => $u['last_login'] ?? null,
        'twofa' => !empty(wx_user_security((int) $u['id'])['twofa']),
    ];
}

/** Active sessions for the account screen (P2) and for "sign out everywhere". */
function wx_session_list(int $userId): array
{
    $current = (string) (wx_session_row()['id'] ?? '');
    $rows = wx_all('SELECT id, ip, ua, created_at, seen_at, expires_at FROM wx_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY seen_at DESC', [$userId, wx_now()]);
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => substr((string) $r['id'], 0, 12),
            'current' => hash_equals($current, (string) $r['id']),
            'ip' => (string) $r['ip'],
            'ua' => (string) $r['ua'],
            'created_at' => (string) $r['created_at'],
            'seen_at' => (string) $r['seen_at'],
            'expires_at' => (string) $r['expires_at'],
        ];
    }
    return $out;
}

/** Ends every session except the current one. */
/**
 * End every session for one user — including the one making the request.
 *
 * The difference from wx_session_revoke_others() is the word "others". This one is used when a password
 * changes, an account is switched off, or an owner resets someone's two-factor: in all three cases the
 * point is that nobody stays signed in, and "nobody" has to include whoever is holding the keyboard.
 */
function wx_session_revoke_user(int $userId): int
{
    return wx_q('UPDATE wx_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [wx_now(), $userId])->rowCount();
}

function wx_session_revoke_others(int $userId): int
{
    $current = (string) (wx_session_row()['id'] ?? '');
    return wx_q('UPDATE wx_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL', [wx_now(), $userId, $current])->rowCount();
}
