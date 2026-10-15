<?php
/**
 * api/v2/routes/leads.php — the first real resource, and the one the Phase 1 gate round-trips.
 *
 * Written against the live schema, column for column: wx_leads has 32 columns and no foreign keys,
 * and this file is deliberately careful about both. Stage names come from CRM_STAGES in the v2.1
 * code (crm-lib.php) so a lead created here is a lead the old admin can still see.
 *
 * Only actions that exist in the v2.1 dispatcher are used as permission keys (list_leads, get_lead,
 * lead_save, lead_delete, add_lead_note), because those are the names wx_action_groups matches.
 */

declare(strict_types=1);

const WX_LEAD_STAGES = ['new', 'contacted', 'visit', 'quote', 'hold', 'won', 'lost'];
const WX_LEAD_SOURCES = ['website', 'whatsapp', 'chat', 'telegram', 'phone', 'walkin', 'referral', 'import', 'manual'];

/** Columns a write may set. Anything else in the body is dropped rather than guessed at. */
const WX_LEAD_WRITABLE = [
    'name', 'phone', 'email', 'company', 'designation', 'location', 'line',
    'source', 'page', 'service', 'message', 'stage', 'priority', 'lead_type',
    'project_type', 'budget', 'area', 'tags', 'assigned_to', 'followup',
    'value', 'lost_reason', 'client_id', 'next_at', 'next_type', 'is_read', 'fields',
];

function wx_lead_shape(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'created_at' => $r['created_at'],
        'name' => (string) $r['name'],
        'phone' => $r['phone'],
        'email' => $r['email'],
        'company' => $r['company'] ?? null,
        'designation' => $r['designation'] ?? null,
        'location' => $r['location'] ?? null,
        'line' => $r['line'] ?? null,
        'source' => (string) $r['source'],
        'page' => $r['page'],
        'service' => $r['service'],
        'message' => $r['message'],
        'stage' => (string) $r['stage'],
        'priority' => $r['priority'] ?? null,
        'lead_type' => $r['lead_type'] ?? null,
        'project_type' => $r['project_type'] ?? null,
        'budget' => $r['budget'] ?? null,
        'area' => $r['area'] ?? null,
        'tags' => $r['tags'] ?? null,
        'assigned_to' => isset($r['assigned_to']) ? (int) $r['assigned_to'] : null,
        'followup' => $r['followup'] ?? null,
        'value' => (int) $r['value'],
        'valueDisplay' => wx_pkr_out((int) $r['value']),
        'lost_reason' => $r['lost_reason'] ?? null,
        'client_id' => isset($r['client_id']) ? (int) $r['client_id'] : null,
        'is_read' => (bool) $r['is_read'],
        'last_contact' => $r['last_contact'] ?? null,
        'next_at' => $r['next_at'] ?? null,
        'next_type' => $r['next_type'] ?? null,
    ];
}

/**
 * GET /leads — filter, search, sort, paginate. One query for the page and one for the count:
 * v2.1's list screens loaded every lead and filtered in the browser, which is the N+1 pattern the
 * audit called out.
 */
function wx_route_leads_list(array $ctx): array
{
    $u = wx_require_user('list_leads');

    $where = [];
    $params = [];
    $stage = (string) ($ctx['query']['stage'] ?? '');
    if ($stage !== '' && $stage !== 'all') {
        if (!in_array($stage, WX_LEAD_STAGES, true)) {
            throw ApiError::validation('Unknown stage', 'stage');
        }
        $where[] = 'stage = ?';
        $params[] = $stage;
    }
    if (!empty($ctx['query']['assigned_to'])) {
        $where[] = 'assigned_to = ?';
        $params[] = wx_v_id($ctx['query']['assigned_to'], 'assigned_to');
    }
    if (!empty($ctx['query']['q'])) {
        $q = '%' . wx_v_string($ctx['query']['q'], 'q', 1, 80) . '%';
        $where[] = '(name LIKE ? OR phone LIKE ? OR email LIKE ? OR company LIKE ?)';
        array_push($params, $q, $q, $q, $q);
    }
    $sqlWhere = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $total = (int) wx_val('SELECT COUNT(*) FROM wx_leads' . $sqlWhere, $params);
    $limit = wx_limit($ctx['query']['limit'] ?? 50);
    $offset = wx_offset($ctx['query']['offset'] ?? 0);

    $rows = wx_all(
        'SELECT * FROM wx_leads' . $sqlWhere . ' ORDER BY id DESC LIMIT ' . $limit . ' OFFSET ' . $offset,
        $params
    );

    $data = ['leads' => array_map('wx_lead_shape', $rows), 'total' => $total, 'limit' => $limit, 'offset' => $offset];

    // The board view the pipeline screen needs: one grouped count instead of a row per stage.
    if (($ctx['query']['view'] ?? '') === 'board') {
        $counts = [];
        foreach (wx_all('SELECT stage, COUNT(*) AS n, COALESCE(SUM(value),0) AS v FROM wx_leads GROUP BY stage') as $r) {
            $counts[(string) $r['stage']] = ['count' => (int) $r['n'], 'value' => (int) $r['v']];
        }
        $data['board'] = $counts;
        $data['stages'] = WX_LEAD_STAGES;
    }
    return ['data' => $data];
}

function wx_route_leads_get(array $ctx): array
{
    $u = wx_require_user('get_lead');
    $lead = wx_one('SELECT * FROM wx_leads WHERE id = ?', [(int) $ctx['params']['id']]);
    if ($lead === null) {
        throw ApiError::notFound('That lead does not exist');
    }
    $notes = wx_all('SELECT id, t, user_name, text, sys, kind, outcome FROM wx_lead_notes WHERE lead_id = ? ORDER BY id DESC LIMIT 100', [(int) $lead['id']]);
    return ['data' => ['lead' => wx_lead_shape($lead), 'notes' => $notes]];
}

/** POST /leads and PATCH /leads/{id} — one code path, so create and update cannot disagree. */
function wx_route_leads_save(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_leads_save_do() below. */
    return wx_appr_route('lead_save', $ctx, 'leads', 'wx_route_leads_save_do', static fn() => wx_route_leads_save_do($ctx));
}

function wx_route_leads_save_do(array $ctx): array
{
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : 0;
    $u = wx_require_user('lead_save');

    return wx_guard('leads.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $raw = wx_v_pick($ctx['body'], WX_LEAD_WRITABLE);
            $set = [];
            if (array_key_exists('name', $raw)) {
                $set['name'] = wx_v_string($raw['name'], 'name', 2, 120);
            }
            if (array_key_exists('phone', $raw)) {
                $set['phone'] = wx_v_opt_string($raw['phone'], 'phone', 40);
            }
            if (array_key_exists('email', $raw)) {
                $set['email'] = ($raw['email'] === null || $raw['email'] === '') ? null : wx_v_email($raw['email']);
            }
            foreach (['company' => 120, 'designation' => 80, 'location' => 160, 'service' => 190, 'message' => 5000, 'tags' => 400, 'budget' => 60, 'area' => 30, 'project_type' => 60, 'next_type' => 20, 'lost_reason' => 190, 'page' => 200] as $f => $max) {
                if (array_key_exists($f, $raw)) {
                    $set[$f] = wx_v_opt_string($raw[$f], $f, $max);
                }
            }
            if (array_key_exists('source', $raw)) {
                $set['source'] = wx_v_enum($raw['source'], WX_LEAD_SOURCES, 'source');
            }
            if (array_key_exists('stage', $raw)) {
                $set['stage'] = wx_v_enum($raw['stage'], WX_LEAD_STAGES, 'stage');
            }
            if (array_key_exists('priority', $raw)) {
                $set['priority'] = wx_v_opt_string($raw['priority'], 'priority', 10);
            }
            if (array_key_exists('lead_type', $raw)) {
                $set['lead_type'] = wx_v_opt_string($raw['lead_type'], 'lead_type', 20);
            }
            if (array_key_exists('line', $raw)) {
                $set['line'] = wx_v_opt_string($raw['line'], 'line', 20);
            }
            if (array_key_exists('value', $raw)) {
                $set['value'] = wx_v_pkr($raw['value'], 'value', 0);
            }
            if (array_key_exists('assigned_to', $raw)) {
                $set['assigned_to'] = wx_v_opt_int($raw['assigned_to'], 'assigned_to', 1);
            }
            if (array_key_exists('client_id', $raw)) {
                $set['client_id'] = wx_v_opt_int($raw['client_id'], 'client_id', 1);
            }
            if (array_key_exists('followup', $raw)) {
                $set['followup'] = wx_v_opt_date($raw['followup'], 'followup');
            }
            if (array_key_exists('next_at', $raw)) {
                $set['next_at'] = wx_v_opt_date($raw['next_at'], 'next_at');
            }
            if (array_key_exists('is_read', $raw)) {
                $set['is_read'] = wx_v_bool($raw['is_read'], 'is_read') ? 1 : 0;
            }
            if (array_key_exists('fields', $raw)) {
                // The form's extra answers stay as stored JSON, exactly as v2.1 kept them.
                $set['fields'] = is_array($raw['fields']) ? json_encode($raw['fields'], JSON_UNESCAPED_UNICODE) : wx_v_opt_string($raw['fields'], 'fields', 5000);
            }
            $set['last_contact'] = wx_now();

            if ($id > 0) {
                $before = wx_one('SELECT * FROM wx_leads WHERE id = ?', [$id]);
                if ($before === null) {
                    throw ApiError::notFound('That lead does not exist');
                }
                if (!$set) {
                    throw ApiError::validation('Nothing to change');
                }
                wx_update('wx_leads', $set, ['id' => $id]);
                if (isset($set['stage']) && $set['stage'] !== $before['stage']) {
                    wx_insert('wx_lead_notes', [
                        'lead_id' => $id,
                        't' => wx_now(),
                        'user_name' => (string) $u['name'],
                        'text' => 'Stage: ' . $before['stage'] . ' → ' . $set['stage'],
                        'sys' => 1,
                        'kind' => 'stage',
                    ]);
                }
                wx_audit($u, 'lead.save', 'lead:' . $id, ['fields' => array_keys($set)]);
                $lead = wx_one('SELECT * FROM wx_leads WHERE id = ?', [$id]);
                return ['data' => ['lead' => wx_lead_shape($lead), 'created' => false]];
            }

            if (!isset($set['name'])) {
                throw ApiError::validation('A name is required', 'name');
            }
            if (empty($set['phone']) && empty($set['email'])) {
                throw ApiError::validation('A phone number or an email address is required', 'phone');
            }
            $set['created_at'] = wx_now();
            $set['source'] = $set['source'] ?? 'manual';
            $set['stage'] = $set['stage'] ?? 'new';
            $set['ip'] = wx_ip();
            $newId = wx_insert('wx_leads', $set);
            wx_insert('wx_lead_notes', [
                'lead_id' => $newId,
                't' => wx_now(),
                'user_name' => (string) $u['name'],
                'text' => 'Lead created in the admin',
                'sys' => 1,
                'kind' => 'created',
            ]);
            wx_audit($u, 'lead.create', 'lead:' . $newId, ['source' => $set['source']]);
            $lead = wx_one('SELECT * FROM wx_leads WHERE id = ?', [$newId]);
            return ['data' => ['lead' => wx_lead_shape($lead), 'created' => true]];
        });
    });
}

/**
 * DELETE /leads/{id} — a soft move to the lost stage, not a row deletion. v2.1 let a delete remove
 * the lead and orphan its notes and bookings; keeping the row keeps the history.
 */
function wx_route_leads_delete(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_leads_delete_do() below. */
    return wx_appr_route('lead_delete', $ctx, 'leads', 'wx_route_leads_delete_do', static fn() => wx_route_leads_delete_do($ctx));
}

function wx_route_leads_delete_do(array $ctx): array
{
    $u = wx_require_user('lead_delete');
    $id = (int) $ctx['params']['id'];
    $lead = wx_one('SELECT * FROM wx_leads WHERE id = ?', [$id]);
    if ($lead === null) {
        throw ApiError::notFound('That lead does not exist');
    }
    $reason = wx_v_opt_string($ctx['body']['reason'] ?? null, 'reason', 190);
    wx_update('wx_leads', [
        'stage' => 'lost',
        'lost_reason' => $reason ?? 'Removed in the admin',
        'is_read' => 1,
    ], ['id' => $id]);
    wx_insert('wx_lead_notes', [
        'lead_id' => $id,
        't' => wx_now(),
        'user_name' => (string) $u['name'],
        'text' => 'Moved to Lost: ' . ($reason ?? 'Removed in the admin'),
        'sys' => 1,
        'kind' => 'stage',
    ]);
    wx_audit($u, 'lead.delete', 'lead:' . $id, ['soft' => true]);
    return ['data' => ['id' => $id, 'stage' => 'lost', 'soft' => true]];
}

function wx_route_leads_notes(array $ctx): array
{
    wx_require_user('get_lead');
    $id = (int) $ctx['params']['id'];
    $rows = wx_all('SELECT id, t, user_name, text, sys, kind, outcome FROM wx_lead_notes WHERE lead_id = ? ORDER BY id DESC LIMIT 200', [$id]);
    return ['data' => ['notes' => $rows]];
}

function wx_route_lead_note_add(array $ctx): array
{
    $u = wx_require_user('add_lead_note');
    $id = (int) $ctx['params']['id'];
    if (wx_val('SELECT id FROM wx_leads WHERE id = ?', [$id]) === null) {
        throw ApiError::notFound('That lead does not exist');
    }
    $text = wx_v_string($ctx['body']['text'] ?? '', 'text', 2, 4000);
    $kind = wx_v_opt_string($ctx['body']['kind'] ?? 'note', 'kind', 20) ?? 'note';
    $outcome = wx_v_opt_string($ctx['body']['outcome'] ?? null, 'outcome', 190);
    $noteId = wx_insert('wx_lead_notes', [
        'lead_id' => $id,
        't' => wx_now(),
        'user_name' => (string) $u['name'],
        'text' => $text,
        'sys' => 0,
        'kind' => $kind,
        'outcome' => $outcome,
    ]);
    wx_update('wx_leads', ['last_contact' => wx_now()], ['id' => $id]);
    wx_audit($u, 'lead.note', 'lead:' . $id, ['note' => $noteId]);
    return ['data' => ['note' => ['id' => $noteId, 't' => wx_now(), 'user_name' => (string) $u['name'], 'text' => $text, 'kind' => $kind, 'outcome' => $outcome, 'sys' => 0]]];
}
