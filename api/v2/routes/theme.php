<?php
/**
 * api/v2/routes/theme.php — the site's theme: read it, change it, put a version back.
 *
 * Three routes over v2.1's two builder actions. `theme_get` and `theme` keep their names because the
 * permission matrix and the approval policy are keyed on them — `theme` is on the builder's write list, so
 * a Manager's theme change waits for the Master exactly as it did in the builder screen.
 *
 * `POST /theme/rollback` is new, and it is a rollback of a change that already passed this policy, so it does
 * not queue — the same decision the pages make, named in `WX_APPR_NEVER` with its reason.
 */

declare(strict_types=1);

/** Who may touch the site's design: the same three roles the builder allowed. */
const WX_THEME_EDIT = ['owner', 'admin', 'editor'];

/** GET /theme — the settings the site is using, the settings somebody chose, the tokens, the history. */
function wx_route_theme_get(array $ctx): array
{
    wx_require_user('theme_get', WX_THEME_EDIT);
    return ['data' => wx_theme_state()];
}

/**
 * POST /theme — apply settings.
 *
 * `vars` is the whole set, not a patch: a theme is a set of values, and a request that only mentions the
 * navy cannot say whether the rest were kept or forgotten. The screen sends everything it is showing, and
 * an empty value clears a setting.
 */
function wx_route_theme_save(array $ctx): array
{
    $body = is_array($ctx['body']) ? $ctx['body'] : [];
    $vars = is_array($body['vars'] ?? null) ? $body['vars'] : [];
    /* The queue line the Master reads: v2.1's phrasing, naming the preset when one is chosen. */
    $summary = $ctx + ['body' => ['name' => (string) ($vars['--wx-preset'] ?? 'custom')]];
    return wx_appr_route(
        'theme',
        $summary,
        'theme',
        'wx_route_theme_save_do',
        static fn() => wx_route_theme_save_do($ctx),
        'builder'
    );
}

function wx_route_theme_save_do(array $ctx): array
{
    $u = wx_require_user('theme', WX_THEME_EDIT);
    $body = is_array($ctx['body']) ? $ctx['body'] : [];
    $vars = is_array($body['vars'] ?? null) ? $body['vars'] : [];
    $note = mb_substr(trim((string) ($body['note'] ?? '')), 0, 200);
    /* `mtime` is what the screen had loaded and `force` is the second press after a conflict was shown —
       the same contract the page editor uses, because the same two things can happen: somebody else saves,
       or somebody edits the stylesheet by hand. */
    $expect = (int) ($body['mtime'] ?? 0);
    $force = !empty($body['force']);
    return ['data' => wx_guard('theme.save', static fn(): array => wx_theme_write($vars, $u, $note, $expect, $force))];
}

/** POST /theme/rollback — put the stylesheet back to one of its versions. */
function wx_route_theme_rollback(array $ctx): array
{
    return wx_appr_route('theme_rollback', $ctx, 'theme', 'wx_route_theme_rollback_do', static fn() => wx_route_theme_rollback_do($ctx));
}

function wx_route_theme_rollback_do(array $ctx): array
{
    $u = wx_require_user(null, WX_THEME_EDIT);
    $id = (int) ($ctx['body']['version'] ?? $ctx['params']['version'] ?? 0);
    if ($id <= 0) {
        throw ApiError::validation('Which version? Pass the version id', 'version');
    }
    return ['data' => wx_guard('theme.rollback', static fn(): array => wx_theme_rollback($id, $u))];
}
