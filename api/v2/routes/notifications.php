<?php
/**
 * api/v2/routes/notifications.php — the bell, and what the client is told.
 *
 * Two things live here because they are the same subject seen from two sides:
 *
 *   · **`GET /notifications/poll`** — v2.1's `notif_poll`: one feed for the person using the product.
 *     Unread enquiries, conversations waiting for an answer, visits to confirm, payments taken in the
 *     last two days, overdue invoices, and the approval queue. Everything else in v2.5 is a screen you
 *     go to; this is the one that tells you something happened while you were somewhere else.
 *
 *   · **`/notifications`** — v2.1's `notify_*`: the settings screen for what the *client* is told
 *     (templates, switches, the send log) and the two ways to send one by hand (a test, and a progress
 *     update for a project). The sending itself is in lib/notify.php, including the honest result
 *     strings: `queued`, `not configured`, `skipped`, `off`.
 *
 * The bell is per-capability rather than per-role. v2.1 asked "is this person in $SALES?" and showed
 * everyone else zeros. v2.5 asks the capability matrix what each *kind* of item needs, so support sees
 * the conversations waiting and nothing else, and a salesperson with the invoice capability sees the
 * money — the same question, answered per item instead of per person.
 */

declare(strict_types=1);

/**
 * GET /notifications/poll — what needs this person's attention.
 *
 * `stamp` is the change-detector: the client holds it and asks again; if it is unchanged, nothing is
 * new. v2.1 built it from the highest ids in the tables it watched, which is cheap and monotonic —
 * a new row always moves it, an edit never has to.
 */
function wx_route_notif_poll(array $ctx): array
{
    $u = wx_require_user('notif_poll');
    $items = [];
    $leads = 0;
    $chats = 0;
    $stamp = [];

    if (wx_can($u, 'leads_list')) {
        $leads = (int) wx_val('SELECT COUNT(*) FROM wx_leads WHERE is_read = 0');
        foreach (wx_all('SELECT id, name, source, service, created_at FROM wx_leads WHERE is_read = 0 ORDER BY id DESC LIMIT 8') as $r) {
            $items[] = [
                'kind' => 'lead',
                'id' => (int) $r['id'],
                't' => (string) $r['created_at'],
                'title' => 'New enquiry · ' . (string) $r['name'],
                'text' => trim((string) $r['source'] . ((string) $r['service'] !== '' ? ' · ' . (string) $r['service'] : ''), ' ·'),
                'path' => '/leads/' . (int) $r['id'],
                'href' => '#/leads',
            ];
        }
        $stamp[] = (int) wx_val('SELECT COALESCE(MAX(id), 0) FROM wx_leads');
    }

    if (wx_can($u, 'chat_list')) {
        $chats = (int) wx_val('SELECT COUNT(*) FROM wx_chats WHERE status = ? AND (unread > 0 OR needs = 1)', ['open']);
        foreach (wx_all('SELECT id, name, page, updated_at, unread, needs FROM wx_chats WHERE status = ? AND (unread > 0 OR needs = 1) ORDER BY updated_at DESC LIMIT 8', ['open']) as $r) {
            $who = trim((string) $r['name']) !== '' ? (string) $r['name'] : 'Visitor #' . (int) $r['id'];
            $items[] = [
                'kind' => 'chat',
                'id' => (int) $r['id'],
                't' => (string) $r['updated_at'],
                'title' => (int) $r['needs'] === 1 ? 'Needs a person · ' . $who : 'Live chat · ' . $who,
                'text' => (string) $r['page'],
                'path' => '/chats/' . (int) $r['id'],
                'href' => '#/chat/' . (int) $r['id'],
            ];
        }
        $stamp[] = (int) wx_val("SELECT COALESCE(MAX(id), 0) FROM wx_chat_msgs WHERE who = 'visitor'");
    }

    if (wx_can($u, 'bk_list')) {
        foreach (wx_all("SELECT id, name, d, tm, type, created_at FROM wx_bookings WHERE status = 'pending' AND d >= ? ORDER BY d, tm LIMIT 5", [substr(wx_now(), 0, 10)]) as $r) {
            $items[] = [
                'kind' => 'booking',
                'id' => (int) $r['id'],
                't' => (string) $r['created_at'],
                'title' => 'Visit to confirm · ' . (string) $r['name'],
                'text' => (string) $r['d'] . ' · ' . substr((string) $r['tm'], 0, 5),
                'path' => '/bookings',
                'href' => '#/bookings',
            ];
        }
        $stamp[] = (int) wx_val('SELECT COALESCE(MAX(id), 0) FROM wx_bookings');
    }

    if (wx_can($u, 'invs_tracker')) {
        /* Payments in the last two days, and the overdue list as one line: the point of the bell is that
           it fits in a dropdown, and thirty overdue invoices read better as a count than as thirty rows.
           v2.1 built this by loading every invoice into PHP; here the rows come from the payments table
           the receipts were migrated into. */
        $rows = wx_all(
            'SELECT p.id, p.amount, p.t, i.no, i.' . wx_payload_column('wx_invoices') . ' AS payload, i.id AS invoice_id
               FROM wx_invoice_payments p JOIN wx_invoices i ON i.id = p.invoice_id
              WHERE p.reversed_at IS NULL AND p.t >= ? ORDER BY p.t DESC LIMIT 8',
            [gmdate('Y-m-d H:i:s', time() - 172800)]
        );
        foreach ($rows as $r) {
            $inv = json_decode((string) $r['payload'], true);
            $name = is_array($inv) ? (string) ($inv['client']['name'] ?? '') : '';
            $items[] = [
                'kind' => 'payment',
                'id' => (int) $r['id'],
                't' => (string) $r['t'],
                'title' => 'Payment received · Rs ' . number_format((int) $r['amount']),
                'text' => trim((string) $r['no'] . ($name !== '' ? ' · ' . $name : ''), ' ·'),
                'path' => '/invoices/' . (int) $r['invoice_id'],
                'href' => '#/invoice/' . (int) $r['invoice_id'],
            ];
        }
        /* Overdue counted from the indexed columns (migration 003 maintains `due_at`, `total` and
           `paid`), not by loading every invoice and deriving the balance in PHP — v2.1's version of this
           read all invoices on every poll. `paid` is the sum of live receipts; a reversed payment takes
           itself back out because the invoice row is rewritten when a receipt is reversed. */
        $overdue = (int) wx_val(
            'SELECT COUNT(*) FROM wx_invoices WHERE due_at IS NOT NULL AND due_at < ? AND total > paid',
            [substr(wx_now(), 0, 10)]
        );
        if ($overdue > 0) {
            $items[] = [
                'kind' => 'overdue',
                'id' => 0,
                't' => wx_now(),
                'title' => $overdue . ' overdue invoice' . ($overdue > 1 ? 's' : ''),
                'text' => 'Tap to see who is late',
                'path' => '/invoices?bucket=overdue',
                'href' => '#/invoices',
            ];
        }
        $stamp[] = (int) wx_val('SELECT COALESCE(MAX(id), 0) FROM wx_invoice_payments');
    }

    /* The approval queue belongs in the bell for one person: the Master. Everyone else cannot act on it,
       and a count they cannot clear is noise. */
    $approvals = 0;
    if (wx_can($u, 'appr_list')) {
        $approvals = wx_appr_pending_count();
        if ($approvals > 0) {
            $items[] = [
                'kind' => 'approval',
                'id' => 0,
                't' => wx_now(),
                'title' => $approvals . ' change' . ($approvals > 1 ? 's' : '') . ' waiting for you',
                'text' => 'Review and approve',
                'path' => '/approvals',
                'href' => '#/approvals',
            ];
        }
    }

    usort($items, static fn(array $a, array $b): int => strcmp((string) $b['t'], (string) $a['t']));

    return ['data' => [
        'leads' => $leads,
        'chats' => $chats,
        'approvals' => $approvals,
        'total' => $leads + $chats + $approvals,
        'items' => array_slice($items, 0, 20),
        'stamp' => implode('.', array_map('strval', $stamp)),
    ]];
}

/** GET /notifications — the settings screen: what is on, what it says, and the last sixty attempts. */
function wx_route_notify_get(array $ctx): array
{
    wx_require_user('notify_get', ['owner', 'admin']);
    return ['data' => [
        'cfg' => wx_notify_cfg(),
        'events' => WX_NOTIFY_EVENTS,
        'ready' => wx_notify_ready(),
        'transport' => wx_notify_transport_info(),
        'log' => wx_all('SELECT * FROM wx_notify_log ORDER BY id DESC LIMIT 60'),
    ]];
}

/**
 * POST /notifications/settings — save the switches and the wording. Nothing is sent by saving.
 *
 * Gated: rewriting what the company says to its clients is exactly the kind of change that waits for the
 * Master when a Manager makes it — v2.1's approval policy matched `save`, and the Master's own edit runs
 * straight through.
 */
function wx_route_notify_save(array $ctx): array
{
    return wx_appr_route('notify_save', $ctx, 'notifications', 'wx_route_notify_save_do', static fn() => wx_route_notify_save_do($ctx));
}

function wx_route_notify_save_do(array $ctx): array
{
    $u = wx_require_user('notify_save', ['owner', 'admin']);
    $in = is_array($ctx['body']['cfg'] ?? null) ? $ctx['body']['cfg'] : [];
    $cfg = wx_notify_cfg();
    foreach (['email', 'wa'] as $k) {
        if (array_key_exists($k, $in)) {
            $cfg[$k] = !empty($in[$k]);
        }
    }
    if (isset($in['waLang'])) {
        $cfg['waLang'] = wx_v_enum((string) $in['waLang'], ['en', 'ur'], 'cfg.waLang');
    }
    foreach (array_keys(WX_NOTIFY_EVENTS) as $e) {
        if (!isset($in['ev'][$e]) || !is_array($in['ev'][$e])) {
            continue;
        }
        $x = $in['ev'][$e];
        if (array_key_exists('on', $x)) {
            $cfg['ev'][$e]['on'] = !empty($x['on']);
        }
        if (isset($x['subject'])) {
            $cfg['ev'][$e]['subject'] = mb_substr(trim((string) $x['subject']), 0, 200);
        }
        /* An empty body means "back to the wording we ship", not "send nothing" — a template with no
           text is a message nobody can read, and the alternative to restoring the default is a client
           receiving an empty WhatsApp. */
        if (isset($x['text'])) {
            $text = mb_substr(trim((string) $x['text']), 0, 3000);
            $cfg['ev'][$e]['text'] = $text !== '' ? $text : wx_notify_defaults()['ev'][$e]['text'];
        }
    }
    wx_setting_set(WX_NOTIFY_SETTING, json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    wx_audit($u, 'notify.settings', 'settings', ['events' => array_keys(array_filter(
        array_map(static fn(array $e): bool => !empty($e['on']), $cfg['ev'])
    ))]);
    return ['data' => ['cfg' => $cfg]];
}

/** POST /notifications/test — send one event to yourself. The result is shown exactly as it happened. */
function wx_route_notify_test(array $ctx): array
{
    $u = wx_require_user('notify_test', ['owner', 'admin']);
    $event = wx_v_enum((string) ($ctx['body']['event'] ?? ''), array_keys(WX_NOTIFY_EVENTS), 'event');
    $phone = trim((string) ($ctx['body']['phone'] ?? ''));
    $email = trim((string) ($ctx['body']['email'] ?? ''));
    if ($phone === '' && $email === '') {
        throw ApiError::validation('Enter a phone number or an email address to receive the test', 'phone');
    }
    $host = (string) preg_replace('~[^a-z0-9.\-:]~i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'woodex.com.pk'));
    $result = wx_notify_send($event, [
        'name' => (string) $u['name'],
        'phone' => $phone,
        'email' => $email,
        'ref' => 'WI-10000',
        'project' => 'Test project',
        'link' => 'https://' . $host . '/',
    ], true);
    wx_audit($u, 'notify.test', 'event:' . $event, $result);
    return ['data' => ['result' => $result]];
}

/**
 * POST /notifications/project/{id} — a progress update, now, with chosen site photos.
 *
 * Forced: the project's own automatic rules may already have sent this stage's update, and the point of
 * this button is that a person wants to say something now. It is written into the project's history, so
 * the client's inbox and the project's timeline agree about what was sent.
 */
function wx_route_notify_proj_send(array $ctx): array
{
    return wx_appr_route('notify_proj_send', $ctx, 'notifications', 'wx_route_notify_proj_send_do', static fn() => wx_route_notify_proj_send_do($ctx));
}

function wx_route_notify_proj_send_do(array $ctx): array
{
    $u = wx_require_user('notify_proj_send');
    $id = (int) $ctx['params']['id'];

    return wx_guard('notify.project', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $p = wx_doc_get_row('wx_projects', $id, true);
            if ($p === null) {
                throw ApiError::notFound('That project does not exist');
            }
            $urls = [];
            foreach (array_slice((array) ($ctx['body']['photos'] ?? []), 0, 12) as $url) {
                if (preg_match('~^/assets/uploads/projects/[a-z0-9._-]+$~i', (string) $url)) {
                    $urls[] = (string) $url;
                }
            }
            $note = wx_v_opt_string($ctx['body']['note'] ?? null, 'note', 1000) ?? '';
            /* The same call the project screen's update box makes. The only difference between the two
               screens is which photos the person picked and whether they typed anything. */
            $posted = wx_proj_update_post($p, (string) $u['name'], $note, $urls, true);
            $p = $posted['project'];
            $result = $posted['result'];
            wx_doc_put('wx_projects', $p);
            wx_audit($u, 'notify.project', 'project:' . $id, ['photos' => count($posted['photos']), 'result' => $result]);
            return ['data' => ['result' => $result, 'project' => $p]];
        });
    });
}
