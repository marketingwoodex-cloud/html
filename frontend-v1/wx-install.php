<?php
/* WOODEX V20 one-page installer (PHP 7.4+).
   https://woodex.com.pk/wx-install.php → enter the database password → Install.
   Writes _private/db.json, creates all 20 tables from _database/woodex-v20.sql, creates the owner login you
   choose on the form. No default password is ever seeded (see SECURITY note below).
   Nothing is ever deleted. Delete this file after installing.

   ── SECURITY (2026-10-13) ────────────────────────────────────────────────────────────────
   This installer used to create the well-known login `admin / admin` on a fresh site and print it
   on screen. Anyone who reached this URL before the owner finished setup could sign in and keep
   access. Closed by: a first install now requires the owner to choose the login on the form, the
   password must be 10+ characters, `admin` and common passwords are refused, and the dump's own
   INSERT INTO wx_users statement is never executed. Re-running on an existing site still leaves
   every existing password untouched. Delete this file when setup is done. */
error_reporting(E_ALL); ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex'); header('Cache-Control: no-store');
$root = __DIR__; $priv = $root . '/_private'; $dbf = $priv . '/db.json'; $sqlf = $root . '/_database/woodex-v20.sql';
$cur = is_file($dbf) ? (json_decode((string)file_get_contents($dbf), true) ?: array()) : array();
$v = array('host' => 'localhost', 'name' => 'u128159657_woodex', 'user' => 'u128159657_woodex');
foreach ($v as $k => $d) if (!empty($cur[$k])) $v[$k] = $cur[$k];
$log = array(); $err = ''; $done = false;
$lockf = $priv . '/install-lock.json'; $lock = is_file($lockf) ? (json_decode((string)file_get_contents($lockf), true) ?: array()) : array();
$locked = !empty($lock['until']) && $lock['until'] > time();
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$locked) {
    $in = array('host' => trim((string)($_POST['host'] ?? 'localhost')), 'name' => trim((string)($_POST['name'] ?? '')), 'user' => trim((string)($_POST['user'] ?? '')), 'pass' => (string)($_POST['pass'] ?? ''));
    $v = $in;
    $own = array('name' => trim((string)($_POST['oname'] ?? '')), 'email' => strtolower(trim((string)($_POST['oemail'] ?? ''))), 'pass' => (string)($_POST['opass'] ?? ''));
    $ownSet = $own['email'] !== '' || $own['pass'] !== '';
    // If the site is already connected, only the SAME database password may re-run the installer.
    if (!empty($cur['pass']) && !hash_equals((string)$cur['pass'], $in['pass'])) {
        $lock['n'] = ($lock['n'] ?? 0) + 1; if ($lock['n'] >= 5) $lock = array('n' => 0, 'until' => time() + 900);
        @file_put_contents($lockf, json_encode($lock)); usleep(600000);
        $err = 'This site is already installed and that is not its database password.';
    } elseif (!$ownSet) {
        /* SECURITY (2026-10-13): this installer used to seed the well-known login admin / admin whenever
           the user table was empty, and print it on screen. A public URL with a default credential is a
           full takeover on a site that is reachable before the owner finishes setup, so a first install
           now requires the owner to choose a real password. Re-runs on an existing install are unaffected. */
        $err = 'Choose your owner login: name, a valid email and a password of 8+ characters. The installer no longer creates a default login.';
    } elseif ($own['name'] === '' || !filter_var($own['email'], FILTER_VALIDATE_EMAIL) || strlen($own['pass']) < 10) {
        $err = 'Owner account: enter your name, a valid email and a password of 10+ characters.';
    } elseif (strtolower($own['email']) === 'admin' || in_array(strtolower($own['pass']), array('admin', 'admin123', 'password', '1234567890'), true)) {
        $err = 'That email or password is a well-known default and is refused. Choose something unique.';
    } elseif (!is_file($sqlf)) {
        $err = 'Missing file _database/woodex-v20.sql. Upload the full V20 zip again (Extract + Overwrite).';
    } else {
        try {
            $pdo = new PDO('mysql:host=' . ($in['host'] ?: 'localhost') . ';dbname=' . $in['name'] . ';charset=utf8mb4', $in['user'], $in['pass'], array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
            $log[] = 'Connected to database ' . $in['name'];
            $sql = preg_replace('~^--.*$~m', '', (string)file_get_contents($sqlf));
            $n = 0; $seed = '';
            foreach (preg_split('~;\s*\n~', $sql) as $st) { $st = trim($st); if ($st === '') continue; if (stripos($st, 'INSERT INTO wx_users') === 0) { $seed = $st; continue; } $pdo->exec($st); $n++; }
            /* P21 fix: never reset existing passwords.
               SECURITY (2026-10-13): the empty-table branch no longer seeds admin / admin — a first install
               must supply the owner account (validated above). The dump's own INSERT is skipped entirely,
               so no known credential is ever written. */
            $users = (int)$pdo->query('SELECT COUNT(*) FROM wx_users')->fetchColumn();
            if ($ownSet) {
                $hash = password_hash($own['pass'], PASSWORD_DEFAULT);
                $ex = $pdo->prepare('SELECT id FROM wx_users WHERE email=?'); $ex->execute(array($own['email']));
                if ($id = $ex->fetchColumn()) { $pdo->prepare("UPDATE wx_users SET name=?, pass_hash=?, role='owner', active=1, pw_ver=pw_ver+1 WHERE id=?")->execute(array($own['name'], $hash, $id)); $log[] = 'Owner login updated: ' . $own['email']; }
                else { $pdo->prepare("INSERT INTO wx_users (name,email,role,pass_hash,active,pw_ver,created_at) VALUES (?,?,'owner',?,1,1,NOW())")->execute(array($own['name'], $own['email'], $hash)); $log[] = 'Owner login created: ' . $own['email']; }
                $login = $own['email'];
            } else { $log[] = 'Existing logins kept (' . $users . ' users, passwords unchanged)'; $login = ''; }
            if ($users === 0 && $login === '') { $log[] = 'No login yet — reload this page and fill in the Owner account block.'; }
            $tables = $pdo->query("SHOW TABLES LIKE 'wx\\_%'")->fetchAll(PDO::FETCH_COLUMN);
            $log[] = $n . ' SQL statements run · ' . count($tables) . ' tables ready';
            if (!is_dir($priv)) @mkdir($priv, 0755, true);
            if (!is_file($priv . '/.htaccess')) @file_put_contents($priv . '/.htaccess', "Require all denied\nDeny from all\n");
            if (@file_put_contents($dbf, json_encode($in, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) throw new Exception('Could not write _private/db.json. In File Manager set the _private folder permission to 755.');
            @unlink($lockf);
            $log[] = 'Saved _private/db.json';
            $done = true;
        } catch (Throwable $e) {
            $m = $e->getMessage();
            $err = (stripos($m, 'Unknown database') !== false) ? 'This database does not exist. hPanel → Databases → create it: name woodex, user woodex, any password → then come back.' : ((stripos($m, 'Access denied') !== false) ? 'Database name, user or password is wrong. Check hPanel → Databases → MySQL (you can reset the password there).' : preg_replace('~\(using password: \w+\)~', '', $m));
        }
    }
}
$h = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Woodex V20 installer</title>
<style>body{font:15px/1.55 system-ui,Segoe UI,sans-serif;background:#0c1628;margin:0;padding:24px;color:#101828}main{max-width:620px;margin:auto;background:#fff;border-radius:16px;padding:28px}
h1{margin:0 0 4px}label{display:block;margin:12px 0 0;font-weight:600}input{font:inherit;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d0d5dd;border-radius:10px;margin-top:4px}
button,.btn{display:inline-block;font:inherit;font-weight:700;border:0;border-radius:10px;padding:12px 18px;margin-top:18px;background:#b8956a;color:#0c1628;cursor:pointer;text-decoration:none}
.ok{background:#ecfdf3;color:#067647;padding:14px;border-radius:10px}.err{background:#fef3f2;color:#b42318;padding:12px;border-radius:10px;font-weight:600;margin-top:10px}.m{color:#667085;font-size:13px}code{background:#f4efe7;padding:2px 7px;border-radius:6px}</style></head><body><main>
<h1>Woodex V20 installer</h1><p class="m">Connects the website to your database, creates all tables and the admin login. Your existing data is kept.</p>
<?php if ($done): ?>
<div class="ok"><b>Installed.</b><br><?php echo implode('<br>', array_map($h, $log)); ?></div>
<p><b>Sign in:</b> <?php echo $login !== '' ? 'email <code>' . $h($login) . '</code> with the password you just chose' : 'with your existing login'; ?></p>
<a class="btn" href="/admin/">Open admin →</a><script>setTimeout(function(){location.href="/admin/"},4000)</script>
<p class="m">Next: change the password in <b>My security</b>, then delete <code>wx-install.php</code> in File Manager.</p>
<?php else: ?>
<?php if ($err) echo '<div class="err">' . $h($err) . '</div>'; if ($locked) echo '<div class="err">Too many wrong tries. Wait 15 minutes.</div>'; ?>
<form method="post" autocomplete="off">
<label>Database host<input name="host" value="<?php echo $h($v['host']); ?>"></label>
<label>Database name<input name="name" value="<?php echo $h($v['name']); ?>" required></label>
<label>Database user<input name="user" value="<?php echo $h($v['user']); ?>" required></label>
<label>Database password <span class="m">(hPanel → Databases → MySQL)</span><input type="password" name="pass" required autofocus></label>
<h3 style="margin:22px 0 0">Owner account <span class="m">(your admin login)</span></h3>
<p class="m" style="margin:4px 0 0">Required on a new site — this is the login you will use. On an already-installed site you can leave all three empty to keep the existing logins.</p>
<label>Your name<input name="oname" value="<?php echo $h($_POST['oname'] ?? ''); ?>"></label>
<label>Email<input type="email" name="oemail" value="<?php echo $h($_POST['oemail'] ?? ''); ?>"></label>
<label>Password <span class="m">(10+ characters)</span><input type="password" name="opass" minlength="10" autocomplete="new-password"></label>
<button>Install</button></form>
<?php endif; ?>
</main></body></html>
