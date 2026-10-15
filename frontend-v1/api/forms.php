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
function jread(string $f): array { $r = is_file($f) ? @file_get_contents($f) : false; return $r ? (json_decode($r, true) ?: []) : []; }
function jwrite(string $f, array $d): void { file_put_contents($f, json_encode($d, JSON_PRETTY_PRINT), LOCK_EX); @chmod($f, 0600); }
function now(): string { return date('Y-m-d H:i:s'); }
function ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }
function db(): PDO {
    static $pdo = null; if ($pdo) return $pdo;
    $c = jread(DB_FILE); if (!$c) fail('Enquiries are not available right now. Please WhatsApp us.', 503);
    $pdo = new PDO('mysql:host=' . ($c['host'] ?: 'localhost') . ';dbname=' . $c['name'] . ';charset=utf8mb4', $c['user'], $c['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
require __DIR__ . '/crm-lib.php';

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
    if (clip($in['_hp'] ?? '') !== '' || clip($in['company_hp'] ?? '') !== '') out(['ok' => true, 'id' => 0]); // bot: pretend success
    crm_migrate();
    // rate limit: 5 enquiries / 10 minutes / IP (wx_throttle table from admin setup)
    $key = 'form:' . ip(); $t = q('SELECT n,t FROM wx_throttle WHERE ip=?', [$key])->fetch();
    if ($t && time() - (int)$t['t'] < 600 && (int)$t['n'] >= 5) fail('Too many enquiries from this connection. Please WhatsApp us instead.', 429);
    if (!$t || time() - (int)$t['t'] >= 600) q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,1,?)', [$key, time()]); else q('UPDATE wx_throttle SET n=n+1 WHERE ip=?', [$key]);

    $cfg = crm_cfg();
    if ($cfg['tsSecret'] !== '' && ($in['form'] ?? '') !== 'whatsapp') { // the WhatsApp widget has no Turnstile box (honeypot + rate limit still apply)
        $tok = clip($in['cf-turnstile-response'] ?? ($in['turnstile'] ?? ''), 2048); if ($tok === '') fail('Please complete the spam check');
        $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_POSTFIELDS => http_build_query(['secret' => $cfg['tsSecret'], 'response' => $tok, 'remoteip' => ip()])]);
        $r = curl_exec($ch); curl_close($ch);
        if ($r !== false) { $j = json_decode((string)$r, true); if (empty($j['success'])) fail('Spam check failed — please try again'); } // Cloudflare unreachable: accept rather than lose the lead
    }
    $name = clip($in['name'] ?? '', 120); $phone = clip($in['phone'] ?? '', 40); $email = clip($in['email'] ?? '', 190);
    if (mb_strlen($name) < 2) fail('Please enter your name');
    if (!preg_match('~^[+\d][\d\s()-]{6,}$~', $phone)) fail('Please enter a valid phone number');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please check your email address');
    $form = (string)($in['form'] ?? ''); $source = isset(CRM_SOURCES[$form]) && !in_array($form, ['manual', 'import'], true) ? $form : 'contact';
    $skip = ['action', 'form', 'name', 'phone', 'email', 'message', 'service', 'page', '_hp', 'company_hp', 'cf-turnstile-response', 'turnstile']; $fields = [];
    foreach ($in as $k => $v) if (!in_array($k, $skip, true) && preg_match('~^[a-z0-9_ -]{1,40}$~i', (string)$k) && is_scalar($v) && (string)$v !== '' && count($fields) < 25) $fields[$k] = clip($v, 1000);
    q('INSERT INTO wx_leads (created_at,source,page,name,phone,email,service,message,fields,stage,is_read,ip) VALUES (?,?,?,?,?,?,?,?,?,\'new\',0,?)',
        [now(), $source, clip($in['page'] ?? '', 200), $name, $phone, $email, clip($in['service'] ?? '', 190), clip($in['message'] ?? '', 4000), json_encode($fields, JSON_UNESCAPED_UNICODE), ip()]);
    $id = (int)db()->lastInsertId();
    $lead = ['id' => $id, 'source' => $source, 'page' => clip($in['page'] ?? '', 200), 'name' => $name, 'phone' => $phone, 'email' => $email, 'service' => clip($in['service'] ?? '', 190), 'message' => clip($in['message'] ?? '', 4000), 'fields' => $fields];
    // reply to the visitor first, then send alerts (does not slow the form down)
    echo json_encode(['ok' => true, 'id' => $id]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else { @ob_end_flush(); @flush(); }
    ignore_user_abort(true);
    $fc = array_merge(['alertTo' => '', 'waTo' => '', 'waAlert' => true, 'reply' => true, 'replyText' => ''], (array)((jread(PRIVATE_DIR . '/forms.json')['forms'] ?? [])[$source] ?? [])); // P18 E
    try { send_alerts($lead, '', $fc); } catch (Throwable $e) { error_log('forms.php alerts: ' . $e->getMessage()); }
    try { $lead['created_at'] = now(); $lead['stage'] = 'new'; sheets_push($lead); } catch (Throwable $e) { error_log('forms.php sheets: ' . $e->getMessage()); }
    if ($fc['reply'] && $form !== 'whatsapp' && forms_reply_ok($phone, $email) && is_file(__DIR__ . '/notify-lib.php')) { require_once __DIR__ . '/notify-lib.php'; notify_client('lead', ['name' => $name, 'phone' => $phone, 'email' => $email, 'ref' => 'Enquiry #' . $id, 'project' => $lead['service'], 'tpl' => (string)$fc['replyText']]); }
    exit;
} catch (PDOException $e) { error_log('forms.php: ' . $e->getMessage()); fail('Could not save your enquiry. Please WhatsApp us.', 500); }
