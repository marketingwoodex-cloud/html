<?php
/**
 * api/v2/routes/invoices.php — the invoice, its receipts, and what is still owed.
 *
 * Every figure on this screen is derived, never stored: paid, balance, payStatus and overdue come from
 * wx_inv_public() reading the payments rows. That is deliberate — v2.1 recomputed them the same way
 * from its embedded array, and the audit's worst money finding was a *stored* total that had drifted
 * from its parts. A derived figure cannot drift.
 *
 * Receipt numbers are `{invoice no}-R{n}`, continuing from the highest number already used, so a
 * receipt printed before this rewrite keeps its number.
 */

declare(strict_types=1);

/** One row for the tracker grid: no sections, position derived from the payments table in one query. */
function wx_route_invoices_list(array $ctx): array
{
    wx_require_user('invs_list');
    $limit = wx_limit($ctx['query']['limit'] ?? 100);
    $offset = wx_offset($ctx['query']['offset'] ?? 0);
    $page = wx_doc_page('wx_invoices', [
        'status' => $ctx['query']['status'] ?? null,
        'client_id' => $ctx['query']['client_id'] ?? null,
        'q' => $ctx['query']['q'] ?? null,
    ], $limit, $offset, 'id DESC');

    $rows = [];
    $buckets = ['unpaid' => 0, 'partial' => 0, 'paid' => 0, 'overdue' => 0];
    foreach ($page['rows'] as $inv) {
        $public = wx_inv_public($inv, wx_invoice_payments((int) $inv['id']));
        $buckets[$public['payStatus']]++;
        if ($public['overdue']) {
            $buckets['overdue']++;
        }
        $rows[] = [
            'id' => $public['id'],
            'no' => $public['no'],
            'quote_id' => (int) ($public['quote_id'] ?? 0),
            'client' => $public['client']['name'] ?? '',
            'client_id' => (int) ($public['client_id'] ?? 0),
            'project' => (string) ($public['project'] ?? ''),
            'issue_date' => (string) ($public['issue_date'] ?? ''),
            'due_date' => (string) ($public['due_date'] ?? ''),
            'total' => (int) $public['total'],
            'paid' => (int) $public['paid'],
            'balance' => (int) $public['balance'],
            'payStatus' => $public['payStatus'],
            'track' => $public['track'],
            'late' => $public['late'],
            'line' => $public['line'],
            'overdue' => $public['overdue'],
            'daysOverdue' => $public['overdue'] ? (int) floor((time() - strtotime((string) $public['due_date'])) / 86400) : 0,
            'totalDisplay' => $public['totalDisplay'],
            'paidDisplay' => $public['paidDisplay'],
            'balanceDisplay' => $public['balanceDisplay'],
        ];
    }
    return ['data' => ['invoices' => $rows, 'total' => $page['total'], 'limit' => $limit, 'offset' => $offset, 'buckets' => $buckets, 'money' => wx_money_summary()]];
}

function wx_route_invoices_get(array $ctx): array
{
    wx_require_user('inv_get');
    $inv = wx_doc_get('wx_invoices', (int) $ctx['params']['id']);
    if ($inv === null) {
        throw ApiError::notFound('That invoice does not exist');
    }
    // Rows first; a receipt recorded before migration 006 is still inside the payload, so both eras
    // are shown and the person reconciling sees every payment that was actually taken.
    $payments = wx_invoice_payments((int) $inv['id']);
    if (!$payments) {
        $payments = wx_invoice_payments_legacy($inv);
    }
    $public = wx_inv_public($inv, $payments);
    $public['company'] = wx_company();
    $public['methods'] = WX_PAY_METHODS;
    return ['data' => ['invoice' => $public]];
}

/** Edit an invoice. Same rule as a quotation: the totals are recomputed, never trusted. */
function wx_route_invoices_save(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_invoices_save_do() below. */
    return wx_appr_route('inv_save', $ctx, 'invoices', 'wx_route_invoices_save_do', static fn() => wx_route_invoices_save_do($ctx));
}

function wx_route_invoices_save_do(array $ctx): array
{
    $u = wx_require_user('inv_save');
    $id = (int) $ctx['params']['id'];

    return wx_guard('invoices.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $inv = wx_doc_get('wx_invoices', $id, true);
            if ($inv === null) {
                throw ApiError::notFound('That invoice does not exist');
            }
            $b = $ctx['body'];
            foreach (['project' => 190, 'site' => 300, 'terms' => 3000, 'notes' => 3000, 'schedule' => 600, 'po' => 80, 'track_note' => 300] as $k => $max) {
                if (array_key_exists($k, $b)) {
                    $inv[$k] = wx_v_opt_string($b[$k], $k, $max) ?? '';
                }
            }
            /* The tracker's own fields (v2.1's inv_track):
               `line` decides the invoice series and is chosen from the three business lines;
               `mode` after_delivery makes the invoice payable on delivery rather than on issue;
               `delivered` is the date the goods arrived, and is what clears the late-delivery flag. */
            if (array_key_exists('line', $b)) {
                $inv['line'] = wx_v_enum((string) $b['line'], ['', 'furniture', 'interior', 'project'], 'line');
            }
            if (array_key_exists('mode', $b)) {
                $inv['mode'] = wx_v_enum((string) $b['mode'], ['', 'after_delivery'], 'mode');
            }
            if (array_key_exists('delivery_date', $b)) {
                $inv['delivery_date'] = wx_v_opt_date($b['delivery_date'], 'delivery_date') ?? '';
            }
            if (array_key_exists('delivered', $b)) {
                $inv['delivered'] = wx_v_opt_date($b['delivered'], 'delivered') ?? '';
            }
            if (array_key_exists('sections', $b)) {
                $inv['sections'] = wx_clean_sections($b['sections']);
            }
            if (array_key_exists('discount', $b)) {
                $inv['discount'] = wx_v_pkr($b['discount'], 'discount', 0);
            }
            if (array_key_exists('rent', $b)) {
                $inv['rent'] = wx_v_pkr($b['rent'], 'rent', 0);
            }
            if (array_key_exists('taxPct', $b)) {
                $inv['taxPct'] = min(50.0, wx_numv($b['taxPct']));
            }
            if (array_key_exists('due_date', $b)) {
                $inv['due_date'] = wx_v_date($b['due_date'], 'due_date');
            }
            if (isset($b['client']) && is_array($b['client'])) {
                foreach (['name' => 120, 'phone' => 40, 'email' => 190, 'address' => 300, 'company' => 120] as $k => $max) {
                    if (array_key_exists($k, $b['client'])) {
                        $inv['client'][$k] = $k === 'email' && $b['client'][$k] !== '' && $b['client'][$k] !== null
                            ? wx_v_email($b['client'][$k], 'client.email')
                            : (wx_v_opt_string($b['client'][$k], 'client.' . $k, $max) ?? '');
                    }
                }
            }

            $inv = wx_doc_totals($inv);
            // The indexed `paid` column must agree with the receipts; recompute it rather than copy it.
            $payments = wx_invoice_payments($id) ?: wx_invoice_payments_legacy($inv);
            $paid = 0;
            foreach ($payments as $p) {
                $paid += (int) $p['amount'];
            }
            if ($paid > (int) $inv['total']) {
                throw ApiError::conflict('Payments (' . wx_pkr_out($paid) . ') already exceed this invoice total (' . wx_pkr_out((int) $inv['total']) . ')');
            }
            $inv['paid'] = $paid;
            $inv = wx_doc_put('wx_invoices', $inv, wx_doc_columns('wx_invoices', $inv));
            wx_audit($u, 'invoice.save', 'invoice:' . $id, ['total' => (int) $inv['total'], 'paid' => $paid]);
            return ['data' => ['invoice' => wx_inv_public($inv, $payments)]];
        });
    });
}

/**
 * wx_route_invoices_delete - held for the Master when the policy says this actor's change must wait.
 *
 * The change itself is wx_route_invoices_delete_do() below: the same code runs whether the actor was allowed
 * to act directly or a Master approved the replay afterwards, so the two paths cannot diverge.
 */
function wx_route_invoices_delete(array $ctx): array
{
    wx_require_user('inv_save');
    $no = (string) (wx_val("SELECT no FROM wx_invoices WHERE id = ?", [(int) $ctx['params']['id']]) ?? '');
    $summary = 'Delete invoice' . ($no !== '' ? ' ' . $no : '');
    return wx_appr_wrap('invoice_delete', 'invoices', 'wx_route_invoices_delete_do', $ctx, $summary, static fn() => wx_route_invoices_delete_do($ctx));
}

/**
 * Delete an invoice, but never one that has taken money.
 *
 * The Master only. v2.1 has no action for deleting an invoice, and the capability tables are
 * generated from v2.1's own role rules — inventing a permission key that no group covers would mean
 * "anyone signed in may do it", which is exactly how a permission system rots. So this route reuses a
 * real key (`inv_save`) and adds the check that matters: the capability tables cannot express "documents
 * that may already be in a client's hands", and only the Master should be able to discard one.
 */
function wx_route_invoices_delete_do(array $ctx): array
{
    $u = wx_require_user('inv_save');
    if (!wx_is_master($u)) {
        throw ApiError::forbidden('Only the Master can delete an invoice');
    }
    $id = (int) $ctx['params']['id'];
    $inv = wx_doc_get('wx_invoices', $id);
    if ($inv === null) {
        throw ApiError::notFound('That invoice does not exist');
    }
    $payments = wx_invoice_payments($id) ?: wx_invoice_payments_legacy($inv);
    if ($payments) {
        throw ApiError::conflict('That invoice has ' . count($payments) . ' payment(s) recorded; reverse them first');
    }
    wx_q('DELETE FROM wx_invoices WHERE id = ?', [$id]);
    wx_audit($u, 'invoice.delete', 'invoice:' . $id, ['no' => $inv['no'], 'total' => (int) ($inv['total'] ?? 0)]);
    return ['data' => ['id' => $id, 'deleted' => true]];
}

/** A printable invoice summary: the numbers a person reads aloud, and the per-method split. */
function wx_route_invoices_summary(array $ctx): array
{
    wx_require_user('invs_tracker');
    $rows = wx_all('SELECT id, ' . wx_doc_payload_sql('wx_invoices') . ' FROM wx_invoices');
    $byClient = [];
    $byMonth = [];
    foreach ($rows as $row) {
        $inv = json_decode((string) $row['payload'], true);
        if (!is_array($inv)) {
            continue;
        }
        $id = (int) $row['id'];
        $payments = wx_invoice_payments($id) ?: wx_invoice_payments_legacy($inv);
        $public = wx_inv_public($inv + ['id' => $id], $payments);
        $name = (string) ($public['client']['name'] ?? '—');
        $byClient[$name] ??= ['client' => $name, 'invoiced' => 0, 'paid' => 0, 'balance' => 0, 'count' => 0];
        $byClient[$name]['invoiced'] += (int) $public['total'];
        $byClient[$name]['paid'] += (int) $public['paid'];
        $byClient[$name]['balance'] += (int) $public['balance'];
        $byClient[$name]['count']++;
        foreach ($payments as $p) {
            $m = substr((string) $p['date'], 0, 7);
            $byMonth[$m] ??= ['month' => $m, 'received' => 0];
            $byMonth[$m]['received'] += (int) $p['amount'];
        }
    }
    usort($byClient, static fn($a, $b) => $b['balance'] <=> $a['balance']);
    ksort($byMonth);
    return ['data' => ['money' => wx_money_summary(), 'byClient' => array_values($byClient), 'byMonth' => array_values($byMonth)]];
}

/**
 * wx_route_invoices_pay - held for the Master when the policy says this actor's change must wait.
 *
 * The change itself is wx_route_invoices_pay_do() below: the same code runs whether the actor was allowed
 * to act directly or a Master approved the replay afterwards, so the two paths cannot diverge.
 */
function wx_route_invoices_pay(array $ctx): array
{
    wx_require_user('pay_add');
    $no = (string) (wx_val("SELECT no FROM wx_invoices WHERE id = ?", [(int) $ctx['params']['id']]) ?? '');
    $summary = 'Record a payment on' . ($no !== '' ? ' ' . $no : '');
    return wx_appr_wrap('pay_add', 'invoices', 'wx_route_invoices_pay_do', $ctx, $summary, static fn() => wx_route_invoices_pay_do($ctx));
}

/**
 * Record a payment.
 *
 * The two rules v2.1 enforced are kept, because they are the difference between a ledger and a guess:
 * an amount of zero is not a payment, and an amount above the balance is a typo — so the message names
 * the balance ("Amount is more than the balance (PKR 45,000)") rather than accepting it and letting the
 * invoice go negative on screen.
 *
 * The receipt number continues the invoice's sequence. It is computed inside the transaction while the
 * invoice row is locked, so two clerks taking two payments at once cannot both write `-R1`.
 */
function wx_route_invoices_pay_do(array $ctx): array
{
    $u = wx_require_user('pay_add');
    $id = (int) $ctx['params']['id'];

    return wx_guard('invoices.pay', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $inv = wx_doc_get('wx_invoices', $id, true);
            if ($inv === null) {
                throw ApiError::notFound('That invoice does not exist');
            }
            $b = $ctx['body'];
            $amount = wx_v_pkr($b['amount'] ?? 0, 'amount', null, null);
            if ($amount === 0) {
                throw ApiError::validation('Enter the amount you received', 'amount');
            }
            $payments = wx_invoice_payments($id);
            $legacy = !$payments;
            if ($legacy) {
                $payments = wx_invoice_payments_legacy($inv);
            }
            $paid = 0;
            foreach ($payments as $p) {
                $paid += (int) $p['amount'];
            }
            $total = (int) ($inv['total'] ?? 0);
            $balance = max(0, $total - $paid);
            if ($amount > $balance) {
                throw ApiError::validation('Amount is more than the balance (PKR ' . wx_pkr_out($balance) . ')', 'amount');
            }

            $method = wx_v_enum($b['method'] ?? 'bank', WX_PAY_METHODS, 'method');
            $paidOn = array_key_exists('date', $b) ? wx_v_date($b['date'], 'date') : date('Y-m-d');
            $ref = wx_v_opt_string($b['ref'] ?? null, 'ref', 80) ?? '';
            $note = wx_v_opt_string($b['note'] ?? null, 'note', 300) ?? '';

            /* Next receipt number, chosen while this invoice row is locked.
               v2.1 numbered receipts by `count($payments) + 1`, which **reissues a number after a
               reversal**: R1, R2, undo R2, take another payment and it is R2 again — two different
               payments, one receipt number, on the document a client keeps. The invoice already stores
               a monotonic counter (`seqPay`) used as the payment id, so that is used for the receipt
               number too. Existing receipts keep their numbers; a reversed payment leaves a visible
               gap, which is the honest way to show that something was undone. */
            $no = (string) $inv['no'];
            $seq = (int) ($inv['seqPay'] ?? 0) + 1;
            $rcpt = $no . '-R' . $seq;

            if ($legacy) {
                // First payment on an invoice that still carries its v2.1 array: move the old receipts
                // into the table first, so the ledger is one thing from here on.
                foreach ($payments as $p) {
                    if (!empty($p['legacy']) && !empty($p['rcpt'])) {
                        wx_insert('wx_invoice_payments', [
                            'invoice_id' => $id,
                            'no' => $no,
                            'rcpt' => (string) $p['rcpt'],
                            'paid_on' => (string) $p['date'] ?: $paidOn,
                            'amount' => (int) $p['amount'],
                            'method' => in_array($p['method'], WX_PAY_METHODS, true) ? (string) $p['method'] : 'bank',
                            'ref' => substr((string) $p['ref'], 0, 80),
                            'note' => substr((string) $p['note'], 0, 300),
                            'created_by' => substr((string) $p['by'], 0, 120),
                            'created_at' => (string) $p['t'] ?: wx_now(),
                        ]);
                    }
                }
            }

            /* Attribution: normally the signed-in user, but on an approved replay it is the person who
               asked for the payment (see wx_actor). The Master's approval is recorded on the queue item
               and in the audit trail, and the receipt says who actually took the money. */
            $actor = wx_actor();
            $row = [
                'invoice_id' => $id,
                'no' => $no,
                'rcpt' => $rcpt,
                'paid_on' => $paidOn,
                'amount' => $amount,
                'method' => $method,
                'ref' => $ref,
                'note' => $note,
                'created_by' => (string) ($actor['name'] ?? ''),
                'created_by_id' => isset($actor['id']) && $actor['id'] !== null ? (int) $actor['id'] : null,
                'created_at' => wx_now(),
            ];
            $paymentId = wx_insert('wx_invoice_payments', $row);
            $row['id'] = $paymentId;

            // Denormalised `paid` on the invoice, kept in step inside the same transaction.
            $newPaid = $paid + $amount;
            $inv['paid'] = $newPaid;
            $inv['seqPay'] = $seq;
            $inv['payments'] = [];
            $inv = wx_doc_put('wx_invoices', $inv, wx_doc_columns('wx_invoices', $inv));

            // The project sees the money too — v2.1 logged it against the job.
            $pid = (int) wx_val('SELECT id FROM wx_projects WHERE ' . wx_doc_json('wx_projects', '$.invoice_id', false) . ' = ? LIMIT 1', [$id]) ?: 0;
            if ($pid) {
                wx_audit($u, 'payment.project', 'project:' . $pid, ['invoice' => $id, 'amount' => $amount]);
            }
            wx_audit($u, 'payment.add', 'invoice:' . $id, ['rcpt' => $rcpt, 'amount' => $amount, 'method' => $method, 'balance' => $balance - $amount]);

            $public = wx_inv_public($inv, wx_invoice_payments($id));
            return ['data' => ['payment' => ['id' => $paymentId, 'rcpt' => $rcpt, 'amount' => $amount, 'amountDisplay' => wx_pkr_out($amount), 'method' => $method, 'date' => $paidOn], 'invoice' => $public]];
        });
    });
}

/**
 * wx_route_invoices_pay_delete - held for the Master when the policy says this actor's change must wait.
 *
 * The change itself is wx_route_invoices_pay_delete_do() below: the same code runs whether the actor was allowed
 * to act directly or a Master approved the replay afterwards, so the two paths cannot diverge.
 */
function wx_route_invoices_pay_delete(array $ctx): array
{
    wx_require_user('pay_delete');
    $no = (string) (wx_val("SELECT no FROM wx_invoices WHERE id = ?", [(int) $ctx['params']['id']]) ?? '');
    $summary = 'Reverse a payment on' . ($no !== '' ? ' ' . $no : '');
    return wx_appr_wrap('pay_delete', 'invoices', 'wx_route_invoices_pay_delete_do', $ctx, $summary, static fn() => wx_route_invoices_pay_delete_do($ctx));
}

/**
 * Reverse a payment. Money taken in error has to be correctable, but never silently: the row stays,
 * marked reversed, and the audit event records who reversed it and why.
 */
function wx_route_invoices_pay_delete_do(array $ctx): array
{
    $u = wx_require_user('pay_delete');
    $id = (int) $ctx['params']['id'];
    $paymentId = (int) $ctx['params']['payment'];

    return wx_guard('invoices.pay_delete', static function () use ($ctx, $u, $id, $paymentId) {
        return wx_tx(static function () use ($ctx, $u, $id, $paymentId) {
            $row = wx_one('SELECT * FROM wx_invoice_payments WHERE id = ? AND invoice_id = ?', [$paymentId, $id]);
            if ($row === null) {
                throw ApiError::notFound('That payment does not exist on this invoice');
            }
            if ($row['reversed_at'] !== null) {
                throw ApiError::conflict('That payment was already reversed');
            }
            $reason = wx_v_opt_string($ctx['body']['reason'] ?? null, 'reason', 300) ?? '';

            wx_update('wx_invoice_payments', ['reversed_at' => wx_now(), 'reversed_by' => (int) $u['id']], ['id' => $paymentId]);

            $inv = wx_doc_get('wx_invoices', $id, true);
            if ($inv === null) {
                throw ApiError::notFound('That invoice does not exist');
            }
            $inv['paid'] = (int) wx_val('SELECT COALESCE(SUM(amount),0) FROM wx_invoice_payments WHERE invoice_id = ? AND reversed_at IS NULL', [$id]);
            $inv = wx_doc_put('wx_invoices', $inv, wx_doc_columns('wx_invoices', $inv));
            wx_audit($u, 'payment.delete', 'invoice:' . $id, ['rcpt' => (string) $row['rcpt'], 'amount' => (int) $row['amount'], 'reason' => $reason]);

            return ['data' => ['reversed' => $paymentId, 'invoice' => wx_inv_public($inv, wx_invoice_payments($id))]];
        });
    });
}

/** The receipts of one day, for the cash book. */
function wx_route_payments_list(array $ctx): array
{
    wx_require_user('invs_tracker');
    $from = wx_v_opt_date($ctx['query']['from'] ?? null, 'from') ?? date('Y-m-01');
    $to = wx_v_opt_date($ctx['query']['to'] ?? null, 'to') ?? date('Y-m-d');
    $rows = wx_all(
        'SELECT p.*, ' . wx_doc_payload_sql('wx_invoices', 'i', 'invoice_payload') . ' FROM wx_invoice_payments p
         LEFT JOIN wx_invoices i ON i.id = p.invoice_id
         WHERE p.paid_on BETWEEN ? AND ? AND p.reversed_at IS NULL
         ORDER BY p.paid_on DESC, p.id DESC LIMIT 500',
        [$from, $to]
    );
    $out = [];
    $total = 0;
    $byMethod = [];
    foreach ($rows as $r) {
        $payload = json_decode((string) ($r['invoice_payload'] ?? ''), true);
        $total += (int) $r['amount'];
        $byMethod[(string) $r['method']] = ($byMethod[(string) $r['method']] ?? 0) + (int) $r['amount'];
        $out[] = [
            'id' => (int) $r['id'],
            'invoice_id' => (int) $r['invoice_id'],
            'no' => (string) $r['no'],
            'rcpt' => (string) $r['rcpt'],
            'date' => (string) $r['paid_on'],
            'amount' => (int) $r['amount'],
            'amountDisplay' => wx_pkr_out((int) $r['amount']),
            'method' => (string) $r['method'],
            'ref' => (string) ($r['ref'] ?? ''),
            'note' => (string) ($r['note'] ?? ''),
            'by' => (string) ($r['created_by'] ?? ''),
            'client' => is_array($payload) ? (string) ($payload['client']['name'] ?? '') : '',
        ];
    }
    return ['data' => ['payments' => $out, 'from' => $from, 'to' => $to, 'total' => $total, 'totalDisplay' => wx_pkr_out($total), 'byMethod' => $byMethod, 'count' => count($out)]];
}
