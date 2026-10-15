<?php
/**
 * tests/run.php — behavioural tests for the v2 platform.
 *
 * The sandbox that built Phase 1 has no PHP (see tools/phpwasm/README.md), which is why the
 * structural half of the gate lives in tests/conformance.mjs. This file is the other half: it needs a
 * real PHP binary, so it runs on the host, in CI, or on any machine with `php` installed.
 *
 *   php tests/run.php              pure tests — no database, no network, no side effects
 *   php tests/run.php --db         also runs the database tests (needs _private/db.json)
 *   php tests/run.php --verbose    print every assertion, not just failures
 *
 * The pure set deliberately covers the parts where a mistake is expensive and invisible:
 * document arithmetic, date validation, the TOTP algorithm, the permission and approval decision
 * tables, and the envelope contract. Those are exactly the places v2.1 was wrong and where nobody noticed, because
 * nothing tested them.
 */

declare(strict_types=1);

/* 'wasm' is the php-wasm SAPI used by tools/phpwasm/run-php.cjs, which provides argv and a
   filesystem but no HTTP request — it is a command line in every way that matters here. */
if (!in_array(PHP_SAPI, ['cli', 'phpdbg', 'wasm'], true)) {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(403);
    echo "tests/run.php runs from the command line only.\n";
    exit(1);
}

require_once dirname(__DIR__) . '/api/v2/lib/bootstrap.php';

/* The one command that can make an account is loaded without running it (WX_OWNER_TEST), so its rules are
   asserted here beside the other rules. The connection half needs a database and is exercised on the host. */
if (!defined('WX_OWNER_TEST')) {
    define('WX_OWNER_TEST', true);
    require_once dirname(__DIR__) . '/db/owner.php';
}

$VERBOSE = in_array('--verbose', $argv, true) || in_array('-v', $argv, true);
$WITH_DB = in_array('--db', $argv, true);

$passed = 0;
$failed = 0;
$skipped = 0;
$group = '';
$failures = [];

function group(string $name): void
{
    global $group;
    $group = $name;
    echo "\n  " . $name . "\n";
}

function ok(bool $cond, string $what): void
{
    global $passed, $failed, $group, $failures, $VERBOSE;
    if ($cond) {
        $passed++;
        if ($VERBOSE) {
            echo "    ✓ " . $what . "\n";
        }
        return;
    }
    $failed++;
    $failures[] = $group . ' → ' . $what;
    echo "    ✗ " . $what . "\n";
}

function eq($actual, $expected, string $what): void
{
    global $VERBOSE;
    $cond = $actual === $expected;
    if (!$cond) {
        echo "      got:      " . var_export($actual, true) . "\n";
        echo "      expected: " . var_export($expected, true) . "\n";
    }
    ok($cond, $what);
}

function skip(string $what): void
{
    global $skipped;
    $skipped++;
    echo "    · skipped: " . $what . "\n";
}

/** Assert that $fn throws an ApiError with the given code and field. */
function throws(string $code, ?string $field, callable $fn, string $what): void
{
    try {
        $fn();
    } catch (ApiError $e) {
        $good = $e->code === $code && ($field === null || $e->field === $field);
        if (!$good) {
            echo "      got code " . $e->code . " field " . var_export($e->field, true) . "\n";
        }
        ok($good, $what);
        return;
    } catch (Throwable $e) {
        echo "      got " . get_class($e) . ': ' . $e->getMessage() . "\n";
        ok(false, $what);
        return;
    }
    echo "      nothing was thrown\n";
    ok(false, $what);
}

echo "\n  Woodex api/v2 — behavioural tests" . ($WITH_DB ? ' (with database)' : '') . "\n";

/* ============================================================== money
   The unit is whole rupees, because that is what v2.1 stores — see db/migrations/README.md for why
   changing it would be worse than keeping it. What is tested here is that the unit is unambiguous:
   a client sending "12,345.4" gets 12345 and never 1234540. */
group('Money is a whole number of rupees');
eq(wx_v_pkr('1234', 'v'), 1234, 'a whole number is itself');
eq(wx_v_pkr(1234, 'v'), 1234, 'an integer is itself');
eq(wx_v_pkr('1,234', 'v'), 1234, 'thousands separators are accepted');
eq(wx_v_pkr('1,234.4', 'v'), 1234, 'a fraction of a rupee rounds down when small');
eq(wx_v_pkr('1,234.6', 'v'), 1235, 'a fraction of a rupee rounds up when large');
eq(wx_v_pkr(1234.56, 'v'), 1235, 'a float is rounded, never truncated');
eq(wx_v_pkr('1234.56', 'v'), 1235, 'a decimal string rounds to the rupee');
eq(wx_pkr_out(1234), '1,234', 'an amount formats the way a document writes it');
eq(wx_pkr_out(0), '0', 'zero formats correctly');
eq(wx_pkr_out(1234567), '1,234,567', 'a large amount groups correctly');
throws('VALIDATION', 'v', static function () { wx_v_pkr('12.3.4', 'v'); }, 'a malformed amount is refused');
throws('VALIDATION', 'v', static function () { wx_v_pkr('abc', 'v'); }, 'a non-number is refused');
throws('VALIDATION', 'v', static function () { wx_v_pkr('-5', 'v', 0); }, 'a negative amount is refused when a floor is set');
throws('VALIDATION', 'v', static function () { wx_v_pkr('999', 'v', null, 100); }, 'an amount above a ceiling is refused');

/* ====================================================== document arithmetic
   This group is the money rule of Phase 2. wx_doc_totals() is a port of v2.1's doc_totals() — the
   point of these assertions is that the port did not change the arithmetic, because a document made
   in v2.5 is printed by the v2.1 admin during the cut-over. */
group('Document totals are computed, not trusted');

$d = wx_doc_totals([
    'sections' => [
        ['name' => 'Living room', 'items' => [
            ['desc' => 'TV unit', 'qty' => 8, 'unit' => 'sft', 'rate' => 1250.5],
            ['desc' => 'Wall panel', 'qty' => 3, 'unit' => 'nos', 'rate' => 999.75],
        ]],
        ['name' => 'Bedroom', 'items' => [
            ['desc' => 'Wardrobe', 'qty' => 1, 'unit' => 'job', 'rate' => 85000],
        ]],
    ],
    'discount' => 0, 'taxPct' => 0, 'rent' => 0, 'advance' => 0,
]);
eq(round($d['sections'][0]['items'][0]['amount'], 2), 10004.0, 'an item amount is qty x rate to two decimals');
eq(round($d['sections'][0]['subtotal'], 2), 13003.25, 'a section subtotal is the sum of its items');
eq($d['subtotal'], 98003, 'the document subtotal is a whole number of rupees');
eq($d['tax'], 0, 'no tax percentage means no tax');
eq($d['total'], 98003, 'total = subtotal - discount + rent + tax');
eq($d['taxPct'], 0.0, 'the tax percentage is echoed back');

$t = wx_doc_totals(['sections' => [['name' => 'A', 'items' => [['desc' => 'x', 'qty' => 1, 'rate' => 100000]]]], 'discount' => 5000, 'taxPct' => 17, 'rent' => 2500, 'advance' => 0]);
eq($t['subtotal'], 100000, 'subtotal before deductions');
eq($t['discount'], 5000, 'the discount is kept');
eq($t['tax'], (int) round((100000 - 5000 + 2500) * 17 / 100), 'tax is charged on subtotal - discount + rent');
eq($t['total'], 100000 - 5000 + 2500 + (int) round(97500 * 17 / 100), 'the total adds the tax');

$clamp = wx_doc_totals(['sections' => [['name' => 'A', 'items' => [['desc' => 'x', 'qty' => 1, 'rate' => 1000]]]], 'discount' => 999999, 'taxPct' => 90, 'advance' => 999999]);
eq($clamp['discount'], 1000, 'a discount above the subtotal is clamped to it');
eq((float) $clamp['taxPct'], 50.0, 'the tax percentage is capped at 50');
eq($clamp['advance'], $clamp['total'], 'an advance is clamped to the total, never above it');
eq($clamp['total'], 0, 'a discount equal to the subtotal leaves nothing to pay');

$head = wx_doc_totals(['sections' => [['name' => 'A', 'items' => [
    ['desc' => 'SECTION HEADING', 'qty' => 0, 'rate' => 0, 'kind' => 'head'],
    ['desc' => 'Real item', 'qty' => 2, 'rate' => 500],
]]]]);
eq($head['sections'][0]['items'][0]['amount'], 0.0, 'a heading carries no amount even if numbers are sent');
eq($head['subtotal'], 1000, 'a heading does not inflate the subtotal');

$neg = wx_doc_totals(['sections' => [['name' => 'A', 'items' => [['desc' => 'x', 'qty' => -5, 'rate' => 100]]]], 'rent' => -500]);
eq($neg['subtotal'], 0, 'a negative quantity is treated as zero, not as a credit');
eq($neg['rent'], 0, 'a negative rent is floored at zero');

group('Sections are cleaned and bounded');
$many = [];
for ($i = 0; $i < 60; $i++) {
    $many[] = ['name' => 'S' . $i, 'items' => [['desc' => 'item ' . $i, 'qty' => 1, 'rate' => 10]]];
}
$clean = wx_clean_sections($many);
eq(count($clean), 40, 'at most 40 sections are kept, as v2.1 enforces');
eq($clean[0]['name'], 'S0', 'the order is preserved');
$units = wx_clean_sections([['name' => 'A', 'items' => [['desc' => 'x', 'qty' => 1, 'rate' => 1, 'unit' => 'cubic-parsec']]]]);
eq($units[0]['items'][0]['unit'], 'job', 'an unknown unit falls back to job rather than being stored');
throws('VALIDATION', 'sections.0.items.0.desc', static function () {
    wx_clean_sections([['name' => 'A', 'items' => [['desc' => '', 'qty' => 1, 'rate' => 1]]]]);
}, 'a line with no description is refused, not saved blank');

/* ======================================================== invoice position
   paid / balance / payStatus / overdue are derived. These five values are what the invoice tracker,
   the printed invoice and the client link all read, so they are asserted against the same inputs
   v2.1 computed them from. */
group('An invoice derives paid, balance, payStatus and overdue');
$inv = ['id' => 7, 'no' => 'WI-10123', 'total' => 98003, 'due_date' => date('Y-m-d', time() + 7 * 86400), 'sections' => [], 'discount' => 0, 'taxPct' => 0, 'rent' => 0];
$p0 = wx_inv_public($inv, []);
eq($p0['paid'], 0, 'no payments means nothing paid');
eq($p0['balance'], 98003, 'the whole total is outstanding');
eq($p0['payStatus'], 'unpaid', 'an invoice with no payments is unpaid');
ok(!$p0['overdue'], 'an invoice due in the future is not overdue');
eq($p0['totalDisplay'], '98,003', 'the total is formatted for printing');

$p1 = wx_inv_public($inv, [['id' => 1, 'amount' => 40000, 'rcpt' => 'WI-10123-R1']]);
eq($p1['paid'], 40000, 'a partial payment is counted');
eq($p1['balance'], 58003, 'the balance is total minus paid');
eq($p1['payStatus'], 'partial', 'a part payment makes the invoice partial');

$p2 = wx_inv_public($inv, [['id' => 1, 'amount' => 40000], ['id' => 2, 'amount' => 58003]]);
eq($p2['paid'], 98003, 'payments add up');
eq($p2['balance'], 0, 'a fully paid invoice has no balance');
eq($p2['payStatus'], 'paid', 'and reads as paid');
ok(!$p2['overdue'], 'a fully paid invoice is never overdue');

$late = wx_inv_public(['id' => 8, 'no' => 'WI-10124', 'total' => 5000, 'due_date' => '2020-01-01', 'sections' => [], 'discount' => 0, 'taxPct' => 0, 'rent' => 0], [['id' => 3, 'amount' => 1000]]);
ok($late['overdue'], 'a balance past its due date is overdue');
eq($late['balance'], 4000, 'the overdue amount is part of the balance');

/* ======================================================= approval policy
   These copy v2.1's appr_needed() case for case. The rule is the product's central permission
   idea — a Manager proposes, the Master decides — so it is asserted rather than assumed. */
group("A Manager's change waits for the Master");
ok(wx_appr_needed('admin', 'media_save'), 'a manager saving media needs approval');
ok(wx_appr_needed('admin', 'page_delete'), 'a manager deleting a page needs approval');
ok(wx_appr_needed('admin', 'quote_invoice'), 'a manager invoicing a quotation needs approval');
ok(wx_appr_needed('admin', 'pay_add'), 'a manager recording a payment needs approval');
ok(wx_appr_needed('admin', 'proj_meta'), 'a manager editing a project needs approval (the extra list)');
ok(wx_appr_needed('admin', 'blocks_sync'), 'a manager syncing sections needs approval');
ok(!wx_appr_needed('owner', 'media_save'), 'the Master never waits for the Master');
ok(!wx_appr_needed('admin', 'me_save'), 'a manager editing their own profile does not wait');
ok(!wx_appr_needed('admin', 'chat_reply'), 'a manager answering a chat does not wait');
ok(!wx_appr_needed('admin', 'crm_wa_status'), 'a read that looks like a write does not wait');
ok(!wx_appr_needed('admin', 'login'), 'logging in does not wait');
ok(!wx_appr_needed('admin', 'media_upload'), 'an upload is not live until used, so it does not wait');
ok(!wx_appr_needed('admin', 'leads_list'), 'reading the pipeline does not wait');
ok(!wx_appr_needed('editor', 'media_save'), 'an editor is not gated while the developer switch is off');
ok(!wx_appr_needed('sales', 'media_save'), 'a sales role is not gated by the manager switch');
$GLOBALS['WX_APPR_REPLAY'] = true;
ok(!wx_appr_needed('admin', 'media_save'), 'an approved replay is not queued again');
$GLOBALS['WX_APPR_REPLAY'] = false;

/* The switches themselves. Without a database the conservative defaults apply, which is the point:
   an unreadable policy must never mean "no approval needed". */
group('The approval switches default to the safe answer');
$cfg = wx_appr_cfg();
ok($cfg['manager'], 'with no readable settings, a manager is still gated');
ok(!$cfg['developer'], 'and an editor is not, matching the v2.1 default');
ok($cfg['notify'], 'the Master is notified by default');
eq($cfg['expire_days'], 14, 'the queue expires after 14 days');
/* Simulate a configured host: the per-request settings cache is what wx_setting_bool() reads. */
$GLOBALS['WX_ONCE'][wx_request_generation()]['settings.all'] = [
    'approval.manager' => '0', 'approval.developer' => '1', 'approval.notify' => '0', 'approval.expire_days' => '30',
];
ok(!wx_appr_needed('admin', 'media_save'), 'turning the manager switch off lets a manager act');
ok(wx_appr_needed('editor', 'media_save'), 'turning the developer switch on gates an editor');
ok(!wx_appr_needed('editor', 'blocks_theme'), 'a builder action not on the list is not gated');
ok(wx_appr_needed('editor', 'media_delete', 'builder'), 'a builder write on the list is gated');
ok(!wx_appr_needed('editor', 'builder_me', 'builder'), 'reading the builder is never gated');


eq(wx_appr_cfg()['expire_days'], 30, 'the expiry window is configurable');
unset($GLOBALS['WX_ONCE'][wx_request_generation()]['settings.all']);

/* The audit that found a gate with nothing behind it. POST /pages arrived with the action `page_write` — a
   name no v2.1 verb matches — so a Manager would have edited any of the 150 pages with no approval while
   needing one to change a section block. The route now carries the builder's own `save`, and these tests
   are what keeps the pair honest: the action queues in the source the route says it is. */
ok(wx_appr_needed('admin', 'save', 'builder'), 'a manager saving a page waits, exactly as in the builder');
/* The policy is keyed on the *pair* of action and source, and this is the pair that shows it: `theme` is a
   builder action and not an admin verb, `proj_meta` is the other way round. Losing the source in
   `wx_appr_route()` would have made the builder's theme change stop queueing without a single test failing. */
ok(!wx_appr_needed('admin', 'theme'), 'the builder theme name is not an admin verb');
ok(wx_appr_needed('admin', 'theme', 'builder'), 'but as a builder action it queues');
ok(!wx_appr_needed('admin', 'proj_meta', 'builder'), 'and an admin-only change is not queued as a builder one');
ok(!wx_appr_needed('owner', 'save', 'builder'), 'the Master does not queue for their own page save');
ok(wx_appr_needed('admin', 'restore', 'builder'), 'restoring a page version waits');
ok(wx_appr_needed('admin', 'page_new', 'builder'), 'adding a page waits');
ok(!wx_appr_needed('admin', 'page_rollback', 'builder'), 'a rollback is an undo, so it does not wait for the Master');

/* v2.5's never-queued list. Every entry is a decision with a reason, and a route that passes one of these
   actions has a gate that is a pass-through *on purpose* rather than by accident. */
ok(!wx_appr_needed('admin', 'cms_published'), 'publishing an article does not queue — it never did in v2.1');
ok(!wx_appr_needed('admin', 'media_sizes'), 'regenerating image derivatives does not queue');
ok(!wx_appr_needed('admin', 'create_quote_draft'), 'a draft revision of a quotation does not queue');
ok(wx_appr_needed('admin', 'quote_status'), 'but sending the revised quotation does');
ok(wx_appr_needed('admin', 'redirects_save'), 'merging the redirect plan queues under the rule it rewrites');
ok(!wx_appr_needed('admin', 'pages_export'), 'an unknown action still falls through to the verb rules');
{
    /* Read the list out of the policy itself rather than restating it here: a test that hard-codes the
       entries passes after somebody adds a fifth one *without* a reason, which is the failure that matters.
       The reason is anything after the arrow — a bare `true` or a one-word value would be tautology, so the
       check is that each key maps to a sentence, and that each key really does skip the queue. */
    $src = (string) file_get_contents(__DIR__ . '/../api/v2/lib/approvals.php');
    $body = '';
    if (preg_match('/const WX_APPR_NEVER = \[(.*?)\n\];/s', $src, $m)) {
        $body = $m[1];
    }
    $entries = [];
    preg_match_all("/'([a-z0-9_]+)'\s*=>\s*'([^']+)'/", $body, $m2, PREG_SET_ORDER);
    foreach ($m2 as $row) {
        $entries[$row[1]] = $row[2];
    }
    ok(count($entries) >= 4, 'the never-queued list reads back out of the policy: ' . implode(', ', array_keys($entries)));
    $queuedByMistake = [];
    $tooShort = [];
    foreach ($entries as $action => $reason) {
        if (wx_appr_needed('admin', (string) $action)) {
            $queuedByMistake[] = (string) $action;
        }
        if (strlen($reason) < 20) {
            $tooShort[] = (string) $action;
        }
    }
    eq(implode(',', $queuedByMistake), '', 'every entry in the never-queued list really does skip the queue');
    eq(implode(',', $tooShort), '', 'every entry says why, in a sentence');
}
group('An approval request says what it is');
eq(wx_appr_summary('admin', 'media_save', ['title' => 'Hero photo']), 'Change media: Hero photo', 'a save reads as a plain sentence');
eq(wx_appr_summary('admin', 'page_delete', ['title' => 'Winter offers']), 'Delete page: Winter offers', 'a delete says delete');
eq(wx_appr_summary('admin', 'page_new', ['title' => 'About us']), 'Add page: About us', 'a new page says add');
eq(wx_appr_summary('builder', 'blocks_import', []), 'Add section library', 'a builder import names its area');
eq(wx_appr_summary('builder', 'theme', ['name' => 'Woodex Ink']), 'Change website theme: Woodex Ink', 'a theme change names the theme');
eq(wx_appr_summary('admin', 'quote_invoice', ['no' => 'WI-10123']), 'Invoice a quotation: WI-10123', 'the v2.5 labels read better than the raw action');
eq(wx_appr_summary('admin', 'pay_add', ['no' => 'WI-10123-R2']), 'Record a payment: WI-10123-R2', 'a payment names its receipt');

group('A document carries a label and a link that cannot be guessed');
eq(wx_doc_label(['no' => 'WI-10123', 'version' => 1, 'option' => '']), 'WI-10123', 'a first version has no version suffix');
eq(wx_doc_label(['no' => 'WI-10123', 'version' => 3, 'option' => 'B']), 'WI-10123 · V3 · B', 'a revision shows its version and option');
try {
    $tok = wx_quote_view_token(['id' => 5, 'no' => 'WI-10123']);
    eq(strlen($tok), 32, 'the client link token is 32 characters');
    eq($tok, wx_quote_view_token(['id' => 5, 'no' => 'WI-10123']), 'the same quotation always produces the same token, so old links keep working');
    ok($tok !== wx_quote_view_token(['id' => 6, 'no' => 'WI-10123']), 'a different quotation gets a different token');
    ok($tok !== wx_quote_view_token(['id' => 5, 'no' => 'WI-10124']), 'and so does a different number');
} catch (ApiError $e) {
    /* signing needs the application secret, which lives in wx_secrets — a database test */
    skip('the client link token needs the application secret (run with --db)');
}

/* ============================================================== validation */
group('Validation names the offending field');

throws('VALIDATION', 'name', static function () { wx_v_string('', 'name'); }, 'empty required text is refused');
throws('VALIDATION', 'name', static function () { wx_v_string('x', 'name', 2); }, 'too-short text is refused');
eq(wx_v_string("  hello  ", 'x'), 'hello', 'text is trimmed');
eq(wx_v_string("a\x00b\x07c", 'x'), 'abc', 'control characters are stripped');

throws('VALIDATION', 'd', static function () { wx_v_date('2026-02-31', 'd'); }, 'February 31st is refused');
throws('VALIDATION', 'd', static function () { wx_v_date('31-02-2026', 'd'); }, 'a non-ISO date is refused');
eq(wx_v_date('2024-02-29', 'd'), '2024-02-29', 'a leap day is accepted');
eq(wx_v_opt_date('', 'd'), null, 'an empty optional date is null');

throws('VALIDATION', 's', static function () { wx_v_enum('maybe', ['yes', 'no'], 's'); }, 'a value outside the enum is refused');
eq(wx_v_enum('YES', ['yes', 'no'], 's', false), 'yes', 'a case-insensitive enum returns the canonical value');

throws('VALIDATION', 'n', static function () { wx_v_int('1.5', 'n'); }, 'a fractional integer is refused');
throws('VALIDATION', 'n', static function () { wx_v_int('5', 'n', 10); }, 'a value under the minimum is refused');
eq(wx_v_int('42', 'n'), 42, 'a numeric string becomes an int');
eq(wx_v_bool('on', 'b'), true, 'a form checkbox reads as true');
eq(wx_v_bool('', 'b'), false, 'an empty value reads as false');

throws('VALIDATION', 'e', static function () { wx_v_email('not-an-email', 'e'); }, 'a malformed email is refused');
eq(wx_v_email('  Boss@Woodex.PK ', 'e'), 'boss@woodex.pk', 'an email is lowercased and trimmed');

throws('VALIDATION', 'p', static function () { wx_v_password('short', 'p'); }, 'a short password is refused');
ok(strlen(wx_v_password(str_repeat('a', WX_PW_MIN), 'p')) === WX_PW_MIN, 'a password at the limit is accepted');

eq(wx_v_pick(['a' => 1, 'b' => 2, 'c' => 3], ['a', 'c']), ['a' => 1, 'c' => 3], 'only declared keys are copied');
ok(wx_limit(0) === 50 && wx_limit(9999) === 200 && wx_limit(10) === 10, 'page size is clamped to 1..200');

/* ============================================================== TOTP
   RFC 6238 Appendix B test vectors (SHA-1, 20-byte ASCII key). Our implementation emits 6 digits, so
   each expected value is the standard 8-digit truncation modulo 10^6 — the dynamic truncation itself
   is identical, which is what the test is checking. 2FA was one of the few things v2.1 got right, and
   this test exists to keep it that way across the rewrite. */
group('TOTP matches RFC 6238');

$key = '12345678901234567890'; // the RFC's ASCII secret
$b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
eq(wx_b32_dec($b32), $key, 'base32 decodes to the RFC key');

$vectors = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
];
foreach ($vectors as $v) {
    $counter = intdiv($v[0], 30);
    eq(wx_hotp($key, $counter), $v[1], 'RFC vector at T=' . $v[0]);
}

$state = [];
ok(wx_totp_ok($b32, wx_hotp($key, intdiv(time(), 30)), $state), 'a current code is accepted');
ok(!wx_totp_ok($b32, wx_hotp($key, intdiv(time(), 30)), $state), 'the same code cannot be replayed');
/* The third parameter is by reference (it advances the replay guard), so these need a variable. */
$noState = [];
ok(!wx_totp_ok($b32, '12345', $noState), 'a five-digit code is refused');
ok(!wx_totp_ok($b32, 'abcdef', $noState), 'a non-numeric code is refused');

/* ---- recovery codes -------------------------------------------------------------------------
   Eight one-time codes, printed dashed, typed by a person who has just lost their phone. The three
   things that must agree are the format, the hash and the comparison: a code that looks right and is
   refused is the worst failure this product can have. */
$codes = wx_recovery_codes();
eq(count($codes), 8, 'eight recovery codes are issued');
eq(strlen($codes[0]), 8, 'a code is eight characters');
ok(ctype_xdigit($codes[0]), 'a code is hex, so it can be read off a printout without ambiguity');
$shown = wx_recovery_fmt($codes);
eq($shown[0], substr($codes[0], 0, 4) . '-' . substr($codes[0], 4), 'codes are shown dashed');
eq(wx_recovery_hash($shown[0]), wx_recovery_hash($codes[0]), 'the dashed and undashed forms hash the same');
eq(wx_recovery_hash('  ' . strtoupper($shown[0]) . '  '), wx_recovery_hash($codes[0]), 'case and stray spaces do not change the hash');
ok(wx_recovery_hash($shown[1]) !== wx_recovery_hash($codes[0]), 'two different codes do not collide');
eq(count(array_unique($codes)), 8, 'the eight codes are distinct');

/* The shape the sign-in path insists on, so a typed TOTP code is never mistaken for a recovery code. */
ok((bool) preg_match('~^[a-z0-9]{4}-?[a-z0-9]{4}$~i', $shown[0]), 'a shown code matches the shape the sign-in path accepts');
ok(!(bool) preg_match('~^[a-z0-9]{4}-?[a-z0-9]{4}$~i', '123456'), 'a six-digit TOTP code is not treated as a recovery code');

/* ---- base32 round trip ----------------------------------------------------------------------- */
$bin = random_bytes(20);
$enc = wx_b32_enc($bin);
ok((bool) preg_match('~^[A-Z2-7]+$~', $enc), 'wx_b32_enc produces the base32 alphabet');
eq(wx_b32_dec($enc), $bin, 'base32 survives a round trip');


/* ============================================================== errors & envelope */
group('The envelope and the closed error set');

$e = ApiError::validation('Quantity must be greater than zero.', 'lines.3.qty');
$env = $e->toEnvelope('r_8f31c2');
ok($env['ok'] === false, 'a failure envelope starts with ok:false');
eq($env['error']['code'], 'VALIDATION', 'the code is carried');
eq($env['error']['field'], 'lines.3.qty', 'the offending field is carried');
eq($env['error']['message'], 'Quantity must be greater than zero.', 'the message is carried');
eq($env['meta']['requestId'], 'r_8f31c2', 'the request-id is in meta');
ok(!isset($env['error']['context']), 'the internal context is not sent to the client');

eq(ApiError::auth()->status, 401, 'AUTH maps to 401');
eq(ApiError::forbidden()->status, 403, 'FORBIDDEN maps to 403');
eq(ApiError::validation('x')->status, 422, 'VALIDATION maps to 422');
eq(ApiError::notFound()->status, 404, 'NOT_FOUND maps to 404');
eq(ApiError::conflict('x')->status, 409, 'CONFLICT maps to 409');
eq(ApiError::rateLimit()->status, 429, 'RATE_LIMIT maps to 429');
eq(ApiError::upstream()->status, 502, 'UPSTREAM maps to 502');
eq(ApiError::internal()->status, 500, 'INTERNAL maps to 500');

$sneaky = new ApiError('NOT_A_REAL_CODE', 'details');
eq($sneaky->code, 'INTERNAL', 'an invented code is coerced to INTERNAL');
eq($sneaky->getMessage(), 'Internal error', 'and its message is not passed through');

$wrapped = wx_error_boundary(new RuntimeException('table wx_users does not exist'), 'r_test');
eq($wrapped->code, 'INTERNAL', 'an unexpected exception becomes INTERNAL');
ok(strpos($wrapped->getMessage(), 'wx_users') === false, 'the internal message does not leak the schema');

/* ============================================================== aliases */
group('Aliases and the legacy bridge');

require_once WX_V2_DIR . '/aliases.php';
/* The alias table is the contract, so the count is asserted against the generated map rather than
   a remembered figure: every v2.1 action must have an entry, and the two-letter action `me` is the
   one an earlier count missed. */
$aliasCount = count(WX_V2_ALIASES);
$jsonPath = WX_V2_DIR . '/aliases.json';
$jsonCount = is_file($jsonPath) ? (int) (json_decode((string) file_get_contents($jsonPath), true)['counts']['actions'] ?? -1) : -1;
eq($jsonCount, $aliasCount, 'aliases.json and aliases.php agree on how many actions exist');
ok($aliasCount >= 365, 'all v2.1 actions are mapped (got ' . $aliasCount . ')');
eq(wx_v2_resource_for('leads_list'), 'leads', 'leads_list resolves to the leads resource');
eq(wx_v2_resource_for('chat_reply'), 'chats', 'chat_reply resolves to the chats resource');
eq(wx_v2_resource_for('backup_run'), 'system', 'backup_run resolves to the system resource');
eq(wx_v2_resource_for('not_a_real_action_xyz'), '', 'an unknown action resolves to an empty string');

require_once WX_V2_DIR . '/routes/legacy.php';
$bridged = wx_legacy_bridged();
ok(count($bridged) >= 15, 'the legacy bridge carries the Phase 1 read paths');
$unknown = [];
foreach (array_keys($bridged) as $action) {
    if (!isset(WX_V2_ALIASES[$action])) {
        $unknown[] = $action;
    }
}
eq($unknown, [], 'every bridged action is a real v2.1 action name');

/* ============================================================== router */
group('Routing');

$m = wx_route_match('GET', ['leads', '12']);
ok($m !== null && $m[1]['id'] === 12, 'a path parameter is captured as an int');
ok(wx_route_match('GET', ['leads', 'abc']) === null, 'a non-numeric id does not match the id route');
ok(wx_route_match('DELETE', ['leads', '3']) !== null, 'the method is part of the match');
ok(wx_route_match('GET', ['nope']) === null, 'an unknown path does not match');
$m = wx_route_match('GET', ['leads']);
ok($m !== null && $m[0]['fn'] === 'wx_route_leads_list', 'the list route resolves to its handler');

/* ---- the table itself: every route must be reachable, and reach its own handler ----------------
   This is where a route goes wrong without anyone noticing. `DELETE /invoices/{id}/payments/{payment}`
   was unreachable for a while because the matcher only understood `{id}`; nothing failed, the endpoint
   simply answered 404 and the reversal path in the money test never ran. The checks below ask the
   matcher for a path built from each registered pattern and require the answer to be that same route. */

$routes = wx_routes();
/* The dispatcher loads a route file only when it has chosen a route from it, so nothing here exists yet.
   Loading all of them first — which is also a test that each one parses and declares what it should. */
$routeFiles = glob(dirname(__DIR__) . '/api/v2/routes/*.php') ?: [];
sort($routeFiles);
$loaded = [];
foreach ($routeFiles as $file) {
    try {
        require_once $file;
        $loaded[] = basename($file);
    } catch (Throwable $e) {
        $loaded[] = basename($file) . ' ✗ ' . $e->getMessage();
    }
}
ok(count($loaded) === count($routeFiles), 'every file in api/v2/routes loads without error');
$seen = [];
$unreachable = [];
$wrong = [];
foreach ($routes as $r) {
    $key = $r[0] . ' ' . $r[1];
    if (isset($seen[$key])) {
        $seen[$key]++;
        continue;
    }
    $seen[$key] = 1;
    $segments = [];
    foreach (explode('/', $r[1]) as $seg) {
        $segments[] = preg_match('~^\{([a-z0-9_]+)\}$~', $seg) ? ($seg === '{id}' ? '7' : 'sample') : $seg;
    }
    $hit = wx_route_match($r[0], $segments);
    if ($hit === null) {
        $unreachable[] = $key;
    } elseif ($hit[0]['fn'] !== $r[3]) {
        $wrong[] = $key . ' → ' . $hit[0]['fn'];
    }
}
eq($unreachable, [], 'every registered pattern can be matched by a path built from it');
eq($wrong, [], 'every pattern resolves to its own handler, not to an earlier one that shadows it');
$dupes = array_keys(array_filter($seen, static fn($n) => $n > 1));
eq($dupes, [], 'no route is registered twice (a duplicate would shadow the second one)');

/* Two parameters in one pattern, and the second one is a string, not an id. */
$m = wx_route_match('DELETE', ['invoices', '12', 'payments', 'R-4']);
ok($m !== null && $m[1]['id'] === 12 && $m[1]['payment'] === 'R-4', 'a two-parameter pattern captures both, with the id typed');
ok(wx_route_match('DELETE', ['invoices', '12', 'payments']) === null, 'a pattern does not match when a segment is missing');

/* A handler name that does not exist is a 500 in production and a typo at review time. */
$missing = [];
foreach ($routes as $r) {
    if (!function_exists($r[3])) {
        $missing[] = $r[3];
    }
}
eq($missing, [], 'every registered handler is a function that exists');

/* ---- the legacy bridge -------------------------------------------------------------------------
   The bridge is an array literal, and a repeated key in one is not an error: PHP keeps the last and
   says nothing. Counting the keys against the lines that define them is the only way to notice. */
$bridged = wx_legacy_bridged();
$lines = substr_count(file_get_contents(__DIR__ . '/../api/v2/routes/legacy.php'), "=> ['");
eq(count($bridged), $lines, 'every bridge key is distinct (a duplicate would silently replace one)');
$bad = [];
foreach ($bridged as $action => $spec) {
    if (!function_exists($spec[1])) {
        $bad[] = $action . ' → ' . $spec[1];
    }
}
eq($bad, [], 'every bridged action points at a handler that exists');
ok(count($bridged) > 60, 'the bridge covers the ported families (' . count($bridged) . ' actions)');

/* ---- public routes -----------------------------------------------------------------------------
   Every route that answers without a session has to be declared, and the declaration has to be true:
   a public pattern that is not registered is a typo, and a registered route that is not public must
   ask who is calling (conformance checks the handler; this checks the table). */
$patterns = array_column($routes, 1);
$unknown = array_values(array_diff(wx_public_routes(), $patterns));
eq($unknown, [], 'every pattern in wx_public_routes() is a registered route');

/* ---- what an account change means ------------------------------------------------------------
   wx_user_plan() is the rules — who may create an owner, whose last owner cannot be demoted, who
   cannot switch themselves off — as a pure decision, which is why they can be tested here at all. */
group('The rules that keep a company out of its own admin');

$owner = ['id' => 1, 'name' => 'Owner', 'role' => 'owner'];
$admin = ['id' => 2, 'name' => 'Manager', 'role' => 'admin'];
$row = ['id' => 5, 'name' => 'Someone', 'email' => 'someone@woodex.com.pk', 'role' => 'sales', 'active' => 1];
$new = ['name' => 'New Person', 'email' => 'New.Person@woodex.com.pk', 'role' => 'sales', 'password' => 'a-long-enough-password'];

$plan = wx_user_plan($new, $owner, null, 0);
ok(empty($plan['error']) && $plan['set']['email'] === 'new.person@woodex.com.pk', 'a new account is planned, with the email lowercased');
ok($plan['set']['active'] === 1, 'a new account is active by default');

ok(wx_user_plan(['name' => 'X', 'email' => 'x@y.pk', 'role' => 'owner', 'password' => 'a-long-enough-password'], $admin, null, 0)['error'] !== null, 'a manager cannot create an owner');
ok(empty(wx_user_plan(['name' => 'X', 'email' => 'x@y.pk', 'role' => 'owner', 'password' => 'a-long-enough-password'], $owner, null, 0)['error']), 'the owner can create another owner');
ok(wx_user_plan(['name' => 'X', 'email' => 'not-an-email', 'role' => 'sales', 'password' => 'a-long-enough-password'], $owner, null, 0)['error'] !== null, 'a malformed email is refused');
ok(wx_user_plan(['name' => '', 'email' => 'x@y.pk', 'role' => 'sales', 'password' => 'a-long-enough-password'], $owner, null, 0)['error'] !== null, 'a missing name is refused');
ok(wx_user_plan(['name' => 'X', 'email' => 'x@y.pk', 'role' => 'wizard', 'password' => 'a-long-enough-password'], $owner, null, 0)['error'] !== null, 'an unknown role is refused');
ok(wx_user_plan(['name' => 'X', 'email' => 'x@y.pk', 'role' => 'sales'], $owner, null, 0)['error'] !== null, 'a new account needs a password');
ok(wx_user_plan(['name' => 'X', 'email' => 'x@y.pk', 'role' => 'sales', 'password' => 'short'], $owner, null, 0)['error'] !== null, 'a short password is refused');

$ownerRow = ['id' => 1, 'name' => 'Owner', 'email' => 'o@y.pk', 'role' => 'owner', 'active' => 1];
ok(wx_user_plan(['name' => 'Owner', 'email' => 'o@y.pk', 'role' => 'sales'], $owner, $ownerRow, 0)['error'] !== null, 'the last active owner cannot be demoted');
ok(empty(wx_user_plan(['name' => 'Owner', 'email' => 'o@y.pk', 'role' => 'sales'], $owner, $ownerRow, 1)['error']), 'an owner can be demoted when another active owner exists');
ok(wx_user_plan(['name' => 'Owner', 'email' => 'o@y.pk', 'role' => 'owner', 'active' => false], $owner, $ownerRow, 1)['error'] !== null, 'the owner cannot switch themselves off');
ok(wx_user_plan(['name' => 'Owner', 'email' => 'o@y.pk', 'role' => 'owner', 'active' => 0], $admin, $ownerRow, 2)['error'] !== null, 'a manager cannot edit the owner at all');
ok(empty(wx_user_plan(['name' => 'Someone', 'email' => 'someone@woodex.com.pk', 'role' => 'sales', 'active' => false], $owner, $row, 3)['error']), 'someone else can be deactivated');

$changed = wx_user_plan(['name' => 'Someone', 'email' => 'someone@woodex.com.pk', 'role' => 'admin'], $owner, $row, 3);
ok($changed['signOut'] === true, 'a role change ends that person sessions');
$same = wx_user_plan(['name' => 'Someone Else', 'email' => 'someone@woodex.com.pk', 'role' => 'sales'], $owner, $row, 3);
eq($same['signOut'], false, 'renaming someone does not sign them out');
$pw = wx_user_plan(['name' => 'Someone', 'email' => 'someone@woodex.com.pk', 'role' => 'sales', 'password' => 'a-long-enough-password'], $owner, $row, 3);
ok($pw['signOut'] === true && $pw['password'] !== '', 'a new password ends their sessions');
$pw = wx_user_plan(['name' => 'Someone', 'email' => 'someone@woodex.com.pk', 'role' => 'sales', 'password' => 'a-long-enough-password'], $owner, $row, 3);

/* ============================================================== JSON store */
group('Atomic JSON store');

$tmp = sys_get_temp_dir() . '/wx-test-' . bin2hex(random_bytes(4)) . '.json';
$store = new JsonStore($tmp, true);
eq($store->read(), [], 'a missing store reads as empty when optional');
$store->write(['a' => 1]);
eq($store->read(), ['a' => 1], 'a written value reads back');
$store->update(static function (array $d) { $d['b'] = 2; return $d; });
eq($store->read(), ['a' => 1, 'b' => 2], 'update() applies a read-modify-write');
$store->update(static function () { return null; });
eq($store->read(), ['a' => 1, 'b' => 2], 'returning null leaves the store untouched');
ok(is_file($tmp . '.lock'), 'the lock file is a sidecar, so the rename cannot invalidate it');

file_put_contents($tmp, '{"broken": ');
$raised = false;
try {
    $store->read();
} catch (ApiError $e) {
    $raised = $e->code === 'INTERNAL';
}
ok($raised, 'a corrupt store raises INTERNAL instead of silently reading as empty');
ok($store->tryRead() === null, 'tryRead() returns null on corruption for best-effort callers');
@unlink($tmp);
@unlink($tmp . '.lock');

$nonOptional = new JsonStore(sys_get_temp_dir() . '/wx-test-missing-' . bin2hex(random_bytes(4)) . '.json');
ok($nonOptional->read() === [], 'a missing non-optional store still reads empty for bootstrapping');

/* ============================================================== database */
group('Database behaviour');

if (!$WITH_DB) {
    skip('run with --db to test queries, permissions and the audit trail');
} elseif (!is_file(WX_DB_FILE)) {
    skip('no _private/db.json — configure the database first');
} else {
    try {
        wx_db();
    } catch (Throwable $e) {
        skip('database not reachable: ' . $e->getMessage());
    }

    if (wx_table_exists('wx_sessions')) {
        eq((int) wx_val('SELECT 1'), 1, 'a trivial query answers');
        ok(wx_table_exists('wx_leads'), 'wx_leads is present');
        ok(wx_column_exists('wx_leads', 'stage'), 'column introspection works');
        ok(!wx_column_exists('wx_leads', 'no_such_column'), 'a missing column is reported as missing');
        throws('INTERNAL', null, static function () { wx_update('wx_leads', ['stage' => 'new'], []); }, 'an unqualified UPDATE is refused');

        // The matrix must answer exactly as roles-lib.php did for the cases that matter most.
        $owner = ['id' => 1, 'role' => 'owner'];
        $sales = ['id' => 2, 'role' => 'sales'];
        $support = ['id' => 3, 'role' => 'support'];
        ok(wx_can($owner, 'leads_list'), 'the owner can list leads');
        ok(wx_can($sales, 'leads_list'), 'sales can list leads');
        ok(wx_can($support, 'get_lead'), 'support can open a client to answer a chat');
        ok(!wx_can($support, 'leads_list'), 'support cannot list the whole pipeline');
        ok(!wx_can($sales, 'users'), 'sales cannot manage users');
        ok(!wx_can($sales, 'backups'), 'sales cannot reach backups');
        ok(wx_can($owner, 'users'), 'the owner manages users');
        ok(wx_can($owner, 'backups'), 'the owner reaches backups');
        ok(!wx_can($sales, 'mcp_log'), 'sales cannot read the MCP log');

        $db = wx_db();
        $db->beginTransaction();
        try {
            $id = wx_insert('wx_leads', ['created_at' => wx_now(), 'source' => 'manual', 'name' => 'ZZ Test Lead', 'stage' => 'new', 'value' => 98450]);
            ok($id > 0, 'a lead can be inserted');
            eq((int) wx_val('SELECT value FROM wx_leads WHERE id = ?', [$id]), 98450, 'an amount round-trips through the database unchanged');
            $n = wx_update('wx_leads', ['stage' => 'contacted'], ['id' => $id]);
            eq($n, 1, 'wx_update reports one row changed');
            eq((string) wx_val('SELECT stage FROM wx_leads WHERE id = ?', [$id]), 'contacted', 'the update landed');
        } finally {
            $db->rollBack();
        }
    } else {
        skip('wx_sessions is absent — run: php db/migrate.php');
    }
}

/* ==================================================== Phase 3 · redirects */

/* The rules that stop a redirect from breaking the site are pure functions, so they are tested without
   a database — which matters, because the failure they prevent (a redirect that takes over /admin, or
   one that points at itself) is only visible in production. */

eq(wx_rd_one(['from' => 'design-planning', 'to' => '/interior-design/', 'type' => 301])['from'], '/design-planning/', 'a rule is normalised to have both slashes');
eq(wx_rd_one(['from' => '/Page/', 'to' => '/blog/'])['from'], '/page/', 'the old address is lower-cased — MySQL compares paths case-insensitively');
eq(wx_rd_one(['from' => '/x/', 'to' => '/y/', 'type' => 410])['to'], '', '410 is gone: it carries no target');
eq(wx_rd_one(['from' => '/x/', 'to' => '/y/', 'type' => 999])['type'], 301, 'an unknown status code falls back to 301, not to a 500');
eq(wx_rd_one(['from' => '/x/', 'to' => '/y/', 'match' => 'prefix'])['match'], 'prefix', 'prefix matching survives');
eq(wx_rd_one(['from' => '/x/', 'to' => '/y/', 'match' => 'regex'])['match'], 'exact', 'anything that is not "prefix" is exact — there is no third kind');

$ok = wx_rd_clean([['from' => '/a/', 'to' => '/b/'], ['from' => '/a/', 'to' => '/c/']]);
eq(count($ok), 1, 'the same address twice collapses to the first rule — the one the unique key would keep');
eq($ok[0]['to'], '/b/', 'the first rule is the one kept');

$threw = '';
try { wx_rd_clean([['from' => '/a/', 'to' => '/a/']]); } catch (Throwable $e) { $threw = $e->getMessage(); }
ok(str_contains($threw, 'itself'), 'a redirect that points at itself is refused by name');

$threw = '';
try { wx_rd_clean([['from' => '/admin/', 'to' => '/']]); } catch (Throwable $e) { $threw = $e->getMessage(); }
ok(str_contains($threw, 'system folder'), 'a system folder cannot be redirected');

$threw = '';
try { wx_rd_clean([['from' => '/', 'to' => '/home/']]); } catch (Throwable $e) { $threw = $e->getMessage(); }
ok(str_contains($threw, 'home page'), 'the home page cannot be redirected');

$threw = '';
try { wx_rd_clean([['from' => '/a/', 'to' => '']]); } catch (Throwable $e) { $threw = $e->getMessage(); }
ok(str_contains($threw, 'Choose a new address'), 'a redirect with nowhere to go is refused');
eq(count(wx_rd_clean([['from' => '/a/', 'to' => '', 'type' => 410]])), 1, 'the same rule with 410 is allowed — gone needs no target');

$plan = wx_rd_plan();
ok(count($plan) >= 30, 'the verified redirect plan ships with the product (' . count($plan) . ' addresses)');
$merged = wx_rd_merge([['from' => '/page/', 'to' => '/blog/', 'type' => 301, 'match' => 'prefix', 'src' => 'mine', 'on' => true]], $plan);
ok($merged['added'] < count($plan), 'merging the plan skips an address that already has a rule');
eq($merged['added'] + 1, count($plan), 'only the already-decided address was skipped');
$pageRule = array_values(array_filter($merged['list'], static fn($r) => $r['from'] === '/page/'))[0] ?? null;
eq($pageRule['to'] ?? '', '/blog/', 'the existing decision wins over the shipped plan');

/* The .htaccess lines read the two switches and the saved rules, so this part needs the tables. */
if ($WITH_DB && is_file(WX_DB_FILE) && wx_table_exists('wx_redirects')) {
    $lines = implode("\n", wx_rd_lines());
    ok(str_contains($lines, 'RewriteRule ^design-planning/?$ /interior-design/ [R=301,L]'), 'an exact rule becomes one RewriteRule with the right status');
    ok(str_contains($lines, '[G,L]'), 'the spam cleanup answers 410, so Google drops the URL');
    ok(str_contains($lines, '^www\\\\.'), 'the published block forces one official hostname');
} else {
    skip('the .htaccess lines need the redirect tables — run with --db after db/migrate.php');
}

/* ========================================== Phase 3 · pages, media, files */

/* Pages are written through one function, and the parts of it that say no are pure — no database, no
   filesystem change — which is exactly why they can be tested here. The cases below are the ones that
   would otherwise be found in production: a path that escapes the site, a system folder, and a page path
   that is not a page. */

/* `about/` is a real folder in the site tree; inside the wasm harness only the PHP trees are mounted,
   so it is created when it is missing. Nothing is written — the guard only resolves the folder. */
@mkdir(WX_SITE_ROOT . '/about', 0755, true);
eq(wx_page_rel('about/index.html'), 'about/index.html', 'a sub-folder page path is accepted');
eq(wx_page_rel('/about/index.html'), 'about/index.html', 'a leading slash is normalised away');

foreach ([
    '../../etc/passwd'        => 'escapes the site',
    'about/../../index.html'  => 'escapes the site',
    'admin/index.html'        => 'is a system folder',
    'api/v2/x.html'           => 'is a system folder',
    'assets/img/x.html'       => 'is a system folder',
    'index.php'               => 'is not a page',
] as $bad => $why) {
    $threw = '';
    try { wx_page_rel($bad); } catch (Throwable $e) { $threw = $e->getMessage(); }
    ok($threw !== '', '"' . $bad . '" ' . $why . ' and is refused');
}

eq(wx_page_title_of('<html><head><TITLE> Woodex  Interiors </TITLE></head>'), 'Woodex Interiors', 'the title is read out of a page for the index');
eq(wx_page_title_of('<html><head></head>'), '', 'a page with no title reports an empty one rather than a notice');

/* A batch id has to be a real UUID: it travels in URLs and the history groups by it. */
$uuid = wx_uuid();
ok((bool) preg_match('~^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$~', $uuid), 'a batch id is a version-4 UUID');
ok(wx_uuid() !== $uuid, 'two batch ids are not the same');

/* The site's own pages are found by the walk that the header-across-150-pages change relies on. In the
   wasm harness only the PHP trees are mounted, so this part runs where the site is actually present. */
$pages = wx_page_walk(WX_SITE_ROOT);
if (count($pages) > 10) {
    ok(count($pages) > 50, 'the page walk finds the site\'s pages (' . count($pages) . ')');
    ok(!in_array('api/v2/index.php', $pages, true), 'the walk does not enter system folders');
    ok(in_array('about/index.html', $pages, true), 'the walk finds a page in a sub-folder');
} else {
    skip('the page walk needs the site tree — only the PHP trees are mounted in the wasm harness');
}

/* ------------------------------------------------ images */
ok(wx_media_ok('/assets/img/kitchen-1.webp'), 'an image URL in assets/img is valid');
ok(wx_media_ok('/assets/uploads/2026-10/kitchen-1.jpeg'), 'an image URL in an uploads sub-folder is valid');
ok(!wx_media_ok('/assets/img/../_private/db.json'), 'an image URL cannot walk up out of its folder');
ok(!wx_media_ok('/assets/img/logo.php'), 'an image URL is an image extension, not any file');
ok(!wx_media_ok('/uploads/logo.webp'), 'an image outside assets is not valid');

eq(wx_media_sniff("\xFF\xD8\xFF\xE0rest"), 'jpg', 'JPEG bytes are recognised by their marker');
eq(wx_media_sniff("\x89PNG\r\n"), 'png', 'PNG bytes are recognised');
eq(wx_media_sniff('RIFFxxxxWEBPVP8 '), 'webp', 'RIFF/WEBP is recognised');
eq(wx_media_sniff('GIF89a'), 'gif', 'GIF is recognised');
eq(wx_media_sniff("\x00\x00\x00 ftypavif"), 'avif', 'AVIF is recognised by its brand');
eq(wx_media_sniff('<?php echo 1;'), null, 'a PHP file uploaded as an image is not an image');
eq(wx_media_sniff('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), null, 'an SVG is not accepted as an image upload — it is HTML, and assets are same-origin');

eq(wx_media_variant('/assets/img/kitchen-1.webp', 960), '/assets/img/kitchen-1.w960.webp', 'the derivative name is the width, not a folder');
eq(count(WX_MEDIA_RS_W), 3, 'three widths are generated, as v2.1 did');

$threw = '';
try { wx_media_b64(''); } catch (Throwable $e) { $threw = $e->getMessage(); }
ok(str_contains($threw, 'base64'), 'empty image data is refused by name');
eq(strlen(wx_media_b64('data:image/png;base64,' . base64_encode('hello'))), 5, 'the browser\'s data: URL prefix is stripped before decoding');
$threw = '';
try { wx_media_b64('not base64 at all !!'); } catch (Throwable $e) { $threw = $e->getMessage(); }
ok($threw !== '', 'data that is not base64 is refused before anything is written');

/* ------------------------------------------------ the file manager */
ok(wx_fm_ro('assets'), 'the assets root is read-only');
ok(wx_fm_ro('assets/css/app.css'), 'the stylesheet folder is read-only');
ok(!wx_fm_ro('assets/uploads'), 'uploads is writable');
ok(!wx_fm_ro('assets/uploads/2026-10'), 'a folder inside uploads is writable');

eq(wx_fm_clean('My File Name.PNG'), 'my-file-name.png', 'an uploaded name is normalised, not trusted');
eq(wx_fm_clean('../../x'), 'x', 'dots and slashes do not survive a name');

foreach (['../etc/passwd', 'assets/../_private/db.json', 'api/v2/index.php', 'assets/.hidden/x'] as $bad) {
    $threw = '';
    try { wx_fm_path($bad, false); } catch (Throwable $e) { $threw = $e->getMessage(); }
    ok($threw !== '', 'the file manager refuses "' . $bad . '"');
}
ok(!in_array('php', WX_FM_EXT, true), 'PHP is not an uploadable file type');
ok(in_array('svg', WX_FM_EXT, true) && in_array('pdf', WX_FM_EXT, true), 'the document and image types v2.1 allowed are still allowed');

/* ============================================== Phase 3 · the header, menu, footer
   These transformations are the ones that decide whether "change the header across 150 pages" is one
   edit or 150 small mistakes, and every one of them is pure — page HTML in, page HTML out. */

/** A page shaped like the site's own: brand, header CTA, desktop nav, mobile panel, footer, sections. */
function wx_test_page(string $url, string $extra = ''): string
{
    return '<!doctype html><html><head><title>Test</title>' . $extra . '</head><body>'
        . '<header class="site-header">'
        . '<a class="brand" href="/"><img src="/assets/img/logo.svg" alt="Woodex"></a>'
        . '<nav class="desktop-nav"><a href="/">Home</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav>'
        . '<a class="header-cta" href="/contact/"><span class="header-cta-label">Get a quote</span></a>'
        . '<nav class="mobile-panel"><a class="mobile-primary" href="/contact/">Get a quote</a><a href="/about/">About</a></nav>'
        . '</header>'
        . '<main>' . $extra . '</main>'
        /* Shaped like the site's own footer, which matters: the intro is the block immediately before a
           `<nav>`, and that is what tells the shared footer which sentence belongs to this page. */
        . '<footer class="footer"><div class="footer-main">'
        . '<div class="footer-intro">A sentence about this page.</div>'
        . '<nav class="footer-column"><a id="footer-process" href="' . $url . '#process">Process</a>'
        . '<a id="footer-services" href="' . $url . '#services">Services</a>'
        . '<a id="footer-faq" href="' . $url . '#faqs">FAQs</a></nav>'
        . '<nav class="footer-cols"><a id="footer-cta" href="/#page-contact">Contact</a></nav>'
        . '</div></footer>'
        . '</body></html>';
}

$homePage = wx_test_page('/');
$aboutPage = wx_test_page('/about/', '<section id="page-contact">Contact form</section>');

/* ---- the brand: the home page's own brand is marked current, every other page's is not */
$brand = '<a class="brand" href="/"><img src="/assets/img/logo.svg" alt="Woodex"></a>';
$newHome = wx_chrome_apply_html('index.html', $homePage, ['regions' => ['brand'], 'brand' => $brand]);
ok($newHome === null || !str_contains($newHome, 'aria-current="page"') || str_contains((string) $newHome, '<a class="brand" aria-current="page"'),
    'the home page brand keeps aria-current when the brand is applied');
$brandNew = '<a class="brand" href="/"><img src="/assets/img/logo-v2.svg" alt="Woodex"></a>';
$changedHome = wx_chrome_apply_html('index.html', $homePage, ['regions' => ['brand'], 'brand' => $brandNew]);
ok(str_contains((string) $changedHome, 'logo-v2.svg'), 'a brand change reaches the home page');
ok(str_contains((string) $changedHome, 'aria-current="page"'), 'and the home page still marks its own brand as the current page');
$changedAbout = wx_chrome_apply_html('about/index.html', $aboutPage, ['regions' => ['brand'], 'brand' => $brandNew]);
ok(!str_contains((string) $changedAbout, 'aria-current="page"'), 'the about page does not claim the home page is current');
eq(wx_chrome_apply_html('about/index.html', $aboutPage, ['regions' => ['brand'], 'brand' => $brand]), null,
    'applying the brand the page already has changes nothing — a no-op is reported as one');

/* ---- the call-to-action label */
$cta = wx_chrome_apply_html('about/index.html', $aboutPage, ['regions' => ['cta'], 'cta' => 'Get a quote →']);
ok(str_contains((string) $cta, '>Get a quote →<'), 'the button text is replaced');
ok(substr_count((string) $cta, 'Get a quote →') === 1, 'only the header button is touched, not the mobile menu copy');

/* ---- the desktop menu: this page's own link is marked current, and only one link is */
$menu = '<nav class="desktop-nav"><a href="/">Home</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav>';
$aboutMenu = wx_chrome_apply_html('about/index.html', $aboutPage, ['regions' => ['menu'], 'menuDesktop' => $menu]);
ok(substr_count((string) $aboutMenu, 'aria-current="page"') === 1, 'exactly one menu link is marked as the current page');
ok((bool) preg_match('~<a href="/about/" aria-current="page"~', (string) $aboutMenu), 'and it is this page\'s own link');
$homeMenu = wx_chrome_apply_html('index.html', $homePage, ['regions' => ['menu'], 'menuDesktop' => $menu]);
ok((bool) preg_match('~<a href="/" aria-current="page"~', (string) $homeMenu), 'the home page marks Home');

/* ---- the mobile menu keeps this page's own "Get a quote" target */
$mobile = '<nav class="mobile-panel"><a class="mobile-primary" href="/contact/">Get a quote</a><a href="/">Home</a></nav>';
$pageWithOwnCta = str_replace('href="/contact/">Get a quote</a><a href="/about/', 'href="/services/">Get a quote</a><a href="/about/', $aboutPage);
$mobileApplied = wx_chrome_apply_html('about/index.html', $pageWithOwnCta, ['regions' => ['menu'], 'menuMobile' => $mobile]);
ok(str_contains((string) $mobileApplied, '<a class="mobile-primary" href="/services/">'), 'the mobile button keeps the target this page chose');
$plainApplied = wx_chrome_apply_html('about/index.html', $aboutPage, ['regions' => ['menu'], 'menuMobile' => $mobile]);
ok(str_contains((string) $plainApplied, '<a class="mobile-primary" href="/contact/">'), 'and keeps it when the page has no different target of its own');

/* ---- the footer: shared, but this page's anchors and its own intro survive */
$footer = '<footer class="footer"><div class="footer-main">'
    . '<div class="footer-intro">Woodex builds interiors.</div>'
    . '<nav class="footer-column"><a id="footer-process" href="/#process">Process</a>'
    . '<a id="footer-services" href="/#services">Services</a><a id="footer-faq" href="/#faqs">FAQs</a></nav>'
    . '<nav class="footer-cols"><a id="footer-cta" href="/#page-contact">Contact</a></nav></div></footer>';
$pageWithAnchors = str_replace(
    ['href="/#process"', 'href="/#services"', 'href="/#faqs"'],
    ['href="/about/#process"', 'href="/about/#services"', 'href="/about/#faqs"'],
    wx_test_page('/about/', '<section id="page-contact">Contact form</section>')
);
$footApplied = wx_chrome_apply_html('about/index.html', $pageWithAnchors, ['regions' => ['footer'], 'footer' => $footer]);
ok(str_contains((string) $footApplied, 'id="footer-process" href="/about/#process"'), 'the footer keeps this page\'s own process anchor');
ok(str_contains((string) $footApplied, 'id="footer-services" href="/about/#services"'), 'and the services anchor');
ok(str_contains((string) $footApplied, 'id="footer-faq" href="/about/#faqs"'), 'and the FAQ anchor');
ok(str_contains((string) $footApplied, 'A sentence about this page.'), 'the page keeps its own footer intro by default');
$footAll = wx_chrome_apply_html('about/index.html', $pageWithAnchors, ['regions' => ['footer'], 'footer' => $footer, 'introAll' => true]);
ok(str_contains((string) $footAll, 'Woodex builds interiors.') && !str_contains((string) $footAll, 'A sentence about this page.'),
    'with introAll the shared intro replaces every page\'s own — which is what that switch means');

/* The `/#page-contact` fix: a link that would send this visitor back to the home page, when the section
   is right here. */
$pageContact = wx_test_page('/contact/', '<section id="page-contact">Contact form</section>');
$contactFoot = wx_chrome_apply_html('contact/index.html', $pageContact, ['regions' => ['footer'], 'footer' => $footer]);
ok(str_contains((string) $contactFoot, 'id="footer-cta" href="#page-contact"'), 'a footer link to the home page\'s contact section becomes this page\'s, where the section exists');
$pageNoContact = wx_test_page('/services/');
/* The shared footer here differs from the page's own, so the apply genuinely changes something and the
   result is a page rather than "null means nothing changed" — which is itself the honest answer when a
   footer is applied to a page that already has it. */
$footerV2 = str_replace('>Contact</a>', '>Contact us</a>', $footer);
$servicesFoot = wx_chrome_apply_html('services/index.html', $pageNoContact, ['regions' => ['footer'], 'footer' => $footerV2]);
ok(str_contains((string) $servicesFoot, '>Contact us</a>'), 'the shared footer reaches a page that had a different one');
ok(str_contains((string) $servicesFoot, 'id="footer-cta" href="/#page-contact"'), 'and a footer link to the home page stays a link to the home page where that section does not exist');
ok(str_contains((string) $servicesFoot, 'A sentence about this page.'), 'and the page still keeps its own intro');

/* ---- the design block and the header phone */
$style = '<style id="wx-chrome-style" data-cfg="banner">.site-header{--h:72px}</style>';
$phone = '<a class="wx-hphone" href="tel:+923224000768">+92 322 4000768</a>';
$styled = wx_chrome_apply_html('about/index.html', $aboutPage, ['regions' => ['design'], 'style' => $style, 'phone' => $phone]);
ok(str_contains((string) $styled, 'wx-chrome-style'), 'the design block is written into the head');
ok(strpos((string) $styled, 'wx-chrome-style') < strpos((string) $styled, '</head>'), 'and it lands before </head>');
ok(str_contains((string) $styled, 'wx-hphone') && strpos((string) $styled, 'wx-hphone') < strpos((string) $styled, 'class="header-cta"'),
    'the phone sits immediately before the header button');
$restyled = wx_chrome_apply_html('about/index.html', (string) $styled, ['regions' => ['design'], 'style' => $style, 'phone' => $phone]);
eq($restyled, null, 'applying the same design twice leaves the page alone — one style block, not two');

/* ---- what the preview and the apply agree on */
$spans = wx_chrome_spans($aboutPage);
ok(isset($spans['brand'], $spans['footer'], $spans['menuDesktop'], $spans['menuMobile']), 'every region of a real page is found by the span reader');

/* ---- the identity in the footer's contact lines: three facts, three spellings each
   The same shapes the site's own footer uses, including the `<span class="fl">E</span>` in front of the words:
   that span is why the survey reads the *last* text node inside the anchor and not the whole of it. */
$idPage = '<!doctype html><html><head><title>Contact</title></head><body>'
    . '<footer class="footer"><div class="footer-main"><div class="footer-social">'
    . '<a href="https://wa.me/923224000768" aria-label="WhatsApp"><svg viewBox="0 0 24 24"></svg></a>'
    . '<a href="tel:+923224000768" aria-label="Call"><svg viewBox="0 0 24 24"></svg></a>'
    . '<a href="mailto:info@woodex.com.pk" aria-label="Email"><svg viewBox="0 0 24 24"></svg></a></div>'
    . '<nav class="footer-column footer-contact"><h3>Get in touch</h3>'
    . '<a href="mailto:info@woodex.com.pk"><span class="fl" aria-hidden="true">E</span>info@woodex.com.pk</a>'
    . '<a href="tel:+923224000768"><span class="fl" aria-hidden="true">P</span>+92 322 4000768</a>'
    . '</nav></div></footer></body></html>';

$idLinks = wx_chrome_identity_links($idPage);
eq(array_keys($idLinks['email']), ['info@woodex.com.pk'], 'the survey reads the email out of the mailto links');
eq($idLinks['email']['info@woodex.com.pk'], 2, 'and counts every one of them, icon and words');
eq(array_keys($idLinks['phone']), ['+923224000768'], 'the phone out of the tel links');
eq($idLinks['labels']['+923224000768'] ?? null, '+92 322 4000768', 'and the words a visitor reads beside it, past the "P" span');
eq(array_map('strval', array_keys($idLinks['whatsapp'])), ['923224000768'],
    'and the WhatsApp number — the same number in its third spelling (a digit-only key is an int to PHP, so the test casts)');

$idSwapped = wx_chrome_identity_html($idPage, ['email' => 'hello@woodex.com.pk', 'phone' => '+923001234567']);
ok($idSwapped !== null && !str_contains((string) $idSwapped, 'info@woodex.com.pk'), 'the swap takes the old address off the page');
ok(str_contains((string) $idSwapped, 'href="mailto:hello@woodex.com.pk"'), 'including the link');
ok(str_contains((string) $idSwapped, '>hello@woodex.com.pk<'), 'and the address somebody reads');
ok(str_contains((string) $idSwapped, 'href="tel:+923001234567"'), 'the phone link carries the new number');
ok(str_contains((string) $idSwapped, '>+92 300 1234567<'), 'and the words beside it are formatted from it');
ok(str_contains((string) $idSwapped, 'wa.me/923001234567'), 'and the WhatsApp link follows the phone when none was sent');
eq(wx_chrome_identity_html((string) $idSwapped, ['email' => 'hello@woodex.com.pk', 'phone' => '+923001234567', 'whatsapp' => '923001234567']), null,
    'swapping to what the page already says writes nothing');
eq(wx_chrome_identity_html('<p>Ring +923224000768 or write to info@woodex.com.pk.</p>', ['email' => 'hello@woodex.com.pk', 'phone' => '+923001234567']), null,
    'a number written into a sentence is left alone — the swap follows links, and the survey is what says so');

/* The identity is a region of the same apply, not a path somebody has to remember to call: a request that
   asks for the header must not quietly rewrite the footer's phone number. */
$idRegion = wx_chrome_apply_html('contact/index.html', $idPage, ['regions' => ['identity'], 'identity' => ['email' => 'hello@woodex.com.pk']]);
ok(str_contains((string) $idRegion, 'mailto:hello@woodex.com.pk'), 'the identity rides the apply the header uses');
eq(wx_chrome_apply_html('contact/index.html', $idPage, ['regions' => ['brand'], 'identity' => ['email' => 'hello@woodex.com.pk']]), null,
    'and asking for another region does not change it');

/* TODO-DB: coverage, the diff walk and the batch write need the site tree and the tables. */
if (count(wx_page_walk(WX_SITE_ROOT)) > 10 && wx_table_exists('wx_page_versions')) {
    $cov = wx_chrome_coverage();
    ok($cov['pages'] > 50, 'the coverage count walks the site (' . $cov['pages'] . ' pages)');
    ok($cov['regions']['footer'] > 0, 'and reports how many pages have a footer');
    ok($cov['regions']['footer'] <= $cov['pages'], 'the region count can never exceed the page count');
    $diff = wx_chrome_diff(['regions' => ['cta'], 'cta' => 'Get a quote'], ['limit' => 3]);
    eq(count($diff['changed']), 3, 'the preview stops at the limit it was given');
    ok($diff['scanned'] > 3, 'and reports how many pages it read to find them');
    /* The survey is the same walk, read for the three facts instead of the regions. It is the only place in
       the API that says what the *site* says, as opposed to what a setting says. */
    $survey = wx_chrome_identity();
    eq($survey['email'], 'info@woodex.com.pk', 'the identity survey finds the address the pages themselves carry');
    eq($survey['phone'], '+923224000768', 'and the number the links point at');
    eq($survey['phoneDisplay'], '+92 322 4000768', 'and the words beside it, as the page spells them');
    ok($survey['withEmail'] > 50, 'and says how many pages carry it (' . $survey['withEmail'] . ' of ' . $survey['scanned'] . ')');
    ok($survey['links']['phone'] >= $survey['withPhone'], 'the link count can never be below the page count');
    ok(count($survey['others']['email']) >= 1 && $survey['others']['email'][0]['value'] === 'info@woodex.com.pk',
        'and the values it found, most common first');
    ok($survey['company']['email'] !== '' && array_key_exists('matches', $survey), 'with the studio record beside them, compared');
} else {
    skip('the chrome coverage and diff need the site tree and migration 011');
}

/* ================================================== Phase 3 · the content CMS
   The claim this slice makes is narrow and testable: **nothing a browser sends reaches a published page
   as markup.** v2.1 took a composed HTML document from the browser and stored it; here an item is data
   and the server renders it. These tests are the evidence for that sentence. */

/** An item in the shape the editor sends, ready to render. */
function wx_test_item(array $over = []): array
{
    return array_replace([
        'id' => 7,
        'type' => 'post',
        'status' => 'draft',
        'slug' => 'how-we-quote',
        'title' => 'How we quote a project',
        'rel' => null,
        'url' => null,
        'data' => [
            'hero' => ['kicker' => 'Process', 'dek' => 'From first call to a signed quote.', 'category' => 'Process', 'readTime' => '5 min read'],
            'sections' => [
                ['kind' => 'lead', 'text' => 'A quote is a promise.'],
                ['kind' => 'heading', 'text' => 'What we measure'],
                ['kind' => 'para', 'text' => "First line.\nSame paragraph, next line.\n\nSecond paragraph."],
                ['kind' => 'list', 'items' => ['Site visit', 'Measurements']],
            ],
        ],
        'seo' => ['title' => 'How we quote', 'desc' => 'The quoting process.', 'og' => '', 'kw' => 'quoting', 'related' => []],
        'tpl' => null,
        'order' => 0,
        'imported' => false,
        'publishAt' => null,
        'publishedAt' => '2026-10-14 09:00:00',
        'createdAt' => '2026-10-01 10:00:00',
        'createdBy' => 'Owner',
        'updatedAt' => null,
        'updatedBy' => '',
    ], $over);
}

/* ---- the body renders, and what it renders is escaped */
$body = wx_content_body(wx_test_item());
ok(str_contains($body['html'], '<h1 id="dx-title">How we quote a project</h1>'), 'the article title becomes the page h1');
ok(str_contains($body['html'], '<p class="dx-lead">A quote is a promise.</p>'), 'the lead renders');
ok(str_contains($body['html'], '<h2>What we measure</h2>'), 'a level-2 heading renders as h2');
ok(substr_count($body['html'], '<p>') >= 2, 'a blank line in a paragraph becomes two paragraphs');
ok(str_contains($body['html'], '<br>'), 'and a single newline becomes a line break');
ok(str_contains($body['html'], '<ul class="dx-list"><li>Site visit</li><li>Measurements</li></ul>'), 'a list renders as a list');

$evil = wx_test_item(['title' => 'Fees & <script>alert(1)</script>', 'data' => ['sections' => [['kind' => 'para', 'text' => 'Pay <b>now</b> — 5 < 10']]]]);
$evilBody = wx_content_body($evil);
ok(!str_contains($evilBody['html'], '<script'), 'a script tag in the title is not a script tag in the page');
ok(str_contains($evilBody['html'], '&lt;script&gt;'), 'it is the text the editor typed, escaped');
ok(str_contains($evilBody['html'], '&lt;b&gt;now&lt;/b&gt;') && str_contains($evilBody['html'], '5 &lt; 10'),
    'and markup inside a paragraph is text too — the server renders, the browser never composes');
$ampTitle = wx_content_body(wx_test_item(['title' => 'Fees & charges', 'seo' => ['title' => 'Fees & charges', 'desc' => 'Rates.', 'og' => '', 'kw' => '', 'related' => []]]));
ok(str_contains($ampTitle['html'], 'Fees &amp; charges'), 'an ampersand in a title is escaped as an entity');

/* ---- the refusals: a section the renderer does not know, an empty body, a javascript: link */
try {
    wx_content_section(['kind' => 'iframe', 'text' => 'x']);
    ok(false, 'an unknown section kind should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'Unknown section'), 'an unknown section is refused rather than silently dropped: ' . $e->getMessage());
}
try {
    wx_content_body(wx_test_item(['data' => ['sections' => []]]));
    ok(false, 'an article with no body should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'no body'), 'an article with no sections is refused: ' . $e->getMessage());
}
try {
    wx_content_section(['kind' => 'cta', 'label' => 'Call', 'href' => 'javascript:alert(1)']);
    ok(false, 'a javascript: link should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'https://'), 'a button that runs code is refused: ' . $e->getMessage());
}
ok(wx_content_section(['kind' => 'cta', 'label' => 'Call the studio', 'href' => '/contact/']) ===
    '<aside class="dx-cta"><a class="btn" href="/contact/">Call the studio</a></aside>', 'and a real button renders');
ok(wx_content_url('https://example.com/quote') === 'https://example.com/quote', 'an https link is allowed');
try {
    wx_content_url('//evil.example.com/x');
    ok(false, 'a protocol-relative link should be refused');
} catch (Throwable $e) {
    ok(true, 'a protocol-relative link is refused');
}

/* ---- images come from the media library, and nothing else */
try {
    wx_content_section(['kind' => 'image', 'url' => '/assets/js/site.js']);
    ok(false, 'a script path should not pass as an image');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'media library'), 'an image section only accepts a media-library image: ' . $e->getMessage());
}
$img = wx_content_section(['kind' => 'image', 'url' => '/assets/img/kitchen.webp', 'alt' => 'A kitchen']);
ok(str_contains($img, 'src="/assets/img/kitchen.webp"') && str_contains($img, 'alt="A kitchen"'), 'a real image renders with its alt text');
ok(!str_contains($img, 'srcset'), 'and no srcset for derivatives the site does not have');
try {
    wx_content_body(wx_test_item(['data' => ['hero' => ['image' => '/assets/css/site.css'], 'sections' => [['kind' => 'lead', 'text' => 'x']]]]));
    ok(false, 'a stylesheet should not pass as a hero image');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'media library'), 'the hero image has to be an image: ' . $e->getMessage());
}

/* ---- the shell: the site's page furniture, with the article's head and main */
$shell = '<!doctype html><html><head><title>Insights — Woodex</title><meta name="description" content="Notes."></head>'
    . '<body class="page-insights"><header class="site-header"><nav class="desktop-nav"></nav></header>'
    . '<main id="main-content"><section class="hx-hero">the list page hero</section></main>'
    . '<footer class="footer"></footer></body></html>';
$item = wx_test_item(['url' => '/insights/how-we-quote/', 'rel' => 'insights/how-we-quote/index.html', 'status' => 'published']);
$page = wx_content_render($item, wx_content_body($item)['html'], $shell);
ok(str_contains($page, '<header class="site-header">'), 'the published page keeps the site header');
ok(str_contains($page, '<footer class="footer">'), 'and the footer');
ok(!str_contains($page, 'the list page hero'), 'and does not keep the list page\'s hero — the <main> is replaced whole');
ok(str_contains($page, '<title>How we quote · Woodex Interiors</title>'), 'the title comes from the item\'s SEO title');
ok(str_contains($page, '<link rel="canonical" href="https://woodex.com.pk/insights/how-we-quote/">'), 'the canonical address is the page\'s own');
ok(str_contains($page, '<meta property="og:description" content="The quoting process.">'), 'a social card tag the shell did not have is added');
ok(substr_count($page, '<main') === 1, 'the page has exactly one main element');

/* ---- the item rules: addresses are the ones the site can serve */
$clean = wx_content_clean(['type' => 'post', 'title' => '  How we quote  ', 'slug' => 'How-We-Quote', 'data' => ['sections' => []], 'seo' => ['desc' => 'x']]);
eq($clean['slug'], 'how-we-quote', 'a slug is lower-cased');
eq($clean['title'], 'How we quote', 'a title is trimmed');
ok(strlen($clean['seo']['desc']) <= 200, 'the description is clipped to what a search result shows');
foreach ([['type' => 'widget', 'title' => 'x', 'slug' => 'y'], ['type' => 'post', 'title' => '', 'slug' => 'y'], ['type' => 'post', 'title' => 'x', 'slug' => '-bad-']] as $i => $bad) {
    try {
        wx_content_clean($bad, null);
        ok(false, 'an invalid item should be refused (case ' . $i . ')');
    } catch (Throwable $e) {
        ok(true, 'refused case ' . $i . ': ' . substr($e->getMessage(), 0, 70));
    }
}
$published = ['id' => 3, 'slug' => 'how-we-quote', 'rel' => 'insights/how-we-quote/index.html'];
try {
    wx_content_clean(['type' => 'post', 'title' => 'T', 'slug' => 'a-new-address', 'data' => [], 'seo' => []], $published);
    ok(false, 'a published page\'s address should be immutable');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'cannot be changed'), 'a live address cannot be rewritten: ' . $e->getMessage());
}
ok(wx_content_clean(['type' => 'testimonial', 'title' => 'A happy client', 'data' => [], 'seo' => []])['slug'] === '',
    'a testimonial has no address of its own — it appears inside pages, not as a page');


/* ---- heroes: the geometry is read once and written at the same bytes (v2.1's Hero slides screen) */
/* The three heroes below are lifted verbatim from the live site: a city page, the insights hub, and the
   home page's slider (two of its three slides, with the arrows dropped). Nothing here is invented
   markup — the point of the rule is that it reads the pages that exist. */
$BAH = <<<'WXHERO'
<section class="ct-hero" aria-labelledby="city-hero-title">
      <figure class="ct-hero-media" aria-hidden="true"><img src="/assets/img/img-469cf01b2548.jpg" alt="" width="3000" height="4000" loading="lazy" decoding="async"></figure>
      <div class="ct-wrap ct-hero-grid">
        <div class="ct-hero-copy" data-ct-reveal="">
          <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>→</span><span>Bahawalpur</span></nav>
          <p class="ct-label">Where we work</p>
          <h1 id="city-hero-title">Interior design in Bahawalpur</h1>
        </div>
        <div class="ct-hero-note" data-ct-reveal="">
          <p>Our studio is at M-71, Zainab Tower, Model Town Link Road, Lahore, and we serve Bahawalpur from it. Site visits are grouped into planned rounds covering each stage of the work.</p>
          <div class="actions"><a class="btn" href="/contact/">Start a Bahawalpur project</a><a class="btn btn-light" href="/insights/design-process-explained/">How we work</a></div>
        </div>
      </div>
    </section>
WXHERO;
$INS = <<<'WXHERO'
<section class="hx-hero" aria-labelledby="insights-hero-title">
      <div class="hx-wrap">
        <p class="hx-kicker" data-ih-reveal="">Notes from the studio</p>
        <h1 id="insights-hero-title" data-ih-reveal="">Ideas for better spaces.</h1>
        <p class="hx-intro" data-ih-reveal="">Practical reading on cost, process and planning, from our Lahore studio.</p>
      </div>
      <div class="hx-wordmark" aria-hidden="true">INSIGHTS</div>
    </section>
WXHERO;
$HOME = <<<'WXHERO'
<section class="hm-hero" id="hm-hero" aria-roledescription="carousel" aria-label="Woodex services">
      <div class="hm-slides" id="hm-slides" aria-live="off">
        <article class="hm-slide is-active" data-home-slide="0" aria-hidden="false">
          <figure class="hm-slide-image"><img src="/assets/img/img-c349a92a4ae0.webp" alt="Warm contemporary living room with timber detailing and wide city views" fetchpriority="high" width="2240" height="1120"></figure>
          <div class="hm-wrap hm-hero-content">
            <div class="hm-hero-copy hm-slide-copy">
              <div class="hm-slide-text"><p class="hm-kicker">Design and build · Lahore</p><h1 class="hm-hero-title" id="home-hero-title">Spaces shaped by purpose and identity</h1></div>
              <div class="hm-hero-aside"><p>From the first sketch to final handover, design, build and furniture stay with one accountable team.</p><div class="actions"><a class="hm-btn hm-btn-light" href="/contact/" data-page-route="contact">Start your project</a><a class="hm-btn hm-btn-ghost" href="#home-services">Explore services</a></div></div>
            </div>
            <strong class="hm-display" aria-hidden="true">INTERIORS</strong>
            <div class="hm-hero-footer"><div class="hm-hero-meta"><span>Interior design · Fit-out · Renovation</span><span>Architecture · 3D Studio · Furniture</span></div></div>
          </div>
        </article>
        <article class="hm-slide" data-home-slide="1" aria-hidden="true">
          <figure class="hm-slide-image"><img src="/assets/img/img-1d6ad6c77d0f.webp" alt="Contemporary office interior with workstations and warm timber finishes" width="1920" height="1280" loading="lazy" decoding="async"></figure>
          <div class="hm-wrap hm-hero-content">
            <div class="hm-hero-copy hm-slide-copy">
              <div class="hm-slide-text"><p class="hm-kicker">Commercial spaces · Built to work</p><h2 class="hm-hero-title">Workplaces planned around people and performance</h2></div>
              <div class="hm-hero-aside"><p>Clear layouts, coordinated services and practical details turn an empty shell into a workplace ready for day one.</p><div class="actions"><a class="hm-btn hm-btn-light" href="/contact/" data-page-route="contact">Start your project</a><a class="hm-btn hm-btn-ghost" href="/fit-out/" data-page-route="fitout-hub">Explore fit-out</a></div></div>
            </div>
            <strong class="hm-display" aria-hidden="true">WORKPLACE</strong>
            <div class="hm-hero-footer"><div class="hm-hero-meta"><span>Strategy · Planning · Delivery</span><span>One team from shell to handover</span></div></div>
          </div>
        </article>
        
      </div>
      <div class="hm-wrap hm-slider-controls" aria-label="Hero slider controls">
        <div class="hm-slider-dots" role="group" aria-label="Choose a slide"><button class="hm-slider-dot is-active" type="button" data-home-dot="0" aria-label="Show interiors slide" aria-current="true"></button><button class="hm-slider-dot" type="button" data-home-dot="1" aria-label="Show workplace slide" aria-current="false"></button></div>
        
      </div>
    </section>
WXHERO;

$hs = wx_hero_section($BAH);
ok($hs !== null, 'the hero of a city page is found');
eq(substr($BAH, $hs['start'], 8), '<section', 'and it starts at the <section>');
eq(substr($BAH, $hs['end'] - 10, 10), '</section>', 'and ends at its own closing tag, not the first one on the page');
eq($hs['family'][0], 'ct-hero', 'a city page hero is named for its design');
eq($hs['family'][1], 'City page', 'and the name is the one a person reads');
$hf = wx_hero_fields($hs['body']);
eq($hf['title'], 'Interior design in Bahawalpur', 'the heading is the title');
eq($hf['kicker'], 'Where we work', 'the label paragraph above the heading is the kicker');
eq($hf['lead'], 'Our studio is at M-71, Zainab Tower, Model Town Link Road, Lahore, and we serve Bahawalpur from it. Site visits are grouped into planned rounds covering each stage of the work.', 'the paragraph beside it is the lead');
eq($hf['img'], '/assets/img/img-469cf01b2548.jpg', 'the photograph is the first image in the hero');
eq($hf['alt'], '', 'and its description is read as it is written, empty included');
eq($hf['b1t'], 'Start a Bahawalpur project', 'the first button is read');
eq($hf['b1h'], '/contact/', 'with its link');
eq($hf['b2t'], 'How we work', 'and so is the second');
ok($hf['crumbs'] === true, 'the breadcrumb trail is noticed');

$is = wx_hero_section($INS);
eq($is['family'][0], 'hx-hero', 'the insights hub has its own design');
$if = wx_hero_fields($is['body']);
eq($if['kicker'], 'Notes from the studio', 'a hub header has a kicker');
eq($if['lead'], 'Practical reading on cost, process and planning, from our Lahore studio.', 'a hub header has a lead');
eq($if['img'], '', 'and no photograph — which the reader says rather than guessing at');
eq($if['b1t'], '', 'nor buttons');

/* The one design a page can be switched to is marked, and v2.1 marked it with `data-wxh`. */
eq(wx_hero_family('<section class="wxh wxh--split" data-wxh="split">')[0], 'tpl-split', 'a page switched to a design says so on its section');
eq(wx_hero_family('<section class="wxh wxh--split" data-wxh="split">')[1], 'Template: Split', 'and the list reads the design name');
eq(wx_hero_family('<section class="ab-hero">')[0], 'custom', 'a hero with a design of its own is a one-off, not an error');
eq(wx_hero_family('<section class="ab-hero">')[2], 'ab-hero', 'and the class it carries is kept as the note');
eq(wx_hero_family('<section class="hm-hero" id="hm-hero">')[1], 'Home slider', 'the home page is named as the slider it is');
eq(wx_hero_family('<section class="wrap">')[0], 'none', 'a section that is not a hero is not one');

/* ---- editing in place: only the bytes of the field that changed */
$one = wx_hero_apply($hs['body'], ['title' => 'Interior design in Multan']);
eq(wx_hero_fields(wx_hero_section($one)['body'])['title'], 'Interior design in Multan', 'a title set in place is read back');
ok(str_contains($one, 'data-ct-reveal=""') && str_contains($one, 'img-469cf01b2548.jpg'), 'and nothing else in the section moved');
eq(wx_hero_apply($hs['body'], ['title' => 'Interior design in Bahawalpur']), $hs['body'], 'a value that is already there is not a change');
$esc = wx_hero_apply($hs['body'], ['title' => 'Paint & varnish <script>alert(1)</script>']);
ok(str_contains($esc, '&amp;') && !str_contains($esc, '<script>'), 'a title going into a page is escaped, always');
$multi = wx_hero_apply($hs['body'], ['kicker' => 'Where we build', 'lead' => 'A shorter line.', 'b1t' => 'Talk to us', 'b1h' => '/contact-us/']);
$mf = wx_hero_fields(wx_hero_section($multi)['body']);
ok($mf['kicker'] === 'Where we build' && $mf['lead'] === 'A shorter line.', 'several fields can change at once');
ok($mf['b1t'] === 'Talk to us' && $mf['b1h'] === '/contact-us/', 'buttons included');
ok(str_contains($multi, 'How we work'), 'and the button that did not change is untouched');
try {
    wx_hero_apply($is['body'], ['img' => '/assets/img/photo.webp']);
    ok(false, 'setting a field this hero has no place for must be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'no place for') && str_contains($e->getMessage(), 'img'), 'a field with no home is refused by name: ' . substr($e->getMessage(), 0, 60));
}
eq(wx_hero_apply($is['body'], ['img' => '']), $is['body'], 'and asking for its absence is not an error');

/* ---- the home slider, read and written as slides */
$home = wx_hero_section($HOME);
eq($home['family'][1], 'Home slider', 'the home page hero is the slider');
$read = wx_hero_read_home($home['body']);
eq(count($read['slides']), 2, 'two slides are read');
eq($read['slides'][0]['title'], 'Spaces shaped by purpose and identity', 'the first slide keeps its words');
eq($read['slides'][0]['word'], 'INTERIORS', 'the big word is read');
eq($read['slides'][0]['m1'], 'Interior design · Fit-out · Renovation', 'and the first info line');
eq($read['slides'][0]['m2'], 'Architecture · 3D Studio · Furniture', 'and the second');
eq($read['slides'][0]['off'], false, 'a slide with no switch is showing — `aria-hidden` is not the switch');
ok(wx_hero_slide_off('<article class="hm-slide" data-hm-off hidden>') === true, 'and the attribute the site\'s script reads is the switch');
eq($read['interval'], 5, 'with no interval written down the default is five seconds');
ok(str_contains($read['slides'][1]['title'], 'Workplaces'), 'the second slide is its own');

$slide = wx_hero_build_slide(['title' => 'A new slide', 'kicker' => 'New', 'lead' => 'Words.', 'img' => '/a.webp', 'alt' => '', 'b1t' => 'Go', 'b1h' => '/contact/', 'word' => 'NEW', 'm1' => 'one', 'm2' => 'two'], 2, false);
ok(str_contains($slide, '<h2 class="hm-hero-title">A new slide</h2>'), 'a slide that is not first carries an h2, not a second h1');
ok(str_contains($slide, 'loading="lazy"'), 'and its photograph is lazy — only the first one matters to the visitor');
ok(str_contains($slide, 'data-home-slide="2"'), 'the index the site\'s script navigates by is written');
$first = wx_hero_build_slide(['title' => 'First', 'img' => '/a.webp'], 0, true);
ok(str_contains($first, '<h1 class="hm-hero-title" id="home-hero-title">First</h1>'), 'the first slide carries the page\'s one h1');
ok(str_contains($first, 'fetchpriority="high"') && str_contains($first, 'is-active'), 'and is the one the browser loads first');

$off = wx_hero_slide_toggle($slide, true);
ok(str_contains($off, 'data-hm-off hidden'), 'hiding a slide marks it in both ways the browser and the script need');
ok(str_contains($off, 'A new slide'), 'and keeps its words, so hiding is not deleting');
$on = wx_hero_slide_toggle($off, false);
ok(!str_contains($on, 'data-hm-off') && !preg_match('~\shidden(?=[\s>])~', $on), 'showing it again leaves no trace of the hiding');
eq(wx_hero_slide_index($on, 0), str_replace('data-home-slide="2"', 'data-home-slide="0"', $on), 'a slide that moves up has its index rewritten');

$head = wx_hero_slide_head($slide, true);
ok(str_contains($head, '<h1 class="hm-hero-title" id="home-hero-title">A new slide</h1>'), 'promoting a slide makes it the h1');
ok(str_contains($head, 'is-active'), 'and the active one');
ok(str_contains($head, 'aria-hidden="false"'), 'and the one a screen reader is told about');
$demoted = wx_hero_slide_head($head, false);
ok(str_contains($demoted, '<h2 class="hm-hero-title">A new slide</h2>') && !str_contains($demoted, 'id="home-hero-title"'), 'and demoting it takes the id with it — two h1s on a page is two answers');

$dots = wx_hero_dots([['kicker' => 'One'], ['title' => 'Two']], 'hm-slider-dot', 'data-home-dot', 'hm-slider-dots');
eq(substr_count($dots, '<button'), 2, 'one dot per showing slide');
ok(str_contains($dots, 'is-active') && str_contains($dots, 'aria-current="true"') && str_contains($dots, 'aria-current="false"'), 'the first dot is the current one');

/* ---- the six designs */
eq(count(wx_hero_templates()), 6, 'six designs, as v2.1 had');
foreach (['image', 'split', 'center', 'plain', 'compact', 'slider'] as $t) {
    $html = wx_hero_render($t, wx_hero_sample(), 'services/demo/index.html');
    ok(str_contains($html, 'data-wxh="' . $t . '"'), 'the ' . $t . ' design can be written');
}
$img = wx_hero_render('image', wx_hero_sample(), 'services/demo/index.html');
ok(str_contains($img, 'wxh-media') && str_contains($img, '<h1 id="wxh-title">Spaces shaped by purpose</h1>'), 'the full-image design puts the photo behind the title');
$split = wx_hero_render('split', wx_hero_sample(), 'services/demo/index.html');
ok(strpos($split, '<div class="wxh-in">') < strpos($split, 'wxh-media'), 'the split design puts the photo inside the grid, after the copy');
ok(str_contains($split, 'wxh-crumbs'), 'and a page below the root gets a breadcrumb trail');
$plain = wx_hero_render('plain', array_merge(wx_hero_sample(), ['img' => '']), 'services/demo/index.html');
ok(!str_contains($plain, '<img'), 'the plain design needs no photograph, and writes none');
$slider = wx_hero_render('slider', array_merge(wx_hero_sample(), ['slides' => [wx_hero_sample(), array_merge(wx_hero_sample(), ['title' => 'Second'])]]), 'services/demo/index.html');
eq(substr_count($slider, 'wxh-slide"'), 1, 'a slider writes one active slide and the rest hidden');
ok(str_contains($slider, 'wxh-dots'), 'with dots when there is more than one');
eq(substr_count(wx_hero_render('slider', wx_hero_sample(), ''), 'wxh-dots'), 0, 'and no dots when there is only one');
try {
    wx_hero_render('carousel', wx_hero_sample(), '');
    ok(false, 'a design that does not exist must be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'Unknown hero template'), 'a design that does not exist is refused');
}
try {
    wx_hero_render('split', array_merge(wx_hero_sample(), ['title' => '']), '');
    ok(false, 'a hero with no title must be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'needs a title'), 'a hero with no title is refused — it is the h1');
}
$esc2 = wx_hero_render('image', array_merge(wx_hero_sample(), ['title' => 'A "quoted" & <b>bold</b> claim']), '');
ok(str_contains($esc2, '&amp;') && !str_contains($esc2, '<b>'), 'every word of a design is escaped on the way in');

/* ---- one h1 per page, and where a hero goes when a page has none */
$two = '<html><body><main><h1>Old heading</h1>' . $hs['body'] . '<section class="x"><h1>Another</h1></section></main></body></html>';
$fixed = wx_hero_one_h1($two);
eq(substr_count($fixed, '<h1'), 1, 'only the hero keeps its h1');
ok(str_contains($fixed, '<h2>Old heading</h2>') && str_contains($fixed, '<h2>Another</h2>'), 'the others are demoted in place, not deleted');
eq(wx_hero_crumbs('Interior design in Bahawalpur', 'bahawalpur/index.html'), '<nav class="wxh-crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>→</span><span>Interior design in Bahawalpur</span></nav>', 'a root-level page gets a two-part trail');
ok(str_contains(wx_hero_crumbs('Cost', 'insights/cost/index.html'), 'href="/insights/"'), 'a page in a section names the section');
eq(wx_hero_crumbs('Home', 'index.html'), '', 'and the home page gets none, because it is the top of the trail');
ok(wx_hero_insert('<html><body><main id="main-content"><p>x</p></main></body></html>', '<section class="wxh"></section>') === '<html><body><main id="main-content">' . "\n" . '<section class="wxh"></section><p>x</p></main></body></html>', 'a page with no hero gets one directly inside main');

/* ---- the pages a hero may live in */
ok(wx_hero_rel_ok('bahawalpur/index.html') && wx_hero_rel_ok('index.html'), 'pages are editable');
ok(!wx_hero_rel_ok('_private/backups/x/index.html') && !wx_hero_rel_ok('api/v2/index.php') && !wx_hero_rel_ok('../../etc/passwd'), 'and the machinery folders, and anything that climbs out, are not');

/* ---- what a request may say */
eq(array_keys(wx_hero_updates(['title' => '  Spaced  ', 'b1h' => '/x/', 'nonsense' => 'no'])), ['title', 'b1h'], 'a hero write carries the fields a hero has, trimmed, and nothing else');
try {
    wx_hero_updates(['title' => str_repeat('x', 201)]);
    ok(false, 'a title nobody can read on the page must be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'longer than'), 'and a field too long for the design is refused');
}

/* ---- the account command: the rules it refuses to guess */
ok(owner_login_ok('owner@woodex.com.pk'), 'an address is a sign-in name');
ok(owner_login_ok('admin'), 'and so is the bare name v2.1\'s first run wrote — the live host has one');
ok(owner_login_ok('studio.manager-1'), 'names take letters, digits, dots, dashes and underscores');
ok(!owner_login_ok('a'), 'one character is not a sign-in name');
ok(!owner_login_ok('has space'), 'nor is one with a space in it');
ok(!owner_login_ok('quote\"drop'), 'nor one with a quote in it');
ok(!owner_login_ok('ADMIN'), 'the check is on what will be stored, and that is always lower-case');
eq(owner_role(null), 'owner', 'a new account is an owner unless told otherwise');
eq(owner_role(' editor '), 'editor', 'and a role is trimmed and lower-cased before it is checked');
try {
    owner_role('manager');
    ok(false, 'a role the capability matrix does not know must be refused, not quietly created');
} catch (InvalidArgumentException $e) {
    ok(str_contains($e->getMessage(), 'Unknown role'), 'the label is not the role: "manager" is refused, "admin" is right');
}
ok(owner_pw_ok('12345678'), 'a password is at least 8 characters — v2.1\'s rule, kept');
ok(!owner_pw_ok('1234567'), 'and 7 is refused');
$opw = owner_gen_pw();
eq(strlen($opw), 20, 'a generated password is 20 characters');
ok(preg_match('~^[A-Za-z2-9]+$~', $opw) === 1 && !str_contains($opw, 'O') && !str_contains($opw, 'l') && !str_contains($opw, 'I'),
    'and has no look-alike characters — it gets typed off a screen into a phone');
ok(owner_gen_pw(24) !== $opw && strlen(owner_gen_pw(24)) === 24, 'two calls do not produce the same password');

/* ---- templates: the v2.1 rules, kept */
$tpl = wx_content_tpl_clean(['type' => 'post', 'name' => '  Deep dive  ', 'hero' => 'navy', 'sections' => [['k' => 'body', 'on' => false], ['k' => 'body', 'on' => true], ['k' => 'nonsense', 'on' => true]]]);
eq($tpl['name'], 'Deep dive', 'a template name is trimmed');
eq($tpl['hero'], 'navy', 'the hero style is kept');
eq(count($tpl['sections']), 5, 'every known section appears once, in order, even the ones the editor did not list');
ok($tpl['sections'][0]['k'] === 'body' && $tpl['sections'][0]['on'] === false, 'and the editor\'s own switch wins');
foreach ([['type' => 'shoe', 'name' => 'x'], ['type' => 'post', 'name' => '  '], ['type' => 'city', 'name' => 'Lahore', 'order' => []]] as $i => $bad) {
    try {
        wx_content_tpl_clean($bad);
        ok(false, 'an invalid template should be refused (case ' . $i . ')');
    } catch (Throwable $e) {
        ok(true, 'template refused case ' . $i . ': ' . substr($e->getMessage(), 0, 60));
    }
}
$city = wx_content_tpl_clean(['type' => 'city', 'name' => 'Lahore', 'source' => 'interior-design', 'order' => [['id' => 'hero', 'on' => true, 'label' => 'Hero'], ['id' => 'bad id!', 'on' => true]]]);
eq(count($city['order']), 1, 'a city template keeps only well-formed section ids');

/* ---- city pages: the address and the furniture are rules, not a copy-and-edit */
eq(wx_content_rel(['type' => 'post', 'slug' => 'kitchen-cost']), 'insights/kitchen-cost/index.html', 'an article lives under its section');
eq(wx_content_rel(['type' => 'study', 'slug' => 'gulberg-home']), 'projects/gulberg-home/index.html', 'a case study lives under its section');
eq(wx_content_rel(['type' => 'city', 'slug' => 'johar-town']), 'johar-town/index.html', 'a city page is root-level, where v2.1 wrote it and where the addresses are indexed');
eq(wx_content_rel(['type' => 'testimonial', 'slug' => 'ayesha']), null, 'a testimonial has no address of its own — the same rule says so');
eq(wx_content_rel(['type' => 'city', 'slug' => '']), null, 'nor has an item with no address yet');
$cityItem = wx_content_item([
    'id' => 7, 'type' => 'city', 'status' => 'draft', 'slug' => 'johar-town', 'title' => 'Interior Design in Johar Town',
    'rel' => null, 'data' => '{}', 'seo' => '{}', 'tpl_id' => null, 'flag_order' => 0, 'imported' => 0,
    'publish_at' => null, 'published_at' => null, 'created_at' => '2026-10-14 09:00:00', 'created_by' => 'Ayesha',
    'updated_at' => null, 'updated_by' => null,
]);
eq($cityItem['where'], 'johar-town/', 'a city page reads back at its root-level address');
eq($cityItem['url'], null, 'and a draft has no URL yet — the address belongs to the page, not the draft');
eq(wx_content_item(['id' => 8, 'type' => 'city', 'status' => 'published', 'slug' => 'johar-town', 'title' => 'Interior Design in Johar Town',
    'rel' => 'johar-town/index.html', 'data' => '{}', 'seo' => '{}', 'tpl_id' => null, 'flag_order' => 0, 'imported' => 0,
    'publish_at' => null, 'published_at' => '2026-10-14 09:00:00', 'created_at' => '2026-10-14 09:00:00', 'created_by' => 'Ayesha',
    'updated_at' => null, 'updated_by' => null])['url'], '/johar-town/', 'and once it is live, that is the address a person types');
/* Slugs that survive the address rule but name a folder the site uses — `_private` never gets this far,
   because an address may not begin with an underscore. */
foreach (['insights', 'projects', 'assets', 'builder', 'admin-v25'] as $bad) {
    try {
        wx_content_clean(['type' => 'city', 'title' => 'Interior Design in ' . $bad, 'slug' => $bad, 'data' => []]);
        ok(false, 'a city page must not take the address "' . $bad . '"');
    } catch (Throwable $e) {
        ok(str_contains($e->getMessage(), 'folder the site uses'), 'a city page may not take the address "' . $bad . '"');
    }
}
eq(wx_content_shell_rel('city'), 'index.html', 'with nothing chosen, a city page copies the front page — it is a rewrite of it for one city');
eq(wx_content_shell_rel('city', '', 'interior-design'), 'interior-design/index.html', 'a template that names a city copies that page, which is v2.1\'s model made explicit');
eq(wx_content_shell_rel('city', 'landing/index.html', 'interior-design'), 'landing/index.html', 'and the setting overrides the template');
eq(wx_content_shell_rel('post'), 'insights/index.html', 'an article still copies its section index');
eq(wx_content_shell_rel('member'), '', 'and a kind that is not a page has no shell at all');

/* TODO-DB: the publish path needs the tables (012) and the site tree, which the wasm harness has neither
   of. The sitemap rules are the same insertion v2.1 shipped, with the `unlisted` rule kept. */
skip('publishing an article, the sitemap and the tick need migration 012 and the site tree');

/* ==================================================== Phase 3 · the gate, as wiring
   The gate's three sentences, each one a route that exists with the permission and approval action the
   business already agreed to. The behaviour behind them is tested above (the chrome transformations, the
   composer) and in the host run (the tables); what this asserts is that nothing was renamed into a route
   the policy does not know. */

$table = wx_routes();
/** Find one route by method + pattern. */
$find = static function (string $method, string $pattern) use ($table): ?array {
    foreach ($table as $r) {
        if ($r[0] === $method && $r[1] === $pattern) {
            return ['handler' => $r[3], 'action' => $r[4], 'family' => $r[2]];
        }
    }
    return null;
};

$publish = $find('POST', 'content/{id}/publish');
ok($publish !== null && $publish['handler'] === 'wx_route_content_publish', 'the gate\'s first sentence is a route: POST content/{id}/publish');
eq($publish['action'] ?? null, 'cms_published', 'and it carries the v2.1 action that means "put this article on the site"');
$chrome = $find('POST', 'chrome');
ok($chrome !== null && $chrome['handler'] === 'wx_route_chrome_apply', 'the second: POST chrome changes the header across the site');
eq($chrome['action'] ?? null, 'global_chrome', 'through the action v2.1 used for the site-wide chrome');
$rollback = $find('POST', 'pages/rollback');
ok($rollback !== null && $rollback['handler'] === 'wx_route_pages_rollback', 'the third: POST pages/rollback undoes a whole change');
ok($find('GET', 'pages/history') !== null, 'and the history that names the change to undo is readable');
ok($find('GET', 'chrome') !== null && $find('POST', 'chrome/preview') !== null,
    'the chrome can be read and previewed before it is applied');
ok($find('POST', 'content/tick') !== null, 'and scheduled items can be published when their time comes');

/* The preview must not be a route the approval policy queues: it is a read that happens to be a POST,
   and putting it in the Master's queue would train people to approve without reading. */
/* `wx_appr_needed(role, action)`: a Manager's changes are the ones the default policy queues. */
eq(wx_appr_needed('admin', 'global_chrome'), true, 'applying the chrome is a change that can need the Master\'s approval');
eq(wx_appr_needed('admin', 'chrome_versions'), false, 'reading the chrome versions is not a change and is never queued');
eq(wx_appr_needed('admin', 'cms_save'), true, 'saving an article is a change');
/* Publishing is *not* queued, and that is v2.1's own decision kept verbatim: "published" is not one of the
   verbs the policy queues, so a Manager publishes without waiting for the Master — which is the whole point
   of having an editor who can publish. Asserting the opposite would be rewriting the business rule. */
eq(wx_appr_needed('admin', 'cms_published'), false, 'publishing an article is not queued — the policy is the one v2.1 shipped');
eq(wx_appr_needed('admin', 'global_replace'), true, 'find-and-replace across the site is a change');
eq(wx_appr_needed('owner', 'global_chrome'), false, 'the Master\'s own changes are never queued');

/* ================================================= Phase 3 · the section library
   `wx_block_ranges()` is the function that finds a global section inside a page by balancing tags. It is
   the one piece of this slice that can destroy a live page, so it is tested the way it will be used: a
   global section that contains elements of its own, including another one of its own tag. */

$sec = '<section class="band" data-wx-global="abc123"><h2>Hello</h2><p>Text</p></section>';
eq(count(wx_block_ranges($sec, 'abc123')), 1, 'a global section is found by its token');
[$a, $b] = wx_block_ranges($sec, 'abc123')[0];
eq(trim(substr($sec, $a, $b - $a)), $sec, 'and the range covers exactly the element, not a byte more');

/* Nested elements, including the same tag name — this is what depth counting is for. If the walk closed on
   the first `</section>` it found, everything after the second one's start would be swallowed. */
$nested = '<div class="page">'
    . '<section data-wx-global="a1b2c3"><div class="wrap"><section class="inner"><p>One</p></section>'
    . '<p>Two</p></div></section>'
    . '<p>After the section</p></div>';
$ranges = wx_block_ranges($nested, 'a1b2c3');
eq(count($ranges), 1, 'a section containing a section is one range');
[$a, $b] = $ranges[0];
ok(str_contains(substr($nested, $a, $b - $a), '<section class="inner">'), 'the range includes the nested element');
ok(!str_contains(substr($nested, $a, $b - $a), 'After the section'), 'and stops at the outer closing tag — a premature close would take the rest of the page with it');

/* Two instances on one page, and the replacement keeps the text between them. */
$twice = '<header>x</header>' . $sec . '<p>Middle</p>' . str_replace('Hello', 'Again', $sec) . '<footer>y</footer>';
eq(count(wx_block_ranges($twice, 'abc123')), 2, 'a section used twice on one page is two ranges');
$replaced = wx_block_replace($twice, 'abc123', '<section data-wx-global="abc123"><h2>New</h2></section>');
eq(substr_count($replaced, '<h2>New</h2>'), 2, 'both instances are replaced');
ok(str_contains($replaced, '<p>Middle</p>') && str_contains($replaced, '<footer>y</footer>'), 'and the page around them survives');

/* Tokens that share a prefix, and tokens that are not there. */
$long = str_replace('abc123', 'abc1234', $sec);
eq(count(wx_block_ranges($long, 'abc123')), 0, 'a token that is a prefix of another does not match it');
$sibling = $sec . '<section data-wx-global="abcdef"></section>';
eq(count(wx_block_ranges($sibling, 'abc123')), 1, 'and a page holding both tokens only gives up the one asked for');
eq(count(wx_block_ranges($sec, 'nothing')), 0, 'a token the page does not carry gives no range');
eq(wx_block_replace($sec, 'nothing', '<p>x</p>'), $sec, 'and replacing nothing changes nothing');

/* An element that never closes is refused rather than guessed at. */
$broken = '<section data-wx-global="abc123"><p>Nothing closes this';
eq(count(wx_block_ranges($broken, 'abc123')), 0, 'an unclosed element gives no range — the push leaves that page alone');
eq(wx_block_replace($broken, 'abc123', '<section>new</section>'), $broken, 'and does not rewrite the page');

/* Self-closing and void elements inside the section must not unbalance the count. */
$selfclose = '<section data-wx-global="abc123"><img src="/assets/img/a.webp"><br><input type="text"></section>';
[$a, $b] = wx_block_ranges($selfclose, 'abc123')[0];
ok(str_ends_with(substr($selfclose, $a, $b - $a), '</section>'), 'void elements do not end the range early');

/* ---- stamping: the token goes on the block's own root, on the copy that goes into pages */
$block = '<section class="hero"><h1>We build interiors</h1></section>';
$stamped = wx_block_stamp($block, '3f9a2c1b8d4e');
/* The attribute goes immediately after the tag name — v2.1 wrote it there too, and attribute order is
   not meaningful in HTML. What matters is that it lands on the root and only once. */
ok(str_starts_with(trim($stamped), '<section data-wx-global="3f9a2c1b8d4e"'), 'the token is added to the block\'s root element');
ok(str_contains($stamped, 'class="hero"'), 'and the rest of the opening tag is kept');
eq(wx_block_stamp($block, '3f9a2c1b8d4e'), $stamped, 'stamping is idempotent — a pushed page does not collect attributes');
try {
    wx_block_stamp('Just some text, no element', 'abc123');
    ok(false, 'a block that is not a single element should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'single element'), 'and it is refused in words a person can act on: ' . $e->getMessage());
}

/* ---- the block rules: the library refuses what would become a page's problem */
$clean = wx_block_clean(['name' => '  Services grid  ', 'html' => '<section>' . str_repeat('x', 10) . '</section>', 'cat' => 'Services', 'tags' => 'grid, SERVICES , grid', 'global' => true], null);
eq($clean['name'], 'Services grid', 'a block name is trimmed');
eq($clean['cat'], 'Services', 'a known category is kept');
eq($clean['tags'], 'grid,services', 'tags are lower-cased and deduplicated');
ok(preg_match('~^[a-f0-9]{12}$~', $clean['blk']) === 1, 'a new block gets a 12-hex token — the token that goes into pages');
eq(wx_block_clean(['name' => 'x', 'html' => '<section>y</section>', 'cat' => 'Not A Category'], null)['cat'], 'Custom',
    'an unknown category falls back to Custom rather than failing the save');
$kept = wx_block_clean(['tags' => 'one'], ['blk' => 'abc123abc123', 'name' => 'Old name', 'html' => '<section>old</section>', 'cat' => 'Hero', 'is_global' => 1]);
eq($kept['name'], 'Old name', 'an edit that carries no name keeps the stored one');
eq($kept['blk'], 'abc123abc123', 'and keeps the token, because the pages are carrying it');
ok($kept['is_global'] === 1, 'and keeps being global unless the request says otherwise');
foreach ([
    ['name' => 'x', 'html' => '<script>alert(1)</script>'],
    ['name' => 'x', 'html' => '<div onclick="go()">x</div>'],
    ['name' => 'x', 'html' => '<div style="background:url(javascript:alert(1))">x</div>'],
    ['name' => '', 'html' => '<section>x</section>'],
    ['name' => 'x', 'html' => '<div contenteditable="true">editing</div>'],
] as $i => $bad) {
    try {
        wx_block_clean($bad, null);
        ok(false, 'a block that breaks a rule should be refused (case ' . $i . ')');
    } catch (Throwable $e) {
        ok(true, 'refused: ' . substr($e->getMessage(), 0, 64));
    }
}
try {
    wx_block_clean(['name' => 'Loose text', 'html' => 'Just words', 'global' => true], null);
    ok(false, 'loose text cannot be a global section');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'single element'), 'loose text is refused as a global section: ' . $e->getMessage());
}
ok(wx_block_clean(['name' => 'Loose text', 'html' => 'Just words'], null)['is_global'] === 0,
    'but the same text is a perfectly good library block — a snippet people paste, without a token');

/* TODO-DB: the library table, usage walking the site and the push need migration 013 and the site tree. */
skip('the block library table, usage and the push need migration 013 and the site tree');

/* ============================================ Phase 3 · the page editor and the script rule
   The audit's finding F-05 was that a Manager could paste a script into a page through the builder, and the
   builder previews pages inside an authenticated session. The fix is a rule about *additions*, and these
   tests are the evidence that it is a rule about additions — not a sanitiser that rewrites pages, and not a
   blocklist that a page's own tags trip over. */

$plain = '<!doctype html><html><head><title>About</title></head><body><h1>About us</h1></body></html>';
$withTag = '<!doctype html><html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></head><body><h1>About us</h1></body></html>';

/* Keeping what a page already has is always allowed: editing a headline must not mean rewriting the
   analytics tag. */
eq(wx_code_new_tokens($withTag, $withTag), [], 'a page that keeps its own script adds no tokens');
wx_code_guard($withTag, $withTag, 'admin');
ok(true, 'and a Manager may save it — keeping is not adding');

/* Adding one is not. */
$adds = wx_code_new_tokens($withTag, $plain);
eq(count($adds), 1, 'adding a script tag to a page that had none is one new token');
try {
    wx_code_guard($withTag, $plain, 'admin', ['siteTokens' => []]);
    ok(false, 'a Manager adding a script should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'Only the owner') && str_contains($e->getMessage(), 'googletagmanager'),
        'a Manager is refused, and the message names the thing to remove: ' . mb_substr($e->getMessage(), 0, 110));
}
wx_code_guard($withTag, $plain, 'owner', ['siteTokens' => []]);
ok(true, 'the owner may add it');
/* And a tag the site already uses elsewhere is the site's, not a privilege — otherwise every new page
   would need the owner to paste the same analytics tag again. */
wx_code_guard($withTag, $plain, 'editor', ['siteTokens' => wx_code_tokens($withTag)]);
ok(true, 'and anybody may add a tag the site already uses somewhere else');

/* The tokens are the exact pieces, so a *different* script is still new. */
$other = str_replace('G-1', 'G-2', $withTag);
eq(count(wx_code_new_tokens($other, $withTag)), 1, 'a different analytics id is a different token, not a repeat');

/* Event handlers, script URLs and embeds are code too — and the encoded forms are the same token. */
$cases = [
    '<div onclick="steal()">x</div>' => 'onclick',
    '<a href="javascript:alert(1)">x</a>' => 'javascript',
    '<a href="java&#115;cript:alert(1)">x</a>' => 'entity-encoded javascript',
    '<a href="jAvA sCrIpT&#58;alert(1)">x</a>' => 'mixed case and an encoded colon',
    '<iframe src="https://example.com"></iframe>' => 'iframe',
    '<meta http-equiv="refresh" content="0;url=https://evil.example.com">' => 'meta refresh',
    '<svg><a xlink:href="javascript:alert(1)">x</a></svg>' => 'xlink:href',
    '<object data="/x"></object>' => 'object',
];
foreach ($cases as $fragment => $what) {
    $html = str_replace('<h1>About us</h1>', '<h1>About us</h1>' . $fragment, $plain);
    $new = wx_code_new_tokens($html, $plain);
    ok(count($new) >= 1, 'adding ' . $what . ' is detected as new code');
    try {
        wx_code_guard($html, $plain, 'admin', ['siteTokens' => []]);
        ok(false, $what . ' should be refused for a Manager');
    } catch (Throwable $e) {
        ok(true, $what . ' is refused for a Manager');
    }
}

/* A paragraph that *talks* about code is text. This is the false-positive half of the rule, and it matters:
   a guard that refuses a blog post about javascript: would be turned off within a week. */
$prose = str_replace('<h1>About us</h1>', '<h1>About us</h1><p>We use javascript: links nowhere, and we never write onclick= handlers. An &lt;iframe&gt; is not allowed either.</p>', $plain);
eq(wx_code_new_tokens($prose, $plain), [], 'text that mentions scripts and handlers is not code');
wx_code_guard($prose, $plain, 'admin', ['siteTokens' => []]);
ok(true, 'and saving it is allowed for anybody');

/* Structured data is data, not code — the site writes its own schema.org blocks by hand. */
$ld = str_replace('</head>', '<script type="application/ld+json">{"@type":"LocalBusiness"}</script></head>', $plain);
eq(wx_code_new_tokens($ld, $plain), [], 'an application/ld+json block is not a script for this rule');

/* ---- the page rules: a document, not a fragment; not somebody's editing session */
wx_page_html_ok($plain);
ok(true, 'a complete document passes');
try {
    wx_page_html_ok('<section>just a fragment</section>');
    ok(false, 'a fragment should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'complete document'), 'a fragment is refused: ' . mb_substr($e->getMessage(), 0, 80));
}
try {
    wx_page_html_ok(str_replace('<h1>About us</h1>', '<h1 contenteditable="true">About us</h1>', $plain));
    ok(false, 'editor markers should be refused');
} catch (Throwable $e) {
    ok(str_contains($e->getMessage(), 'editor markers'), 'editor markers are refused, and the message says why: ' . mb_substr($e->getMessage(), 0, 80));
}
try {
    wx_page_html_ok('<html><body><div data-wx-ed="1">x</div></body></html>');
    ok(false, 'data-wx-ed should be refused');
} catch (Throwable $e) {
    ok(true, 'the builder\'s own editing marker is refused too');
}

/* TODO-DB: saving, creating and restoring a page need the tables and the site tree. What is asserted above
   is the part that decides whether a save is allowed at all — the part that has to be right before it can
   touch a file. */
skip('saving, creating and restoring pages need migration 010 and the site tree');

/* ============================================================== publishing a page
   v2.1 kept a page's publication state in two places outside the file: the tags in its `<head>`, and one
   word in `_private/pages.json`. `page_meta_save` wrote both. All of the rules are in one pure function
   (`wx_page_head_plan()`), which is why they can be tested on a host with no database at all — and the two
   files it writes are named by a constant here, because the site's own sitemap and status file must not be
   edited by a test.

   One thing changes from v2.1. It had `sitemap_add()` and nothing that took an address out, so a page that
   was hidden or drafted kept its line in `sitemap.xml` for good: the studio's own "unpublish" went on
   telling Google the address was current. Here the sitemap follows the answer both ways, which is what the
   middle of this block is about. */
group('Publishing a page — the head, the status file and the sitemap');

define('WX_PAGE_STATE_FILE', WX_SITE_ROOT . '/.wx-test-pages.json');
define('WX_PAGE_SITEMAP_FILE', WX_SITE_ROOT . '/.wx-test-sitemap.xml');
$wxPubDir = WX_SITE_ROOT . '/wx-test-publish';
@mkdir($wxPubDir, 0755, true);
$wxPubRel = 'wx-test-publish/index.html';
$wxPubPage = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    . '<title>Office interior in Lahore</title>'
    . '<meta name="description" content="The old description">'
    . '<link rel="canonical" href="https://woodex.com.pk/wx-test-publish/">'
    . '</head><body><h1>Office interior</h1></body></html>';
file_put_contents(WX_SITE_ROOT . '/' . $wxPubRel, $wxPubPage);
file_put_contents(WX_PAGE_SITEMAP_FILE, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
    . "  <url><loc>https://woodex.com.pk/about/</loc><lastmod>2026-10-07</lastmod></url>\n"
    . "  <url><loc>https://woodex.com.pk/wx-test-publish/</loc><lastmod>2026-10-07</lastmod></url>\n"
    . "</urlset>\n");
@unlink(WX_PAGE_STATE_FILE);

/* ---- the two head helpers */
eq(wx_head_meta($wxPubPage, 'description'), 'The old description', 'one meta tag is read by name');
eq(wx_head_meta($wxPubPage, 'robots'), null, 'a tag the page does not have reads as null, not as an empty string');
$once = wx_head_set($wxPubPage, '~<title>.*?</title>~is', '<title>New</title>');
eq(substr_count($once, '<title>'), 1, 'a title is replaced, never added a second time');
$added = wx_head_set('<html><head></head><body>x</body></html>', '~<meta\s+name="robots"[^>]*>~i', '<meta name="robots" content="noindex, follow">');
ok(str_contains($added, '<meta name="robots" content="noindex, follow">' . "\n</head>"), 'a tag the page has not got is added inside the head');

/* ---- the rules */
$pub = wx_page_head_plan($wxPubRel, $wxPubPage, 'published', []);
eq($pub['title'], 'Office interior in Lahore', 'the title comes from the page when the request does not carry one');
ok(str_contains($pub['html'], 'rel="canonical" href="https://woodex.com.pk/wx-test-publish/"'), 'a field that was not sent is left exactly as it was');
eq($pub['listed'], true, 'a published page belongs in the sitemap');
eq($pub['noindex'], false, 'and is not held back from search');
throws('VALIDATION', 'title', fn() => wx_page_head_plan($wxPubRel, $wxPubPage, 'published', ['title' => '  ']), 'an empty title is refused, by field');
throws('VALIDATION', 'canonical', fn() => wx_page_head_plan($wxPubRel, $wxPubPage, 'published', ['canonical' => 'woodex.com.pk/x']), 'a canonical that is not a link is refused, by field');
throws('VALIDATION', 'status', fn() => wx_page_head_plan($wxPubRel, $wxPubPage, 'public', []), 'a status that is not one of the three is refused');
throws('VALIDATION', 'status', fn() => wx_page_head_plan('index.html', $wxPubPage, 'draft', []), 'the home page cannot be a draft — it is the site');

$hidden = wx_page_head_plan($wxPubRel, $wxPubPage, 'hidden', ['noindex' => false]);
eq($hidden['noindex'], true, 'a hidden page is not indexed even when the request said it could be');
ok(str_contains($hidden['html'], '<meta name="robots" content="noindex, follow">'), 'and its robots line says so');
eq($hidden['listed'], false, 'and it does not belong in the sitemap');

$desc = wx_page_head_plan($wxPubRel, $wxPubPage, 'published', ['description' => 'New words', 'noindex' => true]);
ok(str_contains($desc['html'], '<meta property="og:description" content="New words">'), 'the social description follows the description');
eq($desc['listed'], false, 'a published page held out of search is not in the sitemap either');
ok(!str_contains($desc['html'], 'The old description'), 'and the old description is replaced, not duplicated');

$blank = wx_page_head_plan($wxPubRel, $wxPubPage, 'published', ['description' => '', 'ogImage' => '']);
ok(!str_contains($blank['html'], 'name="description"'), 'an empty description removes the tag rather than writing an empty one');
ok(!str_contains($blank['html'], 'og:image'), 'and so does an empty social image');

$was = str_replace('</head>', '<meta name="robots" content="noindex, follow">' . "\n</head>", $wxPubPage);
$plain = wx_page_head_plan($wxPubRel, $was, 'published', []);
ok(strpos($plain['html'], 'noindex') === false, 'publishing a page that was held back removes the noindex line');
eq($plain['listed'], true, 'and the page goes back into the sitemap');

/* ---- the status file v2.1 wrote */
eq(wx_page_state_map(), [], "with no status file every page is published — v2.1's own default");
wx_page_state_write(['about/index.html' => ['status' => 'draft'], $wxPubRel => ['status' => 'hidden']]);
$map = wx_page_state_map();
eq(array_keys($map), ['about/index.html', $wxPubRel], 'the status file is written sorted, so two hosts produce the same file');
eq($map[$wxPubRel]['status'], 'hidden', "and a page's status is what was set");
file_put_contents(WX_PAGE_STATE_FILE, '{not json');
throws('INTERNAL', null, fn() => wx_page_state_map(), 'a corrupt status file is an error, not "everything is published"');

/* ---- the sitemap, both ways */
ok(wx_page_sitemap_set(WX_PAGE_SITEMAP_FILE, $wxPubRel, false), 'a page that stops being public is taken out of the sitemap');
ok(!wx_page_sitemap_set(WX_PAGE_SITEMAP_FILE, $wxPubRel, false), 'taking it out twice changes nothing the second time');
ok(!str_contains((string) file_get_contents(WX_PAGE_SITEMAP_FILE), 'wx-test-publish/'), 'and its address is gone from the file');
ok(wx_page_sitemap_set(WX_PAGE_SITEMAP_FILE, $wxPubRel, true), 'publishing it again puts the address back');
eq(substr_count((string) file_get_contents(WX_PAGE_SITEMAP_FILE), 'wx-test-publish/'), 1, 'exactly once — the sitemap is not a log');
ok(wx_page_in_sitemap($wxPubRel), 'and the page reads as listed');

/* ---- the three facts a screen shows about one page */
file_put_contents(WX_PAGE_STATE_FILE, json_encode([$wxPubRel => ['status' => 'draft']]));
$state = wx_page_state($wxPubRel);
eq($state['status'], 'draft', 'the status comes from the file v2.1 wrote');
eq($state['title'], 'Office interior in Lahore', 'the title comes from the page');
eq($state['indexable'], true, 'a draft whose head carries no robots line still reads as indexable — the two facts are independent');
eq($state['inSitemap'], true, 'and whether it is in the sitemap is read from the sitemap, not guessed');

if (!$WITH_DB) {
    skip('the publish write (version, audit, status file on a live page) needs migration 010 — run with --db');
} else {
    wx_page_state_write([]);
    $publish = wx_page_publish($wxPubRel, 'hidden', ['title' => 'Office interior, hidden'], ['id' => 1, 'name' => 'The suite']);
    eq($publish['status'], 'hidden', 'a publish answers with the status it set');
    ok($publish['wrote'] === true && $publish['version'] > 0, 'and the page is a new version in the history');
    ok(str_contains((string) file_get_contents(WX_SITE_ROOT . '/' . $wxPubRel), 'noindex'), 'the file itself carries the robots line');
    eq(wx_page_state_map()[$wxPubRel]['status'] ?? '', 'hidden', 'and the status file names the page');
}

/* Leave nothing behind: the harness has a real filesystem when it runs on a host. */
@unlink(WX_SITE_ROOT . '/' . $wxPubRel);
@rmdir($wxPubDir);
@unlink(WX_PAGE_STATE_FILE);
@unlink(WX_PAGE_SITEMAP_FILE);

/* ============================================================== the site theme */
group('The site theme lands in the stylesheet the site actually loads');

/* The file the live pages read. v2.1's builder wrote `assets/theme.css`, which this site does not have and
   nothing links — a port that wrote it would have looked finished and changed nothing on the site. */
eq(WX_THEME_FILE, 'assets/site.css', 'the theme is written into the stylesheet the pages link');
ok(!is_file(WX_SITE_ROOT . '/assets/theme.css'), 'and not into the theme.css that nothing loads any more');

$css = "/*! Woodex */\n:root{--navy:#0b1b33;--ink:#12212f}\nbody{color:var(--ink)}\nmain h1{font-size:44px}\n";

/* --- v2.1's validation, value for value ------------------------------------------------------------------ */
$clean = wx_theme_clean(['--wx-navy' => '#0b1b33']);
eq($clean['vars']['--wx-navy'], '#0b1b33', 'a colour comes through as chosen');
eq($clean['import'], '', 'no Google font chosen means no import line');
eq($clean['faces'], '', 'and no font files');
eq(wx_theme_clean(['--wx-navy' => '   '])['vars'], [], 'an empty value clears the setting instead of writing a blank');

throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-navy' => 'navy']), 'a colour must be a hex value');
throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-navy' => '#0b1b33;} body{display:none']), 'a colour cannot close the block');
throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-h1' => '44']), 'a size must carry its unit');
throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-h1' => '44px;} html{display:none']), 'a size cannot close the block either');
throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-preset' => 'Ink Theme']), 'a preset name is letters, numbers and dashes');
throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-font' => 'Comic Sans']), 'a font must be one the site can serve');
throws('VALIDATION', 'vars', static fn() => wx_theme_clean(['--wx-navy' => '#0b1b33', '--wx-nope' => '1']), 'a setting that is not in the list is refused');

/* A Google font is a family and a weight list, and the family goes into the import rather than the value. */
$g = wx_theme_clean(['--wx-font' => 'g:Playfair Display:400;700']);
ok(str_contains($g['import'], 'family=Playfair+Display:wght@400;700'), 'a Google font becomes an import URL');
eq($g['vars']['--wx-font'], '"Playfair Display",system-ui,sans-serif', 'and the value stored is the family itself');

/* A self-hosted family brings its own faces; Plus Jakarta Sans is the site's own, so it brings none. */
$localFont = wx_theme_clean(['--wx-font' => 'poppins']);
eq(substr_count($localFont['faces'], '@font-face'), 4, 'a self-hosted family brings four weights');
ok(str_contains($localFont['faces'], '/assets/fonts/poppins-600.woff2'), 'with the file names the site already has');
eq(wx_theme_clean(['--wx-font-head' => 'jakarta'])['faces'], '', 'the site\'s own font needs no faces of its own');

/* --- what the generated block says ----------------------------------------------------------------------- */
$block = wx_theme_block(['--wx-navy' => '#143a5c'], '', '');
ok(str_contains($block, '--wx-navy:#143a5c;'), 'the block carries the value');
ok(str_contains($block, '--navy:var(--wx-navy)'), 'and the alias that makes the site read it');
ok(str_contains($block, '--navy-2:var(--wx-navy)'), 'including the second name v2.1 gave the same colour');

/* v2.1 accepted a surface colour and only used it when a cream was chosen as well — a control that did
   nothing. The surface is aliased on its own here, and the cream still wins when both are set. */
$surface = wx_theme_block(['--wx-surface' => '#f4efe6'], '', '');
ok(str_contains($surface, '--surface:var(--wx-surface)'), 'a surface colour reaches --surface on its own');
$cream = wx_theme_block(['--wx-surface' => '#f4efe6', '--wx-cream' => '#efe6d6'], '', '');
ok(substr_count($cream, '--surface:') === 2 && strpos($cream, '--surface:var(--wx-cream)') > strpos($cream, '--surface:var(--wx-surface)'),
    'and a cream overrides it rather than fighting it');

/* The preset names the set of values; it is not a value the design reads, so it stays out of the CSS. */
$withPreset = wx_theme_block(wx_theme_clean(['--wx-navy' => '#0b1b33', '--wx-preset' => 'ink'])['vars'], '', '');
ok(!str_contains($withPreset, '--wx-preset'), 'the preset name is kept out of the stylesheet');

/* --- applying, reading back, and removing ---------------------------------------------------------------- */
$applied = wx_theme_apply($css, wx_theme_clean(['--wx-navy' => '#143a5c']));
ok(str_starts_with($applied, '/*! Woodex */'), 'the stylesheet keeps its own first byte');
ok(str_contains($applied, ':root{--navy:#0b1b33;--ink:#12212f}'), 'and its own token block, untouched');
ok(str_contains($applied, 'var(--wx-navy)'), 'while adding the chosen value below it');
eq(wx_theme_apply($applied, wx_theme_clean(['--wx-navy' => '#143a5c'])), $applied, 'applying the same settings twice changes nothing');
eq(wx_theme_strip($applied), $css, 'and removing the theme gives the file back byte for byte');
eq(wx_theme_strip(wx_theme_apply($applied, wx_theme_clean(['--wx-navy' => '#143a5c']))), $css, 'including after it has been applied twice');
ok(!str_contains(wx_theme_apply($css, ['vars' => [], 'faces' => '', 'import' => '']), 'wx:theme'), 'clearing every setting leaves no marker behind');

$readBack = wx_theme_vars($applied);
eq($readBack['--wx-navy'], '#143a5c', 'the settings read back out of the file the site is using');
eq(wx_theme_vars($css), [], 'and a stylesheet with no theme block reads back as nothing chosen');
eq(wx_theme_meta($applied)['theme'], true, 'the file is known to carry a theme');
eq(wx_theme_meta($css)['theme'], false, 'and a file without one is not');
ok(wx_theme_balanced($applied), 'the block is balanced');
ok(!wx_theme_balanced("a/* wx:theme:start */\nb"), 'a start marker with no end marker is refused, never guessed at');
ok(!wx_theme_balanced("/* wx:theme:start */a/* wx:theme:end */\n/* wx:theme:start */b/* wx:theme:end */"), 'and two blocks where there should be one is refused as well');

/* The import goes at the top because @import is only valid before any rule; the values go at the end so
   they win by order. Both are marked, so a person reading the file can see what the admin wrote. */
$withImport = wx_theme_apply($css, wx_theme_clean(['--wx-font' => 'g:Inter:400', '--wx-navy' => '#143a5c']));
ok(str_starts_with($withImport, '/* wx:theme:import:start */'), 'the font import comes before every rule');
ok(strpos($withImport, '@import') < strpos($withImport, ':root{--navy:#0b1b33'), 'because the spec requires it there');
ok(strpos($withImport, '/* wx:theme:end */') > strpos($withImport, 'body{color:var(--ink)}'), 'and the values come last, so they win');
eq(wx_theme_strip($withImport), $css, 'the import is removable too');

/* What the screen is told: which tokens are inside the theme, which are not, and whether the file agrees
   with the choice. A screen that showed only one of "chosen" and "live" would be confidently wrong. */
$tokens = wx_theme_tokens();
ok(isset($tokens['--wx-navy'], $tokens['--wx-font-head'], $tokens['--wx-preset']), 'the settings list is v2.1\'s');
eq(count(array_filter($tokens, static fn(array $t) => $t['type'] === 'color')), 13, 'with its thirteen colours');
ok(in_array('--line', wx_theme_untouched(), true), 'and the structural tokens are named as outside the theme');

/* TODO-DB: reading the file, writing it, the record and the history need the site tree and migration 010. */
skip('applying a theme needs the site tree, the version store and the audit table');

/* ============================================================== reaching out to another server */
group('A fetch goes where it is told and nowhere else');

/* Rule 1-3: the URL itself, before anything is resolved. These are v2.1's rules (audit F-06) with the
   reasons written next to them, because a rule about what may be requested is a rule somebody will one day
   want to relax. */
eq(wx_fetch_url_ok('https://www.woodex.pk/assets/img/hero.webp')['ok'], true, 'a public https link is allowed');
eq(wx_fetch_url_ok('https://WWW.Woodex.pk/x.jpg')['host'], 'www.woodex.pk', 'the host is read case-insensitively');
foreach ([
    'http://www.woodex.pk/x.jpg' => 'plain http is refused',
    'https://user:pw@www.woodex.pk/x.jpg' => 'credentials in the link are refused',
    'https://www.woodex.pk:8080/x.jpg' => 'a port other than 443 is refused',
    'https://127.0.0.1/x.jpg' => 'an IPv4 address is refused before it is resolved',
    'https://[::1]/x.jpg' => 'an IPv6 address is refused too',
    'https://localhost/x.jpg' => 'localhost is refused',
    'https://api.local/x.jpg' => '*.local is refused',
    'https://mail.internal/x.jpg' => '*.internal is refused',
    'https://v2.localhost/x.jpg' => '*.localhost is refused',
    'https://not a host/x.jpg' => 'a name that is not a name is refused',
    'ftp://www.woodex.pk/x.jpg' => 'another scheme is refused',
] as $url => $what) {
    eq(wx_fetch_url_ok($url)['ok'], false, $what);
}

/* Rule 4: the address. `::ffff:127.0.0.1` is the one that matters — it is *reserved* rather than private,
   so PHP's own flags pass it, which is exactly how a check like this gets walked around. */
foreach ([
    '8.8.8.8' => true, '1.1.1.1' => true, '2606:4700:4700::1111' => true,
    '127.0.0.1' => false, '10.1.2.3' => false, '172.16.5.5' => false, '192.168.1.1' => false,
    '169.254.169.254' => false, '0.0.0.0' => false, '::1' => false, '::' => false,
    '::ffff:127.0.0.1' => false, '::ffff:169.254.169.254' => false, 'fc00::1' => false, 'fe80::1' => false,
    '' => false, 'not-an-ip' => false,
] as $ip => $allowed) {
    eq(wx_fetch_ip_ok((string) $ip), $allowed, ($allowed ? 'public' : 'internal') . ' address ' . ($ip === '' ? '(empty)' : $ip));
}

/* Rule 6 and the shape check: a JSON answer is not a page to pick sections from, and 3 MB is the limit. */
eq(wx_fetch_html_ok("<div class=\"x\">hi</div>"), true, 'a fragment of HTML counts as a page');
eq(wx_fetch_html_ok('{"ok":true,"data":[]}'), false, 'a JSON answer is not a page');
eq(wx_fetch_html_ok(''), false, 'an empty answer is not a page');
eq(wx_fetch_html_ok(str_repeat('x', WX_FETCH_MAX_HTML + 1)), false, 'and neither is one past the size limit');

/* The transport, with a fake one: the rules are the part that has to be right, and they can be exercised
   without a network call. The map below is "what the world answers", so each test reads as one story. */
$world = static function (array $pages, array $dns = []): array {
    return [
        'resolve' => static fn(string $h): array => isset($dns[$h])
            ? ['ok' => true, 'why' => '', 'ips' => $dns[$h]]
            : ['ok' => true, 'why' => '', 'ips' => ['93.184.216.34']],
        'get' => static fn(string $u, int $max, string $accept): array => $pages[$u]
            ?? ['code' => 0, 'body' => '', 'location' => '', 'type' => ''],
    ];
};

$ok = wx_fetch_https('https://stock.example/photo.jpg', 1024, 'image/*', $world([
    'https://stock.example/photo.jpg' => ['code' => 200, 'body' => 'IMG', 'location' => '', 'type' => 'image/jpeg'],
]));
eq($ok['body'], 'IMG', 'a 200 comes back with its bytes');
eq($ok['hops'], 0, 'and with no redirect used');

/* The important one: a public link that redirects to the cloud metadata address. The first hop is fine, so
   a check that only looked at the first URL would follow this straight into the network it came from. */
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://stock.example/go', 1024, 'image/*', $world([
    'https://stock.example/go' => ['code' => 302, 'body' => '', 'location' => 'http://169.254.169.254/latest/meta-data/', 'type' => ''],
])), 'a redirect into the cloud metadata address is refused');

/* The same walk-around with a public-looking name whose address is internal: the name passes the URL rules
   and the address does not, and the address is what is checked at every hop. */
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://stock.example/go', 1024, 'image/*', $world(
    ['https://stock.example/go' => ['code' => 302, 'body' => '', 'location' => 'https://intranet.example/x', 'type' => '']],
    ['intranet.example' => ['10.0.0.5']]
)), 'a redirect to a name that resolves inside the network is refused');
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://mixed.example/x', 1024, 'image/*', $world(
    [],
    ['mixed.example' => ['93.184.216.34', '10.0.0.5']]
)), 'a name that resolves to a public and a private address is refused');
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://gone.example/x', 1024, 'image/*', $world(
    [],
    ['gone.example' => []]
)), 'and a name that does not resolve is refused, not guessed at');

/* A chain of redirects is followed to a point, then refused: an endless one holds a request open. */
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://loop.example/a', 1024, 'image/*', $world([
    'https://loop.example/a' => ['code' => 301, 'body' => '', 'location' => '/b', 'type' => ''],
    'https://loop.example/b' => ['code' => 301, 'body' => '', 'location' => '/c', 'type' => ''],
    'https://loop.example/c' => ['code' => 301, 'body' => '', 'location' => '/d', 'type' => ''],
    'https://loop.example/d' => ['code' => 301, 'body' => '', 'location' => '/e', 'type' => ''],
])), 'a redirect chain longer than three hops is refused');

/* A relative Location is resolved against what was asked for, so a site that redirects within itself works. */
$rel = wx_fetch_https('https://stock.example/a', 1024, 'image/*', $world([
    'https://stock.example/a' => ['code' => 302, 'body' => '', 'location' => '/b.jpg', 'type' => ''],
    'https://stock.example/b.jpg' => ['code' => 200, 'body' => 'IMG', 'location' => '', 'type' => 'image/jpeg'],
]));
eq($rel['url'], 'https://stock.example/b.jpg', 'a relative redirect lands on the resolved address');
eq($rel['hops'], 1, 'and counts as one hop');

throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://stock.example/missing.jpg', 1024, 'image/*', $world([
    'https://stock.example/missing.jpg' => ['code' => 404, 'body' => 'not here', 'location' => '', 'type' => 'text/html'],
])), 'a 404 is refused with the code in the message');
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://stock.example/empty', 1024, 'image/*', $world([
    'https://stock.example/empty' => ['code' => 200, 'body' => '', 'location' => '', 'type' => 'text/html'],
])), 'an empty answer is refused');
throws('VALIDATION', 'url', static fn() => wx_fetch_https('https://stock.example/huge', 10, 'image/*', $world([
    'https://stock.example/huge' => ['code' => 200, 'body' => str_repeat('x', 50), 'location' => '', 'type' => 'text/plain'],
])), 'an answer past the cap is refused rather than truncated in silence');

/* The two wrappers the routes use: a page must look like a page, and both keep the rules. */
throws('VALIDATION', 'url', static fn() => wx_fetch_page('https://stock.example/api.json', $world([
    'https://stock.example/api.json' => ['code' => 200, 'body' => '{"a":1}', 'location' => '', 'type' => 'application/json'],
])), 'the section picker refuses a JSON answer');
eq(wx_fetch_page('https://stock.example/post', $world([
    'https://stock.example/post' => ['code' => 200, 'body' => '<html><body>x</body></html>', 'location' => '', 'type' => 'text/html'],
]))['hops'], 0, 'and accepts a page, at no more than three hops');


/* ============================================================== placements */
group('A section goes into a page, or the page is left alone');

/* The kinds and their markers: v2.1's own names, because v2.1's admin writes the same markers during the
   cut-over and two conventions would mean two sections appearing where there should be one. */
eq(wx_place_marker('testimonial'), '<!--wx:testimonials-->', 'a review section is marked the way v2.1 marked it');
eq(wx_place_marker('member', true), '<!--/wx:team-->', 'and the team closes with its own marker');
throws('VALIDATION', 'kind', static fn() => wx_place_kind('posts'), 'a kind that does not appear inside a page is refused');

/* Where a section may be placed: an .html file, and not one of the site's own machinery folders. */
ok(wx_place_rel_ok('about/index.html'), 'a page in a folder is a page');
ok(!wx_place_rel_ok('_private/secret.html'), 'a file in the private folder is not');
ok(!wx_place_rel_ok('assets/report.html'), 'nor is anything under assets');
ok(!wx_place_rel_ok('../outside.html'), 'nor is a path that climbs out of the site');

/* --- the reviews section ------------------------------------------------------------------------------- */
$items = [
    ['id' => 1, 'type' => 'testimonial', 'title' => 'Ayesha Khan', 'order' => 1, 'data' => ['text' => 'Quick, tidy, and they explained the price before starting.', 'rating' => 5, 'city' => 'Lahore', 'role' => 'Homeowner', 'photo' => '/assets/img/a.webp']],
    ['id' => 2, 'type' => 'testimonial', 'title' => 'Bilal <script>alert(1)</script>', 'order' => 2, 'data' => ['text' => 'Good work', 'rating' => 4, 'city' => 'Karachi']],
    ['id' => 3, 'type' => 'testimonial', 'title' => 'Nadia Iqbal', 'order' => 3, 'data' => ['text' => 'Second project with them.', 'rating' => 4]],
];
$set = ['kicker' => '', 'heading' => '', 'design' => 'cards', 'max' => 0];

$block = wx_place_block('testimonial', $items, $set);
ok(str_contains($block, '<!--wx:testimonials-->') && str_contains($block, '<!--/wx:testimonials-->'), 'the block is wrapped in the marker pair');
ok(str_contains($block, 'class="wx-tst wx-tst--cards"'), 'and carries the design class the stylesheet keys on');
ok(str_contains($block, 'aria-labelledby="wx-tst-title"') && str_contains($block, 'id="wx-tst-title"'), 'the heading is what labels the section for a screen reader');
ok(str_contains($block, 'aria-label="5 out of 5"'), 'the stars say what they mean out loud');
ok(!str_contains($block, '<script>') && str_contains($block, '&lt;script&gt;'), 'a review title cannot become markup');
ok(str_contains($block, 'wx-av'), 'a review with no photograph gets initials');
ok(str_contains($block, '<img src="/assets/img/a.webp"') && str_contains($block, 'loading="lazy"'), 'and one with a photograph gets the picture, lazily');
eq(substr_count($block, 'class="wx-tst-card'), 3, 'every live review is in the section');

/* The five designs are the ones the studio reviewed in v2.1 — not a new interpretation of them. */
foreach (['cards', 'spotlight', 'slider', 'wall', 'band'] as $d) {
    ok(str_contains(wx_place_block('testimonial', $items, ['design' => $d] + $set), 'wx-tst--' . $d), 'the ' . $d . ' design is the one that was asked for');
}
ok(str_contains(wx_place_block('testimonial', $items, ['design' => 'nope'] + $set), 'wx-tst--cards'), 'a design the list does not know falls back to cards rather than to nothing');
eq(substr_count(wx_place_block('testimonial', $items, ['max' => 2] + $set), 'class="wx-tst-card'), 2, 'a maximum is a maximum');
ok(str_contains(wx_place_block('testimonial', $items, ['design' => 'band'] + $set), '>4.3<'), 'the band shows the average rating');
ok(!str_contains($block, 'wx-tst-avg'), 'and the cards design does not');
eq(wx_place_block('testimonial', [], $set), '', 'no live reviews means no section at all');
eq(wx_place_block('member', [], $set), '', 'and no live people means no team');

/* --- the team ------------------------------------------------------------------------------------------ */
$team = [
    ['id' => 1, 'type' => 'member', 'title' => 'Sara Malik', 'order' => 1, 'data' => ['role' => 'Interior lead', 'featured' => false, 'showContact' => true, 'phone' => '0300 1234567', 'email' => 'sara@woodex.com.pk', 'linkedin' => 'https://www.linkedin.com/in/sara']],
    ['id' => 2, 'type' => 'member', 'title' => 'Omar Riaz', 'order' => 2, 'data' => ['role' => 'Site lead', 'dept' => 'Build', 'featured' => true, 'showContact' => false, 'phone' => '0300 9999999']],
];
$teamBlock = wx_place_block('member', $team, ['kicker' => '', 'heading' => '']);
ok(strpos($teamBlock, 'Omar Riaz') < strpos($teamBlock, 'Sara Malik'), 'the featured person is printed first');
ok(str_contains($teamBlock, 'wx-team-card is-featured'), 'and marked as featured');
ok(str_contains($teamBlock, 'Interior lead &middot; ') || str_contains($teamBlock, 'Interior lead'), 'a role is printed');
ok(str_contains($teamBlock, 'tel:03001234567'), 'a chosen phone number is a call link');
ok(!str_contains($teamBlock, '0300 9999999'), 'an unchosen one is not printed at all');
ok(str_contains($teamBlock, '>LinkedIn</a>'), 'the LinkedIn link is printed whenever there is one');
eq(substr_count($teamBlock, 'mailto:'), 1, 'only the person with an address gets a mail link');

/* --- placing it: replace what is there, insert where it goes, remove when the page is taken off -------- */
$page = "<!doctype html>\n<html><body><main>\n<section class=\"hm-hero\">x</section>\n</main>\n</body></html>";
$applied = wx_place_apply($page, 'testimonial', $block);
eq($applied['plan']['action'], 'insert', 'a page with no section gets one');
eq($applied['plan']['anchor'], 'the end of main content', 'inserted at the end of main, as v2.1 did');
ok(strpos($applied['html'], $block) !== false, 'and the block is in the page verbatim');
ok(strpos($applied['html'], $block) < strpos($applied['html'], '</main>'), 'before the closing main, which is where v2.1 put it');

$again = wx_place_apply($applied['html'], 'testimonial', $block);
eq($again['plan']['action'], 'replace', 'a second push replaces the section rather than adding another');
eq(substr_count($again['html'], '<!--wx:testimonials-->'), 1, 'so there is still exactly one marker');
eq($again['html'], $applied['html'], 'and pushing the same thing again writes the same bytes, so nothing is versioned');

$removed = wx_place_apply($applied['html'], 'testimonial', '');
eq($removed['plan']['action'], 'remove', 'taking the page off the list removes the section');
eq($removed['html'], $page, 'and gives the page back exactly as it was');

/* A page that has the trust strip gets the section above it — v2.1's first anchor. */
$trust = "<html><body><main>\n<section class=\"wx-trust\">trust</section>\n</main></body></html>";
$inTrust = wx_place_apply($trust, 'member', $teamBlock);
eq($inTrust['plan']['anchor'], 'the trust strip', 'a page with a trust strip is anchored on it');
ok(strpos($inTrust['html'], '<!--wx:team-->') < strpos($inTrust['html'], 'wx-trust'), 'and the team goes above it');

/* Two kinds on one page do not eat each other. */
$both = wx_place_apply(wx_place_apply($page, 'testimonial', $block)['html'], 'member', $teamBlock)['html'];
eq(substr_count($both, '<!--wx:testimonials-->'), 1, 'the reviews keep their marker');
eq(substr_count($both, '<!--wx:team-->'), 1, 'and the team keeps its own');
ok(strpos($both, '<!--wx:testimonials-->') < strpos($both, '<!--wx:team-->'), 'in the order they were placed');

/* A page with nowhere to put a section is refused, not appended to the end of the document where nobody
   would ever see it. */
$bare = "<html><body><p>hello</p></body></html>";
eq(wx_place_apply($bare, 'testimonial', $block)['plan']['action'], 'no-anchor', 'a page with no anchor cannot take a section');
eq(wx_place_apply($bare, 'testimonial', $block)['html'], $bare, 'and is left exactly as it was');
eq(wx_place_plan($page, 'testimonial', '')['action'], 'none', 'removing a section that was never there is nothing to do');

/* The excerpt the preview screen shows: a sentence either side, not the whole page. */
$at = (int) wx_place_plan($applied['html'], 'testimonial', $block)['at'];
$ex = wx_place_excerpt($applied['html'], $at);
ok(str_contains($ex['at'], 'wx:testimonials'), 'the preview points at the marker');
ok($ex['before'] !== '' && strlen($ex['before']) <= 200, 'with what comes before it');
ok(strlen($ex['after']) <= 300 && strlen($ex['after']) < strlen($applied['html']), 'and only as much of the page as shows where it lands');

/* --- the settings -------------------------------------------------------------------------------------- */
/* v2.1's shape, kept so the old admin screen reads the same truth during the cut-over: the state carries
   `placements`, one list of pages per kind plus a `<kind>Set` record beside it. The names come from the map
   itself — a kind that is not in it has no marker, and so could not be written into a page at all. */
eq(array_keys(WX_PLACE_KINDS), ['testimonial', 'member'], 'the two kinds are v2.1\'s two kinds');
eq(WX_PLACE_KINDS['testimonial']['marker'], 'testimonials', 'and the key the old admin reads is the one it wrote');
eq(array_keys(WX_PLACE_DESIGNS), ['cards', 'spotlight', 'slider', 'wall', 'band'], 'with the five designs it offered, in its order');
skip('reading and saving placements needs the database (wx_place_state reads, wx_place_save replaces the map)');
skip('the push writes pages through wx_page_write_many and needs the site tree and the database');


/* ============================================================== the legacy bridge's parameter names */
group('A v2.1 caller keeps its own words');

/* v2.1 names a page `path`; the route that reads it says `rel`. Translating is the whole job of this
   function, and getting it wrong is invisible until somebody opens the old page screen. */
eq(wx_legacy_params(['path' => 'rel'], ['path' => 'about/index.html'], []), ['rel' => 'about/index.html'], 'v2.1\'s `path` arrives as the route\'s `rel`');
eq(wx_legacy_params(['path' => 'rel'], [], ['path' => 'insights/a-post/index.html']), ['rel' => 'insights/a-post/index.html'], 'and is found in the query string when the caller sent it there');
eq(wx_legacy_params(['id'], ['id' => '17'], []), ['id' => 17], 'an integer parameter stays an integer');
eq(wx_legacy_params(['id'], [], ['id' => '17']), ['id' => 17], 'from the query too');
throws('VALIDATION', 'path', static fn() => wx_legacy_params(['path' => 'rel'], [], []), 'a missing parameter names the key the caller used, not the route\'s');
throws('VALIDATION', 'id', static fn() => wx_legacy_params(['id'], ['id' => ''], []), 'and an empty id is missing, not zero');

/* The copies v2.1 saved. The name is the caller's, so it is validated as a whole rather than cleaned up. */
ok(wx_page_backup_name_ok('20261013-141530-482.html'), 'a saved copy is named by its stamp');
ok(wx_page_backup_name_ok('20261013-141530.html'), 'with or without milliseconds');
ok(!wx_page_backup_name_ok('../../index.html'), 'a path that climbs out of the backup folder is not a name');
ok(!wx_page_backup_name_ok('index.html'), 'nor is a page');
ok(!wx_page_backup_name_ok('20261013-141530-482.html.bak'), 'nor is a copy of a copy');
eq(wx_page_backup_slug('insights/my-post/index.html'), 'insights_my_post_index_html', 'the folder per page is v2.1\'s own mangling, so its files are still found');
ok(str_ends_with(wx_page_backup_dir('index.html'), '/backups/index_html'), 'and it sits where v2.1 kept it, under _private/backups');
throws('VALIDATION', 'file', static fn() => wx_page_backup_read('index.html', 'nope.html'), 'reading a copy whose name is not a name is refused');
throws('VALIDATION', 'rel', static fn() => wx_page_backup_dir('../outside.html'), 'and a page path is validated before it is turned into a folder');

/* ---- forms: what the pages actually do with an enquiry (v2.1's Forms screen, `p18e-lib.php`) */
/* The markup below is lifted from the live pages. That matters more here than anywhere else: v2.1's screen
   looked for its OWN patterns (`WXForms.send('contact')`, `data-form="…"`) and would have found nothing on a
   site whose forms post to Netlify functions — six forms, "0 submissions", no reason given. These assertions
   are what makes the reader's second half (where the enquiry really goes) checkable. */

$live_contact = <<<'HTML'
<form class="ct-form" id="visit-form" novalidate>
  <div class="ct-field"><label for="cf-name">Name</label><input id="cf-name" name="name" type="text" required></div>
</form>
<script>f.addEventListener('submit',function(e){e.preventDefault();
fetch('/.netlify/functions/enquiry-submit',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({name:name,phone:phone})})});</script>
HTML;

$live_brief = <<<'HTML'
<form class="form-card" id="brief-form" data-anim=""><h3>Send your brief</h3>
<p class="form-status" id="form-status" role="status">Your email app will open with the brief ready to review and send.</p></form>
<script>var to='mailto:info@woodex.com.pk?subject='+encodeURIComponent(brief);</script>
HTML;

$live_estimator = <<<'HTML'
<form id="est-form" novalidate>
  <input id="est-name" type="text"><input id="est-phone" type="tel">
  <button class="est-btn" type="submit" id="est-submit">Get my detailed quote</button>
</form>
<script>fetch("/.netlify/functions/estimator-submit", { method: "POST" });</script>
HTML;

$live_fitout = <<<'HTML'
<form class="hub-form" id="fitout-hub-form"><button class="btn" type="submit">Send</button></form>
HTML;
$live_quote = <<<'HTML'
<form class="fitout-quote-form" id="fitout-quote-form"><button type="submit">Send</button></form>
HTML;
$live_v21 = <<<'HTML'
<script>WXForms.send('contact', {name: n});</script>
HTML;

$ev = wx_form_evidence($live_contact);
eq($ev['forms'], ['contact'], 'the contact page is found by the id its form carries — not by a pattern this site never wrote');
eq($ev['endpoints'], ['/.netlify/functions/enquiry-submit'], 'and the address it posts to is named, in full');
$land = wx_form_landing($ev['endpoints']);
ok(!$land['lands'], 'a Netlify function is not a place whose leads arrive in this console');
eq($land['label'], 'A Netlify function', 'so the screen has something true to say instead of "0 submissions"');
ok(!wx_form_landing(['/api/forms.php'])['lands'] === false, 'this site\'s own API is one whose leads do land here');
ok(wx_form_landing(['/api/forms.php'])['lands'], 'and it says so');
ok(wx_form_landing([])['label'] === 'Nothing — no form posts anywhere', 'a page whose form posts nowhere says that, and is not confused with a page that posts elsewhere');
ok(str_contains(wx_form_landing(['https://formspree.io/f/xyz'])['label'], 'Formspree') || wx_form_landing(['https://formspree.io/f/xyz'])['lands'] === false, 'a third-party form host is not mistaken for this site');

eq(wx_form_evidence($live_brief)['forms'], ['brief'], 'the 3D brief page carries the brief form');
eq(wx_form_landing(wx_form_evidence($live_brief)['endpoints'])['label'], 'The visitor\'s mail app (mailto)', 'and its "send" opens the visitor\'s own mail app, which no console ever sees');
eq(wx_form_evidence($live_estimator)['forms'], ['estimator'], 'the estimator page is the estimator form');
eq(wx_form_evidence($live_fitout)['forms'], ['fitout-hub'], 'the fit-out hub form answers to its own name');
eq(wx_form_evidence($live_quote)['forms'], ['office-fitout'], 'and the office fit-out quote form to its own');
eq(wx_form_evidence($live_v21)['forms'], ['contact'], 'v2.1\'s own pattern still finds a form, so a page not yet moved is not lost');
ok(!wx_form_marked('<form id="est-form-2">', 'est-form'), 'a similar id does not answer for the form itself');
ok(wx_form_marked('<form class="ct-wrap ct-form" id="x">', 'ct-form'), 'and a class among others does');
ok(!wx_form_evidence('<p>no form here</p>')['forms'], 'a page with no form has no forms');

/* The reader refuses to guess: an address it does not know is reported as itself. */
$odd = wx_form_evidence('<script>fetch("/submit-enquiry.php", {method:"POST"})</script>');
ok(in_array('/submit-enquiry.php', $odd['unmanaged'], true), 'a submit address nobody listed is shown by name, not swallowed');
ok(!in_array('/assets/js/estimator-rates.js', wx_form_evidence('<script src="/assets/js/estimator-rates.js"></script>')['unmanaged'], true), 'while an ordinary script is not mistaken for an endpoint');

/* The settings. Checked here because these addresses are where a lead is announced: a typo is a lead nobody hears about. */
$clean = wx_form_clean(['alertTo' => 'Nabeel@woodex.com.pk, sales@woodex.com.pk', 'waTo' => '+92 322 4000768', 'waAlert' => 1, 'reply' => 'yes', 'replyText' => 'Thanks — we will call you back.'], 'Contact form');
eq($clean['alertTo'], 'nabeel@woodex.com.pk, sales@woodex.com.pk', 'addresses are lower-cased and kept in the order they were typed');
eq($clean['waTo'], '923224000768', 'a WhatsApp number is kept as digits with the country code, which is what the link needs');
eq($clean['reply'], true, 'a checkbox that came back as anything truthy is on');
eq($clean['waAlert'], true, 'and so is the WhatsApp alert');
throws('VALIDATION', 'alertTo', static fn() => wx_form_clean(['alertTo' => 'not-an-email'], 'Contact form'), 'something that is not an address is refused, by the field');
throws('VALIDATION', 'waTo', static fn() => wx_form_clean(['waTo' => '0300 123'], 'Contact form'), 'and a number without a country code is refused rather than dialled');
throws('VALIDATION', 'replyText', static fn() => wx_form_clean(['replyText' => str_repeat('x', 1001)], 'Contact form'), 'an auto-reply longer than a thousand characters is refused');
eq(wx_form_clean([], 'Contact form')['alertTo'], '', 'an empty form is a valid form — alerts off is a choice, not an error');

/* ---- the rate book: the figures every quotation starts from */
$rates = json_decode(<<<'JSON'
{"services":[
 {"key":"interior-design","label":"Interior Design","hint":"Concept and drawings","unit":"sqft","rates":{"essential":150,"standard":250,"premium":400}},
 {"label":"Office Fit-Out","unit":"views","ratings":{},"rates":{"essential":900,"standard":1200,"premium":1600}}
],"finishes":[{"key":"premium","label":"Premium Plus"}],"terms":["50% on order, 50% on handover"],
 "catalog":[{"cat":"Civil","desc":"Wall demolition","rate":45000},{"cat":"","desc":"","rate":10}]}
JSON, true);
$est = wx_est_clean($rates);
eq(count($est['services']), 2, 'every service is kept');
eq($est['services'][1]['key'], 'office-fit-out', 'a service with no key is keyed from its name, so the page can read it');
eq($est['services'][1]['unit'], 'views', 'a unit of views is the paid-ads one');
eq($est['services'][0]['rates']['standard'], 250, 'and the three rates are whole rupees');
eq(array_column($est['finishes'], 'key'), ['essential', 'standard', 'premium'], 'the three finishes are always present, in order, cheapest first');
eq($est['finishes'][2]['label'], 'Premium Plus', 'a renamed one keeps its new name');
eq($est['finishes'][0]['label'], 'Essential', 'and one that was never renamed falls back to its own');
eq(count($est['catalog']), 1, 'a catalog line with no description is dropped rather than shown blank');
eq($est['terms'], ['50% on order, 50% on handover'], 'the terms travel with the figures, because a quote prints them');

throws('VALIDATION', 'services', static fn() => wx_est_clean(['services' => [], 'finishes' => []]), 'a rate book with no services is refused');
throws('VALIDATION', 'services', static fn() => wx_est_clean(['services' => [['label' => 'Design', 'rates' => ['essential' => 300, 'standard' => 200, 'premium' => 400]]], 'finishes' => []]), 'rates that go DOWN are refused — Essential ≤ Standard ≤ Premium');
throws('VALIDATION', 'services', static fn() => wx_est_clean(['services' => [['label' => 'Design', 'rates' => ['essential' => 0, 'standard' => 200, 'premium' => 400]]], 'finishes' => []]), 'and a zero rate is refused: it is how a service gets quietly dropped from every quote');
throws('VALIDATION', 'services', static fn() => wx_est_clean(['services' => [['label' => 'Design', 'rates' => ['essential' => 1, 'standard' => 2, 'premium' => 3]], ['label' => 'design', 'rates' => ['essential' => 1, 'standard' => 2, 'premium' => 3]]], 'finishes' => []]), 'two services with the same name are refused, because they would share one key and one would vanish');

/* The file the public estimator reads: written as JavaScript, and read back as the same figures. */
$js = wx_est_js($est);
ok(str_starts_with($js, '/* Woodex estimator rate book'), 'the generated file says what it is');
ok(str_contains($js, 'window.WX_RATES = '), 'and is the assignment the public page reads, so no request is needed to show a price');
ok(str_contains($js, 'overwritten by the next save'), 'and warns that hand edits are lost, because that is how a rate book goes missing');
eq(wx_est_parse($js), $est, 'what is written is exactly what is read back — the round trip, asserted');
eq(wx_est_parse('/* nothing here */'), null, 'a file in another shape reads as nothing');
eq(wx_est_parse('window.WX_RATES = {oops'), null, 'and so does a truncated one, rather than half a rate book');
ok(str_contains(wx_est_js($est), 'JSON') === false, 'the sheet itself is not in the file: figures and layout do not belong together here');

/* Reloading the readers: the version stamp v2.1 wrote page by page. */
$reader = '<script src="/assets/js/estimator-rates.js"></script>';
eq(wx_est_reload($reader, '2610141530'), '<script src="/assets/js/estimator-rates.js?v=2610141530"></script>', 'a page that reads the rate book is pointed at the new version');
eq(wx_est_reload('<script src="/assets/js/estimator-rates.js?v=2610141530"></script>', '2610141530'), null, 'a page already on that version is left alone — no version written for nothing');
eq(wx_est_reload('<script src="/assets/js/estimator-rates.js?v=old"></script>', '2610141530'), '<script src="/assets/js/estimator-rates.js?v=2610141530"></script>', 'an older stamp is replaced, not appended to');
eq(wx_est_reload('<p>a page with no script</p>', '2610141530'), null, 'and a page that does not read it is not touched at all');

/* The six forms are v2.1's own list; the marker table is read off this site. */
eq(count(WX_FORMS_WEB), 6, 'six forms, the same six v2.1 named');
ok(isset(WX_FORMS_WEB['office-fitout']) && isset(WX_FORM_MARKS['office-fitout']), 'including the office fit-out quote, whose form id is what the page carries');

/* ---- projects: the row the screens read, computed from the project and its invoices (v2.1's s17_proj_row) */
require_once WX_V2_DIR . '/routes/projects.php';

/* A project billed one invoice per milestone. v2.1's own row read both link shapes; reading only the
   project's own `invoice_id` — which is what the v2.5 route did before this slice — reported a project
   billed in three milestones as having invoiced nothing. That is the assertion below that matters most. */
$p_milestoned = [
    'id' => 7, 'no' => 'WI-10120', 'name' => 'Office fit-out — Zainab Tower', 'client_name' => 'Platinum Ventures',
    'site' => 'Model Town Link Road', 'value' => 1000000, 'stage' => 'installation',
    'start' => '2026-08-01', 'target' => '2026-11-30', 'line' => 'project', 'ptype' => 'Office fit-out',
    'manager' => 2, 'team' => [2, 5],
    'milestones' => [
        ['label' => 'Advance', 'pct' => 50, 'inv_id' => 41],
        ['label' => 'On completion of wood work', 'pct' => 30, 'inv_id' => 42],
        ['label' => 'On handover', 'pct' => 20],
    ],
];
$inv_milestoned = [
    ['id' => 41, 'no' => 'WI-10120-1', 'total' => 500000, 'paid' => 500000],
    ['id' => 42, 'no' => 'WI-10120-2', 'total' => 300000, 'paid' => 100000],
];
$names = [2 => 'Imtiaz', 5 => 'Sana'];

$row = wx_proj_row($p_milestoned, $inv_milestoned, $names, '2026-10-14');
eq($row['invoiced'], 800000, 'invoiced is every invoice of the project, not only the one it points at');
eq($row['received'], 600000, 'received is what has actually been paid');
eq($row['balance'], 200000, 'balance is the difference, never negative');
eq($row['unbilled'], 200000, 'and what is left to bill is the contract minus what has been invoiced');
eq($row['billedPct'], 80, 'so a project billed in milestones shows its progress, not zero');
eq($row['stageProgress'], 60, 'while the stage bar is where the project stands in the studio\'s own order');
eq($row['valueDisplay'], '1,000,000', 'money is printed by wx_pkr_out, which is what every other screen and document uses — one formatter, not two');
eq($row['manager_name'], 'Imtiaz', 'a manager id is a name on screen');
eq($row['team_names'], ['Imtiaz', 'Sana'], 'and so is each member of the team');
eq($row['late'], false, 'a project whose handover date is still ahead is not late');

/* Each milestone, with the three separate facts the screen has to tell apart. */
eq(array_column($row['milestones'], 'status'), ['paid', 'partial', 'unbilled'], 'paid, partly paid, and not yet billed are three different things');
eq($row['milestones'][0]['amount'], 500000, 'a milestone\'s amount is its share of the contract');
eq($row['milestones'][0]['inv_no'], 'WI-10120-1', 'and the invoice that billed it is named');
eq($row['milestonesDone'], 2, 'two of the three milestones have been billed');

/* An invoice that has gone missing: the milestone must not read as unbilled (it has an id) nor as paid. */
$missing = wx_proj_row($p_milestoned, [$inv_milestoned[1]], $names, '2026-10-14');
eq($missing['milestones'][0]['status'], 'missing', 'a milestone whose invoice was deleted says so, rather than looking unbilled');
eq($missing['milestones'][1]['status'], 'partial', 'and the one still there is unaffected');

/* Late, and the rule that keeps it meaningful: a finished project is never late, however old its date. */
eq(wx_proj_row(array_merge($p_milestoned, ['target' => '2026-09-30']), [], $names, '2026-10-14')['late'], true, 'a handover date that has gone by on unfinished work is late');
eq(wx_proj_row(array_merge($p_milestoned, ['target' => '2026-09-30', 'stage' => 'closed']), [], $names, '2026-10-14')['late'], false, 'but a closed project is not late, or the number would only ever grow');
eq(wx_proj_row(array_merge($p_milestoned, ['target' => '']), [], $names, '2026-10-14')['late'], false, 'and a project with no date set is not late either');
eq(wx_proj_row(array_merge($p_milestoned, ['stage' => 'nonsense']), [], $names, '2026-10-14')['stage'], 'planning', 'an unknown stage falls back rather than printing a word the studio does not use');

/* A contract with no value yet: percentages are not computed against zero. */
$novalue = wx_proj_row(['id' => 9, 'name' => 'New', 'value' => 0, 'stage' => 'planning', 'milestones' => [['label' => 'Advance', 'pct' => 50]]], [], [], '2026-10-14');
eq($novalue['billedPct'], 0, 'a project with no contract value has no billing percentage — not a division by zero');
eq($novalue['milestones'][0]['amount'], 0, 'and a milestone of a contract worth nothing is worth nothing');

/* ---- projects: the filters. The one place a person's text reaches SQL.
   The column expressions are handed in exactly as the route hands them in, so what is asserted here is the
   shape of the query the route builds — not a paraphrase of it. */
$cols = [
    'stage' => 'S', 'target' => 'T', 'line' => 'L', 'name' => 'N', 'no' => 'O',
    'client' => 'C', 'site' => 'P', 'ptype' => 'Y', 'invoice_id' => 'I', 'invoice_project' => 'J',
];
$f = wx_proj_filter(['view' => 'late'], '2026-10-14', $cols);
ok(count($f['where']) === 2, 'the late filter is two conditions: unfinished, and past its date');
ok(in_array('closed', $f['params'], true) && in_array('2026-10-14', $f['params'], true), 'both as bound parameters, never spliced into the SQL');
$f = wx_proj_filter(['view' => 'active'], '2026-10-14', $cols);
eq(count($f['where']), 1, 'active is one condition');
$f = wx_proj_filter(['view' => 'whatever'], '2026-10-14', $cols);
eq($f['view'], 'active', 'a view nobody offered falls back to the default rather than erroring or, worse, meaning something else');
$f = wx_proj_filter(['stage' => 'nonsense'], '2026-10-14', $cols);
eq($f['stage'], '', 'so does an unknown stage');
$f = wx_proj_filter(['stage' => 'design'], '2026-10-14', $cols);
ok(str_contains(implode(' ', $f['where']), 'S = ?') && $f['params'] === ['design'], 'a stage the studio does have is filtered on, and by value');
$f = wx_proj_filter(['line' => 'furniture'], '2026-10-14', $cols);
ok(in_array('furniture', $f['params'], true), 'the business line is filtered on too — beside the default "not closed" condition rather than instead of it');
$f = wx_proj_filter(['line' => "furniture' OR 1=1 --"], '2026-10-14', $cols);
eq($f['line'], '', 'and a line that is not a line is dropped, so nothing of it can reach the query');
$f = wx_proj_filter(['stage' => 'design', 'view' => 'late', 'q' => 'zainab'], '2026-10-14', $cols);
eq(count($f['where']), 2, 'a stage filter replaces the view rather than fighting it: one project cannot be both "design" and "every unfinished stage"');
eq(count($f['params']), 6, 'and the parameters match the clauses exactly: the stage, then the five places the search looks');
$f = wx_proj_filter(['q' => "100% OR 1=1 --"], '2026-10-14', $cols);
eq(array_values(array_filter($f['params'], static fn($v) => $v !== 'closed')), array_fill(0, 5, '%100% OR 1=1 --%'), 'a search string is a bound LIKE parameter in all five places, percent sign and all');
ok(!str_contains(implode(' ', $f['where']), '100%'), 'and it appears in no SQL fragment at all');

/* ---- projects: the six numbers at the top of the screen */
$kpi = wx_proj_kpi([
    ['stage' => 'planning', 'n' => 3, 'value' => 300000, 'late' => 0],
    ['stage' => 'installation', 'n' => 2, 'value' => 1700000, 'late' => 1],
    ['stage' => 'closed', 'n' => 9, 'value' => 5000000, 'late' => 4],
], ['invoiced' => 900000, 'received' => 450000]);
eq($kpi['active'], 5, 'active counts the unfinished projects and nothing else');
eq($kpi['value'], 2000000, 'and the contract value on the screen is the active work, not every project ever');
eq($kpi['late'], 1, 'a closed project with a passed date is not a late handover');
eq($kpi['invoiced'], 900000, 'invoiced is every invoice, because money does not stop being invoiced when work closes');
eq($kpi['balance'], 450000, 'the balance is what the studio is owed');
eq($kpi['receivedPct'], 50, 'and the received bar is the share of the invoiced total that has arrived');
eq(wx_proj_kpi([], [])['receivedPct'], 0, 'with nothing invoiced there is no percentage, rather than a division by zero');
eq(wx_proj_kpi([], ['invoiced' => 0, 'received' => 0])['balance'], 0, 'and no balance');

/* ---- projects: the stage bar */
eq(wx_proj_stage_pct('planning'), 0, 'the first stage is the start of the bar');
eq(wx_proj_stage_pct('closed'), 100, 'the last is the end of it');
ok(wx_proj_stage_pct('production') > wx_proj_stage_pct('design'), 'and the order is the studio\'s own');
eq(wx_proj_stage_pct('nonsense'), 0, 'a stage that is not on the list sits at the start, visibly');

/* The save route validates the business line against the same list the screens are given. */
ok(array_keys(WX_PROJECT_LINES) === ['furniture', 'interior', 'project'], 'the three lines are v2.1\'s, in its order');
eq(count(WX_PROJECT_STAGE_LABELS), count(WX_PROJECT_STAGES), 'every stage has a name to print, or a screen would print a slug');

/* ============================================================== client updates */

group('The client sees only what the studio shared');
/* One project with three updates: a stage change nobody announced, a note somebody shared, and a
   sentence a staff member shared without a photo. The rule this asserts is the whole design of the
   client's page — internal notes are not a weaker version of shared ones, they are simply not there. */
$p_client = array_merge($p_milestoned, [
    'updates' => [
        ['t' => '2026-10-01 09:00', 'user' => 'System', 'text' => 'Stage: design → production'],
        ['t' => '2026-10-03 11:00', 'user' => 'Imtiaz', 'text' => 'Frames are up on the east side.', 'toClient' => true, 'photo' => '/assets/uploads/projects/frame-01.jpg', 'stage' => 'production'],
        ['t' => '2026-10-05 15:00', 'user' => 'Imtiaz', 'text' => 'Client asked to move the pantry wall.'],
        ['t' => '2026-10-06 10:00', 'user' => 'Imtiaz', 'text' => 'We are now installing the ceiling.', 'toClient' => true, 'stage' => 'installation'],
    ],
]);
$vis = wx_cv_visible($p_client);
eq(count($vis), 2, 'two of the four entries are the client\'s; the rest are the studio\'s own record');
ok($vis[0]['text'] === 'Frames are up on the east side.' && $vis[1]['photo'] === '', 'and they read in the order they were written');
ok(!str_contains(implode(' ', array_column($vis, 'text')), 'pantry'), 'an internal note never reaches the page, whatever it says');
eq(wx_cv_visible(['updates' => 'not an array']), [], 'a project whose feed is not a list shows an empty page rather than an error');

group('The page carries the console\'s own numbers');
/* The rows exactly as the route builds them — from the same columns the database returns and the same
   function, so this asserts the client's page is reading the console's shape rather than a lookalike. */
$inv_rows = [];
foreach ($inv_milestoned as $i) {
    $inv_rows[] = wx_proj_invoice_row(['id' => $i['id'], 'no' => $i['no'], 'issued_at' => '2026-08-05 10:00:00', 'due_at' => ''], (int) $i['total'], (int) $i['paid']);
}
$page = wx_cv_page($p_client, $inv_rows, ['name' => 'Woodex Interior', 'phones' => '+92 322 4000768', 'whatsapp' => '']);
eq($page['invoicedDisplay'], $row['invoicedDisplay'], 'the client reads the invoice total the console shows, from the same function');
eq($page['balanceDisplay'], $row['balanceDisplay'], 'and the same balance — a client page that disagreed with the studio would be a support call');
eq($page['billedPct'], $row['billedPct'], 'and the same progress figure');
eq(count($page['updates']), 2, 'the page lists the shared updates, newest first');
eq($page['invoices'][0]['no'], 'WI-10120-1', 'with the invoices that belong to the project');
eq($page['invoices'][1]['status'], 'partial', 'each one carrying what is owed on it, derived once, in wx_proj_invoice_row');
eq($page['invoices'][0]['issued'], '2026-08-05', 'and the day it was issued, not the timestamp');
eq($page['invoices'][0]['total'], '500,000', 'printed the way every other document prints money');
eq($page['stages'][0]['label'], 'Planning', 'every stage is on the bar');
eq($page['stages'][count($page['stages']) - 1]['id'], 'closed', 'including the last one');
ok($page['stages'][3]['current'] && $page['stages'][2]['done'], 'the current stage is marked, and the ones behind it are done');
eq($page['stageLabel'], 'Installation', 'and the stage is named, not shown as a slug');

group('The page is a document, and a note cannot write into it');
$html = wx_cv_html($page);
ok(str_contains($html, 'Frames are up on the east side.'), 'the shared note is on the page');
ok(!str_contains($html, 'pantry'), 'the internal one is not');
ok(!str_contains($html, '<script') && !str_contains($html, '<iframe'), 'the page carries no script and no frame — there is nothing on it to run');
ok(!preg_match('~<img[^>]*src="(?!\/assets\/uploads\/projects\/)~', $html), 'and every image it does carry is a site photo from the uploads folder');
$nasty = wx_cv_page(array_merge($p_client, ['name' => 'Flat <script>alert(1)</script>', 'updates' => [
    ['t' => '2026-10-07 12:00', 'user' => 'Imtiaz', 'text' => '<img src=x onerror=alert(1)>', 'toClient' => true, 'photo' => '/assets/uploads/projects/../../etc/passwd'],
]]), [], ['name' => 'Woodex']);
$html_nasty = wx_cv_html($nasty);
ok(!str_contains($html_nasty, '<script>alert(1)</script>'), 'a project name carrying markup is escaped, not printed');
ok(!str_contains($html_nasty, '<img'), 'so is an update that tries to become an image tag — there is no tag for a browser to run');
ok(!str_contains($html_nasty, 'passwd'), 'and a photo path that climbs out of the uploads folder is not turned into a src');
ok(str_contains($html_nasty, '&lt;img src=x onerror=alert(1)&gt;'), 'the note still reads as the text somebody typed');

group('The link: one token, one page, no session');
try {
    $tok = wx_cv_token(['id' => 7, 'no' => 'WI-10120']);
    eq(strlen($tok), 32, 'a project link token is 32 characters, like the quotation link it is built from');
    eq($tok, wx_cv_token(['id' => 7, 'no' => 'WI-10120']), 'the same project always produces the same token, so a link sent last month still opens');
    ok($tok !== wx_cv_token(['id' => 8, 'no' => 'WI-10120']), 'another project gets another token');
    ok($tok !== wx_cv_token(['id' => 7, 'no' => 'WI-10121']), 'and so does the same project under a different number');
    ok($tok !== wx_quote_view_token(['id' => 7, 'no' => 'WI-10120']), 'a project link is never a quotation link, even for the same id and number');
    $path = wx_cv_path(['id' => 7, 'no' => 'WI-10120']);
    ok(str_starts_with($path, '/api/v2/client/project/7?t='), 'the link names the project and carries the token: ' . $path);
} catch (ApiError $e) {
    skip('the project link token needs the application secret (run with --db)');
}
ok(wx_cv_token_ok(str_repeat('a', 32)) && !wx_cv_token_ok('short') && !wx_cv_token_ok(str_repeat('z', 32)),
   'the token shape is checked before any query, so a fuzzed token costs nothing');
/* The router loads only the route file a request matches, so the page must load the project helpers it calls.
   A valid link returned 500 for want of wx_proj_invoices() until this was added. */
ok(str_contains((string) file_get_contents(dirname(__DIR__) . '/api/v2/routes/client_view.php'), "require_once __DIR__ . '/projects.php'"),
   'the client page loads the project helpers it calls (a valid link was a 500 without them)');

group('Opening the page is recorded once, and is not an update the client sees');
$p_view = wx_cv_mark_viewed($p_client, '2026-10-10 09:00');
ok($p_view !== null, 'the first view is worth recording');
eq($p_view['views'], 1, 'and counted');
eq(count($p_view['updates']), count($p_client['updates']) + 1, 'as an entry in the project\'s own feed');
eq(count(wx_cv_visible($p_view)), 2, 'which the client cannot see — it is a fact about them, not a message to them');
ok(wx_cv_mark_viewed($p_view, '2026-10-10 11:00') === null, 'a second look an hour later is not recorded again, or a refresh would be a notification');
$p_later = wx_cv_mark_viewed($p_view, '2026-10-11 08:00');
ok($p_later !== null && $p_later['views'] === 2, 'but a look the next day is, so the studio can see the link was opened');
ok(wx_cv_mark_viewed(array_merge($p_view, ['viewed_at' => 'nonsense']), '2026-10-10 12:00') !== null, 'an unreadable stamp is treated as never viewed rather than blocking the record');

group('The message the client gets carries the link to their page');
eq(wx_notify_with_page('Dear Ali, hello.', 'https://woodex.com.pk/api/v2/client/project/7?t=abc'),
   "Dear Ali, hello.\n\nFollow the work: https://woodex.com.pk/api/v2/client/project/7?t=abc",
   'the link is one sentence, appended — and every sender that has it appends the same words');
eq(wx_notify_with_page('Dear Ali, hello.', ''), 'Dear Ali, hello.', 'with no link there is no dangling line');
eq(wx_notify_without_link("Dear Ali,\nFrames are up.\nSite photos: {link}\n\nWoodex Interior · +92 322 4000768"),
   "Dear Ali,\nFrames are up.\n\nWoodex Interior · +92 322 4000768",
   'what the page keeps is the message minus the line that pointed at the photographs, because there the photograph is the page');
eq(wx_notify_without_link("Dear Ali,\nProgress.\n\nFollow the work: {link}\n\nWoodex · 0322"),
   "Dear Ali,\nProgress.\n\nWoodex · 0322", 'and minus the link line when the page link was the only link in it');
eq(wx_notify_without_link('No placeholder here.\n\nWoodex'), 'No placeholder here.\n\nWoodex',
   'a message that never had a link is unchanged — the rule is about the text, not about what a URL looks like');
ok(isset(wx_notify_defaults()['ev']['stage']['textNoPhotos']), 'the shipped stage wording has a shape for a stage with no photos yet');
eq(array_diff(WX_NOTIFY_WIRED, array_keys(WX_NOTIFY_EVENTS)), [], 'every event this build composes is one of the seven — no invented names');
ok(in_array('stage', WX_NOTIFY_WIRED, true) && !in_array('quote', WX_NOTIFY_WIRED, true),
   'the progress events are wired here and the quotation one is not, which is what the screen tells the reader');
eq(wx_notify_transport_info()['ready'], false, 'this build still cannot carry a message, and says so as data rather than as a comment');
eq(wx_notify_channel_result(true), 'no transport yet', 'a channel that is set up but cannot send does not read as success');
eq(wx_notify_channel_result(false), 'not configured', 'and a channel nobody connected reads as a task, not as Phase 4');
eq(wx_notify_channel_result(true, true), 'sent', 'the day a transport exists, the same call says sent — no other change needed');
ok(str_contains(wx_notify_defaults()['ev']['stage']['textNoPhotos'], '{link}'), 'which points at the client\'s page instead of an empty photo line');

/* A project with no contact details cannot be sent to, and says so rather than quietly succeeding. */
eq(wx_notify_contacts(['client_name' => 'Nobody', 'no' => 'WI-1', 'name' => 'A project']),
   ['name' => 'Nobody', 'phone' => '', 'email' => '', 'ref' => 'WI-1', 'project' => 'A project'],
   'contacts come back in one shape, with empty strings rather than missing keys — so a caller can add to them with + and never lose one');

/* Nothing here touches the network: the default transport is only reached when a route calls it. */
skip('the real transport (wx_fetch_get) needs a network and is exercised on the host');

/* ============================================================== quotation templates
 *
 * A template is a quotation with no client, and the rules that matter are the ones that keep the two
 * from diverging: the same section cleaner, the same arithmetic, the same four kinds v2.1 had. The
 * starter set is content — it is generated from the file the live site loads — so what is tested here
 * is that every one of those nine templates is one the server would accept and give back unchanged. */

group('A template is cleaned like a quotation, and refused by name');
eq(wx_tpl_clean(['name' => '  Renovation  '])['name'], 'Renovation', 'a name is trimmed before it is stored');
try {
    wx_tpl_clean(['name' => '   ']);
    ok(false, 'a template with no name is accepted');
} catch (ApiError $e) {
    eq($e->field, 'name', 'and the refusal names the field a screen has to highlight');
}
try {
    wx_tpl_clean(['name' => str_repeat('x', 81)]);
    ok(false, 'a name longer than the column is accepted');
} catch (ApiError $e) {
    eq($e->code, 'VALIDATION', 'a name over v2.1\'s eighty characters is refused rather than truncated');
}
try {
    wx_tpl_clean(['name' => 'Ok', 'description' => str_repeat('d', 401)]);
    ok(false, 'a four-hundred-and-one character description is accepted');
} catch (ApiError $e) {
    eq($e->field, 'description', 'and the description is the field it names');
}
$t_clean = wx_tpl_clean([
    'name' => 'Fit-out',
    'kind' => 'FITOUT',
    'terms' => "50% advance with work order.",
    'sections' => [[
        'name' => 'Electrical',
        'items' => [
            ['desc' => 'DB upgrade', 'qty' => 2, 'unit' => 'nos', 'rate' => 15000],
            ['desc' => 'Notes for the site team', 'kind' => 'spec', 'qty' => 5, 'rate' => 500],
        ],
    ]],
]);
eq($t_clean['kind'], 'fitout', 'the kind is matched without regard to case, as v2.1\'s select sent it');
eq($t_clean['sections'][0]['items'][0]['unit'], 'nos', 'a unit on the list is kept');
eq(count($t_clean['sections'][0]['items']), 2, 'and the section keeps both of the lines it was given');
eq($t_clean['sections'][0]['items'][1]['qty'], 0.0, 'a specification line carries no quantity — it is a sentence, not a price');
ok($t_clean['sections'][0]['items'][1]['rate'] === 0.0, 'nor a price, even when the console sent one');
try {
    wx_tpl_clean(['name' => 'Fit-out', 'sections' => [['name' => 'Electrical', 'items' => [['desc' => '', 'qty' => 1, 'unit' => 'nos']]]]]);
    ok(false, 'a line with no description is accepted');
} catch (ApiError $e) {
    eq($e->field, 'sections.0.items.0.desc', 'a line with no description is refused by field — the same cleaner a quotation goes through');
}
eq(wx_tpl_kind('plumbing'), 'other', 'a kind the console does not know files under Other rather than refusing the save');
eq(wx_tpl_kind(null), 'other', 'and so does no kind at all');

group('A template\'s figures are derived, and a template with no rates says so');
$t_row = wx_tpl_row(['id' => 4, 'name' => 'Renovation', 'kind' => 'renovation', 'sections' => [
    ['name' => 'Flooring', 'items' => [
        ['desc' => 'Vitrified tiles 600x1200', 'qty' => 1200, 'unit' => 'sft', 'rate' => 465],
        ['desc' => 'Skirting', 'qty' => 0, 'unit' => 'rft', 'rate' => 0],
    ]],
    ['name' => 'Paint', 'items' => [
        ['desc' => 'Emulsion, two coats', 'qty' => 3000, 'unit' => 'sft', 'rate' => 78],
    ]],
]]);
eq($t_row['subtotal'], 792000, 'the subtotal is the sum of the lines, in whole rupees');
eq($t_row['total'], $t_row['subtotal'], 'and with no discount or tax the total is the same number');
eq($t_row['totalDisplay'], '792,000', 'formatted the one way money is formatted on every screen');
eq($t_row['sectionCount'], 2, 'the list can say how many sections without opening the template');
eq($t_row['lineCount'], 3, 'and how many lines');
eq($t_row['pricedCount'], 2, 'and how many of them carry a rate — the other is a line to price per job');
eq($t_row['kindLabel'], 'Renovation', 'with the label the screen shows, from the server so the two cannot differ');
eq(wx_tpl_row(['name' => 'Empty', 'kind' => 'other', 'sections' => [], 'terms' => "\n\n  Fifty percent advance.  \n"])['termsFirst'],
   'Fifty percent advance.', 'the line a card shows is the first real line of the terms, not the indentation');

group('The nine starter templates are ones the server would accept');
$starters = wx_tpl_starters();
eq(count($starters), 9, 'nine templates ship, as the studio\'s own file has');
eq(array_column($starters, 'name'), ['Renovation', 'Civil Work', 'Interior Designing', 'Interior', 'Fit-out', 'Architecture', '3D Visualization', 'Furniture', 'Design Consultancy'],
   'in the order the file lists them, so the import reads predictably');
eq(array_column($starters, 'kind'), ['renovation', 'renovation', 'design', 'other', 'fitout', 'design', 'design', 'other', 'design'],
   'each with the kind v2.1\'s own rule gives its name');
$s_items = array_sum(array_map(static fn(array $s): int => count($s['sections']), $starters));
ok($s_items >= 20, 'they carry real BOQ sections rather than placeholders (' . $s_items . ' sections)');
$s_lines = 0;
foreach ($starters as $s) {
    foreach ($s['sections'] as $sec) {
        $s_lines += count($sec['items']);
    }
}
ok($s_lines >= 80, 'and the line items the studio quotes from (' . $s_lines . ' lines)');
$raw = json_decode((string) file_get_contents(WX_V2_DIR . WX_TPL_STARTER_FILE), true);
ok(is_array($raw) && count($raw) === 9, 'the generated file holds the nine templates as JSON');
/* The server adds bookkeeping beside each line (an `amount`, a `kind`, a `code`) — those are derived. What
   must survive from the file untouched is the content somebody typed: the wording, the unit, the quantity,
   the rate, the order. This projects both sides onto that content and compares those. */
$content = static function (array $t): array {
    $out = ['name' => $t['name'], 'kind' => $t['kind'], 'description' => (string) ($t['description'] ?? ''), 'terms' => (string) ($t['terms'] ?? ''), 'sections' => []];
    foreach ($t['sections'] as $s) {
        $lines = [];
        foreach ($s['items'] as $it) {
            $lines[] = [(string) $it['desc'], (float) $it['qty'], (string) $it['unit'], (float) $it['rate'], (string) ($it['kind'] ?? '')];
        }
        $out['sections'][] = [(string) $s['name'], $lines];
    }
    return $out;
};
$stable = [];
foreach (is_array($raw) ? $raw : [] as $r) {
    /* The property that matters: what the file says is what the server would store. A starter with a unit
       outside v2.1's list, a heading carrying a price, a line with no description or a name over eighty
       characters would be silently repaired on import — the studio would be quoting from something other
       than the file it maintains. This is the assertion that says nothing is repaired. */
    if ($content(wx_tpl_clean($r)) !== $content($r)) {
        $stable[] = (string) ($r['name'] ?? '?');
    }
}
eq($stable, [], 'every starter is already in the shape the server stores — nothing is repaired on import');
$again = [];
foreach ($starters as $s) {
    if (wx_tpl_clean($s) !== $s) {
        $again[] = $s['name'];
    }
}
eq($again, [], 'and a starter that has been through the cleaner is unchanged by a second pass, so a re-import is a no-op rather than an edit');
foreach ($starters as $s) {
    ok(trim($s['name']) !== '' && count($s['sections']) > 0, 'the template "' . $s['name'] . '" has a name and sections');
}
$rows_marked = wx_tpl_starter_rows(['Renovation', 'Fit-out']);
eq(array_column($rows_marked, 'imported'), [true, false, false, false, true, false, false, false, false],
   'the import button knows which starters are already saved, so it can say six of nine rather than offering nine');
ok(!isset($rows_marked[0]['id']), 'and a starter that is not saved yet has no id — it is not a row in the database');

/* ============================================================== business info
 *
 * The details that are on every page, and the pairs that change them. Two properties are worth testing
 * above all: a pair can never be built with an empty search string (str_replace('' , 'x') would paste the
 * new phone number into every byte boundary of 150 pages), and the WhatsApp number is swapped through a
 * sentinel so that the digits-only phone pairs cannot paste the office number into a wa.me link.
 */

group('The pairs that change every page, and the sentinel that keeps the WhatsApp link intact');
$before = wx_biz_defaults();
$after = $before;
$after['phone1'] = '+92 300 1234567';
$after['email'] = 'hello@woodex.com.pk';
$after['addr1'] = 'M-72, Zainab Tower';
$pairs = wx_biz_pairs($before, $after);
$asMap = [];
foreach ($pairs as $p) {
    $asMap[$p[0]] = $p[1];
}
ok(isset($asMap['+92 322 4000768']), 'the old phone number as it is written on the page is a pair');
eq($asMap['+92 322 4000768'], '+92 300 1234567', 'and it becomes the new one');
ok(isset($asMap['923224000768']), 'so are the bare digits, because a tel: href carries them');
eq($asMap['923224000768'], '923001234567', 'and they become the new digits');
eq($asMap['info@woodex.com.pk'], 'hello@woodex.com.pk', 'the email is a pair');
eq($asMap['M-71, Zainab Tower'], 'M-72, Zainab Tower', 'and so is the address line');
$froms = array_column($pairs, 0);
eq(count($froms), count(array_unique($froms)), 'no search string appears twice — a duplicate pair would double a count a person reads as places changed');
ok(strlen($before['wa']) > 0 && wx_biz_digits($before['wa']) === wx_biz_digits($after['wa']), 'the WhatsApp number did not change in this test');
$page = '<a href="https://wa.me/923224000768">WhatsApp</a> <a href="tel:+923224000768">+92 322 4000768</a>';
$moved = wx_biz_apply_pairs($page, $pairs);
ok(str_contains($moved, 'wa.me/923224000768'), 'the WhatsApp link keeps its own number when the office phone moves');
ok(str_contains($moved, 'tel:+923001234567'), 'while the telephone link moves');
ok(!str_contains($moved, "\x01"), 'and no sentinel ever reaches a page');

group('A WhatsApp change is swapped through the sentinel, in v2.1\'s order');
$wa = $after;
$wa['wa'] = '+92 300 1234567';
$pairs = wx_biz_pairs($after, $wa);
$moved = wx_biz_apply_pairs('<a href="https://wa.me/923224000768">Chat</a><span>+92 322 4000768</span>', $pairs);
ok(str_contains($moved, 'wa.me/923001234567'), 'the number inside wa.me/ is the new WhatsApp number, not the office one');
ok(!str_contains($moved, "\x01"), 'and the sentinel is gone by the time the page is written');

group('A pair is never built with an empty search string');
$odd = [
    ['email' => '', 'phone1' => '', 'phone2' => '', 'wa' => '', 'addr1' => '', 'addr2' => ''],
    ['email' => 'a@b.pk', 'phone1' => '1', 'phone2' => '2', 'wa' => '3', 'addr1' => 'x', 'addr2' => 'y'],
    wx_biz_defaults(),
];
$empty = [];
foreach ($odd as $from) {
    foreach ($odd as $to) {
        foreach (wx_biz_pairs($from, $to) as $p) {
            if ($p[0] === '' || $p[1] === '') {
                $empty[] = $from['email'] . '→' . $to['email'];
            }
        }
    }
}
eq($empty, [], 'no combination of blank and odd records can produce an empty search or an empty replacement');
eq(wx_biz_pairs(wx_biz_defaults(), wx_biz_defaults()), [], 'and a record that has not changed produces no pairs at all');

group('The hours the site writes are among the spellings the pairs look for');
$v = wx_biz_hours_variants(['days' => 'Mon–Sat', 'open' => '09:30', 'close' => '18:30']);
eq(count($v), 7, 'seven spellings, as v2.1 had');
ok(in_array('Mon–Sat 9:30–6:30', $v, true), 'including the one the live footer actually carries');
ok(in_array('Mo-Sa 09:30-18:30', $v, true), 'and v2.1\'s 24-hour spelling, truncation and all — the days are cut to two letters, which is what its own screen compared against');
ok(!in_array('Mon-Sat 09:30-18:30', $v, true), 'while the spelling v2.1 never produced is not invented here: a variant that matches nothing costs nothing, but only if it is one the site could have written');
$site_pair = wx_biz_hours_variants(['days' => 'Mon–Sat', 'open' => '09:30', 'close' => '18:30']);
$new_pair = wx_biz_hours_variants(['days' => 'Mon–Fri', 'open' => '10:00', 'close' => '19:30']);
eq(array_search('Mon–Sat 9:30–6:30', $site_pair, true), 0, 'the first variant is the one a pair will hit');
eq($new_pair[0], 'Mon–Fri 10:00–7:30', 'and its replacement keeps the same shape, so the footer still reads like a footer');

group('Reading what the site says, rather than trusting a copy of the defaults');
$footer = '<footer><div class="footer-column footer-contact"><h3>Get in touch</h3>'
    . '<a href="mailto:info@woodex.com.pk">info@woodex.com.pk</a>'
    . '<a href="https://wa.me/923224000768">WhatsApp Woodex</a>'
    . '<a href="tel:+923224000768">+92 322 4000768</a><a href="tel:+923214686884">+92 321 4686884</a>'
    . '<address>M-71, Zainab Tower<br>Model Town Link Road<br>Lahore, Pakistan</address>'
    . '<p><strong>Mon–Sat 9:30–6:30</strong></p>'
    . '<div class="footer-social"><a data-soc="facebook" href="https://facebook.com/woodex">f</a></div>'
    . '</div></footer>';
$read = wx_biz_read_html($footer);
eq($read['values']['phone1'], '+92 322 4000768', 'the first tel: link is the main phone, as the footer writes it');
eq($read['values']['phone2'], '+92 321 4686884', 'the second is the second phone');
eq($read['values']['wa'], '+92 322 4000768', 'the WhatsApp button gives the WhatsApp number, formatted the way the site writes it');
eq($read['values']['email'], 'info@woodex.com.pk', 'the mailto: link gives the email');
eq($read['values']['addr1'], 'M-71, Zainab Tower', 'the address block gives the first line');
eq($read['values']['addr2'], 'Model Town Link Road', 'and the second');
eq([$read['values']['city'], $read['values']['country']], ['Lahore', 'Pakistan'], 'and the third line is the city and the country');
eq([$read['values']['days'], $read['values']['open'], $read['values']['close']], ['Mon–Sat', '09:30', '18:30'],
   'the hours are read back as the 24-hour times the record stores — 6:30 in an hours block is the evening');
eq($read['values']['facebook'], 'https://facebook.com/woodex', 'and the social row is read when the page carries one');
ok(in_array('open', $read['found'], true) && in_array('country', $read['found'], true), 'what was found is reported, not assumed');
$bare = wx_biz_read_html('<html><body><p>No details on this page.</p></body></html>');
eq($bare['values'], [], 'a page with none of these markers gives nothing back');
eq($bare['found'], [], 'and says it found nothing, so a caller can tell "no hours" from "no page"');

group('A change to the business details is refused by field, like every other write');
$ok_clean = wx_biz_clean(['email' => '  hello@woodex.com.pk ', 'phone1' => '+92 300 1234567', 'facebook' => 'https://facebook.com/woodex'], wx_biz_defaults());
eq($ok_clean['email'], 'hello@woodex.com.pk', 'a value is trimmed before it is stored');
eq($ok_clean['phone2'], '+92 322 4000768', 'and a field the caller left blank keeps what was there');
eq($ok_clean['open'], '10:00', 'including the hours, which are stored not recomputed');
foreach ([
    ['email' => 'not-an-email', 'field' => 'email'],
    ['phone1' => '+92 300', 'field' => 'phone1'],
    ['facebook' => 'facebook.com/woodex', 'field' => 'facebook'],
    ['days' => 'Mon–Thu', 'field' => 'days'],
    ['open' => '25:00', 'field' => 'open'],
] as $bad) {
    try {
        wx_biz_clean($bad, wx_biz_defaults());
        ok(false, 'the bad ' . $bad['field'] . ' was accepted');
    } catch (ApiError $e) {
        eq($e->field, $bad['field'], 'a malformed ' . $bad['field'] . ' is refused, naming the field');
    }
}
eq(wx_biz_clean(['open' => '9:30'], wx_biz_defaults())['open'], '09:30', 'a one-digit hour is normalised rather than refused');
eq(wx_biz_hhmm('0930'), '09:30', 'and so is a time typed without the colon');

group('One page through the whole edit: the pairs, then the social row');
$phone_pairs = wx_biz_pairs($before, $after);
$change = wx_biz_change('<div class="footer-social"><a data-soc="facebook" href="https://old">x</a></div><a href="tel:+923224000768">+92 322 4000768</a>', $phone_pairs, $after);
ok($change['changed'], 'the page changed');
eq($change['places'], 2, 'and the count is the number of places the pairs matched, per page');
ok(str_contains($change['html'], 'tel:'), 'the telephone link is still a link');
eq(wx_biz_change('<p>Nothing here.</p>', [], wx_biz_defaults())['changed'], false, 'a page with nothing to change reports that rather than being written back');
$touched = null;
$row = wx_biz_social_block('<div class="footer-social"><a data-soc="facebook" href="https://old">x</a></div>', ['facebook' => 'https://facebook.com/woodex', 'instagram' => 'https://instagram.com/woodex'], $touched);
ok($touched === true, 'a page that carries the social row says so');
ok(str_contains($row, 'data-soc="instagram"'), 'and the row gains the profile that was added');
ok(!str_contains($row, 'https://old'), 'while the link that is no longer set is dropped');

group('The social row is v2.1\'s, byte for byte, icons included');
$soc_js = dirname(__DIR__) . '/frontend-v1/admin/admin-fields.js';
if (is_file($soc_js) && preg_match('~var SOC = (\[\[.*?\]\]);~s', (string) file_get_contents($soc_js), $soc_m)) {
    $soc = json_decode($soc_m[1], true);
    eq(array_column($soc, 0), array_keys(WX_BIZ_SOCIAL), 'the networks and their order are v2.1\'s');
    eq(array_combine(array_column($soc, 0), array_column($soc, 1)), WX_BIZ_SOCIAL, 'and so are their labels');
    eq(array_combine(array_column($soc, 0), array_column($soc, 2)), WX_BIZ_SOCIAL_ICON, 'and so is every icon path');
} else {
    ok(false, 'v2.1\'s SOC table is readable from frontend-v1/admin/admin-fields.js');
}
$row = wx_biz_social_html(['facebook' => 'https://www.facebook.com/woodexinterior', 'linkedin' => 'https://www.linkedin.com/company/woodexinterior']);
ok(str_contains($row, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="') && !str_contains($row, '<span'),
   'each profile is drawn with its icon, not an empty span the stylesheet does not style');
$home = dirname(__DIR__) . '/frontend-v1/index.html';
if (is_file($home) && preg_match('~<div class="footer-social"[^>]*>(.*?)</div>~s', (string) file_get_contents($home), $home_m)
    && preg_match_all('~<a data-soc="[^"]*".*?</a>~s', $home_m[1], $home_a)) {
    eq($row, implode('', $home_a[0]), 'and the row equals the one on the website, which v2.1\'s own socHtml() writes');
} else {
    ok(false, 'the home page carries a social row to compare with');
}
ok(str_contains(wx_biz_social_html(['facebook' => "https://facebook.com/a?b=1&c='x'"]), 'href="https://facebook.com/a?b=1&amp;c=&#39;x&#39;"'),
   'a link is escaped as v2.1 escapes it: &#39; for an apostrophe, as its esc() writes');

group('One save writes the footer row and the schema, so the two halves cannot disagree (N17)');
/* `sameAs` beside the footer row: the row is what the visitor sees, the schema is what a search engine
   reads, and until this slice a save wrote one and left the other. The rules under test are the ones that
   make the write safe on *this* site: the maps listing link is somebody else's, and X is dormant in the
   footer while it stays in the schema. */
$soc_biz = ['facebook' => 'https://www.facebook.com/woodexinterior', 'linkedin' => 'https://www.linkedin.com/company/woodexinterior'];
$row_html = '<div class="footer-social"><a data-soc="facebook" href="https://old">x</a></div>';
$node_of = static function (array $sameAs, string $type = 'LocalBusiness', string $id = 'https://woodex.com.pk/#org', string $name = 'Woodex Interior'): string {
    return '<script type="application/ld+json">' . json_encode(
        ['@context' => 'https://schema.org', '@type' => $type, '@id' => $id, 'name' => $name, 'sameAs' => $sameAs],
        JSON_UNESCAPED_SLASHES
    ) . '</script>';
};
/* The two generations write their schema differently — frontend-v1 gives each node its own block, the root
   v26 pages put several nodes in one block as a JSON array, and a single file mixes the two — so the reader
   walks whatever it finds rather than assuming one shape. */
$same_as_of = static function (string $html): array {
    $out = [];
    if (!preg_match_all('~<script[^>]*application/ld\+json[^>]*>(.*?)</script>~s', $html, $m)) {
        return $out;
    }
    $walk = static function ($x) use (&$walk, &$out): void {
        if (!is_array($x)) {
            return;
        }
        if (!array_is_list($x) && array_key_exists('sameAs', $x) && is_array($x['sameAs'])) {
            $out[] = $x['sameAs'];
        }
        foreach ($x as $v) {
            $walk($v);
        }
    };
    foreach ($m[1] as $json) {
        $walk(json_decode($json, true));
    }
    return $out;
};
$maps = 'https://maps.google.com/?cid=301798693140782080';
$page = $row_html . $node_of([$maps, 'https://www.facebook.com/woodexinterior', 'https://x.com/woodexinterior']);
$one = wx_biz_change($page, [], $soc_biz);
ok($one['changed'], 'a page whose schema is behind the console changes');
ok($one['schema'], 'and the change is reported as a schema change rather than only a row change');
$sa = $same_as_of($one['html']);
eq(count($sa), 1, 'one node carries the list');
ok(in_array('https://www.linkedin.com/company/woodexinterior', $sa[0], true),
   'a profile set in the console reaches the schema, not only the footer row');
ok(str_contains($one['html'], 'href="https://www.linkedin.com/company/woodexinterior"'),
   'and it reaches the row in the same pass');
eq($sa[0][0], $maps, 'the Google Maps listing link is kept, and keeps its place — the console does not manage it');
ok(in_array('https://x.com/woodexinterior', $sa[0], true),
   'a network the record says nothing about keeps the URL the page already linked (X is dormant in this footer)');
$twice = wx_biz_change($one['html'], [], $soc_biz);
ok(!$twice['changed'], 'and the save is idempotent: running it again writes nothing');
eq($one['places'], 2, 'the row and the schema each count as a place, so neither change can read as "nothing happened"');
/* The schema-only case, which is the one this slice exists for: the row is already right and the schema is
   behind. Without the count it would report 0 places, which a person reads as "nothing happened". */
$row_only = '<div class="footer-social">' . wx_biz_social_html($soc_biz) . '</div>'
    . $node_of([$maps, 'https://www.facebook.com/woodexinterior']);
$schema_only = wx_biz_change($row_only, [], $soc_biz);
ok($schema_only['changed'] && !$schema_only['social'] && $schema_only['schema'],
   'a save that only the schema needed is still a save, and is not reported as a row change');
eq($schema_only['places'], 1, 'and it counts as one place');

$two_nodes = $row_html
    . $node_of([$maps, 'https://www.facebook.com/woodexinterior'], 'LocalBusiness')
    . $node_of([$maps, 'https://www.facebook.com/woodexinterior'], 'Organization');
$both = $same_as_of(wx_biz_change($two_nodes, [], $soc_biz)['html']);
eq(count($both), 2, 'both nodes of the studio are seen');
eq($both[0], $both[1], 'and end up saying the same thing — no page tells two stories about one identity');

$other = $row_html . $node_of(['https://example.com/else'], 'Service', 'https://woodex.com.pk/#svc', 'Interior Design and Build in Lahore');
$kept = wx_biz_change($other, [], $soc_biz);
eq($same_as_of($kept['html'])[0], ['https://example.com/else'], 'a node that is not the studio\'s own is left alone');
ok(!$kept['schema'], 'and it is not reported as a schema change');

$foreign = $row_html . $node_of(['https://example.com/other'], 'Organization', 'https://other.example/#org', 'Somebody Else');
ok(!wx_biz_change($foreign, [], $soc_biz)['schema'], 'a name and @id that are not ours are not touched either');

group('The live page is the one that has to agree');
/* WX_SITE_ROOT in this harness is the checkout, and the page that goes to the site root on the host is
   frontend-v1/index.html — the 150-page generation the deploy publishes. It is read here by path so the
   assertion is about the page a visitor actually gets. */
$live_file = dirname(__DIR__) . '/frontend-v1/index.html';
if (is_file($live_file)) {
    $live_html = (string) file_get_contents($live_file);
    $live_sa = $same_as_of($live_html);
    ok(count($live_sa) >= 1, 'the live home page carries a sameAs to hold to (' . count($live_sa) . ' node(s))');
    ok(preg_match('~<a data-soc="facebook" href="([^"]+)"~', $live_html, $fb_m) === 1, 'and a Facebook profile in its footer row');
    $fb_row = (string) ($fb_m[1] ?? '');
    ok(in_array($fb_row, $live_sa[0], true), 'which its schema already names — row and schema agree today');

    $moved_biz = wx_biz_record(['facebook' => 'https://www.facebook.com/woodex.new']);
    $moved_page = wx_biz_change($live_html, [], $moved_biz);
    $moved_sa = $same_as_of($moved_page['html']);
    ok($moved_page['schema'], 'a profile changed in the console is reported as a schema change on the real page');
    eq(count($moved_sa), count($live_sa), 'and it changes no node it should not: the same nodes, rewritten');
    $all_moved = true;
    $old_left = false;
    foreach ($moved_sa as $list) {
        if ($fb_row !== '' && !in_array('https://www.facebook.com/woodex.new', $list, true)) {
            $all_moved = false;
        }
        if ($fb_row !== '' && in_array($fb_row, $list, true)) {
            $old_left = true;
        }
    }
    ok($all_moved, 'every node that named the old profile names the new one — no page tells two stories');
    ok(!$old_left, 'and the old URL is gone from the schema');
    ok(in_array('https://maps.google.com/?cid=301798693140782080', $moved_sa[0], true), 'the maps listing link survives');
    ok(in_array('https://x.com/woodexinterior', $moved_sa[0], true),
       'and so does the profile the record is silent about (X, dormant in the footer, still in the schema)');
    ok(str_contains($moved_page['html'], 'href="https://www.facebook.com/woodex.new"'), 'the footer row moved with it');

    $scan = wx_biz_scan(wx_biz_pairs(wx_biz_defaults(), $moved_biz), $moved_biz, ['rel' => WX_BIZ_SAMPLE]);
    eq($scan['schema']['pages'], 1, 'the dry run says the schema will change, before anything is written');
    ok($scan['schema']['nodes'] >= 1, 'and how many nodes it looked at (' . $scan['schema']['nodes'] . ')');
    eq($scan['changed'][0]['schema'] ?? null, true, 'the page it lists carries the schema flag rather than a bare place count');
} else {
    skip('frontend-v1/index.html is not in this checkout, so the live-page schema leg is skipped');
}

group('The live site says what the console reads from it');
if (is_file(WX_SITE_ROOT . '/' . WX_BIZ_SAMPLE)) {
    $page = (string) file_get_contents(WX_SITE_ROOT . '/' . WX_BIZ_SAMPLE);
    $live = wx_biz_from_site(WX_BIZ_SAMPLE);
    eq($live['rel'], WX_BIZ_SAMPLE, 'the baseline is read off the site\'s own home page');
    ok(str_contains($page, $live['values']['phone1']), 'the main phone it reports is the one written on the page');
    ok(str_contains($page, $live['values']['addr1']), 'and so is the address');
    ok(str_contains($page, $live['values']['email']), 'and the email');
    ok(in_array('open', $live['found'], true) && in_array('close', $live['found'], true),
       'the opening hours are read from the footer rather than taken from the default record');
    /* The heart of the slice, against the real page: change the telephone number and see what happens to
       the WhatsApp button. On this site the two are the same number, so a digits-only replacement would
       re-point the button at the office line while it still said WhatsApp. */
    $from = array_merge(wx_biz_defaults(), $live['values']);
    $to = $from;
    $to['phone1'] = '+92 300 1234567';
    $pairs = wx_biz_pairs($from, $to);
    ok($pairs[0][0] === wx_biz_defaults()['phone1'] || str_contains($pairs[0][0], 'wa.me/'), 'the pairs start from what the site says, not from the defaults');
    $moved = wx_biz_apply_pairs($page, $pairs);
    ok(str_contains($moved, '+92 300 1234567'), 'the new number reaches the page');
    ok(!str_contains($moved, '+92 322 4000768'), 'and the old spelling of it is gone from every place it appeared');
    ok(str_contains($moved, 'wa.me/923224000768'), 'while the WhatsApp button still dials the WhatsApp number — the office line moved, the WhatsApp line did not');
    ok(!str_contains($moved, "\x01"), 'with no sentinel left in the page');
    $live['values']['phone1'] = '+92 300 1234567';
    $change = wx_biz_change($page, $pairs, $live['values']);
    ok($change['places'] >= 2, 'the count of places is taken from the live page (' . $change['places'] . ')');
} else {
    skip('the site\'s home page is not in this checkout, so the read-off-the-site leg is skipped');
}

group('The letterhead keeps v2.1\'s rules for its lists');
$banks = wx_company_list('banks', [
    ['bank' => 'Bank Alfalah', 'title' => 'WOODEX INTERIOR', 'account' => '02931007869105', 'iban' => 'PK06ALFH0293001007869105', 'branch' => 'Link Rd Model Town Br: Lahore', 'code' => '0293', 'use' => 'interior'],
    ['bank' => 'Meezan Bank', 'title' => 'WOODEX FURNITURE', 'account' => '1', 'iban' => '2', 'branch' => 'Model Town', 'code' => '', 'use' => 'nonsense'],
    ['bank' => '', 'title' => '', 'account' => '', 'iban' => '', 'branch' => '', 'code' => '', 'use' => 'all'],
]);
eq(count($banks), 2, 'a bank row with no name and no title is dropped rather than stored empty');
eq($banks[0]['use'], 'interior', 'the line a bank is for is kept when it is one of the three');
eq($banks[1]['use'], 'all', 'and a use v2.1 did not have becomes all, because a bank that belongs to nobody is unusable');
$signers = wx_company_list('signers', [['name' => 'Imtiaz Ahmad', 'title' => 'Director'], ['name' => '', 'title' => ''], 'nonsense']);
eq($signers, [['name' => 'Imtiaz Ahmad', 'title' => 'Director']], 'the signatories are the rows that name somebody, and nothing else survives');
eq(wx_company_list('wallets', [['name' => 'JazzCash', 'number' => '+92 321 3656096']])[0]['name'], 'JazzCash', 'and the wallets are kept in the order they were sent');
eq(wx_company_list('nothing', [['a' => 1]]), [], 'an unknown list is empty rather than an error');

/* ============================================================== the announcement bar
 *
 * One file, `assets/announce.json`, fetched by the site's own script. Three properties are worth more
 * than the field list: the record is exactly v2.1's six keys (so the file the older site reads stays
 * readable by both), the version only moves when the announcement did (it is the key a visitor's
 * dismissal is remembered under, so a version that moves on an unchanged save re-shows a closed bar to
 * everybody), and the store is the atomic one — v2.1's `file_put_contents(…, LOCK_EX)` truncated before
 * it locked, so a page fetched during a save could get half a file and show no bar at all.
 */

group('The announcement is a file the site reads, and every save is a whole file');
@unlink(wx_ann_path());
eq(wx_ann_exists(), false, 'nothing is saved yet, and that is not an error');
eq(wx_ann_read()['on'], false, 'a site with no announcement file has the bar off');
eq(wx_ann_read()['style'], 'navy', 'and the default colour, which the stylesheet falls back to as well');

$saved = wx_ann_save(['on' => true, 'text' => ' Free site visit in Lahore this month ', 'link' => '/contact/', 'linkText' => 'Book now', 'style' => 'wood'], 1700000000);
eq($saved['text'], 'Free site visit in Lahore this month', 'the words are trimmed before they are stored');
eq($saved['v'], 1700000000, 'the version is the save time');
eq(wx_ann_exists(), true, 'the file is on disk now');
eq(wx_ann_read()['on'], true, 'and reads back as on');
eq(array_keys(wx_ann_read()), ['on', 'text', 'link', 'linkText', 'style', 'v'], "v2.1's six keys, in its order — the older site reads this same file");

$raw = (string) file_get_contents(wx_ann_path());
$decoded = json_decode($raw, true);
ok(is_array($decoded), 'what is on disk is valid JSON');
eq($decoded['linkText'] ?? '', 'Book now', 'with the link text in it');
ok(substr_count($raw, '{') === 1, 'and one object, not a fragment of an older one');

/* The version is the dismissal key, so it must not move for an unchanged save — and must move for a
   changed one, even inside the same second. */
$again = wx_ann_save(['on' => true, 'text' => 'Free site visit in Lahore this month', 'link' => '/contact/', 'linkText' => 'Book now', 'style' => 'wood'], 1700000000);
eq($again['v'], 1700000000, 'saving the same announcement again keeps the version, so a closed bar stays closed');
$edited = wx_ann_save(['on' => true, 'text' => 'Eid timings: closed 30 March', 'link' => '', 'linkText' => '', 'style' => 'cream'], 1700000000);
eq($edited['v'], 1700000001, 'an edit within the same second still gets a new version, so the new bar is shown');
$again2 = wx_ann_save(['on' => true, 'text' => 'Eid timings: closed 30 March', 'link' => '', 'linkText' => '', 'style' => 'cream'], 1700000000);
eq($again2['v'], $edited['v'], 'and an unchanged save after that still does not move it');

group('An announcement is refused by field, not clipped into something else');
throws('VALIDATION', 'text', static function () { wx_ann_clean(['on' => true, 'text' => '', 'style' => 'navy']); }, 'turning the bar on with no words is refused');
eq(wx_ann_clean(['on' => false, 'text' => ''])['on'], false, 'and off with no words is fine — that is how a bar is hidden');
throws('VALIDATION', 'text', static function () { wx_ann_clean(['on' => true, 'text' => str_repeat('x', 161)]); }, 'a sentence longer than the bar is refused rather than cut');
eq(mb_strlen(wx_ann_clean(['on' => true, 'text' => str_repeat('x', 160)])['text']), 160, 'and the longest one that fits is kept whole');
throws('VALIDATION', 'linkText', static function () { wx_ann_clean(['on' => true, 'text' => 'x', 'link' => '/contact/', 'linkText' => str_repeat('y', 41)]); }, 'link text longer than the button is refused');
throws('VALIDATION', 'style', static function () { wx_ann_clean(['on' => true, 'text' => 'x', 'style' => 'chartreuse']); }, 'a colour that is not one of the three is refused, not silently replaced');

/* The four kinds of link a bar may carry, and the ones a browser must never be handed. */
foreach (['/contact/', 'https://woodex.com.pk/offer/', 'tel:+92 322 4000768', 'mailto:info@woodex.com.pk'] as $good) {
    eq(wx_ann_clean(['on' => true, 'text' => 'x', 'link' => $good])['link'], $good, 'a link like ' . $good . ' is kept as typed');
}
foreach (['http://woodex.com.pk/', 'contact/', 'javascript:alert(1)', "/x\" onmouseover=\"alert(1)", '/x?y=<b>'] as $bad) {
    throws('VALIDATION', 'link', static function () use ($bad) { wx_ann_clean(['on' => true, 'text' => 'x', 'link' => $bad]); }, 'a link like ' . $bad . ' is refused');
}
eq(wx_ann_clean(['on' => true, 'text' => 'x'], ['style' => 'cream'])['style'], 'cream', 'a save that does not mention the colour keeps the one that is live');

group("The site this console serves carries the bar's own code");
$ready = wx_ann_site_ready();
ok($ready['script'], $ready['scriptFile'] . ' fetches the announcement and draws the bar');
ok($ready['style'], $ready['styleFile'] . ' dresses it — the rules were in the older sheet only, so a bar written today would have arrived unstyled');
ok($ready['ready'], 'both halves, which is what the screen reports');
ok(str_contains((string) file_get_contents(WX_SITE_ROOT . '/' . WX_ANN_SCRIPT), 'wx-ann'), 'the class the script adds is the class the stylesheet styles');
$state = wx_ann_state();
eq(count($state['styles']), 3, 'the three colours v2.1 offered');
eq(array_column($state['styles'], 'id'), WX_ANN_STYLES, 'named with the same ids the file stores');
eq($state['limits']['text'], 160, 'the field limit the screen enforces is the one the server enforces');
eq($state['file'], 'assets/announce.json', 'the file the browser fetches is the one the console writes');
ok($state['pages']['total'] >= 1 && $state['pages']['script'] === $state['pages']['total'], 'every page the walker finds loads the script, so every page can show the bar');

/* A damaged file is not "off": the one person who could fix it must not be told the bar is hidden. */
file_put_contents(wx_ann_path(), '{"on":true,"text":"half a fi');
$msg = '';
try {
    wx_ann_read();
} catch (Throwable $e) {
    $msg = $e->getMessage();
}
ok(str_contains($msg, 'damaged'), 'a half-written file is reported as damaged rather than read as off');
@unlink(wx_ann_path());
eq(wx_ann_exists(), false, 'and the test leaves no announcement behind');

/* ============================================================== the AI settings
 *
 * v2.1 kept one `ai` record inside `_private/content.json` — the same file its CMS items live in — and the
 * console writes that file too, so three properties carry more weight than the feature: a save cannot lose
 * a key it was not sent (an ordinary form submit sends none), a read cannot return one, and the rest of the
 * file survives a save through this API. The request builder is here because Claude is not OpenAI-shaped and
 * a wrong shape reads like a wrong key. The network call is the one thing this sandbox cannot run at all.
 *
 * The scratch file matters: on a host that has been running a while, the real store holds the studio's keys,
 * and a test that wrote to it could erase them.
 */

define('WX_AI_TEST_FILE', sys_get_temp_dir() . '/wx-ai-test-' . bin2hex(random_bytes(4)) . '.json');
@unlink(WX_AI_TEST_FILE);

group('The AI settings are v2.1s record, in v2.1s file');
eq(wx_ai_record()['provider'], 'anthropic', 'a fresh install defaults to Claude');
eq(wx_ai_record()['anthropicModel'], 'claude-sonnet-4-5', 'with v2.1s default model');
ok(str_contains(wx_ai_record()['voice'], 'Woodex Interior'), 'and the writing voice every prompt is wrapped in');
eq(wx_ai_state()['exists'], false, 'nothing is stored yet, and that is not an error');

$seed = ['items' => [['id' => 3, 'type' => 'post', 'title' => 'A kitchen in DHA']], 'seq' => 7, 'ai' => ['anthropicKey' => 'sk-ant-secret', 'openaiKey' => 'sk-openai-secret', 'voice' => 'Old voice']];
file_put_contents(WX_AI_TEST_FILE, (string) json_encode($seed));

[$stored, $changed] = wx_ai_save(['voice' => 'New voice']);
eq($stored['anthropicKey'], 'sk-ant-secret', 'saving the voice does not touch a key that was not sent');
eq($stored['voice'], 'New voice', 'and stores the new voice');
eq($changed, ['voice'], 'naming the one field that changed, for the audit row');
$raw = json_decode((string) file_get_contents(WX_AI_TEST_FILE), true);
eq(count($raw['items'] ?? []), 1, 'the rest of v2.1s file survives a save through this API');
eq($raw['seq'] ?? 0, 7, 'including the sequence the CMS counts from');

[$kept] = wx_ai_save(['anthropicKey' => '', 'openaiKey' => '   ']);
eq($kept['anthropicKey'], 'sk-ant-secret', 'an empty key field means "leave it", not "delete it"');
eq($kept['openaiKey'], 'sk-openai-secret', 'and so does one that is only spaces');

[$cleared] = wx_ai_save(['anthropicKey' => '', 'anthropicKeyClear' => true]);
eq($cleared['anthropicKey'], '', 'an explicit Clear erases the key');
eq($cleared['openaiKey'], 'sk-openai-secret', 'and only the one it names');

group('An AI setting is refused by field, not clipped into a shorter, wrong value');
throws('VALIDATION', 'anthropicKey', static fn() => wx_ai_clean(['anthropicKey' => str_repeat('k', 301)], WX_AI_DEF), 'a key longer than the field allows is refused — a clipped key is a wrong key');
eq(mb_strlen(wx_ai_clean(['voice' => str_repeat('v', 800)], WX_AI_DEF)[0]['voice']), 800, 'the voice may be 800 characters: the one field a house style needs room in');
throws('VALIDATION', 'voice', static fn() => wx_ai_clean(['voice' => str_repeat('v', 801)], WX_AI_DEF), 'and one character more is refused');
throws('VALIDATION', 'provider', static fn() => wx_ai_clean(['provider' => 'gemini'], WX_AI_DEF), 'a provider the console does not offer is refused');
throws('VALIDATION', 'customUrl', static fn() => wx_ai_clean(['customUrl' => 'localhost:11434/v1'], WX_AI_DEF), 'a custom endpoint that is not an address is refused');
eq(wx_ai_clean(['provider' => 'custom', 'customUrl' => 'https://tunnel.example.com/v1/'], WX_AI_DEF)[0]['customUrl'], 'https://tunnel.example.com/v1', 'a trailing slash is trimmed, so listing models cannot produce a doubled slash');

group('A key never leaves the server, and readiness is decided before it is masked');
$pub = wx_ai_pub(['provider' => 'openai', 'openaiKey' => 'sk-secret', 'openaiModel' => 'gpt-4o-mini']);
eq($pub['openaiKey'], '', 'the key field comes back empty');
eq($pub['openaiKeySet'], true, 'the screen is told that one is set');
eq($pub['ready'], true, 'and the provider reads as ready');
ok(!str_contains((string) json_encode($pub), 'sk-secret'), 'and the key appears nowhere in the answer at all');
$local = wx_ai_pub(['provider' => 'custom', 'customUrl' => 'http://localhost:11434/v1', 'customKey' => 'none']);
eq($local['customKeySet'], false, 'a local endpoint does not claim a key it does not have');
eq($local['ready'], true, 'but it is ready: it needs an address, not a key');
file_put_contents(WX_AI_TEST_FILE, (string) json_encode(['ai' => ['provider' => 'custom', 'customUrl' => 'http://localhost:11434/v1']]));
eq(wx_ai_record()['customKey'], 'none', 'an address with no key reads as the local-endpoint placeholder, as v2.1 read it');
eq(wx_ai_pub(wx_ai_record())['ready'], true, 'so the screen does not nag for a key the endpoint does not need');
ok(!str_contains((string) file_get_contents(WX_AI_TEST_FILE), 'none'), 'and the placeholder is never written into the file v2.1 reads');

group('The request is v2.1s: Claude is not OpenAI-shaped');
$an = wx_ai_request(['provider' => 'anthropic', 'anthropicKey' => 'k', 'anthropicModel' => 'claude-sonnet-4-5'], 'SYS', 'USER');
eq($an['url'], 'https://api.anthropic.com/v1/messages', 'Claude has its own endpoint');
ok(in_array('anthropic-version: 2023-06-01', $an['headers'], true), 'and needs its version header');
eq($an['body']['system'], 'SYS', 'the writing voice is a top-level field, not a message');
eq($an['body']['messages'][0]['role'], 'user', 'with a single user message');
eq($an['body']['max_tokens'], 6000, 'capped at v2.1s 6000 tokens, so one click cannot cost a fortune');
$or = wx_ai_request(['provider' => 'openrouter', 'openrouterKey' => 'k', 'openrouterModel' => 'x/y'], 'SYS', 'USER');
eq($or['url'], 'https://openrouter.ai/api/v1/chat/completions', 'the other three use the OpenAI shape');
ok(in_array('authorization: Bearer k', $or['headers'], true), 'with the key as a bearer token');
eq($or['body']['messages'][0]['role'], 'system', 'and the writing voice as the first message');
$cu = wx_ai_request(['provider' => 'custom', 'customKey' => '', 'customModel' => 'llama3', 'customUrl' => 'https://t.example.com/v1'], 'SYS', 'USER');
eq($cu['url'], 'https://t.example.com/v1/chat/completions', 'a custom endpoint gets the completions path appended');
$cu2 = wx_ai_request(['provider' => 'custom', 'customKey' => '', 'customModel' => 'llama3', 'customUrl' => 'https://t.example.com/v1/chat/completions'], 'SYS', 'USER');
eq($cu2['url'], 'https://t.example.com/v1/chat/completions', 'and is not appended twice when it is already there');
throws('VALIDATION', 'openaiModel', static fn() => wx_ai_request(['provider' => 'openai', 'openaiKey' => 'k', 'openaiModel' => ''], 'S', 'U'), 'a provider with no model is refused by field, before any request is made');

group('The answer is read two ways');
eq(wx_ai_text('anthropic', ['content' => [['text' => 'one '], ['text' => 'two']]]), 'one two', 'Claude answers in parts, which are joined');
eq(wx_ai_text('openai', ['choices' => [['message' => ['content' => 'ok']]]]), 'ok', 'the others answer in choices');
eq(wx_ai_text('openrouter', []), '', 'and an empty answer is empty here — whether that is an error is the caller s decision');

group('The model list is filtered the way v2.1 filtered it');
$o = wx_ai_models_clean('openai', [['id' => 'gpt-4.1-mini'], ['id' => 'o3-mini'], ['id' => 'chatgpt-4o-latest'], ['id' => 'text-embedding-3-small'], ['id' => 'whisper-1'], ['id' => 'gpt-4o-audio-preview'], ['id' => 'dall-e-3'], ['id' => 'gpt-4.1-mini']]);
ok(!in_array('text-embedding-3-small', $o['models'], true), 'an embedding model is not something to write an article with');
ok(!in_array('whisper-1', $o['models'], true), 'nor a transcription model');
ok(!in_array('gpt-4o-audio-preview', $o['models'], true), 'nor an audio one, even though its name starts with gpt');
eq(count(array_keys($o['models'], 'gpt-4.1-mini')), 1, 'a model the provider lists twice is offered once');
eq($o['recommended'], 'gpt-4.1-mini', 'and the picker opens on the model v2.1 preferred');
$oa = wx_ai_models_clean('openrouter', [['id' => 'z-ai/z'], ['id' => 'anthropic/claude-sonnet-4'], ['name' => 'openai/gpt-4o-mini']]);
eq($oa['models'], ['anthropic/claude-sonnet-4', 'openai/gpt-4o-mini', 'z-ai/z'], 'the others come back sorted, and a provider naming its field `name` still works');
eq($oa['recommended'], 'anthropic/claude-sonnet-4', 'with the preferred one as the suggested default');
$many = [];
for ($i = 0; $i < 500; $i++) {
    $many[] = ['id' => 'model-' . $i];
}
eq(count(wx_ai_models_clean('custom', $many)['models']), 400, 'a list longer than 400 is cut to 400, as v2.1 cut it');
throws('UPSTREAM', null, static fn() => wx_ai_models_clean('openai', [['id' => 'whisper-1']]), 'a list with nothing usable in it says so rather than opening an empty picker');
ok(!wx_ai_configured(['provider' => 'openai', 'openaiKey' => '']), 'a hosted provider with no key is not ready');
ok(wx_ai_configured(['provider' => 'anthropic', 'anthropicKey' => 'k']), 'and one with a key is');

/* The request itself is the one thing this sandbox cannot run: there is no cURL and no provider to reach.
   What can be asserted is that whichever of the two is missing is named — blaming the key is what sends
   somebody to check a key that was fine. Since the connectors slice the wrapper is `wx_http_call()`, in
   `lib/http.php`: the API makes one outward call implementation, not one per slice. */
if (!function_exists('curl_init')) {
    throws('UPSTREAM', null, static fn() => wx_http_call('https://example.com/', [], null, 1), 'without cURL the failure names the extension rather than the key');
} else {
    ok(true, 'cURL is present on this host, so the request half runs here');
}
@unlink(WX_AI_TEST_FILE);


/* ============================================================== findability

   The SEO manager, and the one thing about it that changed: where the working out happens. v2.1 fetched every
   page in the browser, six at a time, and posted the numbers it computed back into `_private/seo.json` for the
   server to keep — so the rules were only exercisable by loading the whole site in a browser, which is why none
   of them was tested anywhere. Here they are two functions with no I/O at all: `wx_seo_issues()` (findings, in
   sentences) and `wx_seo_score()` (a number derived from those findings and nothing else).

   The fixture below is a page with the furniture a real page has: a head with a title and a description, a
   header and a footer that are not this page's content, a script, an image with no alt text, an external link,
   a file link, a telephone link and a link to a page that does not exist. Every one of those is a rule.

   The three files this screen owns — the stored phrases, `robots.txt`, `sitemap.xml` — are named by a constant
   here, because a test that wrote to the site's own ones would be editing the live site. */

group('The page declares one address, and the audit reads it out of the file');

$seoHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    . '<title>Fitted kitchens in Lahore | Woodex Interior</title>'
    . '<meta name="description" content="Fitted kitchens designed and built in Lahore — measured, made and installed by our own team.">'
    . '<meta property="og:image" content="/assets/img/kitchen.webp">'
    . '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Woodex Interior","address":{"@type":"PostalAddress","addressLocality":"Lahore"}}</script>'
    . '</head><body>'
    . '<header class="site-header"><nav><a href="/">Home</a><a href="/about/">About the studio</a></nav></header>'
    . '<main><h1>Fitted kitchens</h1><p>We build kitchens in Lahore and Islamabad.</p>'
    . '<img src="/assets/img/kitchen.webp" alt="A fitted kitchen">'
    . '<img src="/assets/img/plan.webp">'
    . '<a href="/services/office-interiors/">Office interiors</a>'
    . '<a href="/services/wardrobes/">Wardrobes</a>'
    . '<a href="https://example.com/">Elsewhere</a>'
    . '<a href="/assets/price-list.pdf">Price list</a>'
    . '<a href="tel:+923224000768">Call</a>'
    . '<script>var unused = "words that are not the page";</script>'
    . '</main>'
    . '<footer class="footer">' . str_repeat('words that are not this page ', 40) . '</footer>'
    . '</body></html>';

$seoT = wx_seo_text($seoHtml);
eq($seoT['title'], 'Fitted kitchens in Lahore | Woodex Interior', 'the title is read out of the head');
eq($seoT['h1'], 'Fitted kitchens', 'the first H1 is the headline');
eq($seoT['h1Count'], 1, 'and the page has one of them');
eq($seoT['desc'], 'Fitted kitchens designed and built in Lahore — measured, made and installed by our own team.', 'the description is the page\'s own meta tag, not a stored copy of it');
ok($seoT['words'] < 20, 'the header and the footer are furniture, not this page\'s words — 40 repetitions of a sentence are not counted');
ok($seoT['words'] >= 8, 'and the words that are this page are counted');
ok(!str_contains($seoT['text'], 'unused'), 'a script is not text');

$seoL = wx_seo_links($seoHtml, 'services/kitchens/index.html');
ok(in_array('about/index.html', $seoL, true), 'a link to a folder is the page that folder serves');
ok(in_array('services/office-interiors/index.html', $seoL, true), 'a nested address is a page too');
ok(!in_array('assets/price-list.pdf', $seoL, true), 'a file is not a page');
ok(count(array_filter($seoL, static fn($l) => str_contains($l, 'example.com') || str_contains($l, 'tel:'))) === 0, 'another site and a telephone number are not pages of ours');
ok(!in_array('services/kitchens/index.html', $seoL, true), 'a page does not count as linking to itself');
ok(count(array_filter($seoL, static fn($l) => str_starts_with($l, '/') || str_starts_with($l, 'assets'))) === 0, 'the header\'s own links are not this page\'s links');

eq(wx_seo_existing_types($seoHtml), ['Organization', 'PostalAddress'], 'the schema types a page declares are read out of its own JSON-LD, including a nested node\'s');
$seoManaged = str_replace('</head>', '<script type="application/ld+json" id="wx-seo-schema">{"@context":"https://schema.org","@graph":[{"@type":"Service"}]}</script>' . "\n</head>", $seoHtml);
eq(wx_seo_existing_types($seoManaged), ['Organization', 'PostalAddress'], 'and the block this API manages is not counted as the page\'s own');

$seoFaqHtml = preg_replace('~</main>~', str_repeat('<details><summary>How long does it take?</summary><p>Six to eight weeks.</p></details>', 22) . '<details><summary> </summary><p>Nothing.</p></details></main>', $seoHtml, 1);
$seoFaqs = wx_seo_faq($seoFaqHtml);
eq(count($seoFaqs), 20, 'at most twenty questions are taken from a page');
eq($seoFaqs[0]['@type'], 'Question', 'a question in the page is a Question');
eq($seoFaqs[0]['name'], 'How long does it take?', 'with the summary as its name');
eq($seoFaqs[0]['acceptedAnswer']['text'], 'Six to eight weeks.', 'and the rest of the details as its answer');

group('The audit is the findings, and the score is the findings and nothing else');

$seoBase = ['rel' => 'services/kitchens/index.html', 'url' => '/services/kitchens/', 'title' => 'Fitted kitchens in Lahore | Woodex', 'desc' => 'Fitted kitchens designed and built in Lahore, measured and installed by our own team from one workshop in Model Town.', 'h1' => 'Fitted kitchens', 'h1Count' => 1, 'words' => 420, 'status' => 'published', 'indexable' => true, 'inSitemap' => true, 'broken' => [], 'images' => 4, 'imagesNoAlt' => 0];
$seoCodes = static fn(array $f, array $counts = []): array => array_column(wx_seo_issues($f, $counts), 'code');

eq($seoCodes($seoBase), [], 'a page with a title, a description, one headline, enough words and a sitemap line has nothing to report');
eq(wx_seo_score(wx_seo_issues($seoBase)), 100, 'and scores a hundred');
eq(wx_seo_score(wx_seo_issues(['title' => 'Two words'] + $seoBase)), 99, 'one note is one point off');
eq(wx_seo_score(wx_seo_issues(['desc' => ''] + $seoBase)), 97, 'one warning is three');

$seoTitleless = wx_seo_issues(['title' => ''] + $seoBase);
eq($seoTitleless[0]['code'], 'title_missing', 'a page with no title is told so first');
eq($seoTitleless[0]['level'], 'error', 'as an error, because the title is what Google shows');
eq($seoTitleless[0]['field'], 'title', 'and the finding names the field, so a screen can point at the input');
ok(in_array('title_long', $seoCodes(['title' => str_repeat('Office interiors in Lahore ', 4)] + $seoBase), true), 'a title Google will cut is a finding');
ok(in_array('title_duplicate', $seoCodes($seoBase, ['title' => [$seoBase['title'] => 3]]), true), 'as is a title three pages share');
ok(in_array('desc_missing', $seoCodes(['desc' => ''] + $seoBase), true), 'a page with no description is a finding');
ok(in_array('desc_short', $seoCodes(['desc' => 'We build kitchens.'] + $seoBase), true), 'a description with room for a reason to click is one too');
ok(in_array('desc_duplicate', $seoCodes($seoBase, ['desc' => [$seoBase['desc'] => 2]]), true), 'and a description two pages share is one');
ok(in_array('h1_missing', $seoCodes(['h1Count' => 0, 'h1' => ''] + $seoBase), true), 'a page with no headline says so');
ok(in_array('h1_multiple', $seoCodes(['h1Count' => 3] + $seoBase), true), 'and so does a page with three');
ok(in_array('thin_text', $seoCodes(['words' => 120] + $seoBase), true), 'a hundred and twenty words reads as thin');
ok(in_array('not_public', $seoCodes(['status' => 'draft', 'inSitemap' => false] + $seoBase), true), 'a draft is a note rather than a fault — it is not public on purpose');
ok(in_array('noindex', $seoCodes(['indexable' => false, 'inSitemap' => false] + $seoBase), true), 'a published page held out of search is a warning');
ok(in_array('not_in_sitemap', $seoCodes(['inSitemap' => false] + $seoBase), true), 'a public page missing from the sitemap is an error');
ok(in_array('sitemap_noindex', $seoCodes(['indexable' => false] + $seoBase), true), 'and a page that is listed while telling Google not to index it is one — the two cannot both be right');
ok(in_array('broken_link', $seoCodes(['broken' => ['/services/wardrobes/', '/team/']] + $seoBase), true), 'a link to a page that is not on the site is an error');
ok(str_contains(wx_seo_issues(['broken' => ['/services/wardrobes/']] + $seoBase)[0]['message'], '/services/wardrobes/'), 'and it names the address somebody has to fix');
ok(in_array('image_no_alt', $seoCodes(['imagesNoAlt' => 2] + $seoBase), true), 'an image with no alt text is a note');

$seoAll = wx_seo_issues(['title' => '', 'desc' => '', 'h1Count' => 0, 'words' => 0, 'status' => 'published', 'indexable' => false, 'inSitemap' => true, 'broken' => ['/gone/', '/also-gone/'], 'imagesNoAlt' => 7] + $seoBase);
$seoExpected = 100;
foreach ($seoAll as $i) {
    $seoExpected -= ['error' => 8, 'warn' => 3, 'note' => 1][$i['level']];
}
eq(wx_seo_score($seoAll), $seoExpected, 'a page with everything wrong scores the sum of what is wrong with it');
eq(wx_seo_score(array_fill(0, 20, ['level' => 'error'])), 0, 'and the score floors at zero rather than going negative');

$seoTally = wx_seo_tally([['issues' => []], ['issues' => [['code' => 'title_missing', 'level' => 'error'], ['code' => 'thin_text', 'level' => 'note']]], ['issues' => [['code' => 'thin_text', 'level' => 'note']]]]);
eq($seoTally['clean'], 1, 'the tally counts the pages with nothing to report');
eq($seoTally['byLevel']['error'], 1, 'the findings by how serious they are');
eq($seoTally['byCode']['thin_text'], 2, 'and by what they are');
eq(array_key_first($seoTally['byCode']), 'thin_text', 'with the most common first, because that is what one fix would change');

group('The managed schema block is one block, and it says what the page says');

$seoBlock = wx_seo_schema_block('services/kitchens/index.html', $seoHtml, ['LocalBusiness', 'Service', 'Article', 'BreadcrumbList'], wx_company(), 1770000000);
$seoJson = json_decode((string) $seoBlock, true);
eq($seoJson['@context'], 'https://schema.org', 'the block is schema.org');
eq(array_column($seoJson['@graph'], '@type'), ['LocalBusiness', 'Service', 'Article', 'BreadcrumbList'], 'one node per type chosen, in the order chosen');
eq($seoJson['@graph'][0]['name'], wx_company()['name'], 'the business node is the company record the letterhead uses');
eq($seoJson['@graph'][0]['@id'], 'https://woodex.com.pk/#business', 'with one address for the business, the site\'s own host');
eq($seoJson['@graph'][1]['name'], 'Fitted kitchens', 'the service is named after the page\'s own headline');
eq($seoJson['@graph'][1]['description'], $seoT['desc'], 'and described with the page\'s own description');
eq($seoJson['@graph'][2]['image'], 'https://woodex.com.pk/assets/img/kitchen.webp', 'the article\'s image is the page\'s og:image, as a full link');
eq(count($seoJson['@graph'][3]['itemListElement']), 3, 'the breadcrumb of a page one folder deep is home, the folder and the page');
eq($seoJson['@graph'][3]['itemListElement'][2]['name'], 'Fitted kitchens', 'with the headline as the last item\'s name');
eq(wx_seo_schema_block('index.html', str_replace('"@type":"Organization"', '"@type":"LocalBusiness"', $seoHtml), ['LocalBusiness'], wx_company(), 0), null, 'a type the page already declares is not added a second time');
eq(wx_seo_schema_block('services/kitchens/index.html', $seoHtml, ['FAQPage'], wx_company(), 0), null, 'a page with no questions declares no FAQ page');
$seoFaqBlock = json_decode((string) wx_seo_schema_block('faq/index.html', $seoFaqHtml, ['FAQPage'], wx_company(), 0), true);
eq(count($seoFaqBlock['@graph'][0]['mainEntity']), 20, 'and a page with twenty questions declares twenty, and no more than it has');

$seoApplied = wx_seo_schema_html($seoHtml, $seoBlock);
eq(substr_count($seoApplied, 'id="wx-seo-schema"'), 1, 'the managed block is written once');
ok(str_contains($seoApplied, (string) $seoBlock), 'exactly as it was built');
eq(substr_count(wx_seo_schema_html($seoApplied, $seoBlock), 'id="wx-seo-schema"'), 1, 'writing it again replaces it rather than adding a second');
$seoCleared = wx_seo_schema_html($seoApplied, null);
eq(substr_count($seoCleared, 'id="wx-seo-schema"'), 0, 'and choosing nothing takes it out');
ok(str_contains($seoCleared, '"@type":"Organization"'), 'without touching the page\'s own JSON-LD');
ok(str_contains($seoCleared, '</head>'), 'and the head is still a head');

group('The phrase per page is stored in v2.1s file, and a score from a browser is not');

define('WX_SEO_TEST_FILE', sys_get_temp_dir() . '/wx-seo-test-' . bin2hex(random_bytes(4)) . '.json');
file_put_contents(WX_SEO_TEST_FILE, (string) json_encode(['pages' => [], 'scan' => ['at' => '2026-10-01 09:00:00'], 'aiReady' => true]));
eq(wx_seo_records(), [], 'nothing is stored for a fresh install');

$seoRec = wx_seo_put('about/index.html', ['kw' => str_repeat('k', 130), 'related' => ['a', 'b', '', 'c', 'd', 'e', 'a'], 'schema' => ['LocalBusiness', 'Nonsense', 'Article']]);
eq(mb_strlen($seoRec['kw']), 120, 'a focus phrase is clipped to 120 characters');
eq($seoRec['related'], ['a', 'b', 'c', 'd'], 'at most four related phrases, empty ones dropped and the same one kept once');
eq($seoRec['schema'], ['LocalBusiness', 'Article'], 'and a schema type the site does not offer is not stored');
ok(($seoRec['t'] ?? '') !== '', 'the record says when it was written');
wx_seo_put('services/kitchens/index.html', ['kw' => 'fitted kitchens']);
eq(wx_seo_record('services/kitchens/index.html')['kw'], 'fitted kitchens', 'a record is readable by the address of the page it is about');
wx_seo_put('about/index.html', ['kw' => 'kitchens in lahore']);
eq(wx_seo_record('about/index.html')['kw'], 'kitchens in lahore', 'saving one field changes that field');
eq(wx_seo_record('about/index.html')['related'], ['a', 'b', 'c', 'd'], 'and leaves the related phrases a save did not carry — a form that erases what it was not told about is a form that loses work');
wx_seo_put('about/index.html', ['kw' => 'kitchens in lahore', 'score' => 82]);
ok(!array_key_exists('score', wx_seo_record('about/index.html')), 'a score sent from a browser is not stored — the audit computes it, and a stored second opinion is only ever out of date');
$seoRaw = json_decode((string) file_get_contents(WX_SEO_TEST_FILE), true);
eq(count($seoRaw['pages']), 2, 'saving one page keeps the others');
eq($seoRaw['scan']['at'] ?? '', '2026-10-01 09:00:00', 'and keeps whatever else v2.1 kept in the file');
eq(wx_seo_record('about/index.html')['schema'], ['LocalBusiness', 'Article'], 'and the schema choice a phrase-only save did not carry');
eq(wx_seo_record('nope/index.html'), null, 'a page with nothing stored reads as null rather than as an empty record');

group('robots.txt is proved, saved and refused by field');

define('WX_SEO_ROBOTS_FILE', WX_SITE_ROOT . '/.wx-test-robots.txt');
@unlink(WX_SEO_ROBOTS_FILE);
$seoRobotMe = ['id' => 1, 'name' => 'Test owner', 'role' => 'owner'];
eq(wx_seo_robots_problem("User-agent: *\nAllow: /\n\nSitemap: https://woodex.com.pk/sitemap.xml\n"), null, 'a normal robots.txt is fine');
eq(wx_seo_robots_problem(''), null, 'and an empty one is allowed — it says nothing, which is not a mistake');
ok(wx_seo_robots_problem("User-agent: *\nDisallow: /\n") !== null, 'the one line that takes the whole site out of Google is refused');
eq(wx_seo_robots_problem("User-agent: *\nDisallow: /\n", true), null, 'and allowed when it is asked for twice');
eq(wx_seo_robots_problem("User-agent: *\nDisallow: /admin/\n"), null, 'disallowing a folder is not disallowing the site');
ok(wx_seo_robots_problem(str_repeat("# a line of comment\n", 300)) !== null, 'a file over 5000 characters is refused');
ok(wx_seo_robots_read()['exists'] === false, 'nothing has been written yet');
$seoRobots = wx_seo_robots_save("User-agent: *\r\nAllow: /\r\n\r\nSitemap: https://woodex.com.pk/sitemap.xml ", false, $seoRobotMe);
eq($seoRobots['wrote'], true, 'writing robots.txt writes it');
eq($seoRobots['text'], "User-agent: *\nAllow: /\n\nSitemap: https://woodex.com.pk/sitemap.xml\n", 'carriage returns are taken out and the file ends with a newline');
eq($seoRobots['sitemapLine'], 'https://woodex.com.pk/sitemap.xml', 'and the line that points at the sitemap is read back');
eq($seoRobots['blocksAll'], false, 'the file does not block the site');
eq(wx_seo_robots_save($seoRobots['text'], false, $seoRobotMe)['wrote'], false, 'writing the same text a second time writes nothing');
throws('VALIDATION', 'text', static fn() => wx_seo_robots_save("User-agent: *\nDisallow: /\n", false, $seoRobotMe), 'the refusal is by field rather than a silent trim');
ok(str_contains((string) file_get_contents(WX_SEO_ROBOTS_FILE), 'Allow: /'), 'and a refused write leaves the file as it was');
$seoForced = wx_seo_robots_save("User-agent: *\nDisallow: /\n", true, $seoRobotMe);
eq($seoForced['blocksAll'], true, 'asked for twice, the whole site can be disallowed');
eq($seoForced['forced'], true, 'and the answer says it was forced');

group('The sitemap is built from the pages, and only from the pages it can explain');

/* Scratch pages under the site root, because the two rules that matter here can only be proved against files:
   a page that is no longer public must come out of the file, and an address the walk cannot explain must stay
   in it. The file itself is the constant the publishing tests defined — never the site's own sitemap. */
$seoDir = WX_SITE_ROOT . '/wx-test-seo';
@mkdir($seoDir . '/deep', 0755, true);
@mkdir($seoDir . '/hidden', 0755, true);
@mkdir($seoDir . '/drafted', 0755, true);
$seoShell = static fn(string $title, string $robots = ''): string => '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    . '<title>' . $title . ' | Woodex Interior</title>'
    . '<meta name="description" content="A scratch page the test suite writes and then deletes, with a description long enough to be a description.">'
    . ($robots !== '' ? '<meta name="robots" content="' . $robots . '">' : '') . '</head><body><h1>' . $title . '</h1></body></html>';
file_put_contents($seoDir . '/index.html', $seoShell('A scratch page for the sitemap test'));
file_put_contents($seoDir . '/deep/index.html', $seoShell('A nested scratch page'));
file_put_contents($seoDir . '/hidden/index.html', $seoShell('A page held out of search', 'noindex, follow'));
file_put_contents($seoDir . '/drafted/index.html', $seoShell('A page that is a draft'));
file_put_contents(WX_PAGE_STATE_FILE, (string) json_encode(['wx-test-seo/drafted/index.html' => ['status' => 'draft']]));
/* One of the four files that are not addresses, written at the site root for the length of this group. It has
   to exist for the walk to be able to explain it: the rule is that a rebuild leaves an error page out even
   though there is a page there. */
$seoErrorPage = WX_SITE_ROOT . '/500.html';
file_put_contents($seoErrorPage, $seoShell('Something went wrong'));
$seoSmFile = WX_PAGE_SITEMAP_FILE;
file_put_contents($seoSmFile, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
    . "  <url><loc>https://woodex.com.pk/wx-test-seo/</loc><lastmod>2026-09-01</lastmod></url>\n"
    . "  <url><loc>https://woodex.com.pk/wx-test-seo/hidden/</loc><lastmod>2026-09-01</lastmod></url>\n"
    . "  <url><loc>https://woodex.com.pk/wx-test-seo/drafted/</loc><lastmod>2026-09-01</lastmod></url>\n"
    . "  <url><loc>https://woodex.com.pk/500.html</loc><lastmod>2026-09-01</lastmod></url>\n"
    . "  <url><loc>https://woodex.com.pk/press/</loc><lastmod>2026-09-01</lastmod></url>\n"
    . "</urlset>\n");

$seoRows = [
    ['rel' => 'wx-test-seo/index.html', 'url' => '/wx-test-seo/', 'status' => 'published', 'indexable' => true, 'inSitemap' => true],
    ['rel' => 'wx-test-seo/deep/index.html', 'url' => '/wx-test-seo/deep/', 'status' => 'published', 'indexable' => true, 'inSitemap' => false],
    ['rel' => 'wx-test-seo/hidden/index.html', 'url' => '/wx-test-seo/hidden/', 'status' => 'published', 'indexable' => false, 'inSitemap' => true],
    ['rel' => 'wx-test-seo/drafted/index.html', 'url' => '/wx-test-seo/drafted/', 'status' => 'draft', 'indexable' => false, 'inSitemap' => true],
    ['rel' => '500.html', 'url' => '/500.html', 'status' => 'published', 'indexable' => true, 'inSitemap' => true],
];
$seoState = wx_seo_sitemap_state($seoRows);
eq($seoState['listed'], 4, 'the state counts the addresses the file lists');
eq($seoState['missing'], ['wx-test-seo/deep/index.html'], 'and names the public page the file is missing');
eq($seoState['shouldNotBeListed'], ['wx-test-seo/hidden/index.html', 'wx-test-seo/drafted/index.html', '500.html'], 'and the entries that point at a page nobody should arrive at from a search result');
eq($seoState['extra'], ['https://woodex.com.pk/press/'], 'and the address in the file that no page on disk explains — somebody\'s own addition');
eq($seoState['wanted'], 3, 'so a rebuild would leave three: the two public pages and the one address it cannot explain');

$seoXml = wx_seo_sitemap_xml([['url' => '/about/', 'lastmod' => '2026-10-07'], ['url' => '/', 'lastmod' => '2026-10-01']], ['https://woodex.com.pk/press/']);
ok(str_starts_with($seoXml, '<?xml version="1.0" encoding="UTF-8"?>'), 'a sitemap is an XML document');
ok(str_ends_with($seoXml, "</urlset>\n"), 'that closes its urlset');
eq(substr_count($seoXml, '<loc>'), 3, 'with one line per address: the pages and what it cannot explain');
ok(strpos($seoXml, '<loc>https://woodex.com.pk/</loc>') < strpos($seoXml, '<loc>https://woodex.com.pk/about/</loc>'), 'sorted by address, so a rebuild is one change rather than a reordering every time');
ok(str_contains($seoXml, '<lastmod>2026-10-07</lastmod>'), 'and each page carries the date its file was last written');

$seoListed = array_column(wx_seo_sitemap_pages(), 'rel');
ok(in_array('wx-test-seo/index.html', $seoListed, true), 'a page that is published belongs in the sitemap');
ok(in_array('wx-test-seo/deep/index.html', $seoListed, true), 'so does one a folder deep');
ok(!in_array('wx-test-seo/hidden/index.html', $seoListed, true), 'a page telling Google not to index it does not');
ok(!in_array('wx-test-seo/drafted/index.html', $seoListed, true), 'nor does a draft');
ok(!in_array('500.html', $seoListed, true), 'and an error page is not an address a search engine should arrive at — there is a file there, and the four are named in one constant');

$seoRebuilt = wx_seo_sitemap_rebuild($seoRobotMe);
ok($seoRebuilt['wrote'], 'a rebuild writes the file');
eq($seoRebuilt['count'], count($seoListed), 'and the count is the pages that belong in it');
eq($seoRebuilt['kept'], ['https://woodex.com.pk/press/'], 'an address no page explains is kept — a rebuild is not a deletion');
$seoAfter = (string) file_get_contents($seoSmFile);
ok(str_contains($seoAfter, '<loc>https://woodex.com.pk/wx-test-seo/deep/</loc>'), 'the nested page went in');
ok(!str_contains($seoAfter, 'wx-test-seo/hidden/'), 'the page held out of search came out');
ok(!str_contains($seoAfter, 'wx-test-seo/drafted/'), 'and so did the draft — which is the point: the file stops advertising a page somebody took down');
ok(!str_contains($seoAfter, '<loc>https://woodex.com.pk/500.html</loc>'), 'and the error page is left out even though the file is there');
ok(str_contains($seoAfter, '<loc>https://woodex.com.pk/press/</loc>'), 'and the address it cannot explain is still there');
eq(wx_seo_sitemap_rebuild($seoRobotMe)['wrote'], false, 'a rebuild with nothing to change writes nothing the second time');

@unlink($seoDir . '/index.html');
@unlink($seoDir . '/deep/index.html');
@unlink($seoDir . '/hidden/index.html');
@unlink($seoDir . '/drafted/index.html');
@rmdir($seoDir . '/deep');
@rmdir($seoDir . '/hidden');
@rmdir($seoDir . '/drafted');
@rmdir($seoDir);
@unlink($seoErrorPage);
@unlink(WX_PAGE_STATE_FILE);
@unlink($seoSmFile);
@unlink(WX_SEO_ROBOTS_FILE);
@unlink(WX_SEO_TEST_FILE);
ok(!is_file($seoDir . '/index.html') && !is_file(WX_SEO_ROBOTS_FILE), 'the test leaves no scratch page and no scratch robots.txt behind');

/* ==================================================== findability, as wiring
   Where the screen's paths meet the policy's action names. Renaming either half is how a screen quietly
   becomes unavailable to somebody, so the path, the handler and the action are asserted together, the way
   the gate's three sentences are. */

$seoList = $find('GET', 'seo/pages');
ok($seoList !== null && $seoList['handler'] === 'wx_route_seo_pages', 'the screen reads GET seo/pages');
eq($seoList['action'] ?? null, 'seo_list', 'through the action v2.1 called reading the list');
$seoOne = $find('GET', 'seo/pages/{rel:any}');
ok($seoOne !== null && $seoOne['handler'] === 'wx_route_seo_page' && ($seoOne['action'] ?? null) === 'seo_page',
    'and one page through a nested address: `{rel:any}` is what lets a page in a folder be addressed at all');
eq(wx_route_match('GET', ['seo', 'pages', 'services', 'kitchens', 'index.html'])[1]['rel'] ?? null,
    'services/kitchens/index.html', 'a nested page is one parameter, not three segments nobody matches');
$seoSave = $find('POST', 'seo/pages/{rel:any}');
ok($seoSave !== null && $seoSave['handler'] === 'wx_route_seo_save', 'a save is POST seo/pages/{rel}');
eq($seoSave['action'] ?? null, 'seo_save', 'under v2.1\'s action, which the policy knows ends in `save` — so a Manager\'s change waits for the Master');
ok($find('GET', 'seo/audit') !== null && $find('POST', 'seo/audit') === null,
    'the audit is a GET, because it recomputes the scores and stores nothing');
$seoSmApi = $find('POST', 'seo/sitemap');
ok($seoSmApi !== null && $seoSmApi['handler'] === 'wx_route_seo_sitemap_rebuild', 'a rebuild is POST seo/sitemap');
ok(isset(WX_APPR_NEVER['seo_sitemap']), 'and it is one of the writes the policy decided needs nobody: a file derived from the pages');
$seoRobotsApi = $find('POST', 'seo/robots');
ok($seoRobotsApi !== null && ($seoRobotsApi['action'] ?? null) === 'seo_robots_save', 'robots.txt is written under v2.1\'s action too');
ok($find('GET', 'seo/robots') !== null && $find('GET', 'seo/sitemap') !== null, 'and both files can be read without writing anything');

/* The bridged names: v2.1's screens keep calling their own actions, and every one of them has to land on a
   handler that exists. A bridge row naming a function nobody wrote is a 500 in the old admin, not a missing
   feature — which is why this asserts the function, not just the row. */
$seoBridge = wx_legacy_bridged();
foreach (['seo_list', 'seo_page', 'seo_save', 'seo_scores', 'seo_robots_save', 'seo_sitemap', 'seo_ai'] as $seoAction) {
    ok(isset($seoBridge[$seoAction]) && function_exists($seoBridge[$seoAction][1]),
        'v2.1\'s ' . $seoAction . ' still lands on a handler');
}

/* ================================================== the studio's integrations
   The store holds credentials, so these tests never touch the real file: `WX_CONN_TEST_FILE` is the seam, and
   the first thing asserted about the file itself is its mode. The two test branches that decide from the shape
   of what was saved run here; the branch that calls out does not, because a test must not depend on a network
   to prove that "the token was rejected" is a sentence rather than an exception. */

define('WX_CONN_TEST_FILE', sys_get_temp_dir() . '/wx-conn-test.json');
@unlink(WX_CONN_TEST_FILE);

$connMe = ['name' => 'Test Owner', 'role' => 'owner'];
throws('VALIDATION', 'name', static fn() => wx_conn_save(['name' => '   '], $connMe),
    'a connector with no name is refused, and the field is named');
throws('VALIDATION', 'url', static fn() => wx_conn_save(['name' => 'Slack', 'url' => 'slack.com/hooks'], $connMe),
    'an address that is not http(s) is refused');

$connSaved = wx_conn_save(['name' => 'GitHub backups', 'key' => 'github', 'cat' => 'Backups',
    'account' => 'woodex/site', 'secret' => 'ghp_ABCDEFGH1234'], $connMe);
$connItem = $connSaved['item'];
ok(!array_key_exists('secret', $connItem) && $connItem['hasSecret'] === true,
    'the record comes back without the secret, saying there is one');
eq($connItem['hint'] ?? null, '1234', 'and with its last four characters, which is all a screen needs');
eq($connItem['status'], 'connected', 'a record with a token and an account reads as connected');
$connId = (string) $connItem['id'];
eq(substr(sprintf('%o', fileperms(WX_CONN_TEST_FILE)), -4), '0600',
    'and the file holding it is readable only by the account that owns it');

$connEdit = wx_conn_save(['id' => $connId, 'name' => 'GitHub backup repo', 'key' => 'github'], $connMe);
ok($connEdit['item']['hasSecret'] === true, 'saving without sending a secret keeps the one already there');
$connCleared = wx_conn_save(['id' => $connId, 'name' => 'GitHub backup repo', 'key' => 'github', 'secret' => ''], $connMe);
ok($connCleared['item']['hasSecret'] === false,
    'and sending an empty one clears it — v2.1 could not, so a revoked token could only be fixed by deleting the record');
eq($connCleared['item']['hint'] ?? null, null, 'with no last-four hint left behind');

/* The checks that decide from the shape of what was saved. */
$connBad = wx_conn_save(['name' => 'GH wrong', 'key' => 'github', 'account' => 'not-a-repo'], $connMe);
$connT = wx_conn_test((string) $connBad['item']['id'], $connMe);
ok($connT['pass'] === false && str_contains($connT['message'], 'owner/name'),
    'a repository that is not owner/name fails its test, and the sentence says what to fix');
$connGm = wx_conn_save(['name' => 'Gmail', 'key' => 'gmail', 'account' => 'studio@gmail.com', 'secret' => 'abcdefghijklmnop'], $connMe);
ok(wx_conn_test((string) $connGm['item']['id'], $connMe)['pass'] === true,
    'a Gmail address with a 16-letter app password passes, and the sentence names the mail channel');
$connGmBad = wx_conn_save(['name' => 'Gmail 2', 'key' => 'gmail', 'account' => 'studio@gmail.com', 'secret' => 'short'], $connMe);
ok(wx_conn_test((string) $connGmBad['item']['id'], $connMe)['pass'] === false, 'and an ordinary password fails it');
$connDr = wx_conn_save(['name' => 'Drive', 'key' => 'gdrive', 'account' => 'https://drive.google.com/drive/folders/1AbC-xyz'], $connMe);
ok(wx_conn_test((string) $connDr['item']['id'], $connMe)['pass'] === true, 'a Drive folder link passes its own check');

/* A push refuses before it reaches a network when the record is not ready — the honest half of the action. */
$connPush = wx_conn_push_id((string) $connDr['item']['id'], $connMe);
ok($connPush['pass'] === false && str_contains($connPush['message'], 'Apps Script'),
    'a push with no Apps Script address is refused, naming what is missing');
$connCustom = wx_conn_save(['name' => 'Facebook', 'key' => 'facebook', 'account' => 'page-id'], $connMe);
$connPushC = wx_conn_push_id((string) $connCustom['item']['id'], $connMe);
ok($connPushC['pass'] === false && str_contains($connPushC['message'], 'GitHub and Google Drive'),
    'and a connector that is not a backup target says which two are');

/* The backup itself: the pages, the public files, and the database without the logins. */
[$connZip, $connZipErr] = wx_conn_offsite_zip();
if ($connZip === '') {
    eq($connZipErr, 'The ZipArchive PHP extension is not enabled, so there is nothing to upload',
        'without ZipArchive the backup refuses with the sentence that names it, rather than pretending');
} else {
    $connZ = new ZipArchive();
    ok($connZ->open($connZip) === true, 'the off-site backup is a real zip (' . round(filesize($connZip) / 1024) . ' KB)');
    $connNames = [];
    for ($i = 0; $i < $connZ->numFiles; $i++) {
        $connNames[] = (string) $connZ->getNameIndex($i);
    }
    ok(in_array('index.html', $connNames, true), 'holding the site pages');
    ok(in_array('database.json', $connNames, true), 'and a database dump');
    ok(!in_array('_private/' . WX_CONN_FILE, $connNames, true) && !in_array('_private/db.json', $connNames, true),
        'and none of the private files a backup must never carry');
    $connDump = json_decode((string) $connZ->getFromName('database.json'), true);
    ok(is_array($connDump) && $connDump !== [],
        'the dump is JSON holding the tables — or, on a host whose database cannot be read, the reason, which is the '
        . 'one thing a silently empty backup hides');
    ok(!array_key_exists('wx_users', (array) $connDump), 'and logins are not in it');
    $connZ->close();
    @unlink($connZip);
}

/* The daily rule, exercised offline: a Drive record whose push refuses before it calls out. */
$connTick = wx_conn_save(['name' => 'Drive daily', 'key' => 'gdrive', 'on' => true, 'secret' => 'script-key-1234',
    'account' => 'https://drive.google.com/drive/folders/1AbC-xyz'], $connMe);
$connLines = wx_conn_tick();
ok(count($connLines) >= 1 && str_contains(implode(' | ', $connLines), 'Drive daily'),
    'the daily tick tries every switched-on backup target once');
$connAfter = wx_conn_items();
$connIdx = wx_conn_index($connAfter, (string) $connTick['item']['id']);
ok($connIdx >= 0 && (int) $connAfter[$connIdx]['lastPush'] > 0, 'and records when it ran, so the next tick leaves it alone');
ok(wx_conn_tick() === [], 'so running it twice does nothing — twenty hours is the rule, not "every time the cron wakes"');

/* The generated gallery, and the delete. */
$connCat = wx_conn_catalog();
eq(count($connCat['cards']), 24, 'the generated gallery has its 24 cards');
eq(count($connCat['tabs']), 5, 'five tabs');
eq(count($connCat['featured']), 9, 'and nine featured');
ok(isset($connCat['cards'][0]['key'], $connCat['cards'][0]['account'], $connCat['cards'][0]['secret'], $connCat['cards'][0]['help']),
    'each card says what to paste into both fields and how to find it');
$connLeft = wx_conn_delete((string) $connCustom['item']['id'], $connMe);
ok(!in_array((string) $connCustom['item']['id'], array_column($connLeft['items'], 'id'), true),
    'deleting a record takes it out of the list');
throws('NOT_FOUND', null, static fn() => wx_conn_delete('c0000000000', $connMe),
    'and an id nobody saved is a 404 rather than a silent success');

/* ==================================================== integrations, as wiring
   The path, the handler and the policy's action name, asserted together — and the two actions this API has no
   SMTP client for asserted *absent*, so a later turn adds them on purpose rather than by accident. */

$connList = $find('GET', 'connectors');
ok($connList !== null && $connList['handler'] === 'wx_route_connectors_list', 'the screen reads GET connectors');
eq($connList['action'] ?? null, 'conn_list', 'through v2.1\'s own action name');
$connSaveRoute = $find('POST', 'connectors');
ok($connSaveRoute !== null && ($connSaveRoute['action'] ?? null) === 'conn_save', 'a save is POST connectors');
eq(wx_appr_needed('admin', 'conn_save'), true, 'and it is a change a Manager must ask the Master about');
eq(wx_appr_needed('admin', 'conn_test'), false, 'while a test is never queued — the policy\'s own `_test` rule');
eq(wx_appr_needed('admin', 'conn_push'), false, 'and a backup push is not queued either');
ok(isset(WX_APPR_NEVER['conn_push']) && WX_APPR_NEVER['conn_push'] !== '',
    'because the policy names that decision, with the reason that the same function is the scheduled daily backup');
ok($find('DELETE', 'connectors/{id}') !== null && $find('POST', 'connectors/{id}/test') !== null
    && $find('POST', 'connectors/{id}/push') !== null, 'with a route each for delete, test and push');
$connUnported = wx_conn_list()['unported'];
ok(isset($connUnported['conn_gmail_send'], $connUnported['conn_gmail_use']),
    'and the two actions this API has no SMTP client for are named where the screen can read them');
$connBridge = wx_legacy_bridged();
foreach (['conn_list', 'conn_save', 'conn_delete', 'conn_test', 'conn_push'] as $connAction) {
    ok(isset($connBridge[$connAction]) && function_exists($connBridge[$connAction][1]),
        'v2.1\'s ' . $connAction . ' still lands on a handler');
}
ok(!isset($connBridge['conn_gmail_send']) && !isset($connBridge['conn_gmail_use']),
    'and the two that are not ported are not bridged to something that does not exist');
eq(wx_legacy_params(['id' => 'id'], ['id' => 'c1a2b3c4d5'], []), ['id' => 'c1a2b3c4d5'],
    'a bridged connector id stays a string — `[\'id\']` would cast it to an int and address connector 0');
@unlink(WX_CONN_TEST_FILE);

group('The intake rules — one enquiry, one lead, no silent loss (plan §5.1)');

require_once dirname(__DIR__) . '/frontend-v1/api/intake-lib.php';

/* ---- the duplicate rule: what counts as the same enquiry ---- */
$keys_a = intake_dedupe_keys('+92 322 4000768', 'Ali@Example.com ', 'contact', '/contact/');
$keys_b = intake_dedupe_keys('0322 4000768', 'ali@example.com', 'contact', '/contact/');
ok($keys_a === $keys_b, 'the same person is recognised whatever way the phone and email are typed');
ok(count($keys_a) === 2, 'a phone and an email are two identities to claim');
ok(intake_dedupe_keys('+92 322 4000768', '', 'contact', '/contact/')[0] === $keys_a[0], 'the phone claim is the same when no email was given');
ok(count(intake_dedupe_keys('+92 322 4000768', '', 'contact', '/contact/')) === 1, 'and then there is only one identity');
ok(intake_dedupe_keys('+92 322 4000768', '', 'contact', '/estimator/')[0] !== $keys_a[0], 'the same person on another page is a different enquiry');
ok(intake_dedupe_keys('+92 322 4000768', '', 'estimator', '/contact/')[0] !== $keys_a[0], 'and so is the same person on another form');
ok(intake_digits('+92 322 4000768') === intake_digits('0322 4000768'), 'a country code in front of the number changes nothing');
ok(intake_digits('') === '', 'a submission with no phone has no phone identity');
ok(intake_dedupe_keys('', 'not-an-email', 'contact', '/x/') === [], 'a submission with no recognisable identity claims nothing');
ok(intake_verdict(new IntakeMemoryStore(), [], 1000)['duplicate'] === false, 'and so it can never be called a duplicate — it passes through');

/* ---- the claim: the same submission twice is one lead ---- */
$store = new IntakeMemoryStore();
$first = intake_verdict($store, $keys_a, 1000);
ok($first['duplicate'] === false, 'a first submission is a lead');
ok(count($first['claimed']) === 2, 'and it claims both of its identities');
$second = intake_verdict($store, $keys_a, 1100);
ok($second['duplicate'] === true, 'the same submission inside the window is a duplicate');
ok($second['since'] === 1000, 'and the log can say when the first one arrived');
$again = intake_verdict($store, $keys_a, 1000 + INTAKE_DEDUPE_SECONDS);
ok($again['duplicate'] === false, 'a genuinely new enquiry after the window is a lead again');
ok(intake_claim_decision(1000, 1000 + INTAKE_DEDUPE_SECONDS - 1) === 'duplicate', 'one second before the window ends is still a duplicate');
ok(intake_claim_decision(null, 1000) === 'free', 'a key never claimed is free');

/* ---- a duplicate gives back the claims it took, so the store remembers only real leads ---- */
$store2 = new IntakeMemoryStore();
intake_verdict($store2, [$keys_a[0]], 1000);                 // an earlier lead holds the phone identity
$dup = intake_verdict($store2, $keys_a, 1100);               // this one matches on it and must not keep the email claim
ok($dup['duplicate'] === true && $dup['claimed'] === [], 'a duplicate walks away with nothing');
ok($store2->keys() === [$keys_a[0]], 'and the store still holds only the first lead\'s claim');

/* ---- the SQL store, against a fake connection that behaves like wx_throttle ---- */
$rows = [];
$exec = static function (string $sql, array $bind) use (&$rows): array {
    if (str_starts_with($sql, 'SELECT')) {
        return isset($rows[$bind[0]]) ? [['t' => $rows[$bind[0]]]] : [];
    }
    if (str_starts_with($sql, 'INSERT')) {
        if (isset($rows[$bind[0]])) {
            throw new RuntimeException('UNIQUE constraint failed');
        }
        $rows[$bind[0]] = $bind[1];
        return [];
    }
    if (str_starts_with($sql, 'DELETE')) {
        unset($rows[$bind[0]]);
    }
    return [];
};
$store3 = new IntakeThrottleStore($exec);
ok($store3->claim($keys_a[0], 1000) === true, 'a claim is a row in the table this site already has');
ok($store3->seen($keys_a[0]) === 1000, 'and the row says when it was taken');
$store3->release($keys_a[0]);
ok($store3->seen($keys_a[0]) === null, 'a released claim leaves nothing behind');

/* ---- two requests racing for the same key: one lead, one told it is a duplicate ----
   Both saw no row (a stale read at the same instant); the INSERT is the atomic step, exactly as on MySQL. */
$raceRows = [];
$raceExec = static function (string $sql, array $bind) use (&$raceRows): array {
    if (str_starts_with($sql, 'SELECT')) {
        return [];
    }
    if (str_starts_with($sql, 'INSERT')) {
        if (isset($raceRows[$bind[0]])) {
            throw new RuntimeException('UNIQUE constraint failed');
        }
        $raceRows[$bind[0]] = $bind[1];
    }
    return [];
};
$racer = new IntakeThrottleStore($raceExec);
ok($racer->claim($keys_a[0], 1000) === true, 'the claim is taken by whoever inserts first');
ok($racer->claim($keys_a[0], 1001) === false, 'and the other request is told the row is already theirs');

/* ---- a duplicate answer points at the lead it is a duplicate of ---- */
$rows = [['id' => 9, 'phone' => '+92 322 4000768', 'email' => 'ayesha@example.com'], ['id' => 11, 'phone' => '0300 1234567', 'email' => '']];
ok(intake_first_id($rows, '0322 4000768', 'other@example.com') === 9, 'a differently formatted phone still finds the lead it duplicates');
ok(intake_first_id($rows, '', 'AYESHA@example.com ') === 9, 'and so does the same email typed differently');
ok(intake_first_id($rows, '0300 1234567', '') === 11, 'each identity finds its own lead');
ok(intake_first_id($rows, '0311 9999999', 'x@y.zz') === 9, 'and a submission that matches none still points at the earliest real lead rather than at nothing');
ok(intake_first_id([], '0322 4000768', '') === 0, 'except when there is no lead to point at');

/* ---- Turnstile: unreachable accepts and is recorded; a delivered "no" refuses ---- */
ok(intake_turnstile(false, null) === ['accept' => true, 'verdict' => 'unverified', 'detail' => 'Cloudflare was unreachable'],
    'an unreachable Cloudflare accepts the enquiry (the written decision in docs/INTAKE-RULES-P25.2.md)');
ok(intake_turnstile(true, ['success' => true])['verdict'] === 'ok', 'a delivered pass is recorded as ok');
$refused = intake_turnstile(true, ['success' => false, 'error-codes' => ['invalid-input-response']]);
ok($refused['accept'] === false && $refused['verdict'] === 'fail' && str_contains($refused['detail'], 'invalid-input-response'), 'a delivered "no" refuses, and says why');
ok(intake_turnstile(true, ['success' => false])['detail'] === 'the check was not successful', 'and a refusal with no code still says something a person can read');

/* ---- one reader for every sender's answer ---- */
ok(intake_channel_outcome(['email' => 'sent'])['ok'] === true, 'a sent email is a delivery');
ok(intake_channel_outcome(['email' => 'sent', 'whatsapp' => 'failed: no token'])['ok'] === false, 'and a channel that failed makes the delivery a failure');
ok(str_contains(intake_channel_outcome(['email' => 'failed: SMTP down'])['detail'], 'SMTP down'), 'with the reason kept');
ok(intake_channel_outcome(['skipped' => 'off'])['skipped'] === true, 'nothing to do is not a failure');
ok(intake_channel_outcome([])['skipped'] === true, 'and neither is an empty answer');
ok(intake_channel_outcome(['error' => 'boom'])['ok'] === false, 'a thrown sender is a failure with its message');

/* ---- the log a person reads: counters survive trimming ---- */
$log = [];
for ($i = 1; $i <= 5; $i++) {
    $log = intake_delivery_merge($log, ['at' => "2026-10-15 18:0$i:00", 'id' => $i, 'source' => 'contact', 'page' => '/contact/',
        'verdict' => $i === 2 ? 'duplicate' : ($i === 3 ? 'bot' : 'new'), 'turnstile' => $i === 4 ? 'unverified' : 'off',
        'channels' => $i === 1 ? ['alert' => ['ok' => false, 'detail' => 'failed: SMTP down'], 'reply' => ['ok' => true, 'detail' => 'sent: whatsapp']] : []], 3, 2);
}
ok(count($log['recent']) === 3, 'the recent list is trimmed to what a screen shows');
ok($log['counts']['total'] === 5 && $log['counts']['duplicates'] === 1 && $log['counts']['bots'] === 1 && $log['counts']['unverified'] === 1,
    'but the counters are counts, never the length of a trimmed list');
ok($log['counts']['failed'] === 1 && count($log['fails']) === 1 && $log['fails'][0]['detail'] === 'failed: SMTP down',
    'a failed alert is kept with its channel and its reason');
ok($log['last']['alert']['ok'] === false && $log['last']['reply']['ok'] === true, 'and each channel keeps its last outcome');
ok($log['recent'][0]['id'] === 5 && $log['recent'][0]['verdict'] === 'new', 'newest first');
ok($log['today']['date'] === '2026-10-15' && $log['today']['total'] === 5 && $log['today']['duplicates'] === 1 && $log['today']['bots'] === 1, 'with a per-day count beside them');
$log2 = intake_delivery_merge($log, ['at' => '2026-10-16 09:00:00', 'id' => 6, 'verdict' => 'new', 'channels' => []], 3, 2);
ok($log2['today']['date'] === '2026-10-16' && $log2['today']['total'] === 1, 'the day rolls over without touching the running totals');
ok($log2['counts']['total'] === 6, 'which keep counting');

/* ---- writer and reader agree on the file's shape (the console reads what forms.php wrote) ---- */
$round = sys_get_temp_dir() . '/wx-intake-' . getmypid() . '.json';
file_put_contents($round, json_encode($log2, JSON_UNESCAPED_UNICODE));
define('WX_INTAKE_LOG_FILE', $round);
$read = wx_intake_log();
ok($read['counts']['total'] === 6 && $read['recent'][0]['id'] === 6, 'the console\'s reader sees the same log the website writes');
ok($read['empty'] === false, 'and knows it is not looking at an empty one');
ok($read['today']['date'] === '2026-10-16', 'with today\'s date beside today\'s numbers');
@unlink($round);
ok(wx_intake_log()['counts']['total'] === 0 && wx_intake_log()['empty'] === true, 'a site that has recorded nothing yet reports an empty log, not an error');

/* ============================================================== report */
echo "\n";
if ($failures) {
    echo "  Failures:\n";
    foreach ($failures as $f) {
        echo "    ✗ " . $f . "\n";
    }
}
echo "  " . $passed . " passed · " . $failed . " failed" . ($skipped ? " · " . $skipped . " skipped" : "") . "\n\n";

exit($failed ? 1 : 0);
