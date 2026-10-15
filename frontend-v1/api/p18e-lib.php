<?php
/**
 * P18 E — Content: Estimator (rate book used by /estimator/ and the quotation builder) and Forms (per-form alerts + auto-reply).
 * Estimator data lives in /assets/js/estimator-rates.js (window.WX_RATES) so the public page needs no API call.
 * Form settings: _private/forms.json  {forms: {contact: {alertTo, waAlert, reply, replyText}, ...}}
 */
const EST_FILE = 'assets/js/estimator-rates.js';
const FORMS_FILE = PRIVATE_DIR . '/forms.json';
const FORMS_WEB = ['contact' => 'Contact form', 'estimator' => 'Cost estimator', 'brief' => '3D brief', 'fitout-hub' => 'Fit-out quote', 'office-fitout' => 'Office fit-out quote', 'whatsapp' => 'WhatsApp widget'];
const FORM_DEF = ['alertTo' => '', 'waTo' => '', 'waAlert' => true, 'reply' => true, 'replyText' => ''];

function forms_cfg(): array { $f = jread(FORMS_FILE)['forms'] ?? []; $o = []; foreach (FORMS_WEB as $k => $l) $o[$k] = array_merge(FORM_DEF, is_array($f[$k] ?? null) ? $f[$k] : []); return $o; }
function form_cfg(string $id): array { return forms_cfg()[$id] ?? FORM_DEF; }

/** Validate the whole rate book; returns a clean array or fails. */
function est_clean($r): array {
    if (!is_array($r) || !is_array($r['services'] ?? null) || !is_array($r['finishes'] ?? null)) fail('Rate book is incomplete');
    $int = fn($v) => max(0, min(100000000, (int)round((float)$v)));
    $sv = []; $keys = [];
    foreach (array_slice($r['services'], 0, 20) as $s) {
        $label = clip($s['label'] ?? '', 60); if ($label === '') fail('Every service needs a name');
        $key = trim(preg_replace('~[^a-z0-9]+~', '-', strtolower((string)($s['key'] ?? '') ?: $label)), '-'); $key = substr($key, 0, 40);
        if ($key === '' || isset($keys[$key])) fail('Two services have the same name: ' . $label); $keys[$key] = 1;
        $rt = ['essential' => $int($s['rates']['essential'] ?? 0), 'standard' => $int($s['rates']['standard'] ?? 0), 'premium' => $int($s['rates']['premium'] ?? 0)];
        if (!$rt['essential'] || $rt['essential'] > $rt['standard'] || $rt['standard'] > $rt['premium']) fail("$label: rates must be above 0 and go up Essential ≤ Standard ≤ Premium");
        $unit = ($s['unit'] ?? '') === 'views' ? 'views' : 'sqft';
        $sv[] = ['key' => $key, 'label' => $label, 'hint' => clip($s['hint'] ?? '', 140), 'unit' => $unit, 'unitLabel' => clip($s['unitLabel'] ?? '', 40) ?: ($unit === 'views' ? 'Number of views' : 'Area (sq ft)'), 'rates' => $rt];
    }
    if (!$sv) fail('Add at least one service');
    $fin = []; $byKey = []; foreach ($r['finishes'] as $f) if (is_array($f)) $byKey[(string)($f['key'] ?? '')] = $f;
    foreach (['essential' => 'Essential', 'standard' => 'Standard', 'premium' => 'Premium'] as $k => $d) $fin[] = ['key' => $k, 'label' => clip($byKey[$k]['label'] ?? '', 30) ?: $d, 'hint' => clip($byKey[$k]['hint'] ?? '', 100)];
    $cat = []; foreach (array_slice(is_array($r['catalog'] ?? null) ? $r['catalog'] : [], 0, 500) as $c) { if (!is_array($c) || clip($c['desc'] ?? '', 300) === '') continue; $cat[] = ['cat' => clip($c['cat'] ?? '', 60), 'desc' => clip($c['desc'] ?? '', 300), 'unit' => clip($c['unit'] ?? '', 20) ?: 'job', 'rate' => $int($c['rate'] ?? 0)]; }
    $terms = []; foreach (array_slice(is_array($r['terms'] ?? null) ? $r['terms'] : [], 0, 20) as $t) if (is_string($t) && trim($t) !== '') $terms[] = clip($t, 300);
    return ['services' => $sv, 'finishes' => $fin, 'catalog' => $cat, 'terms' => $terms];
}
function est_write(array $r): void {
    $js = "/* Woodex estimator rate book (PKR). Edited in Admin → Content → Estimator (" . date('Y-m-d H:i') . ").\n   The /estimator/ page and the quotation builder both read from here. */\nwindow.WX_RATES = " . json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ";\n";
    if (is_file(ROOT_DIR . '/' . EST_FILE)) cms_file_backup(EST_FILE);
    file_put_contents(ROOT_DIR . '/' . EST_FILE, $js, LOCK_EX);
    // cache-bust every page that loads the rate book
    $v = date('ymdHi');
    foreach (a7_pages() as $rel) { $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); if (strpos($h, 'estimator-rates.js') === false) continue;
        $n = preg_replace('~/assets/js/estimator-rates\.js(\?v=[\w]+)?~', '/assets/js/estimator-rates.js?v=' . $v, $h); if ($n !== $h) file_put_contents($abs, $n, LOCK_EX); }
}

function p18e_actions(string $action, array $in): bool {
    if (!preg_match('~^(est_|forms_)~', $action)) return false;
    $OA = ['owner', 'admin'];
    switch ($action) {
        case 'est_save':
            $u = need($OA); $r = est_clean($in['rates'] ?? null); est_write($r); log_act($u, 'estimator.save', count($r['services']) . ' services');
            out(['ok' => true, 'rates' => $r]);
        case 'est_tpls': // P19 F8: saved rate books (templates)
            need($OA); out(['ok' => true, 'templates' => jread(PRIVATE_DIR . '/est-templates.json')['list'] ?? []]);
        case 'est_tpl_save':
            $u = need($OA); $L = jread(PRIVATE_DIR . '/est-templates.json')['list'] ?? []; $name = clip($in['name'] ?? '', 60);
            if (!empty($in['delete'])) { $L = array_values(array_filter($L, fn($t) => $t['name'] !== $name)); }
            else { if ($name === '') fail('Give the template a name'); $r = est_clean($in['rates'] ?? null); $L = array_values(array_filter($L, fn($t) => $t['name'] !== $name)); array_unshift($L, ['name' => $name, 'at' => now(), 'by' => $u['name'] ?? '', 'rates' => $r]); $L = array_slice($L, 0, 20); }
            jwrite(PRIVATE_DIR . '/est-templates.json', ['list' => $L]); log_act($u, 'estimator.template', $name); out(['ok' => true, 'templates' => $L]);
        case 'forms_get':
            need($OA); crm_migrate(); $cfg = forms_cfg(); $pages = []; $since = date('Y-m-d H:i:s', time() - 30 * 86400);
            foreach (a7_pages() as $rel) { $h = (string)file_get_contents(ROOT_DIR . '/' . $rel);
                foreach (array_keys(FORMS_WEB) as $id) { $q = preg_quote($id, '~');
                    if (preg_match('~WXForms\.send\(\s*["\']' . $q . '["\']|data-form="' . $q . '"|name="form"\s+value="' . $q . '"|form:\s*["\']' . $q . '["\']~', $h)) $pages[$id][] = '/' . preg_replace('~index\.html$~', '', $rel); } }
            $out = [];
            foreach (FORMS_WEB as $id => $label) {
                $tot = (int)q('SELECT COUNT(*) FROM wx_leads WHERE source=?', [$id])->fetchColumn(); $m = (int)q('SELECT COUNT(*) FROM wx_leads WHERE source=? AND created_at>=?', [$id, $since])->fetchColumn();
                $fields = ['name', 'phone', 'email', 'service', 'message'];
                foreach (q('SELECT fields FROM wx_leads WHERE source=? ORDER BY id DESC LIMIT 40', [$id])->fetchAll() as $row) foreach (array_keys((array)json_decode((string)$row['fields'], true)) as $k) if (!in_array($k, $fields, true) && count($fields) < 20) $fields[] = $k;
                $last = q('SELECT created_at FROM wx_leads WHERE source=? ORDER BY id DESC LIMIT 1', [$id])->fetchColumn();
                $out[] = ['id' => $id, 'label' => $label, 'total' => $tot, 'month' => $m, 'last' => $last ?: null, 'pages' => array_slice(array_values(array_unique($pages[$id] ?? [])), 0, 40), 'fields' => $fields, 'cfg' => $cfg[$id]];
            }
            $c = crm_cfg(); out(['ok' => true, 'forms' => $out, 'defaults' => ['emailTo' => $c['emailTo'], 'emailOn' => (bool)$c['emailOn'], 'waTo' => $c['waTo'], 'smtpReady' => $c['smtpHost'] !== '' && $c['smtpUser'] !== '', 'waOn' => (bool)$c['waOn'], 'waReady' => $c['waToken'] !== '' && $c['waPhoneId'] !== '']]);
        case 'forms_save':
            $u = need($OA); $all = jread(FORMS_FILE); $all['forms'] = $all['forms'] ?? [];
            foreach ((array)($in['forms'] ?? []) as $id => $f) {
                if (!isset(FORMS_WEB[$id]) || !is_array($f)) continue;
                $em = array_values(array_filter(preg_split('~[\s,;]+~', (string)($f['alertTo'] ?? ''))));
                foreach ($em as $e) if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fail(FORMS_WEB[$id] . ': "' . $e . '" is not a valid email');
                $wa = array_values(array_filter(array_map(fn($x) => preg_replace('~\D~', '', $x), preg_split('~[,;\n]+~', (string)($f['waTo'] ?? '')))));
                foreach ($wa as $w) if (strlen($w) < 10 || strlen($w) > 15) fail(FORMS_WEB[$id] . ': WhatsApp number "' . $w . '" should be 10-15 digits with country code, e.g. 923224000768');
                $all['forms'][$id] = ['alertTo' => implode(', ', array_slice($em, 0, 5)), 'waTo' => implode(', ', array_slice($wa, 0, 5)), 'waAlert' => !empty($f['waAlert']), 'reply' => !empty($f['reply']), 'replyText' => clip($f['replyText'] ?? '', 1000)];
            }
            if (is_array($in['defaults'] ?? null)) { // P19 F7: default alert email set from the Forms page
                $de = array_values(array_filter(preg_split('~[\s,;]+~', (string)($in['defaults']['emailTo'] ?? ''))));
                foreach ($de as $e) if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fail('Default alert email: "' . $e . '" is not a valid email');
                $cc = jread(CRM_FILE); $cc['emailTo'] = implode(', ', array_slice($de, 0, 5)); $cc['emailOn'] = !empty($in['defaults']['emailOn']) && $de; jwrite(CRM_FILE, $cc);
            }
            jwrite(FORMS_FILE, $all); log_act($u, 'forms.save', implode(',', array_keys((array)($in['forms'] ?? []))));
            out(['ok' => true, 'forms' => forms_cfg()]);
    }
    return false;
}
