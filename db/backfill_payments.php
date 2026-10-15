<?php
/**
 * db/backfill_payments.php — copy receipts out of the invoice JSON and into wx_invoice_payments.
 *
 * Migration 006 creates the table; this moves the data. It is separate from the DDL on purpose: a
 * schema change that also rewrites business records cannot be reviewed as either one thing or the
 * other, and it cannot be re-run safely. This script can.
 *
 * What it does, per invoice:
 *   · reads `payments[]` from the payload (v2.1 wrote them as {id, rcpt, date, amount, method, ref…});
 *   · skips any receipt whose `rcpt` already exists, so running it twice changes nothing;
 *   · leaves the JSON array in place — nothing is deleted. Phase 5 removes the duplicate once the
 *     v2.1 admin no longer reads it.
 *
 * Money: amounts are whole rupees in both places, so nothing is converted. If a legacy amount is
 * fractional it is rounded, and the row is reported so a human can check it.
 *
 *   php db/backfill_payments.php --dry-run     show what would be copied, change nothing
 *   php db/backfill_payments.php               copy
 *   php db/backfill_payments.php --verify      report any invoice where the two totals disagree
 */

declare(strict_types=1);

if (!in_array(PHP_SAPI, ['cli', 'phpdbg', 'wasm'], true)) {
    http_response_code(403);
    echo "db/backfill_payments.php runs from the command line only.\n";
    exit;
}

require_once dirname(__DIR__) . '/api/v2/lib/bootstrap.php';

$dry = in_array('--dry-run', $argv, true);
$verify = in_array('--verify', $argv, true);

function say(string $m): void { echo $m . "\n"; }

try {
    if (!wx_table_exists('wx_invoices')) {
        say('No wx_invoices table — nothing to do.');
        exit(0);
    }
    if (!wx_table_exists('wx_invoice_payments')) {
        say('✗ wx_invoice_payments is missing. Run: php db/migrate.php');
        exit(1);
    }

    /* The document column is `data` on the v2.1 schema production runs and `payload` after a conversion;
       naming one made this script fail on the live database it exists for. */
    $invoices = wx_all('SELECT id, no, ' . wx_payload_column('wx_invoices') . ' AS payload FROM wx_invoices');
    $copied = 0;
    $skipped = 0;
    $rounded = [];
    $mismatched = [];

    foreach ($invoices as $row) {
        $id = (int) $row['id'];
        $no = (string) $row['no'];
        $payload = json_decode((string) $row['payload'], true);
        if (!is_array($payload)) {
            continue;
        }
        $legacy = is_array($payload['payments'] ?? null) ? $payload['payments'] : [];
        if (!$legacy) {
            continue;
        }

        $existing = [];
        foreach (wx_all('SELECT rcpt FROM wx_invoice_payments WHERE invoice_id = ?', [$id]) as $r) {
            $existing[(string) $r['rcpt']] = true;
        }

        foreach ($legacy as $p) {
            if (!is_array($p)) {
                continue;
            }
            $rcpt = trim((string) ($p['rcpt'] ?? ''));
            if ($rcpt === '') {
                // A receipt without a number cannot be reconciled; give it one that is obviously derived.
                $rcpt = $no . '-R' . (count($existing) + 1) . 'F';
            }
            if (isset($existing[$rcpt])) {
                $skipped++;
                continue;
            }
            $raw = $p['amount'] ?? 0;
            $amount = (int) round((float) $raw);
            if (abs((float) $raw - $amount) > 0.001) {
                $rounded[] = $rcpt . ' (' . $raw . ' → ' . $amount . ')';
            }
            $row_ = [
                'invoice_id' => $id,
                'no' => $no,
                'rcpt' => $rcpt,
                'paid_on' => preg_match('~^\d{4}-\d{2}-\d{2}$~', (string) ($p['date'] ?? '')) ? (string) $p['date'] : date('Y-m-d'),
                'amount' => $amount,
                'method' => in_array($p['method'] ?? '', WX_PAY_METHODS, true) ? (string) $p['method'] : 'bank',
                'ref' => substr((string) ($p['ref'] ?? ''), 0, 80),
                'note' => substr((string) ($p['note'] ?? ''), 0, 300),
                'created_by' => substr((string) ($p['by'] ?? ''), 0, 120),
                'created_by_id' => null,
                'created_at' => substr((string) ($p['t'] ?? ''), 0, 19) ?: wx_now(),
            ];
            if ($dry) {
                say('  would copy  ' . $rcpt . '  ' . wx_pkr_out($amount) . '  ' . $row_['paid_on'] . '  (' . $row_['method'] . ')');
            } else {
                wx_insert('wx_invoice_payments', $row_);
            }
            $existing[$rcpt] = true;
            $copied++;
        }

        if ($verify) {
            $jsonPaid = 0;
            foreach ($legacy as $p) {
                $jsonPaid += (int) round((float) ($p['amount'] ?? 0));
            }
            $tablePaid = (int) wx_val('SELECT COALESCE(SUM(amount),0) FROM wx_invoice_payments WHERE invoice_id = ?', [$id]);
            if ($jsonPaid !== $tablePaid) {
                $mismatched[] = $no . ': JSON ' . wx_pkr_out($jsonPaid) . ' vs table ' . wx_pkr_out($tablePaid);
            }
        }
    }

    say('');
    say(($dry ? 'DRY RUN — ' : '') . 'Payments: ' . $copied . ' copied, ' . $skipped . ' already present.');
    if ($rounded) {
        say('  rounded to whole rupees (' . count($rounded) . '): ' . implode(', ', array_slice($rounded, 0, 10)));
    }
    if ($verify) {
        if ($mismatched) {
            say('✗ ' . count($mismatched) . ' invoice(s) disagree between JSON and table:');
            foreach (array_slice($mismatched, 0, 20) as $m) {
                say('    ' . $m);
            }
            exit(1);
        }
        say('✓ Every invoice agrees between the JSON payload and wx_invoice_payments.');
    }
    if ($dry) {
        say('  Nothing was written. Run without --dry-run to copy.');
    }
} catch (ApiError $e) {
    fwrite(defined('STDERR') ? STDERR : fopen('php://stderr', 'w'), '✗ ' . $e->code . ': ' . $e->getMessage() . "\n");
    exit(1);
} catch (Throwable $e) {
    fwrite(defined('STDERR') ? STDERR : fopen('php://stderr', 'w'), '✗ ' . get_class($e) . ': ' . $e->getMessage() . "\n");
    exit(1);
}
