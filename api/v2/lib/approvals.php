<?php
/**
 * api/v2/lib/approvals.php — "a Manager's change waits for the Master".
 *
 * The rule this product has always had: the Master (role `owner`) acts directly; a Manager (role
 * `admin`) proposes, and their change is written down and replayed once the Master approves. The
 * developers' own switch decides whether an Editor's changes are held the same way.
 *
 * What changed in v2.5 is only where the queue lives. v2.1 appended to `_private/approvals.json`,
 * which meant the queue could not be searched, could be truncated by a half-written file, and had no
 * notion of who decided what — on the one screen whose entire job is accountability. It is
 * `wx_approvals` now, and the same request is replayed through the same handler that would have run
 * had the Master made the change.
 *
 * The policy constants below are copied from v2.1 **verbatim**. They are ugly, and rewriting them
 * would be the easiest way to quietly change which changes need approval. A change to a policy that a
 * person relies on is a product decision; it is not made here.
 */

declare(strict_types=1);

/** 3 MB, as APPR_MAX_PAYLOAD. Beyond this the summary is not a request but a document. */
const WX_APPR_MAX_PAYLOAD = 3000000;

/** Actions that are never held: your own account, chat, uploads, reads and the approval screen itself. */
const WX_APPR_SKIP = '~^(me|me_[a-z_]+|profile|password|login[a-z_0-9]*|logout|ping|poll|notif_poll|typing|status|setup|sec_[a-z0-9_]+|google_(me|link|unlink|login)|pw_[a-z_]+|chat_[a-z_]+|soc_comment_[a-z]+|soc_comments_sync|soc_ai_[a-z]+|lead_note|add_lead_note|media_upload|fm_upload|upload|import_url|fetch_page|appr_[a-z_]+|[a-z0-9_]*_test|ai_test|health_(scan|psi|speed)|seo_ai|ai_run|outline|improve|excerpt|meta|text|button|alt|fix|article|city|location|faqs|interactive|initialize|load)$~';

/** Actions whose name says they change something. */
const WX_APPR_WRITE = '~(save|submit|delete|send|_new|restore|import|import2|merge|convert|_status|toggle|clear|purge|move|rename|trash|replace|reorder|connect|disconnect|_add|update|_action|mkdir|_zip|bill|photo|regen|revoke|_set|close|copy|invoice|link|sync|folder|_run|tick|optout|camp_action|delete)$~';

/** Ones the name does not catch. */
const WX_APPR_EXTRA_WRITE = ['global_menu', 'global_chrome', 'media_alt', 'proj_meta', 'proj_milestones', 'dbx_row'];
const WX_APPR_READS = ['crm_wa_status', 'gdata_status'];

/**
 * v2.5's own decisions about what never waits for the Master — with the reason, in the entry.
 *
 * The lists above are v2.1's and are asserted byte-for-byte; this one is where a *new* route records that it
 * deliberately does not queue, so the decision is visible in the policy instead of being an accident of a
 * verb not matching a regex. Every entry carries a reason, because the entry is the only thing standing
 * between a route and silently skipping the queue — and `tests/conformance.mjs` checks both directions:
 * every gated route's action either queues or appears here, and every entry here has its reason.
 */
const WX_APPR_NEVER = [
    /* A rollback restores a version that was itself written under this policy. It is an undo, not a change,
       and asking the Master first would leave a mistake live while somebody reads a queue. */
    'page_rollback' => 'a rollback is an undo of a change that already passed this policy',
    'theme_rollback' => 'the same undo, for the stylesheet: the version being restored already passed this policy',
    /* Publishing was never queued in v2.1: "published" is not one of the queued verbs, so an editor's job —
       write it, publish it — has never needed the Master. Named here so the next person reads a decision. */
    'cms_published' => 'publishing an article was never queued in v2.1 - "published" is not a queued verb',
    /* Regenerating an image's derivatives writes files the site derives; it changes no page, no text and no
       address. It is a repair, and the audit log records it. */
    'media_sizes' => 'derivatives are files the site derives - repairing them changes nothing anybody reads',
    /* A draft revision of a quotation is a copy: not the document a client is looking at. Publishing the
       revision is the change that matters, and that one is queued. */
    'create_quote_draft' => 'a draft revision is a copy of a document - publishing it is the change',
    /* Listing a provider's models fetches somebody else's list and stores nothing here. v2.1 ran it from
       the settings screen the moment a key was typed, which is exactly when it is useful — queueing it
       would ask the Master to approve reading a web page. */
    'cms_ai_models' => 'listing the models a provider offers reads a list and stores nothing here, as in v2.1',
    /* Rebuilding sitemap.xml writes a file the site derives from its pages. It takes a line out for a page
       somebody has already unpublished — a correction, not a change to approve — and v2.1 never queued it
       ("sitemap" is not a queued verb, and `seo_sitemap` ran from the SEO screen for anyone who could open it). */
    'conn_push' => 'the same function is the scheduled daily backup - a job cannot sit in a queue waiting for the Master',
    'seo_sitemap' => 'a sitemap is derived from the pages - rebuilding it corrects the file rather than changing the site',
];
const WX_APPR_BUILDER_WRITE = ['save', 'restore', 'theme', 'page_new', 'media_delete', 'blocks_save', 'blocks_delete', 'blocks_import', 'blocks_sync'];

/** The v2.1 defaults, used verbatim when the settings cannot be read. */
function wx_appr_cfg_defaults(): array
{
    return ['manager' => true, 'developer' => false, 'notify' => true, 'expire_days' => 14];
}

/**
 * The switches. Seeded to the v2.1 defaults by migration 006.
 *
 * If the settings cannot be read — the table is missing on a host that has not migrated, or the
 * database is down — the defaults apply, and the default is that a Manager's change **does** wait.
 * The failure mode of a policy lookup must never be "no approval needed"; that is the one mistake the
 * feature exists to prevent. (A truly unavailable database fails the write anyway; this only makes
 * sure it fails on the right side.)
 */
function wx_appr_cfg(): array
{
    try {
        return [
            'manager' => wx_setting_bool('approval.manager', true),
            'developer' => wx_setting_bool('approval.developer', false),
            'notify' => wx_setting_bool('approval.notify', true),
            'expire_days' => (int) (wx_setting('approval.expire_days', '14') ?? 14),
        ];
    } catch (Throwable $e) {
        return wx_appr_cfg_defaults();
    }
}

/**
 * Should this request wait for the Master?
 *
 * @param string $role   the actor's role
 * @param string $action the action name (v2.1's, or the v2.5 resource action)
 * @param string $src    'admin' | 'builder'
 */
function wx_appr_needed(string $role, string $action, string $src = 'admin'): bool
{
    if (!empty($GLOBALS['WX_APPR_REPLAY'])) {
        return false; // The Master's own replay is never re-queued — otherwise it loops forever.
    }
    $c = wx_appr_cfg();
    if (!(($role === 'admin' && $c['manager']) || ($role === 'editor' && $c['developer']))) {
        return false;
    }
    if ($src === 'builder') {
        return in_array($action, WX_APPR_BUILDER_WRITE, true);
    }
    if (isset(WX_APPR_NEVER[$action])) {
        return false;
    }
    if (preg_match(WX_APPR_SKIP, $action) || in_array($action, WX_APPR_READS, true)) {
        return false;
    }
    return in_array($action, WX_APPR_EXTRA_WRITE, true) || (bool) preg_match(WX_APPR_WRITE, $action);
}

/**
 * Readable names for the v2.5 actions whose raw name would read badly in a queue ("Invoice quote
 * invoice: WI-10123").
 *
 * v2.1 had no such map because every action was a screen name a person recognised. The resource
 * routes introduced here are new names, so they get new labels — and only these; anything not listed
 * still goes through the v2.1 fallback below, unchanged.
 */
const WX_APPR_LABELS = [
    'quote_invoice' => 'Invoice a quotation',
    'quote_delete' => 'Delete a quotation',
    'invoice_delete' => 'Delete an invoice',
    'pay_add' => 'Record a payment',
    'pay_delete' => 'Reverse a payment',
    'invoice_save' => 'Change an invoice',
    'quote_save' => 'Change a quotation',
    'quote_status' => 'Change a quotation\'s status',
    'tpl_save' => 'Save a quotation template',
    'tpl_delete' => 'Delete a quotation template',
    'tpl_import' => 'Import quotation templates',
    'cms_biz_save' => 'Change the business details on the website',
    'company_save' => 'Change the company details on documents',
    'cms_announce_save' => 'Change the announcement bar on every page',
    /* A v2.1 name, listed here for the same reason as the v2.5 ones: the raw name says nothing about the
       consequence. Taking a page out of the sitemap and telling Google not to index it is a change the
       Master should read in a sentence before agreeing to it. */
    'page_meta_save' => 'Publish or hide a page',
    'cms_ai_save' => 'Change the AI settings (keys, models, writing voice)',
];

/**
 * The line the Master reads at a glance: what is being asked, in words.
 *
 * Ported from v2.1's appr_summary() including its fallbacks — a summary that reads "Change page: Home"
 * is what people have been approving, and it stays recognisable.
 */
function wx_appr_summary(string $src, string $action, array $in): string
{
    $t = static function ($k) use ($in) {
        $v = $in[$k] ?? '';
        return is_scalar($v) ? trim(mb_substr((string) $v, 0, 80)) : '';
    };
    $what = $t('title') ?: $t('name') ?: $t('path') ?: $t('email') ?: $t('client') ?: $t('label') ?: ($t('id') !== '' ? '#' . $t('id') : '');
    if ($t('no') !== '') {
        $what = $t('no') . ($what !== '' ? ' · ' . $what : '');
    }
    if (isset(WX_APPR_LABELS[$action])) {
        return WX_APPR_LABELS[$action] . ($what !== '' ? ': ' . $what : '');
    }
    $verb = preg_match('~delete|trash|purge~', $action) ? 'Delete'
        : (preg_match('~send|camp_action~', $action) ? 'Send'
            : (preg_match('~new|add|import~', $action) ? 'Add'
                : (preg_match('~restore~', $action) ? 'Restore'
                    : (preg_match('~invoice~', $action) ? 'Invoice' : 'Change'))));
    $area = $src === 'builder'
        ? ($action === 'theme' ? 'website theme' : (strpos($action, 'blocks') === 0 ? 'section library' : 'page'))
        : str_replace('_', ' ', (string) preg_replace('~_(save|delete|send|new|add|status|update|set|invoice|pay)$~', '', $action));
    return trim($verb . ' ' . $area . ($what !== '' ? ': ' . $what : ''));
}

/**
 * How many changes are waiting, under the current expiry window.
 *
 * One function for the approvals screen and the bell. Two queries carrying the same expiry rule would
 * eventually disagree about what "pending" means, and the bell is exactly where the disagreement would
 * be noticed by someone who cannot fix it.
 */
function wx_appr_pending_count(): int
{
    return (int) wx_val(
        "SELECT COUNT(*) FROM wx_approvals WHERE status = 'pending' AND requested_at >= DATE_SUB(NOW(), INTERVAL ? DAY)",
        [wx_appr_cfg()['expire_days']]
    );
}


/**
 * A request body with its secrets blanked — defect A-02.
 *
 * The queue stores bodies verbatim so the replay can run the identical call, and that is right for the
 * *replay*. It is wrong for every other reader: a Manager's queued connector save carries `smtpPass`, and
 * "show its shape, not its internals" must mean what it says. Anything named like a credential loses its
 * value here — keys are kept (the screen shows which fields the change sets), values are not.
 */
function wx_appr_redact(array $body): array
{
    foreach ($body as $k => $v) {
        if (is_array($v)) {
            $body[$k] = wx_appr_redact($v);
            continue;
        }
        $name = strtolower((string) $k);
        if (preg_match('~(pass|pwd|secret|token|api[_-]?key|private[_-]?key|credential)~', $name)) {
            $body[$k] = is_string($v) && $v !== '' ? '(hidden)' : $v;
        }
    }
    return $body;
}

/**
 * File a request. Only the parts needed to replay it are stored: the route, the function, the params
 * and the body — never a rendered page.
 *
 * @return array the queued record
 */
function wx_appr_queue(array $u, string $src, string $action, array $payload, ?string $summary = null, ?string $routeFn = null): array
{
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > WX_APPR_MAX_PAYLOAD) {
        throw ApiError::validation('This change is too large to send for approval — ask the Master to make it', 'payload');
    }
    $summary = $summary ?? wx_appr_summary($src, $action, $payload);
    $id = (int) wx_insert('wx_approvals', [
        'src' => $src,
        'action' => $action,
        'summary' => mb_substr($summary, 0, 255),
        'payload_json' => $json,
        'requested_by' => mb_substr((string) ($u['name'] ?? ''), 0, 120),
        'requested_by_id' => isset($u['id']) ? (int) $u['id'] : null,
        'role' => (string) ($u['role'] ?? ''),
        'requested_at' => wx_now(),
        'status' => 'pending',
    ]);
    wx_audit($u, 'approval.request', 'approval:' . $id, ['action' => $action, 'summary' => $summary]);
    if (function_exists('wx_notify_owner')) {
        wx_notify_owner($id, $summary, $u);
    }
    return wx_appr_get($id);
}

/** Update a decision. Kept tiny so both the queue and the replay use the same path. */
function wx_appr_set_decision(int $id, array $patch, array $master): void
{
    $patch['decided_by'] = mb_substr((string) ($master['name'] ?? 'Master'), 0, 120);
    $patch['decided_by_id'] = isset($master['id']) ? (int) $master['id'] : null;
    $patch['decided_at'] = wx_now();
    /* A decided request is never replayed again, so its body has no job left. Dropping it here means a
       queued secret lives only as long as the request is actionable (A-02). A replay that fails puts the
       item back to `pending` — a non-terminal status — and the body is still there for the next attempt. */
    if (in_array((string) ($patch['status'] ?? ''), ['approved', 'rejected', 'cancelled', 'expired'], true)) {
        $patch['payload_json'] = null;
    }
    wx_update('wx_approvals', $patch, ['id' => $id]);
}

/**
 * The queue, with pending items older than the expiry window marked expired first.
 *
 * v2.1 expired entries on read (mutating a file while listing it); here the expiry is an UPDATE, so
 * listing is a read and two people listing at once cannot interleave writes.
 */
function wx_appr_list(string $status = 'pending', int $limit = 100): array
{
    $days = wx_appr_cfg()['expire_days'];
    wx_q(
        "UPDATE wx_approvals SET status = 'expired', payload_json = NULL
         WHERE status = 'pending' AND requested_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
        [$days]
    );
    $where = $status === 'all' ? '' : ' WHERE status = ?';
    $params = $status === 'all' ? [] : [$status];
    $rows = wx_all(
        'SELECT * FROM wx_approvals' . $where . ' ORDER BY id DESC LIMIT ' . $limit,
        $params
    );
    return array_map('wx_appr_public', $rows);
}

function wx_appr_get(int $id): ?array
{
    $row = wx_one('SELECT * FROM wx_approvals WHERE id = ?', [$id]);
    return $row === null ? null : wx_appr_public($row) + ['payload' => json_decode((string) $row['payload_json'], true)];
}

function wx_appr_public(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'src' => (string) $r['src'],
        'action' => (string) $r['action'],
        'summary' => (string) $r['summary'],
        'by' => (string) ($r['requested_by'] ?? ''),
        'by_id' => isset($r['requested_by_id']) ? (int) $r['requested_by_id'] : null,
        'role' => (string) ($r['role'] ?? ''),
        'at' => (string) $r['requested_at'],
        'status' => (string) $r['status'],
        'decidedBy' => $r['decided_by'] ?? null,
        'decidedAt' => $r['decided_at'] ?? null,
        'note' => $r['note'] ?? null,
        'result' => $r['result'] ?? null,
        'ageHours' => (int) floor((time() - strtotime((string) $r['requested_at'])) / 3600),
    ];
}

/**
 * The replay: the same function, the same parameters, run as the Master.
 *
 * This is the point of the whole feature — the Master does not re-type the change, they approve a
 * request and the identical call runs. If it fails, the item goes back to pending with the error
 * attached, so a failure is visible on the queue rather than swallowed.
 */
function wx_appr_replay(array $item, array $master): array
{
    $payload = $item['payload'];
    if (!is_array($payload) || empty($payload['fn']) || empty($payload['file'])) {
        throw ApiError::internal('This approval was stored without what it needs to replay — ask the requester to submit it again');
    }
    $file = WX_V2_DIR . '/routes/' . basename((string) $payload['file']) . '.php';
    if (!is_file($file)) {
        throw ApiError::internal('The route this approval was meant for no longer exists: ' . (string) $payload['file']);
    }
    require_once $file;

    $ctx = [
        'params' => is_array($payload['params'] ?? null) ? $payload['params'] : [],
        'body' => is_array($payload['body'] ?? null) ? $payload['body'] : [],
        'query' => is_array($payload['query'] ?? null) ? $payload['query'] : [],
        'method' => (string) ($payload['method'] ?? 'POST'),
        'user' => $master,
        'replay' => (int) $item['id'],
    ];
    $fn = (string) $payload['fn'];
    if (!function_exists($fn)) {
        throw ApiError::internal('The handler this approval was meant for is missing: ' . $fn);
    }

    wx_appr_set_decision((int) $item['id'], ['status' => 'applying'], $master);
    $GLOBALS['WX_APPR_REPLAY'] = true;
    $GLOBALS['WX_APPR_USER'] = $master;
    // The person a replayed write records as its author: the requester, not the Master who approved.
    $GLOBALS['WX_APPR_REQUESTER'] = [
        'id' => isset($item['by_id']) ? (int) $item['by_id'] : null,
        'name' => (string) $item['by'],
        'role' => (string) ($item['role'] ?? ''),
    ];
    try {
        $out = $fn($ctx);
        wx_appr_set_decision((int) $item['id'], ['status' => 'approved', 'result' => 'Replayed as the Master'], $master);
        wx_audit($master, 'approval.approve', 'approval:' . $item['id'], ['action' => $item['action'], 'by' => $item['by']]);
        return $out;
    } catch (ApiError $e) {
        wx_appr_set_decision((int) $item['id'], ['status' => 'pending', 'result' => mb_substr($e->code . ': ' . $e->getMessage(), 0, 500)], $master);
        wx_audit($master, 'approval.failed', 'approval:' . $item['id'], ['action' => $item['action'], 'error' => $e->code]);
        throw $e;
    } catch (Throwable $e) {
        wx_appr_set_decision((int) $item['id'], ['status' => 'pending', 'result' => mb_substr(get_class($e) . ': ' . $e->getMessage(), 0, 500)], $master);
        throw ApiError::internal('The approved change failed and was returned to the queue: ' . $e->getMessage());
    } finally {
        /* All three are cleared. WX_APPR_USER outliving the replay made the next write in the same process
           act as the Master (wx_appr_actor() reads it first), so a Manager's later payment skipped the queue. */
        $GLOBALS['WX_APPR_REPLAY'] = false;
        unset($GLOBALS['WX_APPR_REQUESTER'], $GLOBALS['WX_APPR_USER']);
    }
}

/**
 * Who the record should say did this.
 *
 * Normally the signed-in user. During an approved replay it is **the person who asked** — that is the
 * whole reason the queue exists: the Master approves the change, but the receipt was taken by the
 * manager who asked for it, and the payment row has to say so or the till cannot be reconciled. The
 * Master's part is recorded where it belongs, in the audit trail and on the approval itself.
 *
 * Permission checks deliberately keep using wx_require_user() (the signed-in Master), because the
 * capability check is about who may perform the write; this function is about attribution.
 */
function wx_actor(): array
{
    if (!empty($GLOBALS['WX_APPR_REQUESTER']) && is_array($GLOBALS['WX_APPR_REQUESTER'])) {
        return $GLOBALS['WX_APPR_REQUESTER'];
    }
    return wx_current_user() ?? ['id' => null, 'name' => 'system', 'role' => ''];
}

/**
 * The gate every mutating route calls.
 *
 * Without it, "approval" would be a screen nobody's writes go through — a queue that fills itself
 * only when someone remembers to file something. With it, the write either happens or is filed, and
 * the route does not have to know which.
 *
 * @param string   $action  the action name the policy matches on
 * @param array    $payload what a replay would need: file, fn, method, params, body, query
 * @param callable $run     performs the change
 */
function wx_appr_gate(string $action, array $payload, callable $run)
{
    $u = $GLOBALS['WX_APPR_USER'] ?? wx_current_user();
    if ($u === null) {
        throw ApiError::auth();
    }
    $src = (string) ($payload['src'] ?? 'admin');
    if (!wx_appr_needed((string) $u['role'], $action, $src)) {
        return $run();
    }
    $item = wx_appr_queue($u, $src, $action, $payload, $payload['summary'] ?? null);
    return [
        'data' => [
            'pending' => true,
            /* wx_appr_queue() already returns the public shape (via wx_appr_get), so it is not mapped again: a second
               wx_appr_public() found no requested_at and answered with an empty `at` and a nonsense ageHours. The
               queued body is left out, as before, because it can carry a key (master plan A-02). */
            'approval' => array_diff_key($item, ['payload' => true]),
            'message' => 'Sent to the Master for approval: ' . $item['summary'],
        ],
        'meta' => ['pending' => true],
    ];
}

/**
 * The one way a route files a change for approval.
 *
 * It checks the requester's permission **before** it queues anything, and that order is the whole
 * point: writing a request into the queue must never be a way to acquire a permission the requester
 * does not have. Otherwise "ask the Master" becomes privilege escalation with extra steps.
 *
 * The paragraph above the function it wraps stays honest — every route in this file is a two-line
 * wrapper around a `_do` function, and the `_do` function repeats the permission check because the
 * replay runs it as the requester, not as the Master who approved it.
 *
 * @param string $file the route file the replay must require before calling $fn
 * @param string $fn   the handler that performs the change (never the wrapper: a replay is already decided)
 */
function wx_appr_route(string $action, array $ctx, string $file, string $fn, callable $run, string $src = 'admin'): array
{
    wx_require_user($action);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    return wx_appr_wrap($action, $file, $fn, $ctx, wx_appr_summary($src, $action, $body), $run, $src);
}

/**
 * Wrap one route in the gate, so the route itself stays about the change it makes.
 *
 * The payload a replay needs is the request: which file, which handler, which params, which body.
 * Nothing else - a rendered page or a signed-in session must never be stored in the queue.
 */
function wx_appr_wrap(string $action, string $file, string $fn, array $ctx, ?string $summary, callable $run, string $src = 'admin')
{
    return wx_appr_gate($action, [
        /* The source matters as much as the action: v2.1 had one list for the admin screens and another for
           the page builder, and the same action name can be queued in one and not the other. Routes that came
           from the builder say `builder` so the business rule those screens carried travels with them. */
        'src' => $src,
        'file' => $file,
        'fn' => $fn,
        'method' => (string) ($ctx['method'] ?? 'POST'),
        'params' => is_array($ctx['params'] ?? null) ? $ctx['params'] : [],
        'body' => is_array($ctx['body'] ?? null) ? $ctx['body'] : [],
        'query' => is_array($ctx['query'] ?? null) ? $ctx['query'] : [],
        'summary' => $summary,
    ], $run);
}

/**
 * Tell the Master. v2.1 wrote a notification feed file and mailed owners when SMTP was configured;
 * the feed is the part the bell reads, so it keeps working — as an activity row the notifications
 * endpoint already serves, which removes a file whose only writer was this feature.
 */
function wx_notify_owner(int $id, string $summary, array $u): void
{
    if (!wx_appr_cfg()['notify']) {
        return;
    }
    try {
        // wx_notify_log's columns are v2.1's (t, event, ref, name, channel, dest, result) — the bell
        // reads the same rows the old admin wrote, so the columns are used as they are, not renamed.
        wx_insert('wx_notify_log', [
            't' => wx_now(),
            'event' => 'approval',
            'ref' => 'approval:' . $id,
            'name' => mb_substr((string) ($u['name'] ?? 'Someone'), 0, 160),
            'channel' => 'bell',
            'dest' => 'owner',
            'result' => mb_substr('pending: ' . $summary, 0, 255),
        ]);
    } catch (Throwable $e) {
        // A notification that fails must never stop the request itself from being filed.
        error_log('approval notify: ' . $e->getMessage());
    }
}
