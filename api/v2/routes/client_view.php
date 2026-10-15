<?php
/**
 * api/v2/routes/clientview.php — the one route a client opens, with no session.
 *
 *   GET /client/project/{id}?t=…   (no action name — nothing about it is a v2.1 action)
 *
 * It answers with a page, not an envelope, which is why it returns `['html' => …]` and the front controller
 * streams it (see `wx_send_html()`). Everything else in this API is JSON on purpose and this is the single
 * deliberate exception: a client who has just received a WhatsApp message opens a link, and a link that
 * downloaded a JSON file would be absurd.
 *
 * **The refusal is one message.** A bad token, a missing token, a project that does not exist and a
 * project whose number has since changed all produce the same 404 sentence and the same page: telling a
 * stranger which of those it was would be telling them something about a client's project. The token is
 * compared with `hash_equals`, and its *shape* is checked before any query runs, so a fuzzed token costs
 * nothing.
 */

declare(strict_types=1);

/** GET /client/project/{id}?t=… — the progress page. */
/* The invoice rows for the client page are built by the project route's helpers. The router loads only this
   file for this route, so they are loaded here; require_once keeps it a single definition either way. */
require_once __DIR__ . '/projects.php';

function wx_route_client_project(array $ctx): array
{
    $id = (int) ($ctx['params']['id'] ?? 0);
    $token = (string) ($ctx['query']['t'] ?? '');
    $company = [
        'name' => (string) (wx_setting('company.name', 'Woodex Interior') ?? 'Woodex Interior'),
        'phones' => (string) (wx_setting('company.phones', '') ?? ''),
        'whatsapp' => (string) (wx_setting('company.whatsapp', '') ?? ''),
    ];
    $notFound = static fn(): array => ['__html' => ['status' => 404, 'body' => wx_cv_html([
        'name' => 'This link is not valid',
        'no' => '', 'site' => '', 'client' => '',
        'stage' => 'planning', 'stageLabel' => '', 'stages' => [],
        'start' => '', 'target' => '', 'late' => false,
        'valueDisplay' => '', 'invoicedDisplay' => '', 'receivedDisplay' => '', 'balanceDisplay' => '',
        'billedPct' => 0, 'invoices' => [], 'updates' => [],
        'company' => $company, 'generated' => date('Y-m-d H:i'),
    ])]];

    if ($id <= 0 || !wx_cv_token_ok($token)) {
        return $notFound();
    }
    $p = wx_doc_get_row('wx_projects', $id);
    if ($p === null) {
        return $notFound();
    }
    $p['id'] = $id;
    if (!hash_equals(wx_cv_token($p), $token)) {
        return $notFound();
    }

    /* The view is recorded on the project — once per window, and never as something the client sees. A
       database that refuses the write must not cost the client their page: this is a page about their
       project, and a failed audit line is ours to fix, not theirs to wait for. */
    try {
        $marked = wx_cv_mark_viewed($p, wx_now());
        if ($marked !== null) {
            $marked['updates'] = array_slice($marked['updates'], -500);
            wx_doc_put('wx_projects', $marked);
            $p = $marked;
            /* Nobody signed in, and the trail still has to say the page was opened: the actor is null and the
               action names it for what it was. A studio reading this log sees "client.view" and knows that no
               member of staff did it. */
            wx_audit(null, 'client.view', 'project:' . $id, ['views' => (int) $marked['views']]);
        }
    } catch (Throwable $e) {
        error_log('[wx-v2] client view ' . $id . ': ' . $e->getMessage());
    }

    $invoices = wx_proj_invoices($id, (int) ($p['invoice_id'] ?? 0));
    return ['__html' => ['status' => 200, 'body' => wx_cv_html(wx_cv_page($p, $invoices, $company))]];
}
