<?php
/**
 * P39 Phase 4: Telegram webhook. Set automatically by Admin → Integrations → Telegram → Connect.
 * Telegram sends the secret in X-Telegram-Bot-Api-Secret-Token; anything else is refused.
 *  - Private chat with the bot  → customer conversation (AI first, team takes over in the Inbox)
 *  - /start c{id}_{sig}          → continue a website chat on Telegram
 *  - /start L{code}              → staff member links their Telegram account (My profile → Telegram)
 *  - Team group: /connect (Master/Manager) · reply to a customer message to answer · /ai · /close · /open
 */
declare(strict_types=1);
define('WX_LIB_ONLY', true);
require __DIR__ . '/admin.php';

if (!is_file(DB_FILE)) { http_response_code(503); exit('not installed'); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$tg = tg_cfg();
if ($tg['secret'] === '' || !hash_equals($tg['secret'], (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? ''))) { http_response_code(401); exit('bad secret'); }
$j = json_decode((string)file_get_contents('php://input'), true) ?: [];
http_response_code(200); header('Content-Type: application/json'); echo '{"ok":true}';
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

try {
    chat_migrate(); tg_map_migrate();
    q('CREATE TABLE IF NOT EXISTS wx_tg_seen (uid BIGINT PRIMARY KEY, t DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $upd = (int)($j['update_id'] ?? 0);
    if ($upd) { try { q('INSERT INTO wx_tg_seen (uid,t) VALUES (?,?)', [$upd, now()]); } catch (Throwable $e) { exit; } } // Telegram retries: handle once
    tg_update($j, $tg);
} catch (Throwable $e) { error_log('telegram: ' . $e->getMessage()); }
exit;

function tg_update(array $j, array $tg): void {
    // Quick-answer button tapped by a customer
    if (isset($j['callback_query'])) {
        $cq = $j['callback_query']; tg_api('answerCallbackQuery', ['callback_query_id' => (string)$cq['id']]);
        $chat = (string)($cq['message']['chat']['id'] ?? ''); $data = (string)($cq['data'] ?? '');
        if ($chat !== '' && str_starts_with($data, 'q:') && ($cq['message']['chat']['type'] ?? '') === 'private' && $tg['customers'])
            tg_incoming($chat, trim(($cq['from']['first_name'] ?? '') . ' ' . ($cq['from']['last_name'] ?? '')), substr($data, 2), (string)($cq['from']['username'] ?? ''));
        return;
    }
    // Bot removed from the team group
    if (isset($j['my_chat_member'])) {
        $m = $j['my_chat_member']; if ((string)($m['chat']['id'] ?? '') === $tg['group'] && in_array($m['new_chat_member']['status'] ?? '', ['left', 'kicked'], true)) { $tg['group'] = ''; $tg['groupTitle'] = ''; tg_save($tg); }
        return;
    }
    $m = $j['message'] ?? null; if (!$m) return;
    $chat = (string)($m['chat']['id'] ?? ''); $type = (string)($m['chat']['type'] ?? ''); $from = $m['from'] ?? [];
    $name = trim(($from['first_name'] ?? '') . ' ' . ($from['last_name'] ?? '')); $text = trim((string)($m['text'] ?? $m['caption'] ?? ''));
    if (!empty($from['is_bot'])) return;

    if ($type === 'private') {
        if (preg_match('~^/start(?:@\w+)?\s+L([A-F0-9]{6})$~', $text, $x)) { // staff account link
            $code = $x[1]; $c = tg_cfg(); $row = $c['codes'][$code] ?? null;
            if (!$row || (int)$row['exp'] < time()) { tg_send($chat, 'This link has expired. Open Admin → My profile → Telegram and try again.'); return; }
            unset($c['codes'][$code]); $c['links'][(string)$row['uid']] = (string)$from['id'];
            $c['dm'] = array_values(array_unique(array_merge(array_map('intval', (array)$c['dm']), [(int)$row['uid']]))); tg_save($c);
            tg_send($chat, "✅ Your Telegram is now linked to Woodex Admin.\nNew clients, leads and chats will arrive here. Reply to a chat message to answer the customer (/ai hands it back to the assistant, /close closes it)."); return;
        }
        $su = tg_user((int)($from['id'] ?? 0));
        if ($su) { // a linked staff member in their personal chat with the bot
            $re = $m['reply_to_message'] ?? null; $cid = $re ? (int)(tg_cfg()['dmMap'][$chat . ':' . (int)$re['message_id']] ?? 0) : 0;
            if ($cid) { tg_staff_reply($chat, $m, $su, $cid, $text, $name); return; }
            if (!preg_match('~^/start~', $text)) { tg_send($chat, 'Hi ' . $su['name'] . '! To answer a customer, swipe left on (reply to) their chat message here. New chats and leads arrive automatically.'); return; }
            return;
        }
        if (preg_match('~^/start(?:@\w+)?\s+(c\d+_[a-f0-9]{12})$~', $text, $x)) { if (tg_link_web_chat($chat, $x[1], $name)) return; }
        if (!$tg['customers']) { tg_send($chat, 'Please contact Woodex Interior on +92 322 4000768 or info@woodex.com.pk.'); return; }
        if (preg_match('~^/(start|help)\b~', $text)) {
            $cfg = chat_cfg(); $known = q("SELECT id FROM wx_chats WHERE channel='tg' AND ext=? LIMIT 1", [$chat])->fetch();
            if (!$known || str_starts_with($text, '/help')) { tg_send($chat, chat_open_now() ? $cfg['waGreeting'] : $cfg['afterHours'], tg_quick_kb()); return; }
            return;
        }
        if ($text === '') $text = '[' . (isset($m['photo']) ? 'photo' : (isset($m['voice']) ? 'voice note' : (isset($m['document']) ? 'file' : 'message'))) . ' received: open Telegram to view]';
        tg_incoming($chat, $name, $text, (string)($from['username'] ?? ''));
        return;
    }

    // ---- group / supergroup
    if ($type !== 'group' && $type !== 'supergroup') return;
    $u = tg_user((int)($from['id'] ?? 0));
    if (preg_match('~^/connect(?:@\w+)?$~', $text)) {
        if (!$u || !in_array($u['role'], ['owner', 'admin'], true)) { tg_send($chat, 'Only the Master or a Manager can connect this group. Link your Telegram first: Admin → My profile → Telegram.'); return; }
        $c = tg_cfg(); $c['group'] = $chat; $c['groupTitle'] = (string)($m['chat']['title'] ?? 'Team group'); tg_save($c); log_act($u, 'telegram.group', $c['groupTitle']);
        tg_send($chat, "✅ Connected. Customer chats and alerts from Woodex Admin will appear here.\nReply to a customer message to answer them. /ai gives the chat back to the assistant, /close closes it."); return;
    }
    if ($chat !== $tg['group']) return;
    $re = $m['reply_to_message'] ?? null; if (!$re) return;
    $row = q('SELECT chat_id FROM wx_tg_map WHERE msg_id=?', [(int)$re['message_id']])->fetch(); if (!$row) return;
    if (!$u) { tg_send($chat, '⚠️ ' . ($name ?: 'You') . ', link your Telegram first (Admin → My profile → Telegram), then reply again.', ['reply_to_message_id' => (int)$m['message_id']]); return; }
    tg_staff_reply($chat, $m, $u, (int)$row['chat_id'], $text, $name);
}
