<?php
/**
 * P39 Phase 5: AI agent upgrade.
 *  - Hand-off reasons: person · price · complaint · unsure · deal · stuck (3+ customer messages, no details yet)
 *    → chat marked "needs you", 2-line summary note for the team, Telegram alert, reason shown in the Inbox.
 *  - Unanswered questions: AI marks [UNSURE] (or no rule matched) → list with one-click "Add to training".
 *  - Site-visit requests: AI collects day/time/address → [VISIT]{…} → pending booking + lead stage "Site visit"; team confirms.
 *  - Suggested reply for staff (chat_suggest) and the AI report (ai_report).
 * Tables: wx_ai_events (one row per AI answer / hand-off / visit), wx_ai_unans.
 */
const AI_REASONS = ['person' => 'Asked for a person', 'price' => 'Price / quote request', 'complaint' => 'Complaint or upset', 'unsure' => 'AI not sure', 'deal' => 'Ready to finalise', 'stuck' => 'No progress after 3 messages'];

function aia_migrate(): void {
    static $d = false; if ($d) return; $d = true; $e = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    q('CREATE TABLE IF NOT EXISTS wx_ai_events (id INT AUTO_INCREMENT PRIMARY KEY, t DATETIME NOT NULL, chat_id INT NOT NULL, kind VARCHAR(12) NOT NULL, reason VARCHAR(20) NULL, INDEX(t), INDEX(chat_id))' . $e);
    q('CREATE TABLE IF NOT EXISTS wx_ai_unans (id INT AUTO_INCREMENT PRIMARY KEY, t DATETIME NOT NULL, last_t DATETIME NOT NULL, chat_id INT NULL, q VARCHAR(500) NOT NULL, qkey VARCHAR(120) NOT NULL, n INT NOT NULL DEFAULT 1, status VARCHAR(10) NOT NULL DEFAULT \'open\', INDEX(status), INDEX(qkey))' . $e);
    foreach (["ALTER TABLE wx_chats ADD COLUMN handoff VARCHAR(20) NULL"] as $sql) { try { q($sql); } catch (Throwable $x) { /* already there */ } }
}
function aia_event(int $cid, string $kind, string $reason = ''): void { try { aia_migrate(); q('INSERT INTO wx_ai_events (t,chat_id,kind,reason) VALUES (?,?,?,?)', [now(), $cid, $kind, $reason !== '' ? $reason : null]); } catch (Throwable $e) { error_log('ai event: ' . $e->getMessage()); } }

/** Extra prompt rules (appended to chat_ai_system). */
function aia_prompt(): string {
    $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi')))->format('l Y-m-d');
    return "\n\nHAND-OFF: when you hand over to the team, end your reply with ONE tag [HUMAN:reason] where reason is one of: person (asked for a human), price (wants a price, rate or quotation), complaint (upset or complaining), deal (ready to sign, pay or finalise), unsure (you do not know the answer from the facts above). Say naturally that a Woodex designer will reply shortly." .
        "\nUNKNOWN: if the facts above do not answer the customer's question, never guess; say the team will confirm and add [HUMAN:unsure]." .
        "\nSITE VISITS: you can request a site visit for the customer. Once they have agreed and given a day, a time and the site address (and their phone is known), add at the end: [VISIT]{\"date\":\"YYYY-MM-DD\",\"time\":\"HH:MM\",\"address\":\"\"} and tell them the team will confirm the visit by phone or message. Visits are Monday to Saturday between 10:00 and 17:30, never Sunday. Today is $today (Asia/Karachi).";
}

/** Called from chat_ai_post with the raw AI text. Returns [text without tags, human?, reason]. */
function aia_parse(array $c, string $r): array {
    $reason = ''; $human = false;
    if (preg_match('~\[HUMAN(?::\s*([a-z]+))?\]~i', $r, $m)) { $human = true; $reason = strtolower($m[1] ?? 'person'); if (!isset(AI_REASONS[$reason])) $reason = 'person'; }
    $r = preg_replace('~\[HUMAN(?::\s*[a-z]+)?\]~i', '', $r);
    if (preg_match('~\[VISIT\]\s*(\{[^{}]*\})~u', $r, $m)) { $v = json_decode($m[1], true) ?: []; if (!empty($c['id'])) aia_visit($c, $v); }
    $r = preg_replace('~\[VISIT\]\s*(\{[^{}]*\})?~u', '', $r);
    return [trim($r), $human, $reason];
}

/** After an AI turn: log, hand off with summary, or log an unanswered question. */
function aia_after(array $c, bool $human, string $reason, string $lastQ): void {
    $cid = (int)($c['id'] ?? 0); if (!$cid) return;
    aia_event($cid, 'answer');
    if ($reason === 'unsure' && $lastQ !== '') aia_unans($cid, $lastQ);
    if (!$human) { // "stuck": 3+ customer messages and still no phone/lead
        try { $n = (int)q("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=? AND who='visitor'", [$cid])->fetchColumn();
            $fresh = q('SELECT * FROM wx_chats WHERE id=?', [$cid])->fetch();
            if ($n >= 3 && $fresh && !$fresh['lead_id'] && !$fresh['phone'] && empty($fresh['handoff'])) { $human = true; $reason = 'stuck'; }
        } catch (Throwable $e) {}
    }
    if ($human) aia_handoff($cid, $reason ?: 'person');
}
/** Mark the chat, write a 2-line summary note, alert the assigned person / team group. */
function aia_handoff(int $cid, string $reason): void {
    aia_migrate(); $c = q('SELECT * FROM wx_chats WHERE id=?', [$cid])->fetch(); if (!$c) return;
    q('UPDATE wx_chats SET needs=1, handoff=? WHERE id=?', [$reason, $cid]);
    $sum = aia_summary($c);
    chat_add($cid, 'note', 'AI assistant', '🙋 Hand-off: ' . (AI_REASONS[$reason] ?? $reason) . "\n" . $sum);
    aia_event($cid, 'handoff', $reason);
    if (function_exists('tg_team_post')) tg_team_post($c, $sum, '🙋 <b>Needs a person</b> · ' . tg_h(AI_REASONS[$reason] ?? $reason) . (!empty($c['assigned_to']) ? ' · for ' . tg_h((string)(q('SELECT name FROM wx_users WHERE id=?', [(int)$c['assigned_to']])->fetchColumn() ?: '')) : ''));
}
/** 2-line summary from what we know (no extra AI cost). */
function aia_summary(array $c): string {
    $f = [];
    if (!empty($c['lead_id'])) { try { $l = q('SELECT service,fields FROM wx_leads WHERE id=?', [$c['lead_id']])->fetch(); if ($l) { $f = json_decode((string)$l['fields'], true) ?: []; if ($l['service']) $f['Project type'] = $f['Project type'] ?? $l['service']; } } catch (Throwable $e) {} }
    $who = trim((string)($c['name'] ?: 'Customer')) . ($c['phone'] ? ' (' . $c['phone'] . ')' : ' (no phone yet)');
    $need = implode(' · ', array_filter([$f['Project type'] ?? '', $f['Area'] ?? '', !empty($f['Budget (customer)']) ? 'budget ' . $f['Budget (customer)'] : '']));
    $last = (string)(q("SELECT text FROM wx_chat_msgs WHERE chat_id=? AND who='visitor' ORDER BY id DESC LIMIT 1", [$c['id']])->fetchColumn() ?: '');
    return $who . ($need !== '' ? ': ' . $need : '') . "\nLast message: “" . mb_substr($last, 0, 160) . '”';
}
/** Save an unanswered question (grouped by similar wording). */
function aia_unans(?int $cid, string $q): void {
    try { aia_migrate(); $q = trim(mb_substr($q, 0, 500)); if (mb_strlen($q) < 4) return;
        $key = mb_substr(preg_replace('~\s+~', ' ', mb_strtolower(preg_replace('~[^\p{L}\p{N} ]~u', '', $q))), 0, 120);
        $r = q("SELECT id FROM wx_ai_unans WHERE qkey=? AND status='open'", [$key])->fetch();
        if ($r) q('UPDATE wx_ai_unans SET n=n+1, last_t=?, chat_id=? WHERE id=?', [now(), $cid, $r['id']]);
        else q('INSERT INTO wx_ai_unans (t,last_t,chat_id,q,qkey) VALUES (?,?,?,?,?)', [now(), now(), $cid, $q, $key]);
    } catch (Throwable $e) { error_log('ai unans: ' . $e->getMessage()); }
}
/** AI asked for a visit: pending booking (team confirms) + lead stage "Site visit". */
function aia_visit(array $c, array $v): void {
    try {
        $d = (string)($v['date'] ?? ''); $tm = (string)($v['time'] ?? ''); $addr = mb_substr(trim(strip_tags((string)($v['address'] ?? ''))), 0, 300);
        $ok = preg_match('~^\d{4}-\d{2}-\d{2}$~', $d) && preg_match('~^\d{2}:\d{2}$~', $tm) && strtotime($d) >= strtotime(date('Y-m-d')) && (int)date('w', strtotime($d)) !== 0;
        $cid = (int)$c['id']; $c = q('SELECT * FROM wx_chats WHERE id=?', [$cid])->fetch(); if (!$c) return;
        if (!$ok || !$c['phone']) { chat_add($cid, 'note', 'AI assistant', '📅 Customer wants a site visit' . ($d ? ' (' . $d . ' ' . $tm . ')' : '') . ($addr ? ' at ' . $addr : '') . '. Please confirm with them.'); aia_handoff($cid, 'deal'); return; }
        if (!(int)$c['lead_id']) $c = chat_make_lead($c);
        bk_migrate(); $bc = bk_cfg(); $t = bk_type($bc, 'visit') ?: ($bc['types'][0] ?? ['k' => 'visit', 'dur' => 60]);
        if (q("SELECT id FROM wx_bookings WHERE lead_id=? AND status='pending' AND d>=?", [(int)$c['lead_id'], date('Y-m-d')])->fetch()) return; // one request per lead
        q('INSERT INTO wx_bookings (created_at,lead_id,name,phone,email,type,city,address,d,tm,dur,status,note,src) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [now(), (int)$c['lead_id'], (string)($c['name'] ?: 'Chat customer #' . $cid), (string)$c['phone'], $c['email'] ?: null, (string)$t['k'], null, $addr, $d, $tm, (int)($t['dur'] ?? 60), 'pending', 'Requested in chat #' . $cid . ' (AI assistant). Please confirm.', 'ai']);
        try { q("UPDATE wx_leads SET stage='visit' WHERE id=? AND stage IN ('new','contacted')", [(int)$c['lead_id']]); q('UPDATE wx_leads SET next_at=?, next_type=? WHERE id=?', ["$d $tm:00", 'visit', (int)$c['lead_id']]); } catch (Throwable $e) {}
        chat_add($cid, 'note', 'AI assistant', '📅 Site visit requested: ' . date('D j M', strtotime($d)) . ' at ' . $tm . ($addr ? ' · ' . $addr : '') . '. Pending: confirm it in Bookings.');
        aia_event($cid, 'visit');
        if (function_exists('tg_alert')) tg_alert('leads', '📅 <b>Site visit request</b> · ' . tg_h((string)$c['name']) . ' · ' . tg_h(date('D j M', strtotime($d)) . ' ' . $tm) . ($addr ? ' · ' . tg_h($addr) : ''));
    } catch (Throwable $e) { error_log('ai visit: ' . $e->getMessage()); }
}

/* ---------------------------------------------------------------- Admin actions */
function aia_actions(string $action, array $in): bool {
    if (!preg_match('~^(ai_report|ai_unans_[a-z]+|chat_suggest)$~', $action)) return false;
    chat_migrate(); aia_migrate();
    switch ($action) {
        case 'chat_suggest': // draft for staff, never sent automatically
            need(['owner', 'admin', 'sales']); $c = chat_get((int)($in['id'] ?? 0));
            $a = cms_load()['ai']; if (($a[$a['provider'] . 'Key'] ?? '') === '') fail('Add an AI key first (Blog & insights → AI settings)');
            $sys = chat_ai_system($c) . "\n\nYou are now drafting the next reply for a HUMAN Woodex designer who will check and send it. Write only the message text: no tags, no [LEAD], no [HUMAN], no [VISIT]. Keep it short and specific to the last customer message.";
            $r = chat_ai_call($sys, chat_turns((int)$c['id'])); $r = trim(preg_replace('~\[(LEAD|HUMAN|VISIT)[^\]]*\]\s*(\{[^{}]*\})?~u', '', $r));
            if ($r === '') fail('The AI did not answer. Try again in a moment.'); out(['ok' => true, 'text' => $r]);
        case 'ai_report':
            need(['owner', 'admin']); $days = max(1, min(365, (int)($in['days'] ?? 30))); $from = date('Y-m-d H:i:s', time() - $days * 86400);
            $chats = q('SELECT id,channel,lead_id,created_at FROM wx_chats WHERE created_at>=? LIMIT 2000', [$from])->fetchAll(); $ids = array_map(fn($x) => (int)$x['id'], $chats);
            $hum = $ids ? array_map('intval', q("SELECT DISTINCT chat_id FROM wx_chat_msgs WHERE who='agent' AND chat_id IN (" . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_COLUMN)) : [];
            $reasons = []; foreach (q("SELECT reason, COUNT(*) n FROM wx_ai_events WHERE kind='handoff' AND t>=? GROUP BY reason", [$from])->fetchAll() as $r) $reasons[] = ['k' => (string)$r['reason'], 'label' => AI_REASONS[$r['reason']] ?? (string)$r['reason'], 'n' => (int)$r['n']];
            $byCh = []; foreach ($chats as $x) { $k = $x['channel'] ?: 'web'; $byCh[$k] = ($byCh[$k] ?? 0) + 1; }
            // average first reply (any reply: AI or team) and first team reply, in seconds
            $fr = []; $ft = [];
            foreach (array_slice($ids, -400) as $id) {
                $v = q("SELECT MIN(t) FROM wx_chat_msgs WHERE chat_id=? AND who='visitor'", [$id])->fetchColumn(); if (!$v) continue;
                $a = q("SELECT MIN(t) FROM wx_chat_msgs WHERE chat_id=? AND who IN ('ai','agent') AND t>=?", [$id, $v])->fetchColumn(); if ($a) $fr[] = strtotime($a) - strtotime($v);
                $g = q("SELECT MIN(t) FROM wx_chat_msgs WHERE chat_id=? AND who='agent' AND t>=?", [$id, $v])->fetchColumn(); if ($g) $ft[] = strtotime($g) - strtotime($v);
            }
            $avg = fn($a) => $a ? (int)round(array_sum($a) / count($a)) : null;
            out(['ok' => true, 'days' => $days, 'chats' => count($chats), 'aiOnly' => count($chats) - count(array_intersect($ids, $hum)), 'handoffs' => array_sum(array_column($reasons, 'n')), 'reasons' => $reasons,
                'leads' => count(array_filter($chats, fn($x) => $x['lead_id'])), 'visits' => (int)q("SELECT COUNT(*) FROM wx_ai_events WHERE kind='visit' AND t>=?", [$from])->fetchColumn(),
                'answers' => (int)q("SELECT COUNT(*) FROM wx_ai_events WHERE kind='answer' AND t>=?", [$from])->fetchColumn(), 'channels' => $byCh, 'firstReply' => $avg($fr), 'firstTeam' => $avg($ft),
                'unanswered' => (int)q("SELECT COUNT(*) FROM wx_ai_unans WHERE status='open'")->fetchColumn()]);
        case 'ai_unans_list':
            need(['owner', 'admin']); $st = in_array($in['status'] ?? 'open', ['open', 'added', 'ignored'], true) ? $in['status'] : 'open';
            out(['ok' => true, 'items' => array_map(fn($r) => ['id' => (int)$r['id'], 'q' => $r['q'], 'n' => (int)$r['n'], 't' => $r['last_t'], 'chat_id' => $r['chat_id'] !== null ? (int)$r['chat_id'] : null, 'status' => $r['status']], q('SELECT * FROM wx_ai_unans WHERE status=? ORDER BY n DESC, last_t DESC LIMIT 200', [$st])->fetchAll())]);
        case 'ai_unans_add': // add the answer to Train AI → Q&A
            $u = need(['owner', 'admin']); $r = q('SELECT * FROM wx_ai_unans WHERE id=?', [(int)($in['id'] ?? 0)])->fetch(); if (!$r) fail('Not found', 404);
            $qq = mb_substr(trim((string)($in['q'] ?? $r['q'])), 0, 300); $aa = mb_substr(trim((string)($in['a'] ?? '')), 0, 1500); if ($qq === '' || $aa === '') fail('Write the answer first');
            $c = chat_cfg(); $c['qa'] = array_values((array)$c['qa']); $c['qa'][] = ['q' => $qq, 'a' => $aa]; $c['qa'] = array_slice($c['qa'], -150); jwrite(CHAT_FILE, $c);
            q("UPDATE wx_ai_unans SET status='added' WHERE id=?", [$r['id']]); log_act($u, 'ai.train', $qq); out(['ok' => true]);
        case 'ai_unans_ignore':
            need(['owner', 'admin']); q("UPDATE wx_ai_unans SET status=? WHERE id=?", [!empty($in['undo']) ? 'open' : 'ignored', (int)($in['id'] ?? 0)]); out(['ok' => true]);
    }
    return false;
}
