<?php
/**
 * tests/money-path.php — the Phase 2 gate, executed.
 *
 * The plan's gate is: "a lead can be created on the website, appear in the inbox, be quoted, approved,
 * invoiced and paid without touching the v2.1 admin. Money totals match the server."
 *
 * tests/conformance.mjs checks the structure of that sentence and tests/run.php checks the parts in
 * isolation. This file drives the whole chain through the front controller, in order, and asserts the
 * numbers at every step — including the ones nobody looks at until a client disagrees:
 *
 *    1. sign in as the Master                        → cookie + CSRF
 *    2. POST /leads                                  → the enquiry is in the inbox
 *    3. POST /quotations                             → a quotation with sections; the **server** computes
 *                                                      subtotal, tax and total, ignoring the client's
 *    4. POST /quotations/{id}/status (illegal)       → refused: a draft cannot be invoiced
 *    5. POST /quotations/{id}/status → sent → approved → the status flow
 *    6. POST /quotations/{id}/invoice                → an invoice, a client and a project
 *    7. POST /quotations/{id}/invoice (again)        → refused: no client is billed twice
 *    8. POST /invoices/{id}/payments  (part)         → paid / balance / partial, receipt -R1
 *    9. POST /invoices/{id}/payments  (too much)     → refused, naming the balance
 *   10. POST /invoices/{id}/payments  (the rest)     → paid, balance 0, receipt -R2
 *   11. DELETE /invoices/{id}/payments/2             → the reversal reopens the balance
 *   12. POST /invoices/{id}/payments  (again)        → receipt -R3, never a reissued -R2
 *   13. GET  /invoices + /payments                   → the ledger agrees with the documents
 *   14. a Manager's payment                         → held for the Master, not applied
 *   15. the Master approves                         → the same request replays and lands
 *   16. the Master rejects another                  → refused with the note, nothing applied
 *
 * Needs PHP + MySQL (_private/db.json). Without a database it reports SKIP and exits 0, so it can sit
 * in a pipeline that also runs on machines without one.
 *
 *   php tests/money-path.php
 *   php tests/money-path.php --keep      leave the fixture rows behind for inspection
 */

declare(strict_types=1);

if (!in_array(PHP_SAPI, ['cli', 'phpdbg', 'wasm'], true)) {
    http_response_code(403);
    echo "tests/money-path.php runs from the command line only.\n";
    exit(1);
}

define('WX_RESPOND_CAPTURE', true);

require_once dirname(__DIR__) . '/api/v2/lib/bootstrap.php';
require_once __DIR__ . '/harness.php';
$passed = 0;
$failed = 0;

$KEEP = in_array('--keep', $argv, true);
$created = ['users' => [], 'lead' => null, 'quote' => null, 'invoice' => null, 'client' => null, 'project' => null, 'approval' => null];

echo "\n  Woodex api/v2 — Phase 2 money path\n";

/* ------------------------------------------------------------------ can we run? */
if (!is_file(WX_DB_FILE)) {
    echo "\n  SKIP: no _private/db.json, so there is no database to run the money path through.\n";
    echo "        Run this on the host or in CI where MySQL is available.\n\n";
    exit(0);
}
try {
    wx_db();
} catch (Throwable $e) {
    echo "\n  SKIP: the database is unreachable (" . $e->getMessage() . ").\n\n";
    exit(0);
}
foreach (['wx_sessions', 'wx_settings', 'wx_invoice_payments', 'wx_approvals'] as $t) {
    if (!wx_table_exists($t)) {
        echo "\n  SKIP: " . $t . " is missing — run: php db/migrate.php\n\n";
        exit(0);
    }
}

/* ------------------------------------------------------------------ fixtures */
$suffix = bin2hex(random_bytes(3));
$ownerEmail = 'money-owner+' . $suffix . '@woodex.test';
$managerEmail = 'money-manager+' . $suffix . '@woodex.test';
$password = 'MoneyPath!' . bin2hex(random_bytes(4));

function make_user(string $name, string $email, string $role, string $password): int
{
    return wx_insert('wx_users', [
        'name' => $name,
        'email' => $email,
        'role' => $role,
        'pass_hash' => password_hash($password, PASSWORD_DEFAULT),
        'active' => 1,
        'pw_ver' => 1,
        'created_at' => wx_now(),
    ]);
}

try {
    $created['users']['owner'] = make_user('Money Path Owner', $ownerEmail, 'owner', $password);
    $created['users']['manager'] = make_user('Money Path Manager', $managerEmail, 'admin', $password);
} catch (Throwable $e) {
    echo "\n  SKIP: could not create the test users (" . $e->getMessage() . ").\n\n";
    exit(0);
}
echo '  fixture: owner #' . $created['users']['owner'] . ', manager #' . $created['users']['manager'] . "\n";

/** Sign in and return [cookie, csrf] for later requests. */
function sign_in(string $email, string $password): array
{
    $r = request('POST', ['auth', 'login'], ['body' => ['email' => $email, 'password' => $password]]);
    if (($r['body']['ok'] ?? false) !== true) {
        echo "     ✗ sign-in failed for " . $email . ": " . json_encode($r['body']) . "\n";
        exit(1);
    }
    return [cookie_from($r['cookie']), (string) $r['body']['data']['csrf']];
}

/* ------------------------------------------------------------------ 1. sign in */
step('1', 'The Master signs in');
list($cookie, $csrf) = sign_in($ownerEmail, $password);
ok($cookie !== [], 'a session cookie is issued');
ok($csrf !== '', 'a CSRF token is issued');

/* ------------------------------------------------------------------ 2. the enquiry */
step('2', 'POST /leads — the enquiry from the website is in the inbox');
$r = request('POST', ['leads'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => [
    'name' => 'Money Path Client',
    'phone' => '0300' . random_int(1000000, 9999999),
    'email' => 'client+' . $suffix . '@woodex.test',
    'source' => 'website',
    'stage' => 'new',
    'value' => '98000',
    'project' => 'Kitchen and wardrobe',
]]);
eq($r['status'], 200, 'the lead is created');
$created['lead'] = (int) ($r['body']['data']['lead']['id'] ?? 0);
ok($created['lead'] > 0, 'the lead has an id');
eq($r['body']['data']['lead']['value'], 98000, 'the enquiry value is stored as whole rupees');

/* ------------------------------------------------------------------ 3. the quotation */
step('3', 'POST /quotations — the server computes the money, not the browser');
$r = request('POST', ['quotations'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => [
    'client' => ['name' => 'Money Path Client', 'phone' => '03001234567', 'company' => 'Money Path Co', 'address' => 'Model Town, Lahore', 'email' => 'client+' . $suffix . '@woodex.test'],
    'project' => 'Kitchen and wardrobe',
    'site' => 'Model Town, Lahore',
    'sections' => [
        ['name' => 'Kitchen', 'items' => [
            ['desc' => 'Kitchen cabinets', 'qty' => 24, 'unit' => 'sft', 'rate' => 2500],
            ['desc' => 'Counter top', 'qty' => 12, 'unit' => 'rft', 'rate' => 1800],
        ]],
        ['name' => 'Wardrobe', 'items' => [
            ['desc' => 'Wardrobe with loft', 'qty' => 1, 'unit' => 'job', 'rate' => 83000],
        ]],
    ],
    'discount' => 5000,
    'taxPct' => 17,
    'rent' => 0,
    'advance' => 20000,
    /* A lying client: the browser claims a total of one rupee. The server must ignore it. */
    'total' => 1,
    'subtotal' => 1,
    'tax' => 1,
]]);
eq($r['status'], 200, 'the quotation is created');
$quote = $r['body']['data']['quote'] ?? [];
$created['quote'] = (int) ($quote['id'] ?? 0);
ok($created['quote'] > 0, 'the quotation has an id');
ok(preg_match('~^\w+-1\d{4,}$~', (string) ($quote['no'] ?? '')) === 1, 'it is numbered from the company series (' . (string) ($quote['no'] ?? '?') . ')');
eq($quote['status'], 'draft', 'a new quotation is a draft');
$subtotal = 24 * 2500 + 12 * 1800 + 83000;
eq($quote['subtotal'], $subtotal, 'the subtotal is the sum of the line items');
eq($quote['discount'], 5000, 'the discount is kept');
$expectedTax = (int) round(($subtotal - 5000) * 17 / 100);
eq($quote['tax'], $expectedTax, 'tax is 17% of subtotal - discount');
eq($quote['total'], $subtotal - 5000 + $expectedTax, 'the total is computed by the server, not taken from the browser');
/* The document column is `data` on the v2.1 schema production runs and `payload` after a conversion, so the
   test asks the same helper the API uses rather than naming one. */
$stored = wx_one('SELECT ' . wx_payload_column('wx_quotes') . ' AS payload, total FROM wx_quotes WHERE id = ?', [$created['quote']]);
$payload = json_decode((string) $stored['payload'], true);
eq((int) $stored['total'], $quote['total'], 'the indexed total column agrees with the document');
/* The save answers with the list row (wx_quote_row), which carries no advance; the document is where it lives. */
eq((int) ($payload['advance'] ?? -1), 20000, 'the advance is recorded in the document');

/* ------------------------------------------------------------------ 4. an illegal move */
step('4', 'An illegal status move is refused');
$r = request('POST', ['quotations', (string) $created['quote'], 'status'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['status' => 'invoiced']]);
eq($r['status'], 409, 'a draft cannot jump to invoiced');
eq($r['body']['error']['code'], 'CONFLICT', 'the code is CONFLICT');
eq((string) wx_val('SELECT status FROM wx_quotes WHERE id = ?', [$created['quote']]), 'draft', 'the status did not change');

/* ------------------------------------------------------------------ 5. the approval flow */
step('5', 'The quotation is sent and approved');
$r = request('POST', ['quotations', (string) $created['quote'], 'status'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['status' => 'sent']]);
eq($r['status'], 200, 'draft → sent is allowed');
eq($r['body']['data']['quote']['status'], 'sent', 'the status is sent');
$r = request('POST', ['quotations', (string) $created['quote'], 'status'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['status' => 'approved']]);
eq($r['status'], 200, 'sent → approved is allowed');
eq($r['body']['data']['quote']['status'], 'approved', 'the quotation is approved');
$approved = json_decode((string) wx_val('SELECT ' . wx_payload_column('wx_quotes') . ' FROM wx_quotes WHERE id = ?', [$created['quote']]), true);
ok(!empty($approved['approved_at']), 'the approval is stamped with a time');
ok(($approved['approved_by'] ?? '') === 'Money Path Owner', 'and with who approved it');

/* ------------------------------------------------------------------ 6. the invoice */
step('6', 'POST /quotations/{id}/invoice — an invoice, a client and a project');
$r = request('POST', ['quotations', (string) $created['quote'], 'invoice'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => []]);
eq($r['status'], 200, 'the quotation converts');
$invoice = $r['body']['data']['invoice'] ?? [];
$created['invoice'] = (int) ($invoice['id'] ?? 0);
$created['client'] = (int) ($r['body']['data']['client_id'] ?? 0);
$created['project'] = (int) ($r['body']['data']['project_id'] ?? 0);
ok($created['invoice'] > 0, 'the invoice has an id');
ok($created['client'] > 0, 'the client was found or created');
ok($created['project'] > 0, 'the project was opened, because an invoiced job is a job');
eq($invoice['total'], $quote['total'], 'the invoice carries the quotation total');
eq($invoice['paid'], 0, 'nothing is paid yet');
eq($invoice['balance'], $invoice['total'], 'the whole total is outstanding');
eq($invoice['payStatus'], 'unpaid', 'and it reads as unpaid');
eq($invoice['no'], $quote['no'], 'a converted quotation keeps its number, as v2.1 does');
eq((string) wx_val('SELECT status FROM wx_quotes WHERE id = ?', [$created['quote']]), 'invoiced', 'the quotation is marked invoiced');
eq((int) wx_val('SELECT COUNT(*) FROM wx_clients WHERE id = ?', [$created['client']]), 1, 'the client exists once');
$project = json_decode((string) wx_val('SELECT ' . wx_payload_column('wx_projects') . ' FROM wx_projects WHERE id = ?', [$created['project']]), true);
eq((int) ($project['invoice_id'] ?? 0), $created['invoice'], 'the project points at its invoice');
eq((int) ($project['value'] ?? 0), $invoice['total'], 'and carries the contract value');

/* ------------------------------------------------------------------ 7. no double billing */
step('7', 'The same quotation cannot be invoiced twice');
$r = request('POST', ['quotations', (string) $created['quote'], 'invoice'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => []]);
eq($r['status'], 409, 'a second conversion is refused');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoices WHERE quote_id = ?', [$created['quote']]), 1, 'there is still exactly one invoice');

/* ------------------------------------------------------------------ 8. a part payment */
step('8', 'A part payment is recorded');
$r = request('POST', ['invoices', (string) $created['invoice'], 'payments'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => [
    'amount' => 40000,
    'method' => 'bank',
    'ref' => 'IBAN transfer',
    'date' => date('Y-m-d'),
]]);
eq($r['status'], 200, 'the payment is accepted');
$payment = $r['body']['data']['payment'] ?? [];
$paid = $r['body']['data']['invoice'] ?? [];
eq($payment['rcpt'], $invoice['no'] . '-R1', 'the receipt is the first of the series');
eq($paid['paid'], 40000, 'the paid figure follows the receipt');
eq($paid['balance'], $invoice['total'] - 40000, 'the balance drops by the payment');
eq($paid['payStatus'], 'partial', 'and the invoice reads as partial');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE invoice_id = ? AND reversed_at IS NULL', [$created['invoice']]), 1, 'the receipt is a row');

/* ------------------------------------------------------------------ 9. too much */
step('9', 'Overpaying is refused, and the message names the balance');
$r = request('POST', ['invoices', (string) $created['invoice'], 'payments'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['amount' => 5000000, 'method' => 'cash']]);
eq($r['status'], 422, 'a payment above the balance is refused');
eq($r['body']['error']['code'], 'VALIDATION', 'with a VALIDATION code');
eq($r['body']['error']['field'], 'amount', 'naming the amount field');
ok(strpos((string) $r['body']['error']['message'], 'balance') !== false, 'and saying what the balance is');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE invoice_id = ?', [$created['invoice']]), 1, 'no second receipt was written');

/* ------------------------------------------------------------------ 10. the rest */
step('10', 'The balance is paid');
$r = request('POST', ['invoices', (string) $created['invoice'], 'payments'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => [
    'amount' => $invoice['total'] - 40000,
    'method' => 'cash',
]]);
eq($r['status'], 200, 'the second payment is accepted');
$second = $r['body']['data']['payment'] ?? [];
$paid = $r['body']['data']['invoice'] ?? [];
eq($second['rcpt'], $invoice['no'] . '-R2', 'the second receipt continues the series');
eq($paid['paid'], $invoice['total'], 'the invoice is fully paid');
eq($paid['balance'], 0, 'nothing is outstanding');
eq($paid['payStatus'], 'paid', 'and it reads as paid');
ok(empty($paid['overdue']), 'a paid invoice is not overdue');

/* ------------------------------------------------------------------ 11. reversal */
step('11', 'The second receipt is reversed');
$r = request('DELETE', ['invoices', (string) $created['invoice'], 'payments', '2'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['reason' => 'bank reversal']]);
eq($r['status'], 200, 'the reversal is accepted');
$after = $r['body']['data']['invoice'] ?? [];
eq($after['paid'], 40000, 'only the first payment remains');
eq($after['balance'], $invoice['total'] - 40000, 'the balance is open again');
eq($after['payStatus'], 'partial', 'the invoice is partial again');
$reversed = wx_one('SELECT reversed_at, reversed_by FROM wx_invoice_payments WHERE invoice_id = ? AND rcpt = ?', [$created['invoice'], $invoice['no'] . '-R2']);
ok(!empty($reversed['reversed_at']), 'the receipt is marked reversed, not deleted');
eq((int) $reversed['reversed_by'], $created['users']['owner'], 'and the reversal records who did it');
$r = request('DELETE', ['invoices', (string) $created['invoice'], 'payments', '2'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => []]);
eq($r['status'], 409, 'reversing it twice is refused');

/* ------------------------------------------------------------------ 12. the reissue test */
step('12', 'A new receipt continues past the reversed one');
$r = request('POST', ['invoices', (string) $created['invoice'], 'payments'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => [
    /* PKR 150 is left open on purpose: step 14's Manager pays 100 (approved in step 15) and step 16's Manager
       files 50 (rejected). Settling the invoice here made both an overpayment, which the server rightly refuses,
       when the request is filed and again when it is replayed. */
    'amount' => $invoice['total'] - 40000 - 150,
    'method' => 'cheque',
    'ref' => 'cheque 4471',
]]);
eq($r['status'], 200, 'the replacement payment is accepted');
eq($r['body']['data']['payment']['rcpt'], $invoice['no'] . '-R3', 'the receipt is R3 — a number is never reissued');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE rcpt = ?', [$invoice['no'] . '-R2']), 1, 'R2 still refers to exactly one receipt');
eq($r['body']['data']['invoice']['payStatus'], 'partial', 'and PKR 150 is still open for the Manager in steps 14 and 16');

/* ------------------------------------------------------------------ 13. the ledger */
step('13', 'The ledger agrees with the document');
$r = request('GET', ['payments'], ['cookie' => $cookie, 'query' => ['from' => date('Y-m-01'), 'to' => date('Y-m-d')]]);
eq($r['status'], 200, 'the payments list answers');
$rows = array_values(array_filter($r['body']['data']['payments'] ?? [], static fn($p) => (int) ($p['invoice_id'] ?? 0) === $created['invoice']));
$sum = 0;
foreach ($rows as $p) {
    $sum += (int) $p['amount'];
}
eq($sum, $invoice['total'] - 150, 'the active receipts sum to the invoice total, less the PKR 150 left open');
eq($r['body']['data']['total'], array_sum(array_map(static fn($p) => (int) $p['amount'], $r['body']['data']['payments'] ?? [])), 'the day total is the sum of its rows');
$r = request('GET', ['quotations', (string) $created['quote']], ['cookie' => $cookie]);
eq($r['status'], 200, 'the quotation reads back');
eq($r['body']['data']['quote']['total'], $quote['total'], 'with the same total it was created with');

/* ------------------------------------------------------------------ 14. the Manager waits */
step('14', "A Manager's payment is held for the Master");
list($mCookie, $mCsrf) = sign_in($managerEmail, $password);
$r = request('POST', ['invoices', (string) $created['invoice'], 'payments'], ['cookie' => $mCookie, 'csrf' => $mCsrf, 'body' => ['amount' => 100, 'method' => 'cash']]);
eq($r['status'], 200, 'the manager is not refused — the request is filed');
ok(($r['body']['data']['pending'] ?? false) === true, 'the response says it is waiting for approval');
$approvalId = (int) ($r['body']['data']['approval']['id'] ?? 0);
$created['approval'] = $approvalId;
ok($approvalId > 0, 'the request is on the queue');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE invoice_id = ? AND amount = 100', [$created['invoice']]), 0, 'and nothing has been applied yet');
eq((string) wx_val('SELECT status FROM wx_approvals WHERE id = ?', [$approvalId]), 'pending', 'the item is pending');

/* ------------------------------------------------------------------ 15. the Master approves */
step('15', 'The Master approves, and the same request replays');
$r = request('GET', ['approvals', 'count'], ['cookie' => $cookie]);
ok((int) ($r['body']['data']['pending'] ?? 0) >= 1, 'the Master sees something waiting');
$r = request('POST', ['approvals', (string) $approvalId, 'approve'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => []]);
eq($r['status'], 200, 'the approval goes through');
eq((string) wx_val('SELECT status FROM wx_approvals WHERE id = ?', [$approvalId]), 'approved', 'the queue item is approved');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE invoice_id = ? AND amount = 100', [$created['invoice']]), 1, 'the replayed request wrote the row it asked for');
$replayed = wx_one('SELECT created_by, rcpt FROM wx_invoice_payments WHERE invoice_id = ? AND amount = 100', [$created['invoice']]);
eq((string) $replayed['created_by'], 'Money Path Manager', 'and it is recorded as the manager\'s request, not the Master\'s');
ok((int) wx_val("SELECT COUNT(*) FROM wx_activity WHERE action = 'payment.add' AND target = ?", ['invoice:' . $created['invoice']]) >= 2, 'the replay is audited');

/* ------------------------------------------------------------------ 16. rejection */
step('16', 'A rejected request is refused, with the note');
$r = request('POST', ['invoices', (string) $created['invoice'], 'payments'], ['cookie' => $mCookie, 'csrf' => $mCsrf, 'body' => ['amount' => 50, 'method' => 'cash']]);
$second = (int) ($r['body']['data']['approval']['id'] ?? 0);
ok($second > 0, 'a second request is filed');
$r = request('POST', ['approvals', (string) $second, 'reject'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['note' => 'Take it on the next invoice']]);
eq($r['status'], 200, 'the rejection goes through');
eq((string) wx_val('SELECT status FROM wx_approvals WHERE id = ?', [$second]), 'rejected', 'the item is rejected');
eq((string) wx_val('SELECT note FROM wx_approvals WHERE id = ?', [$second]), 'Take it on the next invoice', 'with the note stored');
eq((int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE invoice_id = ? AND amount = 50', [$created['invoice']]), 0, 'and nothing was applied');
$r = request('POST', ['approvals', (string) $second, 'reject'], ['cookie' => $cookie, 'csrf' => $csrf, 'body' => ['note' => 'again']]);
eq($r['status'], 409, 'deciding twice is refused');

/* ------------------------------------------------------------------ cleanup */
if (!$KEEP) {
    try {
        wx_q('DELETE FROM wx_invoice_payments WHERE invoice_id = ?', [$created['invoice']]);
        wx_q('DELETE FROM wx_invoices WHERE id = ?', [$created['invoice']]);
        wx_q('DELETE FROM wx_projects WHERE id = ?', [$created['project']]);
        wx_q('DELETE FROM wx_quotes WHERE id = ?', [$created['quote']]);
        wx_q('DELETE FROM wx_clients WHERE id = ?', [$created['client']]);
        wx_q('DELETE FROM wx_leads WHERE id = ?', [$created['lead']]);
        wx_q('DELETE FROM wx_approvals WHERE requested_by_id IN (?, ?)', [$created['users']['owner'], $created['users']['manager']]);
        foreach ($created['users'] as $id) {
            wx_q('DELETE FROM wx_sessions WHERE user_id = ?', [$id]);
            wx_q('DELETE FROM wx_user_perms WHERE user_id = ?', [$id]);
            wx_q('DELETE FROM wx_users WHERE id = ?', [$id]);
        }
    } catch (Throwable $e) {
        echo "     · cleanup failed: " . $e->getMessage() . "\n";
    }
}

echo "\n  " . $passed . " passed · " . $failed . " failed\n";
if ($failed) {
    echo "  The Phase 2 gate is not met: the money path failed above.\n";
}
echo "\n";
exit($failed ? 1 : 0);
