<?php
/**
 * api/v2/routes/pages.php — the pages themselves, and their history.
 *
 * This is the smallest thing that makes the Phase 3 gate possible: *an editor publishes an article,
 * changes the header across 150 pages, and rolls the change back from page history.* The header/footer
 * editor, the section library and the article builder all sit on top of these six routes, and none of
 * them is allowed to write a page any other way.
 *
 * The routes have no entry in the v2.1 alias table, because v2.1 had no pages API — it wrote HTML from
 * whichever screen needed to and kept a copy. `action` is null for that reason and the permission check
 * is by role, which is the honest description of what is new here.
 */

declare(strict_types=1);

const WX_PAGES_EDIT = ['owner', 'admin', 'editor'];

/** GET /pages — the site's content pages, with the history counts and anything stale on disk. */
function wx_route_pages_list(array $ctx): array
{
    wx_require_user(null, WX_PAGES_EDIT);
    $r = wx_page_list(!empty($ctx['query']['reindex']));
    $folders = [];
    foreach ($r['pages'] as $p) {
        $f = $p['folder'];
        $folders[$f === '' ? '(root)' : $f] = ($folders[$f === '' ? '(root)' : $f] ?? 0) + 1;
    }
    ksort($folders);
    return ['data' => [
        'pages' => $r['pages'],
        'missing' => $r['missing'],
        'folders' => $folders,
        'count' => count($r['pages']),
        'stale' => count(array_filter($r['pages'], static fn($p) => $p['stale'])),
        /* Which pages are not simply published, so a list can say so without a request per row. v2.1's
           cities screen had a Status column for the same reason: a draft nobody notices is a page nobody
           publishes, and a hidden page nobody notices is one nobody misses until a client asks. */
        'state' => wx_page_state_map(),
    ]];
}

/** GET /pages/history — every change, newest first; `?batch=` narrows it to one change. */
function wx_route_pages_changes(array $ctx): array
{
    wx_require_user(null, WX_PAGES_EDIT);
    $batch = trim((string) ($ctx['query']['batch'] ?? ''));
    if ($batch !== '') {
        $rows = [];
        foreach (wx_all('SELECT id, rel, bytes, note, batch, created_at, created_by_name FROM wx_page_versions WHERE batch = ? ORDER BY rel', [$batch]) as $r) {
            $rows[] = ['id' => (int) $r['id'], 'rel' => (string) $r['rel'], 'bytes' => (int) $r['bytes'], 'note' => (string) ($r['note'] ?? ''), 'at' => (string) $r['created_at'], 'by' => (string) ($r['created_by_name'] ?? '')];
        }
        if (!$rows) {
            throw ApiError::notFound('That change is not in the history');
        }
        return ['data' => ['batch' => $batch, 'files' => $rows, 'count' => count($rows)]];
    }
    /* Grouped by default: a change that rewrote 148 pages is one entry, because that is what the person
       did. `?flat=1` returns the rows, one per file, for anyone who wants the detail. */
    if (!empty($ctx['query']['flat'])) {
        return ['data' => ['changes' => wx_page_changes((int) ($ctx['query']['limit'] ?? 100)), 'grouped' => false]];
    }
    return ['data' => ['changes' => wx_page_changes_grouped((int) ($ctx['query']['limit'] ?? 40)), 'grouped' => true]];
}

/** GET /pages/{rel} — one page's HTML, or one version of it (`?version=`). */
function wx_route_pages_get(array $ctx): array
{
    wx_require_user(null, WX_PAGES_EDIT);
    $rel = (string) ($ctx['params']['rel'] ?? $ctx['query']['rel'] ?? '');
    $version = isset($ctx['query']['version']) ? (int) $ctx['query']['version'] : null;
    $page = wx_page_get($rel, $version);
    $data = [
        'rel' => $page['rel'],
        'html' => $page['html'],
        'bytes' => strlen((string) $page['html']),
        'version' => $page['version'],
        'versions' => $version === null ? wx_page_history($page['rel'], 20) : [],
        'fresh' => $version === null ? (bool) ($page['sha'] ?? '') : false,
    ];
    if ($version === null) {
        $row = wx_one('SELECT * FROM wx_pages WHERE rel = ?', [$page['rel']]);
        $data['index'] = $row === null ? null : [
            'title' => (string) ($row['title'] ?? ''),
            'bytes' => (int) $row['bytes'],
            'updatedAt' => $row['updated_at'],
            'updatedBy' => $row['updated_by_name'],
        ];
        $data['mtime'] = is_file(WX_SITE_ROOT . '/' . $page['rel']) ? gmdate('Y-m-d H:i:s', (int) filemtime(WX_SITE_ROOT . '/' . $page['rel'])) : null;
        /* Whether the page is public, whether search engines are told to skip it, and whether the sitemap
           lists it: three facts that live outside the HTML, so the screen reads them rather than guessing
           from the text it is editing. */
        $data['state'] = wx_page_state($page['rel']);
    }
    return ['data' => $data];
}

/**
 * POST /pages — write one page.
 *
 * The body carries the whole page; the API does not trust it as a fragment. A page that arrives without
 * `<!doctype html>` is a page somebody is about to publish broken, so it is refused before the file is
 * touched. This is the "publish an article" path.
 */
/* The action is v2.1's builder `save`, and the source is `builder`: that is the pair the policy is keyed
   on, and it is what makes a Manager's page edit wait for the Master exactly as it did in the builder. */
function wx_route_pages_write(array $ctx): array
{
    return wx_appr_route('save', $ctx, 'pages', 'wx_route_pages_write_do', static fn() => wx_route_pages_write_do($ctx), 'builder');
}

function wx_route_pages_write_do(array $ctx): array
{
    $u = wx_require_user(null, WX_PAGES_EDIT);
    $rel = (string) ($ctx['params']['rel'] ?? $ctx['body']['rel'] ?? '');
    $html = (string) ($ctx['body']['html'] ?? '');
    if ($html === '') {
        throw ApiError::validation('The page is empty', 'html');
    }
    if (!preg_match('~^\s*(<!doctype html|<html)~i', $html)) {
        throw ApiError::validation('A page must be a complete HTML document (from <!doctype html>)', 'html');
    }
    return wx_guard('page.write', static function () use ($rel, $html, $u, $ctx) {
        /* The four rules from v2.1's builder live in one place (`lib/pageedit.php`) rather than in this
           handler: the complete-document check, the size check, the editor-marker check and the script
           rule. The script rule asks for the *role* of the person saving, because only the owner may add
           code to a page — see the note in that file. */
        $opt = [
            'mtime' => isset($ctx['body']['mtime']) ? (int) $ctx['body']['mtime'] : null,
            'force' => !empty($ctx['body']['force']),
            'note' => (string) ($ctx['body']['note'] ?? 'edit'),
        ];
        $r = wx_page_save_html($rel, $html, $u, (string) $u['role'], $opt);
        return ['data' => $r];
    });
}

/** POST /pages/new — a page that does not exist yet, at an address nobody has taken. */
function wx_route_pages_new(array $ctx): array
{
    return wx_appr_route('page_new', $ctx, 'pages', 'wx_route_pages_new_do', static fn() => wx_route_pages_new_do($ctx), 'builder');
}

function wx_route_pages_new_do(array $ctx): array
{
    $u = wx_require_user(null, WX_PAGES_EDIT);
    $html = (string) ($ctx['body']['html'] ?? '');
    if ($html === '') {
        throw ApiError::validation('A new page needs its HTML — start from a copy of a page that already looks right', 'html');
    }
    return wx_guard('page.new', static function () use ($ctx, $html, $u) {
        return ['data' => wx_page_new(
            (string) ($ctx['body']['folder'] ?? ''),
            (string) ($ctx['body']['slug'] ?? ''),
            $html,
            $u,
            (string) $u['role'],
            ['note' => 'new page: ' . trim((string) ($ctx['body']['folder'] ?? '') . '/' . (string) ($ctx['body']['slug'] ?? ''), '/')]
        )];
    });
}

/**
 * POST /pages/{rel}/publish — published, hidden or a draft, and the two things that follow from it.
 *
 * The action is v2.1's own `page_meta_save`, and the source is `admin`: that is the pair this screen's
 * approval behaviour was keyed on, so a Manager publishing a page waits for the Master exactly as they did
 * in v2.1. Who may call it at all is v2.1's rule too — the people who edit pages, since this is editing a
 * page's head and its place in the sitemap.
 */
function wx_route_pages_publish(array $ctx): array
{
    return wx_appr_route('page_meta_save', $ctx, 'pages', 'wx_route_pages_publish_do', static fn() => wx_route_pages_publish_do($ctx));
}

function wx_route_pages_publish_do(array $ctx): array
{
    $u = wx_require_user(null, WX_PAGES_EDIT);
    $rel = (string) ($ctx['params']['rel'] ?? $ctx['body']['path'] ?? $ctx['body']['rel'] ?? '');
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    return wx_guard('page.meta', static fn() => ['data' => wx_page_publish(
        $rel,
        (string) ($body['status'] ?? 'published'),
        $body,
        $u
    )]);
}

/** POST /pages/{rel}/restore — put one version back (the restore is itself a version). */
function wx_route_pages_restore(array $ctx): array
{
    return wx_appr_route('restore', $ctx, 'pages', 'wx_route_pages_restore_do', static fn() => wx_route_pages_restore_do($ctx), 'builder');
}

function wx_route_pages_restore_do(array $ctx): array
{
    $u = wx_require_user(null, WX_PAGES_EDIT);
    /* v2.1's caller names a copy rather than a version: `{path, file}` from the page it was reading. That
       call keeps working, and the copy comes back through the same writer the editor uses — so putting a
       pre-cut-over page back is itself a versioned change with an author and an undo, not a file swap. */
    $file = (string) ($ctx['body']['file'] ?? '');
    if ($file !== '') {
        $rel = (string) ($ctx['params']['rel'] ?? $ctx['body']['path'] ?? $ctx['body']['rel'] ?? '');
        if ($rel === '') {
            throw ApiError::validation('Say which page the saved copy belongs to', 'path');
        }
        return wx_guard('page.restore', static function () use ($rel, $file, $u) {
            $html = wx_page_backup_read($rel, $file);
            $r = wx_page_save_html(wx_page_rel($rel), $html, $u, (string) $u['role'], ['note' => 'restored the copy saved ' . $file, 'force' => false]);
            return ['data' => $r + ['from' => 'backup:' . $file]];
        });
    }
    $id = (int) ($ctx['body']['version'] ?? $ctx['params']['version'] ?? 0);
    return wx_guard('page.restore', static fn() => ['data' => wx_page_restore($id, $u)]);
}

/**
 * GET /pages/backups — what this page has been, from both stores.
 *
 * Asked by v2.1's page screens as `backups {path}`. It answers with the copies v2.1 kept *and* the versions
 * this API has written since, each labelled, because "put back the previous version" is a question about
 * the page rather than about the store somebody happened to look in.
 */
function wx_route_pages_backups(array $ctx): array
{
    wx_require_user(null, WX_PAGES_EDIT);
    $rel = wx_page_rel((string) ($ctx['params']['rel'] ?? $ctx['query']['rel'] ?? $ctx['body']['path'] ?? ''));
    return ['data' => [
        'rel' => $rel,
        'backups' => wx_page_backup_files($rel),
        'versions' => wx_page_history($rel, 20),
        'note' => '`backups` are the copies v2.1 saved before each change (readable and restorable by file '
            . 'name); `versions` are what this API has written since, with the author, the note and the batch.',
    ]];
}

/**
 * POST /pages/rollback — undo a whole change.
 *
 * This is the header-across-150-pages undo. `batch` is what the write returned, so the person undoes
 * *that change* and not "the last five minutes", which may contain a colleague's work.
 */
/**
 * The one gate in the API that is deliberately a pass-through, and it says so in the policy: a rollback
 * restores a version that was itself written under this policy, so it is an undo rather than a change
 * (`WX_APPR_NEVER`). Asking the Master first would leave a mistake live while somebody reads a queue.
 */
function wx_route_pages_rollback(array $ctx): array
{
    return wx_appr_route('page_rollback', $ctx, 'pages', 'wx_route_pages_rollback_do', static fn() => wx_route_pages_rollback_do($ctx));
}

function wx_route_pages_rollback_do(array $ctx): array
{
    $u = wx_require_user(null, WX_PAGES_EDIT);
    $batch = (string) ($ctx['body']['batch'] ?? '');
    return wx_guard('page.rollback', static fn() => ['data' => wx_page_rollback_batch($batch, $u)]);
}

/**
 * GET /pages/search — which pages contain a string.
 *
 * The two things this is for: finding what a change would touch *before* making it ("which pages show the
 * phone number in the header"), and answering "where does this image appear" for the media library. It
 * returns the count and the first twenty, because the screen shows a number and a preview, not 150 rows.
 */
function wx_route_pages_search(array $ctx): array
{
    wx_require_user(null, WX_PAGES_EDIT);
    $needle = trim((string) ($ctx['query']['q'] ?? ''));
    if (mb_strlen($needle) < 3) {
        throw ApiError::validation('Search for at least three characters', 'q');
    }
    $hits = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        $n = substr_count($html, $needle);
        if ($n > 0) {
            $hits[] = ['rel' => $rel, 'hits' => $n, 'title' => wx_page_title_of($html)];
        }
    }
    usort($hits, static fn($a, $b) => $b['hits'] <=> $a['hits']);
    return ['data' => [
        'q' => $needle,
        'count' => count($hits),
        'total' => array_sum(array_column($hits, 'hits')),
        'pages' => array_slice($hits, 0, 20),
    ]];
}

/**
 * POST /pages/fetch — read another site's page so sections can be picked out of it (v2.1's `fetch_page`).
 *
 * This is the one route in the API that deliberately returns somebody else's HTML to the browser. It is
 * returned as *data for the section picker*, never written to a page: nothing here composes, and the page
 * editor still has to pass the script rule when the picked sections are saved.
 */
function wx_route_pages_fetch(array $ctx): array
{
    return wx_appr_route('fetch_page', $ctx, 'pages', 'wx_route_pages_fetch_do', static fn() => wx_route_pages_fetch_do($ctx));
}

function wx_route_pages_fetch_do(array $ctx): array
{
    $u = wx_require_user('fetch_page', WX_PAGES_EDIT);
    $r = wx_fetch_page((string) ($ctx['body']['url'] ?? ''));
    wx_audit($u, 'page.fetch', mb_substr($r['url'], 0, 300), ['bytes' => strlen($r['body']), 'hops' => $r['hops']]);
    return ['data' => [
        'html' => $r['body'],
        'url' => $r['url'],
        'bytes' => strlen($r['body']),
        'reachedIn' => $r['hops'],
    ]];
}
