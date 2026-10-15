<?php
/**
 * db/migrate.php — apply db/migrations/*.sql, in order, exactly once.
 *
 * Why not a migration framework: the host is shared PHP/MySQL with no composer and no deploy pipeline,
 * and the whole product's promise is that it runs on the hosting it already pays for. So the runner is
 * one file, the migrations are plain SQL a person can read, and the only state is one table.
 *
 * What it guarantees, and why each one matters here:
 *
 *   · **Applied once.** Every file is recorded in wx_migrations with the checksum it had when applied.
 *   · **An edited migration is an error, not a surprise.** If a recorded file's checksum changes, the
 *     runner stops. The alternative is a database that no longer matches the repository, which is how
 *     staging and production start disagreeing about the schema.
 *   · **No transaction around DDL.** MySQL implicitly commits DDL, so a transaction here would give the
 *     illusion of atomicity and none of the reality. Each statement stands alone; the migration files
 *     are written to be re-runnable instead (guarded ALTERs, INSERT IGNORE) — which is a property a
 *     transaction could never provide anyway.
 *   · **A dry run that plans, not guesses.** `--dry-run` connects, reads the schema, and reports what
 *     each file would do (including which statements are already satisfied), touching nothing.
 *
 * Usage:
 *   php db/migrate.php                 apply everything pending
 *   php db/migrate.php --status        what has been applied, and what has not
 *   php db/migrate.php --dry-run       plan only; change nothing
 *   php db/migrate.php --verify        fail if unsatisfied work is pending, or if an applied file changed
 *   php db/migrate.php --checksum      print each file's sha256
 *   php db/migrate.php --only 003      apply (or dry-run) a single migration
 *   php db/migrate.php --baseline      record the files as applied **without running them** — for a
 *                                      host that already has these tables from an earlier release
 */

declare(strict_types=1);

/* 'wasm' is the php-wasm SAPI (tools/phpwasm/run-php.cjs): a command line in every way that matters. */
if (!in_array(PHP_SAPI, ['cli', 'phpdbg', 'wasm'], true)) {
    http_response_code(403);
    echo "db/migrate.php runs from the command line only.\n";
    exit(1);
}

require_once dirname(__DIR__) . '/api/v2/lib/bootstrap.php';

$DIR = __DIR__ . '/migrations';
$argvFlags = array_slice($argv, 1);
$has = static fn(string $f): bool => in_array($f, $argvFlags, true);

$DRY = $has('--dry-run');
$STATUS = $has('--status');
$VERIFY = $has('--verify');
$CHECKSUM = $has('--checksum');
$BASELINE = $has('--baseline');
$INIT = $has('--sqlite-init');
$ONLY = null;
foreach ($argvFlags as $i => $a) {
    if ($a === '--only' && isset($argvFlags[$i + 1])) {
        $ONLY = (string) $argvFlags[$i + 1];
    }
}

/* Output through echo, not fwrite(STDOUT): the php-wasm command line (tools/phpwasm/run-php.cjs) has
   no STDOUT/STDERR constants, and a migration runner that cannot report why it stopped is worse than
   one that reports it on stdout. */
function say(string $m = ''): void
{
    echo $m . "\n";
}
function bad(string $m): void
{
    echo '✗ ' . $m . "\n";
}

/** The migration files, in order. 000_… first; anything not matching the pattern is ignored loudly. */
function migration_files(string $dir): array
{
    $out = [];
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        if (preg_match('~^(\d{3})_[a-z0-9_]+\.sql$~', $f, $m)) {
            $out[$m[1]] = $f;
            continue;
        }
        if (str_ends_with($f, '.sql')) {
            bad('ignoring ' . $f . ' — migrations are named NNN_name.sql');
        }
    }
    ksort($out);
    return $out;
}

/**
 * Split a migration file into statements.
 *
 * MySQL's own client would do this, but it is not always installed on a shared host, and the splitting
 * rules that matter here are only three: single-quoted strings (which contain the escaped quotes in
 * 003's ADD COLUMN … DEFAULT 'PKR'), `--` comments, and `/* … *​/` comments. A naive explode(';') would
 * cut a statement in half and produce a syntax error at the worst possible moment.
 */
function split_sql(string $sql): array
{
    $out = [];
    $buf = '';
    $len = strlen($sql);
    $inSingle = false;
    $inDouble = false;
    $inLineComment = false;
    $inBlockComment = false;
    for ($i = 0; $i < $len; $i++) {
        $c = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';
        if ($inLineComment) {
            if ($c === "\n") {
                $inLineComment = false;
                $buf .= $c;
            }
            continue;
        }
        if ($inBlockComment) {
            if ($c === '*' && $next === '/') {
                $inBlockComment = false;
                $i++;
            }
            continue;
        }
        if (!$inSingle && !$inDouble && $c === '-' && $next === '-') {
            $inLineComment = true;
            $i++;
            continue;
        }
        if (!$inSingle && !$inDouble && $c === '/' && $next === '*') {
            $inBlockComment = true;
            $i++;
            continue;
        }
        if ($c === "'" && !$inDouble) {
            // A backslash escape only matters inside a string, and MySQL honours it by default.
            if ($inSingle && $i > 0 && $sql[$i - 1] === '\\') {
                $buf .= $c;
                continue;
            }
            $inSingle = !$inSingle;
            $buf .= $c;
            continue;
        }
        if ($c === '"' && !$inSingle) {
            $inDouble = !$inDouble;
            $buf .= $c;
            continue;
        }
        if ($c === ';' && !$inSingle && !$inDouble) {
            $stmt = trim($buf);
            if ($stmt !== '') {
                $out[] = $stmt;
            }
            $buf = '';
            continue;
        }
        $buf .= $c;
    }
    $trimmed = trim($buf);
    if ($trimmed !== '') {
        $out[] = $trimmed;
    }
    return $out;
}

/** Create the SQLite database: config, then the v2.1 schema from the dump, once. */
function sqlite_init(string $dumpPath): void
{
    if (!is_dir(WX_PRIVATE_DIR)) {
        mkdir(WX_PRIVATE_DIR, 0775, true);
    }
    $cfg = is_file(WX_DB_FILE) ? json_decode((string) file_get_contents(WX_DB_FILE), true) : null;
    if (is_array($cfg) && ($cfg['driver'] ?? '') !== 'sqlite' && !empty($cfg['name'])) {
        bad('_private/db.json points at MySQL (' . $cfg['name'] . '). Refusing to change it; move it aside to use SQLite.');
        exit(1);
    }
    if (!is_array($cfg) || ($cfg['driver'] ?? '') !== 'sqlite') {
        file_put_contents(WX_DB_FILE, json_encode(['driver' => 'sqlite', 'file' => 'woodex.sqlite'], JSON_PRETTY_PRINT) . "\n");
        say('  ✓ wrote _private/db.json (driver sqlite, file _private/woodex.sqlite)');
    }
    wx_db();
    if (wx_table_exists('wx_users')) {
        say('  · the v2.1 schema is already present; the dump is not loaded again');
        return;
    }
    if (!is_file($dumpPath)) {
        bad('the v2.1 schema dump is missing: ' . $dumpPath);
        exit(1);
    }
    $notCarried = [];
    $stmts = statements_for_driver(split_sql((string) file_get_contents($dumpPath)), $notCarried);
    foreach ($stmts as $s) {
        wx_migrate_run($s);
    }
    say('  ✓ loaded the v2.1 schema: ' . count($stmts) . ' statement(s) from ' . basename($dumpPath));
    foreach ($notCarried as $why) {
        say('  · ' . $why);
    }
}

/** Applied migrations, from the database. */
function applied(): array
{
    if (!wx_table_exists('wx_migrations')) {
        return [];
    }
    $rows = [];
    foreach (wx_all('SELECT file, sha256, applied_at, ms FROM wx_migrations') as $r) {
        $rows[(string) $r['file']] = $r;
    }
    return $rows;
}

function ensure_bookkeeping(): void
{
    $sql = 'CREATE TABLE IF NOT EXISTS wx_migrations (
           file VARCHAR(80) NOT NULL PRIMARY KEY,
           sha256 CHAR(64) NOT NULL,
           applied_at DATETIME NOT NULL,
           ms INT NOT NULL DEFAULT 0
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    foreach (statements_for_driver([$sql]) as $s) {
        wx_migrate_run($s);
    }
}

/**
 * The statements a file runs on this driver. MySQL: as written. SQLite: the planned translation, with the
 * constructs SQLite cannot carry (foreign keys, MySQL session variables) reported in $skipped.
 */
function statements_for_driver(array $stmts, array &$skipped = []): array
{
    if (wx_driver() !== 'sqlite') {
        return $stmts;
    }
    return wx_sqlite_plan($stmts, $skipped);
}

/* ------------------------------------------------------------------ sqlite init
   --sqlite-init: a development database in one file, with no MySQL server. It writes _private/db.json for
   SQLite (and refuses to overwrite a MySQL configuration), then loads the v2.1 schema from the dump, which
   is what a MySQL host gets from phpMyAdmin. The migrations then run as usual, on top. */
if ($INIT) {
    sqlite_init(dirname(__DIR__) . '/frontend-v1/_database/woodex-v20.sql');
}

/* ------------------------------------------------------------------ can we run? */
try {
    wx_db();
} catch (Throwable $e) {
    bad('no database: ' . $e->getMessage());
    bad('expected _private/db.json pointing at the MySQL this host uses');
    exit(1);
}

$files = migration_files($DIR);
if (!$files) {
    bad('no migrations found in ' . $DIR);
    exit(1);
}

if ($CHECKSUM) {
    foreach ($files as $n => $f) {
        say($f . '  ' . hash_file('sha256', $DIR . '/' . $f));
    }
    exit(0);
}

if (!$DRY && !$STATUS && !$VERIFY) {
    ensure_bookkeeping();
}
/* applied() reports nothing when the bookkeeping table does not exist yet, which is the correct
   answer for a first run in every mode, including --dry-run. */
$done = applied();

/* ------------------------------------------------------------------ status */
if ($STATUS) {
    say('');
    say('  Migration status');
    say('');
    $pending = 0;
    foreach ($files as $n => $f) {
        $sha = hash_file('sha256', $DIR . '/' . $f);
        if (!isset($done[$f])) {
            say('  · ' . $f . '  pending');
            $pending++;
            continue;
        }
        $same = hash_equals((string) $done[$f]['sha256'], $sha);
        say('  ✓ ' . $f . '  applied ' . (string) $done[$f]['applied_at'] . (($done[$f]['ms'] ?? 0) ? ' (' . (int) $done[$f]['ms'] . ' ms)' : '') . ($same ? '' : '  ⚠ EDITED SINCE'));
    }
    foreach ($done as $f => $r) {
        if (!in_array($f, $files, true)) {
            say('  ? ' . $f . '  recorded but not in db/migrations');
        }
    }
    say('');
    say('  ' . $pending . ' pending, ' . count($done) . ' applied');
    say('');
    exit(0);
}

/* ------------------------------------------------------------------ verify */
if ($VERIFY) {
    $problems = [];
    foreach ($files as $n => $f) {
        $sha = hash_file('sha256', $DIR . '/' . $f);
        if (!isset($done[$f])) {
            $problems[] = $f . ' is not applied';
            continue;
        }
        if (!hash_equals((string) $done[$f]['sha256'], $sha)) {
            $problems[] = $f . ' was edited after it was applied';
        }
    }
    if (!$problems) {
        say('✓ all ' . count($files) . ' migrations are applied and unchanged');
        exit(0);
    }
    foreach ($problems as $p) {
        bad($p);
    }
    exit(1);
}

/* ------------------------------------------------------------------ apply */
say('');
say($DRY ? '  Dry run — nothing will be written' : '  Applying migrations');
say('');

$appliedNow = 0;
$skipped = 0;
$failed = 0;

foreach ($files as $n => $f) {
    if ($ONLY !== null && !str_starts_with($f, $ONLY)) {
        continue;
    }
    $path = $DIR . '/' . $f;
    $sha = hash_file('sha256', $path);
    $sql = (string) file_get_contents($path);

    if (isset($done[$f])) {
        if (!hash_equals((string) $done[$f]['sha256'], $sha)) {
            bad($f . ' was edited after it was applied — the database would no longer match the '
                . 'migrations. Create a new migration for the change instead.');
            $failed++;
            continue;
        }
        $skipped++;
        continue;
    }

    if ($BASELINE) {
        wx_insert('wx_migrations', ['file' => $f, 'sha256' => $sha, 'applied_at' => wx_now(), 'ms' => 0]);
        say('  · ' . $f . '  recorded as applied (baseline — not run)');
        $appliedNow++;
        continue;
    }

    if ($DRY) {
        $notCarried = [];
        $stmts = statements_for_driver(split_sql($sql), $notCarried);
        say('  → ' . $f . '  would run ' . count($stmts) . ' statement(s)');
        foreach ($notCarried as $why) {
            say('      · ' . $why);
        }
        foreach ($stmts as $i => $s) {
            $head = trim((string) preg_replace('~\s+~', ' ', $s));
            say('      ' . ($i + 1) . '. ' . substr($head, 0, 96) . (strlen($head) > 96 ? ' …' : ''));
        }
        $appliedNow++;
        continue;
    }

    $notCarried = [];
    $stmts = statements_for_driver(split_sql($sql), $notCarried);
    foreach ($notCarried as $why) {
        say('  · ' . $f . ': ' . $why);
    }
    $t0 = microtime(true);
    try {
        foreach ($stmts as $i => $s) {
            wx_migrate_run($s);
        }
    } catch (Throwable $e) {
        bad($f . ' failed at statement ' . ($i + 1) . ': ' . $e->getMessage());
        bad('nothing was recorded for this file; fix it and re-run (the migrations are re-runnable)');
        $failed++;
        continue;
    }
    $ms = (int) round((microtime(true) - $t0) * 1000);
    wx_insert('wx_migrations', ['file' => $f, 'sha256' => $sha, 'applied_at' => wx_now(), 'ms' => $ms]);
    say('  ✓ ' . $f . '  ' . count($stmts) . ' statement(s), ' . $ms . ' ms');
    $appliedNow++;
}

say('');
if ($DRY) {
    say('  ' . $appliedNow . ' file(s) would run, ' . $skipped . ' already applied. Nothing was written.');
} else {
    say('  ' . $appliedNow . ' applied, ' . $skipped . ' already applied' . ($failed ? ', ' . $failed . ' FAILED' : ''));
}
say('');

exit($failed ? 1 : 0);
