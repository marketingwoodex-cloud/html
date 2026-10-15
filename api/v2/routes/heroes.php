<?php
/**
 * api/v2/routes/heroes.php — the hero at the top of every page, on the screens that edit it.
 *
 * Four reads and two writes:
 *
 *   GET  /heroes          `load`   — every page, which design its hero uses, and what it says
 *   GET  /heroes/page     `load`   — one page's hero: its fields, its design, the six templates
 *   GET  /heroes/home     `load`   — the home slider: its slides in order, its interval
 *   GET  /heroes/preview  (none)   — a design, rendered on the site's own stylesheet, for the gallery
 *   POST /heroes/page     `save`   — edit one page's hero, or switch it to a design
 *   POST /heroes/home     `save`   — the home slider: add, remove, reorder, hide, retime
 *
 * **Why the writes are queued under `save`.** v2.1's hero screen had no actions of its own: it called the
 * builder's `load` and `save` through `bapi`, and the six templates were rendered in a browser. Using the
 * same two action names here keeps the approval policy the business already agreed to — a Manager's hero
 * change waits for the Master exactly as a page edit does, and nothing new has to be invented to say so.
 *
 * There is no table behind any of this. A hero is part of a page, a page is a file, and a page write is
 * already versioned and undoable — so the screen's promise ("this can be put back") is the same promise
 * the pages screen makes, made by the same code.
 */

declare(strict_types=1);

/** Who may edit a hero. The builder's own roles, because this is the builder's own work. */
const WX_HERO_EDIT = ['owner', 'admin', 'editor'];

/** GET /heroes — every page, its hero design, and what the hero says. */
function wx_route_hero_list(array $ctx): array
{
    wx_require_user('load', WX_HERO_EDIT);
    $scan = wx_hero_scan();
    return ['data' => $scan + ['templates' => wx_hero_templates(), 'home' => WX_HERO_HOME, 'families' => WX_HERO_FAMILIES]];
}

/** GET /heroes/page?rel=… — one page's hero. */
function wx_route_hero_page(array $ctx): array
{
    wx_require_user('load', WX_HERO_EDIT);
    $rel = (string) ($ctx['query']['rel'] ?? $ctx['query']['path'] ?? '');
    if ($rel === '') {
        throw ApiError::validation('Name the page whose hero you want to read', 'rel');
    }
    if (!wx_hero_rel_ok($rel)) {
        throw ApiError::validation('That is not a page this screen may read', 'rel');
    }
    return ['data' => wx_hero_page($rel)];
}

/** GET /heroes/home — the slider. */
function wx_route_hero_home(array $ctx): array
{
    wx_require_user('load', WX_HERO_EDIT);
    return ['data' => wx_hero_home()];
}

/**
 * GET /heroes/preview?tpl=… — one design, with sample words, on the stylesheet the live pages load.
 *
 * The gallery shows the six designs rather than describing them, and the markup it shows is produced by
 * the same function that writes a page — so the picture and the result cannot disagree.
 */
function wx_route_hero_preview(array $ctx): array
{
    wx_require_user('load', WX_HERO_EDIT);
    $tpl = strtolower(trim((string) ($ctx['query']['tpl'] ?? 'image')));
    if (!isset(WX_HERO_TEMPLATES[$tpl])) {
        throw ApiError::validation('Unknown hero template: "' . $tpl . '"', 'tpl');
    }
    return ['data' => [
        'tpl' => $tpl,
        'label' => WX_HERO_TEMPLATES[$tpl][0],
        'desc' => WX_HERO_TEMPLATES[$tpl][1],
        'html' => wx_hero_preview($tpl, (string) ($ctx['query']['rel'] ?? '')),
    ]];
}

/**
 * POST /heroes/page — `{rel, tpl: "keep"|"image"|…, fields…}`.
 *
 * `keep` edits the hero where it stands, so a page's own design survives; anything else replaces it with
 * that design. Both paths write once, through the page writer, which is what makes this one change with
 * one undo rather than a special case.
 */
function wx_route_hero_save_page(array $ctx): array
{
    return wx_appr_route('save', $ctx, 'heroes', 'wx_route_hero_save_page_do', static fn() => wx_route_hero_save_page_do($ctx), 'builder');
}

function wx_route_hero_save_page_do(array $ctx): array
{
    $u = wx_require_user(null, WX_HERO_EDIT);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $rel = (string) ($body['rel'] ?? $body['path'] ?? '');
    if ($rel === '') {
        throw ApiError::validation('Name the page whose hero you are changing', 'rel');
    }
    return wx_guard('hero.save', static fn(): array => ['data' => wx_hero_save_page($rel, $body, $u)]);
}

/** POST /heroes/home — `{interval, slides: [{i, title, …}]}`. */
function wx_route_hero_save_home(array $ctx): array
{
    return wx_appr_route('save', $ctx, 'heroes', 'wx_route_hero_save_home_do', static fn() => wx_route_hero_save_home_do($ctx), 'builder');
}

function wx_route_hero_save_home_do(array $ctx): array
{
    $u = wx_require_user(null, WX_HERO_EDIT);
    return wx_guard('hero.home', static fn(): array => ['data' => wx_hero_save_home(is_array($ctx['body'] ?? null) ? $ctx['body'] : [], $u)]);
}
