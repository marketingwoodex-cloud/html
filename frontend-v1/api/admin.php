<?php
/**
 * Woodex Admin v2 — backend (Hostinger, PHP 8 + MySQL)
 *
 * POST /api/admin.php  JSON {action, ...}   Auth header: X-WX-ADM: <token>
 * Phase A1: setup (DB + owner), login/logout/me, profile/password, users (roles),
 *           dashboard stats, activity log, single sign-on token for /builder/.
 * DB credentials live in /_private/db.json (created by setup, never web-readable).
 */
declare(strict_types=1);
// PHP 7.4 compatibility (Hostinger may still run 7.4): PHP 8 string helpers
if (!function_exists('str_starts_with')) { function str_starts_with(string $h, string $n): bool { return $n === '' || strncmp($h, $n, strlen($n)) === 0; } }
if (!function_exists('str_ends_with')) { function str_ends_with(string $h, string $n): bool { return $n === '' || substr($h, -strlen($n)) === $n; } }
if (!function_exists('str_contains')) { function str_contains(string $h, string $n): bool { return $n === '' || strpos($h, $n) !== false; } }

ini_set('display_errors', '0');
error_reporting(E_ALL);

const ROOT_DIR    = __DIR__ . '/..';
const PRIVATE_DIR = ROOT_DIR . '/_private';
const DB_FILE     = PRIVATE_DIR . '/db.json';
const BCONFIG     = PRIVATE_DIR . '/config.json';   // shared with builder.php
const ACT_FILE    = PRIVATE_DIR . '/activity.jsonl'; // builder.php appends here
const ROLES       = ['owner', 'admin', 'editor', 'sales', 'support'];
require_once __DIR__ . '/roles-lib.php';
require_once __DIR__ . '/approvals-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!is_dir(PRIVATE_DIR)) @mkdir(PRIVATE_DIR, 0755, true);
if (!file_exists(PRIVATE_DIR . '/.htaccess')) @file_put_contents(PRIVATE_DIR . '/.htaccess', "Require all denied\nDeny from all\n");

function out(array $d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function fail(string $m, int $code = 400): void { out(['ok' => false, 'error' => $m], $code); }
function jread(string $f): array { clearstatcache(true, $f); $r = is_file($f) ? @file_get_contents($f) : false; return $r ? (json_decode($r, true) ?: []) : []; }
function jwrite(string $f, array $d): void { file_put_contents($f, json_encode($d, JSON_PRETTY_PRINT), LOCK_EX); @chmod($f, 0600); }

// ---------- shared secret (same as builder.php) ----------
function bsecret(): string { $c = jread(BCONFIG); if (empty($c['secret'])) { $c['secret'] = bin2hex(random_bytes(32)); jwrite(BCONFIG, $c); } return $c['secret']; }
/** Builder token = exp.uid.sid.sig — bound to the current admin session (sign-out / revoke / disable ends builder access). */
function builder_token(int $uid): string { $sid = (string)($GLOBALS['WX_SID'] ?? ''); $exp = (string)(time() + 12 * 3600); return $exp . '.' . $uid . '.' . $sid . '.' . hash_hmac('sha256', 'wx|' . $exp . '|' . $uid . '|' . $sid, bsecret()); }

// ---------- DB ----------
function db(): PDO {
    static $pdo = null; if ($pdo) return $pdo;
    $c = jread(DB_FILE); if (!$c) fail('Admin is not set up yet', 503);
    $pdo = connect($c); return $pdo;
}
function connect(array $c): PDO {
    $dsn = 'mysql:host=' . ($c['host'] ?: 'localhost') . ';dbname=' . $c['name'] . ';charset=utf8mb4';
    return new PDO($dsn, $c['user'], $c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
function migrate(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS wx_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
        role VARCHAR(20) NOT NULL DEFAULT 'editor', pass_hash VARCHAR(255) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, pw_ver INT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL, last_login DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS wx_activity (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, user_name VARCHAR(120) NULL, action VARCHAR(60) NOT NULL,
        target VARCHAR(255) NULL, ip VARCHAR(64) NULL, created_at DATETIME NOT NULL, INDEX(created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS wx_settings (k VARCHAR(80) PRIMARY KEY, v TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS wx_throttle (ip VARCHAR(64) PRIMARY KEY, n INT NOT NULL, t INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
function now(): string { return date('Y-m-d H:i:s'); }
function ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }
function log_act(?array $u, string $action, string $target = ''): void {
    q('INSERT INTO wx_activity (user_id,user_name,action,target,ip,created_at) VALUES (?,?,?,?,?,?)', [$u['id'] ?? null, $u['name'] ?? null, $action, mb_substr($target, 0, 255), ip(), now()]);
}
/** Move builder.php activity lines into the DB */
function ingest(): void {
    if (!is_file(ACT_FILE) || !filesize(ACT_FILE)) return;
    $fh = fopen(ACT_FILE, 'c+'); if (!$fh || !flock($fh, LOCK_EX)) return;
    $lines = stream_get_contents($fh); ftruncate($fh, 0); flock($fh, LOCK_UN); fclose($fh);
    $names = [];
    foreach (explode("\n", (string)$lines) as $l) {
        $a = json_decode($l, true); if (!$a || empty($a['action'])) continue;
        $uid = !empty($a['uid']) ? (int)$a['uid'] : null;
        if ($uid && !isset($names[$uid])) $names[$uid] = q('SELECT name FROM wx_users WHERE id=?', [$uid])->fetchColumn() ?: null;
        q('INSERT INTO wx_activity (user_id,user_name,action,target,ip,created_at) VALUES (?,?,?,?,?,?)',
          [$uid, $uid ? $names[$uid] : 'Builder', 'builder.' . $a['action'], mb_substr((string)($a['target'] ?? ''), 0, 255), (string)($a['ip'] ?? ''), date('Y-m-d H:i:s', (int)($a['t'] ?? time()))]);
    }
}

// ---------- auth ----------
/** Token = uid.exp.sid.sig — the session id makes every sign-in listable and revocable (security-lib.php). */
function token_for(array $u): string { $e = time() + 12 * 3600; $exp = (string)$e; $sid = sec_new_session($u, $e); $GLOBALS['WX_SID'] = $sid; return $u['id'] . '.' . $exp . '.' . $sid . '.' . hash_hmac('sha256', 'adm|' . $u['id'] . '|' . $exp . '|' . $u['pw_ver'] . '|' . $sid, bsecret()); }
/** P20 demo accounts (@demo.woodex.pk) stop working after the date in _private/demo.json. */
function demo_expired(string $email): bool {
    if (substr(strtolower($email), -15) !== '@demo.woodex.pk') return false;
    $d = jread(PRIVATE_DIR . '/demo.json'); return empty($d['until']) || (int)$d['until'] < time();
}
function current_user(): ?array {
    if (isset($GLOBALS['WX_AS'])) return $GLOBALS['WX_AS']; // set by api/mcp.php after Bearer-token auth
    if (!preg_match('~^(\d+)\.(\d{10})\.([a-f0-9]{16})\.([a-f0-9]{64})$~', (string)($_SERVER['HTTP_X_WX_ADM'] ?? ''), $m) || (int)$m[2] < time()) return null;
    $u = q('SELECT * FROM wx_users WHERE id=? AND active=1', [(int)$m[1]])->fetch(); if (!$u || demo_expired((string)$u['email'])) return null;
    if (!hash_equals(hash_hmac('sha256', 'adm|' . $u['id'] . '|' . $m[2] . '|' . $u['pw_ver'] . '|' . $m[3], bsecret()), $m[4])) return null;
    if (!sec_session_ok((int)$u['id'], $m[3])) return null; // signed out remotely
    $GLOBALS['WX_SID'] = $m[3]; return $u;
}
function need(array $roles = []): array {
    $u = current_user(); if (!$u) fail('Not signed in', 401);
    $act = defined('WX_LIB_ONLY') ? '' : (string)($GLOBALS['action'] ?? '');
    $ok = ($act !== '' && function_exists('wx_allowed')) ? wx_allowed($u, $act, $roles) : null;
    if ($ok === false || ($ok === null && $roles && !in_array($u['role'], $roles, true))) fail('Your role (' . (ROLE_LABELS[$u['role']] ?? $u['role']) . ') does not have permission for this', 403);
    return $u;
}
function pub(array $u): array { return ['id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'roleLabel' => ROLE_LABELS[$u['role']] ?? $u['role'], 'perms' => function_exists('wx_user_perms') ? wx_user_perms($u) : [], 'active' => (bool)$u['active'], 'created_at' => $u['created_at'], 'last_login' => $u['last_login']]; }
function throttle(bool $failed = false): void {
    $r = q('SELECT n,t FROM wx_throttle WHERE ip=?', [ip()])->fetch();
    if (!$failed) { if ($r && $r['n'] >= 8 && time() - $r['t'] < 600) fail('Too many attempts — wait 10 minutes', 429); return; }
    $n = ($r && time() - $r['t'] < 600) ? $r['n'] + 1 : 1;
    q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,?,?)', [ip(), $n, time()]);
}
function valid_pw(string $p): void { if (strlen($p) < 8) fail('Password must be at least 8 characters'); }

// ---------- site stats ----------
function site_stats(): array {
    $pages = 0; $folders = []; $media = 0; $mediaBytes = 0; $backups = 0; $lastBackup = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(ROOT_DIR, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen(ROOT_DIR) + 1));
        if (preg_match('~^(builder|admin|api|assets|_private)/~', $rel)) {
            if (str_starts_with($rel, 'assets/uploads/') && preg_match('~\.(jpe?g|png|webp|gif)$~i', $rel)) { $media++; $mediaBytes += $f->getSize(); }
            if (str_starts_with($rel, '_private/backups/')) { $backups++; $lastBackup = max($lastBackup, $f->getMTime()); }
            continue;
        }
        if (str_ends_with($rel, '.html')) { $pages++; $k = str_contains($rel, '/') ? explode('/', $rel)[0] : '(top level)'; $folders[$k] = ($folders[$k] ?? 0) + 1; }
    }
    return compact('pages', 'folders', 'media', 'mediaBytes', 'backups', 'lastBackup');
}

// =================================================================== A2 — pages, SEO, status, redirects, global parts
const BACKUP_DIR = PRIVATE_DIR . '/backups';
const PAGES_META = PRIVATE_DIR . '/pages.json';     // {rel: {status}}
const REDIRECTS  = PRIVATE_DIR . '/redirects.json'; // [{from,to}]
const CHROME     = PRIVATE_DIR . '/chrome.json';    // header/footer editor versions [{t,by,note,data}] (max 10)
const RESERVED   = '~^(_private|builder|admin|api|assets)/~';

function rel_ok(string $rel): string {
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    if ($rel === '' || str_ends_with($rel, '/')) $rel .= 'index.html';
    if (!preg_match('~^[a-z0-9][a-z0-9/_\-.]*\.html$~i', $rel) || str_contains($rel, '..') || preg_match(RESERVED, $rel)) fail('Invalid page path');
    if (!is_file(ROOT_DIR . '/' . $rel)) fail('Page not found', 404);
    return $rel;
}
function url_of(string $rel): string { return '/' . preg_replace('~index\.html$~', '', $rel); }
function all_pages(): array {
    $root = realpath(ROOT_DIR); $out = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) { if (strtolower($f->getExtension()) !== 'html') continue; $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1)); if (!preg_match(RESERVED, $rel)) $out[] = $rel; }
    sort($out); return $out;
}
function backup_page(string $rel): void {
    $d = BACKUP_DIR . '/' . preg_replace('~[^a-z0-9]+~i', '_', trim($rel, '/')); if (!is_dir($d)) mkdir($d, 0755, true);
    $t = microtime(true); copy(ROOT_DIR . '/' . $rel, $d . '/' . date('Ymd-His', (int)$t) . '-' . sprintf('%03d', (int)(($t - floor($t)) * 1000)) . '.html');
    $old = glob($d . '/*.html'); sort($old); while (count($old) > 30) @unlink(array_shift($old));
}
function hattr(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8'); }
function tag_attr(string $tag, string $a): string { return preg_match('~\s' . $a . '\s*=\s*("([^"]*)"|\'([^\']*)\')~i', $tag, $m) ? html_entity_decode(($m[2] ?? '') !== '' ? $m[2] : ($m[3] ?? ''), ENT_QUOTES | ENT_HTML5) : ''; }
function find_meta(string $html, string $key, string $val): ?string { return preg_match('~<meta\b[^>]*\b' . $key . '\s*=\s*["\']' . preg_quote($val, '~') . '["\'][^>]*>~i', $html, $m) ? $m[0] : null; }
function set_meta(string $html, string $key, string $val, string $content): string {
    $old = find_meta($html, $key, $val); $new = $content === '' ? '' : '<meta ' . $key . '="' . $val . '" content="' . hattr($content) . '">';
    if ($old !== null) return str_replace($old, $new, $html);
    return $new === '' ? $html : preg_replace_callback('~</head>~i', fn() => $new . "\n</head>", $html, 1);
}
function set_canonical(string $html, string $href): string {
    $new = $href === '' ? '' : '<link rel="canonical" href="' . hattr($href) . '">';
    if (preg_match('~<link\b[^>]*rel=["\']canonical["\'][^>]*>~i', $html, $m)) return str_replace($m[0], $new, $html);
    return $new === '' ? $html : preg_replace_callback('~</head>~i', fn() => $new . "\n</head>", $html, 1);
}
function page_info(string $rel, array $meta): array {
    $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs);
    preg_match('~<title>(.*?)</title>~is', $h, $t); $title = html_entity_decode(trim($t[1] ?? ''), ENT_QUOTES | ENT_HTML5);
    $desc = ($m = find_meta($h, 'name', 'description')) ? tag_attr($m, 'content') : '';
    $robots = ($m = find_meta($h, 'name', 'robots')) ? tag_attr($m, 'content') : '';
    $og = ($m = find_meta($h, 'property', 'og:image')) ? tag_attr($m, 'content') : '';
    $can = preg_match('~<link\b[^>]*rel=["\']canonical["\'][^>]*>~i', $h, $c) ? tag_attr($c[0], 'href') : '';
    $main = preg_match('~<main\b.*?</main>~is', $h, $mm) ? $mm[0] : $h;
    $h1 = preg_match_all('~<h1\b~i', $main); $imgs = preg_match_all('~<img\b[^>]*>~i', $main, $im); $noalt = 0;
    foreach ($im[0] as $i) if (!preg_match('~\salt\s*=~i', $i)) $noalt++;
    $words = str_word_count(strip_tags(preg_replace('~<(script|style)\b.*?</\1>~is', '', $main)));
    $issues = [];
    if (!$title) $issues[] = 'No title'; elseif (mb_strlen($title) > 60) $issues[] = 'Title over 60 characters';
    if (!$desc) $issues[] = 'No meta description'; elseif (mb_strlen($desc) < 70 || mb_strlen($desc) > 160) $issues[] = 'Description should be 70–160 characters';
    if ($h1 !== 1) $issues[] = $h1 ? 'More than one H1' : 'No H1';
    if ($noalt) $issues[] = $noalt . ' image(s) without alt text';
    if (!$og) $issues[] = 'No social share image';
    if ($words < 250) $issues[] = 'Thin content (' . $words . ' words)';
    $status = $meta[$rel]['status'] ?? 'published';
    return ['path' => $rel, 'url' => url_of($rel), 'title' => $title, 'description' => $desc, 'canonical' => $can, 'ogImage' => $og, 'noindex' => stripos($robots, 'noindex') !== false,
            'status' => $status, 'mtime' => filemtime($abs), 'size' => filesize($abs), 'words' => $words, 'issues' => $issues, 'score' => max(0, 100 - count($issues) * 12),
            'folder' => str_contains($rel, '/') && substr_count($rel, '/') > 1 ? explode('/', $rel)[0] : ''];
}
/** Rebuild the managed .htaccess block and sitemap.xml from pages.json + redirects.json */
function publish_rules(): void {
    $meta = jread(PAGES_META); $red = jread(REDIRECTS);
    [$sysPre, $sysRw] = function_exists('sys_ht_lines') ? sys_ht_lines() : [[], []]; // P18 H: error pages + maintenance switch
    $lines = array_merge(['# BEGIN WOODEX-ADMIN (managed by /admin — do not edit by hand)'], $sysPre, ['<IfModule mod_rewrite.c>', 'RewriteEngine On'], $sysRw);
    foreach (rd_lines() as $l) $lines[] = $l; // P16 3.8b: www, spam 410, 301/302/410 exact+prefix
    foreach ($meta as $rel => $m) if (($m['status'] ?? '') === 'draft') $lines[] = 'RewriteRule ^' . preg_quote(preg_replace('~index\.html$~', '', $rel), '') . '(index\.html)?$ - [R=404,L]';
    $lines[] = '</IfModule>'; $lines[] = '# END WOODEX-ADMIN';
    $ht = ROOT_DIR . '/.htaccess'; $cur = is_file($ht) ? (string)file_get_contents($ht) : '';
    $cur = preg_replace('~\n?# BEGIN WOODEX-ADMIN.*?# END WOODEX-ADMIN\n?~s', "\n", $cur);
    file_put_contents($ht, rtrim($cur) . "\n\n" . implode("\n", $lines) . "\n", LOCK_EX);
    // sitemap
    $sm = ROOT_DIR . '/sitemap.xml'; $base = 'https://woodex.com.pk';
    if (is_file($sm) && preg_match('~<loc>(https?://[^/<]+)~', (string)file_get_contents($sm), $b)) $base = $b[1];
    $x = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    foreach (all_pages() as $rel) {
        if ($rel === '404.html' || in_array($meta[$rel]['status'] ?? 'published', ['draft', 'hidden'], true)) continue;
        $head = (string)file_get_contents(ROOT_DIR . '/' . $rel, false, null, 0, 400000);
        if (($m = find_meta($head, 'name', 'robots')) && stripos(tag_attr($m, 'content'), 'noindex') !== false) continue;
        $x .= '  <url><loc>' . $base . url_of($rel) . '</loc><lastmod>' . date('Y-m-d', filemtime(ROOT_DIR . '/' . $rel)) . "</lastmod></url>\n";
    }
    file_put_contents($sm, $x . "</urlset>\n", LOCK_EX);
}
function region_spans(string $h, array $scope): array {
    $pats = ['header' => '~<header class="site-header".*?</header>~s', 'mobile' => '~<nav class="mobile-panel".*?</nav>~s', 'footer' => '~<footer class="footer".*?</footer>~s'];
    $sp = []; foreach ($scope as $k) if (isset($pats[$k]) && preg_match($pats[$k], $h, $m, PREG_OFFSET_CAPTURE)) $sp[] = [$m[0][1], strlen($m[0][0])];
    usort($sp, fn($a, $b) => $b[0] <=> $a[0]); return $sp;
}

require __DIR__ . '/crm-lib.php';
require __DIR__ . '/sales-lib.php';
require __DIR__ . '/sales17-lib.php';
require __DIR__ . '/content-lib.php';
require __DIR__ . '/media-lib.php';
require __DIR__ . '/security-lib.php';
require __DIR__ . '/phase8-lib.php';
require __DIR__ . '/chat-lib.php';
require __DIR__ . '/tg-lib.php';
require __DIR__ . '/ai-agent-lib.php';
require __DIR__ . '/notify-lib.php';
require __DIR__ . '/booking-lib.php';
require __DIR__ . '/seo-lib.php';
require __DIR__ . '/google-data-lib.php';
require __DIR__ . '/dash-lib.php';
require __DIR__ . '/redirects-lib.php';
require __DIR__ . '/p18e-lib.php';
require __DIR__ . '/p18g-lib.php';
require __DIR__ . '/wahub-lib.php';
require __DIR__ . '/ai-center-lib.php';
require __DIR__ . '/social-lib.php';
require __DIR__ . '/seo-agent-lib.php';
require __DIR__ . '/p18h-lib.php';
require __DIR__ . '/p18j-lib.php';
require __DIR__ . '/p19c-lib.php';
require __DIR__ . '/logos-lib.php';
require __DIR__ . '/conn-lib.php';
if (defined('WX_LIB_ONLY')) return; // api/mcp.php reuses the helpers and actions

// ---------- request ----------
$in = json_decode((string)file_get_contents('php://input'), true) ?: [];
$action = (string)($in['action'] ?? ($_GET['action'] ?? 'status'));
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $action !== 'status' && $action !== 'cron' && $action !== 'backup_dl') fail('POST required', 405);
if ($action === 'cron') { $n = 0; $bk = []; try { $n = cms_tick(); } catch (Throwable $e) { error_log('cron: ' . $e->getMessage()); } try { $bk = a7_backup_auto(); } catch (Throwable $e) { error_log('backup: ' . $e->getMessage()); } $rm = 0; try { $rm = bk_remind(); } catch (Throwable $e) { error_log('booking remind: ' . $e->getMessage()); } out(['ok' => true, 'published' => $n, 'backups' => $bk, 'reminders' => $rm]); }
if ($action === 'backup_dl') media_download();
if (in_array($action, ['backup_up', 'db_dl', 'db_up'], true)) media_raw($action);

// ---------- P39 Phase 2: Master approval ----------
if (in_array($action, ['appr_count', 'appr_list', 'appr_get', 'appr_reject', 'appr_cancel', 'appr_cfg_get', 'appr_cfg_save'], true)) {
    $u = need(); $isM = $u['role'] === 'owner';
    $mine = function ($a) use ($u) { return (int)($a['by']['id'] ?? 0) === (int)$u['id']; };
    $lite = function ($a) { $x = $a; foreach ($x['in'] as $k => $v) { if (is_string($v) && strlen($v) > 400) $x['in'][$k] = ['_long' => strlen($v), 'preview' => mb_substr(trim(preg_replace('~\s+~', ' ', strip_tags($v))), 0, 240)]; elseif (is_array($v) && strlen((string)json_encode($v)) > 1500) $x['in'][$k] = ['_long' => strlen((string)json_encode($v)), 'preview' => mb_substr((string)json_encode($v, JSON_UNESCAPED_UNICODE), 0, 240)]; } return $x; };
    switch ($action) {
        case 'appr_count': $p = appr_list('pending'); out(['ok' => true, 'pending' => count($isM ? $p : array_filter($p, $mine)), 'master' => $isM]);
        case 'appr_list': $l = appr_list((string)($in['status'] ?? 'pending')); if (!$isM) $l = array_values(array_filter($l, $mine)); out(['ok' => true, 'items' => array_map($lite, array_slice($l, 0, 200)), 'cfg' => appr_cfg(), 'master' => $isM]);
        case 'appr_get': $a = appr_get((string)($in['id'] ?? '')); if (!$a || (!$isM && !$mine($a))) fail('Not found', 404); out(['ok' => true, 'item' => $a]);
        case 'appr_reject': if (!$isM) fail('Only the Master can reject changes', 403); $a = appr_get((string)($in['id'] ?? '')); if (!$a || $a['status'] !== 'pending') fail('Not pending');
            appr_set($a['id'], ['status' => 'rejected', 'note' => mb_substr(trim((string)($in['note'] ?? '')), 0, 500), 'decidedBy' => $u['name'], 'decidedAt' => date('c')]); log_act($u, 'approval.reject', $a['summary']); out(['ok' => true]);
        case 'appr_cancel': $a = appr_get((string)($in['id'] ?? '')); if (!$a || !$mine($a) || $a['status'] !== 'pending') fail('Not pending'); appr_set($a['id'], ['status' => 'cancelled']); out(['ok' => true]);
        case 'appr_cfg_get': out(['ok' => true, 'cfg' => appr_cfg()]);
        case 'appr_cfg_save': if (!$isM) fail('Only the Master can change approval rules', 403); $c = ['manager' => !empty($in['manager']), 'developer' => !empty($in['developer']), 'notify' => !empty($in['notify'])]; appr_write(APPR_CFG, $c); log_act($u, 'approval.rules', json_encode($c)); out(['ok' => true, 'cfg' => $c]);
    }
}
if ($action === 'appr_apply') {
    $u = need(); if (isset($in['edits']) && is_array($in['edits'])) $GLOBALS['WX_APPR_EDITS'] = $in['edits'];
    $aid = (string)($in['id'] ?? ''); [$action, $in] = appr_begin_replay($u, $aid, 'admin'); log_act($u, 'approval.approve', (string)(appr_get($aid)['summary'] ?? $aid));
} else {
    $u0 = current_user();
    if ($u0 && appr_needed((string)$u0['role'], $action, 'admin') && wx_allowed($u0, $action, []) !== false) out(appr_queue($u0, 'admin', $action, $in));
}

try {
if ($action !== "setup" && $action !== "status") { try { cms_tick(); } catch (Throwable $e) { error_log("cms_tick: " . $e->getMessage()); } }
switch ($action) {
    case 'status':
        $set = is_file(DB_FILE);
        if ($set) { $dbOk = true; try { db(); } catch (Throwable $e) { $dbOk = false; }
            if (!$dbOk) out(['ok' => true, 'needsSetup' => false, 'dbError' => true, 'driver' => 'mysql', 'builderLocked' => !empty(jread(BCONFIG)['password_hash']), 'user' => null]); }
        out(['ok' => true, 'needsSetup' => !$set, 'driver' => 'mysql', 'builderLocked' => !empty(jread(BCONFIG)['password_hash']), 'user' => $set && ($u = current_user()) ? pub($u) : null]);

    /* P16: System check — diagnoses live-server problems (owner/admin only) */
    case 'sys_check':
        need(['owner', 'admin']);
        $chk = [];
        $add = function (string $g, string $n, bool $ok, string $d = '', string $fix = '') use (&$chk) { $chk[] = ['group' => $g, 'name' => $n, 'ok' => $ok, 'detail' => $d, 'fix' => $fix]; };
        $add('Server', 'PHP version', version_compare(PHP_VERSION, '8.0', '>='), PHP_VERSION, 'Hostinger → Advanced → PHP Configuration → choose PHP 8.2+');
        foreach (['curl', 'openssl', 'pdo_mysql', 'mbstring', 'zip', 'json'] as $x) $add('Server', 'Extension ' . $x, extension_loaded($x), extension_loaded($x) ? 'loaded' : 'missing', 'Enable "' . $x . '" in Hostinger → PHP Configuration → PHP extensions');
        try { $v = db()->query('SELECT VERSION()')->fetchColumn(); $add('Database', 'MySQL connection', true, 'MySQL ' . $v); } catch (Throwable $e) { $add('Database', 'MySQL connection', false, substr($e->getMessage(), 0, 160), 'Use "Reconnect database" on the sign-in screen'); }
        $pd = dirname(DB_FILE); $w = is_writable($pd);
        $add('Files', '_private folder writable', $w, $pd, 'File Manager → _private → Permissions 755');
        $add('Files', 'Builder config (secret)', !empty(jread(BCONFIG)['secret']), !empty(jread(BCONFIG)['secret']) ? 'present' : 'missing', 'Sign out and in again — it is created automatically');
        $ca = __DIR__ . '/cacert.pem'; $add('Files', 'SSL certificate bundle', is_file($ca), is_file($ca) ? round(filesize($ca) / 1024) . ' KB' : 'api/cacert.pem missing', 'Re-upload the full zip');
        $add('Sign-in', 'Admin token received', !empty($_SERVER['HTTP_X_WX_ADM']), !empty($_SERVER['HTTP_X_WX_ADM']) ? 'header X-WX-ADM OK' : 'header stripped by server', 'Add the header pass-through lines in .htaccess (included in the zip)');
        foreach (['Google' => 'https://www.googleapis.com/', 'OpenAI' => 'https://api.openai.com/v1/models', 'WhatsApp (Meta)' => 'https://graph.facebook.com/', 'PageSpeed' => 'https://pagespeedonline.googleapis.com/'] as $n => $url) {
            if (!function_exists('curl_init')) { $add('Outgoing HTTPS', $n, false, 'cURL missing'); continue; }
            $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_CAINFO => $ca, CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 5]);
            curl_exec($ch); $err = curl_error($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
            $add('Outgoing HTTPS', $n, $err === '' && $code > 0, $err !== '' ? $err : 'HTTP ' . $code . ' (connection OK)', 'Contact Hostinger support: outgoing HTTPS blocked / SSL error');
        }
        out(['ok' => true, 'checks' => $chk, 'version' => 'P16', 'time' => date('c'), 'server' => (string)($_SERVER['SERVER_SOFTWARE'] ?? '')]);

    /* P15: reconnect the database (new Hostinger DB/user/password). Proof of ownership = builder password.
       Only allowed while the saved connection is broken. Keeps existing tables; creates missing ones. */
    case 'db_reconnect':
        throttle();
        $bc = jread(BCONFIG);
        if (empty($bc['password_hash']) || !password_verify((string)($in['builderPassword'] ?? ''), $bc['password_hash'])) { throttle(true); usleep(400000); fail('The builder password is wrong', 401); }
        if (is_file(DB_FILE)) { $works = false; try { connect(jread(DB_FILE)); $works = true; } catch (Throwable $e) {} if ($works) fail('The database connection already works. Please sign in normally.', 409); }
        $c = ['host' => trim((string)($in['dbHost'] ?? 'localhost')) ?: 'localhost', 'name' => trim((string)($in['dbName'] ?? '')), 'user' => trim((string)($in['dbUser'] ?? '')), 'pass' => (string)($in['dbPass'] ?? '')];
        if (!$c['name'] || !$c['user']) fail('Enter the database name and user');
        try { $pdo = connect($c); } catch (Throwable $e) { fail('Could not connect. Check the name, user and password in hPanel → Databases (they start with u128159657_).'); }
        migrate($pdo);
        $n = (int)$pdo->query('SELECT COUNT(*) FROM wx_users')->fetchColumn();
        if ($n === 0) {
            $name = trim((string)($in['name'] ?? '')); $email = strtolower(trim((string)($in['email'] ?? ''))); $pw = (string)($in['password'] ?? '');
            if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'needsOwner' => true, 'error' => 'This database is empty. Enter your name, email and a new password to create the owner account.'], 400);
            valid_pw($pw);
            $pdo->prepare('INSERT INTO wx_users (name,email,role,pass_hash,created_at) VALUES (?,?,?,?,?)')->execute([$name, $email, 'owner', password_hash($pw, PASSWORD_DEFAULT), now()]);
        }
        jwrite(DB_FILE, $c);
        out(['ok' => true, 'users' => max($n, 1), 'fresh' => $n === 0]);


    case 'setup':
        if (is_file(DB_FILE)) fail('Already set up', 403);
        $bc = jread(BCONFIG);
        if (!empty($bc['password_hash']) && !password_verify((string)($in['builderPassword'] ?? ''), $bc['password_hash'])) fail('The current builder password is wrong', 401);
        $c = ['host' => trim((string)($in['dbHost'] ?? 'localhost')), 'name' => trim((string)($in['dbName'] ?? '')), 'user' => trim((string)($in['dbUser'] ?? '')), 'pass' => (string)($in['dbPass'] ?? '')];
        if (!$c['name'] || !$c['user']) fail('Enter the database name and user');
        $name = trim((string)($in['name'] ?? '')); $email = strtolower(trim((string)($in['email'] ?? ''))); $pw = (string)($in['password'] ?? '');
        try { $pdo = connect($c); } catch (Throwable $e) { fail('Could not connect to the database. Check the details in hPanel → Databases.'); }
        migrate($pdo);
        /* P21 fix: database already has users (e.g. from wx-install) but db.json was missing -> just reconnect, keep existing logins */
        $hasUsers = (int)$pdo->query('SELECT COUNT(*) FROM wx_users')->fetchColumn() > 0;
        if ($hasUsers && ($email === '' || $pdo->query('SELECT COUNT(*) FROM wx_users WHERE email=' . $pdo->quote($email))->fetchColumn() > 0)) {
            if (@file_put_contents(DB_FILE, json_encode($c, JSON_PRETTY_PRINT), LOCK_EX) === false) fail('Could not save _private/db.json. In File Manager set the _private folder permission to 755 and try again.');
            @chmod(DB_FILE, 0600);
            out(['ok' => true, 'reconnected' => true, 'message' => 'Database connected. Your existing accounts are kept. Sign in with your existing login (first install: admin / admin).']);
        }
        if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter your name and a valid email (or leave the owner fields empty to keep the existing accounts)'); valid_pw($pw);
        if (@file_put_contents(DB_FILE, json_encode($c, JSON_PRETTY_PRINT), LOCK_EX) === false) fail('Could not save _private/db.json. In File Manager set the _private folder permission to 755 and try again.');
        @chmod(DB_FILE, 0600);
        q('INSERT INTO wx_users (name,email,role,pass_hash,created_at) VALUES (?,?,?,?,?)', [$name, $email, 'owner', password_hash($pw, PASSWORD_DEFAULT), now()]);
        if (empty($bc['password_hash'])) { $bc['password_hash'] = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT); $bc['secret'] = $bc['secret'] ?? bin2hex(random_bytes(32)); jwrite(BCONFIG, $bc); }
        $u = q('SELECT * FROM wx_users WHERE email=?', [$email])->fetch();
        log_act($u, 'setup', 'Admin installed');
        out(['ok' => true, 'token' => token_for($u), 'builderToken' => builder_token((int)$u['id']), 'user' => pub($u)]);

    case 'login':
        throttle();
        $u = q('SELECT * FROM wx_users WHERE email=?', [strtolower(trim((string)($in['email'] ?? '')))])->fetch();
        if (!$u || !$u['active'] || !password_verify((string)($in['password'] ?? ''), $u['pass_hash'])) { throttle(true); usleep(400000); fail('Wrong email or password', 401); }
        if (demo_expired((string)$u['email'])) fail('This demo account has expired. Ask the owner for a real login.', 403);
        sec_login_after_password($u);

    case 'pw_forgot': // always answers the same (no hint whether the email exists)
        throttle(); $email = strtolower(trim((string)($in['email'] ?? ''))); $msg = 'If that email belongs to an Admin user, a reset link has been sent. Check your inbox (and spam).';
        $u = filter_var($email, FILTER_VALIDATE_EMAIL) ? q('SELECT * FROM wx_users WHERE email=? AND active=1', [$email])->fetch() : null;
        if (!$u) { throttle(true); usleep(300000); out(['ok' => true, 'message' => $msg]); }
        $c = crm_cfg(); if ($c['smtpHost'] === '') out(['ok' => true, 'message' => $msg, 'hint' => 'Email is not set up on this site yet, so no link can be sent. Ask the owner to reset your password in Team & roles.']);
        $exp = time() + 3600; $tok = $u['id'] . '.' . $exp . '.' . hash_hmac('sha256', 'pwr|' . $u['id'] . '|' . $exp . '|' . $u['pw_ver'] . '|' . $u['pass_hash'], bsecret());
        $h = preg_replace('~[^a-z0-9.\-:]~i', '', (string)($_SERVER['HTTP_HOST'] ?? 'woodex.com.pk'));
        $e = smtp_send($c, [$u['email']], 'Reset your Woodex Admin password', "Hello {$u['name']},\n\nSomeone (hopefully you) asked to reset your Woodex Admin password.\n\nOpen this link within 1 hour to choose a new password:\nhttps://$h/admin/#reset=$tok\n\nIf you did not ask for this, ignore this email. Your password stays the same.\n\nRequest from IP " . ip());
        if ($e !== '') error_log('pw_forgot: ' . $e); log_act($u, 'password.reset_request'); out(['ok' => true, 'message' => $msg]);

    case 'pw_reset':
        throttle();
        if (!preg_match('~^(\d+)\.(\d{10})\.([a-f0-9]{64})$~', (string)($in['token'] ?? ''), $m) || (int)$m[2] < time()) fail('This reset link has expired. Ask for a new one.', 401);
        $u = q('SELECT * FROM wx_users WHERE id=? AND active=1', [(int)$m[1]])->fetch();
        if (!$u || !hash_equals(hash_hmac('sha256', 'pwr|' . $u['id'] . '|' . $m[2] . '|' . $u['pw_ver'] . '|' . $u['pass_hash'], bsecret()), $m[3])) { throttle(true); fail('This reset link is not valid or was already used. Ask for a new one.', 401); }
        $pw = (string)($in['password'] ?? ''); valid_pw($pw);
        q('UPDATE wx_users SET pass_hash=?, pw_ver=pw_ver+1 WHERE id=?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        log_act($u, 'password.reset'); out(['ok' => true, 'message' => 'Password changed. Sign in with your new password.']);

    case 'me':
        $u = need(); out(['ok' => true, 'user' => pub($u), 'caps' => wx_caps($u), 'builderToken' => in_array($u['role'], ['owner', 'admin', 'editor'], true) ? builder_token((int)$u['id']) : null]);

    case 'logout':
        if ($u = current_user()) { $s = sec_get_u((int)$u['id']); $s['sessions'] = array_values(array_filter($s['sessions'] ?? [], fn($x) => $x['sid'] !== ($GLOBALS['WX_SID'] ?? ''))); sec_put_u((int)$u['id'], $s); log_act($u, 'logout'); } out(['ok' => true]);

    case 'profile':
        $u = need(); $name = trim((string)($in['name'] ?? '')); if (!$name) fail('Name is required');
        q('UPDATE wx_users SET name=? WHERE id=?', [mb_substr($name, 0, 120), $u['id']]); log_act($u, 'profile.update');
        out(['ok' => true, 'user' => pub(q('SELECT * FROM wx_users WHERE id=?', [$u['id']])->fetch())]);

    case 'password':
        $u = need();
        if (!password_verify((string)($in['current'] ?? ''), $u['pass_hash'])) fail('Current password is wrong', 401);
        valid_pw((string)($in['next'] ?? ''));
        q('UPDATE wx_users SET pass_hash=?, pw_ver=pw_ver+1 WHERE id=?', [password_hash((string)$in['next'], PASSWORD_DEFAULT), $u['id']]);
        $u = q('SELECT * FROM wx_users WHERE id=?', [$u['id']])->fetch(); log_act($u, 'password.change'); $s = sec_get_u((int)$u['id']); $s['sessions'] = []; sec_put_u((int)$u['id'], $s);
        out(['ok' => true, 'token' => token_for($u)]);

    case 'users':
        need(['owner', 'admin']); out(['ok' => true, 'users' => array_map('pub', q('SELECT * FROM wx_users ORDER BY id')->fetchAll())]);

    case 'user_save':
        $me = need(['owner', 'admin']);
        $id = (int)($in['id'] ?? 0); $name = trim((string)($in['name'] ?? '')); $email = strtolower(trim((string)($in['email'] ?? '')));
        $role = (string)($in['role'] ?? 'editor'); $active = !empty($in['active']) ? 1 : 0; $pw = (string)($in['password'] ?? '');
        if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a name and a valid email');
        if (!in_array($role, ROLES, true)) fail('Unknown role');
        if ($role === 'owner' && $me['role'] !== 'owner') fail('Only the owner can create another owner', 403);
        if (q('SELECT id FROM wx_users WHERE email=? AND id<>?', [$email, $id])->fetch()) fail('That email is already used');
        if ($id) {
            $old = q('SELECT * FROM wx_users WHERE id=?', [$id])->fetch(); if (!$old) fail('User not found', 404);
            if ($old['role'] === 'owner' && $me['role'] !== 'owner') fail('Only the owner can edit the owner', 403);
            if ($old['role'] === 'owner' && ($role !== 'owner' || !$active) && (int)q("SELECT COUNT(*) FROM wx_users WHERE role='owner' AND active=1")->fetchColumn() < 2) fail('There must be at least one active owner');
            if ((int)$old['id'] === (int)$me['id'] && !$active) fail('You cannot deactivate yourself');
            q('UPDATE wx_users SET name=?,email=?,role=?,active=?' . ($pw !== '' || !$active ? ',pw_ver=pw_ver+1' : '') . ' WHERE id=?', [$name, $email, $role, $active, $id]);
            if ($pw !== '') { valid_pw($pw); q('UPDATE wx_users SET pass_hash=? WHERE id=?', [password_hash($pw, PASSWORD_DEFAULT), $id]); }
            if (($pw !== '' || !$active || $old['role'] !== $role) && (int)$old['id'] !== (int)$me['id']) { $s = sec_get_u($id); $s['sessions'] = []; sec_put_u($id, $s); } // sign out everywhere (admin + builder)
            if (isset($in['perms']) && is_array($in['perms'])) { $s = sec_get_u($id); $s['perms'] = array_values(array_intersect($in['perms'], array_keys(PERM_GROUPS))); sec_put_u($id, $s); }
            log_act($me, 'user.update', $email);
        } else {
            valid_pw($pw);
            q('INSERT INTO wx_users (name,email,role,pass_hash,active,created_at) VALUES (?,?,?,?,?,?)', [$name, $email, $role, password_hash($pw, PASSWORD_DEFAULT), $active, now()]);
            $nid = (int)q('SELECT id FROM wx_users WHERE email=?', [$email])->fetchColumn();
            if ($nid && isset($in['perms']) && is_array($in['perms'])) { $s = sec_get_u($nid); $s['perms'] = array_values(array_intersect($in['perms'], array_keys(PERM_GROUPS))); sec_put_u($nid, $s); }
            log_act($me, 'user.create', $email);
        }
        out(['ok' => true]);

    case 'dashboard':
        $u = need(); ingest();
        $s = site_stats();
        $days = [];
        foreach (q("SELECT DATE(created_at) d, COUNT(*) n FROM wx_activity WHERE action LIKE 'builder.%' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) GROUP BY DATE(created_at)")->fetchAll() as $r) $days[$r['d']] = (int)$r['n'];
        $recent = q('SELECT user_name,action,target,created_at FROM wx_activity ORDER BY id DESC LIMIT 8')->fetchAll();
        $team = (int)q('SELECT COUNT(*) FROM wx_users WHERE active=1')->fetchColumn();
        $edits7 = (int)q("SELECT COUNT(*) FROM wx_activity WHERE action IN ('builder.save','builder.page_new') AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();
        crm_migrate(); $lm = q("SELECT COUNT(*) FROM wx_leads WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')")->fetchColumn(); $lu = q('SELECT COUNT(*) FROM wx_leads WHERE is_read=0')->fetchColumn();
        out(['ok' => true, 'stats' => $s + ['team' => $team, 'edits7' => $edits7, 'leadsMonth' => (int)$lm, 'leadsUnread' => (int)$lu] + sales_stats(), 'editsByDay' => $days, 'recent' => $recent]);

    case 'activity':
        need(['owner', 'admin']); ingest();
        $page = max(1, (int)($in['page'] ?? 1)); $per = 30; $where = ''; $p = [];
        if (!empty($in['q'])) { $where = 'WHERE action LIKE ? OR target LIKE ? OR user_name LIKE ?'; $l = '%' . $in['q'] . '%'; $p = [$l, $l, $l]; }
        $total = (int)q("SELECT COUNT(*) FROM wx_activity $where", $p)->fetchColumn();
        $rows = q("SELECT user_name,action,target,ip,created_at FROM wx_activity $where ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $p)->fetchAll();
        out(['ok' => true, 'rows' => $rows, 'total' => $total, 'per' => $per, 'page' => $page]);

    // ---------------- A2: pages
    case 'pages_list':
        need(['owner', 'admin', 'editor']); ingest(); $meta = jread(PAGES_META); $list = [];
        $last = []; foreach (q("SELECT target,user_name,created_at FROM wx_activity WHERE action IN ('builder.save','builder.page_new','builder.restore','page.meta') ORDER BY id")->fetchAll() as $r) $last[$r['target']] = [$r['user_name'], $r['created_at']];
        foreach (all_pages() as $rel) { $i = page_info($rel, $meta); $i['editedBy'] = $last[$rel][0] ?? null; $list[] = $i; }
        usort($list, fn($a, $b) => $a['url'] === '/' ? -1 : ($b['url'] === '/' ? 1 : strcmp($a['url'], $b['url'])));
        out(['ok' => true, 'pages' => $list]);

    case 'page_meta_save':
        $u = need(['owner', 'admin', 'editor']); $rel = rel_ok((string)($in['path'] ?? ''));
        $title = trim((string)($in['title'] ?? '')); $desc = trim((string)($in['description'] ?? '')); $status = (string)($in['status'] ?? 'published');
        if (!in_array($status, ['published', 'hidden', 'draft'], true)) fail('Unknown status');
        if ($rel === 'index.html' && $status === 'draft') fail('The home page cannot be a draft');
        if (!$title) fail('Title is required');
        $can = trim((string)($in['canonical'] ?? '')); $og = trim((string)($in['ogImage'] ?? ''));
        foreach ([$can, $og] as $v) if ($v !== '' && !preg_match('~^(https?://|/)[^\s"<>]*$~', $v)) fail('Links must start with https:// or /');
        backup_page($rel); $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs);
        $tt = '<title>' . hattr($title) . '</title>';
        $h = preg_match('~<title>.*?</title>~is', $h) ? preg_replace_callback('~<title>.*?</title>~is', fn() => $tt, $h, 1) : preg_replace_callback('~</head>~i', fn() => $tt . "\n</head>", $h, 1);
        $h = set_meta($h, 'name', 'description', $desc);
        $h = set_meta($h, 'property', 'og:title', $title); $h = set_meta($h, 'property', 'og:description', $desc); $h = set_meta($h, 'property', 'og:image', $og);
        $noindex = !empty($in['noindex']) || $status !== 'published';
        $robots = ($m = find_meta($h, 'name', 'robots')) ? tag_attr($m, 'content') : '';
        $h = set_meta($h, 'name', 'robots', $noindex ? 'noindex, follow' : (stripos($robots, 'noindex') !== false ? '' : $robots));
        $h = set_canonical($h, $can);
        file_put_contents($abs, $h, LOCK_EX);
        $meta = jread(PAGES_META); if ($status === 'published') unset($meta[$rel]); else $meta[$rel] = ['status' => $status]; jwrite(PAGES_META, $meta);
        publish_rules(); log_act($u, 'page.meta', $rel);
        out(['ok' => true, 'page' => page_info($rel, $meta)]);

    case 'page_delete':
        $u = need(['owner', 'admin']); $rel = rel_ok((string)($in['path'] ?? '')); $to = trim((string)($in['redirectTo'] ?? ''));
        if ($rel === 'index.html' || in_array($rel, ['404.html', '500.html', '503.html', 'coming-soon.html'], true)) fail('This page cannot be deleted');
        if (!preg_match('~^/[a-z0-9/_\-.]*$~i', $to)) fail('Choose a page to redirect visitors to');
        $trash = PRIVATE_DIR . '/trash'; if (!is_dir($trash)) mkdir($trash, 0755, true);
        rename(ROOT_DIR . '/' . $rel, $trash . '/' . date('Ymd-His') . '-' . preg_replace('~[^a-z0-9]+~i', '_', $rel));
        @rmdir(dirname(ROOT_DIR . '/' . $rel));
        $red = array_values(array_filter(jread(REDIRECTS), fn($r) => $r['from'] !== url_of($rel))); $red[] = ['from' => url_of($rel), 'to' => $to]; jwrite(REDIRECTS, $red);
        $meta = jread(PAGES_META); unset($meta[$rel]); jwrite(PAGES_META, $meta);
        publish_rules(); log_act($u, 'page.delete', $rel . ' → ' . $to); out(['ok' => true]);

    case 'backup_get':
        need(['owner', 'admin', 'editor']); $rel = rel_ok((string)($in['path'] ?? '')); $file = basename((string)($in['file'] ?? ''));
        if (!preg_match('~^\d{8}-\d{6}(-\d{3})?\.html$~', $file)) fail('Invalid backup');
        $f = BACKUP_DIR . '/' . preg_replace('~[^a-z0-9]+~i', '_', trim($rel, '/')) . '/' . $file; if (!is_file($f)) fail('Backup not found', 404);
        out(['ok' => true, 'html' => file_get_contents($f)]);

    // ---------------- A2: redirects
    // P16 3.8b: 'redirects' / 'redirects_save' now live in redirects-lib.php (redirects_actions)

    // ---------------- A2: global parts (header menu / mobile menu / footer)
    case 'global_menu':
        $u = need(['owner', 'admin']); $d = (string)($in['desktop'] ?? ''); $mob = (string)($in['mobile'] ?? '');
        foreach ([$d, $mob] as $x) if (preg_match('~<script|\son[a-z]+\s*=|javascript:~i', $x)) fail('Scripts are not allowed in the menu');
        if (!preg_match('~^<nav class="desktop-nav"[^>]*>.*</nav>$~s', $d) || !preg_match('~^<nav class="mobile-panel"[^>]*>.*</nav>$~s', $mob)) fail('Invalid menu HTML');
        $n = 0;
        foreach (all_pages() as $rel) {
            $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); $o = $h;
            if ($rel === '404.html') continue; // special menu (disabled links)
            // per page: highlight the current page link, keep this page's own "Get a quote" target
            $url = url_of($rel); $dd = $d; $done = false;
            $dd = preg_replace_callback('~<a\b([^>]*\bhref="' . preg_quote($url, '~') . '")~', function ($m) use (&$done) { if ($done) return $m[0]; $done = true; return '<a' . $m[1] . ' aria-current="page"'; }, $dd);
            $mm = $mob;
            if (preg_match('~<a class="mobile-primary" href="([^"]*)"~', $h, $cta)) $mm = preg_replace_callback('~(<a class="mobile-primary" href=")[^"]*"~', fn($x) => $x[1] . $cta[1] . '"', $mm, 1);
            $h = preg_replace_callback('~<nav class="desktop-nav".*?</nav>~s', fn() => $dd, $h, 1);
            $h = preg_replace_callback('~<nav class="mobile-panel".*?</nav>~s', fn() => $mm, $h, 1);
            if ($h !== $o) { backup_page($rel); file_put_contents($abs, $h, LOCK_EX); $n++; }
        }
        log_act($u, 'global.menu', $n . ' pages'); out(['ok' => true, 'changed' => $n]);

    // ---------------- Phase 4: header brand + button text + footer, versions
    case 'chrome_versions':
        need(['owner', 'admin']); out(['ok' => true, 'versions' => jread(CHROME)]);

    case 'chrome_save':
        $u = need(['owner', 'admin']); $data = $in['data'] ?? null;
        if (!is_array($data)) fail('Nothing to save');
        $js = json_encode($data); if (strlen($js) > 200000) fail('Too large');
        $v = jread(CHROME); array_unshift($v, ['t' => time(), 'by' => $u['name'] ?? $u['email'] ?? '', 'note' => mb_substr((string)($in['note'] ?? ''), 0, 120), 'data' => $data]);
        jwrite(CHROME, array_slice($v, 0, 10)); out(['ok' => true, 'versions' => array_slice($v, 0, 10)]);

    case 'global_chrome':
        $u = need(['owner', 'admin']);
        $brand = (string)($in['brand'] ?? ''); $cta = trim((string)($in['cta_label'] ?? '')); $foot = (string)($in['footer'] ?? ''); $introAll = !empty($in['intro_all']);
        foreach ([$brand, $foot, $cta] as $x) if (preg_match('~<script|\son[a-z]+\s*=|javascript:~i', $x)) fail('Scripts are not allowed');
        if ($brand !== '' && !preg_match('~^<a class="brand"[^>]*>.*</a>$~s', $brand)) fail('Invalid logo HTML');
        if ($foot !== '' && !preg_match('~^<footer class="footer">.*</footer>$~s', $foot)) fail('Invalid footer HTML');
        if (mb_strlen($cta) > 40) fail('Button text is too long');
        // P17 C3: design style block + header phone (only when the Design tab sent them)
        $design = !empty($in['design']); $style = (string)($in['style'] ?? ''); $phone = (string)($in['phone'] ?? '');
        if ($design) {
            if (strlen($style) > 20000) fail('Design is too large');
            if ($style !== '' && (!preg_match('~^<style id="wx-chrome-style" data-cfg="[^"<>]*">[^<]*</style>$~s', $style) || preg_match('~@import|expression\s*\(|javascript:|url\s*\(~i', $style))) fail('Invalid design');
            if ($phone !== '' && (!preg_match('~^<a class="wx-hphone" href="tel:[0-9+]{4,20}">.*</a>$~s', $phone) || preg_match('~<script|\son[a-z]+\s*=|javascript:~i', $phone))) fail('Invalid phone');
        }
        $n = 0;
        foreach (all_pages() as $rel) {
            if ($rel === '404.html') continue;
            $abs = ROOT_DIR . '/' . $rel; $o = (string)file_get_contents($abs); $h = $o; $url = url_of($rel);
            if ($brand !== '') { $b = $url === '/' ? preg_replace('~^<a class="brand"~', '<a class="brand" aria-current="page"', $brand, 1) : $brand; $h = preg_replace_callback('~<a class="brand"[^>]*>.*?</a>~s', fn() => $b, $h, 1); }
            if ($cta !== '') $h = preg_replace_callback('~(<a class="header-cta"[^>]*>\s*<span class="header-cta-label">).*?(</span>)~s', fn($m) => $m[1] . htmlspecialchars($cta, ENT_QUOTES) . $m[2], $h, 1);
            if ($foot !== '' && preg_match('~<footer class="footer">.*?</footer>~s', $h, $old)) {
                $f = $foot;
                foreach (['footer-process', 'footer-services', 'footer-faq'] as $id)   // this page's own section links
                    if (preg_match('~<a id="' . $id . '" href="([^"]*)"~', $old[0], $m)) $f = preg_replace('~(<a id="' . $id . '" href=")[^"]*"~', '${1}' . $m[1] . '"', $f, 1);
                if (!$introAll && preg_match('~<div class="footer-intro">.*?</div>(?=\s*<nav)~s', $old[0], $intro)) $f = preg_replace_callback('~<div class="footer-intro">.*?</div>(?=\s*<nav)~s', fn() => $intro[0], $f, 1);
                // fix "/#page-contact" (sent visitors to the home page) → "#page-contact" when that section is on this page
                $f = preg_replace_callback('~(id="footer-cta" href=")/#([a-z0-9-]+)"~', fn($m) => strpos($h, 'id="' . $m[2] . '"') !== false ? $m[1] . '#' . $m[2] . '"' : $m[0], $f);
                $h = preg_replace_callback('~<footer class="footer">.*?</footer>~s', fn() => $f, $h, 1);
            }
            if ($design) {
                $h = preg_replace('~\s*<style id="wx-chrome-style"[^>]*>.*?</style>~s', '', $h);
                if ($style !== '') $h = preg_replace('~</head>~i', $style . "\n</head>", $h, 1);
                $h = preg_replace('~<a class="wx-hphone"[^>]*>.*?</a>~s', '', $h);
                if ($phone !== '') $h = preg_replace_callback('~<a class="header-cta"~', fn($m) => $phone . $m[0], $h, 1);
            }
            if ($h !== $o) { backup_page($rel); file_put_contents($abs, $h, LOCK_EX); $n++; }
        }
        log_act($u, 'global.chrome', $n . ' pages'); out(['ok' => true, 'changed' => $n]);

    case 'global_replace':
        $u = need(['owner', 'admin']); $find = (string)($in['find'] ?? ''); $rep = (string)($in['replace'] ?? ''); $dry = !empty($in['dry']);
        $scope = array_values(array_intersect((array)($in['scope'] ?? []), ['header', 'mobile', 'footer']));
        if (strlen($find) < 2) fail('Type at least 2 characters to find'); if (!$scope) fail('Choose where to search');
        if (preg_match('~<script|\son[a-z]+\s*=|javascript:~i', $rep)) fail('Scripts are not allowed');
        $res = []; $total = 0;
        foreach (all_pages() as $rel) {
            $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); $cnt = 0;
            foreach (region_spans($h, $scope) as [$off, $len]) { $part = substr($h, $off, $len); $c = substr_count($part, $find); if ($c) { $cnt += $c; $h = substr_replace($h, str_replace($find, $rep, $part), $off, $len); } }
            if ($cnt) { $res[] = ['path' => $rel, 'count' => $cnt]; $total += $cnt; if (!$dry) { backup_page($rel); file_put_contents($abs, $h, LOCK_EX); } }
        }
        if (!$dry && $total) log_act($u, 'global.replace', '"' . mb_substr($find, 0, 60) . '" → "' . mb_substr($rep, 0, 60) . '" (' . count($res) . ' pages)');
        out(['ok' => true, 'pages' => $res, 'total' => $total, 'dry' => $dry]);

    default: if (!soc_actions($action, $in) && !sag_actions($action, $in) && !aic_actions($action, $in) && !aia_actions($action, $in) && !wah_actions($action, $in) && !tg_actions($action, $in) && !sheets_actions($action, $in) && !conn_actions($action, $in) && !logos_actions($action, $in) && !p19c_actions($action, $in) && !p18j_actions($action, $in) && !sales17_actions($action, $in) && !booking_actions($action, $in) && !crm_actions($action, $in) && !sales_actions($action, $in) && !content_actions($action, $in) && !media_actions($action, $in) && !security_actions($action, $in) && !gdata_actions($action, $in) && !dash_actions($action, $in) && !p8_actions($action, $in) && !chat_actions($action, $in) && !notify_actions($action, $in) && !seo_actions($action, $in) && !redirects_actions($action, $in) && !p18e_actions($action, $in) && !p18g_actions($action, $in) && !p18h_actions($action, $in)) fail('Unknown action', 404);
}
} catch (PDOException $e) { error_log('admin.php: ' . $e->getMessage()); fail('Database error', 500); }
