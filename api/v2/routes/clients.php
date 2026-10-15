<?php
/**
 * api/v2/routes/clients.php — the client master, and the 360° view of one client.
 *
 * v2.1 had two and a half versions of this screen: `clients_list` in crm-lib.php loaded every client
 * and summed its leads in PHP, `clients_master` in sales17-lib.php was the newer table, and
 * `client_360` in sales17-lib.php was the page that made sense of one client. They disagreed about
 * what a client is. This file is one resource with three read shapes:
 *
 *   GET /clients                 the list, filtered and paged in SQL
 *   GET /clients/{id}            the 360° view: documents, money, conversations, timeline
 *   GET /clients/{id}/comms      the conversations alone, for the Messages tab
 *
 * Behaviour is ported from those files rather than reinvented — the status words, the phone matching
 * and the merge rules are the ones people have been using. Three places deliberately go further than
 * v2.1 did, each because v2.1's version lost something:
 *
 *   · **The list is paged in SQL.** v2.1 read every row and filtered in the browser; at 5,000 clients
 *     the screen stopped opening on a phone. The filters now reach the database, and each row carries
 *     a `wonValue` computed with a JOIN rather than an N+1 loop.
 *
 *   · **Deleting a client with documents is refused.** v2.1 deleted the client, orphaned its leads and
 *     left invoices pointing at a name that no longer existed. A client with a single quotation is
 *     still that quotation's customer, so the answer is "merge it instead" (409), not a silent erasure.
 *
 *   · **Duplicates are reported, not blocked.** Saving a client whose phone already exists returns the
 *     list of matches so the screen can offer to merge. Blocking would be wrong — two people share a
 *     number more often than anyone expects — and so is pretending there is no duplicate.
 */

declare(strict_types=1);

/** S17_CTYPES and S17_LINES, kept as the same words and the same keys. */
const WX_CLIENT_TYPES = ['individual', 'company', 'developer', 'architect'];
const WX_CLIENT_LINES = ['furniture', 'interior', 'project'];
const WX_CLIENT_WRITABLE = ['name', 'phone', 'email', 'company', 'city', 'address', 'notes', 'type', 'source', 'tags', 'line', 'designation'];

/** The last ten digits are the identity of a phone number: +92 300, 0300 and 300 are one person. */
function wx_client_phone_key($phone): string
{
    $d = (string) preg_replace('~\D~', '', (string) $phone);
    return strlen($d) >= 10 ? substr($d, -10) : '';
}

function wx_client_shape(array $c): array
{
    $tags = trim((string) ($c['tags'] ?? '')) === '' ? [] : array_values(array_filter(array_map('trim', explode(',', (string) $c['tags']))));
    return [
        'id' => (int) $c['id'],
        'name' => (string) $c['name'],
        'phone' => (string) ($c['phone'] ?? ''),
        'email' => (string) ($c['email'] ?? ''),
        'company' => (string) ($c['company'] ?? ''),
        'city' => (string) ($c['city'] ?? ''),
        'address' => (string) ($c['address'] ?? ''),
        'notes' => (string) ($c['notes'] ?? ''),
        'type' => (string) ($c['type'] ?? ''),
        'source' => (string) ($c['source'] ?? ''),
        'line' => (string) ($c['line'] ?? ''),
        'designation' => (string) ($c['designation'] ?? ''),
        'tags' => $tags,
        'createdAt' => $c['created_at'] ?? null,
        'updatedAt' => $c['updated_at'] ?? null,
        /* How to reach them, in one line, for the list column and the search results. */
        'reach' => trim(implode(' · ', array_filter([(string) ($c['phone'] ?? ''), (string) ($c['email'] ?? '')]))) ?: '—',
    ];
}

/** A phone or email that already exists, excluding one id. Used to warn rather than to block. */
function wx_client_duplicates(string $phone, string $email, int $exceptId = 0, int $limit = 5): array
{
    $out = [];
    $key = wx_client_phone_key($phone);
    $email = strtolower(trim($email));
    if ($key === '' && $email === '') {
        return $out;
    }
    foreach (wx_all('SELECT id, name, phone, email, company FROM wx_clients ORDER BY id DESC') as $c) {
        if ((int) $c['id'] === $exceptId) {
            continue;
        }
        $samePhone = $key !== '' && wx_client_phone_key($c['phone']) === $key;
        $sameEmail = $email !== '' && strtolower(trim((string) $c['email'])) === $email;
        if (!$samePhone && !$sameEmail) {
            continue;
        }
        $out[] = [
            'id' => (int) $c['id'],
            'name' => (string) $c['name'],
            'company' => (string) ($c['company'] ?? ''),
            'matchedOn' => $samePhone ? 'phone' : 'email',
        ];
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * The documents belonging to one client.
 *
 * Matched by `client_id` where it is set, and by the last ten digits of the phone number otherwise —
 * the same rule v2.1's `s17_docs_for()` used, kept because hundreds of quotations from before the
 * client column existed would otherwise disappear from the client's page.
 */
function wx_client_docs(array $c): array
{
    $cid = (int) $c['id'];
    $key = wx_client_phone_key($c['phone'] ?? '');
    $email = strtolower(trim((string) ($c['email'] ?? '')));
    $mine = static function (array $x) use ($cid, $key, $email): bool {
        if ((int) ($x['client_id'] ?? 0) === $cid) {
            return true;
        }
        $client = is_array($x['client'] ?? null) ? $x['client'] : [];
        if ($key !== '' && wx_client_phone_key($client['phone'] ?? '') === $key) {
            return true;
        }
        return $email !== '' && strtolower(trim((string) ($client['email'] ?? ''))) === $email;
    };

    /* One query per table, not one per document: the payloads come back whole and are matched here.
       v2.1's version called doc_all() (which read every document) and then filtered; this reads the
       same rows once, and the payments for every matched invoice come back in a single grouped query
       rather than two queries per invoice. */
    $load = static function (string $table, int $limit = 500): array {
        $col = wx_payload_column($table);
        $out = [];
        foreach (wx_all('SELECT id, `' . $col . '` AS payload FROM `' . $table . '` ORDER BY id DESC LIMIT ' . $limit) as $r) {
            $d = json_decode((string) $r['payload'], true);
            if (is_array($d)) {
                $d['id'] = (int) $r['id'];
                $out[] = $d;
            }
        }
        return $out;
    };

    $quotes = array_values(array_filter($load('wx_quotes'), $mine));
    $invoices = array_values(array_filter($load('wx_invoices'), $mine));

    $payments = [];
    $ids = array_column($invoices, 'id');
    if ($ids && wx_table_exists('wx_invoice_payments')) {
        $holes = implode(',', array_fill(0, count($ids), '?'));
        foreach (wx_all('SELECT * FROM wx_invoice_payments WHERE invoice_id IN (' . $holes . ') AND reversed_at IS NULL ORDER BY id ASC', $ids) as $p) {
            $payments[(int) $p['invoice_id']][] = [
                'id' => (int) $p['id'],
                'rcpt' => (string) $p['rcpt'],
                'date' => (string) $p['paid_on'],
                'amount' => (int) $p['amount'],
                'method' => (string) ($p['method'] ?? ''),
                'ref' => (string) ($p['ref'] ?? ''),
                'by' => (string) ($p['created_by'] ?? ''),
            ];
        }
    }
    $public = [];
    foreach ($invoices as $d) {
        $public[] = wx_inv_public($d, $payments[(int) $d['id']] ?? []);
    }

    $projects = [];
    if (wx_column_exists('wx_projects', 'client_id')) {
        $projects = array_values(array_filter($load('wx_projects'), static fn(array $p) => (int) ($p['client_id'] ?? 0) === $cid));
    }

    return [$quotes, $public, $projects];
}

/**
 * The four words a client can be, ported from s17_client_status(): returning, active, prospect, past.
 *
 * Kept as words rather than derived from a score because these are the words on the labels people
 * have been reading for a year, and because "returning" means two paid jobs, not a formula.
 */
function wx_client_status(array $invoices, array $projects, array $leads): string
{
    $n = count($invoices);
    $open = array_filter($projects, static fn($p) => !in_array((string) ($p['stage'] ?? ''), ['handover', 'done', 'closed'], true));
    $balance = 0;
    foreach ($invoices as $i) {
        $balance += (int) ($i['balance'] ?? 0);
    }
    $won = count(array_filter($leads, static fn($l) => (string) ($l['stage'] ?? '') === 'won'));
    if ($n >= 2 || $won >= 2) {
        return 'returning';
    }
    if ($open || $balance > 0 || ($n === 1 && strtotime((string) ($invoices[0]['issue_date'] ?? '')) > strtotime('-90 days'))) {
        return 'active';
    }
    if ($n === 0 && $won === 0) {
        return 'prospect';
    }
    return 'past';
}

/** Load the client row or fail with the message the screen shows. */
function wx_client_or_404(int $id): array
{
    $c = wx_one('SELECT * FROM wx_clients WHERE id = ?', [$id]);
    if ($c === null) {
        throw ApiError::notFound('That client does not exist');
    }
    return $c;
}

/**
 * GET /clients — search, filter, sort, page. One query for the page, one for the count, one grouped
 * query for the won value: the three facts the list screen needs, instead of every client and every
 * lead in memory.
 */
function wx_route_clients_list(array $ctx): array
{
    wx_require_user('clients_master');
    $q = $ctx['query'];

    $where = [];
    $params = [];
    if (($q['q'] ?? '') !== '') {
        $like = '%' . wx_v_string($q['q'], 'q', 1, 80) . '%';
        $where[] = '(name LIKE ? OR company LIKE ? OR phone LIKE ? OR email LIKE ? OR city LIKE ? OR tags LIKE ?)';
        array_push($params, $like, $like, $like, $like, $like, $like);
    }
    foreach (['type' => WX_CLIENT_TYPES, 'line' => WX_CLIENT_LINES] as $field => $allowed) {
        if (($q[$field] ?? '') !== '' && $q[$field] !== 'all') {
            $where[] = $field . ' = ?';
            $params[] = wx_v_enum($q[$field], $allowed, $field);
        }
    }
    if (($q['city'] ?? '') !== '') {
        $where[] = 'city = ?';
        $params[] = wx_v_string($q['city'], 'city', 1, 80);
    }
    if (($q['tag'] ?? '') !== '') {
        $where[] = 'FIND_IN_SET(?, tags)';
        $params[] = strtolower(wx_v_string($q['tag'], 'tag', 1, 30));
    }
    $sqlWhere = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $total = (int) wx_val('SELECT COUNT(*) FROM wx_clients' . $sqlWhere, $params);
    $limit = wx_limit($q['limit'] ?? 50);
    $offset = wx_offset($q['offset'] ?? 0);

    $order = 'id DESC';
    if (($q['sort'] ?? '') === 'name') {
        $order = 'name ASC';
    } elseif (($q['sort'] ?? '') === 'recent') {
        $order = 'COALESCE(updated_at, created_at) DESC';
    }

    $rows = wx_all('SELECT * FROM wx_clients' . $sqlWhere . ' ORDER BY ' . $order . ' LIMIT ' . $limit . ' OFFSET ' . $offset, $params);

    /* Deal totals per client, in one grouped query rather than a query per row. */
    $won = [];
    foreach (wx_all("SELECT client_id, COUNT(*) AS n, COALESCE(SUM(value),0) AS v FROM wx_leads WHERE client_id IS NOT NULL AND stage = 'won' GROUP BY client_id") as $r) {
        $won[(int) $r['client_id']] = ['leads' => (int) $r['n'], 'value' => (int) $r['v']];
    }
    $openLeads = [];
    foreach (wx_all("SELECT client_id, COUNT(*) AS n FROM wx_leads WHERE client_id IS NOT NULL AND stage NOT IN ('won','lost') GROUP BY client_id") as $r) {
        $openLeads[(int) $r['client_id']] = (int) $r['n'];
    }

    $clients = [];
    foreach ($rows as $r) {
        $row = wx_client_shape($r);
        $row['wonValue'] = $won[(int) $r['id']]['value'] ?? 0;
        $row['wonDisplay'] = wx_pkr_out($row['wonValue']);
        $row['wonLeads'] = $won[(int) $r['id']]['leads'] ?? 0;
        $row['openLeads'] = $openLeads[(int) $r['id']] ?? 0;
        $clients[] = $row;
    }

    return ['data' => [
        'clients' => $clients,
        'total' => $total,
        'limit' => $limit,
        'offset' => $offset,
        'types' => WX_CLIENT_TYPES,
        'lines' => WX_CLIENT_LINES,
    ]];
}

/** GET /clients/{id} — everything known about one client, in one response. */
function wx_route_clients_get(array $ctx): array
{
    wx_require_user('client_360');
    $c = wx_client_or_404((int) $ctx['params']['id']);
    $cid = (int) $c['id'];

    $leads = [];
    foreach (wx_all('SELECT * FROM wx_leads WHERE client_id = ? ORDER BY id DESC LIMIT 200', [$cid]) as $l) {
        $leads[] = [
            'id' => (int) $l['id'],
            'name' => (string) $l['name'],
            'stage' => (string) $l['stage'],
            'service' => (string) ($l['service'] ?? ''),
            'value' => (int) $l['value'],
            'valueDisplay' => wx_pkr_out((int) $l['value']),
            'created_at' => $l['created_at'],
            'next_at' => $l['next_at'] ?? null,
            'next_type' => $l['next_type'] ?? null,
        ];
    }
    [$quotes, $invoices, $projects] = wx_client_docs($c);

    /* The timeline: one list of dated facts, newest first — leads, notes, quotations, invoices,
       payments, projects. Ported from client_360; a client page that cannot answer "what happened
       last" is a form, not a record. */
    $timeline = [];
    foreach ($leads as $l) {
        $timeline[] = ['t' => (string) $l['created_at'], 'kind' => 'lead', 'title' => 'Enquiry #' . $l['id'] . ($l['service'] !== '' ? ' — ' . $l['service'] : ''), 'sub' => 'Stage: ' . $l['stage'], 'id' => $l['id']];
    }
    foreach (wx_all('SELECT lead_id, t, text, user_name FROM wx_lead_notes WHERE lead_id IN (SELECT id FROM wx_leads WHERE client_id = ?) AND (sys = 0 OR sys IS NULL) ORDER BY id DESC LIMIT 200', [$cid]) as $n) {
        $timeline[] = ['t' => (string) $n['t'], 'kind' => 'note', 'title' => (string) $n['text'], 'sub' => (string) $n['user_name'], 'id' => (int) $n['lead_id']];
    }
    foreach ($quotes as $x) {
        $timeline[] = ['t' => (string) ($x['created_at'] ?? $x['issue_date'] ?? ''), 'kind' => 'quote', 'title' => 'Quotation ' . wx_doc_label($x) . ' — ' . (string) ($x['status'] ?? ''), 'sub' => wx_pkr_out((int) ($x['total'] ?? 0)), 'id' => (int) $x['id']];
    }
    foreach ($invoices as $x) {
        $timeline[] = ['t' => (string) ($x['issue_date'] ?? '') . ' 09:00:00', 'kind' => 'invoice', 'title' => 'Invoice ' . (string) $x['no'] . ' — ' . wx_pkr_out((int) $x['total']), 'sub' => ucfirst((string) $x['payStatus']) . ((int) $x['balance'] > 0 ? ' · balance ' . wx_pkr_out((int) $x['balance']) : ''), 'id' => (int) $x['id']];
        foreach ($x['payments'] as $py) {
            $timeline[] = ['t' => (string) ($py['date'] ?? '') . ' 12:00:00', 'kind' => 'payment', 'title' => 'Payment ' . wx_pkr_out((int) $py['amount']) . ' (' . (string) ($py['method'] ?? '') . ')', 'sub' => 'Invoice ' . (string) $x['no'] . ' · ' . (string) ($py['rcpt'] ?? ''), 'id' => (int) $x['id']];
        }
    }
    foreach ($projects as $pj) {
        $timeline[] = ['t' => (string) ($pj['created_at'] ?? $pj['start'] ?? ''), 'kind' => 'project', 'title' => 'Project ' . (string) ($pj['name'] ?? ''), 'sub' => 'Stage: ' . (string) ($pj['stage'] ?? ''), 'id' => (int) $pj['id']];
    }
    usort($timeline, static fn($a, $b) => strcmp((string) $b['t'], (string) $a['t']));

    $next = null;
    foreach ($leads as $l) {
        if (!empty($l['next_at']) && !in_array($l['stage'], ['won', 'lost'], true) && ($next === null || $l['next_at'] < $next['at'])) {
            $next = ['at' => $l['next_at'], 'type' => $l['next_type'], 'lead' => $l['id']];
        }
    }

    $kpis = [
            'lifetime' => 0, 'paid' => 0, 'balance' => 0, 'quoted' => 0, 'projects' => count($projects), 'last' => $timeline[0]['t'] ?? ($c['created_at'] ?? null),
        ];
    foreach ($invoices as $x) {
        $kpis['lifetime'] += (int) $x['total'];
        $kpis['paid'] += (int) $x['paid'];
        $kpis['balance'] += (int) $x['balance'];
    }
    foreach ($quotes as $x) {
        $kpis['quoted'] += (int) ($x['total'] ?? 0);
    }
    foreach (['lifetime', 'paid', 'balance', 'quoted'] as $k) {
        $kpis[$k . 'Display'] = wx_pkr_out((int) $kpis[$k]);
    }

    return ['data' => [
        'client' => wx_client_shape($c),
        'status' => wx_client_status($invoices, $projects, $leads),
        'kpis' => $kpis,
        'next' => $next,
        'leads' => $leads,
        'quotes' => $quotes,
        'invoices' => $invoices,
        'projects' => $projects,
        'timeline' => array_slice($timeline, 0, 300),
    ]];
}

/** POST /clients and PATCH /clients/{id} — one code path, so create and update cannot disagree. */
function wx_route_clients_save(array $ctx): array
{
    return wx_appr_route('client_save', $ctx, 'clients', 'wx_route_clients_save_do', static fn() => wx_route_clients_save_do($ctx));
}

function wx_route_clients_save_do(array $ctx): array
{
    $u = wx_require_user('client_save');
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : (int) ($ctx['body']['id'] ?? 0);

    return wx_guard('clients.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $raw = wx_v_pick($ctx['body'], WX_CLIENT_WRITABLE);
            $set = [];
            if (array_key_exists('name', $raw)) {
                $set['name'] = wx_v_string($raw['name'], 'name', 2, 120);
            }
            foreach (['phone' => 40, 'company' => 120, 'city' => 80, 'address' => 300, 'notes' => 4000, 'source' => 40, 'designation' => 80] as $f => $max) {
                if (array_key_exists($f, $raw)) {
                    $set[$f] = wx_v_opt_string($raw[$f], $f, $max);
                }
            }
            if (array_key_exists('email', $raw)) {
                $set['email'] = ($raw['email'] === null || $raw['email'] === '') ? null : wx_v_email($raw['email']);
            }
            if (array_key_exists('type', $raw)) {
                $set['type'] = ($raw['type'] === null || $raw['type'] === '') ? null : wx_v_enum($raw['type'], WX_CLIENT_TYPES, 'type');
            }
            if (array_key_exists('line', $raw)) {
                $set['line'] = ($raw['line'] === null || $raw['line'] === '') ? null : wx_v_enum($raw['line'], WX_CLIENT_LINES, 'line');
            }
            if (array_key_exists('tags', $raw)) {
                $tags = is_array($raw['tags']) ? $raw['tags'] : explode(',', (string) $raw['tags']);
                /* Twelve tags of thirty characters: enough for "investor, referral, DHA", short enough
                   that the column stays a label and not a second notes field. */
                $tags = array_slice(array_values(array_filter(array_map(static fn($t) => mb_strtolower(wx_v_string($t, 'tag', 1, 30)), $tags))), 0, 12);
                $set['tags'] = implode(',', $tags);
            }
            $set['updated_at'] = wx_now();

            if ($id > 0) {
                $before = wx_client_or_404($id);
                if (!isset($set['name']) && count($set) === 1) {
                    throw ApiError::validation('Nothing to change');
                }
                wx_update('wx_clients', $set, ['id' => $id]);
                wx_audit($u, 'client.update', 'client:' . $id, ['fields' => array_keys($set), 'name' => (string) ($set['name'] ?? $before['name'])]);
                $created = false;
            } else {
                if (!isset($set['name'])) {
                    throw ApiError::validation('Name is required', 'name');
                }
                $set['created_at'] = wx_now();
                $id = wx_insert('wx_clients', $set);
                wx_audit($u, 'client.create', 'client:' . $id, ['name' => $set['name'], 'source' => (string) ($set['source'] ?? '')]);
                $created = true;
            }

            $c = wx_client_or_404($id);
            return ['data' => [
                'client' => wx_client_shape($c),
                'created' => $created,
                /* Not a refusal — an offer. The screen shows these and a Merge button. */
                'duplicates' => wx_client_duplicates((string) $c['phone'], (string) $c['email'], $id),
            ]];
        });
    });
}

/**
 * DELETE /clients/{id} — refused while the client owns a document.
 *
 * v2.1 deleted the client, set `client_id` to NULL on its leads and left its quotations, invoices and
 * projects in place. The money stayed; the customer's name on it stopped being a link. That is not a
 * deletion, it is a books-keeping accident, so this refuses and says what to do instead.
 */
function wx_route_clients_delete(array $ctx): array
{
    return wx_appr_route('client_delete', $ctx, 'clients', 'wx_route_clients_delete_do', static fn() => wx_route_clients_delete_do($ctx));
}

function wx_route_clients_delete_do(array $ctx): array
{
    /* v2.1 required owner/admin for this one action even though it sits in the sales group; the
       role list says so, and the matrix's own `wx_action_roles` row is where that lives. */
    $u = wx_require_user('client_delete', ['owner', 'admin']);
    $id = (int) $ctx['params']['id'];

    return wx_guard('clients.delete', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($u, $id) {
            $c = wx_client_or_404($id);

            /* Counted the way the 360° page shows them — by `client_id` **and** by phone — so the
               refusal can never contradict the screen the person is looking at. Documents written
               before the client column existed are matched by phone; counting only the column would
               say "no documents" over a page listing three quotations. */
            [$quotes, $invoices, $projects] = wx_client_docs($c);
            $found = ['quotes' => count($quotes), 'invoices' => count($invoices), 'projects' => count($projects)];
            if (array_sum($found) > 0) {
                throw ApiError::conflict(
                    'This client has documents, so it cannot be deleted — merge it into another client instead',
                    $found
                );
            }

            /* Leads keep their history: the foreign key sets client_id to NULL, which is what the
               constraint in 004 is for. Nothing else references the row, so this delete is honest. */
            $leads = wx_update('wx_leads', ['client_id' => null], ['client_id' => $id]);
            wx_q('DELETE FROM wx_clients WHERE id = ?', [$id]);
            wx_audit($u, 'client.delete', 'client:' . $id, ['name' => (string) $c['name'], 'leadsUnlinked' => $leads]);
            return ['data' => ['id' => $id, 'leadsUnlinked' => $leads]];
        });
    });
}

/**
 * POST /clients/{id}/merge — keep one record, move everything from the duplicate onto it.
 *
 * Ported from `clients_merge`, with two additions: the documents' `client_id` column is updated as
 * well as the payload (v2.1 only rewrote the JSON, which is why a merged client could still reappear
 * in the old admin's lists), and the merge is audited with both names, because after it runs there is
 * only one of them left to look up.
 */
function wx_route_clients_merge(array $ctx): array
{
    return wx_appr_route('clients_merge', $ctx, 'clients', 'wx_route_clients_merge_do', static fn() => wx_route_clients_merge_do($ctx));
}

function wx_route_clients_merge_do(array $ctx): array
{
    $u = wx_require_user('clients_merge', ['owner', 'admin']);
    $keep = (int) ($ctx['params']['id'] ?? 0);
    $drop = (int) ($ctx['body']['mergeId'] ?? $ctx['body']['merge'] ?? 0);

    return wx_guard('clients.merge', static function () use ($ctx, $u, $keep, $drop) {
        return wx_tx(static function () use ($u, $keep, $drop) {
            if ($keep <= 0 || $drop <= 0 || $keep === $drop) {
                throw ApiError::validation('Pick two different clients', 'mergeId');
            }
            $a = wx_client_or_404($keep);
            $b = wx_client_or_404($drop);

            $moved = ['leads' => 0, 'quotes' => 0, 'invoices' => 0, 'projects' => 0];

            $moved['leads'] = wx_update('wx_leads', ['client_id' => $keep], ['client_id' => $drop]);

            foreach ([['wx_quotes', 'quotes'], ['wx_invoices', 'invoices']] as [$table, $key]) {
                foreach (wx_all('SELECT id, ' . wx_payload_column($table) . ' AS payload FROM `' . $table . '` WHERE client_id = ?', [$drop]) as $r) {
                    $moved[$key] += wx_update($table, ['client_id' => $keep], ['id' => (int) $r['id']]);
                }
                /* And the payload copy, for the documents that predate the column. */
                foreach (wx_all('SELECT id, ' . wx_payload_column($table) . ' AS payload FROM `' . $table . '`') as $r) {
                    $d = json_decode((string) $r['payload'], true);
                    if (!is_array($d) || (int) ($d['client_id'] ?? 0) !== $drop) {
                        continue;
                    }
                    $d['client_id'] = $keep;
                    wx_update($table, [wx_payload_column($table) => json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], ['id' => (int) $r['id']]);
                }
            }
            if (wx_column_exists('wx_projects', 'client_id')) {
                $moved['projects'] = wx_update('wx_projects', ['client_id' => $keep], ['client_id' => $drop]);
            }
            /* Bookings are deliberately not rewritten: they link to a client through their lead, and
               the leads moved above. wx_bookings has no client_id column, and inventing one would give
               a booking two parents to disagree about. */

            /* Fill the gaps on the survivor, then keep both notes — a merge that loses the only note
               about a client is how a merge becomes a data-loss incident with a friendly name. */
            $set = [];
            foreach (['phone', 'email', 'company', 'city', 'address', 'designation', 'source'] as $k) {
                if (trim((string) ($a[$k] ?? '')) === '' && trim((string) ($b[$k] ?? '')) !== '') {
                    $set[$k] = $b[$k];
                }
            }
            $notes = trim((string) ($a['notes'] ?? '') . "\n" . (string) ($b['notes'] ?? ''));
            $set['notes'] = $notes;
            $set['updated_at'] = wx_now();
            wx_update('wx_clients', $set, ['id' => $keep]);
            wx_q('DELETE FROM wx_clients WHERE id = ?', [$drop]);

            wx_audit($u, 'client.merge', 'client:' . $keep, ['kept' => (string) $a['name'], 'dropped' => (string) $b['name'], 'moved' => $moved]);
            return ['data' => ['id' => $keep, 'kept' => (string) $a['name'], 'dropped' => (string) $b['name'], 'moved' => $moved]];
        });
    });
}

/**
 * POST /clients/link — attach the leads and documents that name a client but are not linked to one.
 *
 * Ported from `p19c_link()`: last ten digits of the phone, or the email, decide. It exists because
 * both old admins created clients from forms and left the documents behind, and "why does this client
 * show no invoices" is a question with a one-click answer.
 */
function wx_route_clients_link(array $ctx): array
{
    return wx_appr_route('clients_link', $ctx, 'clients', 'wx_route_clients_link_do', static fn() => wx_route_clients_link_do($ctx));
}

function wx_route_clients_link_do(array $ctx): array
{
    $u = wx_require_user('clients_link');

    return wx_guard('clients.link', static function () use ($u) {
        return wx_tx(static function () use ($u) {
            $byPhone = [];
            $byEmail = [];
            foreach (wx_all('SELECT id, phone, email FROM wx_clients ORDER BY id') as $c) {
                $k = wx_client_phone_key($c['phone']);
                if ($k !== '' && !isset($byPhone[$k])) {
                    $byPhone[$k] = (int) $c['id'];
                }
                $e = strtolower(trim((string) $c['email']));
                if ($e !== '' && !isset($byEmail[$e])) {
                    $byEmail[$e] = (int) $c['id'];
                }
            }
            if (!$byPhone && !$byEmail) {
                return ['data' => ['linked' => ['leads' => 0, 'quotes' => 0, 'invoices' => 0, 'projects' => 0], 'note' => 'There are no clients to link to yet']];
            }
            $match = static function ($phone, $email) use ($byPhone, $byEmail): int {
                $k = wx_client_phone_key($phone);
                if ($k !== '' && isset($byPhone[$k])) {
                    return $byPhone[$k];
                }
                $e = strtolower(trim((string) $email));
                return ($e !== '' && isset($byEmail[$e])) ? $byEmail[$e] : 0;
            };

            $n = ['leads' => 0, 'quotes' => 0, 'invoices' => 0, 'projects' => 0];
            foreach (wx_all('SELECT id, phone, email FROM wx_leads WHERE client_id IS NULL LIMIT 5000') as $l) {
                $cid = $match($l['phone'], $l['email']);
                if ($cid > 0) {
                    wx_update('wx_leads', ['client_id' => $cid], ['id' => (int) $l['id']]);
                    $n['leads']++;
                }
            }
            foreach ([['wx_quotes', 'quotes'], ['wx_invoices', 'invoices'], ['wx_projects', 'projects']] as [$table, $key]) {
                $col = wx_payload_column($table);
                foreach (wx_all('SELECT id, ' . $col . ' AS payload FROM `' . $table . '` LIMIT 5000') as $r) {
                    $d = json_decode((string) $r['payload'], true);
                    if (!is_array($d) || !empty($d['client_id'])) {
                        continue;
                    }
                    $client = is_array($d['client'] ?? null) ? $d['client'] : [];
                    $cid = $match($client['phone'] ?? ($d['client_phone'] ?? ''), $client['email'] ?? '');
                    if ($cid === 0) {
                        continue;
                    }
                    $d['client_id'] = $cid;
                    wx_update($table, [$col => json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], ['id' => (int) $r['id']]);
                    if (wx_column_exists($table, 'client_id')) {
                        wx_update($table, ['client_id' => $cid], ['id' => (int) $r['id']]);
                    }
                    $n[$key]++;
                }
            }
            wx_audit($u, 'clients.link', 'clients', $n);
            return ['data' => ['linked' => $n]];
        });
    });
}

/**
 * GET /clients/{id}/comms — the conversations with this client: web chat and WhatsApp.
 *
 * Ported from `p19c_comms()`: matched on the phone or email on the chat, or on a lead that belongs to
 * this client. The Messages tab is how a salesperson answers "what did we already tell them".
 */
function wx_route_clients_comms(array $ctx): array
{
    wx_require_user('client_comms', ['owner', 'admin', 'sales']);
    $c = wx_client_or_404((int) $ctx['params']['id']);
    $cid = (int) $c['id'];
    if (!wx_table_exists('wx_chats')) {
        return ['data' => ['chats' => []]];
    }
    $key = wx_client_phone_key($c['phone'] ?? '');
    $email = strtolower(trim((string) ($c['email'] ?? '')));
    $leadIds = array_map('intval', array_column(wx_all('SELECT id FROM wx_leads WHERE client_id = ?', [$cid]), 'id'));

    $chats = [];
    $rows = wx_all('SELECT id, created_at, updated_at, name, phone, email, status, mode, channel, last_text, lead_id, unread, needs FROM wx_chats ORDER BY updated_at DESC LIMIT 500');
    foreach ($rows as $r) {
        $hit = ($key !== '' && wx_client_phone_key($r['phone'] ?? '') === $key)
            || ($email !== '' && strtolower(trim((string) ($r['email'] ?? ''))) === $email)
            || (!empty($r['lead_id']) && in_array((int) $r['lead_id'], $leadIds, true));
        if (!$hit) {
            continue;
        }
        $msgs = array_reverse(wx_all('SELECT t, who, name, text FROM wx_chat_msgs WHERE chat_id = ? ORDER BY id DESC LIMIT 6', [(int) $r['id']]));
        $chats[] = [
            'id' => (int) $r['id'],
            'channel' => (string) ($r['channel'] ?? 'web'),
            'status' => (string) $r['status'],
            'mode' => (string) ($r['mode'] ?? ''),
            'started' => $r['created_at'],
            'updated' => $r['updated_at'],
            'unread' => (int) ($r['unread'] ?? 0),
            'needs' => (int) ($r['needs'] ?? 0),
            'count' => (int) wx_val('SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id = ?', [(int) $r['id']]),
            'last' => $msgs,
        ];
        if (count($chats) >= 30) {
            break;
        }
    }
    return ['data' => ['chats' => $chats]];
}
