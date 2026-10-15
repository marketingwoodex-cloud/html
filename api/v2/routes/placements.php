<?php
/**
 * api/v2/routes/placements.php — where testimonials and the team appear, and the button that puts them there.
 *
 * Four routes over v2.1's two builder-adjacent actions:
 *
 *   GET  /placements          `cms_placements`       — the pages each kind is on, and the settings
 *   GET  /placements/preview  (no action)            — the section as it would be written, or all five designs
 *   GET  /placements/plan     (no action)            — what a push would touch, page by page
 *   POST /placements          `cms_placements_save`  — save the choices (owner and admin, as v2.1 had it)
 *   POST /placements/push     `save` (builder)       — write the sections into the pages, as one change
 *
 * The preview and the push share one function in `lib/placements.php`, which is the only way the sentence
 * "this is what will change" stays true of what actually changes. The push is queued under v2.1's builder
 * `save` — the action its admin called once per page — so a Manager's push waits for the Master here
 * exactly as it did there, and then writes every page as a single batch with a single undo.
 */

declare(strict_types=1);

/** Who may move sections around the website: v2.1 asked for the owner or an admin. */
const WX_PLACE_MANAGE = ['owner', 'admin'];

/** The kinds a request names, or every kind. Shared by the preview, the plan and the push. */
function wx_route_place_kinds(array $in): array
{
    $raw = $in['kinds'] ?? $in['kind'] ?? '';
    $raw = is_array($raw) ? $raw : preg_split('~[,\s]+~', (string) $raw);
    $out = [];
    foreach ((array) $raw as $k) {
        $k = trim((string) $k);
        if ($k !== '' && wx_place_kind_ok($k) && !in_array($k, $out, true)) {
            $out[] = $k;
        }
    }
    return $out ?: array_keys(WX_PLACE_KINDS);
}

/** GET /placements — everything the screen shows: the choices, the live items, and where the markers are. */
function wx_route_place_get(array $ctx): array
{
    wx_require_user('cms_placements', WX_PLACE_MANAGE);
    $st = wx_place_state();
    $st['items'] = [];
    foreach (array_keys(WX_PLACE_KINDS) as $kind) {
        $items = wx_place_items($kind);
        $st['items'][$kind] = array_map(static fn(array $i): array => [
            'id' => $i['id'],
            'title' => $i['title'],
            'rating' => (int) ($i['data']['rating'] ?? 0),
            'order' => $i['order'],
        ], $items);
    }
    $st['import'] = !empty($ctx['query']['import']) ? wx_place_import_legacy() : null;
    return ['data' => $st];
}

/**
 * GET /placements/preview — the section, without writing anything.
 *
 * Two things this answers. `?designs=1` returns all five testimonial designs built from the live items, which
 * is how somebody chooses between them — v2.1 did that in a preview iframe; here it is the same rendered HTML
 * the push would write, so nothing about the comparison is decorative.
 *
 * And `?rel=index.html` says what would happen to that page: replaced, inserted, or refused for having no
 * anchor to insert at. The page itself is not sent back — a few hundred bytes around the insertion point are
 * enough to see where the section lands, and a live page is not something to ship to a browser just because
 * somebody opened a preview.
 */
function wx_route_place_preview(array $ctx): array
{
    wx_require_user('cms_placements', WX_PLACE_MANAGE);
    $q = $ctx['query'];
    $kind = (string) ($q['kind'] ?? 'testimonial');
    wx_place_kind($kind);
    $set = wx_place_set($kind);
    if (isset($q['kicker'])) {
        $set['kicker'] = mb_substr(trim((string) $q['kicker']), 0, 60);
    }
    if (isset($q['heading'])) {
        $set['heading'] = mb_substr(trim((string) $q['heading']), 0, 120);
    }
    if (isset($q['max'])) {
        $set['max'] = max(0, min(30, (int) $q['max']));
    }
    $items = wx_place_items($kind);

    if (!empty($q['designs'])) {
        $out = [];
        foreach (WX_PLACE_DESIGNS as $id => $d) {
            $out[$id] = ['id' => $id, 'label' => $d[0], 'note' => $d[1], 'html' => wx_place_tst_block($items, $set, $id)];
        }
        return ['data' => ['kind' => $kind, 'items' => count($items), 'designs' => $out]];
    }

    $design = (string) ($q['design'] ?? '');
    $block = wx_place_block($kind, $items, $set, $design !== '' ? $design : null);
    $out = [
        'kind' => $kind,
        'design' => $design !== '' ? $design : $set['design'],
        'items' => count($items),
        'html' => $block,
        'bytes' => strlen($block),
        'marker' => wx_place_marker($kind),
        'plan' => null,
        'around' => null,
    ];
    $rel = (string) ($q['rel'] ?? '');
    if ($rel !== '') {
        if (!wx_place_rel_ok($rel)) {
            throw ApiError::validation('That is not a page on this site', 'rel');
        }
        if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
            throw ApiError::notFound('There is no page at ' . $rel . ' on this site');
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        $applied = wx_place_apply($html, $kind, $block);
        $out['plan'] = $applied['plan'] + ['changed' => $applied['changed']];
        $out['around'] = $applied['plan']['at'] === null ? null : wx_place_excerpt($html, (int) $applied['plan']['at']);
    }
    return ['data' => $out];
}

/** GET /placements/plan — what a push would touch, so the button can say so before it is pressed. */
function wx_route_place_plan(array $ctx): array
{
    wx_require_user('cms_placements', WX_PLACE_MANAGE);
    return ['data' => wx_place_plan_all(wx_route_place_kinds($ctx['query']))];
}

/** POST /placements — save the choices. v2.1 asked the owner or an admin, and so does this. */
function wx_route_place_save(array $ctx): array
{
    return wx_appr_route('cms_placements_save', $ctx, 'placements', 'wx_route_place_save_do', static fn() => wx_route_place_save_do($ctx));
}

function wx_route_place_save_do(array $ctx): array
{
    $u = wx_require_user('cms_placements_save', WX_PLACE_MANAGE);
    $body = is_array($ctx['body']) ? $ctx['body'] : [];
    return wx_guard('placements.save', static fn(): array => ['data' => wx_place_save($body, $u)]);
}

/** POST /placements/push — write the sections into the pages. Queued under v2.1's builder `save`. */
function wx_route_place_push(array $ctx): array
{
    return wx_appr_route('save', $ctx, 'placements', 'wx_route_place_push_do', static fn() => wx_route_place_push_do($ctx), 'builder');
}

function wx_route_place_push_do(array $ctx): array
{
    $u = wx_require_user(null, WX_PAGES_EDIT);
    $kinds = wx_route_place_kinds(is_array($ctx['body']) ? $ctx['body'] : []);
    return wx_guard('placements.push', static fn(): array => ['data' => wx_place_push($kinds, $u)]);
}
