<?php
/**
 * api/v2/routes/connectors.php — the integrations screen: what is saved, whether it works, and the backups.
 *
 * Five routes for the five v2.1 actions that do something a browser cannot: `conn_list`, `conn_save`,
 * `conn_delete`, `conn_test` and `conn_push`. The other two — `conn_gmail_send`, `conn_gmail_use` — are a
 * real SMTP client, which this API does not have yet (`lib/notify.php` says so in its own header), so they are
 * named as the remainder in `wx_conn_list()['unported']` and in the plan rather than half-written here.
 *
 * The action names are v2.1's, because the approval policy and the permission matrix are keyed on them:
 * `conn_save` and `conn_delete` end in queued verbs, so a Manager's change waits for the Master;
 * `conn_test` ends in `_test`, which the policy's skip list covers — a test writes a status into the store
 * and nothing anybody reads; and `conn_push` is recorded in `WX_APPR_NEVER` with its reason, because the
 * same code path is what the cron's daily backup calls and a scheduled job cannot wait for an approval.
 *
 * @package Woodex\Api\V2
 */

declare(strict_types=1);

/** Who v2.1 let anywhere near this screen: `conn-lib.php`'s own `need(['owner', 'admin'])`. */
const WX_CONN_ROLES = ['owner', 'admin'];

/** GET /connectors — the saved records, the generated 24-card gallery, and whether this host can back up. */
function wx_route_connectors_list(array $ctx): array
{
    wx_require_user('conn_list', WX_CONN_ROLES);
    return ['data' => wx_conn_list()];
}

/**
 * POST /connectors — v2.1's `conn_save`, one record at a time (a new one, or an edit of an existing id).
 *
 * Queued for a Manager like every other `save`: a pasted token is a credential for the studio's own accounts,
 * and the queue's record of it is the audit trail for who put it there.
 */
function wx_route_connectors_save(array $ctx): array
{
    return wx_appr_route('conn_save', $ctx, 'connectors', 'wx_route_connectors_save_do', static fn() => wx_route_connectors_save_do($ctx));
}

function wx_route_connectors_save_do(array $ctx): array
{
    $u = wx_require_user('conn_save', WX_CONN_ROLES);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    /* The payload a replay needs is the request, and a replay of *this* one carries the secret again — which
       is why a queued save is still a secret in a queue. The queue's own copy is the body, so it is stored
       with the rest; the alternative (stripping it) would replay a save that clears the token. */
    return wx_guard('conn.save', static fn() => ['data' => wx_conn_save($body, $u)]);
}

/** DELETE /connectors/{id} — v2.1's `conn_delete`, with the 404 it gave a bad id. Queued: it removes a credential. */
function wx_route_connectors_delete(array $ctx): array
{
    return wx_appr_route('conn_delete', $ctx, 'connectors', 'wx_route_connectors_delete_do', static fn() => wx_route_connectors_delete_do($ctx));
}

function wx_route_connectors_delete_do(array $ctx): array
{
    $u = wx_require_user('conn_delete', WX_CONN_ROLES);
    $id = trim((string) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? ''));
    return wx_guard('conn.delete', static fn() => ['data' => wx_conn_delete($id, $u)]);
}

/**
 * POST /connectors/{id}/test — ask the service whether the secret works. **Not queued, and it should not be:**
 * `_test` is in the policy's own skip list, and a person who cannot test a token cannot fix it either.
 */
function wx_route_connectors_test(array $ctx): array
{
    $u = wx_require_user('conn_test', WX_CONN_ROLES);
    $id = trim((string) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? ''));
    return wx_guard('conn.test', static fn() => ['data' => wx_conn_test($id, $u)]);
}

/**
 * POST /connectors/{id}/push — send a backup now, to wherever this connector points.
 *
 * The gate's action is v2.1's `conn_push`, and it is deliberately not queued — recorded with its reason in
 * `WX_APPR_NEVER` beside the other decisions. The same function is the cron's daily backup: a scheduled job
 * cannot sit in a queue waiting for the Master, and a backup adds nothing to the site — it is the site's own
 * pages and database, sent to an account the same person already configured.
 */
function wx_route_connectors_push(array $ctx): array
{
    return wx_appr_route('conn_push', $ctx, 'connectors', 'wx_route_connectors_push_do', static fn() => wx_route_connectors_push_do($ctx));
}

function wx_route_connectors_push_do(array $ctx): array
{
    $u = wx_require_user('conn_push', WX_CONN_ROLES);
    $id = trim((string) ($ctx['params']['id'] ?? $ctx['body']['id'] ?? ''));
    return wx_guard('conn.push', static fn() => ['data' => wx_conn_push_id($id, $u)]);
}
