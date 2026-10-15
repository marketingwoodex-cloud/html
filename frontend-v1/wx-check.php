<?php
/* Woodex server check: open https://woodex.com.pk/wx-check.php
   Shows PHP version, extensions, database connection, tables, and the last PHP errors.
   It never shows passwords. Press "Delete this check file" when you are done.
   Written for old PHP too (works on PHP 5.6+), so it runs even when the admin crashes. */
error_reporting(E_ALL); ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex'); header('Cache-Control: no-store');
$root = dirname(__FILE__); $priv = $root . '/_private';
if (isset($_POST['del'])) { @unlink(__FILE__); echo '<p style="font:16px sans-serif;padding:30px">Deleted. You can close this page.</p>'; exit; }
$rows = array();
function row(&$rows, $ok, $name, $info, $fix) { $rows[] = array($ok, $name, $info, $fix); }
$v = PHP_VERSION;
row($rows, version_compare($v, '8.0.0', '>='), 'PHP version', $v, 'hPanel → Advanced → PHP Configuration → choose PHP 8.2 → Save. (The admin needs PHP 8.0 or newer.)');
foreach (array('pdo_mysql' => 'Database driver', 'mbstring' => 'Text (mbstring)', 'curl' => 'cURL (WhatsApp, AI, Google)', 'json' => 'JSON', 'zip' => 'ZipArchive (backups)', 'openssl' => 'OpenSSL', 'fileinfo' => 'Fileinfo (uploads)') as $e => $n)
    row($rows, extension_loaded($e), $n, extension_loaded($e) ? 'enabled' : 'MISSING', 'hPanel → Advanced → PHP Configuration → PHP extensions → tick "' . $e . '" → Save.');
row($rows, is_dir($priv) && is_writable($priv), '_private folder writable', is_dir($priv) ? (is_writable($priv) ? 'yes' : 'NOT writable') : 'MISSING', 'File Manager → create folder public_html/_private (permission 755). The zip includes it.');
row($rows, is_file($priv . '/.htaccess'), '_private protected (.htaccess)', is_file($priv . '/.htaccess') ? 'yes' : 'MISSING', 'Re-upload the zip (turn on "Show hidden files").');
row($rows, is_file($root . '/api/admin.php'), 'Admin files uploaded', is_file($root . '/api/admin.php') ? 'api/admin.php found' : 'api/admin.php NOT found', 'Extract woodex-site-files.zip directly inside public_html (index.html must be in public_html, not in a sub-folder).');
$dbf = $priv . '/db.json'; $db = is_file($dbf) ? json_decode((string)file_get_contents($dbf), true) : null;
row($rows, is_array($db), 'Database settings (_private/db.json)', is_array($db) ? 'found (database "' . htmlspecialchars(isset($db['name']) ? $db['name'] : '') . '", user "' . htmlspecialchars(isset($db['user']) ? $db['user'] : '') . '")' : 'not set yet', 'Open https://woodex.com.pk/admin/ — the Setup screen asks for database name, user and password. If you see a login form instead, delete _private/db.json and reload.');
$tables = array(); $users = null;
if (is_array($db) && extension_loaded('pdo_mysql')) {
    try {
        $pdo = new PDO('mysql:host=' . (!empty($db['host']) ? $db['host'] : 'localhost') . ';dbname=' . $db['name'] . ';charset=utf8mb4', $db['user'], $db['pass'], array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
        row($rows, true, 'Database connection', 'connected', '');
        foreach ($pdo->query("SHOW TABLES") as $t) $tables[] = $t[0];
        $wx = array_values(array_filter($tables, function ($t) { return strpos($t, 'wx_') === 0; }));
        row($rows, in_array('wx_users', $tables), 'Woodex tables', count($wx) . ' wx_ tables' . ($tables && !$wx ? ' (database has ' . count($tables) . ' other tables, not Woodex)' : ''), 'Tables are created automatically by Admin Setup. Delete _private/db.json, open /admin/ and run Setup again. No SQL import is needed.');
        if (in_array('wx_users', $tables)) { $users = (int)$pdo->query("SELECT COUNT(*) FROM wx_users")->fetchColumn(); $own = (int)$pdo->query("SELECT COUNT(*) FROM wx_users WHERE role='owner' AND active=1")->fetchColumn();
            row($rows, $own > 0, 'Admin users', $users . ' user(s), ' . $own . ' active owner', 'No owner account: delete _private/db.json and run Setup again to create the owner.'); }
    } catch (Exception $e) {
        $m = $e->getMessage(); $hint = 'Check the database name, user and password in hPanel → Databases → MySQL. Then delete _private/db.json and run /admin/ Setup again.';
        if (strpos($m, '1045') !== false) $hint = 'Wrong database user or password. ' . $hint; if (strpos($m, '1049') !== false) $hint = 'Database name does not exist. ' . $hint;
        row($rows, false, 'Database connection', htmlspecialchars(preg_replace('~\(using password: \w+\)~', '', $m)), $hint);
    }
}
// last PHP errors: only shown after the database password is entered (or before install)
$dbc = is_file($priv . '/db.json') ? json_decode((string)file_get_contents($priv . '/db.json'), true) : null;
$canLogs = !$dbc || (isset($_POST['dbpass']) && isset($dbc['pass']) && hash_equals((string)$dbc['pass'], (string)$_POST['dbpass']));
if (isset($_POST['dbpass']) && !$canLogs) usleep(800000);
$logs = ''; foreach (array($root . '/error_log', $root . '/api/error_log', $root . '/admin/error_log', ini_get('error_log')) as $lf) {
    if ($lf && @is_file($lf) && @is_readable($lf)) { $l = @file($lf); if ($l) $logs .= "== " . str_replace($root, 'public_html', $lf) . "\n" . implode('', array_slice($l, -25)) . "\n"; } }
$bad = count(array_filter($rows, function ($r) { return !$r[0]; }));
?><!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Woodex server check</title>
<style>body{font:15px/1.5 system-ui,Segoe UI,sans-serif;background:#f6f7f9;color:#101828;margin:0;padding:24px}main{max-width:980px;margin:auto}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;background:#fff;margin:16px 0}td,th{border:1px solid #e4e7ec;padding:9px 11px;text-align:left;vertical-align:top}th{background:#0c1628;color:#fff}.ok{color:#067647;font-weight:700}.no{color:#b42318;font-weight:700}pre{background:#0c1628;color:#d6deeb;padding:12px;border-radius:10px;overflow:auto;font-size:12px;white-space:pre-wrap}.sum{padding:12px 14px;border-radius:10px;font-weight:700}button{background:#b42318;color:#fff;border:0;padding:10px 16px;border-radius:9px;font-weight:700;cursor:pointer}</style></head><body><main>
<h1>Woodex server check</h1><p>Send a screenshot of this page to support if the admin still shows an error.</p>
<div class="sum" style="background:<?php echo $bad ? '#fef3f2;color:#b42318' : '#ecfdf3;color:#067647'; ?>"><?php echo $bad ? $bad . ' problem(s) found. Fix the red rows from the top down.' : 'Everything looks good. Open /admin/ and sign in.'; ?></div>
<table><tr><th>Check</th><th>Result</th><th>How to fix</th></tr>
<?php foreach ($rows as $r) echo '<tr><td>' . $r[1] . '</td><td class="' . ($r[0] ? 'ok' : 'no') . '">' . ($r[0] ? '✓ ' : '✗ ') . $r[2] . '</td><td>' . ($r[0] ? '' : $r[3]) . '</td></tr>'; ?>
</table>
<h3>Last PHP errors</h3><?php if (!$canLogs) { ?><form method="post" autocomplete="off"><p>Enter your database password to see the error log.</p><input type="password" name="dbpass" required> <button>Show errors</button></form><?php } else { ?><pre><?php echo $logs !== '' ? htmlspecialchars($logs) : 'No error_log file found. (hPanel → Files → File Manager → public_html/error_log)'; ?></pre><?php } ?>
<form method="post" onsubmit="return confirm('Delete wx-check.php from the server?')"><button name="del" value="1">Delete this check file</button></form>
</main></body></html>
