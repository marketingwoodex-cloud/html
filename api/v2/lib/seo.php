<?php
/**
 * api/v2/lib/seo.php — findability: what each page tells Google, and what is missing.
 *
 * v2.1 called this "Yoast-style" and it was two halves that never met. `seo-lib.php` stored a per-page
 * record (focus keyphrase, related phrases, schema choices, and two scores) in `_private/seo.json`, while
 * the *scoring* happened in the browser — `admin-seo.js` fetched six pages at a time, worked out a
 * readability number with a script, and posted the numbers back to be stored. So the site's own idea of how
 * findable it was lived in whichever browser last pressed "Analyse all", and nothing on the server could
 * answer "which pages have no description?".
 *
 * Here the audit is one pure function. `wx_seo_issues()` takes a page's facts and returns the findings in
 * sentences; `wx_seo_score()` derives a number from those findings and nothing else. The stored record keeps
 * its v2.1 shape and its v2.1 file, so the old admin still reads and writes the same thing, and the numbers
 * that were stored from a browser are simply not written any more — the route that used to receive them
 * recomputes instead, which means the old screen keeps working and the site keeps one opinion.
 *
 * The findings are about *this* site: 150 hand-written pages with a file for every address. That is why
 * `broken_link` is a finding here — with pages as files, a link to a page that is not there is a fact,
 * not a crawl result.
 */
declare(strict_types=1);

/** The schema types v2.1 offered, in its order. */
const WX_SEO_SCHEMAS = ['LocalBusiness', 'Service', 'Article', 'FAQPage', 'BreadcrumbList'];

/**
 * The four files on this site that are not addresses: the error pages and the holding page.
 *
 * Not an invented list — the site's own `sitemap.xml` lists exactly the other 142 pages, and these four are
 * the difference. They are served (an error page has to exist) but nobody should arrive at one from a
 * search result.
 */
const WX_SEO_SITEMAP_SKIP = ['404.html', '500.html', '503.html', 'coming-soon.html'];

/** What Google shows: a title is cut at about 60 characters, a description at about 160. */
const WX_SEO_TITLE_RANGE = [25, 60];
const WX_SEO_DESC_RANGE = [70, 160];

/** Below this many words of text, a page reads as thin. */
const WX_SEO_THIN_WORDS = 300;

/** v2.1 kept at most four related phrases; the focus phrase is one line. */
const WX_SEO_RELATED_MAX = 4;
const WX_SEO_KW_MAX = 120;

/** What a finding costs. The number is not a measurement — it is a summary of what was found, said once. */
const WX_SEO_WEIGHTS = ['error' => 8, 'warn' => 3, 'note' => 1];

/** The record file — v2.1's own, which the old admin still reads (`_private/seo.json`). */
function wx_seo_file(): string
{
    return defined('WX_SEO_TEST_FILE') ? (string) WX_SEO_TEST_FILE : WX_PRIVATE_DIR . '/seo.json';
}

function wx_seo_store(): JsonStore
{
    /* `WX_SEO_TEST_FILE` is the one seam in this file, for the same reason `WX_AI_TEST_FILE` is the one in
       `lib/ai.php`: this is a file on a live host, and a suite that wrote to it would edit the studio's own
       records. v2.1's shape is kept, so the old admin reads and writes the same thing. */
    return new JsonStore(wx_seo_file(), true);
}

/** Every stored record: `rel => {kw, related[], schema[], t}` and whatever v2.1 left beside them. */
function wx_seo_records(): array
{
    $raw = wx_seo_store()->tryRead();
    $pages = is_array($raw['pages'] ?? null) ? $raw['pages'] : [];
    return $pages;
}

function wx_seo_record(string $rel): ?array
{
    $all = wx_seo_records();
    return is_array($all[$rel] ?? null) ? $all[$rel] : null;
}

/**
 * A page address as this store keys it — v2.1's own `rel_ok()`, without the filesystem.
 *
 * The store keys a record by the page's *address* and never turns it into a path, so this validates the shape
 * of an address rather than where the file is. Whether the page exists is the route's business, because a
 * phrase stored against a page somebody has not created yet is a mistake a screen should show, not a key this
 * function should invent. `wx_page_rel()` stays the only door into the filesystem, and it refuses a path whose
 * folder is not there — which is right for a write and wrong for a record.
 */
function wx_seo_rel(string $rel): string
{
    $rel = ltrim(str_replace('\\', '/', trim($rel)), '/');
    $rel = (string) preg_replace('~/{2,}~', '/', $rel);
    if ($rel === '' || str_contains($rel, '..') || str_starts_with($rel, '.')) {
        throw ApiError::validation('That is not a page address', 'rel');
    }
    if (!preg_match('~^[a-z0-9][a-z0-9/_.-]*\.html?$~i', $rel)) {
        throw ApiError::validation('A page address ends in .html — "' . $rel . '" does not', 'rel');
    }
    return $rel;
}

/**
 * Keep one page's record — the keyphrase, the related phrases and the schema choice.
 *
 * The write is one update under the store's lock, so a save from the new console and a save from v2.1's
 * screen cannot lose each other's pages: v2.1 read the whole file, edited its copy and wrote it back.
 */
function wx_seo_put(string $rel, array $fields): array
{
    $rel = wx_seo_rel($rel);
    $out = [];
    wx_seo_store()->update(static function (array $data) use ($rel, $fields, &$out): array {
        $pages = is_array($data['pages'] ?? null) ? $data['pages'] : [];
        $p = is_array($pages[$rel] ?? null) ? $pages[$rel] : [];
        if (array_key_exists('kw', $fields)) {
            $p['kw'] = mb_substr(trim((string) $fields['kw']), 0, WX_SEO_KW_MAX);
        }
        if (array_key_exists('related', $fields)) {
            $rows = [];
            foreach ((array) $fields['related'] as $x) {
                $v = mb_substr(trim((string) $x), 0, WX_SEO_KW_MAX);
                if ($v !== '') {
                    $rows[] = $v;
                }
            }
            $p['related'] = array_slice(array_values(array_unique($rows)), 0, WX_SEO_RELATED_MAX);
        }
        if (array_key_exists('schema', $fields)) {
            $p['schema'] = array_values(array_intersect(WX_SEO_SCHEMAS, array_map('strval', (array) $fields['schema'])));
        }
        $p['t'] = wx_now();
        $pages[$rel] = $p;
        $data['pages'] = $pages;
        $out = $p;
        return $data;
    });
    return $out;
}

/* ============================================================ reading a page

   v2.1's `seo_text()`: the words a reader sees, without the furniture. The header, the mobile menu, the
   footer and the script blocks are not this page's content — counting them would make every page look
   substantial, which is the one thing a thin-content check must not do. */

/** Tags off, entities decoded, whitespace collapsed. */
function wx_seo_flatten(string $s): string
{
    return trim((string) preg_replace('~\s+~u', ' ', html_entity_decode(strip_tags($s), ENT_QUOTES | ENT_HTML5)));
}

/** The title, the first H1, the description and the readable text of one page. Pure. */
function wx_seo_text(string $html): array
{
    $body = (string) preg_replace('~<(script|style|noscript|template)\b.*?</\1>~is', ' ', $html);
    $body = (string) preg_replace(
        '~<header class="site-header".*?</header>|<nav class="mobile-panel".*?</nav>|<footer\b.*?</footer>~is',
        ' ',
        $body
    );
    $title = preg_match('~<title[^>]*>(.*?)</title>~is', $html, $m) ? wx_seo_flatten((string) $m[1]) : '';
    $h1s = preg_match_all('~<h1\b[^>]*>(.*?)</h1>~is', $body, $mm) ? $mm[1] : [];
    $spaced = (string) preg_replace('~<(br|/p|/h\d|/li|/div)\b[^>]*>~i', '$0 ', $body);
    $text = wx_seo_flatten($spaced);
    return [
        'title' => $title,
        'h1' => $h1s === [] ? '' : wx_seo_flatten((string) $h1s[0]),
        'h1Count' => count($h1s),
        'desc' => (string) (wx_head_meta($html, 'description') ?? ''),
        'text' => $text,
        'words' => $text === '' ? 0 : count(preg_split('~\s+~u', $text, -1, PREG_SPLIT_NO_EMPTY)),
    ];
}

/**
 * The internal links on a page, as candidate page paths. Pure.
 *
 * Only hrefs that begin with `/` are ours to check (an external link is somebody else's file), and only the
 * ones that could name a page: `/assets/…`, an upload, a `tel:` or a folder the site keeps its machinery in
 * are not pages, and a link with an extension that is not `.html` is a file. `/about/` and `/about` both mean
 * `about/index.html`, which is how this site's addresses work.
 */
function wx_seo_links(string $html, string $rel): array
{
    $out = [];
    if (!preg_match_all('~<a\b[^>]*\bhref\s*=\s*(["\'])(.*?)\1~is', $html, $m)) {
        return [];
    }
    foreach ($m[2] as $href) {
        $href = trim((string) preg_replace('~\s+~', '', (string) $href));
        $path = (string) preg_split('~[?#]~', $href, 2)[0];
        if ($path === '' || $path[0] !== '/') {
            continue;
        }
        $path = ltrim($path, '/');
        if ($path === '') {
            $out[] = 'index.html';
            continue;
        }
        $top = explode('/', $path)[0];
        if (in_array($top, WX_PAGE_SKIP, true)) {
            continue;
        }
        $base = explode('/', $path);
        $last = (string) end($base);
        if (str_contains($last, '.') && !preg_match('~\.html?$~i', $last)) {
            continue;   // a file: an image, a PDF, a stylesheet
        }
        $candidate = preg_match('~\.html?$~i', $path) ? $path : rtrim($path, '/') . '/index.html';
        if (preg_match('~^[a-z0-9][a-z0-9/_.-]*$~i', $candidate)) {
            $out[] = $candidate;
        }
    }
    $out = array_values(array_unique($out));
    return array_values(array_filter($out, static fn(string $r): bool => $r !== $rel));
}

/* ============================================================ the audit

   One page's findings, from its own facts and the site-wide counts. Pure: no file is read here, which is why
   every rule below is tested by the suite in a sandbox with no site on disk. */

/**
 * What is wrong with one page.
 *
 * @param array $f      rel, title, desc, h1Count, words, indexable, status, inSitemap, images, imagesNoAlt,
 *                      broken (page paths this page links to that are not on the site), kind
 * @param array $counts title and description counts across the site: `['title' => [text => n], 'desc' => …]`
 * @return array<int, array{code:string, level:string, field:string, message:string}>
 */
function wx_seo_issues(array $f, array $counts = []): array
{
    $out = [];
    $add = static function (string $code, string $level, string $field, string $message) use (&$out): void {
        $out[] = ['code' => $code, 'level' => $level, 'field' => $field, 'message' => $message];
    };

    [$tMin, $tMax] = WX_SEO_TITLE_RANGE;
    $title = (string) ($f['title'] ?? '');
    $tLen = mb_strlen($title);
    if ($title === '') {
        $add('title_missing', 'error', 'title', 'No title — this is the line Google shows, and it is the first thing it reads.');
    } elseif ($tLen > $tMax) {
        $add('title_long', 'warn', 'title', 'The title is ' . $tLen . ' characters; Google shows about ' . $tMax . ' and cuts the rest.');
    } elseif ($tLen < $tMin) {
        $add('title_short', 'note', 'title', 'The title is ' . $tLen . ' characters — short for what it could say.');
    }
    if ($title !== '' && (int) ($counts['title'][$title] ?? 0) > 1) {
        $n = (int) $counts['title'][$title];
        $add('title_duplicate', 'error', 'title', $n . ' pages share this title, so Google has to choose between them.');
    }

    [$dMin, $dMax] = WX_SEO_DESC_RANGE;
    $desc = (string) ($f['desc'] ?? '');
    $dLen = mb_strlen($desc);
    if ($desc === '') {
        $add('desc_missing', 'warn', 'description', 'No description, so Google writes its own from whatever it finds on the page.');
    } elseif ($dLen > $dMax) {
        $add('desc_long', 'note', 'description', 'The description is ' . $dLen . ' characters; about ' . $dMax . ' is what is shown.');
    } elseif ($dLen < $dMin) {
        $add('desc_short', 'note', 'description', 'The description is ' . $dLen . ' characters — room for a reason to click.');
    }
    if ($desc !== '' && (int) ($counts['desc'][$desc] ?? 0) > 1) {
        $n = (int) $counts['desc'][$desc];
        $add('desc_duplicate', 'warn', 'description', $n . ' pages share this description, which reads as one page repeated.');
    }

    $h1 = (int) ($f['h1Count'] ?? 0);
    if ($h1 === 0) {
        $add('h1_missing', 'warn', 'h1', 'No H1 — the page has no headline for a reader to land on.');
    } elseif ($h1 > 1) {
        $add('h1_multiple', 'warn', 'h1', $h1 . ' H1 headings; one headline per page is what a crawler expects.');
    }

    if ((int) ($f['words'] ?? 0) < WX_SEO_THIN_WORDS) {
        $add('thin_text', 'note', 'text', 'About ' . (int) $f['words'] . ' words of text — one of the pages a search engine may treat as thin.');
    }

    $status = (string) ($f['status'] ?? 'published');
    $indexable = (bool) ($f['indexable'] ?? true);
    $inSitemap = (bool) ($f['inSitemap'] ?? false);
    if ($status !== 'published') {
        $add('not_public', 'note', 'status', $status === 'draft'
            ? 'A draft: not public, and not in the sitemap.'
            : 'Hidden from the site: reachable by address only, and not in the sitemap.');
    } elseif (!$indexable) {
        $add('noindex', 'warn', 'robots', 'Published, but search engines are told not to index it.');
    }
    if ($status === 'published' && $indexable && !$inSitemap) {
        $add('not_in_sitemap', 'error', 'sitemap', 'Published and open to search, but not in sitemap.xml.');
    }
    if (!$indexable && $inSitemap) {
        $add('sitemap_noindex', 'error', 'sitemap', 'Listed in sitemap.xml while telling search engines not to index it — one of the two is wrong.');
    }

    $broken = (array) ($f['broken'] ?? []);
    if ($broken !== []) {
        $n = count($broken);
        $add('broken_link', 'error', 'links', $n . ($n === 1 ? ' link points' : ' links point') . ' at ' . ($n === 1 ? 'a page' : 'pages') . ' that ' . ($n === 1 ? 'is' : 'are') . ' not on the site: ' . implode(', ', array_slice($broken, 0, 3)) . ($n > 3 ? ' and ' . ($n - 3) . ' more' : '') . '.');
    }

    $noAlt = (int) ($f['imagesNoAlt'] ?? 0);
    if ($noAlt > 0) {
        $add('image_no_alt', 'note', 'images', $noAlt . ($noAlt === 1 ? ' image has' : ' images have') . ' no alt text, which is what a search engine reads instead of the picture.');
    }

    return $out;
}

/** A page's number, derived from its findings and nothing else. 100 when there is nothing to report. */
function wx_seo_score(array $issues): int
{
    $n = 100;
    foreach ($issues as $i) {
        $n -= (int) (WX_SEO_WEIGHTS[(string) ($i['level'] ?? 'note')] ?? 1);
    }
    return max(0, $n);
}

/** The findings by level, and by code — what the top of a screen summarises. */
function wx_seo_tally(array $rows): array
{
    $by = ['error' => 0, 'warn' => 0, 'note' => 0];
    $codes = [];
    $clean = 0;
    foreach ($rows as $r) {
        $issues = (array) ($r['issues'] ?? []);
        if ($issues === []) {
            $clean++;
        }
        foreach ($issues as $i) {
            $lvl = (string) ($i['level'] ?? 'note');
            $by[$lvl] = ($by[$lvl] ?? 0) + 1;
            $code = (string) ($i['code'] ?? '');
            $codes[$code] = ($codes[$code] ?? 0) + 1;
        }
    }
    arsort($codes);
    return ['byLevel' => $by, 'byCode' => $codes, 'clean' => $clean];
}

/**
 * One page's facts, read from the file. The reading half of the audit.
 *
 * Everything expensive is done once per page: the head, the words, the links, the `<img>` tags. The
 * site-wide counts (which titles repeat) are the caller's business, because they need every page first.
 */
function wx_seo_facts(string $rel): array
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    $html = (string) file_get_contents($abs, false, null, 0, 400_000);
    $t = wx_seo_text($html);
    $state = wx_page_state($rel);
    $imgs = preg_match_all('~<img\b[^>]*>~i', $html, $mm) ? $mm[0] : [];
    $noAlt = 0;
    foreach ($imgs as $tag) {
        if (!preg_match('~\balt\s*=\s*(["\'])(.*?)\1~is', (string) $tag, $am) || trim((string) $am[2]) === '') {
            $noAlt++;
        }
    }
    return [
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'title' => $t['title'],
        'desc' => $t['desc'],
        'h1' => $t['h1'],
        'h1Count' => $t['h1Count'],
        'words' => $t['words'],
        'status' => $state['status'],
        'indexable' => $state['indexable'],
        'inSitemap' => $state['inSitemap'],
        'images' => count($imgs),
        'imagesNoAlt' => $noAlt,
        'links' => wx_seo_links($html, $rel),
        'bytes' => strlen($html),
        'mtime' => gmdate('Y-m-d H:i:s', (int) filemtime($abs)),
    ];
}

/**
 * The whole site, audited.
 *
 * This reads every page's head (400 KB at most of each, the same limit the kind scan uses) and it is the one
 * expensive read in the console — 150 pages, one request, on demand. It is not cached, deliberately: a
 * cached audit is an answer about a site that has changed since.
 */
function wx_seo_audit(): array
{
    $rels = wx_page_walk(WX_SITE_ROOT);
    $kinds = wx_page_kinds();
    $facts = [];
    foreach ($rels as $rel) {
        try {
            $facts[] = wx_seo_facts($rel);
        } catch (Throwable $e) {
            /* A page that cannot be read is reported, not skipped silently: the audit is about the site as it
               is, and an unreadable file is a finding somebody has to see. */
            $facts[] = [
                'rel' => $rel, 'url' => wx_page_url($rel), 'title' => '', 'desc' => '', 'h1' => '', 'h1Count' => 0,
                'words' => 0, 'status' => 'published', 'indexable' => true, 'inSitemap' => false, 'images' => 0,
                'imagesNoAlt' => 0, 'links' => [], 'bytes' => 0, 'mtime' => null, 'unreadable' => $e->getMessage(),
            ];
        }
    }

    /* Cross-page counts first: a title is only a duplicate beside the others. */
    $counts = ['title' => [], 'desc' => []];
    foreach ($facts as $f) {
        if ($f['title'] !== '') {
            $counts['title'][$f['title']] = (int) ($counts['title'][$f['title']] ?? 0) + 1;
        }
        if ($f['desc'] !== '') {
            $counts['desc'][$f['desc']] = (int) ($counts['desc'][$f['desc']] ?? 0) + 1;
        }
    }
    $known = array_fill_keys($rels, true);
    $rows = [];
    foreach ($facts as $f) {
        $broken = [];
        foreach ($f['links'] as $target) {
            if (!isset($known[$target])) {
                $broken[] = '/' . $target;
            }
        }
        $f['broken'] = array_slice($broken, 0, 20);
        $f['brokenCount'] = count($broken);
        /* The link list itself is dropped: the screen shows findings, and 150 pages' worth of link maps is a
           payload nobody reads. `wx_seo_page_view()` has the page's own list when a screen asks for one. */
        unset($f['links']);
        $f['kind'] = (string) ($kinds[$f['rel']] ?? '');
        $f['issues'] = wx_seo_issues($f, $counts);
        $f['score'] = wx_seo_score($f['issues']);
        $rows[] = $f;
    }
    usort($rows, static fn(array $a, array $b): int => [$a['score'], $a['rel']] <=> [$b['score'], $b['rel']]);

    $tally = wx_seo_tally($rows);
    $listed = 0;
    foreach ($rows as $r) {
        if ($r['inSitemap']) {
            $listed++;
        }
    }
    return [
        'pages' => $rows,
        'count' => count($rows),
        'summary' => [
            'byLevel' => $tally['byLevel'],
            'byCode' => $tally['byCode'],
            'clean' => $tally['clean'],
            'average' => $rows === [] ? 0 : (int) round(array_sum(array_column($rows, 'score')) / count($rows)),
            'inSitemap' => $listed,
        ],
        'checkedAt' => wx_now(),
    ];
}

/* ============================================================ the managed schema block

   v2.1 wrote one JSON-LD block into a page's head, keyed by an id, and skipped any type the page already
   declared. Both are kept: the id is what makes the block *managed* — it is replaced, never added twice —
   and skipping what is already there is what stops the same fact being said twice in one page. The facts
   come from the company record the documents print with, not from a second copy of them. */

/** The schema types already on a page, ignoring our own block. Pure. */
function wx_seo_existing_types(string $html): array
{
    $html = (string) preg_replace('~<script type="application/ld\+json" id="wx-seo-schema">.*?</script>~is', '', $html);
    $types = [];
    if (preg_match_all('~<script[^>]+application/ld\+json[^>]*>(.*?)</script>~is', $html, $mm)) {
        foreach ($mm[1] as $js) {
            $decoded = json_decode(trim((string) $js), true);
            $walk = static function ($o) use (&$walk, &$types): void {
                if (!is_array($o)) {
                    return;
                }
                if (isset($o['@type'])) {
                    foreach ((array) $o['@type'] as $t) {
                        $types[] = (string) $t;
                    }
                }
                foreach ($o as $v) {
                    if (is_array($v)) {
                        $walk($v);
                    }
                }
            };
            $walk($decoded);
        }
    }
    return array_values(array_unique($types));
}

/** The FAQ pairs on a page, as schema.org questions. Pure. */
function wx_seo_faq(string $html): array
{
    $out = [];
    if (preg_match_all('~<details\b[^>]*>\s*<summary\b[^>]*>(.*?)</summary>(.*?)</details>~is', $html, $mm, PREG_SET_ORDER)) {
        foreach ($mm as $m) {
            $q = wx_seo_flatten((string) $m[1]);
            $a = wx_seo_flatten((string) $m[2]);
            if ($q !== '' && $a !== '') {
                $out[] = [
                    '@type' => 'Question',
                    'name' => mb_substr($q, 0, 300),
                    'acceptedAnswer' => ['@type' => 'Answer', 'text' => mb_substr($a, 0, 1500)],
                ];
            }
        }
    }
    return array_slice($out, 0, 20);
}

/**
 * The JSON-LD block for the chosen types, or null when there is nothing to add. Pure but for the page's
 * modification time, which is passed in so the function has no clock of its own.
 *
 * @param array $co the company record (`wx_company()`): name, phones, email, address, web
 */
function wx_seo_schema_block(string $rel, string $html, array $types, array $co, ?int $mtime = null): ?string
{
    $t = wx_seo_text($html);
    $have = wx_seo_existing_types($html);
    /* The site's own address, from the constant the sitemap is written with: the schema block and the sitemap
       must not disagree about which host this is, whatever the company record happens to say. */
    $base = WX_CONTENT_SITE;
    $url = $base . wx_page_url($rel);
    $og = (string) (wx_head_meta($html, 'og:image', 'property') ?? '');
    if ($og !== '' && $og[0] === '/') {
        $og = $base . $og;
    }
    $phone = trim((string) (preg_split('~[,·]~u', (string) ($co['phones'] ?? ''))[0] ?? ''));
    $biz = [
        '@type' => 'LocalBusiness',
        '@id' => $base . '/#business',
        'name' => (string) ($co['name'] ?? ''),
        'url' => $base . '/',
        'telephone' => $phone,
        'email' => (string) ($co['email'] ?? ''),
        'address' => [
            '@type' => 'PostalAddress',
            'streetAddress' => (string) ($co['address'] ?? ''),
            'addressLocality' => 'Lahore',
            'addressCountry' => 'PK',
        ],
        'priceRange' => 'PKR',
    ] + ($og !== '' ? ['image' => $og] : []);

    $graph = [];
    $added = [];
    foreach (array_intersect(WX_SEO_SCHEMAS, $types) as $ty) {
        if (in_array($ty, $have, true)) {
            continue;
        }
        if ($ty === 'LocalBusiness') {
            $graph[] = $biz;
        } elseif ($ty === 'Service') {
            $graph[] = [
                '@type' => 'Service',
                'name' => $t['h1'] !== '' ? $t['h1'] : $t['title'],
                'description' => $t['desc'],
                'url' => $url,
                'areaServed' => 'Pakistan',
                'provider' => ['@id' => $base . '/#business', '@type' => 'LocalBusiness', 'name' => (string) ($co['name'] ?? '')],
            ];
        } elseif ($ty === 'Article') {
            $graph[] = [
                '@type' => 'Article',
                'headline' => mb_substr($t['h1'] !== '' ? $t['h1'] : $t['title'], 0, 110),
                'description' => $t['desc'],
                'mainEntityOfPage' => $url,
                'dateModified' => gmdate('c', $mtime ?? time()),
                'author' => ['@type' => 'Organization', 'name' => (string) ($co['name'] ?? '')],
                'publisher' => ['@type' => 'Organization', 'name' => (string) ($co['name'] ?? '')],
            ] + ($og !== '' ? ['image' => $og] : []);
        } elseif ($ty === 'FAQPage') {
            $f = wx_seo_faq($html);
            if ($f === []) {
                continue;   // a page with no questions has no FAQ page to declare
            }
            $graph[] = ['@type' => 'FAQPage', 'mainEntity' => $f];
        } elseif ($ty === 'BreadcrumbList') {
            $parts = array_values(array_filter(explode('/', trim(wx_page_url($rel), '/'))));
            $items = [['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $base . '/']];
            $acc = '';
            foreach ($parts as $k => $p) {
                $acc .= '/' . $p;
                $items[] = [
                    '@type' => 'ListItem',
                    'position' => $k + 2,
                    'name' => ($k === count($parts) - 1 && $t['h1'] !== '') ? $t['h1'] : ucwords(str_replace('-', ' ', $p)),
                    'item' => $base . $acc . '/',
                ];
            }
            if (count($items) < 2) {
                continue;
            }
            $graph[] = ['@type' => 'BreadcrumbList', 'itemListElement' => $items];
        }
        $added[] = $ty;
    }
    return $graph === [] ? null : json_encode(
        ['@context' => 'https://schema.org', '@graph' => $graph],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG
    );
}

/** The page HTML with the managed block set to the chosen types (or removed when there is nothing to say). */
function wx_seo_schema_html(string $html, ?string $json): string
{
    $html = (string) preg_replace('~\s*<script type="application/ld\+json" id="wx-seo-schema">.*?</script>~is', '', $html);
    if ($json === null) {
        return $html;
    }
    $tag = '<script type="application/ld+json" id="wx-seo-schema">' . $json . '</script>';
    return wx_head_set($html, '~<script type="application/ld\+json" id="wx-seo-schema">.*?</script>~is', $tag);
}

/**
 * Apply the schema choice to a page, through the versioned writer.
 *
 * v2.1 called `backup_page()` and then wrote the file. This goes through `wx_page_write()`, so the block is
 * a version in the history like every other change to the page, and the audit log names the types.
 */
function wx_seo_schema_apply(string $rel, array $types, array $me): array
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    $before = (string) file_get_contents($abs);
    $json = wx_seo_schema_block($rel, $before, $types, wx_company(), (int) filemtime($abs));
    $html = wx_seo_schema_html($before, $json);
    $existing = wx_seo_existing_types($before);
    /* What the block actually says, read back from the block rather than from the request: a type can be
       dropped on the way (a page with no questions has no FAQ page to declare), and the answer has to be
       what was written rather than what was asked for. */
    $added = [];
    foreach ((array) (json_decode((string) $json, true)['@graph'] ?? []) as $node) {
        if (is_array($node) && isset($node['@type'])) {
            $added[] = (string) $node['@type'];
        }
    }
    if ($html === $before) {
        return ['rel' => $rel, 'wrote' => false, 'types' => $types, 'added' => $added, 'existing' => $existing, 'version' => 0, 'batch' => null];
    }
    $w = wx_page_write($rel, $html, $me, ['note' => 'structured data: ' . ($added === [] ? 'removed' : implode(', ', $added))]);
    wx_audit($me, 'seo.schema', $rel, ['types' => $types, 'added' => $added, 'existing' => $existing, 'batch' => $w['batch']]);
    return ['rel' => $rel, 'wrote' => true, 'types' => $types, 'added' => $added, 'existing' => $existing, 'version' => $w['version'], 'batch' => $w['batch']];
}

/* ============================================================ robots.txt and the sitemap */

/**
 * What is wrong with a robots.txt somebody typed, or null when nothing is. Pure.
 *
 * One line out of a hundred can take a site out of Google — `Disallow: /` is a valid file that does exactly
 * that — so it is refused rather than saved, with `force` as the way to say "yes, I mean it".
 */
function wx_seo_robots_problem(string $text, bool $force = false): ?string
{
    if (strlen($text) > 5000) {
        return 'robots.txt is 5000 characters at most.';
    }
    if (!$force && preg_match('~^\s*Disallow:\s*/\s*$~mi', $text)) {
        return 'This one line would block Google from the whole site (Disallow: /) — remove it, or say you mean it.';
    }
    if (preg_match('~[\x00-\x08\x0B\x0C\x0E-\x1F]~', $text)) {
        return 'robots.txt is plain text — it cannot carry control characters.';
    }
    return null;
}

/**
 * The sitemap for a set of pages, as XML. Pure: rels in, file contents out.
 *
 * Only pages that are public and indexable belong in it, and the rebuild reads that from the site as it is
 * rather than from a stored copy of an opinion about it — which is what v2.1's `publish_rules()` did, and why
 * a page could sit in the sitemap while telling Google not to index it. Entries the walk does not know about
 * (an address somebody added by hand) are kept: a rebuild removes what it can prove is wrong, not what it
 * does not recognise.
 *
 * @param array $pages `rel => ['url' => '/x/', 'lastmod' => '2026-10-07']` for every page to list
 * @param array $keep  locations already in the file that no page of ours explains
 */
function wx_seo_sitemap_xml(array $pages, array $keep = []): string
{
    $locs = [];
    foreach ($pages as $p) {
        $loc = WX_CONTENT_SITE . (string) $p['url'];
        $locs[$loc] = (string) ($p['lastmod'] ?? gmdate('Y-m-d'));
    }
    foreach ($keep as $loc) {
        $loc = rtrim((string) $loc);
        if ($loc !== '' && !isset($locs[$loc])) {
            $locs[$loc] = '';
        }
    }
    ksort($locs);
    $body = '';
    foreach ($locs as $loc => $lastmod) {
        $body .= '  <url><loc>' . htmlspecialchars((string) $loc, ENT_XML1) . '</loc>'
            . ($lastmod !== '' ? '<lastmod>' . htmlspecialchars($lastmod, ENT_XML1) . '</lastmod>' : '')
            . "</url>\n";
    }
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" . $body . "</urlset>\n";
}

/** Every page that belongs in the sitemap, with the date its file was last written. */
function wx_seo_sitemap_pages(): array
{
    $map = wx_page_state_map();
    $out = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (in_array($rel, WX_SEO_SITEMAP_SKIP, true)) {
            continue;
        }
        $abs = WX_SITE_ROOT . '/' . $rel;
        $head = (string) file_get_contents($abs, false, null, 0, 400_000);
        $robots = (string) (wx_head_meta($head, 'robots') ?? '');
        if (stripos($robots, 'noindex') !== false) {
            continue;
        }
        if (($map[$rel]['status'] ?? 'published') !== 'published') {
            continue;
        }
        $out[] = ['rel' => $rel, 'url' => wx_page_url($rel), 'lastmod' => gmdate('Y-m-d', (int) filemtime($abs)), 'title' => wx_page_title_of($head)];
    }
    return $out;
}

/** Every address a page on disk explains, whether or not it belongs in the sitemap. */
function wx_seo_sitemap_explained(): array
{
    $out = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $out[WX_CONTENT_SITE . wx_page_url($rel)] = true;
    }
    return $out;
}

/** The locations already in the file that no page on disk explains — somebody's own addition, kept. */
function wx_seo_sitemap_extra(array $explained): array
{
    $file = wx_page_sitemap_file();
    if (!is_file($file)) {
        return [];
    }
    $xml = (string) file_get_contents($file);
    preg_match_all('~<loc>(.*?)</loc>~s', $xml, $m);
    $out = [];
    foreach ($m[1] ?? [] as $loc) {
        $loc = trim((string) $loc);
        if ($loc !== '' && !isset($explained[$loc])) {
            $out[] = $loc;
        }
    }
    return array_values(array_unique($out));
}

/**
 * What the sitemap says now, against what the pages are.
 *
 * Three questions, and the site has to answer all three honestly: which public pages are missing from the
 * file, which entries in it belong to a page that is no longer public or indexable, and which addresses in it
 * no page on disk explains (somebody's own addition — kept, and reported rather than removed behind their
 * back). `$rows` lets a caller that has just audited the site pass its findings in; without it this reads the
 * pages itself, which is the same work the audit did.
 *
 * @param array<int,array<string,mixed>>|null $rows audit rows: rel, url, status, indexable, inSitemap
 */
function wx_seo_sitemap_state(?array $rows = null): array
{
    if ($rows === null) {
        $rows = [];
        $map = wx_page_state_map();
        foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
            $abs = WX_SITE_ROOT . '/' . $rel;
            $head = is_file($abs) ? (string) file_get_contents($abs, false, null, 0, 400_000) : '';
            $robots = (string) (wx_head_meta($head, 'robots') ?? '');
            $rows[] = [
                'rel' => $rel,
                'url' => wx_page_url($rel),
                'status' => (string) ($map[$rel]['status'] ?? 'published'),
                'indexable' => stripos($robots, 'noindex') === false,
                'inSitemap' => wx_page_in_sitemap($rel),
            ];
        }
    }
    $file = wx_page_sitemap_file();
    $xml = is_file($file) ? (string) file_get_contents($file) : '';
    preg_match_all('~<loc>(.*?)</loc>~s', $xml, $m);
    $locs = [];
    foreach ($m[1] ?? [] as $loc) {
        $loc = trim((string) $loc);
        if ($loc !== '') {
            $locs[$loc] = true;
        }
    }
    $explained = wx_seo_sitemap_explained();
    $missing = [];
    $shouldNot = [];
    $listed = 0;
    foreach ($rows as $r) {
        $rel = (string) $r['rel'];
        $loc = WX_CONTENT_SITE . (string) $r['url'];
        $belongs = (string) ($r['status'] ?? 'published') === 'published'
            && (bool) ($r['indexable'] ?? true)
            && !in_array($rel, WX_SEO_SITEMAP_SKIP, true);
        $in = (bool) ($r['inSitemap'] ?? false);
        if ($in) {
            $listed++;
        }
        if ($belongs && !$in) {
            $missing[] = $rel;
        }
        if ($in && !$belongs) {
            $shouldNot[] = $rel;
        }
    }
    $extra = [];
    foreach (array_keys($locs) as $loc) {
        if (!isset($explained[$loc])) {
            $extra[] = $loc;
        }
    }
    return [
        'file' => basename($file),
        'exists' => is_file($file),
        'count' => count($locs),
        'at' => is_file($file) ? gmdate('Y-m-d H:i:s', (int) filemtime($file)) : null,
        'listed' => $listed,
        'missing' => $missing,
        'shouldNotBeListed' => $shouldNot,
        'extra' => $extra,
        /* What the file would hold after a rebuild: the pages that belong in it, plus the entries it cannot
           explain, minus the entries it can prove should not be there. */
        'wanted' => $listed - count($shouldNot) + count($missing) + count($extra),
        'skip' => WX_SEO_SITEMAP_SKIP,
    ];
}

/**
 * Rebuild `sitemap.xml` from the pages as they are — v2.1's `seo_sitemap` action, which asked `publish_rules()`
 * to do it.
 *
 * Two things changed, and both of them are the reason it is worth pressing. It is built from the pages *as
 * they are now* — a draft, a hidden page and a page telling Google `noindex` are all left out, so the file
 * cannot go on advertising an address the studio has taken down. And what it removes, it can explain: an
 * address in the file that no page on disk accounts for is kept, because deleting somebody's hand-added URL
 * is not a rebuild. The four files that are not addresses are named in one constant with the evidence.
 */
function wx_seo_sitemap_rebuild(array $me): array
{
    $pages = wx_seo_sitemap_pages();
    $kept = wx_seo_sitemap_extra(wx_seo_sitemap_explained());
    $xml = wx_seo_sitemap_xml($pages, $kept);
    $file = wx_page_sitemap_file();
    $before = is_file($file) ? (string) file_get_contents($file) : '';
    $wrote = false;
    if ($before !== $xml) {
        if (!wx_write_file_atomic($file, $xml)) {
            throw ApiError::internal('Could not write ' . basename($file) . ' — is the site folder writable?');
        }
        $wrote = true;
    }
    wx_audit($me, 'seo.sitemap', (string) count($pages), ['kept' => count($kept), 'wrote' => $wrote]);
    return [
        'count' => count($pages),
        'kept' => $kept,
        'wrote' => $wrote,
        'file' => basename($file),
        'bytes' => strlen($xml),
        'at' => wx_now(),
    ];
}

/* ============================================================ robots.txt

   One file with one job, and a file somebody can type a line into that takes the whole site out of Google.
   v2.1 read it, wrote it and refused the one line that does that ("Disallow: /") unless it was told twice —
   the refusals are kept here, and so is the way it normalises what it writes, because a CRLF in robots.txt is
   a line Google may read differently. */

/** The file `seo_robots_save` writes. A name constant so a test can prove the write without editing it. */
function wx_seo_robots_file(): string
{
    return defined('WX_SEO_ROBOTS_FILE') ? (string) WX_SEO_ROBOTS_FILE : WX_SITE_ROOT . '/robots.txt';
}

/** robots.txt as it is: the text, the size, and the one thing about it a person should look at. */
function wx_seo_robots_read(): array
{
    $file = wx_seo_robots_file();
    $text = is_file($file) ? (string) file_get_contents($file) : '';
    return [
        'text' => $text,
        'bytes' => strlen($text),
        'exists' => is_file($file),
        'at' => is_file($file) ? gmdate('Y-m-d H:i:s', (int) filemtime($file)) : null,
        /* Not an error: a file that is there and blocks nothing is telling Google where the sitemap is, which
           is the reason to have one at all. */
        'sitemapLine' => preg_match('~^\s*Sitemap:\s*(\S+)~mi', $text, $m) ? trim((string) $m[1]) : null,
        'blocksAll' => (bool) preg_match('~^\s*Disallow:\s*/\s*$~mi', $text),
        'problem' => wx_seo_robots_problem($text),
    ];
}

/**
 * Write robots.txt — v2.1's normalisation, its refusal, and an audit line.
 *
 * The text is written with a trailing newline (a file whose last line has no newline is a file some tools read
 * as truncated) and with CRs removed, which is what v2.1 did. `force` is the second saying-so that lets
 * `Disallow: /` through; the screen asks for it in words.
 */
function wx_seo_robots_save(string $text, bool $force, array $me): array
{
    $text = str_replace("\r", '', $text);
    $problem = wx_seo_robots_problem($text, $force);
    if ($problem !== null) {
        throw ApiError::validation($problem, 'text');
    }
    $file = wx_seo_robots_file();
    $next = rtrim($text) === '' ? '' : rtrim($text) . "\n";
    $before = is_file($file) ? (string) file_get_contents($file) : '';
    if ($before !== $next && !wx_write_file_atomic($file, $next)) {
        throw ApiError::internal('Could not write robots.txt — is the site folder writable?');
    }
    wx_audit($me, 'seo.robots', '', ['bytes' => strlen($next), 'forced' => $force, 'wrote' => $before !== $next]);
    return wx_seo_robots_read() + ['wrote' => $before !== $next, 'forced' => $force];
}

/* ============================================================ one page, as the screen reads it */

/**
 * Everything the SEO screen needs about one page: its facts, its findings, its number, and what is stored.
 *
 * One function rather than five routes, because every part of it comes from the same read of the same file —
 * and the screen shows them side by side (the headline it found, next to the title it has, next to what
 * Google will cut).
 */
function wx_seo_page_view(string $rel): array
{
    $rel = wx_page_rel($rel);
    $facts = wx_seo_facts($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    $html = (string) file_get_contents($abs, false, null, 0, 400_000);
    $issues = wx_seo_issues($facts, []);
    $managed = [];
    if (preg_match('~<script type="application/ld\+json" id="wx-seo-schema">(.*?)</script>~is', $html, $m)) {
        foreach ((array) (json_decode(trim((string) $m[1]), true)['@graph'] ?? []) as $node) {
            if (is_array($node) && isset($node['@type'])) {
                $managed[] = (string) $node['@type'];
            }
        }
    }
    $record = wx_seo_record($rel);
    $questions = wx_seo_faq($html);
    return [
        'rel' => $rel,
        'url' => $facts['url'],
        'facts' => [
            'title' => $facts['title'],
            'desc' => $facts['desc'],
            'h1' => $facts['h1'],
            'h1Count' => $facts['h1Count'],
            'words' => $facts['words'],
            'images' => $facts['images'],
            'imagesNoAlt' => $facts['imagesNoAlt'],
            'bytes' => $facts['bytes'],
            'mtime' => $facts['mtime'],
            'status' => $facts['status'],
            'indexable' => $facts['indexable'],
            'inSitemap' => $facts['inSitemap'],
            'kind' => wx_page_kinds()[$rel] ?? '',
            'links' => count($facts['links']),
        ],
        'issues' => $issues,
        'score' => wx_seo_score($issues),
        /* v2.1's four names, kept because v2.1's page editor reads them and a key that changes name is a
           screen that quietly shows nothing: `seo` is the stored record, `existing` the schema types the page
           already declares, `managed` the types our own block declares, and `faq` the *count* of questions on
           the page — the list itself is `questions`, so a screen that wants to show them can. */
        'seo' => $record,
        'existing' => wx_seo_existing_types($html),
        'managed' => $managed,
        'faq' => count($questions),
        'questions' => $questions,
        'kw' => (string) ($record['kw'] ?? ''),
        'related' => (array) ($record['related'] ?? []),
        'schema' => (array) ($record['schema'] ?? []),
        'schemas' => WX_SEO_SCHEMAS,
        'checkedAt' => wx_now(),
    ];
}
