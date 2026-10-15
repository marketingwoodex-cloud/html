<?php
/**
 * Woodex Live Page Builder — backend (Hostinger / any PHP 7.4+ host)
 *
 * Single endpoint: POST /api/builder.php  (JSON body {action, ...} or multipart for uploads)
 * - Password login (hash stored in /_private/config.json, created on first run)
 * - CSRF token on every write
 * - Page load/save with automatic backup (last 30 per page) + restore
 * - Image upload to /assets/uploads/ (jpg/png/webp/gif, verified, max 8 MB)
 * - Theme save -> /assets/theme.css (whitelisted CSS variables only)
 */
declare(strict_types=1);
// PHP 7.4 compatibility (Hostinger may still run 7.4): PHP 8 string helpers
if (!function_exists('str_starts_with')) { function str_starts_with(string $h, string $n): bool { return $n === '' || strncmp($h, $n, strlen($n)) === 0; } }
if (!function_exists('str_ends_with')) { function str_ends_with(string $h, string $n): bool { return $n === '' || substr($h, -strlen($n)) === $n; } }
if (!function_exists('str_contains')) { function str_contains(string $h, string $n): bool { return $n === '' || strpos($h, $n) !== false; } }

ini_set('display_errors', '0');
error_reporting(E_ALL);

const ROOT_DIR     = __DIR__ . '/..';
const PRIVATE_DIR  = ROOT_DIR . '/_private';
const CONFIG_FILE  = PRIVATE_DIR . '/config.json';
const BACKUP_DIR   = PRIVATE_DIR . '/backups';
const UPLOAD_DIR   = ROOT_DIR . '/assets/uploads';
const THEME_FILE   = ROOT_DIR . '/assets/theme.css';
const MAX_BACKUPS  = 30;
const MAX_UPLOAD   = 8 * 1024 * 1024;
const MAX_HTML     = 3 * 1024 * 1024;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ---------- bootstrap private dir ----------
foreach ([PRIVATE_DIR, BACKUP_DIR] as $d) {
    if (!is_dir($d)) @mkdir($d, 0755, true);
}
if (!file_exists(PRIVATE_DIR . '/.htaccess')) {
    @file_put_contents(PRIVATE_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
}

function out(array $data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'error' => $msg], $code); }
function config(): array { clearstatcache(true, CONFIG_FILE); $raw = is_file(CONFIG_FILE) ? @file_get_contents(CONFIG_FILE) : false; return $raw ? (json_decode($raw, true) ?: []) : []; }
function save_config(array $c): void { file_put_contents(CONFIG_FILE, json_encode($c, JSON_PRETTY_PRINT), LOCK_EX); @chmod(CONFIG_FILE, 0600); }
/* Stateless auth: signed token sent in the X-WX-CSRF header (no cookies, so it
   works inside iframes/proxies where third-party cookies are blocked). */
function secret(): string { $c = config(); if (empty($c['secret'])) { $c['secret'] = bin2hex(random_bytes(32)); save_config($c); } return $c['secret']; }
function make_token(): string { $exp = (string)(time() + 12 * 3600); return $exp . '.' . hash_hmac('sha256', 'wx|' . $exp, secret()); }
/** Woodex Admin installed? Then the shared builder password is retired and only admin-issued tokens work. */
function admin_installed(): bool { return is_file(PRIVATE_DIR . '/db.json'); }
function logged_in(): bool {
    static $ok = null; if ($ok !== null) return $ok;
    $why = function (string $r) { $GLOBALS['WX_AUTH_WHY'] = $r; return false; };
    $t = (string)($_SERVER['HTTP_X_WX_CSRF'] ?? '');
    $adm = (string)($_SERVER['HTTP_X_WX_ADM'] ?? '');
    if (!admin_installed()) { // legacy "exp.hmac" (builder password) — only before admin setup
        if (empty(config()['password_hash'])) return $ok = $why('no builder password set');
        return $ok = (bool)preg_match('~^(\d{10})\.([a-f0-9]{64})$~', $t, $m) && (int)$m[1] >= time() && hash_equals(hash_hmac('sha256', 'wx|' . $m[1], secret()), $m[2]);
    }
    $sec = json_decode((string)@file_get_contents(PRIVATE_DIR . '/security.json'), true) ?: [];
    $live = function (string $uid, string $sid) use ($sec): bool { foreach ($sec[$uid]['sessions'] ?? [] as $s) if (($s['sid'] ?? '') === $sid && (int)($s['exp'] ?? 0) > time()) return true; return false; };
    $uid = 0; $pwv = null;
    // 1) builder token "exp.uid.sid.hmac" issued by Woodex Admin
    if (preg_match('~^(\d{10})\.(\d+)\.([a-f0-9]{16})\.([a-f0-9]{64})$~', $t, $m)) {
        if ((int)$m[1] < time()) $why('builder token expired');
        elseif (!hash_equals(hash_hmac('sha256', 'wx|' . $m[1] . '|' . $m[2] . '|' . $m[3], secret()), $m[4])) $why('builder token signature mismatch (secret changed?)');
        elseif (!$live($m[2], $m[3])) $why('admin session not found in security.json');
        else $uid = (int)$m[2];
    } elseif ($t !== '') $why('builder token has the wrong format'); else $why('no builder token sent');
    // 2) fallback: the normal admin session token "uid.exp.sid.hmac" (P16)
    if (!$uid && preg_match('~^(\d+)\.(\d{10})\.([a-f0-9]{16})\.([a-f0-9]{64})$~', $adm, $m) && (int)$m[2] >= time() && $live($m[1], $m[3])) { $uid = (int)$m[1]; $pwv = [$m[2], $m[3], $m[4]]; }
    if (!$uid) return $ok = false;
    try {
        $c = json_decode((string)file_get_contents(PRIVATE_DIR . '/db.json'), true) ?: [];
        $pdo = new PDO('mysql:host=' . (($c['host'] ?? '') ?: 'localhost') . ';dbname=' . ($c['name'] ?? '') . ';charset=utf8mb4', (string)($c['user'] ?? ''), (string)($c['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $st = $pdo->prepare('SELECT id, role, active, pw_ver FROM wx_users WHERE id=?'); $st->execute([$uid]); $u = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) { error_log('builder auth: ' . $e->getMessage()); return $ok = $why('database error: ' . substr($e->getMessage(), 0, 120)); }
    if (!$u) return $ok = $why('user not found');
    if ($pwv && !hash_equals(hash_hmac('sha256', 'adm|' . $u['id'] . '|' . $pwv[0] . '|' . $u['pw_ver'] . '|' . $pwv[1], secret()), $pwv[2])) return $ok = $why('admin token signature mismatch');
    if ((int)$u['active'] !== 1) return $ok = $why('user is disabled');
    if (!in_array($u['role'], ['owner', 'admin', 'editor'], true)) return $ok = $why('role ' . $u['role'] . ' cannot edit pages');
    $GLOBALS['WX_AUTH_UID'] = (int)$u['id']; $GLOBALS['WX_AUTH_ROLE'] = (string)$u['role']; unset($GLOBALS['WX_AUTH_WHY']);
    return $ok = true;
}
/** Security audit F-05: only the Owner may ADD script code to pages (scripts run inside admin previews).
 *  Everyone else may keep the scripts a page already has, but not add new ones. */
function code_tokens(string $html): array {
    $t = [];
    preg_match_all('~<script\b[^>]*>.*?</script\s*>~is', $html, $m); foreach ($m[0] as $x) if (!preg_match('~^<script\b[^>]*type\s*=\s*["\']?application/ld\+json~i', $x)) $t[] = preg_replace('~\s+~', ' ', $x);
    preg_match_all('~<script\b(?![^>]*>.*?</script)~is', $html, $m2); if (count($m2[0]) > 0) $t[] = '<script-unclosed>';
    $dec = function (string $v): string { $v = preg_replace_callback('~&#(?:x0*([0-9a-f]+)|0*([0-9]+));?~i', fn($e) => (string)mb_chr($e[1] !== '' ? (int)hexdec($e[1]) : (int)$e[2]), $v); return strtolower(preg_replace('~[\x00-\x20]+~', '', html_entity_decode(html_entity_decode($v, ENT_QUOTES | ENT_HTML5), ENT_QUOTES | ENT_HTML5))); };
    preg_match_all('~<[a-z][^>]*>~is', preg_replace('~<!--.*?-->~s', '', $html), $tags); // only look INSIDE tags (no false alarms on page text)
    foreach ($tags[0] as $tag) {
        preg_match_all('~[\s/"\']on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)~i', $tag, $m); foreach ($m[0] as $x) $t[] = trim(preg_replace('~\s+~', ' ', $x));
        preg_match_all('~[\s/"\'](?:href|src|action|formaction|data|xlink:href|srcdoc|poster|background|cite|ping)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)~i', $tag, $m);
        foreach ($m[1] as $k => $v) { $d = $dec(trim($v, '"\'')); if (preg_match('~^(javascript|vbscript|data:text/html|data:image/svg)~', $d) || preg_match('~<script|on[a-z]+=~', $d)) $t[] = trim($m[0][$k]); }
    }
    preg_match_all('~<(iframe|object|embed|base|frame|frameset)\b[^>]*>|<meta\b[^>]*http-equiv[^>]*>~i', $html, $m); foreach ($m[0] as $x) $t[] = preg_replace('~\s+~', ' ', $x);
    return array_values(array_unique($t));
}
function code_guard(string $html, string $base): void {
    if (($GLOBALS['WX_AUTH_ROLE'] ?? '') === 'owner' || !admin_installed()) return;
    $new = array_diff(code_tokens($html), code_tokens($base));
    if ($new) { $site = []; foreach (list_pages() as $p) $site = array_merge($site, code_tokens((string)@file_get_contents(ROOT_DIR . '/' . $p['path']))); $new = array_diff($new, $site); } // scripts already used elsewhere on the site are allowed
    if ($new) { act('blocked_script', mb_substr(implode(' ', $new), 0, 200)); fail('Only the owner can add scripts, embeds or on…= event code to pages. Remove: ' . mb_substr(reset($new), 0, 80)); }
}
function token_uid(): ?int { if (!empty($GLOBALS['WX_AUTH_UID'])) return (int)$GLOBALS['WX_AUTH_UID']; return preg_match('~^\d{10}\.(\d+)\.~', (string)($_SERVER['HTTP_X_WX_CSRF'] ?? ''), $m) ? (int)$m[1] : null; }
/** activity line for Woodex Admin (ingested into MySQL by admin.php) */
function act(string $a, string $target = ''): void {
    @file_put_contents(PRIVATE_DIR . '/activity.jsonl', json_encode(['t' => time(), 'uid' => token_uid(), 'action' => $a, 'target' => $target, 'ip' => substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64)], JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
}
function require_auth(): void { if (!logged_in()) fail('Not signed in to the page builder' . (!empty($GLOBALS['WX_AUTH_WHY']) ? ' (' . $GLOBALS['WX_AUTH_WHY'] . ')' : ''), 401); }
function throttle(bool $failed = false): void {
    $f = PRIVATE_DIR . '/login-attempts.json'; $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $d = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
    $d = array_filter($d, fn($v) => $v['t'] > time() - 600);
    if ($failed) { $d[$ip] = ['n' => ($d[$ip]['n'] ?? 0) + 1, 't' => time()]; @file_put_contents($f, json_encode($d), LOCK_EX); return; }
    if (($d[$ip]['n'] ?? 0) >= 8) fail('Too many attempts — wait 10 minutes', 429);
}

/** Resolve a site-relative page path safely. Returns absolute path or fails. */
function page_path(string $rel, bool $mustExist = true): string {
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    if ($rel === '' || str_ends_with($rel, '/')) $rel .= 'index.html';
    if (!preg_match('~^[a-z0-9][a-z0-9/_\-\.]*\.html$~i', $rel) || str_contains($rel, '..')) fail('Invalid page path');
    if (preg_match('~^(_private|builder|admin|api|assets)/~', $rel)) fail('That file cannot be edited');
    $abs = ROOT_DIR . '/' . $rel;
    if ($mustExist) {
        $real = realpath($abs); $root = realpath(ROOT_DIR);
        if ($real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) fail('Page not found', 404);
    }
    return $abs;
}
function backup_name(): string { $t = microtime(true); return date('Ymd-His', (int)$t) . '-' . sprintf('%03d', (int)(($t - floor($t)) * 1000)) . '.html'; }
function backup_dir_for(string $rel): string { return BACKUP_DIR . '/' . preg_replace('~[^a-z0-9]+~i', '_', trim($rel, '/')); }

// ---------- A3: section library + global sections ----------
const BLOCK_CATS = ['Hero', 'Services', 'Features', 'Projects', 'Testimonials', 'CTA', 'FAQ', 'Contact', 'Content', 'Process', 'Stats', 'Pricing', 'Team', 'Gallery', 'Footer', 'Custom'];
function clean_block(array $b, ?array $old): array {
    $name = mb_substr(trim((string)($b['name'] ?? ($old['name'] ?? ''))), 0, 60); $html = (string)($b['html'] ?? ($old['html'] ?? ''));
    if ($name === '' || $html === '' || strlen($html) > 200 * 1024) fail('Block needs a name and HTML (max 200 KB)');
    if (preg_match('~<script|\son[a-z]+\s*=|javascript:~i', $html)) fail('Scripts are not allowed in blocks');
    $cat = in_array($b['cat'] ?? '', BLOCK_CATS, true) ? $b['cat'] : ($old['cat'] ?? 'Custom');
    $tags = $b['tags'] ?? ($old['tags'] ?? []); if (!is_array($tags)) $tags = explode(',', (string)$tags);
    $tags = array_slice(array_values(array_filter(array_map(fn($t) => mb_substr(strtolower(trim((string)$t)), 0, 24), $tags))), 0, 12);
    $global = array_key_exists('global', $b) ? !empty($b['global']) : !empty($old['global']);
    if ($global && (preg_match('~^\s*<!--~', $html) || !preg_match('~^\s*<[a-z]~i', $html))) fail('A global section must be a single element (convert it first)');
    $kind = ($b['kind'] ?? ($old['kind'] ?? '')) === 'element' ? 'element' : 'section';
    return ['id' => $old['id'] ?? bin2hex(random_bytes(6)), 'name' => $name, 'kind' => $kind, 'cat' => $cat, 'tags' => $tags, 'global' => $global, 'html' => $html, 't' => $old['t'] ?? (int)(microtime(true) * 1000), 'updated' => (int)(microtime(true) * 1000)];
}
/** outer [start,end) of every element with data-wx-global="id", balanced by tag name */
function global_ranges(string $h, string $id): array {
    $id = preg_replace('~[^a-f0-9]~', '', $id); $out = []; $pos = 0;
    while (preg_match('~<([a-z][a-z0-9-]*)\b[^>]*\bdata-wx-global="' . $id . '"[^>]*>~i', $h, $m, PREG_OFFSET_CAPTURE, $pos)) {
        $start = $m[0][1]; $tag = strtolower($m[1][0]); $i = $start + strlen($m[0][0]); $depth = 1;
        while ($depth && preg_match('~<(/?)' . $tag . '\b[^>]*>~i', $h, $t, PREG_OFFSET_CAPTURE, $i)) { $depth += $t[1][0] === '/' ? -1 : (substr($t[0][0], -2) === '/>' ? 0 : 1); $i = $t[0][1] + strlen($t[0][0]); }
        if ($depth) break; $out[] = [$start, $i]; $pos = $i;
    }
    return $out;
}
function replace_global(string $h, string $id, string $html): string { foreach (array_reverse(global_ranges($h, $id)) as [$a, $b]) $h = substr($h, 0, $a) . $html . substr($h, $b); return $h; }
function block_usage(string $id): array { $u = []; foreach (list_pages() as $p) if (global_ranges((string)file_get_contents(ROOT_DIR . '/' . $p['path']), $id)) $u[] = $p['path']; return $u; }
function detach_global(string $id): void { foreach (block_usage($id) as $rel) { $abs = ROOT_DIR . '/' . $rel; file_put_contents($abs, str_replace(' data-wx-global="' . $id . '"', '', (string)file_get_contents($abs)), LOCK_EX); } }

function list_pages(): array {
    $root = realpath(ROOT_DIR); $pages = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (strtolower($f->getExtension()) !== 'html') continue;
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
        if (preg_match('~^(_private|builder|admin|api|assets)/~', $rel)) continue;
        $head = (string)file_get_contents($f->getPathname(), false, null, 0, 4000);
        preg_match('~<title>(.*?)</title>~is', $head, $m);
        $url = '/' . preg_replace('~index\.html$~', '', $rel);
        $pages[] = ['path' => $rel, 'url' => $url, 'title' => html_entity_decode(trim($m[1] ?? $rel), ENT_QUOTES | ENT_HTML5)];
    }
    usort($pages, fn($a, $b) => $a['url'] === '/' ? -1 : ($b['url'] === '/' ? 1 : strcmp($a['url'], $b['url'])));
    return $pages;
}

// ---------- input ----------
$isMultipart = str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data');
$in = $isMultipart ? $_POST : (json_decode((string)file_get_contents('php://input'), true) ?: []);
$action = (string)($in['action'] ?? $_GET['action'] ?? 'status');
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $action !== 'status') fail('POST required', 405);

// P39 Phase 2: Manager page/theme/library changes wait for the Master (shared queue with admin.php)
require_once __DIR__ . '/approvals-lib.php';
if ($action === 'appr_apply') {
    require_auth(); [$action, $in] = appr_begin_replay(['role' => $GLOBALS['WX_AUTH_ROLE'] ?? '', 'name' => 'Master'], (string)($in['id'] ?? ''), 'builder');
} elseif (in_array($action, APPR_BUILDER_WRITE, true) && logged_in() && appr_needed((string)($GLOBALS['WX_AUTH_ROLE'] ?? ''), $action, 'builder')) {
    out(appr_queue(['id' => (int)$GLOBALS['WX_AUTH_UID'], 'name' => 'User #' . (int)$GLOBALS['WX_AUTH_UID'], 'role' => (string)$GLOBALS['WX_AUTH_ROLE']], 'builder', $action, $in));
}

switch ($action) {
    case 'status':
        out(['ok' => true, 'loggedIn' => logged_in(), 'why' => $GLOBALS['WX_AUTH_WHY'] ?? null, 'needsSetup' => !admin_installed() && empty(config()['password_hash']), 'adminOnly' => admin_installed()]);

    case 'setup': // first run only: choose the admin password
        if (admin_installed() || !empty(config()['password_hash'])) fail('Already set up', 403);
        $pw = (string)($in['password'] ?? '');
        if (strlen($pw) < 8) fail('Password must be at least 8 characters');
        save_config(['password_hash' => password_hash($pw, PASSWORD_DEFAULT), 'secret' => bin2hex(random_bytes(32)), 'created' => date('c')]);
        out(['ok' => true, 'csrf' => make_token()]);

    case 'login':
        if (admin_installed()) fail('Sign in through Woodex Admin (/admin/) to edit pages', 403);
        throttle();
        $c = config();
        if (empty($c['password_hash']) || !password_verify((string)($in['password'] ?? ''), $c['password_hash'])) {
            throttle(true); usleep(400000); fail('Wrong password', 401);
        }
        out(['ok' => true, 'csrf' => make_token()]);

    case 'logout':
        out(['ok' => true]);

    case 'password':
        if (admin_installed()) fail('Change your password in Woodex Admin → Profile', 403);
        require_auth();
        $c = config();
        if (!password_verify((string)($in['current'] ?? ''), $c['password_hash'] ?? '')) fail('Current password is wrong', 401);
        if (strlen((string)($in['next'] ?? '')) < 8) fail('New password must be at least 8 characters');
        $c['password_hash'] = password_hash((string)$in['next'], PASSWORD_DEFAULT); $c['secret'] = bin2hex(random_bytes(32)); save_config($c);
        out(['ok' => true, 'csrf' => make_token()]);

    case 'pages':
        require_auth(); out(['ok' => true, 'pages' => list_pages()]);

    case 'load':
        require_auth();
        $abs = page_path((string)($in['path'] ?? ''));
        out(['ok' => true, 'html' => file_get_contents($abs), 'mtime' => filemtime($abs)]);

    case 'save':
        require_auth();
        $rel = (string)($in['path'] ?? ''); $abs = page_path($rel);
        $html = (string)($in['html'] ?? '');
        if (strlen($html) > MAX_HTML || stripos($html, '<html') === false || stripos($html, '</html>') === false) fail('Invalid page HTML');
        if (preg_match('~<[^>]+\s(contenteditable|data-wx-ed)[\s=>]~i', $html)) fail('Editor markup detected — save aborted to protect the page');
        code_guard($html, (string)file_get_contents($abs));
        if (!empty($in['mtime']) && (int)$in['mtime'] < filemtime($abs) && empty($in['force'])) fail('This page was changed elsewhere since you opened it. Reload, or save again to overwrite.', 409);
        $bd = backup_dir_for($rel); if (!is_dir($bd)) mkdir($bd, 0755, true);
        copy($abs, $bd . '/' . backup_name());
        $old = glob($bd . '/*.html'); sort($old);
        while (count($old) > MAX_BACKUPS) @unlink(array_shift($old));
        if (file_put_contents($abs, $html, LOCK_EX) === false) fail('Could not write the file (check permissions)', 500);
        act('save', $rel);
        clearstatcache(); out(['ok' => true, 'mtime' => filemtime($abs)]);

    case 'backups':
        require_auth();
        $rel = (string)($in['path'] ?? ''); page_path($rel);
        $files = glob(backup_dir_for($rel) . '/*.html') ?: []; rsort($files);
        out(['ok' => true, 'backups' => array_map(fn($f) => ['file' => basename($f), 'size' => filesize($f)], $files)]);

    case 'backup_get':
        require_auth();
        $rel = (string)($in['path'] ?? ''); page_path($rel);
        $file = basename((string)($in['file'] ?? ''));
        if (!preg_match('~^\d{8}-\d{6}(-\d{3})?\.html$~', $file)) fail('Invalid backup');
        $src = backup_dir_for($rel) . '/' . $file; if (!is_file($src)) fail('Backup not found', 404);
        out(['ok' => true, 'html' => (string)file_get_contents($src)]);
    case 'restore':
        require_auth();
        $rel = (string)($in['path'] ?? ''); $abs = page_path($rel);
        $file = basename((string)($in['file'] ?? ''));
        if (!preg_match('~^\d{8}-\d{6}(-\d{3})?\.html$~', $file)) fail('Invalid backup');
        $src = backup_dir_for($rel) . '/' . $file; if (!is_file($src)) fail('Backup not found', 404);
        $content = (string)file_get_contents($src);
        copy($abs, backup_dir_for($rel) . '/' . backup_name());
        act('restore', $rel);
        file_put_contents($abs, $content, LOCK_EX); clearstatcache(); out(['ok' => true, 'mtime' => filemtime($abs)]);

    case 'media':
        require_auth();
        $list = [];
        foreach (array_merge(glob(ROOT_DIR . '/assets/img/*.{webp,jpg,jpeg,png,gif,svg}', GLOB_BRACE) ?: [], glob(UPLOAD_DIR . '/*.{webp,jpg,jpeg,png,gif}', GLOB_BRACE) ?: []) as $f) {
            $list[] = '/' . str_replace('\\', '/', substr(realpath($f), strlen(realpath(ROOT_DIR)) + 1));
        }
        out(['ok' => true, 'media' => array_reverse($list)]);

    case 'media_usage':
    case 'media_delete':
        require_auth();
        $url = (string)($in['url'] ?? ''); $needle = ltrim($url, '/'); $used = [];
        foreach (list_pages() as $pg) if ($needle !== '' && str_contains((string)file_get_contents(ROOT_DIR . '/' . $pg['path']), $needle)) $used[] = $pg['url'];
        if ($action === 'media_usage') out(['ok' => true, 'used' => $used]);
        if (!preg_match('~^/assets/uploads/[a-z0-9-]+\.(jpe?g|png|webp|gif)$~i', $url)) fail('Only uploaded images can be deleted');
        if ($used && empty($in['force'])) out(['ok' => false, 'error' => 'Image is used on: ' . implode(', ', $used), 'used' => $used], 409);
        $abs = UPLOAD_DIR . '/' . basename($url); if (is_file($abs)) @unlink($abs);
        act('media_delete', (string)($in['url'] ?? ''));
        out(['ok' => true]);

    case 'import_url':
        require_auth();
        // Security audit F-06: follow redirects by hand and re-check every hop (no internal addresses)
        $u = (string)($in['url'] ?? ''); $data = false;
        for ($hop = 0; $hop <= 3; $hop++) {
            $p = parse_url($u); $host = strtolower($p['host'] ?? '');
            if (($p['scheme'] ?? '') !== 'https' || $host === '' || isset($p['user']) || (isset($p['port']) && (int)$p['port'] !== 443) || filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) || preg_match('~^(localhost|.*\.local|.*\.internal|.*\.localhost)$~', $host)) fail('Only public https image links are allowed');
            $ips = @gethostbynamel($host) ?: []; if (!$ips) fail('Could not find that website');
            foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) fail('Only public https image links are allowed');
            $ctx = stream_context_create(['ssl' => ['cafile' => __DIR__ . '/cacert.pem', 'verify_peer' => true, 'verify_peer_name' => true], 'http' => ['timeout' => 20, 'follow_location' => 0, 'max_redirects' => 1, 'ignore_errors' => true, 'user_agent' => 'WoodexBuilder/1.0']]);
            $http_response_header = []; $data = @file_get_contents($u, false, $ctx, 0, MAX_UPLOAD + 1);
            $code = 0; $loc = ''; foreach ((array)$http_response_header as $hl) { if (preg_match('~^HTTP/\S+\s+(\d{3})~', $hl, $mm)) $code = (int)$mm[1]; elseif (preg_match('~^Location:\s*(\S+)~i', $hl, $mm)) $loc = $mm[1]; }
            if ($code >= 300 && $code < 400 && $loc !== '') { if (!preg_match('~^https?://~i', $loc)) $loc = 'https://' . $host . '/' . ltrim($loc, '/'); $u = $loc; $data = false; continue; }
            if ($code !== 200) $data = false;
            break;
        }
        if ($data === false || $data === '') fail('Could not download that image');
        if (strlen($data) > MAX_UPLOAD) fail('Image is larger than 8 MB');
        $info = @getimagesizefromstring($data);
        $map = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'];
        if (!$info || !isset($map[$info[2]])) fail('That link is not a JPG, PNG, WebP or GIF image');
        if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
        $base = substr(trim(preg_replace('~[^a-z0-9]+~', '-', strtolower((string)($in['name'] ?? 'stock'))), '-') ?: 'stock', 0, 40);
        $name = $base . '-' . substr(bin2hex(random_bytes(4)), 0, 6) . '.' . $map[$info[2]];
        file_put_contents(UPLOAD_DIR . '/' . $name, $data, LOCK_EX);
        act('import_url', '/assets/uploads/' . $name);
        out(['ok' => true, 'url' => '/assets/uploads/' . $name, 'width' => $info[0], 'height' => $info[1]]);

    case 'fetch_page': // P17 C1: pick sections from another site's page (public https HTML only)
        require_auth();
        $u = (string)($in['url'] ?? ''); $p = parse_url($u); $host = strtolower($p['host'] ?? '');
        if (($p['scheme'] ?? '') !== 'https' || $host === '' || filter_var($host, FILTER_VALIDATE_IP) || preg_match('~^(localhost|.*\.local|.*\.internal)$~', $host)) fail('Paste a public https:// page link');
        $ip = gethostbyname($host); if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) fail('Paste a public https:// page link');
        $ctx = stream_context_create(['ssl' => ['cafile' => __DIR__ . '/cacert.pem', 'verify_peer' => true], 'http' => ['timeout' => 20, 'follow_location' => 0, 'user_agent' => 'Mozilla/5.0 (WoodexBuilder section picker)', 'header' => "Accept: text/html\r\n"]]);
        $html = @file_get_contents($u, false, $ctx, 0, 3 * 1024 * 1024 + 1);
        $code = 0; foreach ($http_response_header ?? [] as $h) if (preg_match('~^HTTP/\S+\s+(\d{3})~', $h, $m)) $code = (int)$m[1];
        if ($code >= 300 && $code < 400) fail('That link redirects; open it in your browser and paste the final address');
        if ($html === false || $html === '') fail('Could not open that page');
        if (strlen($html) > 3 * 1024 * 1024) fail('That page is larger than 3 MB');
        if (!preg_match('~<(html|body|section|div)[\s>]~i', $html)) fail('That link is not an HTML page');
        act('fetch_page', $host);
        out(['ok' => true, 'html' => $html, 'url' => $u]);

    case 'upload':
        require_auth();
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail('Upload failed');
        if ($f['size'] > MAX_UPLOAD) fail('Image is larger than 8 MB');
        $info = @getimagesize($f['tmp_name']);
        $map = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'];
        if (!$info || !isset($map[$info[2]])) fail('Only JPG, PNG, WebP or GIF images are allowed');
        if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
        $base = preg_replace('~[^a-z0-9]+~', '-', strtolower(pathinfo((string)$f['name'], PATHINFO_FILENAME))) ?: 'image';
        $name = substr(trim($base, '-'), 0, 40) . '-' . substr(bin2hex(random_bytes(4)), 0, 6) . '.' . $map[$info[2]];
        $dest = UPLOAD_DIR . '/' . $name;
        if (!move_uploaded_file($f['tmp_name'], $dest) && !rename($f['tmp_name'], $dest)) fail('Could not store the image', 500);
        act('upload', '/assets/uploads/' . $name);
        out(['ok' => true, 'url' => '/assets/uploads/' . $name, 'width' => $info[0], 'height' => $info[1]]);

    case 'theme':
        require_auth();
        $vars = (array)($in['vars'] ?? []);
        $allowed = [
            '--wx-navy' => 'color', '--wx-ink' => 'color', '--wx-muted' => 'color', '--wx-paper' => 'color',
            '--wx-surface' => 'color', '--wx-beige' => 'color', '--wx-accent' => 'color', '--wx-wood' => 'color', '--wx-cream' => 'color', '--wx-preset' => 'name',
            '--wx-font' => 'font', '--wx-font-head' => 'font',
            '--wx-h1' => 'len', '--wx-h2' => 'len', '--wx-h3' => 'len', '--wx-c1' => 'color', '--wx-c2' => 'color', '--wx-c3' => 'color', '--wx-c4' => 'color',
            '--wx-section' => 'len', '--wx-container' => 'len', '--wx-btn-radius' => 'len', '--wx-r-lg' => 'len', '--wx-base-size' => 'len',
        ];
        $LOCAL = ['jakarta' => ['Plus Jakarta Sans', 'plus-jakarta-sans', 'sans-serif'], 'inter' => ['Inter', 'inter', 'sans-serif'], 'manrope' => ['Manrope', 'manrope', 'sans-serif'], 'poppins' => ['Poppins', 'poppins', 'sans-serif'], 'playfair' => ['Playfair Display', 'playfair-display', 'serif'], 'cormorant' => ['Cormorant Garamond', 'cormorant-garamond', 'serif']]; $faces = '';
        $fonts = ['dm' => '"DM Sans",system-ui,sans-serif', 'system' => 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', 'serif' => 'Georgia,"Times New Roman",serif', 'mono' => 'ui-monospace,Consolas,monospace'];
        $lines = []; $imports = [];
        foreach ($allowed as $k => $type) {
            if (!isset($vars[$k])) continue; $v = trim((string)$vars[$k]);
            if ($type === 'color' && !preg_match('~^#[0-9a-f]{3,8}$~i', $v)) fail("Invalid colour for $k");
            if ($type === 'name') { if (!preg_match('~^[a-z0-9-]{1,30}$~', $v)) fail('Invalid preset'); continue; }
            if ($type === 'len' && !preg_match('~^\d{1,4}(\.\d+)?(px|rem|em|%)$~', $v)) fail("Invalid size for $k");
            if ($type === 'font') {
                if (preg_match('~^g:([A-Za-z0-9 ]{2,40}):([0-9;]{0,40})$~', $v, $g)) { $imports[] = str_replace(' ', '+', trim($g[1])) . ($g[2] !== '' ? ':wght@' . $g[2] : ''); $v = '"' . trim($g[1]) . '",system-ui,sans-serif'; }
                elseif (isset($LOCAL[$v])) { $L = $LOCAL[$v]; if ($v !== 'jakarta' && strpos($faces, $L[1]) === false) foreach ([400, 500, 600, 700] as $w) $faces .= '@font-face{font-family:"' . $L[0] . '";src:url("/assets/fonts/' . $L[1] . '-' . $w . '.woff2") format("woff2");font-weight:' . $w . ';font-display:swap}' . "\n"; $v = '"' . $L[0] . '",system-ui,' . $L[2]; }
                elseif (!isset($fonts[$v])) fail("Invalid font for $k"); else $v = $fonts[$v];
            }
            $lines[] = "  $k:$v;";
        }
        $head = $imports ? '@import url("https://fonts.googleapis.com/css2?' . implode('&', array_map(fn($f) => 'family=' . $f, array_unique($imports))) . '&display=swap");' . "\n" : '';
        $hs = ''; foreach (['h1', 'h2', 'h3'] as $h) if (isset($vars["--wx-$h"])) $hs .= "main $h{font-size:var(--wx-$h)!important}\n";
        $css = $head . "/* Woodex theme — generated by the Live Page Builder on " . date('Y-m-d H:i') . ". Edit via /builder/ → Theme. */\n:root{\n" . implode("\n", $lines) . "\n}\n"
             . ":root{--navy:var(--wx-navy);--navy-2:var(--wx-navy);--ink:var(--wx-ink);--muted:var(--wx-muted)}\n"
             . (isset($vars['--wx-wood']) ? ":root{--wood:var(--wx-wood);--wood-2:var(--wx-wood)}\n" : '')
             . (isset($vars['--wx-cream']) ? ":root{--cream:var(--wx-cream);--surface:var(--wx-cream);--beige:var(--wx-cream);--wx-surface:var(--wx-cream);--wx-beige:var(--wx-cream)}\n" : '')
             . "html{font-size:var(--wx-base-size,16px)}\nbody,button,input,select,textarea{font-family:var(--wx-font)!important}\nmain h1,main h2,main h3{font-family:var(--wx-font-head,var(--wx-font))}\n";
        if (is_file(THEME_FILE)) copy(THEME_FILE, BACKUP_DIR . '/theme-' . date('Ymd-His') . '.css');
        file_put_contents(THEME_FILE, $faces . $css . $hs, LOCK_EX);
        file_put_contents(PRIVATE_DIR . '/theme.json', json_encode(array_intersect_key($vars, $allowed), JSON_PRETTY_PRINT), LOCK_EX);
        act('theme', '');
        out(['ok' => true]);

    case 'page_new':
        require_auth();
        $folder = trim((string)($in['folder'] ?? ''), '/'); $slug = (string)($in['slug'] ?? ''); $html = (string)($in['html'] ?? '');
        if (!preg_match('~^[a-z0-9][a-z0-9-]{0,59}$~', $slug)) fail('Page address: use lowercase letters, numbers and dashes only');
        if ($folder !== '' && (!preg_match('~^[a-z0-9][a-z0-9\-/]{0,79}$~', $folder) || str_contains($folder, '..'))) fail('Invalid folder');
        $rel = ($folder !== '' ? $folder . '/' : '') . $slug . '/index.html';
        if (preg_match('~^(_private|builder|admin|api|assets)/~', $rel)) fail('That folder is reserved');
        if (strlen($html) > MAX_HTML || stripos($html, '<html') === false || stripos($html, '</html>') === false) fail('Invalid page HTML');
        if (preg_match('~<[^>]+\s(contenteditable|data-wx-ed)[\s=>]~i', $html)) fail('Editor markup detected');
        $abs = ROOT_DIR . '/' . $rel; if (file_exists($abs)) fail('A page already exists at that address');
        code_guard($html, '');
        if (!is_dir(dirname($abs))) mkdir(dirname($abs), 0755, true);
        if (file_put_contents($abs, $html, LOCK_EX) === false) fail('Could not write the file (check permissions)', 500);
        act('page_new', $rel);
        out(['ok' => true, 'path' => $rel]);

    case 'blocks_list':
        require_auth();
        $f = PRIVATE_DIR . '/blocks.json';
        out(['ok' => true, 'blocks' => is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : []]);

    case 'blocks_save':
    case 'blocks_delete':
    case 'blocks_import':
        require_auth();
        $f = PRIVATE_DIR . '/blocks.json'; $list = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
        if ($action === 'blocks_delete') {
            $id = (string)($in['id'] ?? ''); $used = block_usage($id);
            if ($used && empty($in['force'])) out(['ok' => false, 'error' => 'This global section is used on ' . count($used) . ' page(s)', 'used' => $used], 409);
            if ($used) detach_global($id);
            $list = array_values(array_filter($list, fn($b) => $b['id'] !== $id));
        } elseif ($action === 'blocks_import') {
            $add = array_slice((array)($in['blocks'] ?? []), 0, 200);
            if (count($list) + count($add) > 200) fail('Library full (200 blocks)');
            foreach ($add as $b) { if (is_array($b)) { unset($b['id']); $list[] = clean_block($b, null); } }
        } else {
            $old = null; $idx = -1; $id = (string)($in['id'] ?? '');
            if ($id !== '') { foreach ($list as $k => $b) if ($b['id'] === $id) { $old = $b; $idx = $k; } if (!$old) fail('Block not found', 404); }
            if (!$old && count($list) >= 200) fail('Library full (200 blocks)');
            $b = clean_block($in, $old); if ($old) $list[$idx] = $b; else $list[] = $b;
        }
        file_put_contents($f, json_encode(array_values($list), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        act('blocks', $action);
        out(['ok' => true, 'blocks' => array_values($list)]);

    case 'blocks_usage':
        require_auth();
        $f = PRIVATE_DIR . '/blocks.json'; $list = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : []; $u = new stdClass;
        foreach ($list as $b) if (!empty($b['global'])) $u->{$b['id']} = block_usage($b['id']);
        out(['ok' => true, 'usage' => $u]);

    case 'blocks_sync':
        require_auth();
        $f = PRIVATE_DIR . '/blocks.json'; $list = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
        $b = null; foreach ($list as $x) if ($x['id'] === (string)($in['id'] ?? '')) $b = $x;
        if (!$b || empty($b['global'])) fail('Global section not found', 404);
        $html = preg_replace('~^<([a-z][a-z0-9-]*)~i', '<$1 data-wx-global="' . $b['id'] . '"', trim($b['html']), 1);
        $n = 0;
        foreach (list_pages() as $p) {
            $abs = ROOT_DIR . '/' . $p['path']; $o = (string)file_get_contents($abs); $h = replace_global($o, $b['id'], $html);
            if ($h !== $o) { $bd = backup_dir_for($p['path']); if (!is_dir($bd)) mkdir($bd, 0755, true); copy($abs, $bd . '/' . backup_name()); file_put_contents($abs, $h, LOCK_EX); $n++; }
        }
        act('blocks', 'blocks_sync');
        out(['ok' => true, 'changed' => $n]);

    case 'theme_get':
        require_auth();
        $f = PRIVATE_DIR . '/theme.json';
        out(['ok' => true, 'vars' => is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: new stdClass) : new stdClass]);

    default:
        fail('Unknown action');
}
