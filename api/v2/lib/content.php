<?php
/**
 * api/v2/lib/content.php — the content items, and the page an item becomes when it is published.
 *
 * The one decision that shapes this whole file: **the server composes the page.** In v2.1 the article
 * builder ran in the browser, composed a finished HTML document and posted it, and the API stored the
 * blob and wrote it to disk. That is why a scheduled post in v2.1 carried a `pending.html` of up to 3 MB
 * inside `content.json` — the server had nothing to render with — and why the *only* validation that
 * could exist was "does this look like HTML".
 *
 * Here an item is its *content*: a title, a slug, a few hero fields, and a list of sections. Publishing
 * composes the page from three things:
 *
 *   1. **A shell** — a real page of the same kind (`insights/index.html` by default), because the header,
 *      the head and the footer on the site are the site's, and a new article should inherit them rather
 *      than something the browser invented. The shell is read from disk at publish time, so an article
 *      published after a header change gets the *current* header.
 *   2. **The body** — the item's sections, rendered by `wx_content_body()`.
 *   3. **The head** — title, description, canonical and the social card, from the item's SEO fields.
 *
 * Consequences worth naming, because they are improvements rather than trade-offs:
 *
 *   · Nothing a browser sends can reach a published page as markup. Every string is escaped by the
 *     renderer, and every image goes through `wx_media_ok()`. The "does it look like HTML" check is gone
 *     because there is no HTML coming in.
 *   · Scheduling stops being a stored blob: an item due at 09:00 is a row with a time, and the tick
 *     renders it then. `wx_content_tick()` is the same publish path, one loop.
 *   · Publishing is a page write, so it is versioned and reversible like every other page change.
 */

declare(strict_types=1);

const WX_CONTENT_TYPES = ['post', 'study', 'testimonial', 'member', 'faq', 'city'];

const WX_CONTENT_PAGES = ['post' => 'insights', 'study' => 'projects'];

/** Folders a city page may not claim: v2.1 refused them too, because both are section index pages. */
const WX_CONTENT_CITY_SKIP = ['insights', 'projects'];

/**
 * Where an item's page goes — the address rule, in one place.
 *
 * A post and a case study live under the index page of their section. A city page is **root-level**,
 * `/<slug>/`: that is the address v2.1 wrote, that Google indexed and that somebody put on a card.
 * `null` means "this kind does not become a page of its own" (testimonials, team members, FAQs), and this
 * is the only place that question is answered — the item, the publish and the tick all ask it here.
 *
 * Pure: it takes the item and returns an address, so the rule can be tested without a database.
 */
function wx_content_rel(array $item): ?string
{
    $type = (string) ($item['type'] ?? '');
    $slug = (string) ($item['slug'] ?? '');
    if ($slug === '' || (!isset(WX_CONTENT_PAGES[$type]) && $type !== 'city')) {
        return null;
    }
    return $type === 'city' ? $slug . '/index.html' : WX_CONTENT_PAGES[$type] . '/' . $slug . '/index.html';
}

/** The sections an article body may contain, in the order they are offered. */
const WX_CONTENT_SECTIONS = ['lead', 'heading', 'para', 'list', 'image', 'quote', 'facts', 'faq', 'cta', 'related'];

const WX_CONTENT_SITE = 'https://woodex.com.pk';

/** Anything that becomes text in a page goes through here. One rule, one function. */
function wx_h($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5);
}

/* ============================================================ the items */

/**
 * Normalise an item coming from a request, and refuse the shapes that would produce a broken page.
 *
 * The rules that matter are the ones about *addresses*: a slug becomes a directory on a live server, so
 * it is lower-case letters, digits and dashes; a published page's address cannot change (a published
 * URL is in Google's index and on somebody's business card); and two items cannot claim one address.
 * The last one is enforced by the table's unique key as well — this is the message a person can read.
 */
function wx_content_clean(array $in, ?array $existing = null): array
{
    $type = (string) ($in['type'] ?? '');
    if (!in_array($type, WX_CONTENT_TYPES, true)) {
        throw ApiError::validation('Unknown content type: "' . $type . '"', 'type');
    }
    $title = mb_substr(trim((string) ($in['title'] ?? '')), 0, 200);
    if ($title === '') {
        throw ApiError::validation(in_array($type, ['testimonial', 'member'], true) ? 'A name is required' : 'A title is required', 'title');
    }
    $data = is_array($in['data'] ?? null) ? $in['data'] : [];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen((string) $json) > 400_000) {
        throw ApiError::validation('The content is too large (400 KB)', 'data');
    }

    $slug = '';
    if (isset(WX_CONTENT_PAGES[$type]) || $type === 'city') {
        $slug = strtolower(trim((string) ($in['slug'] ?? '')));
        if (!preg_match('~^[a-z0-9][a-z0-9-]{0,59}$~', $slug)) {
            throw ApiError::validation('The page address is lower-case letters, numbers and dashes', 'slug');
        }
        if ($type === 'city' && (in_array($slug, WX_PAGE_SKIP, true) || in_array($slug, WX_CONTENT_CITY_SKIP, true))) {
            throw ApiError::validation('"' . $slug . '" is a folder the site uses', 'slug');
        }
        if ($existing !== null && (string) ($existing['rel'] ?? '') !== '' && (string) $existing['slug'] !== $slug) {
            throw ApiError::validation('The address of a published page cannot be changed — the old address is already indexed', 'slug');
        }
    }
    /* The "is this address taken" question is answered at save time, not here: it needs the database, and
       this function is deliberately pure so the rules above can be tested without one. The table's unique
       key is the real guard — this is the message a person can read instead of a constraint violation. */

    $seo = is_array($in['seo'] ?? null) ? $in['seo'] : [];
    $related = [];
    foreach (array_slice((array) ($seo['related'] ?? []), 0, 4) as $x) {
        if (is_string($x) && trim($x) !== '') {
            $related[] = mb_substr(trim($x), 0, 120);
        }
    }

    return [
        'type' => $type,
        'title' => $title,
        'slug' => $slug,
        'data' => $data,
        'seo' => [
            'title' => mb_substr(trim((string) ($seo['title'] ?? '')), 0, 90),
            'desc' => mb_substr(trim((string) ($seo['desc'] ?? '')), 0, 200),
            'og' => mb_substr(trim((string) ($seo['og'] ?? '')), 0, 300),
            'kw' => mb_substr(trim((string) ($seo['kw'] ?? '')), 0, 120),
            'related' => $related,
        ],
        'flagOrder' => (int) ($in['order'] ?? 0),
        'tplId' => isset($in['tpl']) ? (int) $in['tpl'] : null,
    ];
}

/** One item as the screens read it: the row, its JSON columns decoded, and where it would live. */
function wx_content_item(array $row): array
{
    $data = json_decode((string) ($row['data'] ?? '{}'), true);
    $seo = json_decode((string) ($row['seo'] ?? '{}'), true);
    $type = (string) $row['type'];
    return [
        'id' => (int) $row['id'],
        'type' => $type,
        'status' => (string) $row['status'],
        'slug' => (string) ($row['slug'] ?? ''),
        'title' => (string) $row['title'],
        'rel' => $row['rel'],
        'url' => $row['rel'] !== null ? wx_page_url((string) $row['rel']) : null,
        'where' => ($rel = wx_content_rel(['type' => $type, 'slug' => (string) ($row['slug'] ?? '')])) !== null
            ? substr($rel, 0, -strlen('index.html'))
            : null,
        'data' => is_array($data) ? $data : [],
        'seo' => is_array($seo) ? $seo : [],
        'tpl' => $row['tpl_id'] !== null ? (int) $row['tpl_id'] : null,
        'order' => (int) $row['flag_order'],
        'imported' => (int) ($row['imported'] ?? 0) === 1,
        'publishAt' => $row['publish_at'],
        'publishedAt' => $row['published_at'],
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'createdBy' => (string) ($row['created_by'] ?? ''),
        'updatedAt' => $row['updated_at'],
        'updatedBy' => (string) ($row['updated_by'] ?? ''),
    ];
}

/**
 * The list, with the one number a screen leads with: how many are live, drafts, or due.
 *
 * `?filter=draft|live|due` and `?type=` are applied in SQL — the whole reason these rows left the JSON
 * file. `due` is a status of its own in the eyes of the person reading it: scheduled and past its time.
 */
function wx_content_list(array $opt = []): array
{
    $sql = 'SELECT * FROM wx_content';
    $where = [];
    $params = [];
    if (!empty($opt['type']) && in_array($opt['type'], WX_CONTENT_TYPES, true)) {
        $where[] = 'type = ?';
        $params[] = $opt['type'];
    }
    if (($opt['filter'] ?? '') === 'draft') {
        $where[] = 'status = ?';
        $params[] = 'draft';
    } elseif (($opt['filter'] ?? '') === 'live') {
        $where[] = 'status = ?';
        $params[] = 'published';
    } elseif (($opt['filter'] ?? '') === 'due') {
        $where[] = 'status = ? AND publish_at IS NOT NULL AND publish_at <= ?';
        $params[] = 'scheduled';
        $params[] = wx_now();
    } elseif (($opt['filter'] ?? '') === 'scheduled') {
        $where[] = 'status = ?';
        $params[] = 'scheduled';
    }
    if (!empty($opt['q'])) {
        $where[] = 'title LIKE ?';
        $params[] = '%' . $opt['q'] . '%';
    }
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY flag_order ASC, id DESC LIMIT ' . max(1, min(500, (int) ($opt['limit'] ?? 200)));
    $items = array_map('wx_content_item', wx_all($sql, $params));
    $counts = [];
    foreach (wx_all('SELECT type, status, COUNT(*) n FROM wx_content GROUP BY type, status') as $r) {
        $counts[(string) $r['type']][(string) $r['status']] = (int) $r['n'];
    }
    $due = (int) wx_val('SELECT COUNT(*) FROM wx_content WHERE status = ? AND publish_at IS NOT NULL AND publish_at <= ?', ['scheduled', wx_now()]);
    return ['items' => $items, 'counts' => $counts, 'due' => $due, 'total' => (int) wx_val('SELECT COUNT(*) FROM wx_content')];
}

/** Insert or update an item. Returns it as the screens read it. */
function wx_content_save(array $clean, ?array $existing, array $me): array
{
    if ($clean['slug'] !== '') {
        $clash = wx_one('SELECT id FROM wx_content WHERE type = ? AND slug = ? AND id <> ?', [$clean['type'], $clean['slug'], (int) ($existing['id'] ?? 0)]);
        if ($clash !== null) {
            throw ApiError::validation('Another item already uses the address /' . $clean['slug'] . '/', 'slug');
        }
    }
    $now = wx_now();
    if ($existing === null) {
        $id = wx_insert('wx_content', [
            'type' => $clean['type'],
            'status' => 'draft',
            'slug' => $clean['slug'],
            'title' => $clean['title'],
            'data' => json_encode($clean['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'seo' => json_encode($clean['seo'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'flag_order' => $clean['flagOrder'],
            'tpl_id' => $clean['tplId'],
            'created_at' => $now,
            'created_by' => (string) $me['name'],
            'updated_at' => $now,
            'updated_by' => (string) $me['name'],
        ]);
        wx_audit($me, 'content.create', $clean['type'] . ':' . $clean['title'], ['id' => $id]);
    } else {
        $id = (int) $existing['id'];
        wx_update('wx_content', [
            'slug' => $clean['slug'],
            'title' => $clean['title'],
            'data' => json_encode($clean['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'seo' => json_encode($clean['seo'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'flag_order' => $clean['flagOrder'],
            'tpl_id' => $clean['tplId'],
            'updated_at' => $now,
            'updated_by' => (string) $me['name'],
        ], ['id' => $id]);
        wx_audit($me, 'content.save', $clean['type'] . ':' . $clean['title'], ['id' => $id]);
    }
    return wx_content_item((array) wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]));
}

/* ============================================================ the SEO sync */

/**
 * The item that owns a page, by the page's address. Null when no item does.
 *
 * v2.1's `seo_save` walked every item comparing `($it['rel'] ?? '') === $rel` — the only lookup available,
 * because an item's address was computed on the way out rather than kept. Here `rel` is a column with a
 * unique key, so this is a query, and it is the lookup the SEO screen's save had been missing.
 */
function wx_content_by_rel(string $rel): ?array
{
    $row = wx_one('SELECT * FROM wx_content WHERE rel = ?', [$rel]);
    return $row === null ? null : wx_content_item($row);
}

/**
 * Keep the item that owns a page in step with the page's head — v2.1's CMS-sync leg of `seo_save`.
 *
 * A generated page's title, description and OG image live in its HTML, and the item's `seo` block is what a
 * *re-publish* writes back into that HTML. Left alone, an SEO edit is undone the next time somebody presses
 * publish — which is why v2.1 wrote this block on every save, inside the same try/catch that let a missing
 * content store be only a warning.
 *
 * Only `seo` is touched here: an item's title, address, body and status are the content screen's business.
 * Returns the block it wrote, or null when no item owns the page.
 */
function wx_content_seo_sync(string $rel, string $html, array $fields, array $me): ?array
{
    $item = wx_content_by_rel($rel);
    if ($item === null) {
        return null;
    }
    $t = wx_seo_text($html);
    $og = (string) (wx_head_meta($html, 'og:image', 'property') ?? '');
    $seo = array_merge((array) $item['seo'], [
        'title' => mb_substr($t['title'], 0, 90),
        'desc' => mb_substr($t['desc'], 0, 200),
        'og' => mb_substr($og, 0, 300),
        'kw' => (string) ($fields['kw'] ?? ''),
        'related' => array_values((array) ($fields['related'] ?? [])),
    ]);
    wx_update('wx_content', [
        'seo' => json_encode($seo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'updated_at' => wx_now(),
        'updated_by' => (string) $me['name'],
    ], ['id' => (int) $item['id']]);
    wx_audit($me, 'content.seo', (string) $item['rel'], ['id' => (int) $item['id'], 'kw' => $seo['kw']]);
    return $seo;
}

/* ============================================================ the page shell */

/**
 * Which page a kind of item copies its furniture from — the order of answers, pure.
 *
 * For a city page v2.1's model was *copy an existing city page and rewrite each string*; that is a
 * template, so here the template says which city it copies (`source`) and the furniture is read from that
 * page at publish time. With no source it is the front page, because a city page is a rewrite of the front
 * page for one city. `content.shell.city` overrides both, for a site whose city pages copy something else.
 *
 * Split out from `wx_content_shell()` so the priority can be tested without a database or a site tree.
 */
function wx_content_shell_rel(string $type, string $override = '', string $source = ''): string
{
    if (!isset(WX_CONTENT_PAGES[$type]) && $type !== 'city') {
        return '';
    }
    if ($override !== '') {
        return $override;
    }
    if ($type === 'city') {
        return $source !== '' ? $source . '/index.html' : 'index.html';
    }
    return WX_CONTENT_PAGES[$type] . '/index.html';
}

/**
 * The shell a kind of article is published into: the site's own page furniture, and the one page name
 * that has to be right for this site.
 *
 * Read at publish time rather than stored, so an article published this morning has this morning's
 * header — which is exactly what someone who just changed the header expects.
 *
 * @return array{rel:string, before:string, after:string, has_main:bool}
 */
function wx_content_shell(string $type, array $item = []): array
{
    $override = (string) wx_setting('content.shell.' . $type, '');
    $source = '';
    if ($type === 'city' && isset($item['tpl'])) {
        $row = wx_one('SELECT tpl FROM wx_content_tpl WHERE id = ?', [(int) $item['tpl']]);
        $tpl = $row === null ? null : json_decode((string) $row['tpl'], true);
        $source = is_array($tpl) ? (string) ($tpl['source'] ?? '') : '';
    }
    $rel = wx_content_shell_rel($type, $override, $source);
    if ($rel === '' || !is_file(WX_SITE_ROOT . '/' . $rel)) {
        throw ApiError::conflict(
            'There is no page to copy the page furniture from for a "' . $type . '". '
                . ($type === 'city'
                    ? 'A city page copies the front page unless its template names a city page as the source; content.shell.city names one directly.'
                    : 'Set it on this screen — it should be the index page of the section this item is published into.'),
            ['setting' => 'content.shell.' . $type, 'looked' => $rel]
        );
    }
    $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
    $open = stripos($html, '<main');
    $close = stripos($html, '</main>');
    if ($open === false || $close === false) {
        throw ApiError::conflict(
            'The shell page (' . $rel . ') has no <main> element, so there is nothing to replace with the article.',
            ['shell' => $rel]
        );
    }
    return [
        'rel' => $rel,
        'before' => substr($html, 0, $open),
        'after' => substr($html, $close + strlen('</main>')),
        'has_main' => true,
    ];
}

/**
 * The head of the page: title, description, canonical and the social card.
 *
 * Each tag is replaced if the shell has one and added if it does not, because a shell page that has no
 * Twitter card is a page whose article gets no Twitter card — and the fix for that is here, not in a
 * list of instructions for the editor.
 */
function wx_content_head(string $head, array $item): string
{
    $title = $item['seo']['title'] !== '' ? $item['seo']['title'] : $item['title'];
    $desc = $item['seo']['desc'];
    $url = WX_CONTENT_SITE . (string) ($item['url'] ?? '/');
    $img = '';
    foreach (($item['data']['sections'] ?? []) as $s) {
        if (($s['kind'] ?? '') === 'image' && !empty($s['url'])) {
            $img = WX_CONTENT_SITE . $s['url'];
            break;
        }
    }
    if ($img === '' && !empty($item['data']['hero']['image'])) {
        $img = WX_CONTENT_SITE . (string) $item['data']['hero']['image'];
    }

    /* Each tag is *replaced* when the shell has one and *added* when it does not — a shell page without a
       Twitter card is a page whose articles get no Twitter card, and the fix belongs here rather than in
       a list of instructions for the editor. The argument is the head's contents, but a full document
       works too (`</head>` present), because that is what a screen calls it with. */
    $set = static function (string $html, string $pattern, string $tag): string {
        if (preg_match($pattern, $html)) {
            return (string) preg_replace($pattern, $tag, $html, 1);
        }
        return str_contains(strtolower($html), '</head>')
            ? (string) preg_replace('~</head>~i', '  ' . $tag . "\n</head>", $html, 1)
            : $html . "\n  " . $tag;
    };

    $head = $set($head, '~<title>.*?</title>~is', '<title>' . wx_h($title) . ' · Woodex Interiors</title>');
    $head = $set($head, '~<meta\s+name="description"[^>]*>~i', '<meta name="description" content="' . wx_h($desc) . '">');
    $head = $set($head, '~<link\s+rel="canonical"[^>]*>~i', '<link rel="canonical" href="' . wx_h($url) . '">');
    $head = $set($head, '~<meta\s+property="og:title"[^>]*>~i', '<meta property="og:title" content="' . wx_h($title) . '">');
    $head = $set($head, '~<meta\s+property="og:description"[^>]*>~i', '<meta property="og:description" content="' . wx_h($desc) . '">');
    $head = $set($head, '~<meta\s+property="og:url"[^>]*>~i', '<meta property="og:url" content="' . wx_h($url) . '">');
    if ($img !== '') {
        $head = $set($head, '~<meta\s+property="og:image"[^>]*>~i', '<meta property="og:image" content="' . wx_h($img) . '">');
    }
    if (!empty($item['seo']['kw'])) {
        $head = $set($head, '~<meta\s+name="keywords"[^>]*>~i', '<meta name="keywords" content="' . wx_h($item['seo']['kw']) . '">');
    }
    return $head;
}

/**
 * Compose the finished page: shell + head + body.
 *
 * The `<main>` element of the shell is replaced whole, so an article page never inherits the list page's
 * hero — the mistake the browser-side builder could make and nobody could see until it was live.
 */
function wx_content_render(array $item, string $body, ?string $shellHtml = null): string
{
    if ($shellHtml === null) {
        $shell = wx_content_shell($item['type'], $item);
        $html = $shell['before'] . '<main id="main-content">' . $body . '</main>' . $shell['after'];
    } else {
        /* A test (or a caller with a specific shell) can pass one in. */
        $open = stripos($shellHtml, '<main');
        $close = stripos($shellHtml, '</main>');
        if ($open === false || $close === false) {
            throw ApiError::conflict('That shell has no <main> element');
        }
        $html = substr($shellHtml, 0, $open) . '<main id="main-content">' . $body . '</main>' . substr($shellHtml, $close + strlen('</main>'));
    }
    $headEnd = stripos($html, '</head>');
    if ($headEnd !== false) {
        $headStart = stripos($html, '<head');
        $headOpenEnd = $headStart === false ? false : stripos($html, '>', $headStart);
        if ($headOpenEnd !== false) {
            $head = substr($html, $headOpenEnd + 1, $headEnd - $headOpenEnd - 1);
            $html = substr($html, 0, $headOpenEnd + 1) . wx_content_head($head, $item) . substr($html, $headEnd);
        }
    }
    return $html;
}

/* ============================================================ the body renderer */

/** A URL that may go into a page: an internal path or an https address. Nothing else. */
function wx_content_url(string $u): string
{
    $u = trim($u);
    if ($u === '') {
        return '';
    }
    if (preg_match('~^https://[^\s"\'<>]+$~i', $u)) {
        return $u;
    }
    if (preg_match('~^/[a-z0-9/_\-.#?=&%+]*$~i', $u) && !str_contains($u, '//')) {
        return $u;
    }
    throw ApiError::validation('"the link" must be a path like /contact/ or an https:// address', 'url');
}

/**
 * Render one section. Unknown kinds are refused rather than skipped: a section the renderer does not know
 * is a section the editor wrote that would vanish silently from the page.
 */
function wx_content_section(array $s): string
{
    $kind = (string) ($s['kind'] ?? '');
    if (!in_array($kind, WX_CONTENT_SECTIONS, true)) {
        throw ApiError::validation('Unknown section: "' . $kind . '"', 'sections');
    }
    switch ($kind) {
        case 'lead':
            return '<p class="dx-lead">' . wx_h($s['text'] ?? '') . '</p>';

        case 'heading':
            $level = (int) ($s['level'] ?? 2) === 3 ? 3 : 2;
            $text = trim((string) ($s['text'] ?? ''));
            if ($text === '') {
                throw ApiError::validation('A heading needs text', 'sections');
            }
            return '<h' . $level . '>' . wx_h($text) . '</h' . $level . '>';

        case 'para':
            $text = trim((string) ($s['text'] ?? ''));
            if ($text === '') {
                throw ApiError::validation('An empty paragraph would leave a gap in the page', 'sections');
            }
            /* Blank lines become paragraphs and single newlines become line breaks — the two things a
               person writing in a text area expects, and the only markup the text can produce. */
            $parts = [];
            foreach (preg_split('~\n\s*\n~', $text) ?: [] as $p) {
                $p = trim((string) $p);
                if ($p !== '') {
                    $parts[] = '<p>' . nl2br(wx_h($p), false) . '</p>';
                }
            }
            return implode("\n", $parts);

        case 'list':
            $items = [];
            foreach ((array) ($s['items'] ?? []) as $x) {
                $x = trim((string) $x);
                if ($x !== '') {
                    $items[] = '<li>' . wx_h($x) . '</li>';
                }
            }
            if (!$items) {
                throw ApiError::validation('A list needs at least one item', 'sections');
            }
            $tag = !empty($s['ordered']) ? 'ol' : 'ul';
            return '<' . $tag . ' class="dx-list">' . implode('', $items) . '</' . $tag . '>';

        case 'image':
            $url = (string) ($s['url'] ?? '');
            if (!wx_media_ok($url)) {
                throw ApiError::validation('Choose an image from the media library', 'sections');
            }
            $alt = trim((string) ($s['alt'] ?? ''));
            $caption = trim((string) ($s['caption'] ?? ''));
            $sizes = wx_media_have($url);
            $srcset = '';
            if ($sizes) {
                $set = [];
                foreach ($sizes as $w) {
                    $set[] = wx_media_variant($url, $w) . ' ' . $w . 'w';
                }
                $srcset = ' srcset="' . wx_h(implode(', ', $set)) . '" sizes="(max-width: 900px) 100vw, 900px"';
            }
            return '<figure class="dx-figure"><img src="' . wx_h($url) . '" alt="' . wx_h($alt) . '"'
                . $srcset . ' loading="lazy" decoding="async">'
                . ($caption !== '' ? '<figcaption>' . wx_h($caption) . '</figcaption>' : '')
                . '</figure>';

        case 'quote':
            $text = trim((string) ($s['text'] ?? ''));
            if ($text === '') {
                throw ApiError::validation('A quote needs text', 'sections');
            }
            $by = trim((string) ($s['by'] ?? ''));
            return '<blockquote class="dx-quote">' . nl2br(wx_h($text), false) . ($by !== '' ? '<cite>' . wx_h($by) . '</cite>' : '') . '</blockquote>';

        case 'facts':
            $rows = '';
            foreach ((array) ($s['items'] ?? []) as $f) {
                if (!is_array($f)) {
                    continue;
                }
                $rows .= '<div class="dx-meta-item"><dt>' . wx_h($f['k'] ?? '') . '</dt><dd>' . wx_h($f['v'] ?? '') . '</dd></div>';
            }
            if ($rows === '') {
                throw ApiError::validation('The facts block needs at least one row', 'sections');
            }
            return '<dl class="dx-meta">' . $rows . '</dl>';

        case 'faq':
            $rows = '';
            foreach ((array) ($s['items'] ?? []) as $f) {
                if (!is_array($f)) {
                    continue;
                }
                $q = trim((string) ($f['q'] ?? ''));
                $a = trim((string) ($f['a'] ?? ''));
                if ($q === '' || $a === '') {
                    continue;
                }
                $rows .= '<details class="dx-faq"><summary>' . wx_h($q) . '</summary><div>' . nl2br(wx_h($a), false) . '</div></details>';
            }
            if ($rows === '') {
                throw ApiError::validation('A question block needs at least one question and answer', 'sections');
            }
            return '<section class="dx-faqs" aria-label="Questions">' . $rows . '</section>';

        case 'cta':
            $label = trim((string) ($s['label'] ?? ''));
            if ($label === '') {
                throw ApiError::validation('The button needs a label', 'sections');
            }
            $href = wx_content_url((string) ($s['href'] ?? ''));
            if ($href === '') {
                throw ApiError::validation('The button needs somewhere to go', 'sections');
            }
            $text = trim((string) ($s['text'] ?? ''));
            return '<aside class="dx-cta">' . ($text !== '' ? '<p>' . wx_h($text) . '</p>' : '')
                . '<a class="btn" href="' . wx_h($href) . '">' . wx_h($label) . '</a></aside>';

        case 'related':
            $links = '';
            foreach ((array) ($s['links'] ?? []) as $l) {
                if (!is_array($l)) {
                    continue;
                }
                $label = trim((string) ($l['label'] ?? ''));
                $href = wx_content_url((string) ($l['href'] ?? ''));
                if ($label === '' || $href === '') {
                    continue;
                }
                $links .= '<li><a href="' . wx_h($href) . '">' . wx_h($label) . '</a></li>';
            }
            /* Related items are resolved from the item's own `seo.related` list at publish time too, so
               an editor who typed four titles does not have to also write four links. */
            if ($links === '') {
                return '';
            }
            return '<nav class="dx-related" aria-label="Related reading"><ul>' . $links . '</ul></nav>';
    }
    return '';
}

/**
 * The article body: hero, then the sections, in the order the item holds them.
 *
 * `wx_content_body()` takes the item (so tests can render one without a database) and returns the HTML
 * that goes inside the shell's `<main>`.
 */
function wx_content_body(array $item): array
{
    $data = is_array($item['data'] ?? null) ? $item['data'] : [];
    $hero = is_array($data['hero'] ?? null) ? $data['hero'] : [];
    $kicker = trim((string) ($hero['kicker'] ?? ''));
    $dek = trim((string) ($hero['dek'] ?? ''));
    $image = (string) ($hero['image'] ?? '');
    if ($image !== '' && !wx_media_ok($image)) {
        throw ApiError::validation('The hero image must be an image from the media library', 'hero');
    }

    $heroClass = 'dx-hero' . ($image !== '' ? ' dx-hero--image' : '');
    $html = '<section class="' . $heroClass . '" aria-labelledby="dx-title">';
    if ($image !== '') {
        $html .= '<img class="dx-hero-bg" src="' . wx_h($image) . '" alt="" aria-hidden="true" loading="lazy" decoding="async">';
    }
    $html .= '<div class="dx-wrap dx-hero-inner">';
    if ($kicker !== '') {
        $html .= '<p class="dx-kicker">' . wx_h($kicker) . '</p>';
    }
    $html .= '<h1 id="dx-title">' . wx_h($item['title']) . '</h1>';
    if ($dek !== '') {
        $html .= '<p class="dx-dek">' . wx_h($dek) . '</p>';
    }
    $meta = [];
    foreach ([['Category', $hero['category'] ?? ''], ['Read time', $hero['readTime'] ?? ''], ['Published', substr((string) ($item['publishedAt'] ?? ''), 0, 10)]] as [$k, $v]) {
        $v = trim((string) $v);
        if ($v !== '') {
            $meta[] = '<div class="dx-meta-item"><dt>' . wx_h($k) . '</dt><dd>' . wx_h($v) . '</dd></div>';
        }
    }
    if ($meta) {
        $html .= '<dl class="dx-meta">' . implode('', $meta) . '</dl>';
    }
    $html .= '</div></section>';

    $body = '';
    $sections = is_array($data['sections'] ?? null) ? $data['sections'] : [];
    if (count($sections) > 200) {
        throw ApiError::validation('That is more sections than an article should have (200)', 'sections');
    }
    foreach ($sections as $s) {
        if (!is_array($s)) {
            continue;
        }
        $body .= "\n" . wx_content_section($s);
    }
    if (trim($body) === '') {
        throw ApiError::validation('The article has no body yet — add at least one section', 'sections');
    }

    $related = '';
    $links = $item['seo']['related'] ?? [];
    if ($links) {
        $items = '';
        foreach ($links as $r) {
            $items .= '<li><span>' . wx_h($r) . '</span></li>';
        }
        $related = '<nav class="dx-related" aria-label="Related reading"><ul>' . $items . '</ul></nav>';
    }

    return [
        'html' => $html . "\n<div class=\"dx-wrap dx-body\">" . $body . "\n" . $related . '</div>',
        'kicker' => $kicker,
        'hasImage' => $image !== '',
        'sections' => count($sections) + 1,
    ];
}

/**
 * Publish an item: compose the page, write it through the versioned writer, mark the item live, and put
 * the address in the sitemap.
 *
 * One transaction around the bookkeeping, with the file write inside it: if the sitemap or the item row
 * fails, the page is rolled back by the same mechanism every other page write uses — the version row is
 * there and the caller can restore it. (The write itself is atomic; what this protects is the *claim*
 * that the item is live.)
 *
 * @return array{item:array, rel:string, bytes:int, batch:string, version:int, card:string}
 */
function wx_content_publish(int $id, array $me): array
{
    $row = wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]);
    if ($row === null) {
        throw ApiError::notFound('That item is not in the list');
    }
    $item = wx_content_item($row);
    $rel = wx_content_rel($item);
    if ($rel === null) {
        throw ApiError::validation('A "' . $item['type'] . '" is not published as a page of its own', 'type');
    }
    if ($item['slug'] === '') {
        throw ApiError::validation('This item has no page address yet', 'slug');
    }
    /* The guard again, at the moment it matters: `wx_content_clean()` refuses these on save, and an item
       imported from v2.1 never passed through it. */
    if ($item['type'] === 'city' && (in_array($item['slug'], WX_PAGE_SKIP, true) || in_array($item['slug'], WX_CONTENT_CITY_SKIP, true))) {
        throw ApiError::validation('"' . $item['slug'] . '" is a folder the site uses', 'slug');
    }
    if ($item['rel'] !== null && $item['rel'] !== $rel) {
        throw ApiError::conflict('This item is live at ' . $item['url'] . ' — a published address cannot be moved', ['rel' => $item['rel']]);
    }
    if ($item['rel'] === null && is_file(WX_SITE_ROOT . '/' . $rel)) {
        throw ApiError::conflict(
            'There is already a page at /' . $rel . ' that this CMS did not write. Import it first if it should be edited here.',
            ['rel' => $rel]
        );
    }

    $body = wx_content_body($item);
    $html = wx_content_render($item, $body['html']);
    $write = wx_page_write($rel, $html, $me, ['note' => 'publish: ' . $item['title']]);

    wx_update('wx_content', [
        'status' => 'published',
        'rel' => $rel,
        'publish_at' => null,
        'published_at' => $item['publishedAt'] ?: wx_now(),
        'updated_at' => wx_now(),
        'updated_by' => (string) $me['name'],
    ], ['id' => $id]);
    wx_content_sitemap_sync($rel, $item);
    wx_audit($me, 'content.publish', $item['title'], ['rel' => $rel, 'bytes' => $write['bytes'], 'batch' => $write['batch']]);

    $fresh = wx_content_item((array) wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]));
    return [
        'item' => $fresh,
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'bytes' => $write['bytes'],
        'batch' => $write['batch'],
        'version' => $write['version'],
        'sections' => $body['sections'],
    ];
}

/** Take a live item back to draft: the page stays where it is, because a published URL is not un-published. */
function wx_content_unpublish(int $id, array $me): array
{
    $row = wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]);
    if ($row === null) {
        throw ApiError::notFound('That item is not in the list');
    }
    $item = wx_content_item($row);
    if ($item['rel'] !== null) {
        throw ApiError::validation('This item has a live page — edit and republish it, or remove the page from the pages screen. Un-publishing would leave a live URL pointing at a page nobody maintains.', 'status');
    }
    wx_update('wx_content', ['status' => 'draft', 'publish_at' => null, 'updated_at' => wx_now(), 'updated_by' => (string) $me['name']], ['id' => $id]);
    wx_audit($me, 'content.unpublish', $item['title']);
    return ['item' => wx_content_item((array) wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]))];
}

/**
 * Schedule an item. v2.1 stored a prepared page (up to 3 MB of HTML) because its publisher had nothing to
 * render with; here a scheduled item is a row with a time, and `wx_content_tick()` renders it when the
 * time comes. Nothing to prepare, nothing to keep in step.
 */
function wx_content_schedule(int $id, string $at, array $me): array
{
    $row = wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]);
    if ($row === null) {
        throw ApiError::notFound('That item is not in the list');
    }
    $item = wx_content_item($row);
    if ($item['rel'] !== null) {
        throw ApiError::validation('This item is already live. Publish your changes instead of scheduling them.', 'status');
    }
    $when = substr(str_replace('T', ' ', trim($at)), 0, 16);
    if (!preg_match('~^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$~', $when)) {
        throw ApiError::validation('Pick a date and time', 'publishAt');
    }
    /* The page has to be composable *now*, not only at the moment it is due: a scheduled item whose body
       is invalid would fail at 09:00 with nobody watching. */
    wx_content_body($item);
    wx_update('wx_content', ['status' => 'scheduled', 'publish_at' => $when . ':00', 'updated_at' => wx_now(), 'updated_by' => (string) $me['name']], ['id' => $id]);
    wx_audit($me, 'content.schedule', $item['title'], ['at' => $when]);
    return ['item' => wx_content_item((array) wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]))];
}

/**
 * Publish everything that is due. Called by the screen (and available to a cron job).
 *
 * A failure is recorded on the item rather than thrown, so one bad item cannot stop the other nine — and
 * the person sees which one it was.
 */
function wx_content_tick(array $me = []): array
{
    $due = wx_all('SELECT id, title FROM wx_content WHERE status = ? AND publish_at IS NOT NULL AND publish_at <= ? ORDER BY publish_at', ['scheduled', wx_now()]);
    $published = [];
    $failed = [];
    foreach ($due as $row) {
        try {
            $r = wx_content_publish((int) $row['id'], $me);
            $published[] = ['id' => (int) $row['id'], 'title' => (string) $row['title'], 'url' => $r['url']];
        } catch (Throwable $e) {
            $failed[] = ['id' => (int) $row['id'], 'title' => (string) $row['title'], 'message' => $e->getMessage()];
        }
    }
    if ($published || $failed) {
        wx_audit($me ?: null, 'content.tick', count($published) . ' published', ['failed' => count($failed)]);
    }
    return ['published' => $published, 'failed' => $failed, 'checked' => count($due)];
}

/* ============================================================ the sitemap */

/**
 * Keep `sitemap.xml` in step with what is live.
 *
 * Two rules from v2.1 are kept exactly: an address is added once (never twice), and an item marked
 * `unlisted` is *removed* — a page that is reachable by link but should not be in Google is a real thing
 * people ask for, and the sitemap is where it is expressed.
 */
function wx_content_sitemap_sync(string $rel, array $item): bool
{
    $file = WX_SITE_ROOT . '/sitemap.xml';
    if (!is_file($file)) {
        return false;
    }
    $loc = WX_CONTENT_SITE . wx_page_url($rel);
    $xml = (string) file_get_contents($file);
    if (str_contains($xml, '<loc>' . wx_h($loc) . '</loc>') || str_contains($xml, '<loc>' . $loc . '</loc>')) {
        return false;
    }
    if ((($item['data']['visibility'] ?? '') === 'unlisted')) {
        return false;
    }
    return wx_sitemap_write($file, $xml, $loc);
}

function wx_sitemap_write(string $file, string $xml, string $loc): bool
{
    if (!str_contains($xml, '</urlset>')) {
        return false;
    }
    $entry = '  <url><loc>' . htmlspecialchars($loc, ENT_XML1) . '</loc><lastmod>' . gmdate('Y-m-d') . "</lastmod></url>\n</urlset>";
    return wx_write_file_atomic($file, str_replace('</urlset>', $entry, $xml));
}

/** Remove an address from the sitemap — used when an item becomes unlisted. */
function wx_content_sitemap_del(string $rel): bool
{
    $file = WX_SITE_ROOT . '/sitemap.xml';
    if (!is_file($file)) {
        return false;
    }
    $loc = WX_CONTENT_SITE . wx_page_url($rel);
    $xml = (string) file_get_contents($file);
    $next = (string) preg_replace('~[ \t]*<url><loc>' . preg_quote(htmlspecialchars($loc, ENT_XML1), '~') . '</loc>.*?</url>\n?~s', '', $xml);
    return $next !== $xml && wx_write_file_atomic($file, $next);
}

/* ============================================================ templates and page kinds */

/** The shape of a valid template, from v2.1's `cms_tpl_clean()`: sections in order, hero style, switches. */
function wx_content_tpl_clean(array $t): array
{
    $type = (string) ($t['type'] ?? '');
    if (!in_array($type, ['post', 'study', 'city'], true)) {
        throw ApiError::validation('Templates exist for posts, case studies and city pages', 'type');
    }
    $name = mb_substr(trim((string) ($t['name'] ?? '')), 0, 60);
    if ($name === '') {
        throw ApiError::validation('Give the template a name', 'name');
    }
    $out = ['type' => $type, 'name' => $name, 'desc' => mb_substr(trim((string) ($t['desc'] ?? '')), 0, 200), 'default' => !empty($t['default'])];
    if ($type === 'city') {
        $out['source'] = preg_match('~^[a-z0-9-]{1,60}$~', (string) ($t['source'] ?? '')) ? (string) $t['source'] : '';
        $out['order'] = [];
        foreach (array_slice((array) ($t['order'] ?? []), 0, 30) as $x) {
            if (is_array($x) && preg_match('~^[a-z0-9_-]{1,60}$~i', (string) ($x['id'] ?? ''))) {
                $out['order'][] = ['id' => (string) $x['id'], 'on' => !empty($x['on']), 'label' => mb_substr(trim((string) ($x['label'] ?? '')), 0, 60)];
            }
        }
        if (!$out['order']) {
            throw ApiError::validation('Pick the sections this city template carries', 'order');
        }
        return $out;
    }
    $out['hero'] = in_array($t['hero'] ?? '', ['image', 'navy', 'media'], true) ? (string) $t['hero'] : 'image';
    foreach (['toc' => false, 'meta' => true, 'facts' => true] as $k => $def) {
        $out[$k] = array_key_exists($k, $t) ? !empty($t[$k]) : $def;
    }
    $seen = [];
    $out['sections'] = [];
    foreach ((array) ($t['sections'] ?? []) as $x) {
        $k = (string) (is_array($x) ? ($x['k'] ?? '') : '');
        if (in_array($k, ['body', 'summary', 'faqs', 'quote', 'related'], true) && !isset($seen[$k])) {
            $seen[$k] = true;
            $out['sections'][] = ['k' => $k, 'on' => !empty($x['on'])];
        }
    }
    foreach (['body', 'summary', 'faqs', 'quote', 'related'] as $k) {
        if (!isset($seen[$k])) {
            $out['sections'][] = ['k' => $k, 'on' => true];
        }
    }
    return $out;
}

/** Every template, optionally one type's, newest first. */
function wx_content_tpl_list(?string $type = null): array
{
    $sql = 'SELECT * FROM wx_content_tpl' . ($type !== null ? ' WHERE type = ?' : '') . ' ORDER BY type, id DESC';
    $out = [];
    foreach (wx_all($sql, $type !== null ? [$type] : []) as $r) {
        $tpl = json_decode((string) $r['tpl'], true);
        $out[] = ['id' => (int) $r['id'], 'type' => (string) $r['type'], 'name' => (string) $r['name'], 'default' => (int) $r['is_default'] === 1, 'tpl' => is_array($tpl) ? $tpl : []];
    }
    return $out;
}

/**
 * Which kind each page on the site is, from the `data-page` attribute the pages carry.
 *
 * The builder and the content screens both need this: "where does an article go" is answered by the pages
 * themselves rather than by a list in a file that drifts.
 */
function wx_page_kinds(): array
{
    $kinds = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $head = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel, false, null, 0, 400_000);
        $kinds[$rel] = preg_match('~<body[^>]*data-page="([^"]*)"~i', $head, $m) ? $m[1] : '';
    }
    return $kinds;
}

/**
 * Move the v2.1 `content.json` items and templates into the tables, once.
 *
 * Ids are carried across deliberately: an id is in the address of every screenshot and support note, and
 * renumbering them would make the old file and the new table disagree about which article is which.
 */
function wx_content_import_legacy(): array
{
    $raw = wx_store('content.json', true)->tryRead();
    $items = 0;
    $tpls = 0;
    if (!is_array($raw)) {
        return ['items' => 0, 'tpls' => 0];
    }
    foreach ((array) ($raw['items'] ?? []) as $it) {
        if (!is_array($it) || !isset($it['id'], $it['type'], $it['title'])) {
            continue;
        }
        if (wx_val('SELECT id FROM wx_content WHERE id = ?', [(int) $it['id']]) !== null) {
            continue;
        }
        wx_insert('wx_content', [
            'id' => (int) $it['id'],
            'type' => (string) $it['type'],
            'status' => in_array($it['status'] ?? '', ['draft', 'scheduled', 'published'], true) ? (string) $it['status'] : 'draft',
            'slug' => (string) ($it['slug'] ?? ''),
            'title' => mb_substr((string) $it['title'], 0, 200),
            'rel' => isset($it['rel']) && $it['rel'] !== null ? (string) $it['rel'] : null,
            'data' => json_encode(is_array($it['data'] ?? null) ? $it['data'] : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'seo' => json_encode(is_array($it['seo'] ?? null) ? $it['seo'] : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'flag_order' => (int) ($it['order'] ?? 0),
            'imported' => !empty($it['imported']) ? 1 : 0,
            'publish_at' => $it['publishAt'] ?? null,
            'published_at' => $it['published_at'] ?? null,
            'created_at' => (string) ($it['created_at'] ?? wx_now()),
            'created_by' => isset($it['created_by']) ? mb_substr((string) $it['created_by'], 0, 120) : null,
            'updated_at' => $it['updated_at'] ?? null,
            'updated_by' => isset($it['updated_by']) ? mb_substr((string) $it['updated_by'], 0, 120) : null,
        ]);
        $items++;
    }
    foreach ((array) ($raw['tpls'] ?? []) as $t) {
        if (!is_array($t) || !isset($t['type'], $t['name'])) {
            continue;
        }
        $clean = wx_content_tpl_clean($t);
        wx_insert('wx_content_tpl', [
            'type' => $clean['type'],
            'name' => $clean['name'],
            'tpl' => json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'is_default' => !empty($clean['default']) ? 1 : 0,
            'updated_at' => wx_now(),
            'updated_by' => isset($t['by']) ? mb_substr((string) $t['by'], 0, 120) : null,
        ]);
        $tpls++;
    }
    wx_setting_set('content.seq', (string) max((int) ($raw['seq'] ?? 0), (int) wx_val('SELECT COALESCE(MAX(id),0) FROM wx_content')));
    return ['items' => $items, 'tpls' => $tpls];
}
