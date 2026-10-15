<?php
/**
 * Woodex — LOCAL TESTING ONLY router for PHP's built-in server (it ignores .htaccess).
 * Start:  php -S localhost:8000 router.php      (run inside the website folder)
 * Hostinger does NOT use this file (Apache/LiteSpeed reads .htaccess instead). Safe to upload; it does nothing there.
 * Gives local testing: maintenance / coming-soon mode, private folder protection, folder → index.html, 404 page.
 */
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$root = __DIR__;
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if (strpos($uri, '..') !== false || preg_match('~^/_private(/|$)~', $uri) || preg_match('~/\.(?!well-known)~', $uri)) { http_response_code(403); echo 'Forbidden'; return true; }

// maintenance / coming soon (same rules as the .htaccess block written by Admin)
$sys = is_file("$root/_private/system.json") ? (json_decode((string)file_get_contents("$root/_private/system.json"), true) ?: []) : [];
$m = $sys['maint'] ?? [];
if (!empty($m['on'])) {
    $free = preg_match('~^/(admin|api|builder|assets)(/|$)~', $uri) || preg_match('~^/(500|503|404|coming-soon)\.html$|^/(robots\.txt|favicon\.ico|sitemap\.xml)$~', $uri);
    $staff = !empty($m['token']) && ($_COOKIE['wx_mt'] ?? '') === $m['token'];
    $asVisitor = isset($_GET['asvisitor']);
    if ($asVisitor || (!$free && !$staff)) {
        http_response_code(503); header('Retry-After: 3600'); header('Cache-Control: no-store'); header('Content-Type: text/html; charset=utf-8');
        readfile("$root/coming-soon.html"); return true;
    }
}

$file = $root . $uri;
if (is_dir($file)) {
    if (substr($uri, -1) !== '/') { header('Location: ' . $uri . '/', true, 301); return true; }
    $file .= 'index.html';
    if (is_file($file)) { header('Content-Type: text/html; charset=utf-8'); readfile($file); return true; }
}
if (is_file($file)) return false; // let PHP serve the file (and run .php files)
http_response_code(404); header('Content-Type: text/html; charset=utf-8');
readfile("$root/404.html"); return true;
