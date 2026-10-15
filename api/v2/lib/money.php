<?php
/**
 * api/v2/lib/money.php — the one implementation of document arithmetic.
 *
 * This is a **port, not a redesign**, and that is the whole point. In v2.1 the same total was computed
 * in three places — `doc_totals()` in PHP, a mirror in `tools/frontend-v1-admin.mjs`, and again in the
 * print pages — and the audit found screens disagreeing about the same quotation. The port below
 * reproduces `doc_totals()` line for line, including its rounding, so a document created in v2.5 and
 * opened in the v2.1 admin shows the same number. Changing the rounding would be a product decision,
 * not a refactor, so it is not done here.
 *
 * The rules, as v2.1 has them:
 *   · an item's amount is qty x rate, rounded to 2 decimals (line items carry 2dp);
 *   · a section's subtotal is the sum of its item amounts, rounded to 2 decimals;
 *   · `kind` items ('head' and 'spec') are headings or specification text — qty and rate are 0;
 *   · the document subtotal is an integer number of rupees;
 *   · discount is clamped to the subtotal, taxPct to 50, rent is floored at 0;
 *   · tax = (subtotal - discount + rent) x taxPct / 100, rounded to a whole rupee;
 *   · total = subtotal - discount + rent + tax;
 *   · advance is clamped to the total;
 *   · payments are whole rupees and cannot exceed the balance.
 *
 * Money is whole rupees everywhere it is stored — see db/migrations/README.md for why that unit and
 * not paisa.
 */

declare(strict_types=1);

/** The units a line item may be priced in. Same list as SALES_UNITS. */
const WX_UNITS = ['sft', 'rft', 'sqmt', 'nos', 'each', 'set', 'point', 'job', 'lumpsum'];

/** Quotation and invoice statuses. 'approved' is what unlocks invoicing; 'invoiced' is terminal. */
const WX_QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'approved', 'rejected', 'invoiced'];

/** Payment methods v2.1 accepts. */
const WX_PAY_METHODS = ['cash', 'bank', 'cheque', 'online'];

/** The keys a line item may carry. Anything else is dropped rather than stored blind. */
const WX_ITEM_KINDS = ['head', 'spec'];

function wx_r2(float $n): float
{
    return round($n * 100) / 100;
}

/**
 * Clean a section tree from client input. Same limits as v2.1: 40 sections, 300 items each, and a
 * description is required (an item with no description is dropped, not saved empty).
 */
function wx_clean_sections($sections): array
{
    if (!is_array($sections)) {
        return [];
    }
    $out = [];
    foreach (array_slice(array_values($sections), 0, 40) as $si => $s) {
        if (!is_array($s)) {
            continue;
        }
        $items = [];
        $rawItems = is_array($s['items'] ?? null) ? array_slice(array_values($s['items']), 0, 300) : [];
        foreach ($rawItems as $ii => $it) {
            if (!is_array($it)) {
                continue;
            }
            $kind = in_array($it['kind'] ?? '', WX_ITEM_KINDS, true) ? (string) $it['kind'] : '';
            $field = 'sections.' . $si . '.items.' . $ii . '.desc';
            // Headings and specification lines carry long text and no numbers.
            $desc = $kind === 'spec'
                ? wx_v_string($it['desc'] ?? '', $field, 1, 2000)
                : wx_v_string($it['desc'] ?? '', $field, 1, 600);
            $qty = $kind ? 0.0 : wx_numv($it['qty'] ?? 0);
            $rate = $kind ? 0.0 : wx_numv($it['rate'] ?? 0);
            $unit = strtolower((string) ($it['unit'] ?? ''));
            $items[] = [
                'desc' => $desc,
                'qty' => $qty,
                'unit' => in_array($unit, WX_UNITS, true) ? $unit : 'job',
                'rate' => $rate,
                'amount' => $kind ? 0.0 : wx_r2($qty * $rate),
                'kind' => $kind,
                'code' => wx_v_opt_string($it['code'] ?? '', 'sections.' . $si . '.items.' . $ii . '.code', 12) ?? '',
            ];
        }
        $out[] = [
            'name' => (wx_v_opt_string($s['name'] ?? '', 'sections.' . $si . '.name', 80) ?? '') ?: 'Section',
            'note' => wx_v_opt_string($s['note'] ?? '', 'sections.' . $si . '.note', 600) ?? '',
            'area' => wx_numv($s['area'] ?? 0),
            'items' => $items,
        ];
    }
    return $out;
}

/** v2.1's numv(): a non-negative finite float, or 0. A negative quantity is a typo, not a credit. */
function wx_numv($v): float
{
    $n = is_numeric($v) ? (float) $v : 0.0;
    return (is_finite($n) && $n >= 0) ? $n : 0.0;
}

/**
 * Compute the totals of a document in place. Identical to v2.1's doc_totals(), key for key.
 *
 * @param array $d a document payload (sections, discount, taxPct, rent, advance)
 * @return array the same payload with section subtotals and the document totals filled in
 */
function wx_doc_totals(array $d): array
{
    if (!isset($d['sections']) || !is_array($d['sections'])) {
        $d['sections'] = [];
    }
    $sub = 0.0;
    foreach ($d['sections'] as $i => $s) {
        $items = is_array($s['items'] ?? null) ? $s['items'] : [];
        $items = array_map(static function ($it) {
            $kind = $it['kind'] ?? '';
            $it['amount'] = $kind ? 0.0 : wx_r2(wx_numv($it['qty'] ?? 0) * wx_numv($it['rate'] ?? 0));
            return $it;
        }, $items);
        $sectionSub = wx_r2((float) array_sum(array_column($items, 'amount')));
        $d['sections'][$i]['items'] = $items;
        $d['sections'][$i]['subtotal'] = $sectionSub;
        $sub += $sectionSub;
    }
    $d['subtotal'] = (int) round($sub);
    $d['discount'] = (int) min(round(wx_numv($d['discount'] ?? 0)), $d['subtotal']);
    $d['taxPct'] = min(wx_numv($d['taxPct'] ?? 0), 50);
    $d['rent'] = max(0, (int) round(wx_numv($d['rent'] ?? 0)));
    $d['tax'] = (int) round(($d['subtotal'] - $d['discount'] + $d['rent']) * $d['taxPct'] / 100);
    $d['total'] = $d['subtotal'] - $d['discount'] + $d['rent'] + $d['tax'];
    $d['advance'] = min(max(0, (int) round(wx_numv($d['advance'] ?? 0))), $d['total']);
    return $d;
}

/**
 * A quotation's public label: "WI-10123 · V2 · Option A" — the same string v2.1 prints on the
 * document and in the approval queue, so a person can match the two.
 */
function wx_doc_label(array $x): string
{
    return (string) $x['no']
        . ((int) ($x['version'] ?? 0) > 1 ? ' · V' . (int) $x['version'] : '')
        . (!empty($x['option']) ? ' · ' . (string) $x['option'] : '');
}

/**
 * The secure client link for a quotation. v2.1 computes this as an HMAC of id + number with the
 * application secret, so it is stateless and cannot be guessed — kept identical here, because the
 * links already in clients' inboxes must keep working.
 */
function wx_quote_view_token(array $x): string
{
    return substr(hash_hmac('sha256', 'qv|' . $x['id'] . '|' . $x['no'], wx_secret()), 0, 32);
}

/** A quotation as the API returns it: payload plus derived money, never a raw JSON blob. */
function wx_quote_public(array $x): array
{
    $x = wx_doc_totals($x);
    $x['id'] = (int) $x['id'];
    $x['label'] = wx_doc_label($x);
    $x['totalDisplay'] = wx_pkr_out((int) $x['total']);
    return $x;
}

/**
 * An invoice with its payment position derived from the payments table.
 *
 * v2.1 kept `payments[]` inside the invoice JSON and recomputed paid/balance on every read. The rows
 * now live in wx_invoice_payments (migration 006) so a receipt is a record rather than a nested array,
 * but the derived fields are the same five, named the same, because the v2.1 screens and the printed
 * documents read them.
 *
 * @param array $invoice  the invoice payload
 * @param array $payments rows from wx_invoice_payments, amount in whole rupees
 */
function wx_inv_public(array $invoice, array $payments = []): array
{
    /* The stored total is used as it is, as v2.1's inv_pub() did. Recomputing it here would be
       tempting, but an invoice is a document that has already been sent: if its stored total and its
       line items ever disagree, the sent figure is the one the client was told, and a list view is not
       the place to silently correct it. Only an invoice with no stored total is computed from its
       sections (a document written by v2.1 before totals were denormalised). */
    if (!isset($invoice['total'])) {
        $invoice = wx_doc_totals($invoice);
    }
    $paid = 0;
    foreach ($payments as $p) {
        $paid += (int) $p['amount'];
    }
    $total = (int) $invoice['total'];
    $invoice['id'] = (int) $invoice['id'];
    $invoice['payments'] = array_values($payments);
    $invoice['paid'] = $paid;
    $invoice['balance'] = max(0, $total - $paid);
    $invoice['payStatus'] = $paid <= 0 ? 'unpaid' : ($paid >= $total ? 'paid' : 'partial');
    $due = (string) ($invoice['due_date'] ?? '');
    $invoice['overdue'] = $paid < $total && $due !== '' && $due < date('Y-m-d');
    /* The tracker's own vocabulary, kept because the v2.1 tracker screen and the client link read it:
       `after_delivery` marks an invoice that is only payable once the goods have arrived, and `late`
       flags a delivery date that has passed with nothing delivered. Neither is derivable from paid. */
    $invoice['track'] = $total > 0 && $paid >= $total
        ? 'paid'
        : (((string) ($invoice['mode'] ?? '') === 'after_delivery' && empty($invoice['delivered'])) ? 'after_delivery' : ($paid > 0 ? 'partial' : 'unpaid'));
    $invoice['late'] = !empty($invoice['delivery_date']) && empty($invoice['delivered']) && (string) $invoice['delivery_date'] < date('Y-m-d');
    foreach (['po', 'delivery_date', 'line', 'mode', 'track_note'] as $k) {
        $invoice[$k] = (string) ($invoice[$k] ?? '');
    }
    $invoice['seqPay'] = (int) ($invoice['seqPay'] ?? count($payments));
    $invoice['totalDisplay'] = wx_pkr_out($total);
    $invoice['paidDisplay'] = wx_pkr_out($paid);
    $invoice['balanceDisplay'] = wx_pkr_out((int) $invoice['balance']);
    return $invoice;
}

/** Load the payments of one invoice, oldest first, as the receipt list a person reads. */
function wx_invoice_payments(int $invoiceId): array
{
    if (!wx_table_exists('wx_invoice_payments')) {
        // Before migration 006 a payment may still be inside the invoice payload; the caller merges
        // those, so an unmigrated install does not lose receipts.
        return [];
    }
    $rows = wx_all(
        'SELECT id, rcpt, paid_on, amount, method, ref, note, created_by, created_at
         FROM wx_invoice_payments WHERE invoice_id = ? AND reversed_at IS NULL ORDER BY id ASC',
        [$invoiceId]
    );
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => (int) $r['id'],
            'rcpt' => (string) $r['rcpt'],
            'date' => (string) $r['paid_on'],
            'amount' => (int) $r['amount'],
            'amountDisplay' => wx_pkr_out((int) $r['amount']),
            'method' => (string) $r['method'],
            'ref' => (string) ($r['ref'] ?? ''),
            'note' => (string) ($r['note'] ?? ''),
            'by' => (string) ($r['created_by'] ?? ''),
            't' => (string) ($r['created_at'] ?? ''),
        ];
    }
    return $out;
}

/** Payments recorded inside the JSON payload by v2.1, so both eras can be shown side by side. */
function wx_invoice_payments_legacy(array $payload): array
{
    $out = [];
    foreach ((array) ($payload['payments'] ?? []) as $p) {
        if (!is_array($p)) {
            continue;
        }
        $out[] = [
            'id' => (int) ($p['id'] ?? 0),
            'rcpt' => (string) ($p['rcpt'] ?? ''),
            'date' => (string) ($p['date'] ?? ''),
            'amount' => (int) ($p['amount'] ?? 0),
            'amountDisplay' => wx_pkr_out((int) ($p['amount'] ?? 0)),
            'method' => (string) ($p['method'] ?? ''),
            'ref' => (string) ($p['ref'] ?? ''),
            'note' => (string) ($p['note'] ?? ''),
            'by' => (string) ($p['by'] ?? ''),
            't' => (string) ($p['t'] ?? ''),
            'legacy' => true,
        ];
    }
    return $out;
}

/**
 * A business-wide money summary, for the dashboard. One pass over each table, not a loop per row.
 */
function wx_money_summary(): array
{
    $receivable = 0;
    $invoiced = 0;
    $received = 0;
    $overdue = 0;
    if (wx_table_exists('wx_invoices')) {
        $rows = wx_all('SELECT id, ' . wx_doc_payload_sql('wx_invoices') . ' FROM wx_invoices');
        $paidByInvoice = [];
        if (wx_table_exists('wx_invoice_payments')) {
            foreach (wx_all('SELECT invoice_id, COALESCE(SUM(amount),0) AS paid FROM wx_invoice_payments GROUP BY invoice_id') as $r) {
                $paidByInvoice[(int) $r['invoice_id']] = (int) $r['paid'];
            }
        }
        foreach ($rows as $row) {
            $payload = json_decode((string) $row['payload'], true);
            if (!is_array($payload)) {
                continue;
            }
            $id = (int) $row['id'];
            $paid = $paidByInvoice[$id] ?? 0;
            if (!isset($paidByInvoice[$id])) {
                foreach (wx_invoice_payments_legacy($payload) as $p) {
                    $paid += (int) $p['amount'];
                }
            }
            $total = (int) ($payload['total'] ?? 0);
            $invoiced += $total;
            $received += $paid;
            $balance = max(0, $total - $paid);
            $receivable += $balance;
            $due = (string) ($payload['due_date'] ?? '');
            if ($balance > 0 && $due !== '' && $due < date('Y-m-d')) {
                $overdue += $balance;
            }
        }
    }
    return [
        'invoiced' => $invoiced,
        'received' => $received,
        'receivable' => $receivable,
        'overdue' => $overdue,
        'invoicedDisplay' => wx_pkr_out($invoiced),
        'receivedDisplay' => wx_pkr_out($received),
        'receivableDisplay' => wx_pkr_out($receivable),
        'overdueDisplay' => wx_pkr_out($overdue),
    ];
}
