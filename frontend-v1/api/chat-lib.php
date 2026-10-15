<?php
/**
 * Phase 10 — Live chat (AI first, team can take over) + Admin notifications.
 * Tables: wx_chats, wx_chat_msgs. Settings: _private/chat.json.
 * Public endpoint: api/chat.php (visitor). Admin actions here: chat_*, notif_poll.
 */
const CHAT_FILE = PRIVATE_DIR . '/chat.json';
const CHAT_DEF = [
    'on' => true, 'ai' => true, 'emailAlert' => true, 'autoLead' => true,
    'greeting' => 'Assalam-o-Alaikum and welcome to Woodex Interior. Thank you for connecting with us. Tell us a little about your space (home, office or shop, and the city), and share your WhatsApp number. A designer from our team will join you shortly.', 'noPrices' => true,
    'hours' => 'Mon–Sat, 9:30 am – 6:30 pm',
    // Phase 11 — training (shared by website chat + WhatsApp agent)
    'tone' => 'designer', 'toneNote' => '', 'qa' => [], 'avoid' => "Competitor comparisons\nPolitics or religion\nLegal or medical advice\nExact final prices before a site visit", 'prices' => '',
    'openFrom' => '09:30', 'openTo' => '18:30', 'days' => [1, 2, 3, 4, 5, 6],
    'afterHours' => 'Thanks for your message! We are away right now. Leave your name and phone number and we will call you back first thing.',
    // P39 Phase 4: customer quick answers (website chat + Telegram buttons) and team saved replies ("/" in the Inbox)
    'quick' => [['label' => 'Our services', 'text' => 'What services do you offer?'], ['label' => 'Book a site visit', 'text' => 'I would like to book a site visit.'], ['label' => 'See our work', 'text' => 'Can I see your recent projects?'], ['label' => 'Talk to a person', 'text' => 'I would like to talk to a person.'], ['label' => 'Hours & location', 'text' => 'What are your hours and where is your office?']],
    'saved' => [['k' => 'hello', 't' => 'Assalam-o-Alaikum, thank you for contacting Woodex Interior. How can I help you with your space?'], ['k' => 'visit', 't' => 'We would be glad to visit your site. Please share your address, a suitable day and time, and the best number to reach you.'], ['k' => 'number', 't' => 'Could you share your WhatsApp number so our designer can send you ideas and follow up?'], ['k' => 'portfolio', 't' => 'You can see our recent projects here: https://woodex.com.pk/portfolio/'], ['k' => 'hours', 't' => 'Our office is open Monday to Saturday, 9:30 AM to 6:30 PM (Sunday closed). Call or WhatsApp +92 322 4000768.'], ['k' => 'thanks', 't' => 'Thank you for your time. Our designer will be in touch shortly.']],
    'waAgent' => false, 'waVerify' => '', 'waSecret' => '', 'waGreeting' => 'Assalam-o-Alaikum! Thank you for contacting Woodex Interior. How can we help you today?',
    'knowledge' => "Woodex Interior is an interior design and build company in Lahore, Pakistan (since 2011).\nServices: interior design (homes, offices, retail, restaurants), renovation, office fit-out, turnkey design-build, architecture and house design (5 marla to 2 kanal), 3D visualization, custom furniture.\nContact: phone/WhatsApp +92 322 4000768, email info@woodex.com.pk, office M-71 Zainab Tower, Model Town Link Road, Lahore. Office hours Mon–Sat 9:30 am – 6:30 pm.\nProcess: free consultation → site visit and measurements → design and 3D views → quotation → execution → handover.\nWe work across Lahore and also take projects in Islamabad, Karachi and other cities.\nPrices depend on area, finishes and scope; a site visit gives an exact quotation. The online cost estimator is at /estimator/.\nFor a quote or site visit ask for the client's name, phone number, area/location and what they need.",
];
const CHAT_OLD_GREETING = 'Assalam-o-Alaikum! 👋 I am the Woodex assistant. Ask me anything about interior design, renovation, fit-out or prices. A team member can join any time.';
function chat_cfg(): array {
    $s = jread(CHAT_FILE); $c = array_merge(CHAT_DEF, $s);
    if (($s['greeting'] ?? '') === 'Assalam-o-Alaikum, welcome to Woodex Interior. I can help with interior design, renovation, office fit-out and custom furniture. How may I assist you today? Our team is available Mon–Sat, 10:00 am – 7:30 pm.') $c['greeting'] = CHAT_DEF['greeting']; // P20: upgrade the untouched P18 greeting
    if (($s['hours'] ?? '') === 'Mon–Sat, 10:00 am – 7:30 pm') { $c['hours'] = CHAT_DEF['hours']; if (($s['openFrom'] ?? '10:00') === '10:00' && ($s['openTo'] ?? '19:30') === '19:30') { $c['openFrom'] = CHAT_DEF['openFrom']; $c['openTo'] = CHAT_DEF['openTo']; } } // P28: new office hours
    if (!array_key_exists('noPrices', $s)) { // P18 E: one-time upgrade of settings saved before the designer tone existed
        if (($s['tone'] ?? 'friendly') === 'friendly') $c['tone'] = 'designer';
        if (($s['greeting'] ?? CHAT_OLD_GREETING) === CHAT_OLD_GREETING) $c['greeting'] = CHAT_DEF['greeting'];
    }
    return $c;
}
function chat_open_now(): bool {
    $c = chat_cfg(); $d = new DateTime('now', new DateTimeZone('Asia/Karachi')); $w = (int)$d->format('w'); $m = (int)$d->format('G') * 60 + (int)$d->format('i');
    $hm = fn($t) => preg_match('~^(\d{1,2}):(\d{2})$~', (string)$t, $x) ? (int)$x[1] * 60 + (int)$x[2] : 0;
    return in_array($w, array_map('intval', (array)$c['days']), true) && $m >= $hm($c['openFrom']) && $m < $hm($c['openTo']);
}
const CHAT_TONES = ['designer' => 'a calm, professional interior designer: knowledgeable, precise and courteous. Not over-friendly: no slang, no exclamation marks, no emojis, no flattery', 'friendly' => 'warm, friendly and helpful', 'professional' => 'polite, professional and concise', 'sales' => 'enthusiastic and persuasive, gently guiding towards booking a site visit', 'simple' => 'very simple words, short sentences, easy for anyone'];

function chat_migrate(): void {
    static $done = false; if ($done) return; $done = true; $e = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    q('CREATE TABLE IF NOT EXISTS wx_chats (id INT AUTO_INCREMENT PRIMARY KEY, token CHAR(64) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, name VARCHAR(120) NULL, phone VARCHAR(40) NULL, email VARCHAR(190) NULL,
        page VARCHAR(200) NULL, ip VARCHAR(64) NULL, status VARCHAR(10) NOT NULL DEFAULT \'open\', mode VARCHAR(10) NOT NULL DEFAULT \'ai\', agent_name VARCHAR(120) NULL, unread INT NOT NULL DEFAULT 0,
        needs TINYINT NOT NULL DEFAULT 0, last_text VARCHAR(255) NULL, lead_id INT NULL, alerted TINYINT NOT NULL DEFAULT 0, INDEX(updated_at))' . $e);
    try { q("ALTER TABLE wx_chats ADD COLUMN channel VARCHAR(8) NOT NULL DEFAULT 'web'"); } catch (Throwable $x) { /* already there */ }
    q('CREATE TABLE IF NOT EXISTS wx_chat_msgs (id INT AUTO_INCREMENT PRIMARY KEY, chat_id INT NOT NULL, t DATETIME NOT NULL, who VARCHAR(8) NOT NULL, name VARCHAR(120) NULL, text TEXT NOT NULL, INDEX(chat_id, id))' . $e);
    // P18 D: attachments (JSON {u,n,k,s}) + typing status
    foreach (["ALTER TABLE wx_chats ADD COLUMN handoff VARCHAR(20) NULL", "ALTER TABLE wx_chat_msgs ADD COLUMN att TEXT NULL", "ALTER TABLE wx_chats ADD COLUMN vtype DATETIME NULL", "ALTER TABLE wx_chats ADD COLUMN atype DATETIME NULL", "ALTER TABLE wx_chats ADD COLUMN ext VARCHAR(40) NULL", "ALTER TABLE wx_chats ADD COLUMN assigned_to INT NULL", "ALTER TABLE wx_chats ADD COLUMN tags VARCHAR(200) NULL"] as $sql) { try { q($sql); } catch (Throwable $x) { /* already there */ } }
}
function chat_get(int $id): array { $c = q('SELECT * FROM wx_chats WHERE id=?', [$id])->fetch(); if (!$c) fail('Chat not found', 404); return $c; }
function chat_msgs(int $cid, int $since = 0, bool $notes = false): array {
    return array_map(fn($m) => ['id' => (int)$m['id'], 't' => $m['t'], 'who' => $m['who'], 'name' => (string)$m['name'], 'text' => $m['text'], 'att' => !empty($m['att']) ? json_decode((string)$m['att'], true) : null], q('SELECT * FROM wx_chat_msgs WHERE chat_id=? AND id>?' . ($notes ? '' : " AND who<>'note'") . ' ORDER BY id LIMIT 300', [$cid, $since])->fetchAll());
}
function chat_add(int $cid, string $who, string $name, string $text, ?array $att = null): int {
    q('INSERT INTO wx_chat_msgs (chat_id,t,who,name,text,att) VALUES (?,?,?,?,?,?)', [$cid, now(), $who, mb_substr($name, 0, 120), mb_substr($text, 0, 4000), $att ? json_encode($att, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null]); $mid = (int)db()->lastInsertId();
    if ($who === 'note') return $mid; // internal note: never shown to the customer
    if ($who === 'visitor' && function_exists('tg_team_post')) { try { $cc = q('SELECT * FROM wx_chats WHERE id=?', [$cid])->fetch(); if ($cc) tg_team_post($cc, $text); } catch (Throwable $e) { error_log('tg post: ' . $e->getMessage()); } }
    q('UPDATE wx_chats SET updated_at=?, last_text=?' . ($who === 'visitor' ? ', unread=unread+1' : '') . ' WHERE id=?', [now(), mb_substr(($who === 'visitor' ? '' : ($who === 'agent' ? 'You: ' : 'AI: ')) . $text, 0, 250), $cid]);
    return $mid;
}
function chat_pub(array $c): array {
    return ['id' => (int)$c['id'], 'created_at' => $c['created_at'], 'updated_at' => $c['updated_at'], 'name' => (string)$c['name'], 'phone' => (string)$c['phone'], 'email' => (string)$c['email'], 'page' => (string)$c['page'],
        'status' => $c['status'], 'mode' => $c['mode'], 'agent' => (string)$c['agent_name'], 'unread' => (int)$c['unread'], 'needs' => (bool)$c['needs'], 'last' => (string)$c['last_text'], 'lead_id' => $c['lead_id'] !== null ? (int)$c['lead_id'] : null, 'handoff' => (string)($c['handoff'] ?? ''), 'assigned' => isset($c['assigned_to']) && $c['assigned_to'] !== null ? (int)$c['assigned_to'] : null, 'tags' => array_values(array_filter(explode(',', (string)($c['tags'] ?? '')))), 'waitFrom' => (int)$c['unread'] || (int)$c['needs'] ? (string)(q("SELECT MIN(t) FROM wx_chat_msgs WHERE chat_id=? AND who='visitor' AND id > COALESCE((SELECT MAX(id) FROM wx_chat_msgs WHERE chat_id=? AND who IN ('agent','ai')),0)", [$c['id'], $c['id']])->fetchColumn() ?: '') : '', 'channel' => (string)($c['channel'] ?? 'web')];
}

/** P18 D: store a chat attachment (image / PDF / voice note). Random file name in /assets/uploads/chat/YYYYMM/. Returns att array. */
const CHAT_ATT_MAX = 8 * 1024 * 1024;
function chat_sniff_att(string $b): ?array {
    if (substr($b, 0, 3) === "\xFF\xD8\xFF") return ['jpg', 'img']; if (substr($b, 0, 8) === "\x89PNG\r\n\x1A\n") return ['png', 'img'];
    if (substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WEBP') return ['webp', 'img']; if (substr($b, 0, 4) === 'GIF8') return ['gif', 'img'];
    if (substr($b, 0, 5) === '%PDF-') return ['pdf', 'file'];
    if (substr($b, 0, 4) === "\x1A\x45\xDF\xA3") return ['webm', 'voice']; if (substr($b, 0, 4) === 'OggS') return ['ogg', 'voice'];
    if (substr($b, 4, 4) === 'ftyp') return ['m4a', 'voice'];
    return null;
}
function chat_save_att(string $b64, string $name, bool $voice): array {
    $d = base64_decode($b64, true); if ($d === false || $d === '') fail('The file is empty'); if (strlen($d) > CHAT_ATT_MAX) fail('Files must be 8 MB or smaller');
    $t = chat_sniff_att($d); if (!$t) fail('Only photos (JPG, PNG, WebP, GIF), PDF files and voice notes can be sent');
    if ($t[1] === 'voice' && !$voice) fail('Only photos and PDF files can be attached'); if ($voice && $t[1] !== 'voice') fail('Voice note format not recognised');
    $dir = '/assets/uploads/chat/' . gmdate('Ym'); if (!is_dir(ROOT_DIR . $dir)) mkdir(ROOT_DIR . $dir, 0755, true);
    $f = $dir . '/' . bin2hex(random_bytes(12)) . '.' . $t[0]; file_put_contents(ROOT_DIR . $f, $d, LOCK_EX);
    $n = trim(preg_replace('~[^\w .()-]+~u', '', $name)) ?: ($t[1] === 'voice' ? 'Voice note' : 'file.' . $t[0]);
    return ['u' => $f, 'n' => mb_substr($n, 0, 80), 'k' => $t[1], 's' => strlen($d)];
}
function chat_att_text(array $a): string { return $a['k'] === 'voice' ? '🎤 Voice note' : ($a['k'] === 'img' ? '📷 Photo' : '📎 ' . $a['n']); }
function chat_recent(?string $t): bool { return $t && strtotime($t) >= time() - 6; }

/** Pull name / phone / email out of a visitor message; save as a lead once a phone or email is known. */
function chat_capture(array $c, string $text): array {
    $set = [];
    if (!$c['phone'] && preg_match('~(?:\+?92|0)\s?3\d{2}[\s-]?\d{7}|\+?\d[\d\s-]{8,14}\d~', $text, $m)) $set['phone'] = preg_replace('~[^\d+]~', '', $m[0]);
    if (!$c['email'] && preg_match('~[\w.+-]+@[\w-]+\.[\w.]{2,}~', $text, $m)) $set['email'] = strtolower($m[0]);
    if (!$c['name'] && preg_match('~\b(?:my name is|this is|i am|i\'m|name:)\s+([a-z][a-z]+(?:\s[a-z][a-z]+)?)~i', $text, $m) && !preg_match('~^(looking|interested|from|here|planning|a|an|the)\b~i', $m[1])) $set['name'] = ucwords(strtolower($m[1]));
    if ($set) { $f = []; $p = []; foreach ($set as $k => $v) { $f[] = "$k=?"; $p[] = $v; } $p[] = $c['id']; q('UPDATE wx_chats SET ' . implode(',', $f) . ' WHERE id=?', $p); $c = array_merge($c, $set); }
    if (!$c['lead_id'] && ($c['phone'] || $c['email']) && chat_cfg()['autoLead']) $c = chat_make_lead($c);
    return $c;
}
function chat_make_lead(array $c): array {
    crm_migrate();
    $msgs = array_filter(chat_msgs((int)$c['id']), fn($m) => $m['who'] === 'visitor');
    $txt = mb_substr(implode("\n", array_map(fn($m) => '• ' . $m['text'], $msgs)), 0, 3900);
    q('INSERT INTO wx_leads (created_at,source,page,name,phone,email,service,message,fields,stage,is_read,ip) VALUES (?,?,?,?,?,?,?,?,?,\'new\',0,?)',
        [now(), 'chat', $c['page'], $c['name'] ?: 'Chat visitor #' . $c['id'], (string)$c['phone'], (string)$c['email'], '', $txt, json_encode(['chat' => (int)$c['id']]), $c['ip']]);
    $lid = (int)db()->lastInsertId(); q('UPDATE wx_chats SET lead_id=? WHERE id=?', [$lid, $c['id']]); $c['lead_id'] = $lid;
    try { $l = q('SELECT * FROM wx_leads WHERE id=?', [$lid])->fetch(); if ($l) send_alerts(lead_row($l)); } catch (Throwable $e) { error_log('chat lead alert: ' . $e->getMessage()); }
    return $c;
}
function chat_email_alert(array $c, string $text): void {
    $cfg = chat_cfg(); $crm = crm_cfg(); if (!$cfg['emailAlert'] || $crm['smtpHost'] === '' || !$crm['emailTo']) return;
    $to = array_values(array_filter(preg_split('~[\s,]+~', $crm['emailTo'])));
    $h = preg_replace('~[^a-z0-9.\-:]~i', '', (string)($_SERVER['HTTP_HOST'] ?? 'woodex.com.pk'));
    smtp_send($crm, $to, 'New live chat on the website', "A visitor started a live chat.\n\nPage: " . $c['page'] . "\nMessage: " . $text . "\n\nReply in Admin → Live chat: https://$h/admin/#/chat/" . $c['id']);
}

const CHAT_FACTS = "Woodex Interior is a Lahore design-and-build studio founded in 2016 by Imtiaz Ahmad, with 200+ completed spaces (homes, offices, retail, restaurants, healthcare). Services: interior design, office and commercial fit-out, turnkey design-build, renovation, architecture, 3D visualization (Woodex 3D Studio) and custom furniture and joinery (Woodex Furniture). Works across Lahore, Islamabad, Karachi and nationwide. Process: 1) brief call, 2) site visit or drawings review, 3) concept, 3D views and an itemised bill of quantities, 4) build with one team on site and a clear handover. 3D renders come in 4K with two revision rounds. Helpful things for a client to share: location, approximate size (marla, kanal or sq ft), photos or a short video of the site, plans if any, timeline and the style they like.";
/** System prompt built from the training screen (shared by website chat, WhatsApp and the test box). */
function chat_ai_system(array $c): string {
    $cfg = chat_cfg(); $co = company_cfg(); $faq = [];
    foreach ((array)$cfg['qa'] as $x) if (!empty($x['q']) && !empty($x['a'])) $faq[] = 'Q: ' . $x['q'] . "\nA: " . $x['a'];
    foreach (cms_load()['items'] as $it) if ($it['type'] === 'faq' && ($it['status'] ?? '') === 'published') foreach (($it['data']['items'] ?? []) as $f) if (!empty($f['q'])) $faq[] = 'Q: ' . $f['q'] . "\nA: " . strip_tags((string)($f['a'] ?? ''));
    $wa = ($c['channel'] ?? 'web') === 'wa';
    $avoid = array_filter(array_map('trim', preg_split('~\n~', (string)$cfg['avoid'])));
    return "You are the " . ($wa ? 'WhatsApp' : 'live-chat') . " assistant of {$co['name']} (Lahore, Pakistan). Tone: " . (CHAT_TONES[$cfg['tone']] ?? CHAT_TONES['friendly']) . '.' . ($cfg['toneNote'] ? ' ' . $cfg['toneNote'] : '') . "\n" .
        "STYLE: write like an experienced Woodex interior designer chatting with a client, not like a bot. Be warm, calm and natural, using everyday words and contractions. First respond to exactly what the person said (mention their space, city or problem), add one genuinely useful insight or tip from real project experience (what affects the result, what to prepare, a common mistake to avoid), then ask ONE simple follow-up question. Vary your wording; never repeat the same sentence twice in a chat; do not greet again after the first message; no bullet lists, no headings, no 'As an AI'. Use the customer's name once you know it. If asked directly whether you are a person, say honestly you are the Woodex studio assistant and a designer can join any time.\n" .
        "Always reply in the same language and script the customer uses (English, Urdu script, or Roman Urdu). Keep answers short: 2–4 sentences, plain text, no markdown." . ($wa ? ' This is WhatsApp: you may use *bold* sparingly and 1 emoji at most.' : '') . "\n" .
        "Goal: help, then collect the customer's name, " . ($wa ? '' : 'WhatsApp number (if they have not shared it, ask for it in your first reply and say a Woodex designer will join them shortly), ') . "location/area and what they need so the team can call or book a site visit. Ask for one detail at a time, naturally.\n" .
        "When a Q&A answer below matches the question, use it (you may rephrase). Never invent prices, discounts, timelines or promises that are not written below; say the team will confirm after a site visit. Currency is PKR.\n" .
        (!empty($cfg['noPrices']) ? "PRICES: never quote any price, rate, per-square-foot cost, budget, range or estimate — not even approximately, even if asked repeatedly. Explain that cost depends on scope, size, materials and site condition, and offer a free site visit or a detailed itemised quotation.\n" : '') .
        ($avoid ? "Do NOT discuss these topics; politely say the team will help with that and move on: " . implode('; ', $avoid) . "\n" : '') .
        "LEAD DETAILS: whenever the customer reveals new details, add ONE hidden tag at the very end of your reply in this exact form: [LEAD]{\"name\":\"\",\"area\":\"\",\"type\":\"\",\"budget\":\"\"} — fill only what they actually said (area = city/area of the site, type = home/office/shop/restaurant/kitchen/renovation etc., budget = the range in their words). Never ask for a budget more than once and never suggest one. The customer never sees this tag.\n" .
        "If the customer asks for a human, is upset, wants to finalise a deal, or asks something you cannot answer, say a team member will reply shortly and add the tag [HUMAN] at the very end.\n" .
        "Office hours: {$cfg['hours']}. It is currently " . (chat_open_now() ? 'within' : 'outside') . " office hours.\nContact: {$co['phones']} · {$co['email']} · {$co['address']}\n\nSTUDIO FACTS (always true):\n" . CHAT_FACTS . "\n\nKNOWLEDGE:\n" . $cfg['knowledge'] .
        ($cfg['prices'] !== '' && empty($cfg['noPrices']) ? "\n\nPRICE GUIDANCE (starting rates only; always add that the final quote comes after a site visit):\n" . $cfg['prices'] : '') .
        ($faq ? "\n\nQ&A:\n" . mb_substr(implode("\n\n", $faq), 0, 9000) : '') .
        (function_exists('aic_prompt') ? aic_prompt((string)($c['channel'] ?? 'web')) : '') . (function_exists('aia_prompt') ? aia_prompt() : '') . ($wa ? "\n\nChannel: WhatsApp (their number is already known)." : "\n\nVisitor is on page: " . ($c['page'] ?? '/')) . (!empty($c['name']) ? "\nCustomer name: " . $c['name'] : '') . (!empty($c['phone']) && !$wa ? "\nPhone already given: yes" : '');
}
/** P38: split an AI reply into [visible text, needs human]; saves any [LEAD]{...} details to the chat's CRM lead (creates it when the phone is known and auto-lead is on). */
function chat_ai_post(array $c, string $r): array {
    $reason = ''; $human = false; if (function_exists('aia_parse')) [$r, $human, $reason] = aia_parse($c, $r);
    $human = $human || strpos($r, '[HUMAN]') !== false; $r = str_replace('[HUMAN]', '', $r); $d = [];
    if (preg_match('~\[LEAD\]\s*(\{[^{}]*\})~u', $r, $m)) { $d = json_decode($m[1], true) ?: []; }
    $r = trim(preg_replace('~\[LEAD\]\s*(\{[^{}]*\})?~u', '', $r));
    if ($d && !empty($c['id'])) try {
        $d = array_filter(array_map(fn($v) => mb_substr(trim(strip_tags((string)$v)), 0, 80), array_intersect_key($d, ['name' => 1, 'area' => 1, 'type' => 1, 'budget' => 1])), 'strlen');
        if (!empty($d['name']) && trim((string)($c['name'] ?? '')) === '') { q('UPDATE wx_chats SET name=? WHERE id=?', [$d['name'], $c['id']]); $c['name'] = $d['name']; }
        if (empty($c['lead_id']) && !empty($c['phone']) && !empty(chat_cfg()['autoLead'])) $c = chat_make_lead($c);
        if (!empty($c['lead_id'])) {
            $l = q('SELECT name,service,fields FROM wx_leads WHERE id=?', [$c['lead_id']])->fetch();
            if ($l) { $f = json_decode((string)$l['fields'], true) ?: []; foreach (['area' => 'Area', 'type' => 'Project type', 'budget' => 'Budget (customer)'] as $k => $lab) if (!empty($d[$k])) $f[$lab] = $d[$k];
                $nm = (!empty($d['name']) && preg_match('~^Chat visitor #~', (string)$l['name'])) ? $d['name'] : $l['name'];
                q('UPDATE wx_leads SET name=?,service=?,fields=? WHERE id=?', [$nm, ($l['service'] ?: ($d['type'] ?? '')), json_encode($f, JSON_UNESCAPED_UNICODE), $c['lead_id']]); }
        }
    } catch (Throwable $e) { error_log('chat lead details: ' . $e->getMessage()); }
    if (!empty($c['id']) && function_exists('aia_after')) { try { $lq = (string)(q("SELECT text FROM wx_chat_msgs WHERE chat_id=? AND who='visitor' ORDER BY id DESC LIMIT 1", [$c['id']])->fetchColumn() ?: ''); aia_after($c, $human, $reason, $lq); } catch (Throwable $e) { error_log('ai after: ' . $e->getMessage()); } }
    return [$r, $human];
}
/** Call the configured AI with role turns; returns '' on any failure (never exits). */
function chat_ai_call(string $sys, array $turns): string {
    $a = cms_load()['ai']; $p = $a['provider']; $key = $a[$p . 'Key'] ?? ''; $model = $a[$p . 'Model'] ?? ''; if ($key === '' || !function_exists('curl_init')) return '';
    while ($turns && $turns[0]['role'] !== 'user') array_shift($turns); if (!$turns) return '';
    if ($p === 'anthropic') { $url = 'https://api.anthropic.com/v1/messages'; $h = ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01', 'content-type: application/json']; [$aicT, $aicM] = function_exists('aic_gen') ? aic_gen() : [0.5, 400]; $body = ['model' => $model, 'max_tokens' => $aicM, 'temperature' => $aicT, 'system' => $sys, 'messages' => $turns]; }
    else { $url = ai_chat_url($a); $h = ['authorization: Bearer ' . $key, 'content-type: application/json', 'HTTP-Referer: https://woodex.com.pk', 'X-Title: Woodex Chat']; [$aicT, $aicM] = function_exists('aic_gen') ? aic_gen() : [0.5, 400]; $body = ['model' => $model, 'max_tokens' => $aicM, 'temperature' => $aicT, 'messages' => array_merge([['role' => 'system', 'content' => $sys]], $turns)]; }
    $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_HTTPHEADER => $h, CURLOPT_POSTFIELDS => json_encode($body), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 14]);
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($raw === false || $code >= 400) { error_log('chat ai: HTTP ' . $code); return ''; }
    $j = json_decode((string)$raw, true) ?: [];
    return trim($p === 'anthropic' ? implode('', array_map(fn($x) => (string)($x['text'] ?? ''), $j['content'] ?? [])) : (string)($j['choices'][0]['message']['content'] ?? ''));
}
function chat_turns(int $cid): array {
    $turns = []; foreach (array_slice(chat_msgs($cid), -16) as $m) { if ($m['who'] === 'sys') continue; $r = $m['who'] === 'visitor' ? 'user' : 'assistant'; if ($turns && end($turns)['role'] === $r) $turns[count($turns) - 1]['content'] .= "\n" . $m['text']; else $turns[] = ['role' => $r, 'content' => $m['text']]; }
    return $turns;
}
function chat_ai_reply(array $c): string {
    $cfg = chat_cfg(); if (!$cfg['ai'] || $c['mode'] !== 'ai') return '';
    if (function_exists('aic_channel_on') && !aic_channel_on((string)($c['channel'] ?? 'web'))) return ''; // P40 A: AI off for this channel
    // Security audit NV-1: site-wide cap of 400 AI answers per day (protects the AI bill); after that the Q&A rule answers + team take over
    try { $dk = 'ai-day:' . gmdate('Ymd'); $d = q('SELECT n FROM wx_throttle WHERE ip=?', [$dk])->fetch(); if ($d && (int)$d['n'] >= 400) return '';
        if ($d) q('UPDATE wx_throttle SET n=n+1 WHERE ip=?', [$dk]); else q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,1,?)', [$dk, time()]); } catch (Throwable $e) {}
    return chat_ai_call(chat_ai_system($c), chat_turns((int)$c['id']));
}

/** P19 B1: answer without AI (no key, AI off, or AI down) from Train-AI Q&A, FAQs and business info. '' = nothing matched. */
function chat_rule_reply(array $c, string $text): string {
    $cfg = chat_cfg(); $co = company_cfg(); $t = mb_strtolower(trim($text));
    $words = fn(string $s) => array_values(array_filter(preg_split('~[^\p{L}\p{N}]+~u', mb_strtolower($s)), fn($w) => mb_strlen($w) > 2 && !in_array($w, ['the','and','you','your','for','are','can','what','how','does','with','have','this','that','from','kya','hai','aap','mein','please'], true)));
    $tw = $words($t); $best = ''; $score = 0;
    $qa = (array)$cfg['qa'];
    foreach (cms_load()['items'] as $it) if ($it['type'] === 'faq' && ($it['status'] ?? '') === 'published') foreach (($it['data']['items'] ?? []) as $f) if (!empty($f['q'])) $qa[] = ['q' => $f['q'], 'a' => strip_tags((string)($f['a'] ?? ''))];
    foreach ($qa as $x) { if (empty($x['q']) || empty($x['a'])) continue; $qw = $words($x['q']); if (!$qw) continue; $hit = count(array_intersect($qw, $tw)); $s = $hit / count($qw); if ($hit >= 2 && $s > $score || $hit >= 1 && count($qw) <= 2 && $s > $score) { $score = $s; $best = (string)$x['a']; } }
    if ($score >= 0.5 && !(!empty($c['id']) && (int)q("SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=? AND who='ai' AND text=?", [(int)$c['id'], $best])->fetchColumn())) return $best;
    // P40: backup answers from api/chat-rules.json (shared with the preview). Service first, then the general topics; never repeat an answer in the same chat.
    $R = json_decode((string)@file_get_contents(__DIR__ . '/chat-rules.json'), true); if (!is_array($R)) return '';
    $prev = []; if (!empty($c['id'])) try { foreach (chat_msgs((int)$c['id']) as $m) if ($m['who'] === 'ai') $prev[] = trim(str_replace((string)$R['askPhone'], '', $m['text'])); } catch (Throwable $e) {}
    $later = chat_open_now() ? 'in a little while' : 'as soon as the office opens (' . $cfg['hours'] . ')';
    $fill = fn(string $s) => strtr($s, ['{address}' => $co['address'], '{phones}' => $co['phones'], '{email}' => $co['email'], '{hours}' => $cfg['hours'], '{later}' => $later]);
    $fresh = function (array $o) use ($prev, $fill) { $o = array_values(array_filter(array_map($fill, $o), fn($x) => !in_array($x, $prev, true))); return $o ? $o[array_rand($o)] : ''; };
    if (preg_match('~(\+?92|0)3\d{2}-?\d{7}~', preg_replace('~[\s-]+~', '', $t))) { $a = $fresh((array)$R['phone']); if ($a !== '') return $a; }
    $t2 = trim(preg_replace('~^\W*(hi+|hello|hey|salam|assalam\w*(\s*o?\s*-?\s*alaikum)?|aoa|a\.o\.a|asalam\w*|good (morning|afternoon|evening))\b[\s,.!]*~iu', '', $t));
    if ($t2 === '' || mb_strlen($t2) < 3) return $fresh((array)$R['greeting']);
    $wa = ($c['channel'] ?? 'web') !== 'web'; $hasPhone = !empty($c['phone']);
    foreach ((array)$R['rules'] as $r) {
        if (empty($r['re']) || !@preg_match('~' . $r['re'] . '~iu', $t2)) continue;
        $a = $fresh((array)$r['a']); if ($a === '') continue;
        if (!$wa && !$hasPhone && empty($r['noask']) && empty($r['human']) && substr(rtrim($a), -1) !== '?') $a .= (string)$R['askPhone'];
        return $a . (!empty($r['human']) ? ' [HUMAN]' : '');
    }
    return '';
}

function chat_actions(string $action, array $in): bool {
    if (!preg_match('~^(chat_|notif_)~', $action)) return false;
    chat_migrate(); $SALES = ['owner', 'admin', 'sales'];
    switch ($action) {
        case 'chat_list':
            $u = need($SALES); $st = ($in['status'] ?? 'open') === 'closed' ? 'closed' : 'open'; $box = (string)($in['box'] ?? 'all');
            $w = $box === 'mine' ? ' AND assigned_to=' . (int)$u['id'] : ($box === 'unassigned' ? ' AND assigned_to IS NULL' : '');
            $cc = chat_cfg(); $team = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => (string)$r['name']], q("SELECT id,name,role FROM wx_users WHERE active=1 AND role IN ('owner','admin','sales','support') ORDER BY name")->fetchAll());
            $cnt = q("SELECT SUM(assigned_to=?) mine, SUM(assigned_to IS NULL) un, COUNT(*) a FROM wx_chats WHERE status='open'", [(int)$u['id']])->fetch();
            out(['ok' => true, 'chats' => array_map('chat_pub', q('SELECT * FROM wx_chats WHERE status=?' . $w . ' ORDER BY needs DESC, updated_at DESC LIMIT 200', [$st])->fetchAll()), 'team' => $team, 'me' => (int)$u['id'],
                'counts' => ['mine' => (int)$cnt['mine'], 'unassigned' => (int)$cnt['un'], 'all' => (int)$cnt['a']], 'cfg' => ['ai' => $cc['ai'], 'on' => $cc['on'], 'saved' => $cc['saved'], 'tg' => function_exists('tg_ready') && tg_ready()]]);
        case 'chat_assign':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $to = (int)($in['user_id'] ?? 0); $nm = '';
            if ($to) { $r = q("SELECT name FROM wx_users WHERE id=? AND active=1", [$to])->fetch(); if (!$r) fail('User not found'); $nm = (string)$r['name']; }
            q('UPDATE wx_chats SET assigned_to=? WHERE id=?', [$to ?: null, $c['id']]); chat_add((int)$c['id'], 'note', $u['name'], $to ? 'Assigned to ' . $nm : 'Unassigned');
            log_act($u, 'chat.assign', '#' . $c['id'] . ' → ' . ($nm ?: 'nobody')); out(['ok' => true, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_note':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $t = trim(mb_substr((string)($in['text'] ?? ''), 0, 2000)); if ($t === '') fail('Write a note');
            $mid = chat_add((int)$c['id'], 'note', $u['name'], $t); out(['ok' => true, 'id' => $mid]);
        case 'chat_tags':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $tg = [];
            foreach ((array)($in['tags'] ?? []) as $x) { $x = mb_strtolower(trim(preg_replace('~[^\p{L}\p{N} \-]~u', '', (string)$x))); if ($x !== '' && count($tg) < 6) $tg[] = mb_substr($x, 0, 24); }
            q('UPDATE wx_chats SET tags=? WHERE id=?', [$tg ? implode(',', array_unique($tg)) : null, $c['id']]); out(['ok' => true, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_get':
            need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $since = (int)($in['since'] ?? 0);
            if ((int)$c['unread'] || (int)$c['needs']) q('UPDATE wx_chats SET unread=0, needs=0 WHERE id=?', [$c['id']]);
            out(['ok' => true, 'chat' => chat_pub($c), 'messages' => chat_msgs((int)$c['id'], $since, true), 'typing' => chat_recent($c['vtype'] ?? null)]);
        case 'chat_typing':
            need($SALES); q('UPDATE wx_chats SET atype=? WHERE id=?', [now(), (int)($in['id'] ?? 0)]); out(['ok' => true]);
        case 'chat_file':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); if (($c['channel'] ?? 'web') !== 'web') fail('Attachments work in website chats. For WhatsApp or Telegram chats, send files from the app.');
            $att = chat_save_att((string)($in['data'] ?? ''), (string)($in['name'] ?? ''), !empty($in['voice']));
            if ($c['mode'] === 'ai') chat_add((int)$c['id'], 'sys', '', $u['name'] . ' joined the chat');
            $cap = trim(mb_substr((string)($in['text'] ?? ''), 0, 500));
            $mid = chat_add((int)$c['id'], 'agent', $u['name'], $cap !== '' ? $cap : chat_att_text($att), $att); q("UPDATE wx_chats SET mode='human', handoff='', agent_name=?, status='open', unread=0, needs=0, atype=NULL WHERE id=?", [$u['name'], $c['id']]);
            log_act($u, 'chat.file', '#' . $c['id'] . ' ' . $att['k']); out(['ok' => true, 'id' => $mid, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_reply':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $t = trim((string)($in['text'] ?? '')); if ($t === '') fail('Write a message');
            if ($c['mode'] === 'ai') chat_add((int)$c['id'], 'sys', '', $u['name'] . ' joined the chat');
            $e = chat_deliver($c, $t); if ($e !== '') fail($e);
            $mid = chat_add((int)$c['id'], 'agent', $u['name'], $t); q("UPDATE wx_chats SET mode='human', handoff='', agent_name=?, assigned_to=COALESCE(assigned_to, ?), status='open', unread=0, needs=0 WHERE id=?", [$u['name'], (int)$u['id'], $c['id']]);
            out(['ok' => true, 'id' => $mid, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_mode':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $m = ($in['mode'] ?? '') === 'ai' ? 'ai' : 'human';
            q('UPDATE wx_chats SET mode=?, agent_name=? WHERE id=?', [$m, $m === 'human' ? $u['name'] : null, $c['id']]);
            chat_add((int)$c['id'], 'sys', '', $m === 'human' ? $u['name'] . ' joined the chat' : 'The assistant is back in this chat');
            out(['ok' => true, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_close':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0)); $open = !empty($in['reopen']);
            q('UPDATE wx_chats SET status=?, unread=0, needs=0 WHERE id=?', [$open ? 'open' : 'closed', $c['id']]); log_act($u, $open ? 'chat.reopen' : 'chat.close', '#' . $c['id']);
            out(['ok' => true, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_lead':
            $u = need($SALES); $c = chat_get((int)($in['id'] ?? 0));
            foreach (['name' => 120, 'phone' => 40, 'email' => 190] as $k => $n) if (isset($in[$k]) && trim((string)$in[$k]) !== '') { $c[$k] = mb_substr(trim((string)$in[$k]), 0, $n); q("UPDATE wx_chats SET $k=? WHERE id=?", [$c[$k], $c['id']]); }
            if (!$c['lead_id']) $c = chat_make_lead($c); log_act($u, 'chat.lead', '#' . $c['id']);
            out(['ok' => true, 'chat' => chat_pub(chat_get((int)$c['id']))]);
        case 'chat_cfg_get':
            need(['owner', 'admin']); out(['ok' => true, 'cfg' => chat_cfg(), 'aiReady' => (function () { $a = cms_load()['ai']; return ($a[$a['provider'] . 'Key'] ?? '') !== ''; })()]);
        case 'chat_cfg_save':
            $u = need(['owner', 'admin']); $s = is_array($in['cfg'] ?? null) ? $in['cfg'] : []; $c = chat_cfg();
            foreach (['on', 'ai', 'emailAlert', 'autoLead', 'waAgent'] as $k) if (array_key_exists($k, $s)) $c[$k] = !empty($s[$k]);
            foreach (['greeting' => 500, 'hours' => 80, 'knowledge' => 12000, 'toneNote' => 400, 'avoid' => 2000, 'prices' => 4000, 'afterHours' => 500, 'waGreeting' => 500, 'waVerify' => 80, 'waSecret' => 120] as $k => $n) if (array_key_exists($k, $s)) $c[$k] = mb_substr(trim((string)$s[$k]), 0, $n);
            if (isset($s['tone']) && isset(CHAT_TONES[$s['tone']])) $c['tone'] = $s['tone'];
            if (array_key_exists('noPrices', $s)) $c['noPrices'] = !empty($s['noPrices']);
            foreach (['openFrom', 'openTo'] as $k) if (isset($s[$k]) && preg_match('~^\d{2}:\d{2}$~', (string)$s[$k])) $c[$k] = $s[$k];
            if (isset($s['days']) && is_array($s['days'])) $c['days'] = array_values(array_unique(array_filter(array_map('intval', $s['days']), fn($d) => $d >= 0 && $d <= 6)));
            if (isset($s['qa']) && is_array($s['qa'])) { $c['qa'] = []; foreach (array_slice($s['qa'], 0, 150) as $x) { $qq = mb_substr(trim((string)($x['q'] ?? '')), 0, 300); $aa = mb_substr(trim((string)($x['a'] ?? '')), 0, 1500); if ($qq !== '' && $aa !== '') $c['qa'][] = ['q' => $qq, 'a' => $aa]; } }
            if (isset($s['quick']) && is_array($s['quick'])) { $c['quick'] = []; foreach (array_slice($s['quick'], 0, 8) as $x) { $l = mb_substr(trim((string)($x['label'] ?? '')), 0, 30); $tx = mb_substr(trim((string)($x['text'] ?? '')), 0, 300); if ($l !== '') $c['quick'][] = ['label' => $l, 'text' => $tx !== '' ? $tx : $l]; } }
            if (isset($s['saved']) && is_array($s['saved'])) { $c['saved'] = []; foreach (array_slice($s['saved'], 0, 60) as $x) { $k = mb_strtolower(preg_replace('~[^\w-]~u', '', (string)($x['k'] ?? ''))); $tx = mb_substr(trim((string)($x['t'] ?? '')), 0, 1500); if ($k !== '' && $tx !== '') $c['saved'][] = ['k' => mb_substr($k, 0, 20), 't' => $tx]; } }
            if ($c['waVerify'] === '') $c['waVerify'] = bin2hex(random_bytes(12));
            jwrite(CHAT_FILE, $c); log_act($u, 'chat.settings'); out(['ok' => true, 'cfg' => $c]);
        case 'chat_test': // training screen test box — nothing is saved
            need(['owner', 'admin']); $turns = [];
            foreach (array_slice((array)($in['turns'] ?? []), -16) as $x) { $t = mb_substr(trim((string)($x['text'] ?? '')), 0, 2000); if ($t !== '') $turns[] = ['role' => ($x['who'] ?? '') === 'user' ? 'user' : 'assistant', 'content' => $t]; }
            if (!$turns) fail('Type a test message');
            $a = cms_load()['ai']; if (($a[$a['provider'] . 'Key'] ?? '') === '') { // P40 A: no key → show what the rule answers would say
                $lu = ''; foreach ($turns as $x) if ($x['role'] === 'user') $lu = $x['content']; $rr = chat_rule_reply(['channel' => 'web', 'mode' => 'ai'], $lu);
                out(['ok' => true, 'reply' => trim(str_replace('[HUMAN]', '', $rr)) ?: '(No Q&A answer matched. With an AI key the assistant would answer; without one this question is logged under Unanswered.)', 'human' => strpos($rr, '[HUMAN]') !== false, 'rules' => true]); }
            $r = chat_ai_call(chat_ai_system(['channel' => in_array($in['channel'] ?? '', ['wa', 'tg'], true) ? $in['channel'] : 'web', 'page' => '/', 'name' => '', 'phone' => '']), $turns);
            if ($r === '') fail('The AI did not answer. Check the AI key and model.');
            $lead = preg_match('~\[LEAD\]\s*(\{[^{}]*\})~u', $r, $lm) ? (json_decode($lm[1], true) ?: null) : null; [$vis, $h] = chat_ai_post([], $r); out(['ok' => true, 'reply' => $vis, 'human' => $h, 'lead' => $lead]);
        case 'notif_poll': // bell: unread leads + chats waiting; items for the dropdown
            $u = need(); crm_migrate(); $items = [];
            $sales = in_array($u['role'], $SALES, true);
            $lu = $sales ? (int)q('SELECT COUNT(*) FROM wx_leads WHERE is_read=0')->fetchColumn() : 0;
            $cu = $sales ? (int)q("SELECT COUNT(*) FROM wx_chats WHERE status='open' AND (unread>0 OR needs=1)")->fetchColumn() : 0;
            if ($sales) {
                foreach (q("SELECT id,name,page,last_text,updated_at,unread,needs FROM wx_chats WHERE status='open' AND (unread>0 OR needs=1) ORDER BY updated_at DESC LIMIT 8")->fetchAll() as $r)
                    $items[] = ['kind' => 'chat', 'id' => (int)$r['id'], 't' => $r['updated_at'], 'title' => ($r['needs'] ? 'Needs a person · ' : 'Live chat · ') . ($r['name'] ?: 'Visitor #' . $r['id']), 'text' => (string)$r['last_text'], 'href' => '#/chat/' . $r['id']];
                foreach (q('SELECT id,name,source,service,created_at FROM wx_leads WHERE is_read=0 ORDER BY id DESC LIMIT 8')->fetchAll() as $r)
                    $items[] = ['kind' => 'lead', 'id' => (int)$r['id'], 't' => $r['created_at'], 'title' => 'New enquiry · ' . $r['name'], 'text' => (CRM_SOURCES[$r['source']] ?? $r['source']) . ($r['service'] ? ' · ' . $r['service'] : ''), 'href' => '#/leads'];
                // P18 D3: one feed — visits to confirm, payments (48 h), overdue invoices
                $bkMax = 0; $payN = 0;
                try { $bkMax = (int)q('SELECT COALESCE(MAX(id),0) FROM wx_bookings')->fetchColumn();
                    foreach (q("SELECT id,name,d,tm,type,created_at FROM wx_bookings WHERE status='pending' AND d>=? ORDER BY d,tm LIMIT 5", [date('Y-m-d')])->fetchAll() as $r)
                        $items[] = ['kind' => 'booking', 'id' => (int)$r['id'], 't' => $r['created_at'], 'title' => 'Visit to confirm · ' . $r['name'], 'text' => date('D j M', strtotime($r['d'])) . ' · ' . $r['tm'], 'href' => '#/bookings'];
                } catch (Throwable $e) { /* bookings not set up */ }
                try { $od = []; $cut = date('Y-m-d H:i:s', time() - 172800);
                    foreach (doc_all('wx_invoices') as $iv) { $iv = inv_pub($iv);
                        foreach ($iv['payments'] as $pm) { $payN++; if ((string)($pm['t'] ?? '') >= $cut) $items[] = ['kind' => 'payment', 'id' => (int)$iv['id'] * 1000 + (int)$pm['id'], 't' => (string)$pm['t'], 'title' => 'Payment received · Rs ' . number_format((int)$pm['amount']), 'text' => $iv['no'] . ' · ' . (string)($iv['client']['name'] ?? ''), 'href' => '#/invoice/' . $iv['id']]; }
                        if ($iv['overdue']) $od[] = $iv['no'] . ' (' . (string)($iv['client']['name'] ?? '') . ')'; }
                    if ($od) $items[] = ['kind' => 'overdue', 'id' => 0, 't' => date('Y-m-d') . ' 00:00:00', 'title' => count($od) . ' overdue invoice' . (count($od) > 1 ? 's' : ''), 'text' => implode(', ', array_slice($od, 0, 3)), 'href' => '#/invoices'];
                } catch (Throwable $e) { /* sales not set up */ }
                usort($items, fn($a, $b) => strcmp($b['t'], $a['t']));
            }
            $stamp = $sales ? (string)q('SELECT GREATEST(COALESCE((SELECT MAX(id) FROM wx_leads),0)*100000, 0) + COALESCE((SELECT MAX(id) FROM wx_chat_msgs WHERE who=\'visitor\'),0)')->fetchColumn() : '0';
            if ($sales) $stamp .= '.' . ($bkMax ?? 0) . '.' . ($payN ?? 0);
            out(['ok' => true, 'leads' => $lu, 'chats' => $cu, 'total' => $lu + $cu, 'items' => array_slice($items, 0, 20), 'stamp' => $stamp]);
    }
    return false;
}
