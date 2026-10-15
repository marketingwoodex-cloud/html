<?php
/**
 * api/v2/lib/sqlite.php — run api/v2 on SQLite, as well as MySQL.
 *
 * Why this exists: the schema and every query in v2 were written for MySQL 8 (the Hostinger host). The
 * sandbox this project is developed in has no MySQL and no root to install one, but it does have PHP 8.2
 * (WebAssembly, see tools/phpwasm) with pdo_sqlite. So the same code runs on either engine, selected in
 * _private/db.json:
 *
 *     { "driver": "sqlite", "file": "woodex.sqlite" }      development, and any host without MySQL
 *     { "host": "...", "name": "...", "user": "...", "pass": "..." }   MySQL, the default (unchanged)
 *
 * Nothing in the business logic branches on the driver. The differences are handled here, in three places:
 *
 *   1. wx_sql_sqlite()     rewrites the MySQL-only *query* syntax v2 uses (NOW(), FOR UPDATE, INSERT IGNORE,
 *                          SHOW TABLES LIKE, information_schema, JSON_UNQUOTE, TRUNCATE, INTERVAL … DAY).
 *   2. wx_sqlite_plan()    rewrites the MySQL *schema* (CREATE TABLE with inline INDEX clauses, AUTO_INCREMENT,
 *                          ENUM, ENGINE=…, the PREPARE/EXECUTE guards the migrations use) into SQLite.
 *   3. wx_sqlite_open()    opens the file, registers the MySQL functions SQLite lacks, and provides
 *                          information_schema as wx_info_* views so the column/table checks still answer.
 *
 * What is deliberately NOT carried over: foreign keys (004_fk.sql). SQLite can enforce them, but the
 * ordering rules differ and the sandbox is for developing screens, not for proving the constraints; the
 * MySQL host keeps them. Every skipped statement is reported by wx_sqlite_plan() so nothing vanishes silently.
 */

declare(strict_types=1);

/* ------------------------------------------------------------------ open */

/**
 * Open the SQLite database. Called by wx_db() when _private/db.json says driver=sqlite.
 */
function wx_sqlite_open(array $cfg): PDO
{
    $file = (string) ($cfg['file'] ?? 'woodex.sqlite');
    // A relative name lives beside db.json, in _private/. An absolute path is taken as it is.
    $path = ($file !== '' && $file[0] === '/') || preg_match('~^[A-Za-z]:[\\\\/]~', $file)
        ? $file
        : WX_PRIVATE_DIR . '/' . $file;
    $dir = dirname($path);
    if (!is_dir($dir)) {
        throw ApiError::upstream('The SQLite database folder does not exist', ['missing' => 'folder']);
    }
    try {
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[wx-v2] sqlite open failed: ' . $e->getMessage());
        throw ApiError::upstream('The database is unreachable', ['driver' => 'sqlite']);
    }
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = OFF');

    /* MySQL functions that SQLite does not have. The callbacks are pure, so a request can call them freely. */
    $pdo->sqliteCreateFunction('NOW', static fn(): string => date('Y-m-d H:i:s'), 0);
    $pdo->sqliteCreateFunction('CURDATE', static fn(): string => date('Y-m-d'), 0);
    $pdo->sqliteCreateFunction('DATABASE', static fn(): string => 'woodex', 0);
    $pdo->sqliteCreateFunction('JSON_UNQUOTE', static fn($v) => $v, 1);
    /* FIELD(x, a, b, c) is MySQL's position of x in the list, 0 when absent — used to order by role. */
    $pdo->sqliteCreateFunction('FIELD', static function ($needle, ...$list): int {
        $i = array_search((string) $needle, array_map('strval', $list), true);
        return $i === false ? 0 : $i + 1;
    }, -1);
    /* FIND_IN_SET(x, 'a,b,c') is 1-based position, 0 when absent — tag filters on the inbox and clients. */
    $pdo->sqliteCreateFunction('FIND_IN_SET', static function ($needle, $csv): int {
        $i = array_search((string) $needle, explode(',', (string) $csv), true);
        return $i === false ? 0 : $i + 1;
    }, 2);
    $pdo->sqliteCreateFunction('wx_days_ago', static fn($n): string => date('Y-m-d H:i:s', time() - 86400 * (int) $n), 1);

    /* information_schema, as views in main (an attached schema cannot read main, so the rewrite in
       wx_sql_sqlite() turns information_schema.x into wx_info_x). */
    $pdo->exec("CREATE VIEW IF NOT EXISTS wx_info_tables AS
        SELECT name AS table_name, 'woodex' AS table_schema, 0 AS table_rows, 0 AS data_length
        FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    $pdo->exec("CREATE VIEW IF NOT EXISTS wx_info_columns AS
        SELECT m.name AS table_name, p.name AS column_name, 'woodex' AS table_schema
        FROM sqlite_master m JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'");
    $pdo->exec("CREATE VIEW IF NOT EXISTS wx_info_statistics AS
        SELECT m.name AS table_name, i.name AS index_name, 'woodex' AS table_schema
        FROM sqlite_master m JOIN pragma_index_list(m.name) i
        WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'");
    return $pdo;
}

/* ------------------------------------------------------------------ query translation */

/**
 * Rewrite one MySQL query into SQLite. Parameters keep their order, so `?` placeholders are untouched.
 */
function wx_sql_sqlite(string $sql): string
{
    if (preg_match('~^\s*SHOW\s+TABLES\s+LIKE\s+\?\s*$~i', $sql)) {
        return "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?";
    }
    /* The literal form, `SHOW TABLES LIKE 'wx\_%'` — connectors.php enumerates the tables this way, and the
       parameterised branch above did not catch it, so the query reached SQLite and failed with
       `near "SHOW": syntax error` (seen in this run of the suite). MySQL's backslash escapes the
       underscore, so the pattern means "names starting wx_"; SQLite treats `_` as a single-character
       wildcard and has no backslash escape without an ESCAPE clause, so the escape is stripped and the
       wildcard left to do the same job. A table name one character off `wx_` would also match — which is
       why this lives in the development shim and not in production SQL. */
    if (preg_match("~^\s*SHOW\s+TABLES\s+LIKE\s+'([^']*)'\s*$~i", $sql, $m)) {
        $pattern = str_replace('\_', '_', $m[1]);
        return "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '" . str_replace("'", "''", $pattern) . "'";
    }
    $s = $sql;
    $s = (string) preg_replace('~information_schema\.~i', 'wx_info_', $s);
    $s = (string) preg_replace('~\s+FOR\s+UPDATE\b~i', '', $s);
    $s = (string) preg_replace('~^\s*INSERT\s+IGNORE\s+INTO\b~i', 'INSERT OR IGNORE INTO', $s);
    $s = (string) preg_replace('~^\s*TRUNCATE\s+(?:TABLE\s+)?~i', 'DELETE FROM ', $s);
    $s = (string) preg_replace('~DATE_SUB\(\s*NOW\(\)\s*,\s*INTERVAL\s+(\?|\d+)\s+DAY\s*\)~i', 'wx_days_ago($1)', $s);
    $s = (string) preg_replace('~\bCURRENT_TIMESTAMP\(\)~i', 'CURRENT_TIMESTAMP', $s);
    $s = (string) preg_replace('~\bAS\s+SIGNED(?:\s+INTEGER)?\s*\)~i', 'AS INTEGER)', $s);
    return $s;
}

/* ------------------------------------------------------------------ schema translation */

/**
 * Turn a planned list of MySQL migration/dump statements into the SQLite statements to run, in order.
 *
 * The migrations guard their DDL with `SET @sql = IF(<information_schema check>, '<ALTER …>', 'DO 0')`
 * followed by PREPARE/EXECUTE/DEALLOCATE. SQLite has none of that, so the guard is dropped and the ALTER
 * inside it is emitted directly; wx_migrate_run() then skips a column that already exists.
 *
 * Returns the SQLite statements. `$skipped` collects what was not carried over, with the reason.
 */
function wx_sqlite_plan(array $stmts, array &$skipped = []): array
{
    $out = [];
    $n = count($stmts);
    for ($i = 0; $i < $n; $i++) {
        $s = trim((string) $stmts[$i]);
        if ($s === '') {
            continue;
        }
        if (preg_match('~^SET\s+@sql\s*=\s*IF\s*\(~i', $s)) {
            $inner = wx_sqlite_guard_literal($s);
            // The guard's PREPARE / EXECUTE / DEALLOCATE follow it; they are part of the same unit.
            while ($i + 1 < $n && preg_match('~^(PREPARE|EXECUTE|DEALLOCATE)\b~i', trim((string) $stmts[$i + 1]))) {
                $i++;
            }
            if ($inner === null || preg_match('~^DO\s+0$~i', $inner)) {
                continue;
            }
            foreach (wx_sqlite_stmt($inner, $skipped) as $x) {
                $out[] = $x;
            }
            continue;
        }
        if (preg_match('~^(SET|PREPARE|EXECUTE|DEALLOCATE)\b~i', $s)) {
            continue; // SET NAMES, stray session variables: MySQL client state with no SQLite meaning.
        }
        foreach (wx_sqlite_stmt($s, $skipped) as $x) {
            $out[] = $x;
        }
    }
    return $out;
}

/** The statement a guard would have run: the first string literal that starts with a SQL verb. */
function wx_sqlite_guard_literal(string $s): ?string
{
    if (preg_match_all("~'((?:[^']|'')*)'~", $s, $m)) {
        foreach ($m[1] as $lit) {
            $sql = str_replace("''", "'", $lit);
            if (preg_match('~^\s*(ALTER|CREATE|INSERT|UPDATE|DELETE|DROP|DO)\b~i', $sql)) {
                return $sql;
            }
        }
    }
    return null;
}

/** One MySQL statement into zero or more SQLite statements. */
function wx_sqlite_stmt(string $s, array &$skipped): array
{
    $s = trim($s);
    if (preg_match('~^CREATE\s+TABLE\b~i', $s)) {
        return wx_sqlite_create_table($s, $skipped);
    }
    if (preg_match('~^ALTER\s+TABLE\s+`?(\w+)`?\s+(.*)$~is', $s, $m)) {
        return wx_sqlite_alter($m[1], trim($m[2]), $s, $skipped);
    }
    if (preg_match('~^CREATE\s+(UNIQUE\s+)?INDEX\s+~i', $s)) {
        return [(string) preg_replace('~^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s)~i', 'CREATE $1INDEX IF NOT EXISTS ', $s)];
    }
    if (preg_match('~\bON\s+DUPLICATE\s+KEY\b~i', $s)) {
        // The dump's default sign-in row is the one case: it is not imported, and db/owner.php makes the account.
        $skipped[] = 'not carried over to SQLite (upsert): ' . substr(preg_replace('~\s+~', ' ', $s), 0, 90);
        return [];
    }
    if (preg_match('~^(INSERT|REPLACE|UPDATE|DELETE|SELECT)\b~i', $s)) {
        return [wx_sql_sqlite($s)];
    }
    $skipped[] = 'not carried over to SQLite: ' . substr(preg_replace('~\s+~', ' ', $s), 0, 90);
    return [];
}

/** CREATE TABLE: columns, with inline INDEX/KEY clauses moved to CREATE INDEX statements. */
function wx_sqlite_create_table(string $s, array &$skipped): array
{
    if (!preg_match('~^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(~i', $s, $m, PREG_OFFSET_CAPTURE)) {
        $skipped[] = 'unrecognised CREATE TABLE';
        return [];
    }
    $table = $m[2][0];
    $open = $m[0][1] + strlen($m[0][0]) - 1;
    $close = wx_sqlite_matching_paren($s, $open);
    if ($close < 0) {
        $skipped[] = 'unbalanced CREATE TABLE ' . $table;
        return [];
    }
    $body = substr($s, $open + 1, $close - $open - 1);
    $cols = [];
    $indexes = [];
    foreach (wx_sqlite_split_top($body) as $def) {
        $def = trim($def);
        if ($def === '') {
            continue;
        }
        if (preg_match('~^(UNIQUE\s+)?(?:KEY|INDEX)\s*`?(\w*)`?\s*\(([^)]*)\)~i', $def, $im)) {
            $indexes[] = [!empty($im[1]), $im[2] ?? '', $im[3]];
            continue;
        }
        if (preg_match('~^(CONSTRAINT|FOREIGN\s+KEY)\b~i', $def)) {
            $skipped[] = 'foreign key on ' . $table . ' not carried over (the MySQL host keeps it)';
            continue;
        }
        if (preg_match('~^PRIMARY\s+KEY\s*\(~i', $def)) {
            $cols[] = $def;
            continue;
        }
        $cols[] = wx_sqlite_column($def);
    }
    $out = ['CREATE TABLE IF NOT EXISTS ' . $table . " (\n  " . implode(",\n  ", $cols) . "\n)"];
    foreach ($indexes as [$unique, $name, $colList]) {
        $out[] = wx_sqlite_index($table, $unique, $name, $colList);
    }
    return $out;
}

/** ALTER TABLE: ADD COLUMN, ADD INDEX/KEY, ADD UNIQUE; anything else is reported, not guessed at. */
function wx_sqlite_alter(string $table, string $rest, string $whole, array &$skipped): array
{
    if (preg_match('~^ADD\s+COLUMN\s+(.+)$~is', $rest, $m)) {
        $def = (string) preg_replace('~\s+AFTER\s+`?\w+`?\s*$~i', '', trim($m[1]));
        return ['ALTER TABLE ' . $table . ' ADD COLUMN ' . wx_sqlite_column($def)];
    }
    if (preg_match('~^ADD\s+(UNIQUE\s+)?(?:KEY|INDEX)\s*`?(\w*)`?\s*\(([^)]*)\)\s*$~i', $rest, $m)) {
        return [wx_sqlite_index($table, !empty($m[1]), $m[2] ?? '', $m[3])];
    }
    if (preg_match('~^ADD\s+(CONSTRAINT|FOREIGN\s+KEY)~i', $rest)) {
        $skipped[] = 'foreign key on ' . $table . ' not carried over (the MySQL host keeps it)';
        return [];
    }
    $skipped[] = 'not carried over to SQLite: ' . substr(preg_replace('~\s+~', ' ', $whole), 0, 90);
    return [];
}

/** A CREATE INDEX for an inline or ALTER-added index. SQLite index names are global, so they are qualified. */
function wx_sqlite_index(string $table, bool $unique, string $name, string $cols): string
{
    $cols = trim((string) preg_replace('~\(\d+\)~', '', $cols));
    $colNames = array_map('trim', explode(',', $cols));
    $cleanCols = implode(', ', array_map(static fn($c) => '`' . trim($c, " `") . '`', $colNames));
    if ($name === '') {
        $name = $table . '__' . implode('_', array_map(static fn($c) => trim($c, " `"), $colNames));
    } elseif (!str_starts_with($name, $table)) {
        $name = $table . '__' . $name;
    }
    return 'CREATE ' . ($unique ? 'UNIQUE ' : '') . 'INDEX IF NOT EXISTS `' . $name . '` ON `' . $table . '` (' . $cleanCols . ')';
}

/**
 * One column definition, MySQL to SQLite: AUTO_INCREMENT primary keys, integer and ENUM types, and the
 * table-option noise MySQL accepts inside a column (UNSIGNED, CHARACTER SET, COLLATE, COMMENT, ON UPDATE).
 */
function wx_sqlite_column(string $def): string
{
    $def = trim($def);
    if (!preg_match('~^`?(\w+)`?\s+(.*)$~s', $def, $m)) {
        return $def;
    }
    $name = $m[1];
    $rest = $m[2];
    $rest = (string) preg_replace('~\bUNSIGNED\b|\bZEROFILL\b~i', '', $rest);
    $rest = (string) preg_replace("~\bCOMMENT\s+'(?:[^']|'')*'~i", '', $rest);
    $rest = (string) preg_replace('~\bCHARACTER\s+SET\s+\w+~i', '', $rest);
    $rest = (string) preg_replace('~\bCOLLATE\s+\w+~i', '', $rest);
    $rest = (string) preg_replace('~\bON\s+UPDATE\s+CURRENT_TIMESTAMP(\(\))?~i', '', $rest);
    $rest = (string) preg_replace('~^ENUM\s*\([^)]*\)~i', 'TEXT', trim($rest));
    if (preg_match('~\bAUTO_INCREMENT\b~i', $rest)) {
        $rest = (string) preg_replace('~\bAUTO_INCREMENT\b~i', '', $rest);
        // The integer type token is replaced whole, and so is any PRIMARY KEY the column already names.
        $rest = (string) preg_replace('~^(?:TINYINT|SMALLINT|MEDIUMINT|INTEGER|INT|BIGINT)(?:\(\d+\))?\s*~i', '', trim($rest));
        $rest = (string) preg_replace('~\bPRIMARY\s+KEY\b~i', '', $rest);
        $rest = 'INTEGER PRIMARY KEY AUTOINCREMENT ' . trim($rest);
    }
    $rest = (string) preg_replace('~\s+~', ' ', trim($rest));
    return '`' . $name . '` ' . $rest;
}

/** Index of the parenthesis that closes the one at $open, skipping quoted strings; -1 if unbalanced. */
function wx_sqlite_matching_paren(string $s, int $open): int
{
    $depth = 0;
    $len = strlen($s);
    $quote = '';
    for ($i = $open; $i < $len; $i++) {
        $c = $s[$i];
        if ($quote !== '') {
            if ($c === $quote) {
                $quote = '';
            }
            continue;
        }
        if ($c === "'" || $c === '"' || $c === '`') {
            $quote = $c;
        } elseif ($c === '(') {
            $depth++;
        } elseif ($c === ')') {
            $depth--;
            if ($depth === 0) {
                return $i;
            }
        }
    }
    return -1;
}

/** Split a column list on commas that are not inside parentheses or quotes. */
function wx_sqlite_split_top(string $body): array
{
    $parts = [];
    $buf = '';
    $depth = 0;
    $quote = '';
    $len = strlen($body);
    for ($i = 0; $i < $len; $i++) {
        $c = $body[$i];
        if ($quote !== '') {
            $buf .= $c;
            if ($c === $quote) {
                $quote = '';
            }
            continue;
        }
        if ($c === "'" || $c === '"' || $c === '`') {
            $quote = $c;
        } elseif ($c === '(') {
            $depth++;
        } elseif ($c === ')') {
            $depth--;
        } elseif ($c === ',' && $depth === 0) {
            $parts[] = $buf;
            $buf = '';
            continue;
        }
        $buf .= $c;
    }
    if (trim($buf) !== '') {
        $parts[] = $buf;
    }
    return $parts;
}

/**
 * Run one planned statement. A column that already exists is the normal state of a re-run, so an ADD
 * COLUMN for an existing column is skipped instead of failing (SQLite has no ADD COLUMN IF NOT EXISTS).
 */
function wx_migrate_run(string $sql): void
{
    if (wx_driver() === 'sqlite' && preg_match('~^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+COLUMN\s+`?(\w+)`?~i', $sql, $m)) {
        if (wx_column_exists($m[1], $m[2])) {
            return;
        }
    }
    wx_q($sql);
}

/** 'mysql' or 'sqlite', from _private/db.json. */
function wx_driver(): string
{
    static $driver = null;
    if ($driver === null) {
        $cfg = (new JsonStore(WX_DB_FILE, true))->read();
        $driver = (string) ($cfg['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
    }
    return $driver;
}
