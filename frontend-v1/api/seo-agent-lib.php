<?php
/**
 * P41 — SEO agent. Scans every public page, lists problems by priority, asks the chosen AI engine
 * (Claude / OpenAI-Codex / Hermes via OpenRouter / local model) for fixes, and applies the ones you approve.
 *  - Never rewrites page body text by itself: titles, meta descriptions and image alt text only.
 *    Long-form content goes to Blog & insights (AI article fixer, SEO 70+).
 *  - Every apply backs the page up first (backup_page) and goes through Master approval for Managers (action ends in _save).
 *  - Weekly scan from the cron job; summary to Telegram.
 * State: _private/seo-agent.json { cfg: {engine, model, weekly}, last: {at, score, issues[]}, history: [...] }
 */
const SAG_FILE = PRIVATE_DIR . '/seo-agent.json';
const SAG_ENGINES = ['anthropic' => 'Claude (Anthropic)', 'openai' => 'OpenAI / Codex', 'openrouter' => 'Hermes (OpenRouter)', 'custom' => 'Local model (Ollama / LM Studio)'];
const SAG_SKIP = '~^(admin|builder|api|assets|_private|vendor|node_modules|deploy|uploads|tools)/~';

function sag_load(): array {
    $d = jread(SAG_FILE);
    $d['cfg'] = array_merge(['engine' => '', 'model' => '', 'weekly' => true], is_array($d['cfg'] ?? null) ? $d['cfg'] : []);
    $d['history'] = is_array($d['history'] ?? null) ? $d['history'] : [];
    return $d;
}
function sag_save(array $d): void { jwrite(SAG_FILE, $d); }

/** The AI settings with the agent's engine choice applied. */
function sag_ai(array $cfg): array {
    $a = cms_load()['ai'];
    if ($cfg['engine'] !== '' && isset(SAG_ENGINES[$cfg['engine']])) { $a['provider'] = $cfg['engine']; if ($cfg['model'] !== '') $a[$cfg['engine'] . 'Model'] = $cfg['model']; }
    return $a;
}
function sag_engines(): array {
    $a = cms_load()['ai']; $o = [];
    foreach (SAG_ENGINES as $k => $label) $o[] = ['id' => $k, 'label' => $label, 'ready' => ($a[$k . 'Key'] ?? '') !== '' || ($k === 'custom' && ($a['customUrl'] ?? '') !== ''), 'model' => (string)($a[$k . 'Model'] ?? '')];
    return ['list' => $o, 'default' => (string)$a['provider']];
}

function sag_pages(): array {
    $out = []; $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(ROOT_DIR, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (count($out) >= 400) break;
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen(ROOT_DIR) + 1));
        if (!preg_match('~\.html$~', $rel) || preg_match(SAG_SKIP, $rel) || preg_match('~(^|/)(404|offline|thank-you)[^/]*\.html$~', $rel) || str_contains($rel, '/_')) continue;
        $out[] = $rel;
    }
    sort($out); return $out;
}

/** Rule checks for one page. */
function sag_check(string $rel, array $seoPages, array &$titles, array &$descs): array {
    $h = (string)@file_get_contents(ROOT_DIR . '/' . $rel); if ($h === '' || preg_match('~<meta[^>]+name=["\']robots["\'][^>]+noindex~i', $h)) return [];
    $t = seo_text($h); $kw = trim((string)($seoPages[$rel]['kw'] ?? '')); $I = [];
    $add = function (string $kind, int $sev, string $msg, array $x = []) use (&$I, $rel) { $I[] = ['id' => substr(md5($rel . $kind . ($x['src'] ?? '')), 0, 10), 'page' => $rel, 'kind' => $kind, 'sev' => $sev, 'msg' => $msg] + $x; };
    $tl = mb_strlen($t['title']); $dl = mb_strlen($t['desc']);
    if ($tl === 0) $add('title', 3, 'Missing page title');
    elseif ($tl < 30) $add('title', 2, "Title is short ($tl characters, aim for 50-60)");
    elseif ($tl > 65) $add('title', 1, "Title is long ($tl characters): Google cuts it after about 60");
    if ($dl === 0) $add('desc', 3, 'Missing meta description');
    elseif ($dl < 110) $add('desc', 2, "Meta description is short ($dl characters, aim for 140-155)");
    elseif ($dl > 165) $add('desc', 1, "Meta description is long ($dl characters)");
    if ($t['title'] !== '') { $k = mb_strtolower($t['title']); if (isset($titles[$k])) $add('title', 2, 'Same title as ' . url_of($titles[$k])); else $titles[$k] = $rel; }
    if ($t['desc'] !== '') { $k = mb_strtolower($t['desc']); if (isset($descs[$k])) $add('desc', 2, 'Same description as ' . url_of($descs[$k])); else $descs[$k] = $rel; }
    $h1 = preg_match_all('~<h1\b~i', $h);
    if ($h1 === 0) $add('h1', 2, 'No H1 heading (fix in the page builder)', ['manual' => true]); elseif ($h1 > 1) $add('h1', 1, "$h1 H1 headings: keep one (fix in the page builder)", ['manual' => true]);
    if ($kw === '') $add('kw', 1, 'No focus keyphrase set', ['manual' => true]);
    else {
        $lk = mb_strtolower($kw);
        if (!str_contains(mb_strtolower($t['title']), $lk)) $add('title', 2, "Focus keyphrase \"$kw\" is not in the title");
        if (!str_contains(mb_strtolower($t['desc']), $lk)) $add('desc', 1, "Focus keyphrase \"$kw\" is not in the description");
    }
    $words = str_word_count(strip_tags($t['text'])); if ($words < 250 && !preg_match('~^(contact|thank|privacy|terms)~', $rel)) $add('thin', 1, "Thin content ($words words). Add useful text in the builder or Blog editor", ['manual' => true]);
    if (preg_match_all('~<img\b[^>]*>~i', $h, $m)) { $n = 0; foreach ($m[0] as $img) { if ($n >= 6) break; $alt = preg_match('~\salt\s*=\s*["\']([^"\']*)["\']~i', $img, $a) ? trim($a[1]) : null; $src = tag_attr($img, 'src'); if ($src === '' || $alt !== null || preg_match('~(logo|icon|sprite|pixel)~i', $src)) continue; /* alt="" = decorative, that is correct */ $add('alt', 1, 'Image without alt text: ' . basename(parse_url($src, PHP_URL_PATH) ?: $src), ['src' => $src]); $n++; } }
    if (!str_contains($h, 'application/ld+json')) $add('schema', 1, 'No structured data (add it in SEO manager → page → Schema)', ['manual' => true]);
    if (!preg_match('~<link[^>]+rel=["\']canonical~i', $h)) $add('canonical', 1, 'No canonical link', ['manual' => true]);
    return $I;
}

function sag_scan(): array {
    $sp = function_exists('seo_data') ? seo_data()['pages'] : []; $titles = []; $descs = []; $all = []; $pages = sag_pages();
    foreach ($pages as $rel) foreach (sag_check($rel, $sp, $titles, $descs) as $x) $all[] = $x;
    $u = []; foreach ($all as $x) $u[$x['id']] = $x; $all = array_values($u);
    usort($all, fn($a, $b) => $b['sev'] <=> $a['sev'] ?: strcmp($a['page'], $b['page']));
    $pen = 0; foreach ($all as $x) $pen += [1 => 1, 2 => 3, 3 => 6][$x['sev']];
    $score = max(0, min(100, (int)round(100 - $pen * 100 / max(1, count($pages) * 8))));
    return ['at' => now(), 'pages' => count($pages), 'score' => $score, 'issues' => array_slice($all, 0, 600), 'counts' => ['high' => count(array_filter($all, fn($x) => $x['sev'] === 3)), 'med' => count(array_filter($all, fn($x) => $x['sev'] === 2)), 'low' => count(array_filter($all, fn($x) => $x['sev'] === 1))]];
}

/** Ask the AI for a fix. kind: title | desc | alt */
function sag_propose(array $cfg, array $issue): array {
    $rel = rel_ok((string)$issue['page']); $h = (string)file_get_contents(ROOT_DIR . '/' . $rel); $t = seo_text($h);
    $kw = trim((string)(seo_data()['pages'][$rel]['kw'] ?? '')); $co = company_cfg();
    $sys = "You are a senior SEO specialist for {$co['name']}, an interior design and build studio in Lahore, Pakistan. Write for people in Pakistan searching on Google. " .
        "Rules: honest and specific; no prices, no 'best', 'No.1', 'guarantee', 'free', 'warranty'; never invent awards, clients or numbers; British English. Return ONLY JSON.";
    if ($issue['kind'] === 'alt') {
        $usr = "Write alt text (8-14 words, describes what is in the photo, include Lahore or the service only if natural) for this image on the page.\nPage title: {$t['title']}\nH1: {$t['h1']}\nImage file: " . basename((string)$issue['src']) . "\nNearby page text: " . mb_substr($t['text'], 0, 1200) . "\nJSON: {\"alt\":\"...\"}";
    } else {
        $usr = ($kw !== '' ? "Focus keyphrase (must appear, near the start of the title): $kw\n" : "Pick the best focus keyphrase people in Pakistan would search for this page.\n") .
            "Problem to fix: {$issue['msg']}\nURL: " . url_of($rel) . "\nCurrent title: {$t['title']}\nCurrent description: {$t['desc']}\nH1: {$t['h1']}\nPage text:\n" . mb_substr($t['text'], 0, 3500) .
            "\nJSON: {\"kw\":\"focus keyphrase\",\"title\":\"50-60 characters, ends with | Woodex Interior\",\"desc\":\"140-155 characters with a soft call to action\",\"why\":\"one short sentence\"}";
    }
    $raw = ai_call(sag_ai($cfg), $sys, $usr); $j = json_decode(preg_replace('~^[^{]*|[^}]*$~s', '', trim($raw)), true);
    if (!is_array($j)) fail('The AI answer could not be read. Try again or switch engine.');
    if ($issue['kind'] === 'alt') return ['alt' => mb_substr(trim(strip_tags((string)($j['alt'] ?? ''))), 0, 160)];
    return ['kw' => mb_substr(trim((string)($j['kw'] ?? $kw)), 0, 120), 'title' => mb_substr(trim(strip_tags((string)($j['title'] ?? ''))), 0, 90), 'desc' => mb_substr(trim(strip_tags((string)($j['desc'] ?? ''))), 0, 200), 'why' => mb_substr(trim((string)($j['why'] ?? '')), 0, 200), 'old' => ['title' => $t['title'], 'desc' => $t['desc']]];
}

/** Apply an approved fix (title + description, or one image alt). */
function sag_apply_fix(string $rel, array $fix): string {
    $rel = rel_ok($rel); $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); backup_page($rel);
    if (isset($fix['alt'])) {
        $src = (string)($fix['src'] ?? ''); $alt = trim(strip_tags((string)$fix['alt'])); if ($src === '' || $alt === '') fail('Nothing to apply');
        $n = 0; $h = preg_replace_callback('~<img\b[^>]*>~i', function ($m) use ($src, $alt, &$n) {
            if ($n || tag_attr($m[0], 'src') !== $src) return $m[0]; $n++;
            $tag = preg_replace('~\salt\s*=\s*(["\'])[^"\']*\1~i', '', $m[0]); return preg_replace('~^<img~i', '<img alt="' . hattr($alt) . '"', $tag);
        }, $h);
        if (!$n) fail('That image is no longer on the page');
    } else {
        $title = trim(strip_tags((string)($fix['title'] ?? ''))); $desc = trim(strip_tags((string)($fix['desc'] ?? '')));
        if ($title === '' && $desc === '') fail('Nothing to apply');
        if ($title !== '') { $tt = '<title>' . hattr($title) . '</title>'; $h = preg_match('~<title>.*?</title>~is', $h) ? preg_replace_callback('~<title>.*?</title>~is', fn() => $tt, $h, 1) : preg_replace_callback('~</head>~i', fn() => $tt . "\n</head>", $h, 1); $h = set_meta($h, 'property', 'og:title', $title); }
        if ($desc !== '') { $h = set_meta($h, 'name', 'description', $desc); $h = set_meta($h, 'property', 'og:description', $desc); }
        if (!empty($fix['kw'])) { $d = seo_data(); $p = $d['pages'][$rel] ?? []; if (trim((string)($p['kw'] ?? '')) === '') { $p['kw'] = mb_substr(trim((string)$fix['kw']), 0, 120); $p['t'] = now(); $d['pages'][$rel] = $p; jwrite(SEO_FILE, $d); } }
    }
    file_put_contents($abs, $h, LOCK_EX);
    // keep CMS-generated pages in sync so a re-publish does not undo the fix
    try { if (!isset($fix['alt'])) { $c = cms_load(); foreach ($c['items'] as $k => $it) if (($it['rel'] ?? '') === $rel) { if (!empty($fix['title'])) $c['items'][$k]['seo']['title'] = mb_substr($fix['title'], 0, 90); if (!empty($fix['desc'])) $c['items'][$k]['seo']['desc'] = mb_substr($fix['desc'], 0, 200); cms_save_file($c); break; } } } catch (Throwable $e) { error_log('sag cms: ' . $e->getMessage()); }
    return $rel;
}

/** Cron: weekly scan + Telegram summary. */
function sag_tick(): array {
    $d = sag_load(); if (empty($d['cfg']['weekly'])) return [];
    if ((string)($d['last']['at'] ?? '') > date('Y-m-d H:i:s', time() - 7 * 86400)) return [];
    try { $r = sag_scan(); } catch (Throwable $e) { error_log('sag tick: ' . $e->getMessage()); return []; }
    $prev = (int)($d['last']['score'] ?? $r['score']); $d['last'] = $r; $d['history'][] = ['at' => $r['at'], 'score' => $r['score'], 'issues' => count($r['issues'])]; $d['history'] = array_slice($d['history'], -26); sag_save($d);
    if (function_exists('tg_alert')) tg_alert('leads', '🔎 <b>Weekly SEO check</b> · score ' . $r['score'] . '/100 (' . ($r['score'] >= $prev ? '+' : '') . ($r['score'] - $prev) . ")\n" . $r['counts']['high'] . ' urgent · ' . $r['counts']['med'] . ' important · ' . $r['counts']['low'] . " minor\nOpen Admin → SEO agent to fix them.");
    return ['seoScan' => $r['score']];
}

function sag_actions(string $action, array $in): bool {
    if (!str_starts_with($action, 'sag_')) return false;
    $ED = ['owner', 'admin', 'editor'];
    switch ($action) {
        case 'sag_get':
            need($ED); $d = sag_load(); out(['ok' => true, 'cfg' => $d['cfg'], 'last' => $d['last'] ?? null, 'history' => $d['history'], 'engines' => sag_engines()]);
        case 'sag_cfg_save':
            $u = need(['owner', 'admin']); $d = sag_load(); $c = (array)($in['cfg'] ?? []);
            if (isset($c['engine'])) $d['cfg']['engine'] = isset(SAG_ENGINES[$c['engine']]) ? (string)$c['engine'] : '';
            if (isset($c['model'])) $d['cfg']['model'] = mb_substr(preg_replace('~[^\w.:/\-]~', '', (string)$c['model']), 0, 100);
            if (isset($c['weekly'])) $d['cfg']['weekly'] = (bool)$c['weekly'];
            sag_save($d); log_act($u, 'seo.agent.cfg', $d['cfg']['engine']); out(['ok' => true, 'cfg' => $d['cfg']]);
        case 'sag_scan':
            $u = need($ED); $d = sag_load(); $r = sag_scan(); $d['last'] = $r; $d['history'][] = ['at' => $r['at'], 'score' => $r['score'], 'issues' => count($r['issues'])]; $d['history'] = array_slice($d['history'], -26); sag_save($d);
            log_act($u, 'seo.agent.scan', (string)$r['score']); out(['ok' => true, 'last' => $r, 'history' => $d['history']]);
        case 'sag_propose':
            $u = need($ED); $d = sag_load(); $iss = (array)($in['issue'] ?? []); if (!in_array($iss['kind'] ?? '', ['title', 'desc', 'alt'], true)) fail('The agent can only write titles, descriptions and alt text. Fix this one by hand.');
            $r = sag_propose($d['cfg'], $iss); log_act($u, 'seo.agent.ai', (string)$iss['page']); out(['ok' => true, 'fix' => $r, 'engine' => SAG_ENGINES[sag_ai($d['cfg'])['provider']] ?? '']);
        case 'sag_fix_save':
            $u = need($ED); $rel = sag_apply_fix((string)($in['page'] ?? ''), (array)($in['fix'] ?? []));
            $d = sag_load(); if (!empty($d['last']['issues'])) { $ids = array_map('strval', (array)($in['ids'] ?? [])); $d['last']['issues'] = array_values(array_filter($d['last']['issues'], fn($x) => !in_array($x['id'], $ids, true))); sag_save($d); }
            log_act($u, 'seo.agent.apply', $rel); out(['ok' => true]);
    }
    return false;
}
