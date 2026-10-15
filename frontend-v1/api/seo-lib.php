<?php
/**
 * Phase 13: Yoast-style SEO manager.
 * Per-page focus + related keyphrases, stored scores, managed schema block, AI suggestions, robots.txt, sitemap.
 * Data: _private/seo.json  { pages: { rel: { kw, related[], schema[], seo, read, t } } }
 * Page title / description / OG / canonical / noindex are still saved by page_meta_save (admin.php).
 */
const SEO_FILE = PRIVATE_DIR . '/seo.json';
const SEO_SCHEMAS = ['LocalBusiness', 'Service', 'Article', 'FAQPage', 'BreadcrumbList'];

function seo_data(): array { $d = jread(SEO_FILE); $d['pages'] = $d['pages'] ?? []; return $d; }
function seo_text(string $html): array {
    $h = preg_replace('~<(script|style|noscript|template)\b.*?</\1>~is', ' ', $html);
    $h = preg_replace('~<header class="site-header".*?</header>|<nav class="mobile-panel".*?</nav>|<footer\b.*?</footer>~is', ' ', $h);
    $title = preg_match('~<title>(.*?)</title>~is', $html, $m) ? trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5)) : '';
    $h1 = preg_match('~<h1\b[^>]*>(.*?)</h1>~is', $h, $m) ? trim(preg_replace('~\s+~', ' ', html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5))) : '';
    $desc = ($m = find_meta($html, 'name', 'description')) ? tag_attr($m, 'content') : '';
    $txt = trim(preg_replace('~\s+~u', ' ', html_entity_decode(strip_tags(preg_replace('~<(br|/p|/h\d|/li|/div)>~i', "$0 ", $h)), ENT_QUOTES | ENT_HTML5)));
    return ['title' => $title, 'h1' => $h1, 'desc' => $desc, 'text' => $txt];
}
/** Schema types already on the page (ignores our managed block). */
function seo_existing_types(string $html): array {
    $html = preg_replace('~<script type="application/ld\+json" id="wx-seo-schema">.*?</script>~is', '', $html); $t = [];
    if (preg_match_all('~<script[^>]+application/ld\+json[^>]*>(.*?)</script>~is', $html, $mm)) foreach ($mm[1] as $js) {
        $walk = function ($o) use (&$walk, &$t) { if (!is_array($o)) return; if (isset($o['@type'])) foreach ((array)$o['@type'] as $x) $t[] = (string)$x; foreach ($o as $v) if (is_array($v)) $walk($v); };
        $walk(json_decode(trim($js), true));
    }
    return array_values(array_unique($t));
}
function seo_faq(string $html): array {
    $out = [];
    if (preg_match_all('~<details\b[^>]*>\s*<summary\b[^>]*>(.*?)</summary>(.*?)</details>~is', $html, $mm, PREG_SET_ORDER)) foreach ($mm as $m) {
        $q = trim(preg_replace('~\s+~', ' ', html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5))); $a = trim(preg_replace('~\s+~', ' ', html_entity_decode(strip_tags($m[2]), ENT_QUOTES | ENT_HTML5)));
        if ($q !== '' && $a !== '') $out[] = ['@type' => 'Question', 'name' => mb_substr($q, 0, 300), 'acceptedAnswer' => ['@type' => 'Answer', 'text' => mb_substr($a, 0, 1500)]];
    }
    return array_slice($out, 0, 20);
}
/** Build + write the managed JSON-LD block for the chosen types (skips types the page already has). */
function seo_apply_schema(string $rel, array $types): array {
    $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); $have = seo_existing_types($h); $co = company_cfg(); $t = seo_text($h);
    $base = 'https://' . preg_replace('~[^a-z0-9.\-:]~i', '', (string)($co['web'] ?: 'woodex.com.pk')); $url = $base . url_of($rel);
    $og = ($m = find_meta($h, 'property', 'og:image')) ? tag_attr($m, 'content') : ''; if ($og !== '' && $og[0] === '/') $og = $base . $og;
    $biz = ['@type' => 'LocalBusiness', '@id' => $base . '/#business', 'name' => $co['name'], 'url' => $base . '/', 'telephone' => trim(preg_split('~[,·]~u', (string)$co['phones'])[0] ?? ''), 'email' => $co['email'],
        'address' => ['@type' => 'PostalAddress', 'streetAddress' => $co['address'], 'addressLocality' => 'Lahore', 'addressCountry' => 'PK'], 'priceRange' => 'PKR'] + ($og ? ['image' => $og] : []);
    $g = []; $added = [];
    foreach (array_intersect(SEO_SCHEMAS, $types) as $ty) {
        if (in_array($ty, $have, true)) continue;
        if ($ty === 'LocalBusiness') $g[] = $biz;
        if ($ty === 'Service') $g[] = ['@type' => 'Service', 'name' => $t['h1'] ?: $t['title'], 'description' => $t['desc'], 'url' => $url, 'areaServed' => 'Pakistan', 'provider' => ['@id' => $base . '/#business', '@type' => 'LocalBusiness', 'name' => $co['name']]];
        if ($ty === 'Article') $g[] = ['@type' => 'Article', 'headline' => mb_substr($t['h1'] ?: $t['title'], 0, 110), 'description' => $t['desc'], 'mainEntityOfPage' => $url, 'dateModified' => date('c', filemtime($abs)), 'author' => ['@type' => 'Organization', 'name' => $co['name']], 'publisher' => ['@type' => 'Organization', 'name' => $co['name']]] + ($og ? ['image' => $og] : []);
        if ($ty === 'FAQPage') { $f = seo_faq($h); if ($f) $g[] = ['@type' => 'FAQPage', 'mainEntity' => $f]; else continue; }
        if ($ty === 'BreadcrumbList') { $parts = array_values(array_filter(explode('/', trim(url_of($rel), '/')))); $items = [['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $base . '/']]; $acc = '';
            foreach ($parts as $k => $p) { $acc .= '/' . $p; $items[] = ['@type' => 'ListItem', 'position' => $k + 2, 'name' => $k === count($parts) - 1 && $t['h1'] ? $t['h1'] : ucwords(str_replace('-', ' ', $p)), 'item' => $base . $acc . '/']; }
            if (count($items) < 2) continue; $g[] = ['@type' => 'BreadcrumbList', 'itemListElement' => $items]; }
        $added[] = $ty;
    }
    $h = preg_replace('~\s*<script type="application/ld\+json" id="wx-seo-schema">.*?</script>~is', '', $h);
    if ($g) { $js = '<script type="application/ld+json" id="wx-seo-schema">' . json_encode(['@context' => 'https://schema.org', '@graph' => $g], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) . '</script>';
        $h = preg_replace_callback('~</head>~i', fn() => $js . "\n</head>", $h, 1); }
    file_put_contents($abs, $h, LOCK_EX);
    return ['added' => $added, 'existing' => $have];
}

function seo_actions(string $action, array $in): bool {
    if (!str_starts_with($action, 'seo_')) return false;
    $ED = ['owner', 'admin', 'editor'];
    switch ($action) {
        case 'seo_list':
            need($ED); $d = seo_data(); $hl = is_file(PRIVATE_DIR . '/health.json') ? jread(PRIVATE_DIR . '/health.json') : [];
            $scan = $hl['scan'] ?? null; $broken = 0; if ($scan) foreach (($scan['issues'] ?? []) as $x) if (($x['type'] ?? '') === 'link') $broken++;
            $sm = is_file(ROOT_DIR . '/sitemap.xml') ? substr_count((string)file_get_contents(ROOT_DIR . '/sitemap.xml'), '<loc>') : 0;
            out(['ok' => true, 'pages' => (object)$d['pages'], 'robots' => is_file(ROOT_DIR . '/robots.txt') ? (string)file_get_contents(ROOT_DIR . '/robots.txt') : '', 'sitemap' => $sm,
                'scanAt' => $scan['at'] ?? null, 'broken' => $broken, 'schemas' => SEO_SCHEMAS, 'aiReady' => (function () { $a = cms_load()['ai']; return ($a[$a['provider'] . 'Key'] ?? '') !== ''; })()]);
        case 'seo_page': // existing schema types + FAQ count for the editor
            need($ED); $rel = rel_ok((string)($in['path'] ?? '')); $h = (string)file_get_contents(ROOT_DIR . '/' . $rel);
            $mine = preg_match('~<script type="application/ld\+json" id="wx-seo-schema">(.*?)</script>~is', $h, $m) ? array_map(fn($x) => $x['@type'] ?? '', (json_decode($m[1], true)['@graph'] ?? [])) : [];
            out(['ok' => true, 'existing' => seo_existing_types($h), 'managed' => $mine, 'faq' => count(seo_faq($h)), 'seo' => seo_data()['pages'][$rel] ?? null]);
        case 'seo_save':
            $u = need($ED); $rel = rel_ok((string)($in['path'] ?? '')); $d = seo_data(); $p = $d['pages'][$rel] ?? [];
            $p['kw'] = mb_substr(trim((string)($in['kw'] ?? '')), 0, 120);
            $p['related'] = array_values(array_slice(array_filter(array_map(fn($x) => mb_substr(trim((string)$x), 0, 120), (array)($in['related'] ?? []))), 0, 4));
            foreach (['seo', 'read'] as $k) if (isset($in[$k])) $p[$k] = max(0, min(100, (int)$in[$k]));
            $res = null; if (isset($in['schema']) && is_array($in['schema'])) { $p['schema'] = array_values(array_intersect(SEO_SCHEMAS, $in['schema'])); backup_page($rel); $res = seo_apply_schema($rel, $p['schema']); }
            $p['t'] = now(); $d['pages'][$rel] = $p; jwrite(SEO_FILE, $d);
            // keep CMS-generated pages in sync so a re-publish does not undo the edit
            try { $c = cms_load(); foreach ($c['items'] as $k => $it) if (($it['rel'] ?? '') === $rel) { $h = (string)file_get_contents(ROOT_DIR . '/' . $rel); $t = seo_text($h); $og = ($m = find_meta($h, 'property', 'og:image')) ? tag_attr($m, 'content') : '';
                $c['items'][$k]['seo'] = array_merge($it['seo'] ?? [], ['title' => mb_substr($t['title'], 0, 90), 'desc' => mb_substr($t['desc'], 0, 200), 'og' => mb_substr($og, 0, 300), 'kw' => $p['kw'], 'related' => $p['related']]); cms_save_file($c); break; } } catch (Throwable $e) { error_log('seo cms sync: ' . $e->getMessage()); }
            log_act($u, 'seo.save', $rel); out(['ok' => true, 'page' => $p, 'schema' => $res]);
        case 'seo_scores': // bulk store scores computed in the browser (SEO manager "Analyse all")
            need($ED); $d = seo_data();
            foreach ((array)($in['scores'] ?? []) as $rel => $s) { if (!is_string($rel) || !preg_match('~^[a-z0-9/_.\-]+\.html$~i', $rel)) continue; $d['pages'][$rel] = array_merge($d['pages'][$rel] ?? [], ['seo' => max(0, min(100, (int)($s['seo'] ?? 0))), 'read' => max(0, min(100, (int)($s['read'] ?? 0)))]); }
            jwrite(SEO_FILE, $d); out(['ok' => true]);
        case 'seo_ai':
            $u = need($ED); $rel = rel_ok((string)($in['path'] ?? '')); $t = seo_text((string)file_get_contents(ROOT_DIR . '/' . $rel)); $kw = mb_substr(trim((string)($in['kw'] ?? '')), 0, 120); $co = company_cfg();
            $sys = "You are an SEO expert for {$co['name']}, an interior design and build company in Lahore, Pakistan. Write for Google Pakistan searchers. Reply with JSON only, no markdown: {\"kw\":\"focus keyphrase\",\"related\":[\"up to 4 related keyphrases\"],\"title\":\"SEO title 50-60 chars, keyphrase near the start, end with | Woodex Interior if it fits\",\"desc\":\"meta description 140-158 chars, includes the keyphrase, a benefit and a call to action\"}";
            $usr = ($kw !== '' ? "Focus keyphrase (keep it): $kw\n" : "Choose the best focus keyphrase (what people in Pakistan would search).\n") . "URL: " . url_of($rel) . "\nCurrent title: {$t['title']}\nH1: {$t['h1']}\nCurrent description: {$t['desc']}\n\nPage text:\n" . mb_substr($t['text'], 0, 5000);
            $raw = ai_call(cms_load()['ai'], $sys, $usr); $j = json_decode(preg_replace('~^```(?:json)?|```$~m', '', trim($raw)), true);
            if (!is_array($j) || empty($j['title'])) fail('The AI answer could not be read. Try again.');
            log_act($u, 'seo.ai', $rel);
            out(['ok' => true, 'kw' => mb_substr((string)($j['kw'] ?? $kw), 0, 120) ?: $kw, 'related' => array_slice(array_map('strval', (array)($j['related'] ?? [])), 0, 4), 'title' => mb_substr((string)$j['title'], 0, 90), 'desc' => mb_substr((string)($j['desc'] ?? ''), 0, 200)]);
        case 'seo_robots_save':
            $u = need(['owner', 'admin']); $t = str_replace("\r", '', (string)($in['text'] ?? '')); if (strlen($t) > 5000) fail('robots.txt is too long');
            if (preg_match('~^\s*Disallow:\s*/\s*$~mi', $t) && empty($in['force'])) fail('This would block Google from the whole site (Disallow: /). Remove that line.');
            file_put_contents(ROOT_DIR . '/robots.txt', rtrim($t) . "\n", LOCK_EX); log_act($u, 'seo.robots'); out(['ok' => true]);
        case 'seo_sitemap':
            $u = need($ED); publish_rules(); $n = substr_count((string)file_get_contents(ROOT_DIR . '/sitemap.xml'), '<loc>'); log_act($u, 'seo.sitemap', (string)$n); out(['ok' => true, 'count' => $n]);
    }
    return false;
}
