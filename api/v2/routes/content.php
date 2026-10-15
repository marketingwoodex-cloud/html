<?php
/**
 * api/v2/routes/content.php — the content list, the editor, and the publish button.
 *
 * The route names are the resource, not the v2.1 action: `/content`, `/content/{id}/publish`. Each route
 * carries the v2.1 action name it replaces, so the permission matrix and the approval policy stay the
 * ones the business already agreed to — `cms_save` for an edit, `cms_published` for putting an article
 * live, `cms_delete` for removing a draft.
 *
 * The list is where the table earns its place: `?filter=draft|scheduled|due|live` and `?type=post` are
 * answered by the database. In v2.1 the same screen loaded every item and filtered in the browser, which
 * is why nobody could find a post by an author or see what was due.
 */

declare(strict_types=1);

const WX_CONTENT_EDIT = ['owner', 'admin', 'editor'];
const WX_CONTENT_KEEP = ['owner', 'admin'];

/** GET /content — the items, the counts the screen leads with, and what is due. */
function wx_route_content_list(array $ctx): array
{
    wx_require_user('cms_list', WX_CONTENT_EDIT);
    $import = null;
    if (!empty($ctx['query']['import'])) {
        $import = wx_content_import_legacy();
    }
    $r = wx_content_list([
        'type' => (string) ($ctx['query']['type'] ?? ''),
        'filter' => (string) ($ctx['query']['filter'] ?? ''),
        'q' => trim((string) ($ctx['query']['q'] ?? '')),
        'limit' => (int) ($ctx['query']['limit'] ?? 200),
    ]);
    return ['data' => $r + [
        'import' => $import,
        'types' => WX_CONTENT_TYPES,
        'sections' => WX_CONTENT_SECTIONS,
        'shells' => [
            'post' => wx_content_shell_rel('post'),
            'study' => wx_content_shell_rel('study'),
            'city' => wx_content_shell_rel('city', (string) wx_setting('content.shell.city', '')),
            'hint' => 'An article is published into a copy of this page\'s furniture — read at publish time, so it always has the current header.',
            'cityHint' => 'A city page is the same furniture with this city\'s words, and it publishes to /<address>/ — root level, where v2.1 put them and where the addresses are indexed.',
        ],
    ]];
}

/** GET /content/{id} — one item, as the editor loads it. */
function wx_route_content_get(array $ctx): array
{
    wx_require_user('cms_get', WX_CONTENT_EDIT);
    $row = wx_one('SELECT * FROM wx_content WHERE id = ?', [(int) ($ctx['params']['id'] ?? 0)]);
    if ($row === null) {
        throw ApiError::notFound('That item is not in the list');
    }
    $item = wx_content_item($row);
    /* A live item can be previewed as it *would* look: composing the page is a pure function of the item
       and the shell, so the editor can see the change before publishing it. */
    $preview = null;
    if (!empty($ctx['query']['preview']) && wx_content_rel($item) !== null) {
        $item['publishedAt'] = $item['publishedAt'] ?: wx_now();
        $preview = wx_content_body($item)['html'];
    }
    return ['data' => ['item' => $item, 'preview' => $preview, 'tpls' => wx_content_tpl_list($item['type'])]];
}

/** POST /content — create or update. Never publishes; publishing is its own decision and its own route. */
function wx_route_content_save(array $ctx): array
{
    return wx_appr_route('cms_save', $ctx, 'content', 'wx_route_content_save_do', static fn() => wx_route_content_save_do($ctx));
}

function wx_route_content_save_do(array $ctx): array
{
    $u = wx_require_user('cms_save', WX_CONTENT_EDIT);
    $id = (int) ($ctx['body']['id'] ?? 0);
    $existing = $id > 0 ? wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]) : null;
    if ($id > 0 && $existing === null) {
        throw ApiError::notFound('That item is not in the list');
    }
    $clean = wx_content_clean($ctx['body'], $existing);
    return wx_guard('content.save', static fn() => ['data' => ['item' => wx_content_save($clean, $existing, $u)]]);
}

/**
 * POST /content/{id}/publish — compose the page, write it through the versioned writer, go live.
 *
 * This is the Phase 3 gate's first sentence, and the response carries the batch id that undoes it.
 */
function wx_route_content_publish(array $ctx): array
{
    return wx_appr_route('cms_published', $ctx, 'content', 'wx_route_content_publish_do', static fn() => wx_route_content_publish_do($ctx));
}

function wx_route_content_publish_do(array $ctx): array
{
    $u = wx_require_user('cms_published', WX_CONTENT_EDIT);
    $id = (int) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? 0);
    return wx_guard('content.publish', static fn() => ['data' => wx_content_publish($id, $u)]);
}

/** POST /content/{id}/schedule and /content/{id}/unpublish — the other two states an item has. */
/* v2.1 had no `cms_schedule` action: scheduling an item was `cms_save` with a `publishAt` and a prepared
   page in the body. The approval action stays `cms_save` for that reason — the policy that decides
   whether a change needs the Master to approve it is keyed on actions the business already agreed to. */
function wx_route_content_schedule(array $ctx): array
{
    return wx_appr_route('cms_save', $ctx, 'content', 'wx_route_content_schedule_do', static fn() => wx_route_content_schedule_do($ctx));
}

function wx_route_content_schedule_do(array $ctx): array
{
    $u = wx_require_user('cms_save', WX_CONTENT_EDIT);
    $id = (int) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? 0);
    return wx_guard('content.schedule', static fn() => ['data' => wx_content_schedule($id, (string) ($ctx['body']['publishAt'] ?? ''), $u)]);
}

/**
 * POST /content/tick — publish whatever is due.
 *
 * Public in the sense that it takes no arguments and does one thing, but it is *not* session-less: it
 * writes pages, so it asks for the editor role. A cron job that cannot sign in calls it through the CLI
 * (`WX_CLI`), where there is no session to have.
 */
function wx_route_content_tick(array $ctx): array
{
    /* Approval action `cms_published`: a tick publishes, and that is the action that puts an article on
       the site. There is no `cms_tick` in v2.1 — the tick was a function every admin request called. */
    return wx_appr_route('cms_published', $ctx, 'content', 'wx_route_content_tick_do', static fn() => wx_route_content_tick_do($ctx));
}

function wx_route_content_tick_do(array $ctx): array
{
    $u = wx_require_user('cms_published', WX_CONTENT_EDIT);
    return wx_guard('content.tick', static fn() => ['data' => wx_content_tick($u)]);
}

/** POST /content/{id}/status — draft, for items that are not pages of their own. */
function wx_route_content_status(array $ctx): array
{
    return wx_appr_route('cms_status', $ctx, 'content', 'wx_route_content_status_do', static fn() => wx_route_content_status_do($ctx));
}

function wx_route_content_status_do(array $ctx): array
{
    $u = wx_require_user('cms_status', WX_CONTENT_EDIT);
    $id = (int) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? 0);
    if (($ctx['body']['status'] ?? '') === 'draft') {
        return wx_guard('content.unpublish', static fn() => ['data' => wx_content_unpublish($id, $u)]);
    }
    return wx_guard('content.publish', static fn() => ['data' => wx_content_publish($id, $u)]);
}

/** POST /content/reorder — the order testimonials and FAQs appear in on the pages that carry them. */
function wx_route_content_reorder(array $ctx): array
{
    return wx_appr_route('cms_reorder', $ctx, 'content', 'wx_route_content_reorder_do', static fn() => wx_route_content_reorder_do($ctx));
}

function wx_route_content_reorder_do(array $ctx): array
{
    $u = wx_require_user('cms_reorder', WX_CONTENT_EDIT);
    $ids = array_map('intval', is_array($ctx['body']['ids'] ?? null) ? $ctx['body']['ids'] : []);
    return wx_guard('content.reorder', static function () use ($ids, $u) {
        foreach (array_values($ids) as $i => $id) {
            wx_update('wx_content', ['flag_order' => $i + 1], ['id' => (int) $id]);
        }
        wx_audit($u, 'content.reorder', count($ids) . ' item(s)');
        return ['data' => wx_content_list([])];
    });
}

/** DELETE /content/{id} — a draft. A live page is not deleted here; the pages screen owns that. */
function wx_route_content_delete(array $ctx): array
{
    return wx_appr_route('cms_delete', $ctx, 'content', 'wx_route_content_delete_do', static fn() => wx_route_content_delete_do($ctx));
}

function wx_route_content_delete_do(array $ctx): array
{
    $u = wx_require_user('cms_delete', WX_CONTENT_KEEP);
    $id = (int) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? 0);
    return wx_guard('content.delete', static function () use ($id, $u) {
        $row = wx_one('SELECT * FROM wx_content WHERE id = ?', [$id]);
        if ($row === null) {
            throw ApiError::notFound('That item is not in the list');
        }
        if ($row['rel'] !== null) {
            throw ApiError::validation('This item has a live page at ' . wx_page_url((string) $row['rel']) . '. Pages are removed from the pages screen, where the history of the file is kept.', 'id');
        }
        wx_q('DELETE FROM wx_content WHERE id = ?', [$id]);
        wx_audit($u, 'content.delete', (string) $row['title'], ['type' => (string) $row['type']]);
        return ['data' => wx_content_list([])];
    });
}

/* ------------------------------------------------------------------ templates */

/** GET /content/templates — the shapes an article can be built in. */
function wx_route_content_tpl_list(array $ctx): array
{
    wx_require_user('cms_tpl_list', WX_CONTENT_EDIT);
    $type = (string) ($ctx['query']['type'] ?? '');
    return ['data' => ['tpls' => wx_content_tpl_list($type !== '' ? $type : null)]];
}

/** POST /content/templates — save one (and clear the previous default of the same type). */
function wx_route_content_tpl_save(array $ctx): array
{
    return wx_appr_route('cms_tpl_save', $ctx, 'content', 'wx_route_content_tpl_save_do', static fn() => wx_route_content_tpl_save_do($ctx));
}

function wx_route_content_tpl_save_do(array $ctx): array
{
    $u = wx_require_user('cms_tpl_save', WX_CONTENT_EDIT);
    $tpl = is_array($ctx['body']['tpl'] ?? null) ? $ctx['body']['tpl'] : [];
    $clean = wx_content_tpl_clean($tpl);
    return wx_guard('content.tpl_save', static function () use ($clean, $u, $tpl) {
        $id = (int) ($tpl['id'] ?? 0);
        $existing = $id > 0 ? wx_one('SELECT * FROM wx_content_tpl WHERE id = ?', [$id]) : null;
        $row = [
            'type' => $clean['type'],
            'name' => $clean['name'],
            'tpl' => json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'is_default' => !empty($clean['default']) ? 1 : 0,
            'updated_at' => wx_now(),
            'updated_by' => (string) $u['name'],
        ];
        if ($existing === null) {
            if ((int) wx_val('SELECT COUNT(*) FROM wx_content_tpl') >= 60) {
                throw ApiError::validation('There are 60 templates already — delete one first');
            }
            $id = wx_insert('wx_content_tpl', $row);
        } else {
            wx_update('wx_content_tpl', $row, ['id' => $id]);
        }
        if (!empty($clean['default'])) {
            wx_q('UPDATE wx_content_tpl SET is_default = 0 WHERE type = ? AND id <> ?', [$clean['type'], $id]);
        }
        wx_audit($u, 'content.tpl_save', $clean['type'] . ': ' . $clean['name'], ['id' => $id]);
        return ['data' => ['tpls' => wx_content_tpl_list()]];
    });
}

/** DELETE /content/templates/{id} — delete one, and unlink the items that used it. */
function wx_route_content_tpl_delete(array $ctx): array
{
    return wx_appr_route('cms_tpl_delete', $ctx, 'content', 'wx_route_content_tpl_delete_do', static fn() => wx_route_content_tpl_delete_do($ctx));
}

function wx_route_content_tpl_delete_do(array $ctx): array
{
    $u = wx_require_user('cms_tpl_delete', WX_CONTENT_EDIT);
    $id = (int) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? 0);
    return wx_guard('content.tpl_delete', static function () use ($id, $u) {
        $row = wx_one('SELECT * FROM wx_content_tpl WHERE id = ?', [$id]);
        if ($row === null) {
            throw ApiError::notFound('That template is not in the list');
        }
        wx_update('wx_content', ['tpl_id' => null], ['tpl_id' => $id]);
        wx_q('DELETE FROM wx_content_tpl WHERE id = ?', [$id]);
        wx_audit($u, 'content.tpl_delete', (string) $row['name'], ['id' => $id]);
        return ['data' => ['tpls' => wx_content_tpl_list()]];
    });
}

/* ------------------------------------------------------------------ the site's own pages */

/** GET /content/pages — which kind each page on the site is, from the pages themselves. */
function wx_route_content_page_kinds(array $ctx): array
{
    wx_require_user('cms_page_kinds', WX_CONTENT_EDIT);
    $kinds = wx_page_kinds();
    $byKind = [];
    foreach ($kinds as $rel => $kind) {
        $byKind[$kind === '' ? '(none)' : $kind][] = $rel;
    }
    return ['data' => [
        'kinds' => $kinds,
        'count' => count($kinds),
        'byKind' => $byKind,
        'shells' => [
            'post' => (string) wx_setting('content.shell.post', 'insights/index.html'),
            'study' => (string) wx_setting('content.shell.study', 'projects/index.html'),
        ],
    ]];
}

/** GET /content/sitemap — what is in it, so "is my article in the sitemap" has an answer. */
function wx_route_content_sitemap(array $ctx): array
{
    wx_require_user('cms_sitemap_add', WX_CONTENT_EDIT);
    $file = WX_SITE_ROOT . '/sitemap.xml';
    if (!is_file($file)) {
        return ['data' => ['exists' => false, 'urls' => [], 'count' => 0]];
    }
    $xml = (string) file_get_contents($file);
    preg_match_all('~<loc>(.*?)</loc>~s', $xml, $m);
    $urls = array_map('trim', $m[1] ?? []);
    $missing = [];
    foreach (wx_all('SELECT rel, title FROM wx_content WHERE rel IS NOT NULL AND status = ?', ['published']) as $r) {
        $loc = WX_CONTENT_SITE . wx_page_url((string) $r['rel']);
        if (!in_array($loc, $urls, true)) {
            $missing[] = ['rel' => (string) $r['rel'], 'title' => (string) $r['title'], 'loc' => $loc];
        }
    }
    return ['data' => ['exists' => true, 'urls' => $urls, 'count' => count($urls), 'missing' => $missing, 'bytes' => strlen($xml)]];
}

/** POST /content/sitemap — add one address to the sitemap by hand (a page the CMS does not own). */
function wx_route_content_sitemap_add(array $ctx): array
{
    return wx_appr_route('cms_sitemap_add', $ctx, 'content', 'wx_route_content_sitemap_add_do', static fn() => wx_route_content_sitemap_add_do($ctx));
}

function wx_route_content_sitemap_add_do(array $ctx): array
{
    $u = wx_require_user('cms_sitemap_add', WX_CONTENT_EDIT);
    $rel = (string) ($ctx['body']['rel'] ?? '');
    $rel = wx_page_rel($rel);
    if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
        throw ApiError::validation('There is no page at /' . $rel, 'rel');
    }
    return wx_guard('content.sitemap_add', static function () use ($rel, $u) {
        $file = WX_SITE_ROOT . '/sitemap.xml';
        if (!is_file($file)) {
            throw ApiError::notFound('This site has no sitemap.xml');
        }
        $added = wx_content_sitemap_sync($rel, ['data' => []]);
        wx_audit($u, 'content.sitemap_add', $rel, ['added' => $added]);
        return ['data' => ['added' => $added, 'rel' => $rel]];
    });
}
