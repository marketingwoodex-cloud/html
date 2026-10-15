<?php
/**
 * api/v2/lib/notify.php — what the client is told, and how honestly we can say it went.
 *
 * Ported from `notify-lib.php`: seven events, each with a subject and a bilingual body (English then
 * Urdu), each switchable, plus the project-stage updates that send themselves once per stage.
 *
 * The templates are copied verbatim. They are not placeholder text — they are what customers have been
 * receiving, in the language they read, and a rebuild that reworded them would be a change nobody asked
 * for. The `{name}`, `{company}`, `{ref}`, `{project}`, `{link}`, `{stage}` and `{phone}` fills are the
 * same seven v2.1 had, filled by wx_notify_fill().
 *
 * **What is different: nothing here claims to have sent anything.** v2.5 has no WhatsApp client and no
 * SMTP client yet — those arrive with the channel work, and until then every send records its result in
 * `wx_notify_log`: `queued` when the channel is configured (the row is the queue, and a worker will pick
 * it up), `not configured` when it is not, `skipped` when the client has no phone or email, and `off`
 * when someone turned that event off. The difference matters: a green tick over a message that never
 * left is how an operator stops trusting the screen, and v2.1 had exactly that bug in three places.
 *
 * The settings live in `wx_settings` under `notify.cfg` (v2.1 used `_private/notify.json`), which means
 * an owner's edits survive a deploy and are visible to the settings screen with no extra plumbing.
 */

declare(strict_types=1);

const WX_NOTIFY_SETTING = 'notify.cfg';

/** Same seven events, same keys, same labels. */
const WX_NOTIFY_EVENTS = [
    'lead' => 'Enquiry received',
    'quote' => 'Quotation sent',
    'started' => 'Work started',
    'handover' => 'Handover',
    'booking' => 'Booking confirmed',
    'remind' => 'Booking reminder (day before)',
    'stage' => 'Project progress (other stages, with photos)',
];

/** The shipped wording, verbatim from notify-lib.php, used until someone edits it on the settings screen. */
function wx_notify_defaults(): array
{
    return [
        'email' => true,
        'wa' => true,
        'waLang' => 'en',
        'ev' => [
            'lead' => ['on' => true, 'subject' => 'We received your enquiry: {company}', 'tpl' => '', 'text' =>
                "Dear {name},\nThank you for contacting {company}. We have received your enquiry and our team will call you shortly.\n\nمحترم {name}، {company} سے رابطہ کرنے کا شکریہ۔ ہمیں آپ کی درخواست موصول ہو گئی ہے، ہماری ٹیم جلد آپ سے رابطہ کرے گی۔\n\n{company} · {phone}"],
            'quote' => ['on' => true, 'subject' => 'Your quotation {ref} from {company}', 'tpl' => '', 'text' =>
                "Dear {name},\nYour quotation {ref} for {project} is ready. View it here: {link}\nPlease let us know if you have any questions.\n\nمحترم {name}، {project} کے لیے آپ کی کوٹیشن {ref} تیار ہے۔ یہاں دیکھیں: {link}\n\n{company} · {phone}"],
            'started' => ['on' => true, 'subject' => 'Work has started on {project}', 'tpl' => '', 'text' =>
                "Dear {name},\nGood news! Work has started on {project}. Our project team will keep you updated at every step.\n\nمحترم {name}، خوشخبری! {project} پر کام شروع ہو گیا ہے۔ ہماری ٹیم آپ کو ہر مرحلے سے آگاہ رکھے گی۔\n\n{company} · {phone}"],
            'handover' => ['on' => true, 'subject' => 'Your project {project} is ready', 'tpl' => '', 'text' =>
                "Dear {name},\n{project} is complete and ready for handover. Thank you for choosing {company}! We would love your feedback.\n\nمحترم {name}، {project} مکمل ہو گیا ہے اور حوالگی کے لیے تیار ہے۔ {company} کا انتخاب کرنے کا شکریہ!\n\n{company} · {phone}"],
            'booking' => ['on' => true, 'subject' => 'Confirmed: {ref}', 'tpl' => '', 'text' =>
                "Dear {name},\nYour {ref} is confirmed. Place: {project}.\nNeed to change it? Just reply to this message.\n\nمحترم {name}، آپ کی ملاقات ({ref}) کنفرم ہو گئی ہے۔ جگہ: {project}۔ تبدیلی کے لیے اسی پیغام کا جواب دیں۔\n\n{company} · {phone}"],
            'remind' => ['on' => true, 'subject' => 'Reminder: {ref}', 'tpl' => '', 'text' =>
                "Dear {name},\nA friendly reminder of your {ref} tomorrow. Place: {project}.\nSee you then!\n\nمحترم {name}، یاد دہانی: کل آپ کی ملاقات ({ref}) ہے۔ جگہ: {project}۔\n\n{company} · {phone}"],
            'stage' => ['on' => true, 'subject' => 'Progress update: {project}', 'tpl' => '', 'text' =>
                "Dear {name},\nProgress update on {project}: we are now at the {stage} stage.\nSite photos: {link}\n\nمحترم {name}، {project} کی تازہ صورتحال: اب کام {stage} کے مرحلے میں ہے۔\n\n{company} · {phone}", 'textNoPhotos' =>
                "Dear {name},\nProgress update on {project}: we are now at the {stage} stage.\nFollow the work: {link}\n\nمحترم {name}، {project} کی تازہ صورتحال: اب کام {stage} کے مرحلے میں ہے۔\n\n{company} · {phone}"],
        ],
    ];
}

/** Saved settings on top of the shipped wording, key by key — a half-filled event keeps the rest. */
function wx_notify_cfg(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $raw = wx_setting(WX_NOTIFY_SETTING, '');
    $saved = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    $cfg = wx_notify_defaults();
    if (is_array($saved)) {
        foreach (['email', 'wa'] as $k) {
            if (array_key_exists($k, $saved)) {
                $cfg[$k] = !empty($saved[$k]);
            }
        }
        if (isset($saved['waLang'])) {
            $cfg['waLang'] = preg_replace('~[^a-zA-Z_]~', '', (string) $saved['waLang']) ?: 'en';
        }
        foreach (array_keys(WX_NOTIFY_EVENTS) as $e) {
            if (isset($saved['ev'][$e]) && is_array($saved['ev'][$e])) {
                $cfg['ev'][$e] = array_merge($cfg['ev'][$e], array_intersect_key($saved['ev'][$e], $cfg['ev'][$e]));
            }
        }
    }
    return $cfg;
}

function wx_notify_fill(string $t, array $v): string
{
    $keys = [];
    $vals = [];
    foreach ($v as $k => $x) {
        $keys[] = '{' . $k . '}';
        $vals[] = (string) $x;
    }
    return strtr($t, array_combine($keys, $vals));
}

/**
 * Append the client's progress-page link to an outbound body — one place, so every event that carries it
 * carries the same sentence, and an empty link adds nothing rather than a dangling line.
 */
function wx_notify_with_page(string $body, string $page): string
{
    return $page === '' ? $body : rtrim($body) . "\n\nFollow the work: " . $page;
}

/**
 * The same wording without the line that carries `{link}` — what the client's page shows.
 *
 * Applied to the *template*, before any link is substituted, which is why it can be exact: the shipped
 * wording and every operator edit keep the placeholder, so "the line with the link in it" is a fact about
 * the text rather than a guess at what a URL looks like. On the page the photographs are on the page, and a
 * list of URLs under the message would be the same thing twice, once as text.
 */
function wx_notify_without_link(string $body): string
{
    $out = (string) preg_replace("~^[^\n]*\{link\}[^\n]*\n?~um", '', $body);
    /* Removing a line can leave the blank line that separated it from the next one doubled; on the page
       that is a visible gap, so it becomes one blank line. */
    return trim((string) preg_replace("~\n{3,}~", "\n\n", $out));
}

/**
 * A phone number in the one shape WhatsApp accepts: country code, digits only.
 *
 * Ported as-is, including the two Pakistani cases that matter — `03001234567` and `3001234567` both
 * become `923001234567`. Anything under ten digits is not a phone number and comes back empty, which is
 * how the caller learns there is nowhere to send.
 */
function wx_notify_pk(string $p): string
{
    $d = (string) preg_replace('~\D~', '', $p);
    if (str_starts_with($d, '00')) {
        $d = substr($d, 2);
    }
    if (str_starts_with($d, '0')) {
        $d = '92' . substr($d, 1);
    }
    return strlen($d) >= 10 ? $d : '';
}

/**
 * Whether v2.5 itself can carry a message. It cannot yet.
 *
 * This is not a placeholder — it is the truth the screens are built on. v2.1's sender (WhatsApp Cloud API
 * and SMTP, in `frontend-v1/api/notify-lib.php`) is still the live one, and the plan moves the channels in
 * Phase 4 with the WhatsApp suite. Until then this console **records** what should go out and **shares** it
 * on the client's own page — which needs no transport at all — and says in words that nothing has left by
 * WhatsApp or e-mail. Recording it as "queued" would be the one lie this project has consistently refused:
 * a studio that believes a client was told, when nobody was.
 */
const WX_NOTIFY_TRANSPORT = false;

/**
 * The events this build composes, as opposed to the ones still sent from v2.1's screens.
 *
 * The seven events are v2.1's, kept whole so the wording and the switches survive the move; but only the
 * project progress ones are wired here so far — a stage change sends `started`, `handover` or `stage`, and a
 * person writing an update sends `stage` again. Lead, quote, booking and reminder still belong to screens
 * that have not moved yet, and the notifications screen says which is which rather than showing seven
 * switches that all look equally live.
 */
const WX_NOTIFY_WIRED = ['started', 'handover', 'stage'];

/**
 * What to print next to a channel: could this message leave over it, and if not, why not.
 *
 * Two different noes, and the difference matters to whoever reads the log — "we have not connected WhatsApp"
 * is a task on the Connect screen, "no transport yet" is not a task at all, it is Phase 4.
 */
function wx_notify_channel_result(bool $configured, bool $transport = WX_NOTIFY_TRANSPORT): string
{
    if (!$configured) {
        return 'not configured';
    }
    return $transport ? 'sent' : 'no transport yet';
}

/**
 * What the screens need to say about sending: whether this build can carry a message, and who sends today.
 *
 * Kept as one function because three screens have to say the same sentence about it, and a sentence about
 * who is sending a customer's updates is not one to write three times.
 */
function wx_notify_transport_info(): array
{
    return ['ready' => WX_NOTIFY_TRANSPORT, 'sentBy' => 'v2.1', 'phase' => 4, 'wired' => WX_NOTIFY_WIRED];
}

/** Which channels are set up today. Read by the settings screen and by the send path. */
function wx_notify_ready(): array
{
    return [
        'whatsapp' => (string) (wx_setting('wa.token', '') ?? '') !== ''
            && (string) (wx_setting('wa.phone_id', '') ?? '') !== '',
        'email' => (string) (wx_setting('mail.from', '') ?? '') !== '',
    ];
}

function wx_notify_stage_label(string $s): string
{
    /* The wording a client reads in the middle of a sentence: "we are now at the {stage} stage".
       v2.1's labels, translated onto the stage names v2.5 uses. */
    $labels = [
        'planning' => 'planning', 'design' => 'design', 'production' => 'production',
        'installation' => 'installation', 'handover' => 'handover', 'closed' => 'completed',
    ];
    return $labels[$s] ?? $s;
}

/**
 * Send one event to one client, over whichever channels are configured.
 *
 * @param array $d  name, phone, email, ref, project, link, stage, tpl (an override body for this send)
 *
 * Never throws: a notification failing must not roll back the invoice it was about. Returns a small map
 * of what happened per channel, which the screens show verbatim — including `off` and `not configured`,
 * because those are the two answers an operator needs to see.
 */
function wx_notify_send(string $event, array $d, bool $force = false): array
{
    $res = [];
    try {
        $cfg = wx_notify_cfg();
        $ev = $cfg['ev'][$event] ?? null;
        if ($ev === null) {
            return ['error' => 'unknown event'];
        }
        if (empty($ev['on']) && !$force) {
            return ['skipped' => 'off'];
        }
        $ready = wx_notify_ready();
        $v = [
            'name' => trim((string) ($d['name'] ?? '')) !== '' ? trim((string) $d['name']) : 'Customer',
            'company' => (string) (wx_setting('company.name', 'Woodex Interior') ?? 'Woodex Interior'),
            'phone' => trim(preg_split('~[,·]~u', (string) (wx_setting('company.phones', '') ?? ''))[0] ?? ''),
            'ref' => (string) ($d['ref'] ?? ''),
            'project' => (string) ($d['project'] ?? '') !== '' ? (string) $d['project'] : 'your project',
            'link' => (string) ($d['link'] ?? ''),
            'stage' => (string) ($d['stage'] ?? ''),
        ];
        $page = (string) ($d['page'] ?? '');
        $body = trim((string) ($d['tpl'] ?? '')) !== '' ? (string) $d['tpl'] : (string) $ev['text'];
        /* The stage message has two shapes, and which one is right follows from what exists: with photos,
           the shipped wording with their links; with none yet, the same words pointing at the client's
           progress page instead — because a stage nobody photographed still has a page, and an empty line
           where a link belongs is worse than either. */
        if ($v['link'] === '' && $page !== '' && $body === (string) $ev['text'] && !empty($ev['textNoPhotos'])) {
            $body = (string) $ev['textNoPhotos'];
            $v['link'] = $page;
            $page = '';
        }
        /* A body with {link} in it but no link to put there loses that line rather than printing a
           dangling "View it here:" — v2.1's rule, kept because the alternative reads badly. */
        if ($v['link'] === '') {
            $body = wx_notify_without_link($body);
        }
        /* Two texts from one template: the message, and the words for the client's page — the same words
           without the line that was pointing at the photographs, because there the photograph is the
           page. Filling twice from an exact template beats regexing a filled message for URLs. */
        $pageBody = wx_notify_fill(wx_notify_without_link($body), $v);
        $body = wx_notify_with_page(wx_notify_fill($body, $v), $page);
        $res['page_text'] = $pageBody;
        /* Did anything actually leave? A caller must not mark "the client has been told" on the strength of a
           row in a log: with no transport, the record is the studio's to-do list, not a message. */
        $res['carried'] = in_array('sent', array_values($res), true);

        $wa = wx_notify_pk((string) ($d['phone'] ?? ''));
        if (!empty($cfg['wa']) && $wa !== '') {
            $result = wx_notify_channel_result($ready['whatsapp']);
            $res['whatsapp'] = $result;
            wx_notify_log($event, $v, 'wa', '+' . $wa, $result);
        }
        $email = trim((string) ($d['email'] ?? ''));
        if (!empty($cfg['email']) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $result = wx_notify_channel_result($ready['email']);
            $res['email'] = $result;
            wx_notify_log($event, $v, 'email', $email, $result);
        }
        if (!$res) {
            $res['skipped'] = 'no phone or email';
        }
    } catch (Throwable $e) {
        error_log('[wx-v2] notify ' . $event . ': ' . $e->getMessage());
        $res['error'] = $e->getMessage();
    }
    return $res;
}

/** One row per attempt, in v2.1's table and shape — the record the notifications screen lists. */
function wx_notify_log(string $event, array $v, string $channel, string $dest, string $result): void
{
    wx_insert('wx_notify_log', [
        't' => wx_now(),
        'event' => mb_substr($event, 0, 12),
        'ref' => mb_substr((string) $v['ref'], 0, 120),
        'name' => mb_substr((string) $v['name'], 0, 160),
        'channel' => $channel,
        'dest' => mb_substr($dest, 0, 190),
        'result' => mb_substr($result, 0, 255),
    ]);
}

/**
 * Who a document is about: the linked client first, then the quotation's client details.
 *
 * v2.1's notify_proj_contact(), and the order matters — a project's client row is the current truth,
 * while the quotation's embedded client is what was typed on the day of the quote.
 */
function wx_notify_contacts(array $doc): array
{
    $d = [
        'name' => (string) ($doc['client_name'] ?? ''),
        'phone' => '',
        'email' => '',
        'ref' => (string) ($doc['no'] ?? ''),
        'project' => (string) ($doc['name'] ?? ''),
    ];
    if (!empty($doc['client_id'])) {
        $c = wx_one('SELECT name, phone, email FROM wx_clients WHERE id = ?', [(int) $doc['client_id']]);
        if ($c !== null) {
            $d['name'] = (string) ($c['name'] ?? '') !== '' ? (string) $c['name'] : $d['name'];
            $d['phone'] = (string) ($c['phone'] ?? '');
            $d['email'] = (string) ($c['email'] ?? '');
        }
    }
    if ($d['phone'] === '' && $d['email'] === '' && !empty($doc['quote_id'])) {
        $row = wx_one('SELECT ' . wx_doc_payload_sql('wx_quotes') . ' FROM wx_quotes WHERE id = ?', [(int) $doc['quote_id']]);
        $q = $row !== null ? json_decode((string) $row['payload'], true) : null;
        if (is_array($q)) {
            $d['phone'] = (string) ($q['client']['phone'] ?? '');
            $d['email'] = (string) ($q['client']['email'] ?? '');
        }
    }
    return $d;
}

/**
 * The site-relative paths of up to three photos, newest first: the current stage's, or the ones named.
 *
 * Kept separate from the link building because two different things want them — the message wants absolute
 * URLs, and the client's page wants the path it can put straight in an `img`. One picker, so the photo the
 * page shows is the photo the message linked to.
 */
function wx_notify_photo_paths(array $p, array $only = []): array
{
    $out = [];
    foreach (array_reverse((array) ($p['photos'] ?? [])) as $ph) {
        $url = (string) ($ph['url'] ?? '');
        if ($url === '') {
            continue;
        }
        if ($only ? !in_array($url, $only, true) : ((string) ($ph['stage'] ?? '') !== (string) ($p['stage'] ?? ''))) {
            continue;
        }
        $out[] = $url;
        if (count($out) >= 3) {
            break;
        }
    }
    return $out;
}

/** The same photos as a message reads them: absolute, space-separated. */
function wx_notify_photos(array $p, array $only = []): string
{
    $base = rtrim((string) (wx_setting('site.url', 'https://woodex.com.pk') ?? 'https://woodex.com.pk'), '/');
    return implode(' ', array_map(static fn(string $u): string => $base . $u, wx_notify_photo_paths($p, $only)));
}

/**
 * A project changed stage: tell the client, once per stage, never twice.
 *
 * The `notified` marks live in the project document (as they did in v2.1), so a project that has already
 * told its client "work has started" never does it again — even if the stage is moved back and forward by
 * someone experimenting. The mark is set only when a message actually left (see WX_NOTIFY_TRANSPORT): a
 * recorded-but-unsent update is the studio's to-do list, not a client who has been told.
 */
function wx_notify_project_stage(array $p, string $before): array
{
    $order = array_flip(WX_PROJECT_STAGES);
    $now = $order[(string) $p['stage']] ?? 0;
    $was = $order[$before] ?? 0;
    if ($now <= $was) {
        return $p;
    }
    $marks = is_array($p['notified'] ?? null) ? $p['notified'] : [];
    /* The client's own page, so every message can end with the one link that shows the work. */
    $page = wx_cv_link($p);
    $stageLabel = wx_notify_stage_label((string) $p['stage']);
    /* Two named events, and the rest are progress updates. `production` is where work visibly starts
       (v2.1 called it execution, and the message a client receives is the same one). */
    $event = $now >= $order['handover'] ? 'handover' : ($now >= $order['production'] ? 'started' : '');
    if ($event !== '' && empty($marks[$event])) {
        $r = wx_notify_send($event, wx_notify_contacts($p) + ['page' => $page]);
        if (($r['skipped'] ?? '') === 'off') {
            return $p;
        }
        /* The mark means "this client has been told". Only a message that left earns it — with no transport
           yet, marking it would silence that news for good the day the channels are connected. */
        if (!empty($r['carried'])) {
            $marks[$event] = wx_now();
            $p['notified'] = $marks;
        }
        $p = wx_cv_note($p, $r, $stageLabel, '');
        return wx_doc_put('wx_projects', $p);
    }
    $key = 'stage:' . (string) $p['stage'];
    /* The two stages that already sent their own event do not also send a progress update. */
    if (!empty($marks[$key]) || in_array((string) $p['stage'], ['production', 'handover'], true)) {
        return $p;
    }
    $photos = wx_notify_photo_paths($p);
    $r = wx_notify_send('stage', wx_notify_contacts($p) + [
        'stage' => $stageLabel,
        'link' => wx_notify_photos($p),
        'page' => $page,
    ]);
    if (($r['skipped'] ?? '') === 'off') {
        return $p;
    }
    if (!empty($r['carried'])) {
        $marks[$key] = wx_now();
        $p['notified'] = $marks;
    }
    $p = wx_cv_note($p, $r, $stageLabel, (string) ($photos[0] ?? ''));
    return wx_doc_put('wx_projects', $p);
}

/**
 * Write one progress update onto a project — and, when it is meant for the client, send it and keep what
 * was sent.
 *
 * This is the single path behind both places a person can post an update: the project screen's box and the
 * notifications screen's "send now". Two entry points, one behaviour — otherwise "did the client see this?"
 * would depend on which button someone pressed, and the two would drift the first time either changed.
 *
 * @param array  $p        the project document
 * @param string $user     the name to record against an internal entry
 * @param string $note     the words, or '' when the update is only a photograph
 * @param array  $photos   site-relative paths the person picked; empty means the current stage's photos
 * @param bool   $toClient send it and keep the sent words as a client-visible entry
 *
 * @return array{project: array, result: array, photos: array} the project with its new entries, what the
 *         channels did (empty when nothing was sent), and the photos the message carried
 */
function wx_proj_update_post(array $p, string $user, string $note, array $photos, bool $toClient): array
{
    $picked = [];
    foreach ($photos as $url) {
        if (preg_match('~^/assets/uploads/projects/[a-z0-9._-]+$~i', (string) $url)) {
            $picked[] = (string) $url;
        }
    }
    $p['updates'] = is_array($p['updates'] ?? null) ? $p['updates'] : [];
    $result = [];
    $carried = [];
    if ($toClient) {
        $stageLabel = wx_notify_stage_label((string) ($p['stage'] ?? ''));
        $carried = $picked ?: wx_notify_photo_paths($p);
        $tpl = $note !== '' ? "Dear {name},\n" . $note . "\nSite photos: {link}\n\n{company} · {phone}" : '';
        $result = wx_notify_send('stage', wx_notify_contacts($p) + [
            'stage' => $stageLabel,
            'link' => $picked ? wx_notify_photos($p, $picked) : wx_notify_photos($p),
            'page' => wx_cv_link($p),
        ] + ($tpl !== '' ? ['tpl' => $tpl] : []), true);
        if (($result['skipped'] ?? '') === 'no phone or email') {
            throw ApiError::validation('This project has no client phone number or email address yet', 'photos');
        }
        /* What the client was told first — their page renders this row — then what the channels did with it. */
        $p = wx_cv_note($p, $result, $stageLabel, (string) ($carried[0] ?? ''));
        $what = [];
        foreach (array_intersect_key($result, ['whatsapp' => 1, 'email' => 1]) as $channel => $channelResult) {
            $what[] = $channel . ': ' . $channelResult;
        }
        $p['updates'][] = [
            't' => wx_now(),
            'user' => $user,
            'text' => 'Progress update sent to the client'
                . ($carried ? ' with ' . count($carried) . ' photo' . (count($carried) > 1 ? 's' : '') : '')
                . ($what ? ' (' . implode(', ', $what) . ')' : ''),
            'sys' => true,
        ];
    } else {
        $entry = ['t' => wx_now(), 'user' => $user, 'text' => $note];
        if ($picked) {
            $entry['photo'] = $picked[0];
        }
        $p['updates'][] = $entry;
    }
    $p['updates'] = array_slice($p['updates'], -500);
    return ['project' => $p, 'result' => $result, 'photos' => $carried];
}

/**
 * Keep what the client was told, in the project, as an update they can read.
 *
 * This is the record and the message at once: the words are the words that were sent (`page_text`, the same
 * message without the photo list, because the page shows the photograph itself), and `toClient` is what puts
 * the row on the client's page. Internal notes never get that mark.
 *
 * @param array  $p         the project document
 * @param array  $r         the result of wx_notify_send(), whose `page_text` is the wording for the page
 * @param string $stage     the stage label the message named
 * @param string $photo     a site-relative path to the photo the message linked to, or ''
 */
function wx_cv_note(array $p, array $r, string $stage, string $photo): array
{
    $text = trim((string) ($r['page_text'] ?? ''));
    if ($text === '') {
        return $p;
    }
    $p['updates'] = is_array($p['updates'] ?? null) ? $p['updates'] : [];
    $p['updates'][] = [
        't' => wx_now(),
        'user' => (string) (wx_setting('company.name', 'Woodex Interior') ?? 'Woodex Interior'),
        'text' => $text,
        'stage' => $stage,
        'photo' => $photo,
        'toClient' => true,
        'sys' => true,
    ];
    /* A long project's feed is a log, not an archive — the same cap v2.1 kept. */
    $p['updates'] = array_slice($p['updates'], -500);
    return $p;
}
