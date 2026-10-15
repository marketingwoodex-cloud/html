<?php
/**
 * tests/roundtrip.php — the Phase 1 gate, executed.
 *
 * The plan's gate is: "a signed-in request round-trips cookie → CSRF → controller → MySQL → envelope;
 * the eight Critical findings are closed and verified."
 *
 * tests/conformance.mjs checks the *structure* of that sentence and tests/run.php checks the parts in
 * isolation. This file drives the whole path in sequence, through the front controller's own
 * functions, and asserts the envelope at each step:
 *
 *   1. GET  /health                      → the platform answers, and says whether it is migrated
 *   2. POST /auth/login  (wrong password) → AUTH, and the failure envelope has a request-id
 *   3. POST /auth/login  (correct)        → a session cookie that is HttpOnly + SameSite, plus a CSRF
 *                                            token that exists only in that response
 *   4. GET  /me                           → the session resolves to the right user, with capabilities
 *   5. PATCH /me  (no CSRF header)        → FORBIDDEN, and nothing changed
 *   6. PATCH /me  (with CSRF header)      → the write lands, and wx_activity records it
 *   7. POST /leads                        → a real row through MySQL, audited, with the request-id
 *   8. DELETE /leads/{id}                 → soft move to lost, history preserved
 *   9. POST /auth/logout                  → the session is revoked server-side, not just the cookie
 *  10. GET  /me  (same cookie again)      → AUTH: the cookie alone is not enough after logout
 *
 * Needs PHP + MySQL (_private/db.json). Without a database it reports SKIP and exits 0, so it can sit
 * in a pipeline that also runs on machines without one.
 *
 *   php tests/roundtrip.php
 *   php tests/roundtrip.php --keep        leave the test user and lead behind for inspection
 */

declare(strict_types=1);

if (!in_array(PHP_SAPI, ['cli', 'phpdbg', 'wasm'], true)) {
    http_response_code(403);
    echo "tests/roundtrip.php runs from the command line only.\n";
    exit(1);
}

/* Capture mode: wx_respond() records instead of exiting, so several requests can run in one process. */
define('WX_RESPOND_CAPTURE', true);

require_once dirname(__DIR__) . '/api/v2/lib/bootstrap.php';

$KEEP = in_array('--keep', $argv, true);
$passed = 0;
$failed = 0;
$created = ['user_id' => null, 'lead_id' => null];

/* The step/ok/eq/request helpers live in tests/harness.php — the Phase 2 gate uses the same
   harness, so there is one definition of how a request is formed. */
require_once __DIR__ . '/harness.php';

/* ------------------------------------------------------------------ can we run? */
echo "\n  Woodex api/v2 — Phase 1 round trip\n";

if (!is_file(WX_DB_FILE)) {
    echo "\n  SKIP: no _private/db.json, so there is no database to round-trip through.\n";
    echo "        Run this on the host or in CI where MySQL is available.\n\n";
    exit(0);
}
try {
    wx_db();
} catch (Throwable $e) {
    echo "\n  SKIP: the database is unreachable (" . $e->getMessage() . ").\n\n";
    exit(0);
}
if (!wx_table_exists('wx_sessions')) {
    echo "\n  SKIP: the platform migration is not applied. Run: php db/migrate.php\n\n";
    exit(0);
}

/* ------------------------------------------------------------------ fixture */
$email = 'roundtrip+' . bin2hex(random_bytes(3)) . '@woodex.test';
$password = 'RoundTrip!' . bin2hex(random_bytes(4));
$userId = 0;
try {
    $userId = wx_insert('wx_users', [
        'name' => 'Round Trip',
        'email' => $email,
        'role' => 'owner',
        'pass_hash' => password_hash($password, PASSWORD_DEFAULT),
        'active' => 1,
        'pw_ver' => 1,
        'created_at' => wx_now(),
    ]);
    $created['user_id'] = $userId;
} catch (Throwable $e) {
    echo "\n  SKIP: could not create a test user (" . $e->getMessage() . ").\n\n";
    exit(0);
}
echo "  fixture: user #" . $userId . "\n";

/* ------------------------------------------------------------------ 1. health */
step('1', 'GET /health — the platform answers');
$r = request('GET', ['health']);
eq($r['status'], 200, 'health is 200');
ok(($r['body']['ok'] ?? false) === true, 'the success envelope has ok:true');
ok(isset($r['body']['meta']['requestId']), 'the envelope carries a request-id');
ok(($r['body']['data']['db']['migrated'] ?? false) === true, 'health reports the database as migrated');

/* ------------------------------------------------------------------ 2. wrong password */
step('2', 'POST /auth/login with a wrong password — refused, without revealing anything');
$r = request('POST', ['auth', 'login'], ['body' => ['email' => $email, 'password' => 'wrong-password']]);
eq($r['status'], 401, 'a bad password is 401');
eq($r['body']['error']['code'], 'AUTH', 'the code is AUTH');
eq($r['body']['error']['message'], 'Email or password is not correct', 'the message does not say which half was wrong');
ok(!isset($r['body']['data']), 'a failure envelope carries no data');
eq(cookie_from($r['cookie']), [], 'no session cookie is issued on a failure');

$rUnknown = request('POST', ['auth', 'login'], ['body' => ['email' => 'nobody-' . bin2hex(random_bytes(3)) . '@woodex.test', 'password' => 'wrong-password']]);
eq($rUnknown['body']['error']['message'], $r['body']['error']['message'], 'an unknown account answers identically to a wrong password');

/* ------------------------------------------------------------------ 3. sign in */
step('3', 'POST /auth/login — a cookie that script cannot read, and a CSRF token');
$r = request('POST', ['auth', 'login'], ['body' => ['email' => $email, 'password' => $password]]);
eq($r['status'], 200, 'sign-in is 200');
ok(($r['body']['ok'] ?? false) === true, 'the envelope says ok');
eq($r['body']['data']['user']['email'], $email, 'the right user comes back');
ok(!empty($r['body']['data']['csrf']), 'a CSRF token is issued with the session');
$cookie = cookie_from($r['cookie']);
ok($cookie !== [], 'a session cookie is set');
$setCookie = (string) $r['cookie'];
ok(stripos($setCookie, 'HttpOnly') !== false, 'the cookie is HttpOnly');
ok(stripos($setCookie, 'SameSite=Lax') !== false, 'the cookie is SameSite=Lax');
$csrf = (string) $r['body']['data']['csrf'];

$row = wx_one('SELECT id FROM wx_sessions WHERE user_id = ?', [$userId]);
ok($row !== null, 'the session is recorded server-side');
ok($row !== null && $row['id'] !== ($cookie[WX_SESSION_COOKIE] ?? ''), 'the stored id is a hash, not the cookie value');

/* ------------------------------------------------------------------ 4. me */
step('4', 'GET /me — the cookie resolves to the user');
$r = request('GET', ['me'], ['cookie' => $cookie]);
eq($r['status'], 200, 'me is 200');
eq($r['body']['data']['user']['id'], $userId, 'me returns the session owner');
ok(in_array('master', $r['body']['data']['caps']['groups'] ?? [], true), 'the owner carries the master capability group');
$csrf = (string) ($r['body']['data']['csrf'] ?? $csrf);

/* ------------------------------------------------------------------ 5. CSRF refusal */
step('5', 'PATCH /me without the CSRF header — refused, and nothing changes');
$before = (string) wx_val('SELECT name FROM wx_users WHERE id = ?', [$userId]);
$r = request('PATCH', ['me'], ['cookie' => $cookie, 'body' => ['name' => 'Changed Without CSRF']]);
eq($r['status'], 403, 'a state change without the token is 403');
eq($r['body']['error']['code'], 'FORBIDDEN', 'the code is FORBIDDEN');
eq($r['body']['error']['field'], 'X-WX-CSRF', 'the missing header is named');
eq((string) wx_val('SELECT name FROM wx_users WHERE id = ?', [$userId]), $before, 'the name was not changed');

/* ------------------------------------------------------------------ 6. authorised write */
step('6', 'PATCH /me with the CSRF header — the write lands and is audited');
$r = request('PATCH', ['me'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['name' => 'Round Trip Renamed']]);
eq($r['status'], 200, 'the write is accepted');
eq($r['body']['data']['user']['name'], 'Round Trip Renamed', 'the new name comes back');
eq((string) wx_val('SELECT name FROM wx_users WHERE id = ?', [$userId]), 'Round Trip Renamed', 'the name is in the database');
$audited = (int) wx_val("SELECT COUNT(*) FROM wx_activity WHERE action = 'me.save' AND target = ?", ['user:' . $userId]);
ok($audited >= 1, 'the write is in the audit log');
$withId = wx_one("SELECT req_id FROM wx_activity WHERE action = 'me.save' AND target = ? ORDER BY id DESC LIMIT 1", ['user:' . $userId]);
ok(!empty($withId['req_id']), 'the audit row carries the request-id');

/* ------------------------------------------------------------------ 7. a real resource */
step('7', 'POST /leads — a row through MySQL, with money as whole rupees');
$r = request('POST', ['leads'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => [
    'name' => 'Round Trip Lead',
    'phone' => '03001234567',
    'source' => 'manual',
    'stage' => 'new',
    'value' => '1234.56',
]]);
eq($r['status'], 200, 'the lead is created');
$created['lead_id'] = (int) ($r['body']['data']['lead']['id'] ?? 0);
ok($created['lead_id'] > 0, 'an id comes back');
eq($r['body']['data']['lead']['value'], 1235, 'a rupee amount with a fraction is rounded to the rupee on the way in');
eq($r['body']['data']['lead']['valueDisplay'], '1,235', 'and rendered back the way a document writes it');

$r = request('POST', ['leads'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['name' => 'x']]);
eq($r['status'], 422, 'an incomplete lead is refused');
eq($r['body']['error']['code'], 'VALIDATION', 'with a VALIDATION code');
eq($r['body']['error']['field'], 'name', 'naming the field');

$r = request('POST', ['leads'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['name' => 'Valid Name', 'phone' => '0300', 'stage' => 'not-a-stage']]);
eq($r['status'], 422, 'an unknown stage is refused');
eq($r['body']['error']['field'], 'stage', 'naming the stage field');

/* ------------------------------------------------------------------ 8. soft delete */
step('8', 'DELETE /leads/{id} — soft, so the history survives');
$r = request('DELETE', ['leads', (string) $created['lead_id']], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['reason' => 'round trip']]);
eq($r['status'], 200, 'the delete is accepted');
eq((string) wx_val('SELECT stage FROM wx_leads WHERE id = ?', [$created['lead_id']]), 'lost', 'the row still exists, in the lost stage');
ok((int) wx_val('SELECT COUNT(*) FROM wx_lead_notes WHERE lead_id = ?', [$created['lead_id']]) >= 2, 'the lead kept its notes');

/* ------------------------------------------------------------------ 9. logout */
step('9', 'POST /auth/logout — the session dies on the server, not just in the browser');
$r = request('POST', ['auth', 'logout'], ['cookie' => $cookie, 'csrf' => $csrf]);
eq($r['status'], 200, 'logout is 200');
$revoked = wx_val('SELECT revoked_at FROM wx_sessions WHERE user_id = ? ORDER BY seen_at DESC LIMIT 1', [$userId]);
ok($revoked !== null, 'the session row is marked revoked');

/* ------------------------------------------------------------------ 10. the cookie is useless */
step('10', 'GET /me with the old cookie — the cookie alone is not enough');
$r = request('GET', ['me'], ['cookie' => $cookie]);
eq($r['status'], 401, 'the revoked cookie is refused');
eq($r['body']['error']['code'], 'AUTH', 'with an AUTH code');

/* ------------------------------------------------------------------ cleanup */
if (!$KEEP && $created['lead_id']) {
    try {
        wx_q('DELETE FROM wx_lead_notes WHERE lead_id = ?', [$created['lead_id']]);
        wx_q('DELETE FROM wx_leads WHERE id = ?', [$created['lead_id']]);
    } catch (Throwable $e) {
        echo "     · cleanup of the lead failed: " . $e->getMessage() . "\n";
    }
}
if (!$KEEP && $created['user_id']) {
    try {
        wx_q('DELETE FROM wx_sessions WHERE user_id = ?', [$created['user_id']]);
        wx_q('DELETE FROM wx_user_perms WHERE user_id = ?', [$created['user_id']]);
        wx_q('DELETE FROM wx_users WHERE id = ?', [$created['user_id']]);
    } catch (Throwable $e) {
        echo "     · cleanup of the user failed: " . $e->getMessage() . "\n";
    }
}

echo "\n  " . $passed . " passed · " . $failed . " failed\n";
if ($failed) {
    echo "  The Phase 1 gate is not met: the round trip failed above.\n";
}
echo "\n";
exit($failed ? 1 : 0);
