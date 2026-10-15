<?php
/**
 * Phase 11: WhatsApp Cloud API webhook (AI agent, team can take over in Admin → Live chat).
 * Meta → App → WhatsApp → Configuration → Callback URL: https://woodex.com.pk/api/whatsapp.php
 * Verify token + App secret: Admin → Live chat → Train AI → WhatsApp.
 */
declare(strict_types=1);
define('WX_LIB_ONLY', true);
require __DIR__ . '/admin.php';

if (!is_file(DB_FILE)) { http_response_code(503); exit('not installed'); }
$cfg = chat_cfg();

// 1) Meta verification handshake (GET)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $tok = (string)($_GET['hub_verify_token'] ?? '');
    if (($_GET['hub_mode'] ?? '') === 'subscribe' && $cfg['waVerify'] !== '' && hash_equals($cfg['waVerify'], $tok)) { header('Content-Type: text/plain'); exit((string)($_GET['hub_challenge'] ?? '')); }
    http_response_code(403); exit('forbidden');
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

// 2) Signature check (X-Hub-Signature-256) — required (security audit F-02: fail closed).
//    Save the Meta App secret in Admin → Live chat → Train AI → WhatsApp, otherwise all events are refused.
$raw = (string)file_get_contents('php://input');
if ($cfg['waSecret'] === '') { error_log('whatsapp.php: App secret not set - webhook refused'); http_response_code(503); exit('app secret not configured'); }
$sig = (string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
if (!hash_equals('sha256=' . hash_hmac('sha256', $raw, $cfg['waSecret']), $sig)) { http_response_code(401); exit('bad signature'); }
$j = json_decode($raw, true) ?: [];
http_response_code(200); header('Content-Type: application/json'); echo '{"ok":true}';
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); // answer Meta fast, then work
// P18 G: delivery / read receipts, replies to campaigns, STOP opt-outs (works even when the AI agent is off)
$wagStop = [];
try { $wagStop = wag_webhook($j); } catch (Throwable $e) { error_log('wa automation: ' . $e->getMessage()); }
foreach ($wagStop as $p) { try { wa_text('+' . $p, 'You will not receive offers from Woodex Interior on WhatsApp any more. Reply START to subscribe again. For your project, just message us here.'); } catch (Throwable $e) {} }
if ($wagStop) foreach (($j['entry'] ?? []) as $k1 => $en) foreach (($en['changes'] ?? []) as $k2 => $chg) foreach (($chg['value']['messages'] ?? []) as $k3 => $m) if (in_array(wag_phone((string)($m['from'] ?? '')), $wagStop, true)) unset($j['entry'][$k1]['changes'][$k2]['value']['messages'][$k3]);
if (!$cfg['waAgent']) exit;

try {
    chat_migrate();
    q('CREATE TABLE IF NOT EXISTS wx_wa_seen (mid VARCHAR(190) PRIMARY KEY, t DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    foreach (($j['entry'] ?? []) as $en) foreach (($en['changes'] ?? []) as $chg) {
        $v = $chg['value'] ?? []; $names = [];
        foreach (($v['contacts'] ?? []) as $ct) $names[(string)($ct['wa_id'] ?? '')] = (string)($ct['profile']['name'] ?? '');
        foreach (($v['messages'] ?? []) as $m) wa_incoming($m, $names[(string)($m['from'] ?? '')] ?? '', $cfg);
    }
} catch (Throwable $e) { error_log('wa webhook: ' . $e->getMessage()); }
exit;

function wa_incoming(array $m, string $pname, array $cfg): void {
    $mid = (string)($m['id'] ?? ''); $from = preg_replace('~\D~', '', (string)($m['from'] ?? ''));
    if ($mid === '' || $from === '') return;
    try { q('INSERT INTO wx_wa_seen (mid,t) VALUES (?,?)', [mb_substr($mid, 0, 190), now()]); } catch (Throwable $e) { return; } // Meta retries: handle once
    $type = (string)($m['type'] ?? 'text');
    switch ($type) { // (switch, not match: also runs on PHP 7.4)
        case 'text': $text = (string)($m['text']['body'] ?? ''); break;
        case 'button': $text = (string)($m['button']['text'] ?? ''); break;
        case 'interactive': $text = (string)($m['interactive']['button_reply']['title'] ?? $m['interactive']['list_reply']['title'] ?? ''); break;
        case 'location': $text = 'Location: ' . ($m['location']['name'] ?? '') . ' ' . ($m['location']['latitude'] ?? '') . ',' . ($m['location']['longitude'] ?? ''); break;
        default: $text = '[' . $type . ' received: open WhatsApp to view]';
    }
    $text = trim($text); if ($text === '') return;
    $phone = '+' . $from;
    $c = q("SELECT * FROM wx_chats WHERE channel='wa' AND phone=? ORDER BY id DESC LIMIT 1", [$phone])->fetch();
    $new = !$c;
    if ($new) {
        q("INSERT INTO wx_chats (token,created_at,updated_at,name,phone,page,ip,channel) VALUES (?,?,?,?,?,?,?,'wa')", [hash('sha256', bin2hex(random_bytes(20))), now(), now(), $pname !== '' ? mb_substr($pname, 0, 120) : null, $phone, 'WhatsApp', 'whatsapp']);
        $c = chat_get((int)db()->lastInsertId());
    } elseif ($c['status'] !== 'open') { q("UPDATE wx_chats SET status='open' WHERE id=?", [$c['id']]); $c['status'] = 'open'; }
    chat_add((int)$c['id'], 'visitor', (string)$c['name'], $text);
    $c = chat_capture(chat_get((int)$c['id']), $text); // phone is known → auto-lead (source chat)
    if ($new && $c['lead_id']) try { q("UPDATE wx_leads SET source='whatsapp' WHERE id=?", [$c['lead_id']]); } catch (Throwable $e) {}
    if (!(int)$c['alerted']) { q('UPDATE wx_chats SET alerted=1 WHERE id=?', [$c['id']]); try { chat_email_alert($c, 'WhatsApp from ' . $phone . ': ' . $text); } catch (Throwable $e) {} }
    if ($c['mode'] !== 'ai' || $type !== 'text' && $type !== 'button' && $type !== 'interactive') { if ($c['mode'] === 'ai') q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]); return; }
    $cnt = (int)q("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=? AND who='ai' AND t > ?", [$c['id'], date('Y-m-d H:i:s', time() - 86400)])->fetchColumn();
    $r = ($cfg['ai'] && $cnt < 40) ? chat_ai_reply($c) : '';
    if ($r !== '') {
        [$r, $human] = chat_ai_post($c, $r);
        $e = wa_text($phone, $r); if ($e !== '') { error_log('wa send: ' . $e); q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]); return; }
        chat_add((int)$c['id'], 'ai', 'Woodex assistant', $r);
        if ($human) q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]);
    } else {
        q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]);
        if ($new) { $g = chat_open_now() ? $cfg['waGreeting'] : $cfg['afterHours']; if (wa_text($phone, $g) === '') chat_add((int)$c['id'], 'ai', 'Auto reply', $g); }
    }
}
