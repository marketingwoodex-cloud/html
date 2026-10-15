<?php
/**
 * api/v2/routes/estimator.php — the rate book behind /estimator/ and the quotation builder.
 *
 *   GET  /estimator             `est_tpls`      — the figures, the saved sets, and every page that loads them
 *   POST /estimator             `est_save`      — save the figures and reload every page that reads them
 *   POST /estimator/templates   `est_tpl_save`  — keep these figures under a name, or delete a saved set
 *
 * The names are v2.1's own (`p18e-lib.php`), which is why the permission answer is unchanged: the actions sit in
 * the shared `sales`/`website` groups, so the people who quote from these numbers are the people who may edit
 * them, and a Manager's save waits for the Master exactly as before.
 *
 * The rate book is not a database row and deliberately so: it is written out as **JavaScript**
 * (`assets/js/estimator-rates.js`, `window.WX_RATES`) because `/estimator/` reads it directly, with no request —
 * which is why the calculator still works on a phone with one bar of signal. The file is generated, never
 * hand-edited, and the header it carries now says so.
 *
 * What changed from v2.1 is the reload. v2.1 walked every page and wrote a cache-busting query string into each
 * one with a file write of its own — outside the page history, one write per page, none of them undoable. Here
 * the pages that read the rate book are found first and rewritten through `wx_page_write_many()`, so the whole
 * set is one batch, one entry in the page history, and one undo — the same promise the Pages screen makes.
 */

declare(strict_types=1);

/** The roles the shared capability groups already agree to for these three actions. */
const WX_EST_EDIT = ['owner', 'admin', 'editor', 'sales'];

/** GET /estimator — the figures, the sets saved from them, and the pages that read them. */
function wx_route_est_get(array $ctx): array
{
    wx_require_user('est_tpls', WX_EST_EDIT);
    return ['data' => wx_est_report() + ['templates' => wx_est_templates()]];
}

/** POST /estimator — save the rate book. */
function wx_route_est_save(array $ctx): array
{
    return wx_appr_route('est_save', $ctx, 'estimator', 'wx_route_est_save_do', static fn() => wx_route_est_save_do($ctx));
}

function wx_route_est_save_do(array $ctx): array
{
    $me = wx_require_user('est_save', WX_EST_EDIT);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $rates = $body['rates'] ?? null;
    if (!is_array($rates)) {
        throw ApiError::validation('The request did not carry a rate book', 'rates');
    }
    $done = wx_est_write($rates, $me);
    $message = $done['changed'] === 0
        ? 'The figures are saved — the pages were already reading this version.'
        : 'Saved. ' . $done['changed'] . ' page(s) now reload the rate book as v' . $done['version'] . '.';
    return ['data' => $done, 'meta' => ['message' => $message]];
}

/** POST /estimator/templates — keep the current figures under a name, or delete a saved set. */
function wx_route_est_tpl_save(array $ctx): array
{
    return wx_appr_route('est_tpl_save', $ctx, 'estimator', 'wx_route_est_tpl_save_do', static fn() => wx_route_est_tpl_save_do($ctx));
}

function wx_route_est_tpl_save_do(array $ctx): array
{
    $me = wx_require_user('est_tpl_save', WX_EST_EDIT);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $delete = !empty($body['delete']);
    $name = (string) ($body['name'] ?? '');
    /* A save needs figures; a delete needs only the name, because the set is already on disk. */
    $rates = $delete ? null : ($body['rates'] ?? null);
    if (!$delete && !is_array($rates)) {
        throw ApiError::validation('Name the set and send the figures to keep', 'rates');
    }
    $list = wx_est_template_save($name, $rates, $delete, $me);
    $message = $delete ? 'Deleted “' . trim($name) . '”.' : 'Kept these figures as “' . trim($name) . '”.';
    return ['data' => ['templates' => $list], 'meta' => ['message' => $message]];
}

/** GET /estimator/templates — the saved sets on their own, for a screen that only lists them. */
function wx_route_est_tpl_list(array $ctx): array
{
    wx_require_user('est_tpls', WX_EST_EDIT);
    return ['data' => ['templates' => wx_est_templates()]];
}
