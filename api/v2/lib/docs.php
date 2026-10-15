<?php
/**
 * api/v2/lib/docs.php — reading and writing the JSON documents in wx_quotes / wx_invoices / wx_projects.
 *
 * v2.1 kept these as a LONGTEXT `data` column plus two or three indexed key columns, and its helpers
 * (`doc_all`, `doc_get`, `doc_put`) re-read and re-wrote the entire document for every change. That is
 * why two people editing one quotation lost each other's work: the second write replaced the whole
 * payload with a copy taken before the first one landed.
 *
 * Migration 003 adds real columns beside the JSON and renames `data` to `payload`. Until a host has
 * run it, the old column name has to keep working — so the column name is resolved once per request
 * rather than assumed, and every write updates the indexed columns in the same statement as the
 * payload. What is *not* fixed here is the lost-update window: that needs row locking, and it is done
 * in the routes with `FOR UPDATE` inside a transaction.
 */

declare(strict_types=1);

/** Which tables this layer serves, and the indexed columns each one keeps beside the JSON. */
const WX_DOC_TABLES = [
    'wx_quotes' => ['key' => 'no', 'columns' => ['no', 'status', 'client_id', 'project', 'subtotal', 'tax', 'total', 'currency', 'issued_at', 'valid_until', 'pdf_sha256']],
    'wx_invoices' => ['key' => 'no', 'columns' => ['no', 'quote_id', 'client_id', 'project', 'subtotal', 'tax', 'total', 'paid', 'currency', 'issued_at', 'due_at', 'pdf_sha256']],
    /* Templates are documents too, and v2.1's `doc_put()` wrote them the same way: the JSON is the template,
       the name is mirrored into the UNIQUE column the list is ordered by. No totals are indexed — a
       template's total is derived when it is read (wx_tpl_row), because a template is a shape, not a bill. */
    'wx_templates' => ['key' => 'name', 'columns' => ['name']],
];

/**
 * The payload column's name on this install: `payload` after migration 003, `data` before it.
 * Cached per request.
 */
/**
 * The indexed columns beside a project's JSON document, taken from that document.
 *
 * Migration 003 added `no`, `client_id`, `stage`, `value`, `invoice_id`, `target` and `quote_id` to wx_projects so
 * the project list can filter and sort without decoding every row. Those columns are only useful if they are
 * written with the document: a project saved without them is invisible to its own stage and client filters. Any
 * column the table does not have is left out, so a host that has not run migration 003 still works.
 *
 * @param array<string,mixed> $p the project document as it is about to be stored
 * @return array<string,mixed>
 */
function wx_project_columns(array $p): array
{
    $values = [
        'no' => isset($p['no']) && $p['no'] !== '' ? (string) $p['no'] : null,
        'client_id' => (int) ($p['client_id'] ?? 0) ?: null,
        'stage' => isset($p['stage']) && $p['stage'] !== '' ? (string) $p['stage'] : null,
        'value' => isset($p['value']) ? (int) $p['value'] : null,
        'invoice_id' => (int) ($p['invoice_id'] ?? 0) ?: null,
        'target' => isset($p['target']) && $p['target'] !== '' ? (string) $p['target'] : null,
        'quote_id' => (int) ($p['quote_id'] ?? 0) ?: null,
    ];
    $out = [];
    foreach ($values as $col => $v) {
        if (wx_column_exists('wx_projects', $col)) {
            $out[$col] = $v;
        }
    }
    return $out;
}

function wx_payload_column(string $table): string
{
    $key = 'payload_column:' . $table;
    return wx_once($key, static function () use ($table): string {
        if (wx_column_exists($table, 'payload')) {
            return 'payload';
        }
        if (wx_column_exists($table, 'data')) {
            return 'data';
        }
        throw ApiError::internal('Neither payload nor data exists on ' . $table . ' — is the schema from this product?');
    });
}

/**
 * The payload column, aliased back to `payload`, for the SQL that has to name it by hand.
 *
 * Every screen that lists documents selects this column; naming it literally is how a query works on a
 * converted host and throws "Unknown column 'payload'" on the live one, where the column is still
 * `data` until the cleanup phase. There is one place that knows the name (wx_payload_column()), and this
 * is the only string builder that pastes it into a query.
 */
function wx_doc_payload_sql(string $table, string $alias = '', string $as = 'payload'): string
{
    $col = '`' . wx_payload_column($table) . '`';
    return ($alias !== '' ? $alias . '.' : '') . $col . ' AS `' . $as . '`';
}

/** A JSON expression over the payload column, for filter, sort and search clauses. `$path` is a literal from our own code. */
function wx_doc_json(string $table, string $path, bool $unquote = true): string
{
    $col = '`' . wx_payload_column($table) . '`';
    $extract = 'JSON_EXTRACT(' . $col . ", '" . $path . "')";
    return $unquote ? 'JSON_UNQUOTE(' . $extract . ')' : $extract;
}

/** One document, decoded, with its id and the indexed columns merged in. */
function wx_doc_get(string $table, int $id, bool $forUpdate = false): ?array
{
    if (!isset(WX_DOC_TABLES[$table])) {
        throw ApiError::internal('Unknown document table: ' . $table);
    }
    $col = wx_payload_column($table);
    $row = wx_one('SELECT id, ' . $col . ' AS payload FROM `' . $table . '` WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$id]);
    if ($row === null) {
        return null;
    }
    $payload = json_decode((string) $row['payload'], true);
    if (!is_array($payload)) {
        // A document that will not decode is a corrupted record, not an empty one. Say so: a quotation
        // that silently becomes {} would be re-saved as an empty document, destroying the real one.
        throw ApiError::internal('Document ' . $table . '#' . $id . ' is not valid JSON', ['table' => $table, 'id' => $id]);
    }
    $payload['id'] = (int) $id;
    return $payload;
}

/**
 * A raw JSON row from a table this layer does not fully manage (wx_projects, wx_templates).
 *
 * Projects keep their document in `payload` with no indexed columns beside it, and the v2.1 screens
 * read fields this layer has no opinion about — so the payload is decoded and handed back whole.
 */
function wx_doc_get_row(string $table, int $id, bool $forUpdate = false): ?array
{
    if (!preg_match('~^wx_[a-z_]+$~', $table)) {
        throw ApiError::internal('Refusing to read an unexpected table: ' . $table);
    }
    $col = wx_column_exists($table, 'payload') ? 'payload' : (wx_column_exists($table, 'data') ? 'data' : null);
    if ($col === null) {
        throw ApiError::internal('Neither payload nor data exists on ' . $table);
    }
    $row = wx_one('SELECT id, ' . $col . ' AS payload FROM `' . $table . '` WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$id]);
    if ($row === null) {
        return null;
    }
    $payload = json_decode((string) $row['payload'], true);
    if (!is_array($payload)) {
        throw ApiError::internal('Row ' . $table . '#' . $id . ' is not valid JSON', ['table' => $table, 'id' => $id]);
    }
    $payload['id'] = (int) $id;
    return $payload;
}

/**
 * Write a document. The payload and the indexed columns move together, so the columns can never
 * disagree with the JSON they summarise.
 *
 * @param array $columns extra values to sync (already computed, e.g. totals from wx_doc_totals)
 */
function wx_doc_put(string $table, array $payload, array $columns = []): array
{
    $spec = WX_DOC_TABLES[$table];
    $col = wx_payload_column($table);
    $id = (int) ($payload['id'] ?? 0);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw ApiError::internal('Could not encode the document', ['json_error' => json_last_error_msg()]);
    }

    // Only sync a column the table actually has: a host that has not run migration 003 must still work.
    $sync = [];
    foreach ($columns as $name => $value) {
        if ($name !== $col && in_array($name, $spec['columns'], true) && wx_column_exists($table, $name)) {
            $sync[$name] = $value;
        }
    }

    if ($id > 0) {
        wx_update($table, [$col => $json] + $sync, ['id' => $id]);
        return $payload;
    }
    $payload['id'] = wx_insert($table, [$col => $json] + $sync);
    return $payload;
}

/** The indexed columns derived from a document payload, for wx_doc_put(). */
function wx_doc_columns(string $table, array $d): array
{
    if ($table === 'wx_quotes') {
        return [
            'no' => (string) $d['no'],
            'status' => (string) $d['status'],
            'client_id' => isset($d['client_id']) ? (int) $d['client_id'] : null,
            'project' => (string) ($d['project'] ?? ''),
            'subtotal' => (int) $d['subtotal'],
            'tax' => (int) $d['tax'],
            'total' => (int) $d['total'],
            'currency' => (string) ($d['currency'] ?? 'PKR'),
            'issued_at' => ($d['issue_date'] ?? '') !== '' ? (string) $d['issue_date'] . ' 00:00:00' : null,
            'valid_until' => ($d['valid_until'] ?? '') !== '' ? (string) $d['valid_until'] : null,
        ];
    }
    if ($table === 'wx_invoices') {
        return [
            'no' => (string) $d['no'],
            'quote_id' => isset($d['quote_id']) ? (int) $d['quote_id'] : null,
            'client_id' => isset($d['client_id']) ? (int) $d['client_id'] : null,
            'project' => (string) ($d['project'] ?? ''),
            'subtotal' => (int) $d['subtotal'],
            'tax' => (int) $d['tax'],
            'total' => (int) $d['total'],
            'paid' => (int) ($d['paid'] ?? 0),
            'currency' => (string) ($d['currency'] ?? 'PKR'),
            'issued_at' => ($d['issue_date'] ?? '') !== '' ? (string) $d['issue_date'] . ' 00:00:00' : null,
            'due_at' => ($d['due_date'] ?? '') !== '' ? (string) $d['due_date'] : null,
        ];
    }
    return [];
}

/**
 * A page of documents with their totals, without decoding the payload of every row for a list view.
 *
 * v2.1's `doc_all()` pulled every document into PHP and mapped over it — for the invoice tracker that
 * is every invoice ever issued, every time the screen loads. Here the page is taken by SQL and the
 * payload is only decoded for the rows being returned, which is the same page size the screen shows.
 */
function wx_doc_page(string $table, array $filter = [], int $limit = 50, int $offset = 0, string $order = 'id DESC'): array
{
    $col = wx_payload_column($table);
    $where = [];
    $params = [];
    if (!empty($filter['status']) && wx_column_exists($table, 'status')) {
        $where[] = 'status = ?';
        $params[] = (string) $filter['status'];
    }
    if (!empty($filter['client_id']) && wx_column_exists($table, 'client_id')) {
        $where[] = 'client_id = ?';
        $params[] = (int) $filter['client_id'];
    }
    if (!empty($filter['q'])) {
        $like = '%' . (string) $filter['q'] . '%';
        $where[] = '(no LIKE ? OR ' . $col . ' LIKE ?)';
        $params[] = $like;
        $params[] = $like;
    }
    $sqlWhere = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $total = (int) wx_val('SELECT COUNT(*) FROM `' . $table . '`' . $sqlWhere, $params);
    $rows = wx_all(
        'SELECT id, ' . $col . ' AS payload FROM `' . $table . '`' . $sqlWhere . ' ORDER BY ' . $order . ' LIMIT ' . $limit . ' OFFSET ' . $offset,
        $params
    );
    $out = [];
    foreach ($rows as $row) {
        $payload = json_decode((string) $row['payload'], true);
        if (!is_array($payload)) {
            continue;
        }
        $payload['id'] = (int) $row['id'];
        $out[] = $payload;
    }
    return ['rows' => $out, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}

/**
 * Reserve the next document number.
 *
 * Two series, exactly as v2.1 has them, because the numbers are on printed documents that clients
 * hold: the main **WI-** series (quotations and every non-furniture invoice) and the **WF-** series
 * for the furniture line, which counts from 10050 on its own. `company.nextNo` and `company.wfNext`
 * are the counters; `s17_inv_no()` used a file lock on `_private/company.json` for the same job.
 *
 * v2.1 also looped until it found a number no quotation or invoice had used, because its counters
 * lived in a file that a restore could roll back. That check is kept — a rolled-back counter must not
 * hand a client an invoice number that already exists.
 *
 * @param string $line the business line: 'furniture' takes the WF- series, anything else WI-
 */
function wx_next_doc_no(string $line = '', int $maxTries = 500): string
{
    $setting = $line === 'furniture' ? 'company.wfNext' : 'company.nextNo';
    $prefixSetting = $line === 'furniture' ? 'company.wfPrefix' : 'company.prefix';
    $floor = $line === 'furniture' ? 10050 : 10100;

    for ($i = 0; $i < $maxTries; $i++) {
        $no = wx_tx(static function () use ($setting, $prefixSetting, $floor): string {
            $prefix = (string) (wx_val('SELECT v FROM wx_settings WHERE k = ?', [$prefixSetting]) ?? ($prefixSetting === 'company.wfPrefix' ? 'WF-' : 'WI-'));
            if ($prefix === '') {
                wx_setting_set($prefixSetting, $prefix = ($prefixSetting === 'company.wfPrefix' ? 'WF-' : 'WI-'));
            }
            $next = max($floor, (int) (wx_val('SELECT v FROM wx_settings WHERE k = ?', [$setting]) ?? $floor));
            // Reserve with a conditional update: it only lands if the counter is still what we read.
            $affected = wx_q('UPDATE wx_settings SET v = ? WHERE k = ? AND v = ?', [(string) ($next + 1), $setting, (string) $next])->rowCount();
            if ($affected === 0) {
                $next = max($floor, (int) (wx_val('SELECT v FROM wx_settings WHERE k = ?', [$setting]) ?? $floor));
                wx_setting_set($setting, (string) ($next + 1));
            }
            return $prefix . $next;
        });
        $taken = wx_val('SELECT no FROM wx_invoices WHERE no = ?', [$no]) ?? wx_val('SELECT no FROM wx_quotes WHERE no = ?', [$no]);
        if ($taken === null) {
            return $no;
        }
        // v2.1 searched the quote payload for the number too; a quotation's `no` column is indexed now.
    }
    throw ApiError::conflict('Could not find a free document number — check the next number in Company settings');
}

/** Company identity for documents. Same keys as v2.1's company_cfg() so the print pages port over. */
function wx_company(): array
{
    static $c = null;
    if ($c !== null) {
        return $c;
    }
    $defaults = [
        'name' => 'Woodex Interior',
        'tagline' => 'Design · Build · Furniture',
        'address' => 'M-71, Zainab Tower, Model Town Link Road, Lahore',
        'phones' => '+92 322 4000768',
        'email' => 'info@woodex.com.pk',
        'web' => 'woodex.com.pk',
        'prefix' => 'WI-',
        'nextNo' => 10100,
        'wfPrefix' => 'WF-',
        'wfNext' => 10050,
        'validDays' => 15,
        'signName' => 'Imtiaz Ahmad',
        'signTitle' => 'Director',
    ];
    $c = $defaults;
    try {
        foreach (wx_all("SELECT k, v FROM wx_settings WHERE k LIKE 'company.%'") as $r) {
            $key = substr((string) $r['k'], strlen('company.'));
            $c[$key] = (string) $r['v'];
        }
        $c['nextNo'] = (int) $c['nextNo'];
        $c['validDays'] = (int) $c['validDays'];
    } catch (Throwable $e) {
        // Settings are an enhancement; the defaults always form a valid document header.
    }
    return $c;
}

/**
 * Find or create the client a document belongs to.
 *
 * v2.1 did this inline in two places (quote_invoice and proj_bill) with the same rule: match the phone
 * digits first, then the email; create one only if neither matched. Two copies of that rule is how a
 * migration ends up with duplicate clients, so it is one function here and both callers use it.
 *
 * The inserted columns are v2.1's exactly — name, phone, email, company, city, address, notes,
 * created_at. Nothing is invented: a client's `type` is a question for a person, not for a conversion.
 *
 * @return int the client id
 */
function wx_client_for(array $client, ?int $clientId, array $u): int
{
    if ($clientId && wx_val('SELECT id FROM wx_clients WHERE id = ?', [$clientId]) !== null) {
        return $clientId;
    }
    $digits = (string) preg_replace('~\D~', '', (string) ($client['phone'] ?? ''));
    $email = trim((string) ($client['email'] ?? ''));
    if ($digits !== '' || $email !== '') {
        foreach (wx_all('SELECT id, phone, email FROM wx_clients') as $c) {
            $samePhone = $digits !== '' && (string) preg_replace('~\D~', '', (string) $c['phone']) === $digits;
            $sameEmail = $email !== '' && strtolower(trim((string) $c['email'])) === strtolower($email);
            if ($samePhone || $sameEmail) {
                return (int) $c['id'];
            }
        }
    }
    $id = wx_insert('wx_clients', [
        'name' => (string) ($client['name'] ?? '') ?: 'Unnamed client',
        'phone' => (string) ($client['phone'] ?? ''),
        'email' => (string) $email,
        'company' => (string) ($client['company'] ?? ''),
        'city' => 'Lahore',
        'address' => (string) ($client['address'] ?? ''),
        'notes' => '',
        'created_at' => wx_now(),
    ]);
    wx_audit($u, 'client.create', 'client:' . $id, ['name' => (string) ($client['name'] ?? '')]);
    return $id;
}

/** A history entry, the same shape v2.1 appends to every document. */
function wx_hist(array $user, string $text): array
{
    return ['t' => wx_now(), 'user' => (string) $user['name'], 'text' => $text];
}
