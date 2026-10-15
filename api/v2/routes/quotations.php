<?php
/**
 * api/v2/routes/quotations.php — the quotation, from draft to invoice.
 *
 * The money rule the plan makes testable: **totals are computed here, never accepted from the
 * browser.** The request may carry sections and a discount; `wx_doc_totals()` derives subtotal, tax
 * and total, and whatever total the client sent is overwritten. The prototype showed "projected"
 * totals precisely because it had no server to trust yet.
 *
 * Status flow, unchanged from v2.1 so the two admins cannot disagree about what "approved" means:
 *
 *   draft ──send──▶ sent ──viewed──▶ viewed ──approve──▶ approved ──invoice──▶ invoiced
 *     └────────────────────────────▶ rejected            (or rejected from any open state)
 *
 * Converting to an invoice requires `approved`, and refuses if an invoice already exists for the
 * quotation — v2.1 enforced both, and losing either would let a client be billed twice.
 */

declare(strict_types=1);

/** A list row: enough for the table, no sections, totals straight from the indexed columns. */
function wx_quote_row(array $x): array
{
    $x = wx_doc_totals($x);
    return [
        'id' => (int) $x['id'],
        'no' => (string) $x['no'],
        'label' => wx_doc_label($x),
        'status' => (string) $x['status'],
        'client' => $x['client']['name'] ?? '',
        'client_id' => isset($x['client_id']) ? (int) $x['client_id'] : null,
        'project' => (string) ($x['project'] ?? ''),
        'issue_date' => (string) ($x['issue_date'] ?? ''),
        'valid_until' => (string) ($x['valid_until'] ?? ''),
        'subtotal' => (int) $x['subtotal'],
        'discount' => (int) $x['discount'],
        'tax' => (int) $x['tax'],
        'total' => (int) $x['total'],
        'totalDisplay' => wx_pkr_out((int) $x['total']),
        'version' => (int) ($x['version'] ?? 1),
        'option' => (string) ($x['option'] ?? ''),
        'created_by' => (string) ($x['created_by'] ?? ''),
        'created_at' => (string) ($x['created_at'] ?? ''),
    ];
}

function wx_route_quotes_list(array $ctx): array
{
    wx_require_user('list_quotes');
    $limit = wx_limit($ctx['query']['limit'] ?? 50);
    $offset = wx_offset($ctx['query']['offset'] ?? 0);
    $page = wx_doc_page('wx_quotes', [
        'status' => $ctx['query']['status'] ?? null,
        'client_id' => $ctx['query']['client_id'] ?? null,
        'q' => $ctx['query']['q'] ?? null,
    ], $limit, $offset);

    $rows = array_map('wx_quote_row', $page['rows']);
    $summary = ['open' => 0, 'openValue' => 0, 'approved' => 0, 'total' => $page['total']];
    $counts = [];
    foreach (wx_all('SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS v FROM wx_quotes GROUP BY status') as $r) {
        $counts[(string) $r['status']] = ['count' => (int) $r['n'], 'value' => (int) $r['v']];
    }
    foreach (['sent', 'viewed'] as $s) {
        $summary['open'] += (int) ($counts[$s]['count'] ?? 0);
        $summary['openValue'] += (int) ($counts[$s]['value'] ?? 0);
    }
    $summary['approved'] = (int) ($counts['approved']['count'] ?? 0);

    return ['data' => ['quotes' => $rows, 'total' => $page['total'], 'limit' => $limit, 'offset' => $offset, 'summary' => $summary, 'byStatus' => $counts, 'statuses' => WX_QUOTE_STATUSES]];
}

function wx_route_quotes_get(array $ctx): array
{
    wx_require_user('get_quote');
    $x = wx_doc_get('wx_quotes', (int) $ctx['params']['id']);
    if ($x === null) {
        throw ApiError::notFound('That quotation does not exist');
    }
    $x = wx_doc_totals($x);
    $x['label'] = wx_doc_label($x);
    $x['units'] = WX_UNITS;
    $x['statuses'] = WX_QUOTE_STATUSES;
    $x['company'] = wx_company();
    $x['viewUrl'] = '/api/quote-view.php?id=' . $x['id'] . '&t=' . wx_quote_view_token($x);
    return ['data' => ['quote' => $x]];
}

/**
 * Create or update. The whole section tree is replaced on every save, as v2.1 does — the BOQ builder
 * edits the document as a unit. The difference is that the totals are recomputed server-side and the
 * indexed columns are written in the same statement.
 */
function wx_route_quotes_save(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_quotes_save_do() below. */
    return wx_appr_route('quote_save', $ctx, 'quotations', 'wx_route_quotes_save_do', static fn() => wx_route_quotes_save_do($ctx));
}

function wx_route_quotes_save_do(array $ctx): array
{
    $u = wx_require_user('quote_save');
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : (int) ($ctx['body']['id'] ?? 0);

    return wx_guard('quotes.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $b = $ctx['body'];
            if ($id > 0) {
                $x = wx_doc_get('wx_quotes', $id, true);
                if ($x === null) {
                    throw ApiError::notFound('That quotation does not exist');
                }
                if (in_array((string) $x['status'], ['invoiced'], true)) {
                    throw ApiError::conflict('That quotation has been invoiced and can no longer be edited');
                }
            } else {
                $no = wx_next_doc_no();
                $company = wx_company();
                $x = [
                    'no' => $no,
                    'status' => 'draft',
                    'version' => 1,
                    'option' => '',
                    'client' => ['name' => '', 'phone' => '', 'email' => '', 'address' => '', 'company' => ''],
                    'project' => '',
                    'site' => '',
                    'sections' => [],
                    'discount' => 0,
                    'taxPct' => 0,
                    'rent' => 0,
                    'advance' => 0,
                    'terms' => '',
                    'notes' => '',
                    'issue_date' => date('Y-m-d'),
                    'valid_until' => date('Y-m-d', time() + max(1, (int) $company['validDays']) * 86400),
                    'currency' => 'PKR',
                    'history' => [wx_hist($u, 'Quotation created')],
                    'created_by' => (string) $u['name'],
                    'created_at' => wx_now(),
                ];
                $GLOBALS['WX_QUOTE_NEW'] = $no;
            }

            // ---- client block
            if (isset($b['client']) && is_array($b['client'])) {
                foreach (['name' => 120, 'phone' => 40, 'email' => 190, 'address' => 300, 'company' => 120] as $k => $max) {
                    if (array_key_exists($k, $b['client'])) {
                        $v = $b['client'][$k];
                        if ($k === 'email' && $v !== null && $v !== '') {
                            $x['client'][$k] = wx_v_email($v, 'client.email');
                        } else {
                            $x['client'][$k] = wx_v_opt_string($v, 'client.' . $k, $max) ?? '';
                        }
                    }
                }
            }
            if (array_key_exists('client_id', $b)) {
                $x['client_id'] = wx_v_opt_int($b['client_id'], 'client_id', 1);
            }
            // ---- the document itself
            foreach (['project' => 190, 'site' => 300, 'terms' => 3000, 'notes' => 3000, 'option' => 20] as $k => $max) {
                if (array_key_exists($k, $b)) {
                    $x[$k] = wx_v_opt_string($b[$k], $k, $max) ?? '';
                }
            }
            if (array_key_exists('sections', $b)) {
                $x['sections'] = wx_clean_sections($b['sections']);
            }
            if (array_key_exists('discount', $b)) {
                $x['discount'] = wx_v_pkr($b['discount'], 'discount', 0);
            }
            if (array_key_exists('taxPct', $b)) {
                $x['taxPct'] = min(50.0, wx_numv($b['taxPct']));
            }
            if (array_key_exists('rent', $b)) {
                $x['rent'] = wx_v_pkr($b['rent'], 'rent', 0);
            }
            if (array_key_exists('advance', $b)) {
                $x['advance'] = wx_v_pkr($b['advance'], 'advance', 0);
            }
            if (array_key_exists('issue_date', $b)) {
                $x['issue_date'] = wx_v_date($b['issue_date'], 'issue_date');
            }
            if (array_key_exists('valid_until', $b)) {
                $x['valid_until'] = wx_v_opt_date($b['valid_until'], 'valid_until') ?? '';
            }

            // ---- the arithmetic, server-side, overwriting anything the client computed
            $x = wx_doc_totals($x);
            if ($id > 0) {
                $x['history'][] = wx_hist($u, 'Quotation updated');
            }

            $x = wx_doc_put('wx_quotes', $x, wx_doc_columns('wx_quotes', $x));
            wx_audit($u, $id > 0 ? 'quote.save' : 'quote.create', 'quote:' . $x['id'], ['no' => $x['no'], 'total' => $x['total']]);
            return ['data' => ['quote' => wx_quote_row($x), 'created' => $id === 0]];
        });
    });
}

/** A status move. Each transition is deliberate; an unknown one is refused rather than stored. */
function wx_route_quotes_status(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_quotes_status_do() below. */
    return wx_appr_route('quote_status', $ctx, 'quotations', 'wx_route_quotes_status_do', static fn() => wx_route_quotes_status_do($ctx));
}

function wx_route_quotes_status_do(array $ctx): array
{
    $u = wx_require_user('quote_status');
    $id = (int) $ctx['params']['id'];
    $to = wx_v_enum($ctx['body']['status'] ?? '', WX_QUOTE_STATUSES, 'status');
    $note = wx_v_opt_string($ctx['body']['note'] ?? null, 'note', 300);

    return wx_guard('quotes.status', static function () use ($u, $id, $to, $note) {
        return wx_tx(static function () use ($u, $id, $to, $note) {
            $x = wx_doc_get('wx_quotes', $id, true);
            if ($x === null) {
                throw ApiError::notFound('That quotation does not exist');
            }
            $from = (string) $x['status'];
            if ($from === $to) {
                return ['data' => ['quote' => wx_quote_row($x), 'changed' => false]];
            }
            if ($from === 'invoiced') {
                throw ApiError::conflict('That quotation has been invoiced; its status cannot change');
            }
            $allowed = [
                'draft' => ['sent', 'rejected'],
                'sent' => ['viewed', 'approved', 'rejected', 'draft'],
                'viewed' => ['approved', 'rejected', 'sent'],
                'approved' => ['invoiced', 'rejected', 'sent'],
                'rejected' => ['draft', 'sent'],
            ];
            if (!in_array($to, $allowed[$from] ?? [], true)) {
                throw ApiError::conflict('A quotation cannot move from ' . $from . ' to ' . $to, ['from' => $from, 'to' => $to]);
            }
            $x['status'] = $to;
            if ($to === 'approved') {
                $x['approved_at'] = wx_now();
                $x['approved_by'] = (string) $u['name'];
            }
            $x['history'][] = wx_hist($u, 'Status: ' . $from . ' → ' . $to . ($note ? ' — ' . $note : ''));
            $x = wx_doc_put('wx_quotes', $x, wx_doc_columns('wx_quotes', $x));
            wx_audit($u, 'quote.status', 'quote:' . $id, ['from' => $from, 'to' => $to, 'note' => $note]);
            return ['data' => ['quote' => wx_quote_row($x), 'changed' => true]];
        });
    });
}

/**
 * A revision: v2.1 keeps the previous versions of a quotation rather than editing over them, because
 * a client may have already been sent version 1. The new copy takes the next number and starts as a
 * draft; the original is left exactly as it was.
 */
function wx_route_quotes_revise(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_quotes_revise_do() below. */
    return wx_appr_route('create_quote_draft', $ctx, 'quotations', 'wx_route_quotes_revise_do', static fn() => wx_route_quotes_revise_do($ctx));
}

function wx_route_quotes_revise_do(array $ctx): array
{
    $u = wx_require_user('create_quote_draft');
    $id = (int) $ctx['params']['id'];

    return wx_guard('quotes.revise', static function () use ($u, $id) {
        return wx_tx(static function () use ($u, $id) {
            $src = wx_doc_get('wx_quotes', $id, true);
            if ($src === null) {
                throw ApiError::notFound('That quotation does not exist');
            }
            $copy = $src;
            unset($copy['id']);
            $copy['no'] = wx_next_doc_no();
            $copy['status'] = 'draft';
            $copy['version'] = (int) ($src['version'] ?? 1) + 1;
            $copy['revised_from'] = (int) $src['id'];
            $copy['issue_date'] = date('Y-m-d');
            $copy['created_by'] = (string) $u['name'];
            $copy['created_at'] = wx_now();
            $copy['history'] = [wx_hist($u, 'Created from ' . wx_doc_label($src))];
            $copy = wx_doc_totals($copy);
            $copy = wx_doc_put('wx_quotes', $copy, wx_doc_columns('wx_quotes', $copy));

            $src['history'][] = wx_hist($u, 'Revised as ' . wx_doc_label($copy));
            wx_doc_put('wx_quotes', $src, wx_doc_columns('wx_quotes', $src));
            wx_audit($u, 'quote.revise', 'quote:' . $copy['id'], ['from' => $src['no']]);
            return ['data' => ['quote' => wx_quote_row($copy)]];
        });
    });
}

/**
 * wx_route_quotes_delete - held for the Master when the policy says this actor's change must wait.
 *
 * The change itself is wx_route_quotes_delete_do() below: the same code runs whether the actor was allowed
 * to act directly or a Master approved the replay afterwards, so the two paths cannot diverge.
 */
function wx_route_quotes_delete(array $ctx): array
{
    wx_require_user('quote_delete');
    $no = (string) (wx_val("SELECT no FROM wx_quotes WHERE id = ?", [(int) $ctx['params']['id']]) ?? '');
    $summary = 'Delete quotation' . ($no !== '' ? ' ' . $no : '');
    return wx_appr_wrap('quote_delete', 'quotations', 'wx_route_quotes_delete_do', $ctx, $summary, static fn() => wx_route_quotes_delete_do($ctx));
}

/** Delete a quotation. Refused once it has been invoiced — the invoice refers to it. */
function wx_route_quotes_delete_do(array $ctx): array
{
    $u = wx_require_user('quote_delete');
    $id = (int) $ctx['params']['id'];
    $x = wx_doc_get('wx_quotes', $id);
    if ($x === null) {
        throw ApiError::notFound('That quotation does not exist');
    }
    if (wx_val('SELECT id FROM wx_invoices WHERE quote_id = ?', [$id]) !== null) {
        throw ApiError::conflict('That quotation has an invoice and cannot be deleted');
    }
    wx_q('DELETE FROM wx_quotes WHERE id = ?', [$id]);
    wx_audit($u, 'quote.delete', 'quote:' . $id, ['no' => $x['no'], 'total' => (int) ($x['total'] ?? 0)]);
    return ['data' => ['id' => $id, 'deleted' => true]];
}

/**
 * wx_route_quotes_invoice - held for the Master when the policy says this actor's change must wait.
 *
 * The change itself is wx_route_quotes_invoice_do() below: the same code runs whether the actor was allowed
 * to act directly or a Master approved the replay afterwards, so the two paths cannot diverge.
 */
function wx_route_quotes_invoice(array $ctx): array
{
    wx_require_user('quote_invoice');
    $no = (string) (wx_val("SELECT no FROM wx_quotes WHERE id = ?", [(int) $ctx['params']['id']]) ?? '');
    $summary = 'Invoice quotation' . ($no !== '' ? ' ' . $no : '');
    return wx_appr_wrap('quote_invoice', 'quotations', 'wx_route_quotes_invoice_do', $ctx, $summary, static fn() => wx_route_quotes_invoice_do($ctx));
}

/**
 * Convert an approved quotation into an invoice — and open the project, which v2.1 did in the same
 * step because a quotation that becomes an invoice is also the moment delivery starts.
 */
function wx_route_quotes_invoice_do(array $ctx): array
{
    $u = wx_require_user('quote_invoice');
    $id = (int) $ctx['params']['id'];
    $schedule = wx_v_opt_string($ctx['body']['schedule'] ?? null, 'schedule', 600);

    return wx_guard('quotes.invoice', static function () use ($u, $id, $schedule) {
        return wx_tx(static function () use ($u, $id, $schedule) {
            $x = wx_doc_get('wx_quotes', $id, true);
            if ($x === null) {
                throw ApiError::notFound('That quotation does not exist');
            }
            if ((string) $x['status'] !== 'approved') {
                throw ApiError::conflict('Approve the quotation before converting it to an invoice', ['status' => $x['status']]);
            }
            if (wx_val('SELECT id FROM wx_invoices WHERE quote_id = ?', [$id]) !== null) {
                throw ApiError::conflict('This quotation already has an invoice');
            }

            // Find or create the client (wx_client_for — the same rule project billing uses).
            $clientId = wx_client_for($x['client'] ?? [], (int) ($x['client_id'] ?? 0) ?: null, $u);
            if ((int) ($x['client_id'] ?? 0) !== $clientId) {
                $x['client_id'] = $clientId;
            }

            $sched = $schedule ?: (strpos((string) ($x['terms'] ?? ''), '75%') !== false
                ? '75% advance with work order, 25% on approval'
                : '50% advance with work order, balance on completion');

            $invoice = [
                'no' => (string) $x['no'],
                'quote_id' => (int) $x['id'],
                'quote_label' => wx_doc_label($x),
                'client' => $x['client'],
                'client_id' => $clientId,
                'project' => (string) ($x['project'] ?? ''),
                'site' => (string) ($x['site'] ?? ''),
                'sections' => $x['sections'],
                'subtotal' => (int) $x['subtotal'],
                'discount' => (int) $x['discount'],
                'rent' => (int) ($x['rent'] ?? 0),
                'taxPct' => $x['taxPct'],
                'tax' => (int) $x['tax'],
                'total' => (int) $x['total'],
                'currency' => 'PKR',
                'issue_date' => date('Y-m-d'),
                'due_date' => date('Y-m-d', time() + 7 * 86400),
                'terms' => (string) ($x['terms'] ?? ''),
                'notes' => '',
                'schedule' => $sched,
                /* v2.1 fields kept for the transition: `payments`/`seqPay` are where the old admin
                   expects the receipt list, and `line` decides the invoice series (see wx_next_doc_no).
                   New receipts live in wx_invoice_payments; `payments` stays empty so the two eras
                   cannot show the same receipt twice. */
                'payments' => [],
                'seqPay' => 0,
                'line' => (string) ($x['line'] ?? ''),
                'po' => '',
                'delivery_date' => '',
                'delivered' => '',
                'mode' => '',
                'track_note' => '',
                'created_by' => (string) $u['name'],
                'created_at' => wx_now(),
            ];
            $invoice = wx_doc_totals($invoice);
            $invoice = wx_doc_put('wx_invoices', $invoice, wx_doc_columns('wx_invoices', $invoice));

            $x['status'] = 'invoiced';
            $x['invoiced_id'] = (int) $invoice['id'];
            $x['history'][] = wx_hist($u, 'Converted to invoice ' . $invoice['no']);
            wx_doc_put('wx_quotes', $x, wx_doc_columns('wx_quotes', $x));

            // The project is opened unless the caller explicitly says not to.
            $projectId = null;
            if (($ctx['body']['project'] ?? true) !== false) {
                $proj = [
                        'name' => $x['project'] ?: ($x['client']['name'] ?? 'Unnamed project'),
                        'client_id' => $clientId,
                        'client_name' => (string) ($x['client']['name'] ?? ''),
                        'quote_id' => (int) $x['id'],
                        'invoice_id' => (int) $invoice['id'],
                        'no' => (string) $x['no'],
                        'site' => (string) ($x['site'] ?? ''),
                        'stage' => 'planning',
                        'start' => date('Y-m-d'),
                        'target' => '',
                        'value' => (int) $x['total'],
                        'manager' => null,
                        'updates' => [wx_hist($u, 'Project opened from ' . wx_doc_label($x))],
                        'photos' => [],
                        'milestones' => [],
                        'line' => (string) ($x['line'] ?? ''),
                        'team' => [],
                        'created_at' => wx_now(),
                ];
                $projectId = wx_insert('wx_projects', [
                    wx_payload_column('wx_projects') => json_encode($proj, JSON_UNESCAPED_UNICODE),
                ] + wx_project_columns($proj));
            }

            wx_audit($u, 'invoice.create', 'invoice:' . $invoice['id'], ['from' => 'quote:' . $id, 'total' => (int) $invoice['total'], 'client' => $clientId]);
            return ['data' => ['invoice' => wx_inv_public($invoice, []), 'quote' => wx_quote_row($x), 'client_id' => $clientId, 'project_id' => $projectId]];
        });
    });
}

/* ------------------------------------------------------------------ templates
 *
 * A template is the shape of a quotation — ten sections of BOQ, the terms the studio always uses — saved
 * once and reused. v2.1 had four actions for them (`tpl_list`, `tpl_save`, `tpl_delete`, `tpl_import`) and
 * the same shape is kept here, with one addition the studio asked the audit for: a template can be saved
 * *from* a quotation, so the good quotation somebody just built becomes the next one's starting point
 * instead of being retyped.
 *
 * Two rules travel with the money path even though a template carries no client: the sections go through the
 * same cleaner a quotation's sections do, and the total is derived, never accepted. A template is what a
 * quotation will be, so it is held to what a quotation is held to.
 */

/** GET /quotations/templates — every template whole, plus what the starter import would add. */
function wx_route_tpl_list(array $ctx): array
{
    wx_require_user('tpl_list');
    $rows = [];
    /* One query, and the payload column is named by the function that knows what it is called on this host
       (`payload` after migration 003, `data` before it) — naming it by hand is how a list works on the
       converted host and throws on the live one. */
    $sql = 'SELECT id, ' . wx_doc_payload_sql('wx_templates') . ' FROM wx_templates ORDER BY name';
    foreach (wx_all($sql) as $r) {
        $t = json_decode((string) $r['payload'], true);
        if (!is_array($t)) {
            /* A template whose JSON will not decode is a corrupted row. Skipping it silently would hide a
               template the studio can see in v2.1, so it is reported by name — it can then be re-saved or
               deleted from the screen rather than being invisible here and present there. */
            $rows[] = ['id' => (int) $r['id'], 'broken' => true, 'name' => '(unreadable row ' . (int) $r['id'] . ')'];
            continue;
        }
        $t['id'] = (int) $r['id'];
        $rows[] = wx_tpl_row($t);
    }

    /* The letterhead travels with the list so a preview draws the document the studio actually sends, not a
       placeholder header. Only the fields a document prints are taken, and `wx_company()` already falls back
       to the shipped defaults on a host where the settings row is missing. */
    $c = wx_company();
    $letter = [];
    foreach (['name', 'tagline', 'address', 'phones', 'email', 'web', 'ntn', 'signName', 'signTitle'] as $k) {
        if (isset($c[$k])) {
            $letter[$k] = (string) $c[$k];
        }
    }

    return ['data' => [
        'templates' => $rows,
        'company' => $letter,
        'kinds' => WX_TPL_KINDS,
        'starter' => wx_tpl_starter_rows(array_column($rows, 'name')),
        'units' => WX_UNITS,
        'itemKinds' => WX_ITEM_KINDS,
    ]];
}

/**
 * POST /quotations/templates — create or update one, by id.
 *
 * Gated: a template is what every future quotation is built from, so saving one is exactly the kind of
 * change that waits for the Master when a Manager makes it. `tpl_save` matches v2.1's write policy.
 */
function wx_route_tpl_save(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself lives in
       wx_route_tpl_save_do() below. */
    return wx_appr_route('tpl_save', $ctx, 'quotations', 'wx_route_tpl_save_do', static fn() => wx_route_tpl_save_do($ctx));
}

function wx_route_tpl_save_do(array $ctx): array
{
    /* v2.1 kept the write to owner/admin even though `tpl_*` sits in the sales group — a sales user reads
       templates, the studio's owner decides what the studio quotes from. */
    $u = wx_require_user('tpl_save', ['owner', 'admin']);
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : (int) ($ctx['body']['id'] ?? 0);

    return wx_guard('tpl.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $old = [];
            if ($id > 0) {
                $old = wx_doc_get('wx_templates', $id, true) ?? [];
                if ($old === []) {
                    throw ApiError::notFound('That template does not exist');
                }
            }
            $t = wx_tpl_clean(is_array($ctx['body']) ? $ctx['body'] : [], $old);
            if (wx_one('SELECT id FROM wx_templates WHERE name = ? AND id <> ?', [$t['name'], $id]) !== null) {
                throw ApiError::conflict('Another template already has that name — ' . $t['name'], 'name');
            }
            $now = wx_now();
            $t = wx_doc_put('wx_templates', array_merge([
                'id' => $id > 0 ? $id : null,
                'created_at' => (string) ($old['created_at'] ?? $now),
                'updated_at' => $now,
            ], $t), ['name' => $t['name']]);
            wx_audit($u, $id > 0 ? 'template.save' : 'template.create', 'template:' . $t['id'], [
                'name' => $t['name'],
                'sections' => count($t['sections']),
            ]);
            return ['data' => ['template' => wx_tpl_row($t), 'created' => $id === 0]];
        });
    });
}

/** DELETE /quotations/templates/{id} — remove one. Quotations made from it are untouched, as in v2.1. */
function wx_route_tpl_delete(array $ctx): array
{
    return wx_appr_route('tpl_delete', $ctx, 'quotations', 'wx_route_tpl_delete_do', static fn() => wx_route_tpl_delete_do($ctx));
}

function wx_route_tpl_delete_do(array $ctx): array
{
    $u = wx_require_user('tpl_delete', ['owner', 'admin']);
    $id = (int) $ctx['params']['id'];

    return wx_guard('tpl.delete', static function () use ($u, $id) {
        return wx_tx(static function () use ($u, $id) {
            $t = wx_doc_get('wx_templates', $id, true);
            if ($t === null) {
                throw ApiError::notFound('That template does not exist');
            }
            /* Deleting a template is not deleting the quotations made from it, and the screen says so before
               it asks. A quotation carries its own sections — that was true in v2.1 and it is the reason a
               template can be replaced without touching a client's document. */
            wx_q('DELETE FROM wx_templates WHERE id = ?', [$id]);
            wx_audit($u, 'template.delete', 'template:' . $id, ['name' => (string) $t['name']]);
            return ['data' => ['deleted' => $id, 'name' => (string) $t['name']]];
        });
    });
}

/**
 * POST /quotations/templates/import — the shipped starter set, or a file the studio exported.
 *
 * Existing names are skipped, never overwritten: the studio's own edit to "Renovation" is a decision, and an
 * import is how the other eight arrive. The reply says which were added, which were skipped and which were
 * refused, because "9 imported" when six were skipped makes the list look wrong the next time it loads.
 */
function wx_route_tpl_import(array $ctx): array
{
    return wx_appr_route('tpl_import', $ctx, 'quotations', 'wx_route_tpl_import_do', static fn() => wx_route_tpl_import_do($ctx));
}

function wx_route_tpl_import_do(array $ctx): array
{
    $u = wx_require_user('tpl_import', ['owner', 'admin']);
    $b = is_array($ctx['body']) ? $ctx['body'] : [];
    $source = !empty($b['starter']) ? 'starter' : 'file';
    $list = $source === 'starter'
        ? wx_tpl_starters()
        : array_slice(array_values(is_array($b['templates'] ?? null) ? $b['templates'] : []), 0, WX_TPL_IMPORT_MAX);
    if (!$list) {
        throw ApiError::validation('There is nothing in that file to import', 'templates');
    }

    return wx_guard('tpl.import', static function () use ($u, $list, $source) {
        return wx_tx(static function () use ($u, $list, $source) {
            $saved = [];
            foreach (wx_all('SELECT name FROM wx_templates') as $r) {
                $saved[(string) $r['name']] = true;
            }
            $added = [];
            $skipped = [];
            $refused = [];
            foreach ($list as $i => $raw) {
                if (!is_array($raw)) {
                    $refused[] = 'row ' . ($i + 1);
                    continue;
                }
                try {
                    $t = $source === 'starter' ? $raw : wx_tpl_clean($raw);
                } catch (ApiError $e) {
                    /* A row the studio's own file got wrong is named by whatever it did have, so the person
                       fixing the export knows which one was left out. */
                    $refused[] = trim((string) ($raw['name'] ?? '')) !== '' ? (string) $raw['name'] : 'row ' . ($i + 1);
                    continue;
                }
                if (isset($saved[$t['name']])) {
                    $skipped[] = $t['name'];
                    continue;
                }
                $now = wx_now();
                wx_doc_put('wx_templates', array_merge(['created_at' => $now, 'updated_at' => $now], $t), ['name' => $t['name']]);
                $saved[$t['name']] = true;
                $added[] = $t['name'];
            }
            wx_audit($u, 'template.import', $source, [
                'imported' => count($added),
                'skipped' => count($skipped),
                'refused' => count($refused),
            ]);
            return ['data' => [
                'source' => $source,
                'imported' => count($added),
                'names' => $added,
                'skipped' => $skipped,
                'refused' => $refused,
            ]];
        });
    });
}
