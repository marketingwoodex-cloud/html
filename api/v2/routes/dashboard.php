<?php
/**
 * api/v2/routes/dashboard.php — the overview the prototype already draws, now fed by real queries.
 *
 * The prototype's dashboard is the contract: pipeline value by stage, new enquiries, quotes out,
 * money outstanding, and the "needs attention" list. Each number here is one aggregate query, not a
 * loop — the v2.1 dashboard recomputed several of these in JavaScript from a full table load.
 */

declare(strict_types=1);

function wx_route_dashboard(array $ctx): array
{
    wx_require_user('dashboard');

    $leadsByStage = [];
    foreach (wx_all('SELECT stage, COUNT(*) AS n, COALESCE(SUM(value),0) AS v FROM wx_leads GROUP BY stage') as $r) {
        $leadsByStage[(string) $r['stage']] = ['count' => (int) $r['n'], 'value' => (int) $r['v']];
    }
    $openStages = ['new', 'contacted', 'visit', 'quote', 'hold'];
    $openValue = 0;
    foreach ($openStages as $s) {
        $openValue += (int) ($leadsByStage[$s]['value'] ?? 0);
    }

    $quotes = ['total' => 0, 'open' => 0, 'value' => 0];
    if (wx_table_exists('wx_quotes')) {
        $quotes['total'] = wx_count('SELECT COUNT(*) FROM wx_quotes');
        $quotes['open'] = wx_count("SELECT COUNT(*) FROM wx_quotes WHERE status IN ('draft','sent','viewed')");
        // Documents are still LONGTEXT JSON until migration 003 adds real columns; until then a
        // count is honest and a sum would not be. The prototype labels this "projected".
        $quotes['value'] = 0;
    }

    $chats = ['open' => 0, 'unread' => 0, 'needs' => 0];
    if (wx_table_exists('wx_chats')) {
        $chats['open'] = wx_count("SELECT COUNT(*) FROM wx_chats WHERE status = 'open'");
        $chats['unread'] = wx_count('SELECT COALESCE(SUM(unread),0) FROM wx_chats');
        $chats['needs'] = wx_count('SELECT COUNT(*) FROM wx_chats WHERE needs = 1');
    }

    $bookings = ['pending' => 0, 'today' => 0];
    if (wx_table_exists('wx_bookings')) {
        $bookings['pending'] = wx_count("SELECT COUNT(*) FROM wx_bookings WHERE status = 'pending'");
        $bookings['today'] = wx_count('SELECT COUNT(*) FROM wx_bookings WHERE d = ?', [date('Y-m-d')]);
    }

    /* Needs attention — thresholds from wx_settings when migration 005 has seeded them, with the
       prototype's defaults otherwise. The rule engine is tunable, which is the point: an operator
       changes a number, not a deploy. */
    $rules = wx_attention_rules();
    $attention = [];
    $staleDays = (int) $rules['stale_lead_days'];
    $stale = wx_all(
        'SELECT id, name, phone, stage, last_contact, created_at FROM wx_leads
         WHERE stage NOT IN (?, ?) AND COALESCE(last_contact, created_at) < ?
         ORDER BY COALESCE(last_contact, created_at) ASC LIMIT 8',
        ['won', 'lost', date('Y-m-d H:i:s', time() - $staleDays * 86400)]
    );
    foreach ($stale as $r) {
        $attention[] = [
            'kind' => 'stale_lead',
            'id' => (int) $r['id'],
            'title' => (string) $r['name'],
            'detail' => 'No contact since ' . substr((string) ($r['last_contact'] ?: $r['created_at']), 0, 10),
            'stage' => (string) $r['stage'],
        ];
    }
    $unread = wx_count('SELECT COUNT(*) FROM wx_leads WHERE is_read = 0');
    if ($unread > 0) {
        $attention[] = ['kind' => 'unread_leads', 'id' => null, 'title' => $unread . ' new enquiries', 'detail' => 'Not opened yet'];
    }
    if ($chats['needs'] > 0) {
        $attention[] = ['kind' => 'chat_help', 'id' => null, 'title' => $chats['needs'] . ' chat(s) need a person', 'detail' => 'The assistant could not answer'];
    }

    /* Two more rules, both answered by the database rather than by loading every document.
       · An open quotation whose validity date is within `quote_expiry_days` (or has already passed) needs a
         decision: sent, or sent and viewed, and not yet answered.
       · An invoice with a balance that is at least `unpaid_days` past its due date. The candidates are picked
         by the indexed due date; the balance is worked out exactly as the invoice tracker works it out, from the
         receipts that have not been reversed, so the two screens cannot disagree about who owes what. */
    $quoteCut = date('Y-m-d', time() + $rules['quote_expiry_days'] * 86400);
    if (wx_table_exists('wx_quotes')) {
        $expiring = wx_all(
            'SELECT id, ' . wx_doc_payload_sql('wx_quotes') . " FROM wx_quotes
             WHERE status IN ('sent','viewed') AND valid_until IS NOT NULL AND valid_until <> '' AND valid_until <= ?
             ORDER BY valid_until ASC LIMIT 8",
            [$quoteCut]
        );
        foreach ($expiring as $r) {
            $q = json_decode((string) $r['payload'], true);
            if (!is_array($q)) {
                continue;
            }
            $days = wx_days_from_today((string) $q['valid_until']);
            $attention[] = [
                'kind' => 'quote_expiring',
                'id' => (int) $r['id'],
                'title' => (string) ($q['no'] ?? 'Quotation') . ' · ' . (string) ($q['client']['name'] ?? 'no client'),
                'detail' => $days < 0
                    ? 'Valid until ' . (string) $q['valid_until'] . ' — expired ' . (-$days) . ' day(s) ago'
                    : 'Valid until ' . (string) $q['valid_until'] . ' — ' . ($days === 0 ? 'expires today' : 'expires in ' . $days . ' day(s)'),
                'stage' => (string) ($q['status'] ?? ''),
            ];
        }
    }

    if (wx_table_exists('wx_invoices')) {
        $invoiceCut = date('Y-m-d', time() - $rules['unpaid_days'] * 86400);
        $pastDue = wx_all(
            'SELECT id, ' . wx_doc_payload_sql('wx_invoices') . ' FROM wx_invoices
             WHERE due_at IS NOT NULL AND due_at <> \'\' AND due_at <= ? ORDER BY due_at ASC LIMIT 50',
            [$invoiceCut]
        );
        $overdue = 0;
        foreach ($pastDue as $r) {
            $inv = json_decode((string) $r['payload'], true);
            if (!is_array($inv)) {
                continue;
            }
            $id = (int) $r['id'];
            /* The JSON payments are only read for an invoice with no receipt rows at all. If every receipt was
               reversed, the rows exist and the reversed amounts must not come back from the old JSON copy. */
            $payments = wx_invoice_payments($id);
            if ($payments === [] && (int) wx_val('SELECT COUNT(*) FROM wx_invoice_payments WHERE invoice_id = ?', [$id]) === 0) {
                $payments = wx_invoice_payments_legacy($inv);
            }
            $public = wx_inv_public($inv + ['id' => $id], $payments);
            $balance = (int) $public['balance'];
            if ($balance <= 0) {
                continue;
            }
            $overdue++;
            if (count(array_filter($attention, static fn($a) => $a['kind'] === 'invoice_overdue')) >= 8) {
                continue;
            }
            $late = -wx_days_from_today((string) $inv['due_date']);
            $attention[] = [
                'kind' => 'invoice_overdue',
                'id' => $id,
                'title' => (string) ($inv['no'] ?? 'Invoice') . ' · ' . (string) ($inv['client']['name'] ?? 'no client'),
                'detail' => 'PKR ' . wx_pkr_out($balance) . ' unpaid, ' . $late . ' day(s) past the due date ' . (string) $inv['due_date'],
                'stage' => 'overdue',
            ];
        }
    }

    return [
        'data' => [
            'leads' => ['byStage' => $leadsByStage, 'open' => array_sum(array_column(array_intersect_key($leadsByStage, array_flip($openStages)), 'count')), 'openValue' => $openValue, 'unread' => $unread],
            'quotes' => $quotes,
            'chats' => $chats,
            'bookings' => $bookings,
            'attention' => $attention,
            'rules' => $rules,
        ],
    ];
}

/** Whole days from today to `$date`: 0 is today, a positive number is in the future, a negative one is past. */
function wx_days_from_today(string $date): int
{
    $today = new DateTimeImmutable(date('Y-m-d'));
    return (int) $today->diff(new DateTimeImmutable($date))->format('%r%a');
}

/**
 * Thresholds live in wx_settings so the dashboard is tunable without a deploy.
 *
 * The keys are the ones migration 005 seeds (`attention.*`, with v2.1's values). The screen names the rules
 * differently, so the mapping is here, once: the response keeps the screen's names, the database keeps the
 * settings' names. The fallbacks are the same seeded values, because a host that has not run the seed must
 * decide exactly what a migrated host decides.
 */
const WX_ATTENTION_RULES = [
    'stale_lead_days' => ['key' => 'attention.lead_stale_days', 'default' => 3],
    'quote_expiry_days' => ['key' => 'attention.quote_expiring_days', 'default' => 2],
    'unpaid_days' => ['key' => 'attention.invoice_overdue_days', 'default' => 1],
];

function wx_attention_rules(): array
{
    static $rules = null;
    if ($rules !== null) {
        return $rules;
    }
    $rules = [];
    foreach (WX_ATTENTION_RULES as $name => $spec) {
        $rules[$name] = $spec['default'];
    }
    try {
        if (wx_table_exists('wx_settings')) {
            $stored = [];
            foreach (wx_all("SELECT k, v FROM wx_settings WHERE k LIKE 'attention.%'") as $r) {
                $stored[(string) $r['k']] = (string) $r['v'];
            }
            foreach (WX_ATTENTION_RULES as $name => $spec) {
                if (isset($stored[$spec['key']]) && is_numeric($stored[$spec['key']])) {
                    $rules[$name] = (int) $stored[$spec['key']];
                }
            }
        }
    } catch (Throwable $e) {
        // Settings are an enhancement: the seeded defaults are always a valid answer.
    }
    return $rules;
}

function wx_route_activity(array $ctx): array
{
    $u = wx_require_user('activity');
    $page = wx_activity_page([
        'user_id' => $ctx['query']['user_id'] ?? null,
        'action' => $ctx['query']['action'] ?? null,
        'since' => $ctx['query']['since'] ?? null,
    ], wx_limit($ctx['query']['limit'] ?? 50, 50, 200), wx_offset($ctx['query']['offset'] ?? 0));
    return ['data' => $page];
}
