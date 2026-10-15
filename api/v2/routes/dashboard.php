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

/** Thresholds live in wx_settings so the dashboard is tunable without a deploy. */
function wx_attention_rules(): array
{
    $defaults = ['stale_lead_days' => 7, 'quote_expiry_days' => 14, 'unpaid_days' => 30];
    static $rules = null;
    if ($rules !== null) {
        return $rules;
    }
    $rules = $defaults;
    try {
        if (wx_table_exists('wx_settings')) {
            $rows = wx_all("SELECT k, v FROM wx_settings WHERE k LIKE 'attention.%'");
            foreach ($rows as $r) {
                $key = substr((string) $r['k'], strlen('attention.'));
                if (array_key_exists($key, $defaults)) {
                    $rules[$key] = (int) $r['v'];
                }
            }
        }
    } catch (Throwable $e) {
        // Settings are an enhancement: the defaults are always a valid answer.
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
