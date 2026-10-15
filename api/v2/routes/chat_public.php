<?php
/**
 * api/v2/routes/chat_public.php — the visitor's side of the conversation.
 *
 * This is the port of `frontend-v1/api/chat.php`: the five calls the website widget makes, with no
 * session behind them. Five endpoints, and every one of them is a door into the building, so each gets
 * the same treatment as the booking form — a token the visitor cannot forge, a per-IP limit, a
 * honeypot, and a refusal to touch anything that is not theirs.
 *
 * **The token.** A visitor keeps `{chat_id, token}` in localStorage. Only `sha256(token)` is stored, and
 * the check is `hash_equals` against the stored hash — a timing-safe compare, because a token compare
 * that leaks length is the kind of detail that turns into a support ticket nobody can reproduce. The
 * token is 20 random bytes, in the same 40-hex shape v2.1 issued, so a visitor who is mid-conversation
 * when the switch is thrown keeps their thread: same table, same hashing, same format.
 *
 * **What is deliberately not here.** v2.1's endpoint called `chat_migrate()` on every request (creating
 * columns with a try/catch), greeted visitors with the AI centre's persona, offered a Telegram hand-off,
 * and asked an AI provider for a reply. The migration is 007 now; the persona, the Telegram link and the
 * model call belong to Phase 4 (the AI centre) and Phase 5 (channels) and are absent rather than faked —
 * `assistant` and `tg` in the config come back `null`, and a question the rules cannot answer becomes a
 * person's job instead of an error. The widget's contract does not change when they arrive: the keys are
 * already in the response, empty.
 *
 * **The ladder.** mode=ai → the saved answers and the bilingual rules → and if nothing matches, the
 * visitor is told a person will reply and the conversation is flagged `needs`. Never silence, and never
 * an assistant that pretends to be a person. A rules answer that ends in `[HUMAN]` means "this one needs
 * someone" — the marker is stripped before the visitor sees it and the flag is set.
 */

declare(strict_types=1);

/** GET /chat/config — what the widget asks before it draws itself. Safe with no token: it is a greeting. */
function wx_route_chat_cfg(array $ctx): array
{
    $c = wx_chat_cfg();
    if (empty($c['on'])) {
        return ['data' => ['on' => false]];
    }
    $quick = [];
    foreach (array_slice((array) $c['quick'], 0, 6) as $q) {
        $quick[] = ['label' => (string) ($q['label'] ?? ''), 'text' => (string) ($q['text'] ?? '')];
    }
    return ['data' => [
        'on' => true,
        'greeting' => (string) $c['greeting'],
        'hours' => (string) $c['hours'],
        'open' => wx_chat_open_now(),
        'ai' => !empty($c['ai']),
        'quick' => $quick,
        /* Phase 4 fills these in. `null` is not a placeholder: it is the truth today, and the widget
           hides the name badge and the Telegram button when it sees null. */
        'assistant' => null,
        'tg' => null,
        'site' => (string) ($c['siteMode'] ?? '') === 'coming_soon' ? 'coming_soon' : 'live',
    ]];
}

/**
 * The token check every visitor call starts with.
 *
 * A chat that is not yours is a 404, not a 403: telling a stranger that chat 41 exists but is not theirs
 * has told them the id of a conversation to probe. `channel` is not consulted — a chat created by
 * WhatsApp or Telegram has no token, so it can never be read through this door.
 */
function wx_chat_vchat(array $body): array
{
    $id = (int) ($body['chat_id'] ?? 0);
    $token = (string) ($body['token'] ?? '');
    if ($id <= 0 || !preg_match('~^[a-f0-9]{40}$~', $token)) {
        throw ApiError::notFound('Chat not found');
    }
    $c = wx_one('SELECT * FROM wx_chats WHERE id = ?', [$id]);
    if ($c === null || (string) ($c['token'] ?? '') === ''
        || !hash_equals((string) $c['token'], hash('sha256', $token))) {
        throw ApiError::notFound('Chat not found');
    }
    return $c;
}

/** The visitor's view of their own thread: no ids of other people, no internal notes, no tags. */
function wx_chat_visitor_view(array $c, int $since): array
{
    return [
        'chat_id' => (int) $c['id'],
        'mode' => (string) $c['mode'],
        'agent' => (string) ($c['agent_name'] ?? ''),
        'status' => (string) $c['status'],
        'messages' => wx_chat_msgs((int) $c['id'], $since, false),
        'typing' => wx_chat_recent($c['atype'] ?? null),
    ];
}

/** POST /chat/send — a message from the visitor, and possibly the whole first contact of a new chat. */
function wx_route_chat_send(array $ctx): array
{
    $c = wx_chat_cfg();
    $b = $ctx['body'];
    if (empty($c['on'])) {
        throw new ApiError('NOT_FOUND', 'Chat is not available at the moment', 403);
    }
    /* Honeypot, answered exactly like a success — telling a bot it was detected teaches the bot. */
    if (trim((string) ($b['_hp'] ?? '')) !== '') {
        return ['data' => ['ok' => true, 'messages' => []]];
    }
    $text = mb_substr(trim((string) ($b['text'] ?? '')), 0, 2000);
    if ($text === '') {
        throw ApiError::validation('Write a message', 'text');
    }
    wx_rate('c|' . wx_ip(), 40, 900, 'You are sending messages too fast — please wait a few minutes');

    $token = null;
    $isNew = false;
    if ((int) ($b['chat_id'] ?? 0) > 0) {
        $row = wx_chat_vchat($b);
    } else {
        $token = bin2hex(random_bytes(20));
        $page = mb_substr((string) preg_replace('~[^\w/\-.?=&%]~u', '', (string) ($b['page'] ?? '/')), 0, 200);
        $id = wx_insert('wx_chats', [
            'token' => hash('sha256', $token),
            'created_at' => wx_now(),
            'updated_at' => wx_now(),
            'page' => $page !== '' ? $page : '/',
            'ip' => wx_ip(),
            'name' => mb_substr(trim((string) ($b['name'] ?? '')), 0, 120) ?: null,
        ]);
        $row = wx_chat_or_404($id);
        $isNew = true;
        /* The greeting is a message, not a banner: it is in the transcript so that a person reading the
           inbox later sees the conversation the visitor actually had. */
        wx_chat_add($id, 'ai', 'Woodex assistant', (string) $c['greeting']);
    }

    $since = (int) ($b['since'] ?? 0);
    if ((string) $row['status'] === 'closed') {
        /* A visitor who writes again has reopened the conversation. Anything else would swallow the
           message into a thread nobody is watching. */
        wx_update('wx_chats', ['status' => 'open'], ['id' => (int) $row['id']]);
        $row['status'] = 'open';
    }
    $sentAt = wx_now();
    wx_chat_add((int) $row['id'], 'visitor', (string) ($row['name'] ?? ''), $text);
    /* The unread badge and the answer to "is anyone waiting" are one update: the visitor's message is
       the thing they are waiting about. */
    wx_update('wx_chats', ['updated_at' => $sentAt, 'unread' => (int) $row['unread'] + 1], ['id' => (int) $row['id']]);
    $row['unread'] = (int) $row['unread'] + 1;

    $row = wx_chat_capture($row, $text);
    if (empty($row['alerted'])) {
        wx_update('wx_chats', ['alerted' => 1], ['id' => (int) $row['id']]);
        $row['alerted'] = 1;
        wx_chat_alert($row, $text);
    }

    if ((string) $row['mode'] === 'ai') {
        wx_chat_answer($row, $text);
    } else {
        /* mode=human: a person is handling this one, so nothing automatic is said. The flag is what puts
           it in front of them. */
        wx_update('wx_chats', ['needs' => 1], ['id' => (int) $row['id']]);
    }

    $row = wx_chat_or_404((int) $row['id']);
    $out = wx_chat_visitor_view($row, $isNew ? 0 : $since);
    if ($token !== null) {
        $out['token'] = $token;
    }
    return ['data' => $out];
}

/**
 * The assistant's turn: the ladder of answers, ending in a person.
 *
 * `chat.cfg.ai` off means the assistant is not answering at all — not that it says something wrong. The
 * visitor gets a human promise immediately and the conversation is flagged.
 */
function wx_chat_answer(array $c, string $text): void
{
    $cfg = wx_chat_cfg();
    $chatId = (int) $c['id'];
    if (empty($cfg['ai'])) {
        wx_chat_handover($chatId, $cfg);
        return;
    }
    /* A ceiling on how much the assistant will say before a person takes over. v2.1 used forty messages;
       the reason for any ceiling is the same: a conversation going in circles is a person's problem. */
    $said = (int) wx_val("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id = ? AND who = 'ai'", [$chatId]);
    $reply = $said < 40 ? wx_chat_rule_reply($c, $text) : '';
    if ($reply !== '') {
        $human = false;
        if (str_contains($reply, '[HUMAN]')) {
            $reply = trim(str_replace('[HUMAN]', '', $reply));
            $human = true;
        }
        if ($reply !== '') {
            wx_chat_add($chatId, 'ai', 'Woodex assistant', $reply);
        }
        wx_update('wx_chats', ['needs' => $human ? 1 : 0], ['id' => $chatId]);
        if ($human) {
            /* The visitor is told a person is coming, because that is what [HUMAN] means. */
            wx_chat_add($chatId, 'sys', '', 'A designer will join this chat shortly.');
        }
        return;
    }
    wx_chat_handover($chatId, $cfg);
}

/** Nobody (or nothing) could answer: say so once, and put the conversation in front of a person. */
function wx_chat_handover(int $chatId, array $cfg): void
{
    $already = (int) wx_val("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id = ? AND who = 'sys'", [$chatId]);
    if ($already === 0) {
        wx_chat_add($chatId, 'sys', '', wx_chat_open_now()
            ? 'Thanks! A team member will reply here in a few minutes. You can also leave your phone number and we will call you.'
            : (string) $cfg['afterHours']);
    }
    wx_update('wx_chats', ['needs' => 1], ['id' => $chatId]);
}

/**
 * Email the team about a new conversation — once per chat, and honestly.
 *
 * Same rule as the booking notifications: a message that was not sent is recorded as `not configured`
 * rather than reported as sent. Nothing here pretends to have a mailer: v2.5 has no SMTP client yet
 * (that is the notifications phase), so the row in `wx_notify_log` is the record a person can act on.
 */
function wx_chat_alert(array $c, string $text): void
{
    $cfg = wx_chat_cfg();
    if (empty($cfg['emailAlert'])) {
        return;
    }
    $to = trim((string) (wx_setting('company.email', '') ?? ''));
    $from = trim((string) (wx_setting('mail.from', '') ?? ''));
    $configured = $to !== '' && $from !== '';
    $host = (string) preg_replace('~[^a-z0-9.\-:]~i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'woodex.com.pk'));
    wx_insert('wx_notify_log', [
        't' => wx_now(),
        'event' => 'chat.new',
        'ref' => mb_substr('Chat #' . (int) $c['id'] . ' · ' . (string) ($c['page'] ?? '/'), 0, 190),
        'name' => mb_substr((string) ($c['name'] ?? '') !== '' ? (string) $c['name'] : 'Website visitor', 0, 120),
        'channel' => 'email',
        'dest' => mb_substr($to, 0, 190),
        'result' => $configured ? 'queued' : 'not configured',
    ]);
    if ($configured) {
        error_log('[wx-v2] chat alert for #' . (int) $c['id'] . ' queued to ' . $to
            . ' — reply at https://' . $host . '/admin/#/chat/' . (int) $c['id'] . ' — ' . mb_substr($text, 0, 120));
    }
}

/** POST /chat/poll — new messages, whether a person is typing, and whether anyone is coming. */
function wx_route_chat_poll(array $ctx): array
{
    $c = wx_chat_vchat($ctx['body']);
    return ['data' => wx_chat_visitor_view($c, (int) ($ctx['body']['since'] ?? 0))];
}

/** POST /chat/typing — the visitor is typing, so the agent's screen can say so. */
function wx_route_chat_typing(array $ctx): array
{
    $c = wx_chat_vchat($ctx['body']);
    /* Typing pings are frequent by nature — one every few seconds while someone types — so the ceiling
       is high and on its own counter (`ct|`), because a budget shared with real messages would let a
       visitor's typing eat the messages they are about to send. It is still a limit: a loop that writes a
       timestamp ten times a second is not a person. */
    wx_rate('ct|' . wx_ip(), 240, 900, 'Too many requests — please wait a moment');
    /* A timestamp, never a flag: a browser that closes mid-sentence must not leave "typing" lit up. */
    wx_update('wx_chats', ['vtype' => wx_now()], ['id' => (int) $c['id']]);
    return ['data' => ['ok' => true]];
}

/** POST /chat/file — a photo, a PDF or a voice note from the visitor. */
function wx_route_chat_file(array $ctx): array
{
    $c = wx_chat_cfg();
    $b = $ctx['body'];
    if (empty($c['on'])) {
        throw new ApiError('NOT_FOUND', 'Chat is not available at the moment', 403);
    }
    $row = wx_chat_vchat($b);
    wx_rate('c|' . wx_ip(), 40, 900, 'You are sending files too fast — please wait a few minutes');
    $voice = !empty($b['voice']);
    $att = wx_chat_save_att((string) ($b['data'] ?? ''), (string) ($b['name'] ?? ''), $voice);
    if ((string) $row['status'] === 'closed') {
        wx_update('wx_chats', ['status' => 'open'], ['id' => (int) $row['id']]);
    }
    wx_chat_add((int) $row['id'], 'visitor', (string) ($row['name'] ?? ''), wx_chat_att_text($att), $att);
    wx_update('wx_chats', [
        'updated_at' => wx_now(),
        'needs' => 1,
        'unread' => (int) $row['unread'] + 1,
        'vtype' => null,
    ], ['id' => (int) $row['id']]);
    $row = wx_chat_or_404((int) $row['id']);
    return ['data' => wx_chat_visitor_view($row, (int) ($b['since'] ?? 0))];
}
