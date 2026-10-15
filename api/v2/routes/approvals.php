<?php
/**
 * api/v2/routes/approvals.php — the Master's queue.
 *
 * Three things happen here, and only the third is unusual: list what is waiting, decide on one item,
 * and — on approval — **replay the original request** rather than asking the Master to retype it.
 *
 * That is what `wx_appr_replay()` in lib/approvals.php does: the queue holds the route file, the
 * handler, the params and the body, and approving calls the same handler with the same arguments,
 * as the Master. If it throws, the item returns to pending with the error attached, so a failed
 * approval is visible in the queue instead of being lost in a log.
 *
 * Who may do what: only the Master decides. A Manager may look at their own pending items — being
 * able to see that something is waiting is the difference between "in progress" and "lost".
 */

declare(strict_types=1);

/** The queue. Default: pending only, newest first. */
function wx_route_approvals_list(array $ctx): array
{
    $u = wx_require_user('appr_list');
    $status = (string) ($ctx['query']['status'] ?? 'pending');
    if (!in_array($status, ['pending', 'approved', 'rejected', 'expired', 'applying', 'all'], true)) {
        throw ApiError::validation('Unknown status filter', 'status');
    }
    $isMaster = wx_is_master($u);
    if (!$isMaster && $status !== 'all') {
        // A manager sees their own requests, not everyone else's.
        $rows = array_values(array_filter(wx_appr_list($status, 200), static fn($a) => (int) $a['by_id'] === (int) $u['id']));
    } else {
        $rows = wx_appr_list($status, 200);
    }
    $pending = 0;
    foreach (wx_appr_list('pending', 500) as $a) {
        $pending++;
    }
    return ['data' => [
        'approvals' => $rows,
        'pending' => $pending,
        'status' => $status,
        'canDecide' => $isMaster,
        'cfg' => $isMaster ? wx_appr_cfg() : ['manager' => wx_appr_cfg()['manager'], 'developer' => wx_appr_cfg()['developer']],
    ]];
}

/** One item, including the request that would be replayed — so the Master can read it before deciding. */
function wx_route_approvals_get(array $ctx): array
{
    $u = wx_require_user('appr_get');
    $item = wx_appr_get((int) $ctx['params']['id']);
    if ($item === null) {
        throw ApiError::notFound('That approval request does not exist');
    }
    if (!wx_is_master($u) && (int) $item['by_id'] !== (int) $u['id']) {
        throw ApiError::forbidden('You can only see your own requests');
    }
    // The stored payload is a request to replay, not a document; show its shape, not its internals.
    $item['request'] = [
        'file' => $item['payload']['file'] ?? null,
        'fn' => $item['payload']['fn'] ?? null,
        'method' => $item['payload']['method'] ?? null,
        'params' => $item['payload']['params'] ?? [],
        'summary' => $item['payload']['summary'] ?? $item['summary'],
    ];
    /* A-02: what the screen reads is the body with its secrets blanked — keys kept, values not. The
       replay still reads the stored body itself; this is the read path, and it is the only one a person
       sees. A decided request arrives with no body at all (it is dropped when the decision is final). */
    $item['body'] = wx_appr_redact(is_array($item['payload']['body'] ?? null) ? $item['payload']['body'] : []);
    if (wx_is_master($u)) {
        $item['raw'] = wx_appr_redact(is_array($item['payload'] ?? null) ? $item['payload'] : []);
    }
    unset($item['payload']);
    return ['data' => ['approval' => $item, 'canDecide' => wx_is_master($u)]];
}

/** Approve: replay the request as the Master. Anything the replay returns is the response. */
function wx_route_approvals_approve(array $ctx): array
{
    $u = wx_require_user('appr_apply');
    if (!wx_is_master($u)) {
        throw ApiError::forbidden('Only the Master can approve changes');
    }
    $id = (int) $ctx['params']['id'];
    $item = wx_appr_get($id);
    if ($item === null) {
        throw ApiError::notFound('That approval request does not exist');
    }
    if ((string) $item['status'] === 'applying') {
        throw ApiError::conflict('That request is already being applied');
    }
    if ((string) $item['status'] !== 'pending') {
        throw ApiError::conflict('That request is already ' . $item['status']);
    }
    // The Master may correct the request before it runs: an edited body is merged over the stored one,
    // which is what v2.1's WX_APPR_EDITS did for a mistyped number.
    $edits = $ctx['body']['edits'] ?? null;
    if (is_array($edits) && $edits && isset($item['payload']['body']) && is_array($item['payload']['body'])) {
        $item['payload']['body'] = array_replace_recursive($item['payload']['body'], $edits);
    }
    $out = wx_appr_replay($item, $u);
    return [
        'data' => ['approved' => $id, 'result' => $out['data'] ?? null],
        'meta' => ['replayed' => true],
    ];
}

/** Reject with a note. The note is required: "no" without a reason is not a decision anyone can act on. */
function wx_route_approvals_reject(array $ctx): array
{
    $u = wx_require_user('appr_reject');
    if (!wx_is_master($u)) {
        throw ApiError::forbidden('Only the Master can reject changes');
    }
    $id = (int) $ctx['params']['id'];
    $item = wx_appr_get($id);
    if ($item === null) {
        throw ApiError::notFound('That approval request does not exist');
    }
    if ((string) $item['status'] !== 'pending') {
        throw ApiError::conflict('That request is already ' . $item['status']);
    }
    $note = wx_v_string($ctx['body']['note'] ?? '', 'note', 1, 500);
    wx_appr_set_decision($id, ['status' => 'rejected', 'note' => $note], $u);
    wx_audit($u, 'approval.reject', 'approval:' . $id, ['action' => $item['action'], 'by' => $item['by'], 'note' => $note]);
    return ['data' => ['rejected' => $id, 'note' => $note]];
}

/** Withdraw your own request. A Master may cancel anything. */
function wx_route_approvals_cancel(array $ctx): array
{
    $u = wx_require_user('appr_cancel');
    $id = (int) $ctx['params']['id'];
    $item = wx_appr_get($id);
    if ($item === null) {
        throw ApiError::notFound('That approval request does not exist');
    }
    if (!wx_is_master($u) && (int) $item['by_id'] !== (int) $u['id']) {
        throw ApiError::forbidden('You can only withdraw your own requests');
    }
    if ((string) $item['status'] !== 'pending') {
        throw ApiError::conflict('That request is already ' . $item['status']);
    }
    $why = wx_v_opt_string($ctx['body']['note'] ?? null, 'note', 500);
    wx_appr_set_decision($id, ['status' => 'rejected', 'note' => ($why ?: 'Withdrawn by ' . $u['name'])], $u);
    wx_audit($u, 'approval.cancel', 'approval:' . $id, ['action' => $item['action']]);
    return ['data' => ['cancelled' => $id]];
}

/**
 * Just the count, for the bell.
 *
 * Read-only on purpose: it is polled every minute by every signed-in browser, and a polled endpoint
 * that writes turns a busy morning into a write storm. Expired requests are counted as gone here
 * (their age is in the WHERE clause) and actually marked expired on the queue screen, which is the
 * place a person is looking at anyway.
 */
function wx_route_approvals_count(array $ctx): array
{
    wx_require_user('appr_count');
    $days = wx_appr_cfg()['expire_days'];
    /* The same count the bell shows, from the same function — see wx_appr_pending_count(). */
    return ['data' => ['pending' => wx_appr_pending_count(), 'expiresAfterDays' => $days]];
}

/**
 * The three switches, and who turned them. Only the Master changes them: the whole point of the
 * feature is that a Manager cannot decide their own changes do not need approval.
 */
function wx_route_approvals_cfg_get(array $ctx): array
{
    wx_require_user('appr_cfg_get');
    return ['data' => ['cfg' => wx_appr_cfg()]];
}

function wx_route_approvals_cfg_save(array $ctx): array
{
    $u = wx_require_user('appr_cfg_save');
    if (!wx_is_master($u)) {
        throw ApiError::forbidden('Only the Master can change the approval settings');
    }
    $b = $ctx['body'];
    $before = wx_appr_cfg();
    foreach (['manager', 'developer', 'notify'] as $k) {
        if (array_key_exists($k, $b)) {
            wx_setting_set('approval.' . $k, !empty($b[$k]) ? '1' : '0');
        }
    }
    if (array_key_exists('expire_days', $b)) {
        $days = wx_v_int($b['expire_days'], 'expire_days', 1, 365);
        wx_setting_set('approval.expire_days', (string) $days);
    }
    $after = wx_appr_cfg();
    wx_audit($u, 'approval.config', 'approval:cfg', ['before' => $before, 'after' => $after]);
    return ['data' => ['cfg' => $after, 'before' => $before]];
}
