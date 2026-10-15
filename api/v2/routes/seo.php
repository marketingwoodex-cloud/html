<?php
/**
 * api/v2/routes/seo.php — findability: the audit, the phrase per page, robots.txt and the sitemap.
 *
 * Phase 3's last screens for the site itself. v2.1's SEO manager had the right idea in three parts and got
 * the working out in the wrong place:
 *
 *   · The **audit** was a browser loop — `admin-seo38.js` fetched all 150 pages six at a time, parsed them
 *     with `DOMParser`, counted words and links, and computed a score. So "how findable is the site" was a
 *     question only a browser with all 150 pages open could answer, and the answer changed with the machine.
 *     Here it is one server-side read: `lib/seo.php`'s `wx_seo_audit()`, findings in sentences, a number
 *     derived from the findings and nothing else.
 *   · The **numbers** were stored. `seo_scores` posted a browser's arithmetic into `_private/seo.json`, which
 *     is why the file could say a page was an 82 while the page itself had no description. The store keeps
 *     v2.1's shape and v2.1's file — the focus phrase, the related phrases, the schema choice — but a score
 *     sent from a browser is not stored, and the route that used to receive them recomputes instead.
 *   · The **page's own head** — title, description, canonical, noindex — was never this screen's business:
 *     `page_meta_save` owns those, and still does (`POST /pages/{rel}/publish`). This screen reads them and
 *     says what Google will do with them.
 *
 * The three files this screen owns are the site's own: `_private/seo.json`, `robots.txt` and `sitemap.xml`.
 * Two of them are public files a mistake in is expensive, so both refusals v2.1 had are kept — a
 * `Disallow: /` needs to be asked for twice — and the sitemap rebuild is built from the pages as they *are*,
 * which is what the publishing slice made true for one page at a time.
 *
 * v2.1's action names survive on these routes (`seo_list`, `seo_page`, `seo_save`, `seo_scores`,
 * `seo_robots_save`, `seo_sitemap`, `seo_ai`) because the approval policy — a Manager's change waits for the
 * Master, `save` and `sitemap` being queued verbs and the rest not — is written in those names.
 */

declare(strict_types=1);

/** Who v2.1 let anywhere near this screen: `seo-lib.php`'s own `$ED`, kept as a list. */
const WX_SEO_ROLES = ['owner', 'admin', 'editor'];

/**
 * robots.txt is the one file here that can take the whole site out of Google — one line does it — so v2.1
 * asked for the owner or the admin, and this does too.
 */
const WX_SEO_ROBOTS_ROLES = ['owner', 'admin'];

/** GET /seo/pages — every page, audited, with what is stored for it. v2.1's `seo_list`, answering properly. */
function wx_route_seo_pages(array $ctx): array
{
    wx_require_user(null, WX_SEO_ROLES);
    return ['data' => wx_seo_site_reply()];
}

/**
 * GET /seo/audit — v2.1's `seo_scores`, which stored a browser's arithmetic. This one does the sum.
 *
 * A read, not a post: it computes and stores nothing. The old screen posted its own numbers here, so the
 * bridged action still arrives as a POST and this reads the rels out of either shape — the query for the
 * console, the body for the old caller.
 */
function wx_route_seo_audit(array $ctx): array
{
    wx_require_user('seo_scores', WX_SEO_ROLES);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $query = is_array($ctx['query'] ?? null) ? $ctx['query'] : [];
    $rels = (array) ($body['rels'] ?? []);
    if ($rels === []) {
        $rels = (array) ($body['scores'] ?? []);
    }
    if ($rels === []) {
        $rels = array_filter(explode(',', (string) ($query['rels'] ?? '')), static fn($x) => $x !== '');
    }
    return ['data' => wx_seo_scores_reply(array_values($rels))];
}

/**
 * The numbers, for the rels asked about (or for every page when none are).
 *
 * The whole site is audited either way, because half of what the audit says is about the *other* pages: a
 * title is a duplicate only beside the others, and a link is broken only against the pages that exist. So a
 * score for one page cannot be worked out from that page.
 */
function wx_seo_scores_reply(array $rels): array
{
    $want = [];
    foreach ($rels as $rel) {
        if (is_string($rel) && preg_match('~^[a-z0-9/_.-]+\.html$~i', $rel)) {
            $want[] = $rel;
        }
    }
    $audit = wx_seo_audit();
    $scores = [];
    foreach ($audit['pages'] as $r) {
        if ($want !== [] && !in_array($r['rel'], $want, true)) {
            continue;
        }
        $scores[$r['rel']] = ['score' => $r['score'], 'issues' => array_column($r['issues'], 'code')];
    }
    return [
        'scores' => $scores,
        'count' => count($scores),
        'summary' => $audit['summary'],
        'at' => $audit['checkedAt'],
        'note' => 'Computed here from the pages, on this request. v2.1 stored the numbers a browser worked out; '
            . 'this route does not — a second opinion about a page can only be out of date.',
    ];
}

/** GET /seo/pages/{rel} — one page: what it says, what is wrong with it, and what is stored for it. */
function wx_route_seo_page(array $ctx): array
{
    wx_require_user('seo_page', WX_SEO_ROLES);
    $rel = wx_page_rel((string) ($ctx['params']['rel'] ?? $ctx['query']['rel'] ?? $ctx['body']['path'] ?? ''));
    if ($rel === '' || !wx_page_exists($rel)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    return ['data' => wx_seo_page_view($rel)];
}

/**
 * POST /seo/pages/{rel} — the focus phrase, the related phrases, and the structured data.
 *
 * The action is v2.1's own `seo_save`, so a Manager's change waits for the Master here exactly as it did
 * there — `save` is a queued verb in the policy, and this is the same name the policy is keyed on.
 */
function wx_route_seo_save(array $ctx): array
{
    return wx_appr_route('seo_save', $ctx, 'seo', 'wx_route_seo_save_do', static fn() => wx_route_seo_save_do($ctx));
}

function wx_route_seo_save_do(array $ctx): array
{
    $u = wx_require_user('seo_save', WX_SEO_ROLES);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $rel = wx_page_rel((string) ($ctx['params']['rel'] ?? $body['rel'] ?? $body['path'] ?? ''));
    if ($rel === '' || !wx_page_exists($rel)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    $fields = [];
    foreach (['kw', 'related', 'schema'] as $k) {
        if (array_key_exists($k, $body)) {
            $fields[$k] = $body[$k];
        }
    }
    if ($fields === []) {
        throw ApiError::validation('Nothing to save — send a focus phrase, related phrases or a schema choice', 'kw');
    }
    return wx_guard('seo.save', static function () use ($rel, $body, $fields, $u) {
        $rec = wx_seo_put($rel, $fields);
        /* A schema choice is a change to the page, not to the store: it writes the managed JSON-LD block
           through the versioned writer, so it appears in the page's history and can be rolled back from
           there. v2.1 called `backup_page()` and wrote the file; this is the same change, versioned. */
        $schema = array_key_exists('schema', $fields) ? wx_seo_schema_apply($rel, (array) $rec['schema'], $u) : null;
        /* The CMS-sync leg, kept from v2.1 and given the lookup it was missing there: the item that owns
           this page keeps a copy of the head, and a re-publish would write that copy back over an edit made
           here. A host whose database is not there yet saves the record and says the sync did not run. */
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        $synced = null;
        try {
            $synced = wx_content_seo_sync($rel, $html, $rec, $u);
        } catch (Throwable $e) {
            $synced = false;
        }
        return ['data' => [
            'rel' => $rel,
            /* v2.1's `page` — the record it had just written — and its `schema` beside it. */
            'page' => $rec,
            'schema' => $schema,
            'view' => wx_seo_page_view($rel),
            'synced' => $synced !== null,
            'ignored' => array_values(array_intersect(['seo', 'read'], array_keys($body))),
            'note' => 'A score (or a readability number) sent from a browser is not stored — the audit computes it.',
        ]];
    });
}

/**
 * POST /seo/pages/{rel}/suggest — v2.1's `seo_ai`: ask the provider for a phrase and a title.
 *
 * v2.1 never queued this (`seo_ai` is in the policy's skip list: it is a read of somebody else's service and
 * it stores nothing), and the answers land in the form rather than in the store — the person still presses
 * save. The same provider settings as the AI screen, and the same honest failure when no key is in place.
 */
function wx_route_seo_suggest(array $ctx): array
{
    $u = wx_require_user('seo_ai', WX_SEO_ROLES);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $rel = wx_page_rel((string) ($ctx['params']['rel'] ?? $body['rel'] ?? $body['path'] ?? ''));
    if ($rel === '' || !wx_page_exists($rel)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    $ai = wx_ai_record();
    if (!wx_ai_configured($ai)) {
        throw ApiError::validation('Add a key for ' . wx_ai_provider_name((string) $ai['provider']) . ' in AI settings first', (string) $ai['provider'] . 'Key');
    }
    $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
    $t = wx_seo_text($html);
    $kw = mb_substr(trim((string) ($body['kw'] ?? '')), 0, WX_SEO_KW_MAX);
    $co = wx_company();
    /* v2.1's prompt, kept word for word: it is the studio's voice, and the numbers in it (50–60 characters,
       140–158) are the ranges the audit checks. */
    $system = 'You are an SEO expert for ' . $co['name'] . ', an interior design and build company in Lahore, '
        . 'Pakistan. Write for Google Pakistan searchers. Reply with JSON only, no markdown: '
        . '{"kw":"focus keyphrase","related":["up to 4 related keyphrases"],'
        . '"title":"SEO title 50-60 chars, keyphrase near the start, end with | ' . $co['name'] . ' if it fits",'
        . '"desc":"meta description 140-158 chars, includes the keyphrase, a benefit and a call to action"}';
    $user = ($kw !== '' ? 'Focus keyphrase (keep it): ' . $kw . "\n" : 'Choose the best focus keyphrase (what people in Pakistan would search).' . "\n")
        . 'URL: ' . wx_page_url($rel) . "\nCurrent title: " . $t['title'] . "\nH1: " . $t['h1']
        . "\nCurrent description: " . $t['desc'] . "\n\nPage text:\n" . mb_substr($t['text'], 0, 5000);
    $raw = wx_ai_call($ai, $system, $user);
    $json = json_decode((string) preg_replace('~^```(?:json)?|```$~m', '', trim($raw)), true);
    if (!is_array($json) || trim((string) ($json['title'] ?? '')) === '') {
        throw ApiError::upstream('The AI answer could not be read — try again');
    }
    $related = [];
    foreach (array_slice((array) ($json['related'] ?? []), 0, WX_SEO_RELATED_MAX) as $x) {
        if (is_scalar($x) && trim((string) $x) !== '') {
            $related[] = mb_substr(trim((string) $x), 0, WX_SEO_KW_MAX);
        }
    }
    $out = [
        'kw' => mb_substr(trim((string) ($json['kw'] ?? '')) ?: $kw, 0, WX_SEO_KW_MAX),
        'related' => $related,
        'title' => mb_substr(trim((string) $json['title']), 0, 90),
        'desc' => mb_substr(trim((string) ($json['desc'] ?? '')), 0, 200),
        'provider' => (string) $ai['provider'],
        'model' => (string) $ai[(string) $ai['provider'] . 'Model'],
        'at' => wx_now(),
    ];
    wx_audit($u, 'seo.ai', $rel, ['provider' => $out['provider'], 'kw' => $out['kw']]);
    return ['data' => $out];
}

/** GET /seo/robots — the file, what state it is in, and what the sitemap says beside it. */
function wx_route_seo_robots(array $ctx): array
{
    $u = wx_require_user('seo_list', WX_SEO_ROLES);
    return ['data' => wx_seo_robots_read() + [
        'sitemap' => wx_seo_sitemap_state(),
        /* An editor may read this — v2.1 showed them the file — and may not write it. The screen asks rather
           than finding out by being refused. */
        'mayEdit' => in_array((string) $u['role'], WX_SEO_ROBOTS_ROLES, true),
        'limits' => ['bytes' => 5000],
        'roles' => WX_SEO_ROBOTS_ROLES,
    ]];
}

/** POST /seo/robots — write it. `save` is a queued verb, so a Manager's change waits, as in v2.1. */
function wx_route_seo_robots_save(array $ctx): array
{
    return wx_appr_route('seo_robots_save', $ctx, 'seo', 'wx_route_seo_robots_save_do', static fn() => wx_route_seo_robots_save_do($ctx));
}

function wx_route_seo_robots_save_do(array $ctx): array
{
    $u = wx_require_user('seo_robots_save', WX_SEO_ROBOTS_ROLES);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    return wx_guard('seo.robots', static fn() => ['data' => wx_seo_robots_save(
        (string) ($body['text'] ?? ''),
        !empty($body['force']),
        $u
    )]);
}

/** GET /seo/sitemap — the file as it is, against the pages as they are. */
function wx_route_seo_sitemap(array $ctx): array
{
    wx_require_user('seo_sitemap', WX_SEO_ROLES);
    $state = wx_seo_sitemap_state();
    $file = wx_page_sitemap_file();
    $locs = [];
    if (is_file($file) && preg_match_all('~<loc>(.*?)</loc>~s', (string) file_get_contents($file), $m)) {
        foreach ($m[1] as $loc) {
            $locs[] = trim((string) $loc);
        }
    }
    return ['data' => $state + ['locs' => $locs, 'url' => wx_page_url('sitemap.xml')]];
}

/**
 * POST /seo/sitemap — rebuild it from the pages.
 *
 * The gate's action is v2.1's `seo_sitemap`, and it is deliberately not queued — recorded with its reason in
 * the policy beside the other decisions. A rebuild writes a file the site *derives* from the pages: it takes
 * something down that a person already took down (a draft, a hidden page, a `noindex`), which is a
 * correction rather than a change somebody has to approve.
 */
function wx_route_seo_sitemap_rebuild(array $ctx): array
{
    return wx_appr_route('seo_sitemap', $ctx, 'seo', 'wx_route_seo_sitemap_rebuild_do', static fn() => wx_route_seo_sitemap_rebuild_do($ctx));
}

function wx_route_seo_sitemap_rebuild_do(array $ctx): array
{
    $u = wx_require_user('seo_sitemap', WX_SEO_ROLES);
    return wx_guard('seo.sitemap', static fn() => ['data' => wx_seo_sitemap_rebuild($u)]);
}

/**
 * The `seo_list` payload, in v2.1's key names where v2.1 had one and the audit's own names where it did not.
 *
 * v2.1's `seo_list` sent five keys, and all five are here under their old names, because his screen reads them
 * by name: `pages` is the *store* keyed by address (`admin-seo38.js` does `seo[p.path].kw`), `robots` is the
 * text, `sitemap` a count, `scanAt` when the audit ran, `broken` how many pages link to a page that is not
 * there, `schemas` the five types and `aiReady` whether a key is in place.
 *
 * Everything the new screen needs is beside them: `audit` is the audit, one entry per page with the findings
 * spelled out, and `sitemapState`/`robotsState` are the two files. The store is what the old caller wants and
 * the audit is what a person wants to read, and they are two different things — so they are two keys rather
 * than one argument about which the file should be.
 */
function wx_seo_site_reply(): array
{
    $audit = wx_seo_audit();
    $records = wx_seo_records();
    $rows = [];
    foreach ($audit['pages'] as $p) {
        $rec = is_array($records[$p['rel']] ?? null) ? $records[$p['rel']] : null;
        $p['kw'] = (string) ($rec['kw'] ?? '');
        $p['schema'] = (array) ($rec['schema'] ?? []);
        $p['storedAt'] = $rec['t'] ?? null;
        $p['issues'] = array_values((array) $p['issues']);
        $rows[] = $p;
    }
    $robots = wx_seo_robots_read();
    $state = wx_seo_sitemap_state($audit['pages']);
    /* Whether this person may write robots.txt, so the screen asks rather than finding out by being refused.
       The route that reads the file has already required somebody to be signed in. */
    $robots['mayEdit'] = in_array((string) (wx_current_user()['role'] ?? ''), WX_SEO_ROBOTS_ROLES, true);
    return [
        'pages' => (object) $records,
        'robots' => (string) $robots['text'],
        'sitemap' => (int) $state['count'],
        'scanAt' => $audit['checkedAt'],
        'broken' => (int) ($audit['summary']['byCode']['broken_link'] ?? 0),
        'schemas' => WX_SEO_SCHEMAS,
        'aiReady' => wx_ai_state()['server']['ready'],
        'audit' => $rows,
        'count' => count($rows),
        'summary' => $audit['summary'],
        'sitemapState' => $state,
        'robotsState' => $robots,
        'checkedAt' => $audit['checkedAt'],
        'limits' => [
            'kw' => WX_SEO_KW_MAX,
            'related' => WX_SEO_RELATED_MAX,
            'title' => WX_SEO_TITLE_RANGE,
            'desc' => WX_SEO_DESC_RANGE,
            'thin' => WX_SEO_THIN_WORDS,
        ],
    ];
}
