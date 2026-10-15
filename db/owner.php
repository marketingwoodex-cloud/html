<?php
/**
 * db/owner.php — make the account that can sign in, or get back into one.
 *
 * Why this file exists: v2.5 signs in against `wx_users`, and that table is the studio's own — it came
 * from the v2.1 database, filled by `/builder/`'s first-run screen. There is no self-service route back
 * in if that password is forgotten, and on a host that has never run v2.1 there is no way to make the
 * first account at all, because making it is behind a sign-in screen. This is the one command that
 * closes that loop, and it prints the password **once**.
 *
 * Nothing here can read a password back: they are bcrypt hashes, and that is the point. What it can do is
 * set a new one, which ends every session minted under the old one (the session carries `pw_ver`), and
 * clear a lockout, which is usually why somebody is running it.
 *
 * Usage:
 *   php db/owner.php --status                        who can sign in, and how — no secrets
 *   php db/owner.php --email you@example.com         create that account as owner, print a password
 *   php db/owner.php --email you@example.com --password 'choose-it'
 *   php db/owner.php --email you@example.com --reset  reset an existing account's password
 *   php db/owner.php --email you@example.com --name "Imtiaz Ahmad" --role admin
 *   php db/owner.php --email you@example.com --disable | --enable
 *   php db/owner.php --dry-run                       with any of the above: say what would happen
 *
 * The account name may be an address (`owner@woodex.com.pk`) or a bare sign-in name (`admin`, which is
 * what v2.1's own first run wrote). Both are stored lower-case, because that is how sign-in looks them up.
 * A password is at least 8 characters — v2.1's rule, kept — and is generated at 20 if you do not choose
 * one. `--dry-run` touches nothing, so it is safe to see what a command would do first.
 */

declare(strict_types=1);

/* 'wasm' is the php-wasm SAPI (tools/phpwasm/run-php.cjs): a command line in every way that matters. */
if (!in_array(PHP_SAPI, ['cli', 'phpdbg', 'wasm'], true)) {
    http_response_code(403);
    echo "db/owner.php runs from the command line only.\n";
    exit(1);
}

require_once dirname(__DIR__) . '/api/v2/lib/bootstrap.php';

const OWNER_PW_MIN = 8;

/** No 0/O, 1/l/I: a password typed off a screen into a phone should not have a coin-flip in it. */
const OWNER_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function say(string $m = ''): void
{
    echo $m . "\n";
}

function bad(string $m): void
{
    echo '✗ ' . $m . "\n";
}

/**
 * A sign-in name: an address, or the bare name v2.1's first run writes (`admin`).
 *
 * Deliberately permissive about the second form — that account exists on the live host, and a tool that
 * refuses to reset its password because it has no `@` would be a tool that cannot do the one job it has.
 */
function owner_login_ok(string $s): bool
{
    if ($s === '' || strlen($s) > 190) {
        return false;
    }
    if (preg_match('~^[^@\s]+@[^@\s]+\.[^@\s]+$~', $s)) {
        return true;
    }
    return (bool) preg_match('~^[a-z0-9][a-z0-9._-]{2,189}$~', $s);
}

function owner_pw_ok(string $s): bool
{
    return strlen($s) >= OWNER_PW_MIN;
}

/** A fresh password. `random_int` (the CSPRNG), not `rand`: this is the only credential in the system. */
function owner_gen_pw(int $n = 20): string
{
    $last = strlen(OWNER_ALPHABET) - 1;
    $out = '';
    for ($i = 0; $i < $n; $i++) {
        $out .= OWNER_ALPHABET[random_int(0, $last)];
    }
    return $out;
}

/** The role, checked against the same list `wx_can()` uses. Anything else is refused, not silently fixed. */
function owner_role(?string $r): string
{
    $r = $r === null ? 'owner' : strtolower(trim($r));
    if (!in_array($r, WX_ROLES, true)) {
        throw new InvalidArgumentException('Unknown role "' . $r . '" — one of: ' . implode(', ', WX_ROLES));
    }
    return $r;
}

/** `--name`, `--email`, … as `[flag => value|null]`. A flag with no value after it is `null`. */
function owner_args(array $argv): array
{
    $out = [];
    foreach (array_slice($argv, 1) as $i => $a) {
        if (!str_starts_with($a, '--')) {
            continue;
        }
        $key = substr($a, 2);
        $rest = array_slice($argv, 1);
        $next = $rest[$i + 1] ?? null;
        $out[$key] = ($next !== null && !str_starts_with($next, '--')) ? $next : null;
    }
    return $out;
}

function owner_usage(): void
{
    say('');
    say('  db/owner.php — who can sign in, and how to get back in');
    say('');
    say('    php db/owner.php --status                        who can sign in, and how (no secrets)');
    say('    php db/owner.php --email you@example.com         create that account as owner, print a password');
    say('    php db/owner.php --email you@example.com --password \'choose-it\'');
    say('    php db/owner.php --email you@example.com --reset  set a new password on an existing account');
    say('    php db/owner.php --email you@example.com --name "Imtiaz Ahmad" --role admin');
    say('    php db/owner.php --email you@example.com --disable | --enable');
    say('    php db/owner.php --dry-run                       with any of the above: change nothing');
    say('');
    say('  A password is at least ' . OWNER_PW_MIN . ' characters, and one is generated at 20 if you do not choose');
    say('  one. It is printed once — nothing in the database can give it back.');
    say('');
}

/** The one place a connection failure is explained, because it is the likeliest reason this is run. */
function owner_db(): PDO
{
    try {
        $pdo = wx_db();
    } catch (Throwable $e) {
        bad('Cannot reach the database: ' . $e->getMessage());
        say('');
        say('  On the host this is `_private/config.php` (or the WX_DB_* environment). Locally, MySQL has to be');
        say('  running and configured before any of this works — `php db/migrate.php --status` says the same thing.');
        exit(1);
    }
    if (!wx_table_exists('wx_users')) {
        bad('This database has no wx_users table.');
        say('');
        say('  v2.5 runs on the v2.1 database rather than replacing it. Import the host\'s dump');
        say('  (schema of record: frontend-v1/_database/woodex-v20.sql), then `php db/migrate.php` for the');
        say('  columns and tables v2.5 adds.');
        exit(1);
    }
    return $pdo;
}

/** Who can sign in, as the server would see them. No hashes, ever. */
function owner_status(): void
{
    owner_db();
    $has2fa = wx_column_exists('wx_users', 'totp_on');
    $cols = 'id, name, email, role, active, last_login' . ($has2fa ? ', totp_on' : '');
    $rows = wx_all('SELECT ' . $cols . ' FROM wx_users ORDER BY active DESC, FIELD(role, ' . implode(',', array_map(static fn($r) => "'" . $r . "'", WX_ROLES)) . '), id');
    say('');
    say('  Accounts that can sign in (' . count($rows) . ')');
    say('');
    foreach ($rows as $r) {
        $flags = [];
        $flags[] = (int) $r['active'] === 1 ? 'active' : 'DISABLED';
        if ($has2fa) {
            $flags[] = (int) $r['totp_on'] === 1 ? '2FA on' : '2FA off';
        }
        say('  · ' . str_pad((string) $r['email'], 34) . ' ' . str_pad((string) $r['role'], 9)
            . ' ' . implode(' · ', $flags)
            . '  ' . ($r['last_login'] ? 'last signed in ' . (string) $r['last_login'] : 'never signed in'));
        say('      ' . (string) $r['name']);
    }
    say('');
    $locked = 0;
    try {
        foreach ($rows as $r) {
            if (wx_login_locked((string) $r['email']) > 0) {
                $locked++;
                say('  ⚠ ' . $r['email'] . ' is locked out for a few more minutes (too many wrong passwords).');
            }
        }
    } catch (Throwable) {
        /* the attempts table is optional here: status must still list accounts without it */
    }
    if ($locked === 0) {
        say('  `--reset` also clears a lockout, which is usually why this is being run.');
    }
    say('');
}

/** Create, reset, disable or enable — and report the effect by listing the accounts afterwards. */
function owner_write(array $args): void
{
    $dry = array_key_exists('dry-run', $args);
    $email = strtolower(trim((string) ($args['email'] ?? '')));
    if (!owner_login_ok($email)) {
        bad('--email is required, and must be an address or a sign-in name (3-190 characters, letters, digits, . _ -)');
        exit(1);
    }
    try {
        $role = owner_role(array_key_exists('role', $args) ? (string) $args['role'] : null);
    } catch (InvalidArgumentException $e) {
        bad($e->getMessage());
        exit(1);
    }
    $pw = array_key_exists('password', $args) ? (string) $args['password'] : '';
    if ($pw !== '' && !owner_pw_ok($pw)) {
        bad('A password is at least ' . OWNER_PW_MIN . ' characters');
        exit(1);
    }
    $generated = $pw === '' && !array_key_exists('disable', $args) && !array_key_exists('enable', $args);
    if ($generated) {
        $pw = owner_gen_pw();
    }

    owner_db();
    $row = wx_one('SELECT * FROM wx_users WHERE email = ?', [$email]);
    $reset = array_key_exists('reset', $args);
    $disable = array_key_exists('disable', $args);
    $enable = array_key_exists('enable', $args);

    if ($row === null) {
        if ($reset || $disable || $enable) {
            bad('There is no account "' . $email . '" — drop --reset/--disable/--enable to create it.');
            exit(1);
        }
        say('');
        say('  ' . ($dry ? 'Would create' : 'Creating') . ' ' . $email . ' as ' . $role . '…');
        if (!$dry) {
            $id = wx_insert('wx_users', [
                'name' => trim((string) ($args['name'] ?? '')) !== '' ? trim((string) $args['name']) : $email,
                'email' => $email,
                'role' => $role,
                'pass_hash' => password_hash($pw, PASSWORD_DEFAULT),
                'active' => 1,
                'pw_ver' => 1,
                'created_at' => wx_now(),
            ]);
            owner_audit('user.create', $email . ' (id ' . $id . ')');
        }
    } else {
        $sets = [];
        $what = [];
        if ($reset || $pw !== '') {
            $sets['pass_hash'] = $dry ? 'hash of the new password' : password_hash($pw, PASSWORD_DEFAULT);
            /* The session carries pw_ver, so bumping it ends every session minted under the old password. */
            $sets['pw_ver'] = (int) $row['pw_ver'] + 1;
            $what[] = 'a new password';
        }
        if ($disable) {
            $sets['active'] = 0;
            $what[] = 'disabled';
        }
        if ($enable) {
            $sets['active'] = 1;
            $what[] = 'enabled';
        }
        if (array_key_exists('name', $args) && trim((string) $args['name']) !== '') {
            $sets['name'] = trim((string) $args['name']);
            $what[] = 'the name';
        }
        if (!$what) {
            bad('"' . $email . '" already exists — add --reset to set a new password, or --disable/--enable.');
            exit(1);
        }
        say('');
        say('  ' . ($dry ? 'Would change' : 'Changing') . ' ' . $email . ': ' . implode(', ', $what) . '.');
        if (!$dry) {
            wx_update('wx_users', $sets, ['id' => (int) $row['id']]);
            owner_audit('user.password', $email . ' (id ' . (int) $row['id'] . ')');
        }
    }

    /* A lockout is the other half of "I cannot get in", and resetting a password that is being throttled
       would look like it had not worked. */
    if (!$dry) {
        try {
            wx_login_clear($email);
        } catch (Throwable) {
            /* no attempts table on this host yet — nothing to clear */
        }
    }

    if ($generated) {
        say('');
        say('  Sign in with');
        say('    ' . $email);
        say('    ' . $pw);
        say('');
        say('  That password is shown once and is not stored anywhere in readable form. Change it on the');
        say('  security screen after signing in, and turn on two-factor there — a first password that was');
        say('  printed on a terminal should not be the one that stays.');
    } elseif ($pw !== '' && !$disable && !$enable) {
        say('  The password you chose is set.');
    }
    /* Always show the list after a change: an effect that can be read is better than one that is assumed. */
    owner_status();
}

/** The audit log, when the host has one. A credential change is exactly what it is for. */
function owner_audit(string $action, string $target): void
{
    if (!wx_table_exists('wx_activity')) {
        return;
    }
    wx_insert('wx_activity', [
        'user_id' => null,
        'user_name' => 'db/owner.php',
        'action' => $action,
        'target' => substr($target, 0, 255),
        'ip' => null,
        'created_at' => wx_now(),
    ]);
}

function owner_main(array $argv): int
{
    $args = owner_args($argv);
    if (!$args || array_key_exists('help', $args) || array_key_exists('h', $args)) {
        owner_usage();
        return 0;
    }
    if (array_key_exists('status', $args) || array_key_exists('list', $args)) {
        owner_status();
        return 0;
    }
    owner_write($args);
    return 0;
}

/* Requiring this file from a test (tests/run.php defines WX_OWNER_TEST) loads the rules above without
   running the command, so the address, password and role rules are asserted where the other rules are. */
if (!defined('WX_OWNER_TEST')) {
    exit(owner_main($argv));
}
