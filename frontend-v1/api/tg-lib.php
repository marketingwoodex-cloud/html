<?php
/**
 * P39 Phase 4: Telegram channel (free Bot API, no library needed).
 *  - Customers chat with your bot → same Inbox + same AI agent as website chat and WhatsApp.
 *  - Fallback: when WhatsApp is not connected or failing, the website chat offers "Continue on Telegram"
 *    (same conversation, same lead).
 *  - Team group: every customer message is posted to your staff group. Staff reply by replying to the
 *    bot's message; /ai hands the chat back to the assistant, /close closes it.
 *  - Alerts: new leads, chats that need a person, approvals waiting.
 * Settings: _private/telegram.json. Webhook: api/telegram.php (secret header checked).
 */
const TG_FILE = PRIVATE_DIR . '/telegram.json';
const WA_HEALTH = PRIVATE_DIR . '/wa-health.json';
const TG_DEF = ['token' => '', 'bot' => '', 'botName' => '', 'secret' => '', 'group' => '', 'groupTitle' => '', 'customers' => true, 'button' => 'auto',
    'alertChats' => true, 'alertLeads' => true, 'alertAppr' => true, 'links' => [], 'codes' => [], 'dm' => [], 'dmMap' => [], 'site' => 'chat', 'tgUser' => '', 'alertPhone' => '923224200768', 'phoneAlerted' => [], 'connectedAt' => '', 'lastError' => ''];

function tg_cfg(): array { return array_merge(TG_DEF, jread(TG_FILE)); }
function tg_save(array $c): void { jwrite(TG_FILE, $c); }
function tg_ready(): bool { $c = tg_cfg(); return $c['token'] !== '' && $c['bot'] !== ''; }

/** Call the Bot API. Returns the decoded reply (['ok'=>false,'description'=>…] on errors). */
function tg_api(string $method, array $p = [], ?string $token = null): array {
    $token = $token ?? tg_cfg()['token']; if ($token === '') return ['ok' => false, 'description' => 'Telegram is not connected'];
    if (!function_exists('curl_init')) return ['ok' => false, 'description' => 'cURL missing'];
    $ch = curl_init('https://api.telegram.org/bot' . $token . '/' . $method);
    curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $r = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
    if ($r === false) return ['ok' => false, 'description' => 'Network: ' . $err];
    return json_decode((string)$r, true) ?: ['ok' => false, 'description' => 'Bad reply from Telegram'];
}
function tg_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
/** Send a message; returns ['', msgId] or [error, 0]. */
function tg_send(string $chat, string $text, array $extra = []): array {
    $r = tg_api('sendMessage', ['chat_id' => $chat, 'text' => mb_substr($text, 0, 4000), 'disable_web_page_preview' => true] + $extra);
    return !empty($r['ok']) ? ['', (int)($r['result']['message_id'] ?? 0)] : [(string)($r['description'] ?? 'Telegram send failed'), 0];
}
/** Customer quick-answer buttons (same list as the website chat). */
function tg_quick_kb(): array {
    $q = array_slice(chat_cfg()['quick'] ?? [], 0, 6); if (!$q) return [];
    $rows = []; foreach (array_chunk($q, 2) as $pair) $rows[] = array_map(fn($x) => ['text' => (string)$x['label'], 'callback_data' => 'q:' . mb_substr((string)$x['label'], 0, 40)], $pair);
    return ['reply_markup' => ['inline_keyboard' => $rows]];
}

/* ---------------------------------------------------------------- WhatsApp health → fallback */
function wa_mark(bool $ok, string $err = ''): void { $h = jread(WA_HEALTH); if ($ok) { $h['okAt'] = time(); } else { $h['failAt'] = time(); $h['err'] = mb_substr($err, 0, 200); } jwrite(WA_HEALTH, $h); }
/** WhatsApp is "down" when it is not connected, or the last send failed in the past 2 hours (and nothing worked since). */
function wa_down(): bool {
    $c = crm_cfg(); if (empty($c['waToken']) || empty($c['waPhoneId'])) return true;
    $h = jread(WA_HEALTH); $f = (int)($h['failAt'] ?? 0); return $f > time() - 7200 && $f > (int)($h['okAt'] ?? 0);
}
/** Should the website chat show the Telegram button? */
function tg_button_on(): bool { $c = tg_cfg(); if (!tg_ready() || !$c['customers']) return false; return $c['button'] === 'always' || ($c['button'] === 'auto' && wa_down()); }
/** Deep link that continues a website chat on Telegram (signed so nobody can hijack another chat). */
function tg_chat_link(int $chatId): string { $c = tg_cfg(); return 'https://t.me/' . $c['bot'] . '?start=c' . $chatId . '_' . substr(hash_hmac('sha256', 'c' . $chatId, $c['secret']), 0, 12); }

/* ---------------------------------------------------------------- Deliver a team reply to any channel */
/** Returns '' on success or an error. Website chats need nothing (the visitor polls). */
function chat_deliver(array $c, string $text): string {
    $ch = $c['channel'] ?? 'web';
    if ($ch === 'wa') { $e = wa_text((string)$c['phone'], $text); return $e === '' ? '' : 'WhatsApp: ' . $e . (stripos($e, '24') !== false || stripos($e, 're-engagement') !== false ? ' (customer must message you first; 24-hour window)' : ''); }
    if ($ch === 'tg') { if (empty($c['ext'])) return 'Telegram chat id missing'; [$e] = tg_send((string)$c['ext'], $text); return $e === '' ? '' : 'Telegram: ' . $e; }
    return '';
}

/* ---------------------------------------------------------------- Team group + alerts */
function tg_map_migrate(): void { static $d = false; if ($d) return; $d = true; q('CREATE TABLE IF NOT EXISTS wx_tg_map (msg_id BIGINT NOT NULL, chat_id INT NOT NULL, t DATETIME NOT NULL, PRIMARY KEY(msg_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'); }
function tg_chan_label(string $ch): string { return ['wa' => 'WhatsApp', 'tg' => 'Telegram'][$ch] ?? 'Website'; }
/** Post a customer message to the staff group (reply to it to answer). */
function tg_team_post(array $c, string $text, string $tag = ''): void {
    try { tg_phone_alert($c, $text, $tag); } catch (Throwable $x) { error_log('phone alert: ' . $x->getMessage()); }
    $g = tg_cfg(); if (!tg_ready() || !$g['alertChats'] || ($g['group'] === '' && !tg_dm_targets($g))) return;
    $who = (string)($c['name'] ?: ($c['phone'] ?: 'Visitor #' . $c['id']));
    $msg = ($tag !== '' ? $tag . "\n" : '') . '💬 <b>' . tg_h($who) . '</b> · ' . tg_chan_label((string)($c['channel'] ?? 'web')) . ' · #' . (int)$c['id'] . ($c['mode'] === 'ai' ? ' · 🤖 AI answering' : '') . "\n" . tg_h(mb_substr($text, 0, 1500)) . "\n\n<i>Reply to this message to answer · /ai · /close</i>";
    if ($g['group'] !== '') { try { [$e, $mid] = tg_send($g['group'], $msg, ['parse_mode' => 'HTML']); if ($e === '' && $mid) { tg_map_migrate(); q('REPLACE INTO wx_tg_map (msg_id,chat_id,t) VALUES (?,?,?)', [$mid, (int)$c['id'], now()]); } }
    catch (Throwable $x) { error_log('tg team: ' . $x->getMessage()); } }
    tg_dm_post($msg, (int)$c['id']);
}
/** Short alert to the staff group (kind: leads | appr). */
function tg_alert(string $kind, string $text): void {
    $g = tg_cfg(); if (!tg_ready()) return;
    if (($kind === 'leads' && !$g['alertLeads']) || ($kind === 'appr' && !$g['alertAppr'])) return;
    if ($g['group'] !== '') { try { tg_send($g['group'], $text, ['parse_mode' => 'HTML']); } catch (Throwable $x) { error_log('tg alert: ' . $x->getMessage()); } }
    tg_dm_post($text, 0);
}
/** WhatsApp alert to the live-chat alert phone: once per new chat, and again when the customer asks for a person. */
function tg_phone_alert(array $c, string $text, string $tag): void {
    $g = tg_cfg(); $to = preg_replace('~\D~', '', (string)$g['alertPhone']); if ($to === '' || !function_exists('crm_cfg') || !function_exists('wa_send')) return;
    $cid = (int)$c['id']; $key = $cid . ($tag !== '' ? ':p' : ''); $done = (array)$g['phoneAlerted']; if (isset($done[$key])) return;
    $crm = crm_cfg(); if (empty($crm['waToken']) || empty($crm['waPhoneId'])) return;
    $who = (string)($c['name'] ?: ($c['phone'] ?: 'Visitor #' . $cid));
    $l = ['id' => $cid, 'name' => $who, 'phone' => (string)($c['phone'] ?? ''), 'source' => 'chat', 'service' => 'Live chat', 'message' => $text];
    $msg = ($tag !== '' ? '🙋 Needs a person' : '💬 New live chat') . ' · ' . tg_chan_label((string)($c['channel'] ?? 'web')) . ' · #' . $cid . "\n" . $who . ': ' . mb_substr($text, 0, 500) . "\n\nReply in Admin → Inbox or on Telegram.";
    wa_send($crm, $to, $l, $msg);
    $g = tg_cfg(); $done[$key] = time(); $g['phoneAlerted'] = array_slice($done, -300, null, true); tg_save($g);
}
/** Staff who chose "Send alerts to my Telegram" (linked by QR). Returns Telegram user ids. */
function tg_dm_targets(array $g): array {
    $o = []; foreach ((array)$g['dm'] as $uid) { $t = (string)($g['links'][(string)$uid] ?? ''); if ($t !== '') $o[] = $t; } return array_values(array_unique($o));
}
/** Send an alert to each personal Telegram; remember chat messages so a reply there answers the customer. */
function tg_dm_post(string $msg, int $chatId): void {
    $g = tg_cfg(); $T = tg_dm_targets($g); if (!$T) return; $map = (array)$g['dmMap']; $hit = false;
    foreach ($T as $t) { try { [$e, $mid] = tg_send($t, $msg, ['parse_mode' => 'HTML']); if ($e === '' && $mid && $chatId) { $map[$t . ':' . $mid] = $chatId; $hit = true; } } catch (Throwable $x) { error_log('tg dm: ' . $x->getMessage()); } }
    if ($hit) { $g = tg_cfg(); $g['dmMap'] = array_slice($map, -400, null, true); tg_save($g); }
}
/** A staff member replied (team group or personal chat) to a customer message. */
function tg_staff_reply(string $chat, array $m, array $u, int $cid, string $text, string $name): void {
    if (!tg_can_chat($u)) { tg_send($chat, '⚠️ Your role cannot reply to customers.', ['reply_to_message_id' => (int)$m['message_id']]); return; }
    $c = chat_get($cid);
    if (preg_match('~^/ai\b~', $text)) { q("UPDATE wx_chats SET mode='ai', agent_name=NULL WHERE id=?", [$cid]); chat_add($cid, 'sys', '', 'The assistant is back in this chat'); tg_send($chat, '🤖 #' . $cid . ' is back with the assistant.'); return; }
    if (preg_match('~^/close\b~', $text)) { q("UPDATE wx_chats SET status='closed', unread=0, needs=0 WHERE id=?", [$cid]); log_act($u, 'chat.close', '#' . $cid . ' (Telegram)'); tg_send($chat, '✔️ #' . $cid . ' closed.'); return; }
    if (preg_match('~^/open\b~', $text)) { q("UPDATE wx_chats SET status='open' WHERE id=?", [$cid]); tg_send($chat, '#' . $cid . ' reopened.'); return; }
    if ($text === '' || $text[0] === '/') return;
    if ($c['mode'] === 'ai') chat_add($cid, 'sys', '', $u['name'] . ' joined the chat');
    $e = chat_deliver($c, $text);
    if ($e !== '') { tg_send($chat, '❌ Not delivered: ' . $e, ['reply_to_message_id' => (int)$m['message_id']]); return; }
    chat_add($cid, 'agent', (string)$u['name'], $text);
    q("UPDATE wx_chats SET mode='human', handoff='', agent_name=?, assigned_to=COALESCE(assigned_to, ?), status='open', unread=0, needs=0 WHERE id=?", [$u['name'], (int)$u['id'], $cid]);
    tg_api('setMessageReaction', ['chat_id' => $chat, 'message_id' => (int)$m['message_id'], 'reaction' => [['type' => 'emoji', 'emoji' => '👍']]]);
}
/** Which single contact button the website shows: chat | whatsapp | telegram (with automatic fallbacks). */
function tg_site_mode(bool $chatOn): array {
    $c = tg_cfg(); $m = in_array($c['site'], ['chat', 'whatsapp', 'telegram'], true) ? $c['site'] : 'chat';
    $tgLink = tg_ready() && $c['customers'] ? 'https://t.me/' . $c['bot'] : ($c['tgUser'] !== '' ? 'https://t.me/' . $c['tgUser'] : '');
    if ($m === 'telegram' && $tgLink === '') $m = 'chat';
    if ($m === 'whatsapp' && wa_down() && $tgLink !== '') $m = 'telegram';
    if ($m === 'chat' && !$chatOn) $m = 'whatsapp';
    return ['mode' => $m, 'tgLink' => $tgLink, 'tgBot' => tg_ready() && $c['customers']];
}

/** Which admin user is this Telegram account? (linked from My profile → Telegram) */
function tg_user(int $tgUid): ?array {
    $c = tg_cfg(); $uid = array_search((string)$tgUid, array_map('strval', (array)$c['links']), true); if ($uid === false) return null;
    $u = q('SELECT * FROM wx_users WHERE id=? AND active=1', [(int)$uid])->fetch(); return $u ?: null;
}
function tg_can_chat(array $u): bool { return in_array('conversations', array_merge(wx_role_groups((string)$u['role']), wx_user_perms($u)), true); }

/* ---------------------------------------------------------------- Incoming customer message (private chat with the bot) */
function tg_incoming(string $tgChat, string $name, string $text, string $username = ''): void {
    chat_migrate(); $cfg = chat_cfg(); $text = trim($text); if ($text === '') return;
    $c = q("SELECT * FROM wx_chats WHERE channel='tg' AND ext=? ORDER BY id DESC LIMIT 1", [$tgChat])->fetch(); $new = !$c;
    if ($new) {
        q("INSERT INTO wx_chats (token,created_at,updated_at,name,page,ip,channel,ext) VALUES (?,?,?,?,?,?,'tg',?)", [hash('sha256', bin2hex(random_bytes(20))), now(), now(), $name !== '' ? mb_substr($name, 0, 120) : null, 'Telegram' . ($username !== '' ? ' @' . $username : ''), 'telegram', $tgChat]);
        $c = chat_get((int)db()->lastInsertId());
    } elseif ($c['status'] !== 'open') { q("UPDATE wx_chats SET status='open' WHERE id=?", [$c['id']]); $c['status'] = 'open'; }
    chat_add((int)$c['id'], 'visitor', (string)$c['name'], $text);
    $c = chat_capture(chat_get((int)$c['id']), $text);
    if ($new && $c['lead_id']) try { q("UPDATE wx_leads SET source='telegram' WHERE id=?", [$c['lead_id']]); } catch (Throwable $e) {}
    if (!(int)$c['alerted']) { q('UPDATE wx_chats SET alerted=1 WHERE id=?', [$c['id']]); try { chat_email_alert($c, 'Telegram from ' . ($name ?: $tgChat) . ': ' . $text); } catch (Throwable $e) {} }
    if ($c['mode'] !== 'ai') return;
    $cnt = (int)q("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=? AND who='ai' AND t > ?", [$c['id'], date('Y-m-d H:i:s', time() - 86400)])->fetchColumn();
    $r = ($cfg['ai'] && $cnt < 40) ? chat_ai_reply($c) : '';
    if ($r === '' && $cnt < 40) $r = chat_rule_reply($c, $text);
    $human = false;
    if ($r !== '') [$r, $human] = chat_ai_post($c, $r);
    else { $r = $new ? (chat_open_now() ? $cfg['waGreeting'] : $cfg['afterHours']) : ''; $human = true; }
    if ($r !== '') { [$e] = tg_send($tgChat, $r, $new ? tg_quick_kb() : []); if ($e === '') chat_add((int)$c['id'], 'ai', 'Woodex assistant', $r); else $human = true; }
    if ($human) q('UPDATE wx_chats SET needs=1 WHERE id=?', [$c['id']]);
}

/** Customer opened t.me/bot?start=c{id}_{sig}: move that website chat onto Telegram (same thread). */
function tg_link_web_chat(string $tgChat, string $payload, string $name): bool {
    if (!preg_match('~^c(\d+)_([a-f0-9]{12})$~', $payload, $m)) return false;
    $cfg = tg_cfg(); if (!hash_equals(substr(hash_hmac('sha256', 'c' . $m[1], $cfg['secret']), 0, 12), $m[2])) return false;
    chat_migrate(); $c = q('SELECT * FROM wx_chats WHERE id=?', [(int)$m[1]])->fetch(); if (!$c) return false;
    q("UPDATE wx_chats SET channel='tg', ext=?, status='open', name=COALESCE(name, ?) WHERE id=?", [$tgChat, $name !== '' ? mb_substr($name, 0, 120) : null, $c['id']]);
    chat_add((int)$c['id'], 'sys', '', 'The customer moved this chat to Telegram');
    tg_send($tgChat, 'Thank you. Your chat with Woodex Interior continues here. A designer will reply shortly; you can keep writing.', tg_quick_kb());
    return true;
}

/* ---------------------------------------------------------------- Admin actions: tg_* */
function tg_pub(array $c): array {
    $o = $c; unset($o['token'], $o['secret'], $o['codes']); $o['tokenSet'] = $c['token'] !== ''; $o['linked'] = count((array)$c['links']); $o['dmCount'] = count(tg_dm_targets($c)); unset($o['dmMap'], $o['links'], $o['phoneAlerted']);
    $o['webhook'] = (isset($_SERVER['HTTP_HOST']) ? 'https://' . $_SERVER['HTTP_HOST'] : SITE) . '/api/telegram.php'; $o['waDown'] = wa_down(); $o['buttonLive'] = tg_button_on();
    return $o;
}
function tg_actions(string $action, array $in): bool {
    if (!preg_match('~^tg_~', $action)) return false;
    switch ($action) {
        case 'tg_get':
            $u = need(['owner', 'admin', 'editor']); $c = tg_cfg(); out(['ok' => true, 'cfg' => tg_pub($c), 'me' => isset($c['links'][(string)$u['id']]), 'meDm' => in_array((int)$u['id'], array_map('intval', (array)$c['dm']), true)]);
        case 'tg_save':
            $u = need(['owner', 'admin', 'editor']); $c = tg_cfg();
            foreach (['customers', 'alertChats', 'alertLeads', 'alertAppr'] as $k) if (array_key_exists($k, $in)) $c[$k] = !empty($in[$k]);
            if (isset($in['button']) && in_array($in['button'], ['auto', 'always', 'off'], true)) $c['button'] = $in['button'];
            if (isset($in['site']) && in_array($in['site'], ['chat', 'whatsapp', 'telegram'], true)) $c['site'] = $in['site'];
            if (isset($in['alertPhone'])) { $ap = preg_replace('~\D~', '', (string)$in['alertPhone']); if (str_starts_with($ap, '0')) $ap = '92' . substr($ap, 1); if ($ap !== '' && !preg_match('~^92\d{10}$~', $ap)) fail('Alert phone: use a Pakistani mobile like +92 322 4200768'); $c['alertPhone'] = $ap; }
            if (isset($in['tgUser'])) { $tu = ltrim(trim((string)$in['tgUser']), '@'); $tu = preg_replace('~^https?://t\.me/~i', '', $tu); if ($tu !== '' && !preg_match('~^[A-Za-z0-9_]{5,32}$~', $tu)) fail('Telegram username: 5-32 letters, numbers or _'); $c['tgUser'] = $tu; }
            tg_save($c); log_act($u, 'telegram.settings'); out(['ok' => true, 'cfg' => tg_pub($c)]);
        case 'tg_connect': // check the BotFather token, then point Telegram at our webhook
            $u = need(['owner', 'admin', 'editor']); $tok = trim((string)($in['token'] ?? '')); $c = tg_cfg(); if ($tok === '') $tok = $c['token'];
            if (!preg_match('~^\d{5,15}:[A-Za-z0-9_-]{30,60}$~', $tok)) fail('That does not look like a bot token. Copy it from @BotFather (looks like 123456789:AA…).');
            $me = tg_api('getMe', [], $tok); if (empty($me['ok'])) fail('Telegram refused the token: ' . ($me['description'] ?? 'unknown error'));
            if ($c['secret'] === '') $c['secret'] = bin2hex(random_bytes(16));
            $hook = (isset($_SERVER['HTTP_HOST']) ? 'https://' . $_SERVER['HTTP_HOST'] : SITE) . '/api/telegram.php';
            $w = tg_api('setWebhook', ['url' => $hook, 'secret_token' => $c['secret'], 'allowed_updates' => ['message', 'callback_query', 'my_chat_member'], 'drop_pending_updates' => true], $tok);
            if (empty($w['ok'])) fail('Webhook not set: ' . ($w['description'] ?? 'unknown error') . '. The site must be on https.');
            tg_api('setMyCommands', ['commands' => [['command' => 'start', 'description' => 'Start a chat with Woodex Interior'], ['command' => 'help', 'description' => 'What can I ask?']]], $tok);
            $c['token'] = $tok; $c['bot'] = (string)$me['result']['username']; $c['botName'] = (string)$me['result']['first_name']; $c['connectedAt'] = now(); $c['lastError'] = '';
            tg_save($c); log_act($u, 'telegram.connect', '@' . $c['bot']); out(['ok' => true, 'cfg' => tg_pub($c)]);
        case 'tg_disconnect':
            $u = need(['owner', 'admin']); $c = tg_cfg(); if ($c['token'] !== '') tg_api('deleteWebhook', [], $c['token']);
            $c['token'] = ''; $c['bot'] = ''; $c['group'] = ''; $c['groupTitle'] = ''; tg_save($c); log_act($u, 'telegram.disconnect'); out(['ok' => true, 'cfg' => tg_pub($c)]);
        case 'tg_test':
            need(['owner', 'admin', 'editor']); $c = tg_cfg(); if ($c['group'] === '') fail('Connect a team group first: add the bot to your group and send /connect there.');
            [$e] = tg_send($c['group'], '✅ Woodex Admin test message. Team alerts and customer chats will appear here.'); if ($e !== '') fail($e); out(['ok' => true]);
        case 'tg_link_code': // any signed-in user: link my Telegram account (for replying from the team group)
            $u = need(); $c = tg_cfg(); if (!tg_ready()) fail('Telegram is not connected yet (Integrations → Telegram).');
            foreach ((array)$c['codes'] as $k => $v) if ((int)($v['exp'] ?? 0) < time()) unset($c['codes'][$k]);
            $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)); $c['codes'][$code] = ['uid' => (int)$u['id'], 'exp' => time() + 900]; tg_save($c);
            out(['ok' => true, 'code' => $code, 'link' => 'https://t.me/' . $c['bot'] . '?start=L' . $code, 'linked' => isset($c['links'][(string)$u['id']])]);
        case 'tg_test_me': // QR check: send a text to my own Telegram
            $u = need(); $c = tg_cfg(); $t = (string)($c['links'][(string)$u['id']] ?? ''); if ($t === '') fail('Scan the QR code first to link your Telegram');
            [$e] = tg_send($t, '✅ Hello ' . $u['name'] . '! Woodex Admin is connected to your Telegram. New clients and chats will arrive here. Reply to a chat message to answer the customer.'); if ($e !== '') fail($e); out(['ok' => true]);
        case 'tg_dm_set': // receive alerts on my personal Telegram
            $u = need(); $c = tg_cfg(); $uid = (int)$u['id']; $L = array_values(array_filter(array_map('intval', (array)$c['dm']), fn($x) => $x !== $uid));
            if (!empty($in['on'])) { if (!isset($c['links'][(string)$uid])) fail('Scan the QR code first to link your Telegram'); $L[] = $uid; }
            $c['dm'] = $L; tg_save($c); out(['ok' => true, 'on' => !empty($in['on'])]);
        case 'tg_unlink':
            $u = need(); $c = tg_cfg(); unset($c['links'][(string)$u['id']]); $c['dm'] = array_values(array_filter(array_map('intval', (array)$c['dm']), fn($x) => $x !== (int)$u['id'])); tg_save($c); out(['ok' => true]);
    }
    return false;
}
