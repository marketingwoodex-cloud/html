<?php
/**
 * api/v2/lib/forms.php — the website's forms: what they say, where they send, and the estimator's rate book.
 *
 * v2.1 had one module for both (`p18e-lib.php`): per-form alert settings in `_private/forms.json`, and the
 * estimator's rate book written out as **JavaScript** (`assets/js/estimator-rates.js`, `window.WX_RATES`)
 * so the public page needs no API call. Both are here, and both keep that shape.
 *
 * One thing is deliberately different, and it is the reason this file is worth reading.
 *
 * v2.1's Forms screen listed six known forms and, for each, which pages carry it — by looking for evidence
 * of *its own* markup (`WXForms.send('contact')`, `data-form="contact"`, …). On this site that answer is
 * close to useless: the live pages post their enquiries to **Netlify functions**
 * (`/.netlify/functions/enquiry-submit`), so a form can be all over the site and never once reach
 * `wx_leads`. A screen that only knew its own patterns would show six forms, "0 submissions", and no
 * explanation — the worst kind of status, because it is true and misleading at the same time.
 *
 * So the reader answers three questions per page instead of one: which of this site's forms appear, which
 * **endpoint** each page's form actually posts to, and whether that endpoint is one whose leads land in
 * this console. A page whose form goes somewhere else is labelled as such, by address, with no code needed
 * from the reader to trust it.
 */

declare(strict_types=1);

/** The six forms on this website, by the id each one sends. v2.1's own list. */
const WX_FORMS_WEB = [
    'contact' => 'Contact form',
    'estimator' => 'Cost estimator',
    'brief' => '3D brief',
    'fitout-hub' => 'Fit-out quote',
    'office-fitout' => 'Office fit-out quote',
    'whatsapp' => 'WhatsApp widget',
];

/** The settings one form carries. Anything else in a request is ignored rather than stored. */
const WX_FORM_DEF = ['alertTo' => '', 'waTo' => '', 'waAlert' => true, 'reply' => true, 'replyText' => ''];

/**
 * BESIDES the id a form sends, the element id each form's markup actually carries on the live site.
 *
 * Not a guess and not a convention: every string here was read off the page in this repository, and the tests
 * assert against those same strings. They exist because a form that sends a v2.1 id would be found by the
 * patterns above, while the live pages do not send ids at all — they carry a form with an id and post
 * somewhere. Without this the estimator page, which *is* the estimator, would be reported as having no form.
 */
const WX_FORM_MARKS = [
    'contact' => ['ct-form'],
    'estimator' => ['est-form'],
    'brief' => ['brief-form'],
    'fitout-hub' => ['fitout-hub-form'],
    'office-fitout' => ['fitout-quote-form'],
    'whatsapp' => ['wx-wa-btn'],
];

/**
 * Endpoints a form on this site may post to, and what each one means for this console.
 *
 * A list rather than a guess: the reader names the address it found on the page, and this table says
 * whether the leads arrive. `lands` is the whole point — a form posting to a Netlify function does not
 * create a lead here, and the screen says so instead of showing a zero.
 */
const WX_FORM_ENDPOINTS = [
    '/api/forms.php' => ['label' => 'This site\'s API (api/forms.php)', 'lands' => true],
    '/api/v2/index.php?action=lead_create' => ['label' => 'This site\'s API (v2)', 'lands' => true],
    '/api/v2/leads' => ['label' => 'This site\'s API (v2)', 'lands' => true],
    '/.netlify/functions/enquiry-submit' => ['label' => 'A Netlify function', 'lands' => false],
    '/.netlify/functions/' => ['label' => 'A Netlify function', 'lands' => false],
    'formspree.io' => ['label' => 'Formspree', 'lands' => false],
    'mailto:' => ['label' => 'The visitor\'s mail app (mailto)', 'lands' => false],
];

/** The rate book, and the file the public estimator page reads it from. */
const WX_EST_REL = 'assets/js/estimator-rates.js';

/** The unit a service is priced by. v2.1 had exactly these two. */
const WX_EST_UNITS = ['sqft' => 'Area (sq ft)', 'views' => 'Number of views'];

/** The three finishes, in the order a quote presents them, cheapest first. */
const WX_EST_FINISHES = ['essential' => 'Essential', 'standard' => 'Standard', 'premium' => 'Premium'];

/* ============================================================ reading a page */

/**
 * Does this markup carry `id="…"` or `class="…"` with that exact token?
 *
 * Split on whitespace and compared whole, because `est-form` must not answer for `est-form-2`: a substring
 * test would put the estimator form on a page that only has a similar name, and the whole point of reading
 * the pages is that the answer can be believed.
 */
function wx_form_marked(string $html, string $mark): bool
{
    if (!preg_match_all('~(?:id|class)="([^"]*)"~i', $html, $m)) {
        return false;
    }
    foreach ($m[1] as $value) {
        foreach (preg_split('~\s+~', trim($value)) ?: [] as $token) {
            if ($token !== '' && strcasecmp($token, $mark) === 0) {
                return true;
            }
        }
    }
    return false;
}

/**
 * What one page says about forms: which of this site's forms appear, and where its enquiries go.
 *
 * Pure — it takes the HTML and returns a description, so the rule is testable on a literal (and it is
 * tested against strings lifted from the live pages).
 *
 * @return array{forms:string[], endpoints:string[], unmanaged:string[]}
 */
function wx_form_evidence(string $html): array
{
    $forms = [];
    foreach (array_keys(WX_FORMS_WEB) as $id) {
        $q = preg_quote($id, '~');
        if (preg_match('~WXForms\.send\(\s*["\']' . $q . '["\']|data-form=["\']' . $q . '["\']|name=["\']form["\']\s+value=["\']' . $q . '["\']|form:\s*["\']' . $q . '["\']~', $html)) {
            $forms[] = $id;
            continue;
        }
        foreach (WX_FORM_MARKS[$id] ?? [] as $mark) {
            if (wx_form_marked($html, $mark)) {
                $forms[] = $id;
                break;
            }
        }
    }

    $endpoints = [];
    foreach (WX_FORM_ENDPOINTS as $needle => $_) {
        if (stripos($html, $needle) !== false) {
            $endpoints[] = $needle;
        }
    }
    /* The table has one prefix entry (`/.netlify/functions/`) so an address nobody listed under that host is
       still recognised as a Netlify function. When a fuller entry matched too, the prefix is the same fact said
       twice — and saying it twice is how a screen ends up listing one form as two. */
    $endpoints = array_values(array_filter($endpoints, static function (string $e) use ($endpoints): bool {
        foreach ($endpoints as $other) {
            if ($other !== $e && str_starts_with($other, rtrim($e, '/') . '/')) {
                return false;
            }
        }
        return true;
    }));

    /* An address a page posts to that is not on the list: shown as itself rather than swallowed, because
       "somewhere I do not know" and "nowhere" are different facts and only one of them is a mistake. */
    $unmanaged = [];
    if (preg_match_all('~fetch\(\s*["\']([^"\']+)["\']~i', $html, $m)) {
        foreach ($m[1] as $url) {
            if (str_starts_with($url, 'http') || str_starts_with($url, '/')) {
                $known = false;
                foreach (array_keys(WX_FORM_ENDPOINTS) as $needle) {
                    if (stripos($url, $needle) !== false) {
                        $known = true;
                    }
                }
                if (!$known && preg_match('~submit|enquir|lead|contact|brief|quote|book~i', $url) && !in_array($url, $unmanaged, true)) {
                    $unmanaged[] = $url;
                }
            }
        }
    }

    return ['forms' => $forms, 'endpoints' => $endpoints, 'unmanaged' => $unmanaged];
}

/** Where the endpoints of a page send the enquiries, in words a person reads. */
function wx_form_landing(array $endpoints): array
{
    $label = '';
    $lands = false;
    foreach ($endpoints as $e) {
        if (isset(WX_FORM_ENDPOINTS[$e])) {
            $label = $label === '' ? WX_FORM_ENDPOINTS[$e]['label'] : $label;
            $lands = $lands || WX_FORM_ENDPOINTS[$e]['lands'];
            continue;
        }
        /* A prefix entry (`/.netlify/functions/`) covers addresses the exact table does not name. */
        foreach (WX_FORM_ENDPOINTS as $needle => $meta) {
            if (str_ends_with($needle, '/') && str_starts_with($e, $needle)) {
                $label = $label === '' ? $meta['label'] : $label;
                $lands = $lands || $meta['lands'];
            }
        }
    }
    if ($label === '') {
        $label = $endpoints ? 'Somewhere this console does not know' : 'Nothing — no form posts anywhere';
    }
    return ['label' => $label, 'lands' => $lands, 'endpoints' => array_values($endpoints)];
}

/**
 * Every page's forms, read from the pages themselves.
 *
 * One pass over the tree, the first 256 KB of each file: a form is in the body of a page, and reading 150
 * whole documents to find six forms would be work for nobody's benefit.
 *
 * @return array{pages:array<string,array>, byForm:array<string,string[]>}
 */
function wx_form_scan(int $limit = 400): array
{
    $pages = [];
    $byForm = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (count($pages) >= $limit) {
            break;
        }
        if (!wx_hero_rel_ok($rel) || preg_match('~^(404|500|503)\.html$~', $rel)) {
            continue;
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel, false, null, 0, 262_144);
        $found = wx_form_evidence($html);
        if (!$found['forms'] && !$found['endpoints'] && !$found['unmanaged']) {
            continue;
        }
        $landing = wx_form_landing($found['endpoints']);
        $where = wx_page_url($rel);
        foreach ($found['forms'] as $id) {
            $byForm[$id][] = $where;
        }
        $pages[] = [
            'rel' => $rel,
            'url' => $where,
            'forms' => $found['forms'],
            'formLabels' => array_map(static fn($id) => WX_FORMS_WEB[$id] ?? $id, $found['forms']),
            'endpoints' => array_values(array_merge($found['endpoints'], $found['unmanaged'])),
            'lands' => $landing['lands'],
            'landsLabel' => $landing['label'],
            'managed' => !$found['unmanaged'] && ($found['endpoints'] === [] || $landing['lands']),
        ];
    }
    usort($pages, static fn($a, $b) => strcmp($a['rel'], $b['rel']));
    return ['pages' => $pages, 'byForm' => $byForm];
}

/* ============================================================ the settings */

/** The saved settings, one entry per form, complete: a form added since the file was written still reads. */
function wx_form_cfg(): array
{
    $raw = wx_store('forms.json', true)->tryRead() ?? [];
    $saved = is_array($raw['forms'] ?? null) ? $raw['forms'] : [];
    $out = [];
    foreach (WX_FORMS_WEB as $id => $label) {
        $row = is_array($saved[$id] ?? null) ? $saved[$id] : [];
        $out[$id] = array_merge(WX_FORM_DEF, array_intersect_key($row, WX_FORM_DEF));
    }
    return $out;
}

/**
 * One form's settings, checked.
 *
 * The addresses are checked here and not in the browser because they are what the alert is sent to: a
 * typo means a lead nobody hears about. Numbers are kept as digits with a country code, which is what the
 * WhatsApp link needs and what v2.1 refused anything else for.
 */
function wx_form_clean(array $in, string $label): array
{
    $emails = [];
    foreach (preg_split('~[\s,;]+~', (string) ($in['alertTo'] ?? '')) ?: [] as $e) {
        $e = trim($e);
        if ($e === '') {
            continue;
        }
        if (!filter_var($e, FILTER_VALIDATE_EMAIL)) {
            throw ApiError::validation($label . ': "' . $e . '" is not an email address', 'alertTo');
        }
        $emails[] = strtolower($e);
    }
    $numbers = [];
    foreach (preg_split('~[,;\n]+~', (string) ($in['waTo'] ?? '')) ?: [] as $w) {
        $digits = (string) preg_replace('~\D~', '', $w);
        if ($digits === '') {
            continue;
        }
        if (strlen($digits) < 10 || strlen($digits) > 15) {
            throw ApiError::validation($label . ': the WhatsApp number "' . $digits . '" should be 10–15 digits with the country code, like 923224000768', 'waTo');
        }
        $numbers[] = $digits;
    }
    $reply = trim((string) ($in['replyText'] ?? ''));
    if (mb_strlen($reply) > 1000) {
        throw ApiError::validation($label . ': the auto-reply is longer than 1000 characters', 'replyText');
    }
    return [
        'alertTo' => implode(', ', array_slice(array_unique($emails), 0, 5)),
        'waTo' => implode(', ', array_slice(array_unique($numbers), 0, 5)),
        'waAlert' => !empty($in['waAlert']),
        'reply' => !empty($in['reply']),
        'replyText' => $reply,
    ];
}

/** Save the settings. Returns what was stored, read back — the same answer the screen will get. */
function wx_form_save(array $in, array $me): array
{
    $store = wx_store('forms.json', true)->tryRead() ?? [];
    $forms = is_array($store['forms'] ?? null) ? $store['forms'] : [];
    $touched = 0;
    foreach ((array) ($in['forms'] ?? []) as $id => $f) {
        if (!isset(WX_FORMS_WEB[$id]) || !is_array($f)) {
            continue;
        }
        $forms[$id] = wx_form_clean($f, WX_FORMS_WEB[$id]);
        $touched++;
    }
    if ($touched === 0) {
        throw ApiError::validation('Nothing to save — no form in that request', 'forms');
    }
    $store['forms'] = $forms;
    $store['savedAt'] = wx_now();
    $store['savedBy'] = (string) $me['name'];
    wx_store('forms.json')->write($store);
    wx_audit($me, 'forms.save', implode(',', array_keys((array) ($in['forms'] ?? []))), ['forms' => $touched]);
    return wx_form_cfg();
}

/** What the screen leads with: the settings, where each form appears, and how many leads arrived. */
function wx_form_report(): array
{
    $scan = wx_form_scan();
    $cfg = wx_form_cfg();
    $rows = [];
    foreach (WX_FORMS_WEB as $id => $label) {
        $pages = array_values(array_unique($scan['byForm'][$id] ?? []));
        $total = (int) wx_val('SELECT COUNT(*) FROM wx_leads WHERE source = ?', [$id]);
        $month = (int) wx_val('SELECT COUNT(*) FROM wx_leads WHERE source = ? AND created_at >= ?', [$id, gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
        $last = wx_val('SELECT created_at FROM wx_leads WHERE source = ? ORDER BY id DESC LIMIT 1', [$id]);
        $fields = ['name', 'phone', 'email', 'service', 'message'];
        foreach (wx_all('SELECT fields FROM wx_leads WHERE source = ? ORDER BY id DESC LIMIT 40', [$id]) as $row) {
            $decoded = json_decode((string) ($row['fields'] ?? ''), true);
            foreach (array_keys(is_array($decoded) ? $decoded : []) as $k) {
                if (!in_array($k, $fields, true) && count($fields) < 20) {
                    $fields[] = (string) $k;
                }
            }
        }
        $rows[] = [
            'id' => $id,
            'label' => $label,
            'pages' => array_slice($pages, 0, 40),
            'pageCount' => count($pages),
            'total' => $total,
            'month' => $month,
            'last' => $last === null ? null : (string) $last,
            'fields' => $fields,
            'cfg' => $cfg[$id],
            /* The WhatsApp widget is not markup in any page: `assets/site.js` loads it on every public page,
               and it opens WhatsApp rather than posting anywhere. Said here, once, so the screen does not
               have to explain an empty list as if something were broken. */
            'note' => $id === 'whatsapp'
                ? 'Loaded by assets/site.js on every public page. The widget opens WhatsApp — nothing is posted to this site.'
                : '',
        ];
    }
    return ['forms' => $rows, 'web' => WX_FORMS_WEB, 'scan' => ['pages' => $scan['pages']]];
}

/* ============================================================ the estimator */

/**
 * The rate book, checked.
 *
 * The rules are v2.1's, because they are the ones a person can get wrong in a way nobody notices until a
 * quote is wrong: every service needs a unique name that becomes a key; the three rates must rise
 * Essential ≤ Standard ≤ Premium and none may be zero; a catalog line must have a description.
 *
 * Pure: it takes the rate book and returns the clean one, so every rule is testable without a file or a
 * database.
 */
function wx_est_clean($r): array
{
    if (!is_array($r) || !is_array($r['services'] ?? null) || !is_array($r['finishes'] ?? null)) {
        throw ApiError::validation('The rate book needs a list of services and the three finish levels', 'services');
    }
    $int = static fn($v): int => max(0, min(100_000_000, (int) round((float) $v)));
    $services = [];
    $keys = [];
    foreach (array_slice($r['services'], 0, 20) as $s) {
        if (!is_array($s)) {
            continue;
        }
        $label = mb_substr(trim((string) ($s['label'] ?? '')), 0, 60);
        if ($label === '') {
            throw ApiError::validation('Every service needs a name', 'services');
        }
        $key = trim((string) preg_replace('~[^a-z0-9]+~', '-', strtolower((string) ($s['key'] ?? '') ?: $label)), '-');
        $key = substr($key, 0, 40);
        if ($key === '' || isset($keys[$key])) {
            throw ApiError::validation('Two services have the same name: ' . $label, 'services');
        }
        $keys[$key] = true;
        $rates = [
            'essential' => $int($s['rates']['essential'] ?? 0),
            'standard' => $int($s['rates']['standard'] ?? 0),
            'premium' => $int($s['rates']['premium'] ?? 0),
        ];
        if (!$rates['essential'] || $rates['essential'] > $rates['standard'] || $rates['standard'] > $rates['premium']) {
            throw ApiError::validation($label . ': the rates must be above zero and rise Essential ≤ Standard ≤ Premium', 'services');
        }
        $unit = ($s['unit'] ?? '') === 'views' ? 'views' : 'sqft';
        $services[] = [
            'key' => $key,
            'label' => $label,
            'hint' => mb_substr(trim((string) ($s['hint'] ?? '')), 0, 140),
            'unit' => $unit,
            'unitLabel' => mb_substr(trim((string) ($s['unitLabel'] ?? '')), 0, 40) ?: WX_EST_UNITS[$unit],
            'rates' => $rates,
        ];
    }
    if (!$services) {
        throw ApiError::validation('Add at least one service', 'services');
    }

    $byKey = [];
    foreach ($r['finishes'] as $f) {
        if (is_array($f)) {
            $byKey[(string) ($f['key'] ?? '')] = $f;
        }
    }
    $finishes = [];
    foreach (WX_EST_FINISHES as $k => $default) {
        $finishes[] = [
            'key' => $k,
            'label' => mb_substr(trim((string) ($byKey[$k]['label'] ?? '')), 0, 30) ?: $default,
            'hint' => mb_substr(trim((string) ($byKey[$k]['hint'] ?? '')), 0, 100),
        ];
    }

    $catalog = [];
    foreach (array_slice(is_array($r['catalog'] ?? null) ? $r['catalog'] : [], 0, 500) as $c) {
        if (!is_array($c)) {
            continue;
        }
        $desc = mb_substr(trim((string) ($c['desc'] ?? '')), 0, 300);
        if ($desc === '') {
            continue;
        }
        $catalog[] = [
            'cat' => mb_substr(trim((string) ($c['cat'] ?? '')), 0, 60),
            'desc' => $desc,
            'unit' => mb_substr(trim((string) ($c['unit'] ?? '')), 0, 20) ?: 'job',
            'rate' => $int($c['rate'] ?? 0),
        ];
    }

    $terms = [];
    foreach (array_slice(is_array($r['terms'] ?? null) ? $r['terms'] : [], 0, 20) as $t) {
        if (is_string($t) && trim($t) !== '') {
            $terms[] = mb_substr(trim($t), 0, 300);
        }
    }
    return ['services' => $services, 'finishes' => $finishes, 'catalog' => $catalog, 'terms' => $terms];
}

/**
 * The rate book as the public page reads it: `window.WX_RATES = {…};`
 *
 * It is JavaScript rather than JSON on purpose and that is v2.1's decision, kept: `/estimator/` reads
 * `window.WX_RATES` with no request at all, which is why the calculator works on a phone with one bar of
 * signal. The file is generated, never hand-written — and the header says so, because a hand-edited rate
 * book would be overwritten by the next save without warning.
 */
function wx_est_js(array $rates): string
{
    return "/* Woodex estimator rate book (PKR).\n"
        . "   Generated by the admin (Content → Estimator). Edits made here are overwritten by the next save —\n"
        . "   change the figures on that screen, not in this file.\n"
        . "   The /estimator/ page and the quotation builder both read from here. */\n"
        . 'window.WX_RATES = ' . json_encode($rates, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ";\n";
}

/**
 * The rate book out of the JavaScript that carries it: the assignment the file is written as, read back.
 *
 * Pure, so the round trip — write it, read it, get the same figures — is a test rather than a hope. The
 * comment header is not parsed: the reader looks for `window.WX_RATES`, takes everything after its `=`, and
 * stops at the last `;`, which is what the writer produces. A file in any other shape comes back null and the
 * caller refuses to touch it.
 */
function wx_est_parse(string $js): ?array
{
    $at = strpos($js, 'window.WX_RATES');
    if ($at === false) {
        return null;
    }
    $eq = strpos($js, '=', $at);
    if ($eq === false) {
        return null;
    }
    $json = substr($js, $eq + 1);
    $end = strrpos($json, ';');
    if ($end !== false) {
        $json = substr($json, 0, $end);
    }
    $rates = json_decode(trim($json), true);
    return is_array($rates) ? $rates : null;
}

/**
 * The rate book as it stands on disk. Null when the file is missing; refuses when it is not in this shape.
 *
 * The refusal matters more than the read. That file is what the live estimator page computes from: if it is
 * not the shape this screen writes, then this screen does not understand it, and editing it here would mean
 * overwriting figures somebody may be quoting from. So it says so by name and stops.
 */
function wx_est_read(): ?array
{
    $abs = WX_SITE_ROOT . '/' . WX_EST_REL;
    if (!is_file($abs)) {
        return null;
    }
    $rates = wx_est_parse((string) file_get_contents($abs));
    if ($rates === null) {
        throw ApiError::conflict('The rate book file (' . WX_EST_REL . ') is not in the shape this screen writes, so it will not be edited here — that file is what the live estimator reads.', ['file' => WX_EST_REL]);
    }
    return $rates;
}

/**
 * Point one page at the current rate book, or return null when it already does.
 *
 * v2.1 baked a fresh `?v=` stamp into every page that reads the file, one file write at a time. The rule is
 * the same; what changed is who does the writing (see `wx_est_write`). Returning null for an unchanged page is
 * what lets the page writer skip it and count it as skipped rather than churn the history with no-op versions.
 */
function wx_est_reload(string $html, string $version): ?string
{
    $next = (string) preg_replace('~/assets/js/estimator-rates\.js(\?v=[\w]+)?~', '/assets/js/estimator-rates.js?v=' . $version, $html);
    return $next === $html ? null : $next;
}

/** The rate book for the screen: the figures, who last touched them, and which pages load the file. */
function wx_est_report(): array
{
    $rates = wx_est_read();
    $pages = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (!wx_hero_rel_ok($rel)) {
            continue;
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel, false, null, 0, 262_144);
        if (str_contains($html, 'estimator-rates.js')) {
            $pages[] = wx_page_url($rel);
        }
    }
    $abs = WX_SITE_ROOT . '/' . WX_EST_REL;
    return [
        'rel' => WX_EST_REL,
        'url' => '/' . WX_EST_REL,
        'exists' => $rates !== null,
        'rates' => $rates,
        'bytes' => is_file($abs) ? (int) filesize($abs) : 0,
        'mtime' => is_file($abs) ? gmdate('Y-m-d H:i:s', (int) filemtime($abs)) : null,
        'pages' => $pages,
        'units' => WX_EST_UNITS,
        'finishes' => WX_EST_FINISHES,
    ];
}

/**
 * Write the rate book, and reload it on every page that reads it.
 *
 * The reload is the part v2.1 did with a loop of its own file writes — one write per page, each one
 * unnoticed by the page history and none of them undoable. Here it is `wx_page_write_many()`: the whole set
 * of touched pages is one batch, one entry in the page history, one undo. The version stamp in the query
 * string is what makes a browser pick the new figures up without being told to.
 */
function wx_est_write(array $rates, array $me): array
{
    $clean = wx_est_clean($rates);
    $was = wx_est_read();
    $js = wx_est_js($clean);
    $abs = WX_SITE_ROOT . '/' . WX_EST_REL;
    $before = is_file($abs) ? (int) filesize($abs) : 0;

    /* A copy of the previous file, in the same place and with the same name rule the pages use — a rate book
       is the numbers a quote is built from, so the last set has to be recoverable without a database. */
    if (is_file($abs)) {
        $dir = WX_PRIVATE_DIR . '/backups/' . wx_page_backup_slug(WX_EST_REL);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        @copy($abs, $dir . '/' . gmdate('Ymd-His') . '.js');
    }
    if (@file_put_contents($abs, $js, LOCK_EX) === false) {
        throw ApiError::conflict('The rate book file could not be written — check the permissions on ' . WX_EST_REL, ['file' => WX_EST_REL]);
    }

    /* Which pages read the rate book: found first, so the write is one call over one list. */
    $v = gmdate('ymdHi');
    $readers = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (!wx_hero_rel_ok($rel)) {
            continue;
        }
        $head = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel, false, null, 0, 262_144);
        if (str_contains($head, 'estimator-rates.js')) {
            $readers[] = $rel;
        }
    }
    $write = wx_page_write_many($readers, static fn(string $rel, string $html): ?string => wx_est_reload($html, $v), $me, 'estimator rates');

    wx_audit($me, 'estimator.save', count($clean['services']) . ' services', [
        'services' => count($clean['services']),
        'catalog' => count($clean['catalog']),
        'bytes' => strlen($js),
        'pages' => count($write['changed']),
        'batch' => $write['batch'],
    ]);
    return [
        'rates' => $clean,
        'before' => $before,
        'bytes' => strlen($js),
        'version' => $v,
        'pages' => $write['changed'],
        'batch' => $write['batch'],
        'changed' => count($write['changed']),
        'same' => $was !== null && json_encode($was) === json_encode($clean),
    ];
}

/* ============================================================ saved rate books */

/** The saved rate books (v2.1's P19 F8 templates), newest first. */
function wx_est_templates(): array
{
    $raw = wx_store('est-templates.json', true)->tryRead() ?? [];
    $list = is_array($raw['list'] ?? null) ? $raw['list'] : [];
    return array_values(array_filter($list, static fn($t) => is_array($t) && isset($t['name'])));
}

/**
 * Save the current figures under a name, or delete a saved set.
 *
 * A saved set is a copy of the whole rate book, which is the point: it is how somebody goes back to
 * "the figures we quoted from in March" without a database restore.
 */
function wx_est_template_save(string $name, $rates, bool $delete, array $me): array
{
    $name = mb_substr(trim($name), 0, 60);
    if ($name === '') {
        throw ApiError::validation('Give this set of figures a name', 'name');
    }
    $list = array_values(array_filter(wx_est_templates(), static fn($t) => (string) $t['name'] !== $name));
    if (!$delete) {
        $clean = wx_est_clean($rates);
        array_unshift($list, ['name' => $name, 'at' => wx_now(), 'by' => (string) $me['name'], 'rates' => $clean]);
    }
    wx_store('est-templates.json')->write(['list' => array_slice($list, 0, 20)]);
    wx_audit($me, $delete ? 'estimator.template_delete' : 'estimator.template', $name);
    return wx_est_templates();
}
