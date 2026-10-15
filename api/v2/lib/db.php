<?php
/**
 * api/v2/lib/db.php — PDO access, query helpers, transactions.
 *
 * Credentials stay in _private/db.json, exactly where v2.1 put them, because that file is already
 * protected and already provisioned on the live host. What changes is the failure mode: v2.1's
 * db() did `if (!$c) fail('Admin is not set up yet', 503)` — a missing *or unreadable* db.json both
 * became that bare 503. Here a missing config is UPSTREAM with a code, and a damaged one is
 * INTERNAL, so the two are never confused again.
 */

declare(strict_types=1);

/**
 * The one PDO handle for the request.
 */
function wx_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $store = new JsonStore(WX_DB_FILE, true);
    $cfg = $store->read();

    if (empty($cfg['name']) || empty($cfg['user'])) {
        throw new ApiError('UPSTREAM', 'The database is not configured yet', 503, null, ['missing' => 'db.json']);
    }
    $dsn = 'mysql:host=' . ($cfg['host'] ?: 'localhost') . ';dbname=' . $cfg['name'] . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, (string) $cfg['user'], (string) ($cfg['pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[wx-v2] connect failed: SQLSTATE ' . $e->getCode() . ' ' . $e->getMessage());
        // Never echo the driver message: it can name the user and the host.
        throw ApiError::upstream('The database is unreachable', ['sqlstate' => (string) $e->getCode()]);
    }
    return $pdo;
}

/** Prepared statement. Every query in v2 goes through this — no string interpolation of input. */
function wx_q(string $sql, array $params = []): PDOStatement
{
    try {
        $st = wx_db()->prepare($sql);
        $st->execute($params);
        return $st;
    } catch (PDOException $e) {
        error_log('[wx-v2] query failed: ' . $e->getMessage() . ' | ' . preg_replace('~\s+~', ' ', substr($sql, 0, 200)));
        throw ApiError::internal('The database could not complete that request', ['sqlstate' => (string) $e->getCode()]);
    }
}

function wx_all(string $sql, array $params = []): array
{
    return wx_q($sql, $params)->fetchAll();
}

function wx_one(string $sql, array $params = []): ?array
{
    $row = wx_q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function wx_val(string $sql, array $params = [])
{
    $v = wx_q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

function wx_count(string $sql, array $params = []): int
{
    return (int) wx_val($sql, $params);
}

/**
 * Run $fn inside a transaction. Rolls back on any throw, including a refusal, and re-throws.
 */
function wx_tx(callable $fn)
{
    $pdo = wx_db();
    $own = !$pdo->inTransaction();
    if ($own) {
        $pdo->beginTransaction();
    }
    try {
        $result = $fn($pdo);
        if ($own) {
            $pdo->commit();
        }
        return $result;
    } catch (Throwable $e) {
        if ($own && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * A table name, checked before it is concatenated into SQL.
 *
 * Every call site passes a literal today, so this never fires — which is exactly the point. The day
 * someone writes wx_insert($table, …) with a name that came off a request, the name is refused here
 * instead of being pasted into a statement. Table names cannot be bound as parameters, so a check is
 * the only guard available.
 */
function wx_table_name(string $table): string
{
    if ($table === '' || !preg_match('~^[a-z][a-z0-9_]{2,64}$~', $table)) {
        throw ApiError::internal('Refused an invalid table name');
    }
    return $table;
}

/** INSERT from a column=>value map, returning the new id. */
function wx_insert(string $table, array $row): int
{
    wx_table_name($table);
    $cols = array_keys($row);
    $sql = 'INSERT INTO `' . $table . '` (' . implode(',', array_map(static function ($c) { return '`' . $c . '`'; }, $cols)) . ')'
        . ' VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    wx_q($sql, array_values($row));
    return (int) wx_db()->lastInsertId();
}

/**
 * UPDATE from column=>value maps. Refuses to run without a WHERE clause: an unqualified UPDATE is a
 * typo that empties a table, and this is the one place it could still happen.
 */
function wx_update(string $table, array $set, array $where): int
{
    wx_table_name($table);
    if (!$set || !$where) {
        throw ApiError::internal('Refused an unbounded UPDATE on ' . $table);
    }
    $parts = [];
    $params = [];
    foreach ($set as $c => $v) {
        $parts[] = '`' . $c . '`=?';
        $params[] = $v;
    }
    $conds = [];
    foreach ($where as $c => $v) {
        $conds[] = '`' . $c . '`=?';
        $params[] = $v;
    }
    return wx_q('UPDATE `' . $table . '` SET ' . implode(',', $parts) . ' WHERE ' . implode(' AND ', $conds), $params)->rowCount();
}

function wx_table_exists(string $table): bool
{
    wx_table_name($table);
    static $cache = [];
    if (!array_key_exists($table, $cache)) {
        $cache[$table] = (bool) wx_val('SHOW TABLES LIKE ?', [$table]);
    }
    return $cache[$table];
}

function wx_column_exists(string $table, string $column): bool
{
    $row = wx_one(
        'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        [$table, $column]
    );
    return ((int) ($row['n'] ?? 0)) > 0;
}

/** A row keyed by id, for in-request joins that would otherwise be N+1. */
function wx_index_by(array $rows, string $key): array
{
    $out = [];
    foreach ($rows as $r) {
        $out[(string) $r[$key]] = $r;
    }
    return $out;
}

function wx_now(): string
{
    return date('Y-m-d H:i:s');
}

/** Bytes-friendly page size: clamps to 1..200 with a default, so a client cannot ask for 1e9 rows. */
function wx_limit($raw, int $default = 50, int $max = 200): int
{
    $n = (int) $raw;
    if ($n <= 0) {
        $n = $default;
    }
    return min($n, $max);
}

function wx_offset($raw): int
{
    $n = (int) $raw;
    return $n > 0 ? $n : 0;
}
