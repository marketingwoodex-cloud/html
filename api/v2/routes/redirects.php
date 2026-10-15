<?php
/**
 * api/v2/routes/redirects.php — the addresses that moved, and the ones that were never there.
 *
 * Two screens, one subject: what Google and customers are asking for. The redirect list is what we
 * decided; the 404 log is what they actually asked for and did not get — and it is the most useful SEO
 * input the site has, because every row is either a redirect to write or a link to fix.
 *
 * Every write here goes through the approval gate: a redirect rule changes what the public sees, and
 * `.htaccess` is the file whose corruption takes the whole site down. `wx_appr_route()` puts a Manager's
 * change in the Master's queue and lets the Master's own through.
 */

declare(strict_types=1);

/** GET /redirects — the rules, the switch states, a check of every rule, and how many addresses missed. */
function wx_route_redirects_list(array $ctx): array
{
    wx_require_user('redirects', ['owner', 'admin']);
    if ($ctx['query']['import'] ?? false) {
        /* The legacy import is a read that writes; it is here rather than on a button because it is
           idempotent, and because the first person to open this screen after the upgrade should see
           their existing rules rather than an empty list. */
        $imported = wx_rd_import_legacy();
    }
    $list = wx_rd_list();
    return ['data' => [
        'redirects' => $list,
        'cfg' => [
            'www' => wx_setting_bool('redirect.www', true),
            'spam' => wx_setting_bool('redirect.spam', true),
        ],
        'planCount' => count(wx_rd_plan()),
        'test' => wx_rd_test($list),
        'missed' => (int) wx_val('SELECT COUNT(*) FROM wx_r404'),
        'imported' => $imported ?? null,
        'htaccess' => [
            'exists' => is_file(WX_SITE_ROOT . WX_RD_HTACCESS),
            'writable' => is_file(WX_SITE_ROOT . WX_RD_HTACCESS) ? is_writable(WX_SITE_ROOT . WX_RD_HTACCESS) : is_writable(WX_SITE_ROOT),
            'published' => wx_rd_block_exists(),
        ],
        'lines' => count(wx_rd_lines()),
    ]];
}

/** POST /redirects — save the list, the two switches, and publish the .htaccess block. */
function wx_route_redirects_save(array $ctx): array
{
    return wx_appr_route('redirects_save', $ctx, 'redirects', 'wx_route_redirects_save_do', static fn() => wx_route_redirects_save_do($ctx));
}

function wx_route_redirects_save_do(array $ctx): array
{
    $u = wx_require_user('redirects_save', ['owner', 'admin']);
    $raw = is_array($ctx['body']['redirects'] ?? null) ? $ctx['body']['redirects'] : null;
    if ($raw === null) {
        throw ApiError::validation('Send the redirect list', 'redirects');
    }

    return wx_guard('redirects.save', static function () use ($ctx, $u, $raw) {
        return wx_tx(static function () use ($ctx, $u, $raw) {
            $list = wx_rd_clean($raw);
            if (isset($ctx['body']['cfg']) && is_array($ctx['body']['cfg'])) {
                $cfg = $ctx['body']['cfg'];
                wx_setting_set('redirect.www', !empty($cfg['www']) ? '1' : '0');
                wx_setting_set('redirect.spam', !empty($cfg['spam']) ? '1' : '0');
            }
            $saved = wx_rd_save($list, $u);
            $publish = wx_rd_publish();
            wx_audit($u, 'redirects.save', 'settings', [
                'added' => $saved['added'],
                'changed' => $saved['changed'],
                'removed' => $saved['removed'],
                'published' => $publish['changed'],
                'copied' => $publish['copied'],
            ]);
            $fresh = wx_rd_list();
            return ['data' => [
                'redirects' => $fresh,
                'saved' => $saved,
                'publish' => $publish,
                'test' => wx_rd_test($fresh),
            ]];
        });
    });
}

/**
 * POST /redirects/plan — merge the verified plan (36 addresses from the Google index export).
 *
 * Idempotent: addresses that already have a rule are skipped and counted, because somebody's decision
 * about where `/page/` goes is newer information than a list compiled from an export.
 *
 * The gate carries `redirects_save`, not `redirects_plan`. Both are real v2.1 actions in the same
 * permission group, but only `save` matches a verb the policy queues — so in v2.1 a Manager could merge
 * 36 addresses and rewrite `.htaccess` with no approval, while typing the same rules by hand did need one.
 * Nothing about the business rule suggests that; it was a gap, and this is the deliberate tightening of it.
 * The route's own `wx_require_user('redirects_plan', …)` in the handler is unchanged.
 */
function wx_route_redirects_plan(array $ctx): array
{
    return wx_appr_route('redirects_save', $ctx, 'redirects', 'wx_route_redirects_plan_do', static fn() => wx_route_redirects_plan_do($ctx));
}

function wx_route_redirects_plan_do(array $ctx): array
{
    $u = wx_require_user('redirects_plan', ['owner', 'admin']);

    return wx_guard('redirects.plan', static function () use ($u) {
        return wx_tx(static function () use ($u) {
            $merge = wx_rd_merge(wx_rd_list(), wx_rd_plan());
            if ($merge['added'] === 0) {
                return ['data' => ['added' => 0, 'redirects' => wx_rd_list(), 'test' => wx_rd_test(wx_rd_list())]];
            }
            $clean = wx_rd_clean($merge['list']);
            wx_rd_save($clean, $u);
            $publish = wx_rd_publish();
            wx_audit($u, 'redirects.plan', 'settings', ['added' => $merge['added'], 'lines' => $publish['lines']]);
            $fresh = wx_rd_list();
            return ['data' => ['added' => $merge['added'], 'redirects' => $fresh, 'publish' => $publish, 'test' => wx_rd_test($fresh)]];
        });
    });
}

/** GET /404s — the missed addresses, most-asked first, each marked if a rule already covers it. */
function wx_route_r404_list(array $ctx): array
{
    wx_require_user('r404_list', ['owner', 'admin']);
    $rows = wx_r404_list((int) ($ctx['query']['limit'] ?? 200));
    return ['data' => [
        'rows' => $rows,
        'total' => (int) wx_val('SELECT COUNT(*) FROM wx_r404'),
        'suggestions' => wx_r404_suggest($rows),
    ]];
}

/** DELETE /404s — clear one address, or every one of them. */
function wx_route_r404_clear(array $ctx): array
{
    return wx_appr_route('r404_clear', $ctx, 'redirects', 'wx_route_r404_clear_do', static fn() => wx_route_r404_clear_do($ctx));
}

function wx_route_r404_clear_do(array $ctx): array
{
    $u = wx_require_user('r404_clear', ['owner', 'admin']);
    $path = trim((string) ($ctx['params']['path'] ?? $ctx['body']['path'] ?? ''));
    $n = wx_r404_clear($path);
    wx_audit($u, 'r404.clear', $path !== '' ? 'path:' . $path : 'all', ['removed' => $n]);
    return ['data' => ['removed' => $n, 'rows' => wx_r404_list()]];
}

/**
 * POST /r404 — the public endpoint the site's 404 handler reports to.
 *
 * Public because the people who hit 404s are, almost by definition, not signed in. Everything about it
 * is built for an anonymous caller: `wx_r404_log()` refuses system folders and asset extensions and
 * rate-limits per IP, and this handler answers `ok` whatever happens — a 404 logger that returns an
 * error is a logger somebody removes.
 */
function wx_route_r404_report(array $ctx): array
{
    $path = (string) ($ctx['body']['path'] ?? $ctx['body']['p'] ?? '');
    $ref = (string) ($ctx['body']['ref'] ?? '');
    $logged = false;
    if ($path !== '') {
        try {
            $logged = wx_r404_log($path, $ref);
        } catch (Throwable $e) {
            error_log('[wx-v2] r404 log failed: ' . $e->getMessage());
        }
    }
    return ['data' => ['logged' => $logged]];
}

/* ---------------------------------------------------------------- helpers */

/** Does the .htaccess already carry our block? (Used by the screen, so nobody publishes twice blindly.) */
function wx_rd_block_exists(): bool
{
    $file = WX_SITE_ROOT . WX_RD_HTACCESS;
    return is_file($file) && str_contains((string) file_get_contents($file), WX_RD_BEGIN);
}

/**
 * Turn the busiest missed addresses into rules somebody can approve in one click.
 *
 * The heuristic is deliberately conservative, because a wrong suggestion that is accepted is worse than
 * no suggestion: a path that matches a real page (ignoring a trailing slash, a `.html` or a typo'd
 * capital) is suggested as a 301 to that page, and everything else is left alone. Fuzzy matching a URL
 * to "the closest page" is how a redirect sends a customer to the wrong service page.
 */
function wx_r404_suggest(array $rows): array
{
    $out = [];
    foreach (array_slice($rows, 0, 40) as $row) {
        if (!empty($row['redirect'])) {
            continue;
        }
        $path = (string) $row['path'];
        $candidates = [];
        $bare = trim($path, '/');
        $lower = strtolower($bare);
        if ($bare !== '' && $bare !== $lower) {
            $candidates[] = '/' . $lower . '/';
        }
        if ($bare !== '' && !str_ends_with($bare, '.html') && is_file(WX_SITE_ROOT . '/' . $bare . '.html')) {
            $candidates[] = '/' . $bare . '.html';
        }
        foreach ($candidates as $to) {
            if (is_file(WX_SITE_ROOT . rtrim($to, '/') . '/index.html') || is_file(WX_SITE_ROOT . '/' . ltrim($to, '/'))) {
                $out[] = ['from' => $path, 'to' => $to, 'type' => 301, 'match' => 'exact', 'src' => 'from the 404 log', 'on' => true, 'n' => (int) $row['n']];
                break;
            }
        }
    }
    return $out;
}
