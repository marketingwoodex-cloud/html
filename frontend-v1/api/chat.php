<?php
/**
 * Live chat — visitor endpoint (Phase 10). POST JSON {action: cfg|send|poll, chat_id, token, text, page, name}
 * The visitor keeps {chat_id, token} in localStorage; only the SHA-256 of the token is stored.
 */
declare(strict_types=1);
define('WX_LIB_ONLY', true);
require __DIR__ . '/admin.php';

$in = json_decode((string)file_get_contents('php://input'), true) ?: [];
$act = (string)($in['action'] ?? 'cfg');
if (!is_file(DB_FILE)) out(['ok' => true, 'on' => false]);
$cfg = chat_cfg();
@set_time_limit(60);
try {
chat_migrate();
if ($act === 'cfg') out(['ok' => true, 'on' => (bool)$cfg['on'], 'greeting' => $cfg['greeting'], 'hours' => $cfg['hours'], 'open' => chat_open_now(), 'ai' => (bool)$cfg['ai'], 'quick' => array_map(fn($x) => ['label' => $x['label'], 'text' => $x['text']], array_slice((array)$cfg['quick'], 0, 6)), 'assistant' => (function () { if (!function_exists('aic_cfg') && is_file(__DIR__ . '/ai-center-lib.php')) require_once __DIR__ . '/ai-center-lib.php'; if (!function_exists('aic_cfg')) return null; try { $p = aic_cfg()['persona']; } catch (Throwable $e) { return null; } return trim((string)$p['name']) !== '' ? ['name' => (string)$p['name'], 'role' => (string)$p['role']] : null; })(), 'tg' => tg_button_on() ? ['bot' => tg_cfg()['bot'], 'waDown' => wa_down()] : null, 'site' => tg_site_mode((bool)$cfg['on'])]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
if (!$cfg['on']) fail('Chat is offline', 403);

function vchat(array $in): array {
    $id = (int)($in['chat_id'] ?? 0); $t = (string)($in['token'] ?? '');
    if (!$id || !preg_match('~^[a-f0-9]{40}$~', $t)) fail('Chat not found', 404);
    $c = q('SELECT * FROM wx_chats WHERE id=?', [$id])->fetch();
    if (!$c || !hash_equals($c['token'], hash('sha256', $t))) fail('Chat not found', 404);
    return $c;
}
function vpub(array $c, int $since): array { return ['ok' => true, 'chat_id' => (int)$c['id'], 'mode' => $c['mode'], 'agent' => (string)$c['agent_name'], 'status' => $c['status'], 'messages' => chat_msgs((int)$c['id'], $since), 'typing' => chat_recent($c['atype'] ?? null)]; }
function vlimit(int $max, int $win): void { // per-IP message limit (wx_throttle, key "c|ip")
    $k = 'c|' . substr(ip(), 0, 60); $r = q('SELECT n,t FROM wx_throttle WHERE ip=?', [$k])->fetch();
    $n = ($r && time() - (int)$r['t'] < $win) ? (int)$r['n'] + 1 : 1; if ($n > $max) fail('You are sending messages too fast. Please wait a few minutes.', 429);
    q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,?,?)', [$k, $n, $n === 1 ? time() : (int)$r['t']]);
}

switch ($act) {
    case 'tglink': // P39: continue this chat on Telegram (signed deep link)
        $c = vchat($in); if (!tg_ready() || !tg_cfg()['customers']) fail('Telegram is not available', 404); out(['ok' => true, 'link' => tg_chat_link((int)$c['id'])]);
    case 'poll':
        $c = vchat($in); out(vpub($c, (int)($in['since'] ?? 0)));
    case 'typing': // P18 D
        $c = vchat($in); q('UPDATE wx_chats SET vtype=? WHERE id=?', [now(), $c['id']]); out(['ok' => true]);
    case 'file': // P18 D: photo / PDF / voice note from the visitor (chat must already exist)
        $c = vchat($in); vlimit(40, 900);
        $att = chat_save_att((string)($in['data'] ?? ''), (string)($in['name'] ?? ''), !empty($in['voice']));
        if ($c['status'] === 'closed') q("UPDATE wx_chats SET status='open' WHERE id=?", [$c['id']]);
        chat_add((int)$c['id'], 'visitor', (string)$c['name'], chat_att_text($att), $att);
        q('UPDATE wx_chats SET needs=1, vtype=NULL WHERE id=?', [$c['id']]);
        $c = q('SELECT * FROM wx_chats WHERE id=?', [$c['id']])->fetch(); out(vpub($c, (int)($in['since'] ?? 0)));
    case 'send':
        $text = trim(mb_substr((string)($in['text'] ?? ''), 0, 2000)); if ($text === '') fail('Write a message');
        if (clip($in['_hp'] ?? '') !== '') out(['ok' => true, 'messages' => []]);
        vlimit(40, 900); $token = null; $new = false;
        if (!empty($in['chat_id'])) $c = vchat($in);
        else {
            $token = bin2hex(random_bytes(20)); $page = mb_substr(preg_replace('~[^\w/\-.?=&%]~u', '', (string)($in['page'] ?? '/')), 0, 200) ?: '/';
            q('INSERT INTO wx_chats (token,created_at,updated_at,page,ip,name) VALUES (?,?,?,?,?,?)', [hash('sha256', $token), now(), now(), $page, ip(), clip($in['name'] ?? '', 120) ?: null]);
            $c = q('SELECT * FROM wx_chats WHERE id=?', [(int)db()->lastInsertId()])->fetch(); $new = true;
            chat_add((int)$c['id'], 'ai', 'Woodex assistant', $cfg['greeting']);
        }
        if ($c['status'] === 'closed') { q("UPDATE wx_chats SET status='open' WHERE id=?", [$c['id']]); $c['status'] = 'open'; }
        $since = (int)($in['since'] ?? 0);
        chat_add((int)$c['id'], 'visitor', (string)$c['name'], $text);
        $c = chat_capture(q('SELECT * FROM wx_chats WHERE id=?', [$c['id']])->fetch(), $text);
        if (!(int)$c['alerted']) { q('UPDATE wx_chats SET alerted=1 WHERE id=?', [$c['id']]); try { chat_email_alert($c, $text); } catch (Throwable $e) { error_log('chat alert: ' . $e->getMessage()); } }
        if ($c['mode'] === 'ai') {
            $cnt = (int)q("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=? AND who='ai'", [$c['id']])->fetchColumn();
            $r = $cnt < 40 ? chat_ai_reply($c) : '';
            if ($r === '' && $cnt < 40) { $r = chat_rule_reply($c, $text); if ($r === '' && function_exists('aia_unans')) aia_unans((int)$c['id'], $text); } // P19 B1: never go silent when AI is off/down
            if ($r !== '') {
                [$r, $human] = chat_ai_post($c, $r);
                chat_add((int)$c['id'], 'ai', 'Woodex assistant', $r);
                if ($human) q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]);
            } elseif (!(int)q("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=? AND who='sys'", [$c['id']])->fetchColumn()) {
                chat_add((int)$c['id'], 'sys', '', chat_open_now() ? 'Thanks! A team member will reply here in a few minutes. You can also leave your phone number and we will call you.' : $cfg['afterHours']);
                q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]);
            }
        }
        $c = q('SELECT * FROM wx_chats WHERE id=?', [$c['id']])->fetch();
        out(vpub($c, $new ? 0 : $since) + ($token ? ['token' => $token] : []));
}
fail('Unknown action', 404);
} catch (Throwable $e) { error_log('chat: ' . $e->getMessage()); fail('Chat is not available right now', 500); }
