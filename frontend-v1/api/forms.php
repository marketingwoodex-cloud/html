<?php
/**
 * Woodex — public site forms endpoint (Phase A4).
 * GET  /api/forms.php            → {ok, turnstile: siteKey}
 * POST /api/forms.php  JSON {form, name, phone, email, service, message, ...extra fields, _hp, cf-turnstile-response}
 * Saves the enquiry to MySQL (wx_leads) and sends email / WhatsApp alerts to the team.
 * Spam: honeypot, 5 per 10 min per IP, optional Cloudflare Turnstile (keys in Admin → Enquiries → Alerts & spam).
 */
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

const ROOT_DIR    = __DIR__ . '/..';
const PRIVATE_DIR = ROOT_DIR . '/_private';
const DB_FILE     = PRIVATE_DIR . '/db.json';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(array $d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function fail(string $m, int $code = 400): void { out(['ok' => false, 'error' => $m], $code); }
function jread(string $f): array { clearstatcache(true, $f); $r = is_file($f) ? @file_get_contents($f) : false; return $r ? (json_decode($r, true) ?: []) : []; }
function jwrite(string $f, array $d): void {
    /* P22.2 (B-01): write a temp file, then rename it over the target. file_put_contents(..., LOCK_EX)
       truncates before it locks, so a reader could see an empty file and a crash could leave one. */
    $dir = dirname($f);
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $tmp = @tempnam($dir, 'wx_');
    $json = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($tmp === false) { file_put_contents($f, $json, LOCK_EX); @chmod($f, 0600); return; }
    file_put_contents($tmp, $json, LOCK_EX);
    @chmod($tmp, 0600);
    if (!@rename($tmp, $f)) { @unlink($tmp); file_put_contents($f, $json, LOCK_EX); @chmod($f, 0600); }
}
function now(): string { return date('Y-m-d H:i:s'); }
function ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }
function db(): PDO {
    static $pdo = null; if ($pdo) return $pdo;
    $c = jread(DB_FILE); if (!$c) fail('Enquiries are not available right now. Please WhatsApp us.', 503);
    /* The local engine (`tools/phpwasm`, SQLite) and the host (MySQL) share this script and this file:
       `driver: sqlite` opens the same `_private/<file>` the console's api/v2 already uses, so the whole
       intake path — page → wx_leads → the console — runs and is proved without a MySQL in the room. */
    if (($c['driver'] ?? '') === 'sqlite') {
        $pdo = new PDO('sqlite:' . ROOT_DIR . '/_private/' . basename((string)($c['file'] ?? 'woodex.sqlite')), null, null,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        return $pdo;
    }
    $pdo = new PDO('mysql:host=' . ($c['host'] ?: 'localhost') . ';dbname=' . $c['name'] . ';charset=utf8mb4', $c['user'], $c['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
require __DIR__ . '/crm-lib.php';
require __DIR__ . '/intake-lib.php';
/* The console reads this: what happened to each enquiry after it was saved (plan P25.2 §5.1, "no silent
   loss"). Written here because this script is the only thing that knows whether the alert went out. */
const INTAKE_LOG_FILE = PRIVATE_DIR . '/intake-log.json';
/** Read/keep the delivery log. Both are this script's own file helpers — the same temp-then-rename write
    every other JSON store here uses (P22.2 B-01). */
function intake_log_read(): array { return jread(INTAKE_LOG_FILE); }
function intake_log_save(array $state): void { jwrite(INTAKE_LOG_FILE, $state); }

if ($_SERVER['REQUEST_METHOD'] === 'GET') out(['ok' => true, 'turnstile' => crm_cfg()['tsSite']]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
$raw = (string)file_get_contents('php://input');
$in = json_decode($raw, true); if (!is_array($in)) $in = $_POST;
// Phase 8 — WhatsApp widget click counter (no personal data): {days:{Y-m-d:n}, pages:{path:n}, services:{name:n}}
if (($in['action'] ?? '') === 'wa_click') {
    $f = PRIVATE_DIR . '/wa-stats.json'; $fp = fopen($f . '.lock', 'c'); flock($fp, LOCK_EX);
    $st = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : []; $d = date('Y-m-d');
    $st['days'][$d] = (int)($st['days'][$d] ?? 0) + 1; krsort($st['days']); $st['days'] = array_slice($st['days'], 0, 120, true);
    foreach (['pages' => substr(preg_replace('~[^a-z0-9/_-]~i', '', (string)($in['page'] ?? '/')), 0, 120) ?: '/', 'services' => substr(preg_replace('~[^\w &/-]~u', '', (string)($in['service'] ?? '')), 0, 60)] as $k => $v)
        if ($v !== '' && (isset($st[$k][$v]) || count($st[$k] ?? []) < 300)) $st[$k][$v] = (int)($st[$k][$v] ?? 0) + 1;
    file_put_contents($f, json_encode($st), LOCK_EX); flock($fp, LOCK_UN); out(['ok' => true]);
}

// P17 booking (site visit / meeting / online call)
if (in_array((string)($in['action'] ?? ''), ['book_cfg', 'book_slots', 'book_create'], true)) {
    require __DIR__ . '/booking-lib.php';
    try { booking_public($in); } catch (PDOException $e) { error_log('booking: ' . $e->getMessage()); fail('Could not save your booking. Please WhatsApp us.', 500); }
}

/** Security audit F-01: auto-reply at most once per phone/email per 24 h and 60 per day site-wide (stops the form being used as a spam relay). */
function forms_reply_ok(string $phone, string $email): bool {
    $now = time(); $keys = ['ar:' . substr(sha1(preg_replace('~\D~', '', $phone)), 0, 20)]; if ($email !== '') $keys[] = 'ar:' . substr(sha1(strtolower($email)), 0, 20);
    foreach ($keys as $k) { $r = q('SELECT t FROM wx_throttle WHERE ip=?', [$k])->fetch(); if ($r && $now - (int)$r['t'] < 86400) return false; }
    $dk = 'ar-day:' . gmdate('Ymd'); $d = q('SELECT n FROM wx_throttle WHERE ip=?', [$dk])->fetch(); if ($d && (int)$d['n'] >= 60) return false;
    if ($d) q('UPDATE wx_throttle SET n=n+1 WHERE ip=?', [$dk]); else q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,1,?)', [$dk, $now]);
    foreach ($keys as $k) q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,1,?)', [$k, $now]);
    return true;
}
try {
    if (clip($in['_hp'] ?? '') !== '' || clip($in['company_hp'] ?? '') !== '') { // bot: pretend success
        intake_log_save(intake_delivery_merge(intake_log_read(), ['at' => now(), 'id' => 0, 'verdict' => 'bot',
            'source' => clip($in['form'] ?? '', 40), 'page' => clip($in['page'] ?? '', 200), 'turnstile' => 'off', 'channels' => []]));
        out(['ok' => true, 'id' => 0]);
    }
    crm_migrate();
    // rate limit: 5 enquiries / 10 minutes / IP (wx_throttle table from admin setup)
    $key = 'form:' . ip(); $t = q('SELECT n,t FROM wx_throttle WHERE ip=?', [$key])->fetch();
    if ($t && time() - (int)$t['t'] < 600 && (int)$t['n'] >= 5) fail('Too many enquiries from this connection. Please WhatsApp us instead.', 429);
    if (!$t || time() - (int)$t['t'] >= 600) q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,1,?)', [$key, time()]); else q('UPDATE wx_throttle SET n=n+1 WHERE ip=?', [$key]);

    $cfg = crm_cfg();
    $ts = ['verdict' => 'off', 'detail' => ''];
    if ($cfg['tsSecret'] !== '' && ($in['form'] ?? '') !== 'whatsapp') { // the WhatsApp widget has no Turnstile box (honeypot + rate limit still apply)
        $tok = clip($in['cf-turnstile-response'] ?? ($in['turnstile'] ?? ''), 2048); if ($tok === '') fail('Please complete the spam check');
        $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_POSTFIELDS => http_build_query(['secret' => $cfg['tsSecret'], 'response' => $tok, 'remoteip' => ip()])]);
        $r = curl_exec($ch); curl_close($ch);
        /* Unreachable Cloudflare accepts the enquiry and says so; a delivered "no" refuses. The rule, and the
           reasoning, are in intake_turnstile() and docs/INTAKE-RULES-P25.2.md. */
        $ts = intake_turnstile($r !== false, $r !== false ? (json_decode((string) $r, true) ?: []) : null);
        if (!$ts['accept']) fail('Spam check failed — please try again');
    }
    $name = clip($in['name'] ?? '', 120); $phone = clip($in['phone'] ?? '', 40); $email = clip($in['email'] ?? '', 190);
    if (mb_strlen($name) < 2) fail('Please enter your name');
    if (!preg_match('~^[+\d][\d\s()-]{6,}$~', $phone)) fail('Please enter a valid phone number');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please check your email address');
    $form = (string)($in['form'] ?? ''); $source = isset(CRM_SOURCES[$form]) && !in_array($form, ['manual', 'import'], true) ? $form : 'contact';
    $skip = ['action', 'form', 'name', 'phone', 'email', 'message', 'service', 'page', '_hp', 'company_hp', 'cf-turnstile-response', 'turnstile']; $fields = [];
    foreach ($in as $k => $v) if (!in_array($k, $skip, true) && preg_match('~^[a-z0-9_ -]{1,40}$~i', (string)$k) && is_scalar($v) && (string)$v !== '' && count($fields) < 25) $fields[$k] = clip($v, 1000);
    /* Plan §5.1, "duplicate submissions": one enquiry is one lead. The claim is one row per identity in
       wx_throttle (the table already there), taken before the insert; a double-tap on the form is answered
       as a success carrying the first lead's id, so the visitor sees nothing and the studio sees one lead. */
    $dedupe = new IntakeThrottleStore(static function (string $sql, array $bind): array {
        $st = db()->prepare($sql); $st->execute($bind);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    });
    $verdict = intake_verdict($dedupe, intake_dedupe_keys($phone, $email, $source, clip($in['page'] ?? '', 200)), time());
    if ($verdict['duplicate']) {
        /* The answer carries the first lead's id — matched by the identity the claim used, so a differently
           formatted phone number still points at the lead it is a duplicate of. */
        $first = intake_first_id(q('SELECT id, phone, email FROM wx_leads WHERE source=? AND page=? ORDER BY id ASC LIMIT 50',
            [$source, clip($in['page'] ?? '', 200)])->fetchAll(), $phone, $email);
        intake_log_save(intake_delivery_merge(intake_log_read(), ['at' => now(), 'id' => $first, 'verdict' => 'duplicate',
            'source' => $source, 'page' => clip($in['page'] ?? '', 200), 'turnstile' => $ts['verdict'], 'channels' => []]));
        out(['ok' => true, 'id' => $first]);
    }
    q('INSERT INTO wx_leads (created_at,source,page,name,phone,email,service,message,fields,stage,is_read,ip) VALUES (?,?,?,?,?,?,?,?,?,\'new\',0,?)',
        [now(), $source, clip($in['page'] ?? '', 200), $name, $phone, $email, clip($in['service'] ?? '', 190), clip($in['message'] ?? '', 4000), json_encode($fields, JSON_UNESCAPED_UNICODE), ip()]);
    $id = (int)db()->lastInsertId();
    $lead = ['id' => $id, 'source' => $source, 'page' => clip($in['page'] ?? '', 200), 'name' => $name, 'phone' => $phone, 'email' => $email, 'service' => clip($in['service'] ?? '', 190), 'message' => clip($in['message'] ?? '', 4000), 'fields' => $fields];
    // reply to the visitor first, then send alerts (does not slow the form down)
    echo json_encode(['ok' => true, 'id' => $id]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else { @ob_end_flush(); @flush(); }
    ignore_user_abort(true);
    $fc = array_merge(['alertTo' => '', 'waTo' => '', 'waAlert' => true, 'reply' => true, 'replyText' => ''], (array)((jread(PRIVATE_DIR . '/forms.json')['forms'] ?? [])[$source] ?? [])); // P18 E
    /* Everything after this line can fail without losing the lead — and when it does, the fact is kept in
       the intake log the console reads, not only in an error log nobody opens (plan §5.1, "no silent loss"). */
    $delivered = [];
    try { $delivered['alert'] = intake_channel_outcome(send_alerts($lead, '', $fc)); }
    catch (Throwable $e) { error_log('forms.php alerts: ' . $e->getMessage()); $delivered['alert'] = ['ok' => false, 'detail' => 'error: ' . intake_clip($e->getMessage()), 'skipped' => false]; }
    try { $lead['created_at'] = now(); $lead['stage'] = 'new'; $delivered['sheets'] = intake_channel_outcome(sheets_push($lead)); }
    catch (Throwable $e) { error_log('forms.php sheets: ' . $e->getMessage()); $delivered['sheets'] = ['ok' => false, 'detail' => 'error: ' . intake_clip($e->getMessage()), 'skipped' => false]; }
    if ($fc['reply'] && $form !== 'whatsapp' && forms_reply_ok($phone, $email) && is_file(__DIR__ . '/notify-lib.php')) {
        require_once __DIR__ . '/notify-lib.php';
        try { $delivered['reply'] = intake_channel_outcome(notify_client('lead', ['name' => $name, 'phone' => $phone, 'email' => $email, 'ref' => 'Enquiry #' . $id, 'project' => $lead['service'], 'tpl' => (string)$fc['replyText']])); }
        catch (Throwable $e) { error_log('forms.php reply: ' . $e->getMessage()); $delivered['reply'] = ['ok' => false, 'detail' => 'error: ' . intake_clip($e->getMessage()), 'skipped' => false]; }
    } else { $delivered['reply'] = ['ok' => true, 'detail' => 'skipped: not sent for this form', 'skipped' => true]; }
    intake_log_save(intake_delivery_merge(intake_log_read(), ['at' => now(), 'id' => $id, 'verdict' => 'new',
        'source' => $source, 'page' => $lead['page'], 'turnstile' => $ts['verdict'], 'channels' => $delivered]));
    exit;
} catch (PDOException $e) { error_log('forms.php: ' . $e->getMessage()); fail('Could not save your enquiry. Please WhatsApp us.', 500); }
