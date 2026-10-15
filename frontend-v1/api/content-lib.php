<?php
/**
 * Woodex Admin v2 — Phase A6a: content collections (blog, portfolio, testimonials, team, FAQ groups) + AI writing help.
 * Included by api/admin.php. Mirrors tools/frontend-v1-admin.mjs a6() one-to-one.
 * Pages themselves are rendered in the browser and written through builder.php (same backups/checks as the builder);
 * this file stores the content, publishes scheduled pages, keeps sitemap.xml up to date and proxies AI requests.
 */
declare(strict_types=1);
if (!defined('PRIVATE_DIR')) { http_response_code(404); exit; }

const CMS_FILE   = PRIVATE_DIR . '/content.json';
const CMS_TYPES  = ['post', 'study', 'testimonial', 'member', 'faq', 'city'];
const BIZ_DEF = ['email' => 'info@woodex.com.pk', 'phone1' => '+92 322 4000768', 'phone2' => '+92 322 4000768', 'wa' => '+92 322 4000768', 'addr1' => 'M-71, Zainab Tower', 'addr2' => 'Model Town Link Road', 'city' => 'Lahore', 'country' => 'Pakistan', 'days' => 'Mon–Sat', 'open' => '10:00', 'close' => '19:30', 'facebook' => '', 'instagram' => '', 'linkedin' => '', 'youtube' => '', 'tiktok' => '', 'pinterest' => '', 'x' => ''];
const BIZ_ASSETS = ['assets/site.js', 'assets/js/whatsapp-widget.js'];
const CMS_PAGES  = ['post' => 'insights', 'study' => 'projects'];
const AI_SECRETS = ['anthropicKey', 'openaiKey', 'openrouterKey', 'customKey'];
const AI_DEF = ['customKey' => '', 'customModel' => '', 'customUrl' => '', 'provider' => 'anthropic', 'anthropicKey' => '', 'anthropicModel' => 'claude-sonnet-4-5', 'openaiKey' => '', 'openaiModel' => 'gpt-4o-mini', 'openrouterKey' => '', 'openrouterModel' => 'nousresearch/hermes-3-llama-3.1-405b',
    'voice' => 'Calm, plain, confident British English. Short sentences. No hype, no exclamation marks. Woodex Interior is a design, fit-out and renovation studio in Lahore, Pakistan.'];

function cms_load(): array { $c = jread(CMS_FILE); $c['items'] = $c['items'] ?? []; $c['seq'] = (int)($c['seq'] ?? 0); $c['ai'] = array_merge(AI_DEF, $c['ai'] ?? []);
    // local / self-hosted endpoints often need no key: treat a set URL as "ready"
    if ($c['ai']['provider'] === 'custom' && $c['ai']['customUrl'] !== '' && $c['ai']['customKey'] === '') $c['ai']['customKey'] = 'none';
    return $c; }
/** OpenAI-compatible chat URL for openai / openrouter / custom (9router, OmniRoute, LM Studio, Ollama…) */
function ai_chat_url(array $a): string {
    if ($a['provider'] === 'custom') { $b = rtrim((string)$a['customUrl'], '/'); return preg_match('~/chat/completions$~', $b) ? $b : $b . '/chat/completions'; }
    return $a['provider'] === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
}
function cms_save_file(array $c): void { jwrite(CMS_FILE, $c); }
function ai_pub(array $a): array { foreach (AI_SECRETS as $k) { $a[$k . 'Set'] = $a[$k] !== ''; $a[$k] = ''; } return $a; }
function cms_rel_ok($rel, string $type): bool { return is_string($rel) && isset(CMS_PAGES[$type]) && (bool)preg_match('~^' . CMS_PAGES[$type] . '/[a-z0-9][a-z0-9-]{0,59}/index\.html$~', $rel); }
function cms_html_ok($h): bool { return is_string($h) && strlen($h) < 3 * 1024 * 1024 && preg_match('~<html~i', $h) && preg_match('~</html>~i', $h) && !preg_match('~<[^>]+\s(contenteditable|data-wx-ed)[\s=>]~i', $h); }
function cms_now(): string { return gmdate('Y-m-d H:i:s'); } // schedule times are stored in UTC
function sitemap_add(string $rel): void {
    $f = ROOT_DIR . '/sitemap.xml'; if (!is_file($f)) return;
    $loc = 'https://woodex.com.pk/' . preg_replace('~index\.html$~', '', $rel); $x = (string)file_get_contents($f);
    if (strpos($x, '<loc>' . $loc . '</loc>') !== false || strpos($x, '</urlset>') === false) return;
    file_put_contents($f, str_replace('</urlset>', '  <url><loc>' . htmlspecialchars($loc, ENT_XML1) . '</loc><lastmod>' . date('Y-m-d') . "</lastmod></url>\n</urlset>", $x), LOCK_EX);
}
/** P18 I: unlisted posts stay reachable by link but are kept out of the sitemap. */
function sitemap_del(string $rel): void {
    $f = ROOT_DIR . '/sitemap.xml'; if (!is_file($f)) return;
    $loc = 'https://woodex.com.pk/' . preg_replace('~index\.html$~', '', $rel); $x = (string)file_get_contents($f);
    $y = preg_replace('~[ \t]*<url><loc>' . preg_quote(htmlspecialchars($loc, ENT_XML1), '~') . '</loc>.*?</url>\n?~s', '', $x); if ($y !== $x && $y !== null) file_put_contents($f, $y, LOCK_EX);
}
function sitemap_sync(string $rel, array $it): void { if ((($it['data'] ?? [])['visibility'] ?? '') === 'unlisted') sitemap_del($rel); else sitemap_add($rel); }
/** Publish scheduled items whose time has come. Called on every admin request; can also be hit by a cron job. */
function cms_tick(): int {
    if (!is_file(CMS_FILE)) return 0;
    $fh = fopen(CMS_FILE . '.lock', 'c'); if (!flock($fh, LOCK_EX | LOCK_NB)) { fclose($fh); return 0; }
    $c = cms_load(); $t = cms_now(); $n = 0;
    foreach ($c['items'] as &$it) {
        if (($it['status'] ?? '') !== 'scheduled' || empty($it['publishAt']) || $it['publishAt'] > $t) continue;
        if (!empty($it['pending']) && isset(CMS_PAGES[$it['type']])) {
            $p = $it['pending'];
            if (!cms_rel_ok($p['rel'] ?? '', $it['type']) || !cms_html_ok($p['html'] ?? '')) { $it['status'] = 'draft'; $it['error'] = 'Scheduled page was invalid'; continue; }
            $abs = ROOT_DIR . '/' . $p['rel']; if (is_file($abs)) backup_page($p['rel']); if (!is_dir(dirname($abs))) mkdir(dirname($abs), 0755, true);
            file_put_contents($abs, $p['html'], LOCK_EX);
            $listRel = CMS_PAGES[$it['type']] . '/index.html'; $li = ROOT_DIR . '/' . $listRel; $href = '/' . preg_replace('~index\.html$~', '', $p['rel']);
            if (!empty($p['card']) && is_file($li)) { $L = (string)file_get_contents($li); if (strpos($L, 'href="' . $href . '"') === false && strpos($L, '<div class="hx-cards">') !== false) { backup_page($listRel); file_put_contents($li, preg_replace('~<div class="hx-cards">~', "<div class=\"hx-cards\">\n" . str_replace(['\\', '$'], ['\\\\', '\\$'], $p['card']), $L, 1), LOCK_EX); } }
            $it['rel'] = $p['rel']; unset($it['pending']); sitemap_sync($p['rel'], $it);
        }
        $it['status'] = 'published'; $it['published_at'] = $t; $n++; log_act(null, 'content.autopublish', $it['title']);
    } unset($it);
    if ($n) cms_save_file($c);
    flock($fh, LOCK_UN); fclose($fh); return $n;
}
function ai_call(array $a, string $system, string $user): string {
    $p = $a['provider']; $key = $a[$p . 'Key'] ?? ''; $model = $a[$p . 'Model'] ?? '';
    if ($key === '') fail('Add an API key for ' . (['anthropic' => 'Claude', 'openai' => 'OpenAI', 'openrouter' => 'OpenRouter', 'custom' => 'Custom / local endpoint'][$p] ?? $p) . ' in Content → AI settings');
    if (!function_exists('curl_init')) fail('The server has no cURL extension', 500);
    if ($p === 'anthropic') { $url = 'https://api.anthropic.com/v1/messages'; $h = ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01', 'content-type: application/json']; $body = ['model' => $model, 'max_tokens' => 6000, 'system' => $system, 'messages' => [['role' => 'user', 'content' => $user]]]; }
    else { $url = ai_chat_url($a); $h = ['authorization: Bearer ' . $key, 'content-type: application/json', 'HTTP-Referer: https://woodex.com.pk', 'X-Title: Woodex Admin']; $body = ['model' => $model, 'max_tokens' => 6000, 'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]]]; }
    $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_HTTPHEADER => $h, CURLOPT_POSTFIELDS => json_encode($body), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]);
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($raw === false) fail('AI request failed: ' . mb_substr($err, 0, 200), 502);
    $j = json_decode((string)$raw, true) ?: [];
    if ($code >= 400) fail('AI request failed: ' . mb_substr((string)($j['error']['message'] ?? $code), 0, 200), 502);
    if ($p === 'anthropic') return implode('', array_map(fn($x) => (string)($x['text'] ?? ''), $j['content'] ?? []));
    return (string)($j['choices'][0]['message']['content'] ?? '');
}
function ai_prompt(string $task, array $i): ?string {
    $s = fn($k, $n = 4000) => mb_substr((string)($i[$k] ?? ''), 0, $n);
    switch ($task) {
        case 'outline': return "Write a full blog article for the Woodex website.\nTitle: {$s('title', 200)}\nNotes from the team: " . ($s('notes', 3000) ?: '(none)') . "\nReturn ONLY JSON: {\"dek\":\"one-sentence standfirst\",\"blocks\":[{\"t\":\"h\",\"text\":\"...\"},{\"t\":\"p\",\"text\":\"...\"},{\"t\":\"list\",\"items\":[\"**Label:** text\"]}],\"summary\":[\"three short takeaways\"],\"faqs\":[{\"q\":\"...\",\"a\":\"...\"}],\"quote\":\"one pull quote\"}. 5-7 sections, each a heading plus 1-2 paragraphs. Use **bold** sparingly. Prices in PKR where relevant.";
        case 'article': return "Write an SEO blog article for Woodex Interior (interior design & build company, Lahore).\nTopic: {$s('title', 200)}\nFocus keyphrase: {$s('kw', 120)}\nTarget length: about {$s('words', 6)} words of body text\nFollow this structure (fill every heading; you may rename headings to include the keyphrase):\n{$s('structure', 3000)}\nNotes from the team: " . ($s('notes', 3000) ?: '(none)') . "\nRules: British/Pakistani English, prices in PKR (Rs), mention Lahore/Pakistan context naturally. Start with a paragraph (not a heading) that uses the exact keyphrase in the first sentence. Use the exact keyphrase 4-8 times in total, in at least two H2 headings, and use related words naturally. Short sentences (mostly under 20 words), short paragraphs (2-4 sentences), at least 30% of sentences with transition words (also, because, for example, however, so, first, finally), active voice. Include 3+ internal links as markdown to relevant Woodex pages from: /interior-design/, /renovation/, /office-fit-out/, /turnkey-design-build/, /3d-visualization/, /kitchen-design/, /estimator/, /projects/, /contact/. Honest ranges only; never invent awards, client names or guarantees not in the notes. Keep \"ba\" and \"gallery\" blocks where the structure has them (only a caption; the team adds photos). Do not repeat the FAQ block in faqs (leave faqs empty).\nReturn ONLY JSON: {\"title\":\"H1 title with the keyphrase near the start\",\"kicker\":\"2-3 words\",\"dek\":\"one-sentence standfirst that includes the keyphrase\",\"seoTitle\":\"50-60 characters, keyphrase first, ends with | Woodex\",\"seoDesc\":\"130-155 characters, includes the keyphrase and a call to action\",\"category\":\"...\",\"readMin\":6,\"blocks\":[{\"t\":\"p\",\"text\":\"...\"},{\"t\":\"h\",\"text\":\"...\"},{\"t\":\"list\",\"items\":[\"**Label:** text\"]},{\"t\":\"table\",\"rows\":[[\"Header\",\"Header\"],[\"cell\",\"cell\"]]},{\"t\":\"faq\",\"items\":[{\"q\":\"...\",\"a\":\"...\"}]},{\"t\":\"cta\",\"title\":\"...\",\"text\":\"...\",\"label\":\"...\",\"href\":\"/contact/\"},{\"t\":\"quote\",\"text\":\"...\"},{\"t\":\"ba\",\"caption\":\"...\"},{\"t\":\"gallery\",\"caption\":\"...\"}],\"summary\":[\"3 short takeaways\"],\"faqs\":[]}";
        case 'fix': return "Improve this article so it passes these SEO/readability checks. Focus keyphrase: {$s('kw', 120)}\nFailing checks:\n{$s('issues', 3000)}\n\nRules: British/Pakistani English, prices in PKR (Rs), mention Lahore/Pakistan context naturally. Start with a paragraph (not a heading) that uses the exact keyphrase in the first sentence. Use the exact keyphrase 4-8 times in total, in at least two H2 headings, and use related words naturally. Short sentences (mostly under 20 words), short paragraphs (2-4 sentences), at least 30% of sentences with transition words (also, because, for example, however, so, first, finally), active voice. Include 3+ internal links as markdown to relevant Woodex pages from: /interior-design/, /renovation/, /office-fit-out/, /turnkey-design-build/, /3d-visualization/, /kitchen-design/, /estimator/, /projects/, /contact/. Honest ranges only; never invent awards, client names or guarantees not in the notes. Keep \"ba\" and \"gallery\" blocks where the structure has them (only a caption; the team adds photos). Do not repeat the FAQ block in faqs (leave faqs empty).\nKeep the same structure, block order and facts; only rewrite what is needed. Return ONLY the full improved article JSON in the same format: {\"title\":\"H1 title with the keyphrase near the start\",\"kicker\":\"2-3 words\",\"dek\":\"one-sentence standfirst that includes the keyphrase\",\"seoTitle\":\"50-60 characters, keyphrase first, ends with | Woodex\",\"seoDesc\":\"130-155 characters, includes the keyphrase and a call to action\",\"category\":\"...\",\"readMin\":6,\"blocks\":[{\"t\":\"p\",\"text\":\"...\"},{\"t\":\"h\",\"text\":\"...\"},{\"t\":\"list\",\"items\":[\"**Label:** text\"]},{\"t\":\"table\",\"rows\":[[\"Header\",\"Header\"],[\"cell\",\"cell\"]]},{\"t\":\"faq\",\"items\":[{\"q\":\"...\",\"a\":\"...\"}]},{\"t\":\"cta\",\"title\":\"...\",\"text\":\"...\",\"label\":\"...\",\"href\":\"/contact/\"},{\"t\":\"quote\",\"text\":\"...\"},{\"t\":\"ba\",\"caption\":\"...\"},{\"t\":\"gallery\",\"caption\":\"...\"}],\"summary\":[\"3 short takeaways\"],\"faqs\":[]}\n\nARTICLE:\n{$s('article', 30000)}";
        case 'meta': return "Write SEO metadata for this page.\nTitle: {$s('title', 200)}\nText: {$s('text')}\nReturn ONLY JSON: {\"title\":\"max 60 characters, ends with | Woodex Interior\",\"desc\":\"140-158 characters\"}";
        case 'alt': return "Write alt text (max 110 characters, no \"image of\") for a photo on the Woodex website. File: {$s('file', 200)}. Context: {$s('context', 600)}. Return only the alt text.";
        case 'improve': return "Rewrite this paragraph to be clearer and tighter, same meaning and length or shorter. Return only the paragraph.\n\n{$s('text', 3000)}";
        case 'excerpt': return "Write a card summary (max 150 characters) for this page. Return only the text.\nTitle: {$s('title', 200)}\n{$s('text', 3000)}";
        case 'city': $t = is_array($i['texts'] ?? null) ? array_slice(array_values(array_filter($i['texts'], 'is_string')), 0, 120) : []; $city = $s('city', 80); $src = $s('source', 80);
            return "You are localising a Woodex city landing page from $src to $city, Pakistan. The studio is based in Lahore and serves $city with site visits.\nRewrite each string for $city: mention real $city areas/neighbourhoods where natural, keep facts honest (the studio and showroom are in Lahore, not in $city), keep roughly the same length, keep **bold** markers and [link](url) markup unchanged.\nReturn ONLY a JSON array of exactly " . count($t) . " strings in the same order.\n\n" . mb_substr(json_encode($t, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 14000);
        case 'faqs': return "Write 4 FAQs a Pakistani client would ask about: {$s('title', 200)}.\nContext: {$s('text', 3000)}\nReturn ONLY JSON: [{\"q\":\"...\",\"a\":\"1-3 sentences\"}]";
    }
    return null;
}
function cms_safe_rel($r): bool { return is_string($r) && preg_match('~^[a-z0-9][a-z0-9/_\-.]*\.html$~i', $r) && strpos($r, '..') === false && !preg_match('~^(_private|builder|admin|api|assets)/~', $r); }

function cms_city_rel_ok($r): bool { return is_string($r) && preg_match('~^[a-z0-9][a-z0-9-]{0,59}/index\.html$~', $r) && !preg_match('~^(builder|admin|api|assets|insights|projects)/~', $r); }
function cms_file_backup(string $rel): void { $d = PRIVATE_DIR . '/backups/' . preg_replace('~[^a-z0-9]+~i', '_', trim($rel, '/')); if (!is_dir($d)) @mkdir($d, 0750, true); @copy(ROOT_DIR . '/' . $rel, $d . '/' . gmdate('Ymd-His') . '-' . substr(basename($rel), -12)); }
/** P17 templates (article / portfolio / city): validated template record. */
const CMS_TPL_SEC = ['body', 'summary', 'faqs', 'quote', 'related'];
function cms_tpl_clean(array $t): array {
    $type = (string)($t['type'] ?? ''); if (!in_array($type, ['post', 'study', 'city'], true)) fail('Unknown template type');
    $name = clip($t['name'] ?? '', 60); if ($name === '') fail('Give the template a name');
    $o = ['type' => $type, 'name' => $name, 'desc' => clip($t['desc'] ?? '', 200), 'default' => !empty($t['default'])];
    if ($type === 'city') {
        $o['source'] = preg_match('~^[a-z0-9-]{1,60}$~', (string)($t['source'] ?? '')) ? $t['source'] : '';
        $o['order'] = []; foreach (array_slice((array)($t['order'] ?? []), 0, 30) as $x) if (is_array($x) && preg_match('~^[a-z0-9_-]{1,60}$~i', (string)($x['id'] ?? ''))) $o['order'][] = ['id' => $x['id'], 'on' => !empty($x['on']), 'label' => clip($x['label'] ?? '', 60)];
        if (!$o['order']) fail('Pick the sections for this city template');
    } else {
        $o['hero'] = in_array($t['hero'] ?? '', ['image', 'navy', 'media'], true) ? $t['hero'] : 'image';
        foreach (['toc' => false, 'meta' => true, 'facts' => true] as $k => $def) $o[$k] = array_key_exists($k, $t) ? !empty($t[$k]) : $def;
        $seen = []; $o['sections'] = [];
        foreach ((array)($t['sections'] ?? []) as $x) { $k = (string)($x['k'] ?? ''); if (in_array($k, CMS_TPL_SEC, true) && !isset($seen[$k])) { $seen[$k] = 1; $o['sections'][] = ['k' => $k, 'on' => !empty($x['on'])]; } }
        foreach (CMS_TPL_SEC as $k) if (!isset($seen[$k])) $o['sections'][] = ['k' => $k, 'on' => true];
    }
    return $o;
}
function content_actions(string $action, array $in): bool {
    if (!preg_match('~^(cms_|ai_)~', $action)) return false;
    $ED = ['owner', 'admin', 'editor']; $OA = ['owner', 'admin'];
    $c = cms_load();
    $idx = function ($id) use (&$c): int { foreach ($c['items'] as $k => $x) if ((int)$x['id'] === (int)$id) return $k; fail('Item not found', 404); return -1; };
    switch ($action) {
        case 'cms_tpl_list': need($ED); out(['ok' => true, 'tpls' => array_values($c['tpls'] ?? [])]);
        case 'cms_tpl_save':
            $u = need($ED); $o = cms_tpl_clean((array)($in['tpl'] ?? [])); $L = array_values($c['tpls'] ?? []); $id = (int)($in['tpl']['id'] ?? 0); $k = -1;
            foreach ($L as $j => $x) if ((int)$x['id'] === $id) $k = $j;
            if ($k < 0 && count($L) >= 60) fail('Too many templates');
            $o['id'] = $k >= 0 ? $id : (int)($c['tplSeq'] = (int)($c['tplSeq'] ?? 0) + 1); $o['updated_at'] = cms_now(); $o['by'] = $u['name'] ?? '';
            if ($o['default']) foreach ($L as $j => $x) if ($x['type'] === $o['type']) $L[$j]['default'] = false;
            if ($k >= 0) $L[$k] = $o; else $L[] = $o;
            $c['tpls'] = $L; cms_save_file($c); log_act($u, 'template.save', $o['type'] . ': ' . $o['name']); out(['ok' => true, 'tpl' => $o, 'tpls' => $L]);
        case 'cms_tpl_delete':
            $u = need($ED); $id = (int)($in['id'] ?? 0); $L = array_values(array_filter($c['tpls'] ?? [], fn($x) => (int)$x['id'] !== $id));
            foreach ($c['items'] as $j => $x) if ((int)($x['data']['tpl'] ?? 0) === $id) unset($c['items'][$j]['data']['tpl']);
            $c['tpls'] = $L; cms_save_file($c); log_act($u, 'template.delete', '#' . $id); out(['ok' => true, 'tpls' => $L]);
        case 'cms_page_kinds':
            need($ED); $kinds = [];
            $it = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(new RecursiveDirectoryIterator(ROOT_DIR, FilesystemIterator::SKIP_DOTS), function ($f) { return !($f->isDir() && dirname($f->getPathname()) === ROOT_DIR && preg_match('~^(_private|builder|admin|api|assets|node_modules)$~', $f->getFilename())); }));
            foreach ($it as $f) { if (substr($f->getFilename(), -5) !== '.html') continue; $rel = str_replace('\\', '/', substr($f->getPathname(), strlen(ROOT_DIR) + 1)); if (!cms_safe_rel($rel)) continue;
                $h = (string)file_get_contents($f->getPathname(), false, null, 0, 400000); $kinds[$rel] = preg_match('~<body[^>]*data-page="([^"]*)"~i', $h, $m) ? $m[1] : ''; }
            out(['ok' => true, 'kinds' => $kinds]);
        case 'cms_sitemap_add':
            need($ED); $rel = (string)($in['rel'] ?? ''); if (!cms_safe_rel($rel) || !is_file(ROOT_DIR . '/' . $rel)) fail('Page not found'); sitemap_add($rel); out(['ok' => true]);
        case 'cms_announce_get':
            need($ED); $f = ROOT_DIR . '/assets/announce.json'; out(['ok' => true, 'ann' => array_merge(['on' => false, 'text' => '', 'link' => '', 'linkText' => '', 'style' => 'navy'], is_file($f) ? (array)json_decode((string)file_get_contents($f), true) : [])]);
        case 'cms_announce_save':
            $u = need($OA); $a = is_array($in['ann'] ?? null) ? $in['ann'] : [];
            $o = ['on' => !empty($a['on']), 'text' => clip($a['text'] ?? '', 160), 'link' => clip($a['link'] ?? '', 300), 'linkText' => clip($a['linkText'] ?? '', 40), 'style' => in_array($a['style'] ?? '', ['navy', 'wood', 'cream'], true) ? $a['style'] : 'navy', 'v' => time()];
            if ($o['on'] && $o['text'] === '') fail('Write the announcement text');
            if ($o['link'] !== '' && !preg_match('~^(/[^\s"<>]*|https://[^\s"<>]+|tel:\+?[0-9 ]+|mailto:[^\s"<>]+)$~', $o['link'])) fail('The link must start with /, https://, tel: or mailto:');
            file_put_contents(ROOT_DIR . '/assets/announce.json', json_encode($o, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX); log_act($u, 'announce.save', $o['on'] ? 'on' : 'off'); out(['ok' => true, 'ann' => $o]);
        case 'cms_biz_get': need($ED); out(['ok' => true, 'biz' => array_merge(BIZ_DEF, $c['biz'] ?? []), 'applied' => array_merge(BIZ_DEF, $c['bizApplied'] ?? [])]);
        case 'cms_biz_save':
            $u = need($OA); $b = is_array($in['biz'] ?? null) ? $in['biz'] : []; $o = [];
            foreach (BIZ_DEF as $key => $def) { $v = clip($b[$key] ?? '', 160); $o[$key] = $v !== '' ? $v : $def; }
            if (!preg_match('~^[^@\s]+@[^@\s]+\.[^@\s]+$~', $o['email'])) fail('Check the email address');
            foreach (['phone1', 'phone2', 'wa'] as $key) if (strlen(preg_replace('~\D~', '', $o[$key])) < 10) fail('Check the phone numbers (use +92 format)');
            foreach (['facebook','instagram','linkedin','youtube','tiktok','pinterest','x'] as $key) if ($o[$key] !== '' && !preg_match('~^https://[^\s"<>]+$~', $o[$key])) fail('Social links must start with https://');
            if (!preg_match('~^\d{2}:\d{2}$~', $o['open']) || !preg_match('~^\d{2}:\d{2}$~', $o['close'])) fail('Check the opening hours');
            $c['biz'] = $o; if (!empty($in['applied'])) $c['bizApplied'] = $o; cms_save_file($c); log_act($u, !empty($in['applied']) ? 'business.apply' : 'business.save', '');
            out(['ok' => true, 'biz' => $o, 'applied' => array_merge(BIZ_DEF, $c['bizApplied'] ?? [])]);
        case 'cms_biz_assets':
            $u = need($OA); $pairs = [];
            foreach ((is_array($in['pairs'] ?? null) ? $in['pairs'] : []) as $p) if (is_array($p) && is_string($p[0] ?? null) && is_string($p[1] ?? null) && strlen($p[0]) >= 4 && strlen($p[0]) < 200 && strlen($p[1]) < 200 && !preg_match('~[<>\\\\`]~', $p[1])) $pairs[] = $p;
            $n = 0; foreach (BIZ_ASSETS as $rel) { $f = ROOT_DIR . '/' . $rel; if (!is_file($f)) continue; $x = (string)file_get_contents($f); $before = $x; foreach ($pairs as $p) $x = str_replace($p[0], $p[1], $x); if ($x !== $before) { cms_file_backup($rel); file_put_contents($f, $x, LOCK_EX); $n++; } }
            log_act($u, 'business.assets', $n . ' files'); out(['ok' => true, 'files' => $n]);
        case 'cms_list':
            need($ED); $ty = in_array($in['type'] ?? '', CMS_TYPES, true) ? $in['type'] : null; $out = [];
            foreach (array_reverse($c['items']) as $x) { if ($ty && $x['type'] !== $ty) continue; $x['hasPending'] = !empty($x['pending']); unset($x['pending']); $out[] = $x; }
            out(['ok' => true, 'items' => $out, 'aiReady' => $c['ai'][$c['ai']['provider'] . 'Key'] !== '']);
        case 'cms_get': need($ED); $x = $c['items'][$idx($in['id'] ?? 0)]; unset($x['pending']); out(['ok' => true, 'item' => $x]);
        case 'cms_save':
            $u = need($ED); $type = (string)($in['type'] ?? ''); if (!in_array($type, CMS_TYPES, true)) fail('Unknown content type');
            $title = clip($in['title'] ?? '', 160); if ($title === '') fail(in_array($type, ['testimonial', 'member'], true) ? 'Name is required' : 'Title is required');
            $data = is_array($in['data'] ?? null) ? $in['data'] : []; if (strlen(json_encode($data)) > 400000) fail('Content is too large');
            $k = !empty($in['id']) ? $idx($in['id']) : -1; $it = $k >= 0 ? $c['items'][$k] : null;
            $slug = isset(CMS_PAGES[$type]) || $type === 'city' ? strtolower((string)($in['slug'] ?? '')) : '';
            if ($type === 'city') {
                if (!preg_match('~^[a-z0-9][a-z0-9-]{0,59}$~', $slug) || in_array($slug, ['builder', 'admin', 'api', 'assets', 'insights', 'projects'], true)) fail('Page address: lowercase letters, numbers and dashes only');
                if ((!$it || empty($it['rel'])) && is_file(ROOT_DIR . '/' . $slug . '/index.html')) fail('A page already exists at /' . $slug . '/');
                foreach ($c['items'] as $j => $x) if ($x['type'] === 'city' && $x['slug'] === $slug && $j !== $k) fail('Another draft already uses that address');
            }
            $claim = (string)($in['claim'] ?? '');
            if (isset(CMS_PAGES[$type])) {
                if (!preg_match('~^[a-z0-9][a-z0-9-]{0,59}$~', $slug)) fail('Page address: lowercase letters, numbers and dashes only');
                if ($it && !empty($it['rel']) && $it['slug'] !== $slug) fail('The address of a published page cannot be changed');
                foreach ($c['items'] as $j => $x) if ($x['type'] === $type && $x['slug'] === $slug && $j !== $k) fail('Another item already uses that address');
                $rel = CMS_PAGES[$type] . '/' . $slug . '/index.html';
                if ((!$it || empty($it['rel'])) && is_file(ROOT_DIR . '/' . $rel) && $claim !== $rel) fail('A page already exists at /' . CMS_PAGES[$type] . '/' . $slug . '/');
            }
            if (!$it) { $it = ['id' => ++$c['seq'], 'type' => $type, 'status' => 'draft', 'created_at' => cms_now(), 'created_by' => $u['name'], 'rel' => null]; }
            $seo = is_array($in['seo'] ?? null) ? $in['seo'] : [];
            $it = array_merge($it, ['title' => $title, 'slug' => $slug, 'data' => $data, 'seo' => ['title' => clip($seo['title'] ?? '', 90), 'desc' => clip($seo['desc'] ?? '', 200), 'og' => clip($seo['og'] ?? '', 300), 'kw' => clip($seo['kw'] ?? '', 120), 'related' => array_values(array_slice(array_map(fn($x) => clip($x, 120), array_filter((array)($seo['related'] ?? []), 'is_string')), 0, 4))], 'order' => (int)($in['order'] ?? 0), 'updated_at' => cms_now(), 'updated_by' => $u['name']]);
            if ($claim !== '' && isset(CMS_PAGES[$type]) && $claim === CMS_PAGES[$type] . '/' . $slug . '/index.html') { $it['rel'] = $claim; $it['status'] = 'published'; $it['imported'] = true; }
            $st = (string)($in['status'] ?? '');
            if ($st === 'draft' && $it['status'] === 'scheduled') { $it['status'] = 'draft'; unset($it['pending']); }
            if ($st === 'scheduled') {
                $at = substr(str_replace('T', ' ', (string)($in['publishAt'] ?? '')), 0, 16); if (!preg_match('~^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$~', $at)) fail('Pick a publish date and time');
                if (!empty($it['rel'])) fail('This item is already live. Just publish your changes.');
                if (isset(CMS_PAGES[$type])) { $p = is_array($in['pending'] ?? null) ? $in['pending'] : []; if (!cms_rel_ok($p['rel'] ?? '', $type) || !cms_html_ok($p['html'] ?? '')) fail('Could not prepare the scheduled page'); $it['pending'] = ['rel' => $p['rel'], 'html' => $p['html'], 'card' => clip($p['card'] ?? '', 4000)]; }
                $it['status'] = 'scheduled'; $it['publishAt'] = $at . ':00';
            }
            if ($st === 'published' && !isset(CMS_PAGES[$type])) { $it['status'] = 'published'; $it['published_at'] = $it['published_at'] ?? cms_now(); }
            if ($k >= 0) $c['items'][$k] = $it; else $c['items'][] = $it;
            cms_save_file($c); log_act($u, 'content.save', $type . ': ' . $title);
            $pub = $it; unset($pub['pending']); out(['ok' => true, 'item' => $pub]);
        case 'cms_published':
            $u = need($ED); $k = $idx($in['id'] ?? 0); $it = $c['items'][$k]; if (!isset(CMS_PAGES[$it['type']]) && $it['type'] !== 'city') fail('Not a page item');
            $rel = (string)($in['rel'] ?? ''); if (!($it['type'] === 'city' ? cms_city_rel_ok($rel) : cms_rel_ok($rel, $it['type'])) || !is_file(ROOT_DIR . '/' . $rel)) fail('Page was not written');
            $it['rel'] = $rel; $it['status'] = 'published'; $it['published_at'] = $it['published_at'] ?? cms_now(); unset($it['pending']); $it['publishAt'] = null; if ($it['type'] === 'city') $it['data'] = ['source' => (string)($it['data']['source'] ?? '')];
            $c['items'][$k] = $it; cms_save_file($c); sitemap_sync($rel, $it); log_act($u, 'content.publish', $it['title']); out(['ok' => true, 'item' => $it]);
        case 'cms_status':
            $u = need($ED); $k = $idx($in['id'] ?? 0); if (isset(CMS_PAGES[$c['items'][$k]['type']])) fail('Use Publish for pages');
            $c['items'][$k]['status'] = ($in['status'] ?? '') === 'published' ? 'published' : 'draft'; cms_save_file($c); log_act($u, 'content.' . $c['items'][$k]['status'], $c['items'][$k]['title']);
            out(['ok' => true, 'item' => $c['items'][$k]]);
        case 'cms_reorder':
            need($ED); $ids = array_map('intval', is_array($in['ids'] ?? null) ? $in['ids'] : []);
            foreach ($c['items'] as &$x) { $p = array_search((int)$x['id'], $ids, true); if ($p !== false) $x['order'] = $p + 1; } unset($x);
            cms_save_file($c); out(['ok' => true]);
        case 'cms_delete':
            $u = need($OA); $k = $idx($in['id'] ?? 0); $it = $c['items'][$k]; if (!empty($it['rel'])) fail('This page is live. Pages cannot be deleted; edit it instead.');
            array_splice($c['items'], $k, 1); cms_save_file($c); log_act($u, 'content.delete', $it['title']); out(['ok' => true]);
        case 'cms_placements': need($ED); out(['ok' => true, 'placements' => $c['placements'] ?? ['testimonial' => ['index.html', 'about/index.html'], 'member' => ['about/index.html']]]);
        case 'cms_placements_save':
            $u = need($OA); $p = is_array($in['placements'] ?? null) ? $in['placements'] : []; $c['placements'] = [];
            foreach (['testimonial', 'member'] as $k) {
                $c['placements'][$k] = array_values(array_slice(array_filter(is_array($p[$k] ?? null) ? $p[$k] : [], 'cms_safe_rel'), 0, 80));
                $s = is_array($p[$k . 'Set'] ?? null) ? $p[$k . 'Set'] : []; $c['placements'][$k . 'Set'] = ['kicker' => clip($s['kicker'] ?? '', 60), 'heading' => clip($s['heading'] ?? '', 120)];
                if ($k === 'testimonial') { $D = ['cards', 'spotlight', 'slider', 'wall', 'band']; $c['placements'][$k . 'Set']['design'] = in_array($s['design'] ?? '', $D, true) ? $s['design'] : 'cards'; $c['placements'][$k . 'Set']['max'] = max(0, min(30, (int)($s['max'] ?? 0))); $dz = []; foreach ((array)($s['designs'] ?? []) as $pg => $dv) if (in_array($pg, $c['placements'][$k], true) && in_array($dv, $D, true)) $dz[$pg] = $dv; $c['placements'][$k . 'Set']['designs'] = (object)$dz; }
            }
            cms_save_file($c); log_act($u, 'content.placements'); out(['ok' => true, 'placements' => $c['placements']]);
        case 'cms_ai_get': need($OA); out(['ok' => true, 'ai' => ai_pub($c['ai'])]);
        case 'cms_ai_save':
            $u = need($OA); $s = is_array($in['ai'] ?? null) ? $in['ai'] : [];
            foreach (array_keys(AI_DEF) as $k) { if (!array_key_exists($k, $s)) continue; if (in_array($k, AI_SECRETS, true) && $s[$k] === '' && empty($s[$k . 'Clear'])) continue; $c['ai'][$k] = clip($s[$k], $k === 'voice' ? 800 : 300); }
            if (!in_array($c['ai']['provider'], ['anthropic', 'openai', 'openrouter', 'custom'], true)) $c['ai']['provider'] = 'anthropic';
            if ($c['ai']['customUrl'] !== '' && !preg_match('~^https?://[^\s]+$~i', $c['ai']['customUrl'])) fail('The custom endpoint must start with https:// (or http://)');
            cms_save_file($c); log_act($u, 'settings.ai', $c['ai']['provider']); out(['ok' => true, 'ai' => ai_pub($c['ai'])]);
        case 'ai_run':
            $u = need($ED); $prompt = ai_prompt((string)($in['task'] ?? ''), is_array($in['input'] ?? null) ? $in['input'] : []); if ($prompt === null) fail('Unknown AI task');
            $text = ai_call($c['ai'], 'You write website copy for Woodex Interior. ' . $c['ai']['voice'], $prompt); log_act($u, 'ai.' . $in['task']); out(['ok' => true, 'text' => $text]);
        /* P16: list models straight from the provider API (uses the typed key, or the saved one) */
        case 'cms_ai_models':
            need($OA); $p = (string)($in['provider'] ?? $c['ai']['provider']); if (!in_array($p, ['anthropic', 'openai', 'openrouter', 'custom'], true)) fail('Unknown provider');
            $key = trim((string)($in['key'] ?? '')); if ($key === '') $key = (string)($c['ai'][$p . 'Key'] ?? ''); if ($key === 'none') $key = '';
            $base = rtrim(trim((string)($in['url'] ?? '')) ?: (string)$c['ai']['customUrl'], '/'); $base = preg_replace('~/chat/completions$~', '', $base);
            if ($p === 'custom' && !preg_match('~^https?://~i', $base)) fail('Enter the endpoint URL first (e.g. https://your-tunnel.example.com/v1)');
            if ($key === '' && $p !== 'custom' && $p !== 'openrouter') fail('Enter the API key first');
            $url = ['anthropic' => 'https://api.anthropic.com/v1/models?limit=100', 'openai' => 'https://api.openai.com/v1/models', 'openrouter' => 'https://openrouter.ai/api/v1/models', 'custom' => $base . '/models'][$p];
            $h = $p === 'anthropic' ? ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01'] : ($key !== '' ? ['authorization: Bearer ' . $key] : []);
            $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_HTTPHEADER => $h, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8]);
            $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
            if ($raw === false) fail('Could not reach the provider: ' . mb_substr($err, 0, 200), 502);
            $j = json_decode((string)$raw, true) ?: []; if ($code >= 400) fail('Provider said: ' . mb_substr((string)($j['error']['message'] ?? ('HTTP ' . $code)), 0, 200), 502);
            $ids = []; foreach (($j['data'] ?? $j['models'] ?? []) as $m) { $id = (string)($m['id'] ?? $m['name'] ?? ''); if ($id === '') continue;
                if ($p === 'openai' && !preg_match('~^(gpt|o\d|chatgpt)~', $id)) continue; if (preg_match('~(embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search)~i', $id)) continue; $ids[] = $id; }
            $ids = array_values(array_unique($ids)); if (!$ids) fail('No chat models returned by this provider');
            $pref = ['anthropic' => ['claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet'], 'openai' => ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'], 'openrouter' => ['anthropic/claude-sonnet-4', 'openai/gpt-4o-mini'], 'custom' => []][$p];
            $best = $ids[0]; foreach ($pref as $want) { foreach ($ids as $id) if (str_starts_with($id, $want)) { $best = $id; break 2; } }
            if ($p !== 'anthropic') sort($ids);
            out(['ok' => true, 'models' => array_slice($ids, 0, 400), 'recommended' => $best]);
        case 'ai_test': need($OA); $t = ai_call($c['ai'], 'Reply with one word.', 'Say OK.'); out(['ok' => true, 'text' => mb_substr($t, 0, 60)]);
    }
    return false;
}
