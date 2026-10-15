<?php
/**
 * Woodex Admin v2 — Phase A7: media library, site backups, site health.
 * Included by api/admin.php. Mirrors tools/frontend-v1-admin.mjs a7() one-to-one.
 * Images are resized/converted in the browser (canvas), so no GD/Imagick is required on the server.
 * Backups are .zip files (ZipArchive) containing pages, _private data files, a MySQL dump (db-dump.json) and, for weekly/full, all images.
 */
declare(strict_types=1);
if (!defined('PRIVATE_DIR')) { http_response_code(404); exit; }

const MEDIA_FILE = PRIVATE_DIR . '/media.json';
const MTRASH_DIR = PRIVATE_DIR . '/media-trash';
const SBK_DIR    = PRIVATE_DIR . '/site-backups';
const HEALTH_FILE = PRIVATE_DIR . '/health.json';
const IMG_DIRS   = ['assets/img', 'assets/uploads'];
const SITE_URL_DEF = 'https://woodex.com.pk';

function a7_sniff(string $b): ?string {
    if (strncmp($b, "\xFF\xD8", 2) === 0) return 'jpg'; if (strncmp($b, "\x89PNG", 4) === 0) return 'png';
    if (substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WEBP') return 'webp'; if (substr($b, 0, 3) === 'GIF') return 'gif'; return null;
}
function a7_media_ok($u): bool { return is_string($u) && preg_match('~^/assets/(img|uploads)/([a-z0-9-]+/)?[a-z0-9][a-z0-9._-]*\.(webp|jpe?g|png|gif|svg|avif)$~i', $u) && strpos($u, '..') === false; }
function a7_walk(string $dir, string $re, bool $skipReserved = false): array {
    $out = []; if (!is_dir($dir)) return $out;
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..') continue; $a = $dir . '/' . $f;
        if (is_dir($a)) { if ($skipReserved && realpath($dir) === realpath(ROOT_DIR) && preg_match('~^(_private|builder|admin|api|assets|node_modules)$~', $f)) continue; $out = array_merge($out, a7_walk($a, $re, $skipReserved)); }
        elseif (preg_match($re, $f)) $out[] = $a;
    }
    return $out;
}
function a7_rel(string $a): string { return ltrim(str_replace('\\', '/', substr($a, strlen(ROOT_DIR))), '/'); }
function a7_pages(): array { return array_map('a7_rel', a7_walk(ROOT_DIR, '~\.html$~', true)); }
function a7_corpus(): array {
    $c = []; foreach (a7_pages() as $r) $c[$r] = (string)file_get_contents(ROOT_DIR . '/' . $r);
    foreach (a7_walk(ROOT_DIR . '/assets', '~\.(css|js)$~') as $a) $c[a7_rel($a)] = (string)file_get_contents($a);
    foreach (glob(PRIVATE_DIR . '/*.json') ?: [] as $f) if (!preg_match('~/(media|health|db|config|redirects)\.json$~', $f)) $c['_private/' . basename($f)] = (string)file_get_contents($f);
    // stored content in MySQL settings (company logo etc.)
    try { foreach (q("SELECT k, v FROM wx_settings")->fetchAll() as $row) $c['_private/settings-' . $row['k'] . '.json'] = (string)$row['v']; } catch (Throwable $e) {}
    return $c;
}
function a7_media(): array { $m = jread(MEDIA_FILE); $m['alt'] = $m['alt'] ?? []; $m['trash'] = $m['trash'] ?? []; $m['seq'] = (int)($m['seq'] ?? 0); return $m; }
function a7_now(): string { return gmdate('Y-m-d H:i:s'); }

// ---------------------------------------------------------------- backups
function a7_bk_list(): array {
    $out = []; foreach (glob(SBK_DIR . '/*.zip') ?: [] as $f) { $n = basename($f); if (!preg_match('~^(daily|weekly|full|safety|upload)-\d{8}-\d{6}\.zip$~', $n)) continue; $out[] = ['name' => $n, 'kind' => explode('-', $n)[0], 'size' => filesize($f), 'at' => gmdate('Y-m-d H:i:s', filemtime($f))]; }
    usort($out, fn($a, $b) => strcmp($b['name'], $a['name'])); return $out;
}
function a7_backup(string $kind, ?array $u = null): array {
    if (!class_exists('ZipArchive')) fail('The ZipArchive PHP extension is not enabled on this hosting');
    if (!is_dir(SBK_DIR)) mkdir(SBK_DIR, 0750, true);
    @file_put_contents(SBK_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
    @set_time_limit(300);
    $name = $kind . '-' . gmdate('Ymd-His') . '.zip'; $z = new ZipArchive();
    if ($z->open(SBK_DIR . '/' . $name, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) fail('Could not create the backup file');
    $add = function (string $rel) use ($z) { $a = ROOT_DIR . '/' . $rel; if (is_file($a)) $z->addFile($a, $rel); elseif (is_dir($a)) foreach (a7_walk($a, '~.~') as $f) $z->addFile($f, a7_rel($f)); };
    foreach (a7_pages() as $r) $add($r);
    foreach (['sitemap.xml', 'robots.txt', '.htaccess', 'assets/site.js', 'assets/js', 'assets/v1-p21.css'] as $r) $add($r);
    foreach (scandir(PRIVATE_DIR) ?: [] as $f) if ($f[0] !== '.' && !preg_match('~^(backups|site-backups|media-trash|trash)$~', $f)) $add('_private/' . $f);
    if ($kind !== 'daily') foreach (IMG_DIRS as $d) $add($d);
    // MySQL dump (all wx_ tables) as JSON
    $z->addFromString('db-dump.json', json_encode(a7_db_dump(), JSON_UNESCAPED_UNICODE));
    $z->close();
    foreach (['daily' => 7, 'weekly' => 4, 'full' => 10, 'safety' => 3, 'upload' => 5] as $k => $keep) { $fs = glob(SBK_DIR . '/' . $k . '-*.zip') ?: []; sort($fs); while (count($fs) > $keep) @unlink(array_shift($fs)); }
    return ['name' => $name, 'size' => filesize(SBK_DIR . '/' . $name), 'by' => $u['name'] ?? 'cron'];
}
function a7_backup_auto(): array {
    $l = a7_bk_list(); $age = function ($k) use ($l) { foreach ($l as $b) if ($b['kind'] === $k) return (time() - filemtime(SBK_DIR . '/' . $b['name'])) / 3600; return 1e9; };
    $made = []; if ($age('daily') > 20) $made[] = a7_backup('daily')['name']; if ($age('weekly') > 24 * 6.5) $made[] = a7_backup('weekly')['name'];
    $h = jread(HEALTH_FILE); $h['lastCron'] = a7_now(); jwrite(HEALTH_FILE, $h); return $made;
}
function a7_db_dump(): array { $d = []; foreach (q("SHOW TABLES LIKE 'wx\\_%'")->fetchAll(PDO::FETCH_NUM) as $t) $d[$t[0]] = q('SELECT * FROM `' . $t[0] . '`')->fetchAll(); return $d; }
/** Tables never overwritten by a restore (security audit F-04): logins/roles stay as they are now. */
const A7_DB_KEEP = ['wx_throttle', 'wx_users'];
/** Files never written by a restore (security audit F-03): secrets, sessions, dot-files like .htaccess. */
function a7_restore_blocked(string $n): bool {
    if (strpos($n, '..') !== false || $n === '' || $n[0] === '/' || strpos($n, "\\") !== false || strpos($n, "\0") !== false) return true;
    if (preg_match('~^(api|admin|builder|tools|deploy)/~', $n)) return true;
    if (preg_match('~(^|/)\.~', $n)) return true; // .htaccess, .user.ini, any dot-file
    if (preg_match('~\.(php\d?|phtml|phar|pht|cgi|pl|py|sh|exe|htaccess|ini)$~i', $n)) return true;
    if (preg_match('~^_private/(config|security|db|mcp|google|google-sa|login-attempts)\.json$~', $n)) return true;
    if (preg_match('~^_private/.*/~', $n)) return true; // no sub-folders (backups, trash)
    return false;
}
function a7_db_restore(array $dump): int {
    $have = array_map(fn($r) => $r[0], q("SHOW TABLES LIKE 'wx\\_%'")->fetchAll(PDO::FETCH_NUM)); $n = 0;
    $pdo = db(); $pdo->beginTransaction();
    try {
        foreach ($dump as $table => $rows) {
            if (!is_string($table) || !preg_match('~^wx_[a-z0-9_]+$~', $table) || in_array($table, A7_DB_KEEP, true) || !in_array($table, $have, true) || !is_array($rows)) continue;
            $pdo->exec('DELETE FROM `' . $table . '`');
            foreach ($rows as $row) { if (!is_array($row) || !$row) continue; $cols = array_keys($row); foreach ($cols as $c) if (!preg_match('~^[a-z0-9_]+$~i', (string)$c)) continue 2; $pdo->prepare('INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($row)); $n++; }
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    return $n;
}
/** Phase 7 — raw uploads / downloads: backup_up (zip body), db_dl (JSON download), db_up (JSON body). Owner only (security audit F-03/F-04: backups hold secrets + user table). */
function media_raw(string $action): void {
    $u = current_user(); if (!$u || $u['role'] !== 'owner') fail('Only the owner can download, upload or restore backups', 403);
    if ($action === 'db_dl') { $j = json_encode(['woodexDb' => 1, 'exported' => a7_now(), 'tables' => a7_db_dump()], JSON_UNESCAPED_UNICODE); log_act($u, 'db.export', strlen($j) . ' bytes'); header('Content-Type: application/json'); header('Content-Disposition: attachment; filename="woodex-database-' . gmdate('Ymd-His') . '.json"'); header('Cache-Control: no-store'); echo $j; exit; }
    @set_time_limit(300); $raw = (string)file_get_contents('php://input'); if ($raw === '') fail('The file was empty or too large for the server upload limit');
    if ($action === 'backup_up') {
        if (!class_exists('ZipArchive')) fail('The ZipArchive PHP extension is not enabled on this hosting');
        if (substr($raw, 0, 2) !== 'PK') fail('That is not a .zip backup file');
        if (!is_dir(SBK_DIR)) mkdir(SBK_DIR, 0750, true);
        $name = 'upload-' . gmdate('Ymd-His') . '.zip'; $f = SBK_DIR . '/' . $name; file_put_contents($f, $raw, LOCK_EX);
        $z = new ZipArchive(); $ok = $z->open($f) === true; $valid = false;
        if ($ok) { for ($i = 0; $i < $z->numFiles; $i++) { $n = $z->getNameIndex($i); if (strpos($n, '..') !== false || $n[0] === '/') { $valid = false; break; } if ($n === 'db-dump.json' || $n === 'index.html') $valid = true; } $z->close(); }
        if (!$ok || !$valid) { @unlink($f); fail('This zip is not a Woodex backup (it must contain index.html or db-dump.json)'); }
        foreach (['upload' => 5] as $k => $keep) { $fs = glob(SBK_DIR . '/' . $k . '-*.zip') ?: []; sort($fs); while (count($fs) > $keep) @unlink(array_shift($fs)); }
        log_act($u, 'backup.upload', $name); out(['ok' => true, 'name' => $name, 'size' => strlen($raw)]);
    }
    if ($action === 'db_up') {
        $j = json_decode($raw, true); $tables = is_array($j) ? ($j['tables'] ?? $j) : null;
        if (!is_array($tables) || !array_filter(array_keys($tables), fn($k) => is_string($k) && str_starts_with($k, 'wx_'))) fail('This is not a Woodex database file');
        $s = a7_backup('safety', $u); $n = a7_db_restore($tables);
        log_act($u, 'db.import', $n . ' rows (safety copy ' . $s['name'] . ')'); out(['ok' => true, 'rows' => $n, 'safety' => $s['name']]);
    }
    fail('Unknown action');
}
function a7_restore(string $file): void {
    @set_time_limit(300); $z = new ZipArchive(); if ($z->open($file) !== true) fail('Could not open the backup');
    $root = realpath(ROOT_DIR);
    for ($i = 0; $i < $z->numFiles; $i++) {
        $n = $z->getNameIndex($i); if ($n === 'db-dump.json' || substr($n, -1) === '/') continue;
        if (a7_restore_blocked($n)) continue; // never write code, secrets or server config
        $dst = $root . '/' . $n; if (!is_dir(dirname($dst))) mkdir(dirname($dst), 0755, true); file_put_contents($dst, $z->getFromIndex($i), LOCK_EX);
    }
    $dump = json_decode((string)$z->getFromName('db-dump.json'), true); $z->close();
    if (is_array($dump)) a7_db_restore($dump);
}

// ---------------------------------------------------------------- health
function a7_health_scan(): array {
    $redir = array_map(fn($r) => rtrim((string)$r['from'], '/'), jread(PRIVATE_DIR . '/redirects.json'));
    $pages = a7_pages(); $issues = []; $titles = []; $sizes = [];
    $add = function ($rel, $type, $sev, $msg, $extra = []) use (&$issues) { $issues[] = array_merge(['rel' => $rel, 'type' => $type, 'sev' => $sev, 'msg' => $msg], $extra); };
    $fileFor = function (string $href): string { $p = rawurldecode(preg_split('~[?#]~', $href)[0]); if ($p === '' || $p === '/') return 'index.html'; $p = ltrim($p, '/'); if (substr($p, -1) === '/') return $p . 'index.html'; return preg_match('~\.[a-z0-9]+$~i', $p) ? $p : $p . '/index.html'; };
    foreach ($pages as $rel) {
        if ($rel === '404.html') continue; $h = (string)file_get_contents(ROOT_DIR . '/' . $rel);
        $title = preg_match('~<title[^>]*>(.*?)</title>~is', $h, $m) ? trim(html_entity_decode($m[1])) : '';
        $desc = preg_match('~<meta[^>]+name="description"[^>]*content="([^"]*)"~i', $h, $m) ? html_entity_decode($m[1]) : null;
        if ($title === '') $add($rel, 'seo', 3, 'Missing page title'); else { $tl = mb_strlen($title); if ($tl > 65) $add($rel, 'seo', 1, "Title is long ($tl characters, aim for 60)"); if ($tl < 20) $add($rel, 'seo', 1, 'Title is very short'); $titles[$title][] = $rel; }
        if (!$desc) $add($rel, 'seo', 2, 'Missing meta description'); else { $dl = mb_strlen($desc); if ($dl > 165) $add($rel, 'seo', 1, "Description is long ($dl, aim for 150-158)"); elseif ($dl < 70) $add($rel, 'seo', 1, "Description is short ($dl)"); }
        $main = preg_replace('~<script[\s\S]*?</script>~i', '', $h); $h1 = preg_match_all('~<h1[\s>]~i', $main);
        if ($h1 === 0) $add($rel, 'seo', 2, 'No main heading (H1)'); elseif ($h1 > 1) $add($rel, 'seo', 1, "$h1 main headings (H1), use one");
        if (!preg_match('~<link[^>]+rel="canonical"~i', $h)) $add($rel, 'seo', 1, 'No canonical link');
        $noAlt = 0; preg_match_all('~<img\b[^>]*>~i', $main, $im); foreach ($im[0] as $t) { $has = preg_match('~\salt\s*=\s*"([^"]*)"~i', $t, $am); if ((!$has || trim($am[1]) === '') && !preg_match('~aria-hidden="true"|role="presentation"~', $t)) $noAlt++; }
        if ($noAlt) $add($rel, 'alt', 2, "$noAlt image(s) without alt text", ['count' => $noAlt]);
        $seen = [];
        preg_match_all('~\shref="(/[^"]*)"~i', $main, $lm); foreach ($lm[1] as $href) { if (preg_match('~^//|^/(api|admin|builder)/~', $href) || isset($seen[$href])) continue; $seen[$href] = 1; if (!is_file(ROOT_DIR . '/' . $fileFor($href)) && !in_array(rtrim(preg_split('~[?#]~', $href)[0], '/'), $redir, true)) $add($rel, 'link', 3, 'Broken link: ' . $href, ['target' => $href]); }
        preg_match_all('~\s(?:src|href|content)="((?:https://woodex\.com\.pk)?/assets/[^"]+\.(?:webp|jpe?g|png|gif|svg|avif))"~i', $main, $mm);
        foreach ($mm[1] as $u) { $u = str_replace(SITE_URL_DEF, '', $u); if (isset($seen[$u])) continue; $seen[$u] = 1; $f = ROOT_DIR . explode('?', $u)[0];
            if (!is_file($f)) { $add($rel, 'image', 3, 'Missing image: ' . $u, ['target' => $u]); continue; }
            $sz = $sizes[$u] ?? ($sizes[$u] = filesize($f)); if ($sz > 350 * 1024) $add($rel, 'image', 1, 'Large image ' . basename($u) . ' (' . round($sz / 1024) . ' KB)', ['target' => $u, 'size' => $sz]); }
    }
    foreach ($titles as $rels) if (count($rels) > 1) foreach ($rels as $r) $add($r, 'seo', 1, 'Same title as ' . (count($rels) - 1) . ' other page(s)');
    $pen = 0; foreach ($issues as $i) $pen += $i['sev'] === 3 ? 3 : ($i['sev'] === 2 ? 1.2 : 0.35);
    $score = (int)max(0, min(100, round(100 - $pen * 100 / max(1, count($pages) * 4))));
    $counts = []; foreach (['seo', 'alt', 'link', 'image'] as $k) $counts[$k] = count(array_filter($issues, fn($i) => $i['type'] === $k));
    return ['score' => $score, 'pages' => count($pages), 'at' => a7_now(), 'issues' => $issues, 'counts' => $counts];
}

// ---------------------------------------------------------------- actions
/* P18 C: responsive sizes — name.w480.webp / .w960 / .w1600 next to the original, plus srcset on every page using it */
const RS_W = [480, 960, 1600];
function rs_variant(string $url, int $w): string { return preg_replace('~\.[a-z0-9]+$~i', '', $url) . '.w' . $w . '.webp'; }
function rs_have(string $url): array { $o = []; foreach (RS_W as $w) if (is_file(ROOT_DIR . rs_variant($url, $w))) $o[] = $w; return $o; }
/* older P15 copies: name-480.webp / name-960.webp (+ hand-written srcset on pages) */
function rs_legacy(string $url): array { $o = []; $st = preg_replace('~\.[a-z0-9]+$~i', '', $url); foreach (RS_W as $w) if (is_file(ROOT_DIR . $st . '-' . $w . '.webp')) $o[] = $w; return $o; }
function rs_is_legacy_copy(string $abs): bool { if (!preg_match('~^(.*)-(480|960|1600)\.webp$~', $abs, $m)) return false; foreach (['webp', 'jpg', 'jpeg', 'png'] as $e) if (is_file($m[1] . '.' . $e)) return true; return false; }
function rs_apply(string $url, int $ow): int {
    $have = rs_have($url); $set = [];
    foreach ($have as $w) $set[] = rs_variant($url, $w) . ' ' . $w . 'w';
    if ($set && $ow > end($have)) $set[] = $url . ' ' . $ow . 'w';
    $attr = $set ? ' srcset="' . implode(', ', $set) . '" sizes="(max-width: 640px) 100vw, (max-width: 1200px) 80vw, 1200px" data-wx-rs' : '';
    $pages = 0;
    foreach (a7_pages() as $rel) {
        $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); if (strpos($h, $url) === false) continue;
        $n = preg_replace_callback('~<img\b[^>]*>~i', function ($m) use ($url, $attr) {
            $t = $m[0]; if (!preg_match('~\ssrc="(' . preg_quote(SITE_URL_DEF, '~') . ')?' . preg_quote($url, '~') . '(\?v=\d+)?"~', $t)) return $t;
            if (preg_match('~\ssrcset="([^"]*)"~i', $t, $sm) && strpos($t, 'data-wx-rs') === false && !preg_match('~' . preg_quote(preg_replace('~\.[a-z0-9]+$~i', '', $url), '~') . '-\d+\.webp~', $sm[1])) return $t; // hand-made srcset (not the old P15 copies): leave alone
            $t = preg_replace(['~\ssrcset="[^"]*"~i', '~\ssizes="[^"]*"~i', '~\sdata-wx-rs(="")?~'], '', $t);
            return $attr === '' ? $t : preg_replace('~^<img~i', '<img' . $attr, $t, 1);
        }, $h);
        if ($n !== $h) { cms_file_backup($rel); file_put_contents($abs, $n, LOCK_EX); $pages++; }
    }
    return $pages;
}

// P19 B7: after a replace, drop stale size copies and stamp ?v= on every use so browsers/CDN load the new picture
function media_bust(string $url): int {
    foreach (rs_have($url) as $w) @unlink(ROOT_DIR . rs_variant($url, $w));
    rs_apply($url, 0); $v = time(); $pages = 0;
    foreach (a7_pages() as $rel) {
        $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); if (strpos($h, $url) === false) continue;
        $n = preg_replace('~' . preg_quote($url, '~') . '(\?v=\d+)?(?=["\'\s),])~', $url . '?v=' . $v, $h);
        if ($n !== $h) { file_put_contents($abs, $n, LOCK_EX); $pages++; }
    }
    return $pages;
}

function media_actions(string $action, array $in): bool {
    if (!preg_match('~^(media_|backup_|health_)~', $action)) return false;
    $ED = ['owner', 'admin', 'editor']; $OA = ['owner', 'admin'];
    switch ($action) {
        case 'media_list':
            need($ED); $m = a7_media(); $corpus = a7_corpus(); $files = [];
            foreach (IMG_DIRS as $d) foreach (a7_walk(ROOT_DIR . '/' . $d, '~\.(webp|jpe?g|png|gif|svg|avif)$~i') as $a) {
                if (preg_match('~\.w(480|960|1600)\.webp$~', $a) || rs_is_legacy_copy($a)) continue; // responsive copies are shown on their original
                $url = '/' . a7_rel($a); $base = ltrim($url, '/'); $name = basename($a); $used = [];
                foreach ($corpus as $r => $t) if (strpos($t, $base) !== false || (strlen($name) > 10 && strpos($t, $name) !== false)) $used[] = $r;
                $sub = trim(str_replace('\\', '/', substr(dirname($a), strlen(ROOT_DIR . '/' . $d))), '/');
                $files[] = ['url' => $url, 'name' => $name, 'folder' => $d === 'assets/img' ? 'site' : ($sub ?: 'uploads'), 'size' => filesize($a), 'mtime' => gmdate('Y-m-d H:i:s', filemtime($a)), 'alt' => $m['alt'][$url] ?? '', 'used' => $used, 'sizes' => rs_have($url) ?: rs_legacy($url)];
            }
            usort($files, fn($a, $b) => strcmp($b['mtime'], $a['mtime']));
            $folders = []; foreach (glob(ROOT_DIR . '/assets/uploads/*', GLOB_ONLYDIR) ?: [] as $f) $folders[] = basename($f);
            out(['ok' => true, 'files' => $files, 'folders' => $folders, 'trash' => count($m['trash'])]);
        case 'media_sizes':
            $u = need($ED); $url = (string)($in['url'] ?? ''); if (!a7_media_ok($url) || !preg_match('~\.(jpe?g|png|webp)$~i', $url) || preg_match('~\.w\d+\.webp$~', $url)) fail('Invalid image');
            if (!is_file(ROOT_DIR . $url)) fail('Image not found', 404); $ow = max(1, (int)($in['ow'] ?? 0)); $files = is_array($in['files'] ?? null) ? $in['files'] : [];
            foreach (RS_W as $w) { $f = ROOT_DIR . rs_variant($url, $w); if (is_file($f)) @unlink($f); }
            $made = [];
            foreach (RS_W as $w) { if (!isset($files[(string)$w]) || $w >= $ow) continue; $d = base64_decode((string)$files[(string)$w], true); if ($d === false || $d === '' || strlen($d) > 3 * 1024 * 1024 || a7_sniff($d) !== 'webp') fail("Size {$w}px is not a valid WebP image"); file_put_contents(ROOT_DIR . rs_variant($url, $w), $d, LOCK_EX); $made[] = $w; }
            $pages = rs_apply($url, $ow); log_act($u, 'media.sizes', $url . ' ' . implode('/', $made)); out(['ok' => true, 'sizes' => $made, 'pages' => $pages]);
        case 'media_folder':
            need($ED); $n = trim(preg_replace('~[^a-z0-9]+~', '-', strtolower((string)($in['name'] ?? ''))), '-'); $n = substr($n, 0, 40); if ($n === '') fail('Folder name: letters and numbers');
            if (!is_dir(ROOT_DIR . '/assets/uploads/' . $n)) mkdir(ROOT_DIR . '/assets/uploads/' . $n, 0755, true); out(['ok' => true, 'name' => $n]);
        case 'media_upload':
        case 'media_replace':
            $u = need($action === 'media_upload' ? $ED : $OA); $data = base64_decode((string)($in['data'] ?? ''), true);
            if ($data === false || $data === '' || strlen($data) > 8 * 1024 * 1024) fail('Image is empty or larger than 8 MB'); $ext = a7_sniff($data); if (!$ext) fail('Only JPG, PNG, WebP or GIF images are allowed');
            if ($action === 'media_replace') {
                $url = (string)($in['url'] ?? ''); if (!a7_media_ok($url)) fail('Invalid image'); $abs = ROOT_DIR . $url; if (!is_file($abs)) fail('Image not found', 404);
                $cur = str_replace('jpeg', 'jpg', strtolower(pathinfo($abs, PATHINFO_EXTENSION))); if ($cur !== $ext) fail("The new file must be the same format ($cur)");
                $m = a7_media(); if (!is_dir(MTRASH_DIR)) mkdir(MTRASH_DIR, 0750, true); $tf = time() . '-' . basename($abs); copy($abs, MTRASH_DIR . '/' . $tf);
                $before = filesize($abs); $m['trash'][] = ['id' => ++$m['seq'], 'url' => $url, 'file' => $tf, 'size' => $before, 'at' => a7_now(), 'by' => $u['name'], 'why' => 'replaced']; jwrite(MEDIA_FILE, $m);
                file_put_contents($abs, $data, LOCK_EX); $bp = media_bust($url); log_act($u, 'media.optimise', $url); out(['ok' => true, 'pages' => $bp, 'url' => $url, 'before' => $before, 'after' => strlen($data)]);
            }
            $folder = preg_replace('~[^a-z0-9-]~', '', (string)($in['folder'] ?? '')); $dir = ROOT_DIR . '/assets/uploads' . ($folder ? '/' . $folder : ''); if ($folder && !is_dir($dir)) fail('Folder not found');
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $base = trim(preg_replace('~[^a-z0-9]+~', '-', preg_replace('~\.[a-z0-9]+$~', '', strtolower((string)($in['name'] ?? 'image')))), '-') ?: 'image'; $name = substr($base, 0, 40) . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
            file_put_contents($dir . '/' . $name, $data, LOCK_EX); $url = '/assets/uploads/' . ($folder ? $folder . '/' : '') . $name;
            if (!empty($in['alt'])) { $m = a7_media(); $m['alt'][$url] = clip($in['alt'], 200); jwrite(MEDIA_FILE, $m); }
            log_act($u, 'media.upload', $url); out(['ok' => true, 'url' => $url, 'size' => strlen($data)]);
        case 'media_alt':
            $u = need($ED); $url = (string)($in['url'] ?? ''); $alt = clip($in['alt'] ?? '', 200); if (!a7_media_ok($url)) fail('Invalid image');
            $m = a7_media(); $m['alt'][$url] = $alt; jwrite(MEDIA_FILE, $m); $pages = 0;
            if (!empty($in['apply']) && $alt !== '') {
                $ea = htmlspecialchars($alt, ENT_QUOTES | ENT_HTML5);
                foreach (a7_pages() as $rel) {
                    $abs = ROOT_DIR . '/' . $rel; $h = (string)file_get_contents($abs); if (strpos($h, $url) === false) continue;
                    $n = preg_replace_callback('~<img\b[^>]*>~i', function ($mm) use ($url, $ea) { $t = $mm[0]; if (strpos($t, 'src="' . $url . '"') === false && strpos($t, 'src="' . SITE_URL_DEF . $url . '"') === false) return $t; if (preg_match('~\salt="[^"]+"~', $t)) return $t; return preg_match('~\salt=""~', $t) ? preg_replace('~\salt=""~', ' alt="' . $ea . '"', $t, 1) : preg_replace('~^<img~i', '<img alt="' . $ea . '"', $t, 1); }, $h);
                    if ($n !== $h) { cms_file_backup($rel); file_put_contents($abs, $n, LOCK_EX); $pages++; }
                }
            }
            log_act($u, 'media.alt', $url); out(['ok' => true, 'pages' => $pages]);
        case 'media_move':
            $u = need($ED); $to = preg_replace('~[^a-z0-9-]~', '', (string)($in['folder'] ?? '')); $dir = ROOT_DIR . '/assets/uploads' . ($to ? '/' . $to : ''); if ($to && !is_dir($dir)) fail('Folder not found');
            $urls = array_slice(array_values(array_filter(is_array($in['urls'] ?? null) ? $in['urls'] : [], 'a7_media_ok')), 0, 200); $corpus = a7_corpus(); $m = a7_media(); $moved = []; $blocked = [];
            foreach ($urls as $url) {
                $abs = ROOT_DIR . $url; if (!is_file($abs) || strpos($url, '/assets/uploads/') !== 0) { $blocked[] = $url; continue; }
                $hit = false; foreach ($corpus as $t) if (strpos($t, ltrim($url, '/')) !== false) { $hit = true; break; } if ($hit) { $blocked[] = $url; continue; }
                $nu = '/assets/uploads/' . ($to ? $to . '/' : '') . basename($abs); if ($nu === $url) continue; if (is_file(ROOT_DIR . $nu)) { $blocked[] = $url; continue; }
                rename($abs, ROOT_DIR . $nu); if (isset($m['alt'][$url])) { $m['alt'][$nu] = $m['alt'][$url]; unset($m['alt'][$url]); } $moved[] = $nu;
            }
            jwrite(MEDIA_FILE, $m); log_act($u, 'media.move', count($moved) . ' → ' . ($to ?: 'uploads')); out(['ok' => true, 'moved' => $moved, 'blocked' => $blocked]);
        case 'media_trash':
            $u = need($OA); $m = a7_media(); $urls = array_slice(array_values(array_filter(is_array($in['urls'] ?? null) ? $in['urls'] : [], 'a7_media_ok')), 0, 200);
            $corpus = !empty($in['force']) ? [] : a7_corpus(); $moved = []; $blocked = []; if (!is_dir(MTRASH_DIR)) mkdir(MTRASH_DIR, 0750, true);
            foreach ($urls as $url) {
                $abs = ROOT_DIR . $url; if (!is_file($abs)) continue; $hit = false; foreach ($corpus as $t) if (strpos($t, ltrim($url, '/')) !== false) { $hit = true; break; }
                if ($hit) { $blocked[] = $url; continue; }
                $tf = time() . '-' . bin2hex(random_bytes(2)) . '-' . basename($abs); $m['trash'][] = ['id' => ++$m['seq'], 'url' => $url, 'file' => $tf, 'size' => filesize($abs), 'at' => a7_now(), 'by' => $u['name'], 'why' => 'deleted']; rename($abs, MTRASH_DIR . '/' . $tf); $moved[] = $url; foreach (RS_W as $w) { $vf = ROOT_DIR . rs_variant($url, $w); if (is_file($vf)) @unlink($vf); } if (!empty($in['force'])) rs_apply($url, 0);
            }
            jwrite(MEDIA_FILE, $m); log_act($u, 'media.trash', count($moved) . ' file(s)'); out(['ok' => true, 'moved' => $moved, 'blocked' => $blocked]);
        case 'media_trash_list': need($OA); out(['ok' => true, 'trash' => array_reverse(a7_media()['trash'])]);
        case 'media_restore':
        case 'media_purge':
            $u = need($OA); $m = a7_media(); $ids = !empty($in['all']) ? array_column($m['trash'], 'id') : [(int)($in['id'] ?? 0)]; $n = 0;
            foreach ($ids as $id) {
                $i = null; foreach ($m['trash'] as $k => $t) if ((int)$t['id'] === (int)$id) $i = $k; if ($i === null) continue; $t = $m['trash'][$i]; $src = MTRASH_DIR . '/' . basename($t['file']);
                if ($action === 'media_restore') { if (!a7_media_ok($t['url'])) continue; $dst = ROOT_DIR . $t['url']; if (is_file($dst) && $t['why'] !== 'replaced') fail('A file with that name exists again'); if (!is_dir(dirname($dst))) mkdir(dirname($dst), 0755, true); if (is_file($src)) copy($src, $dst); }
                if (is_file($src)) unlink($src); array_splice($m['trash'], $i, 1); $n++;
            }
            jwrite(MEDIA_FILE, $m); log_act($u, $action === 'media_restore' ? 'media.restore' : 'media.purge', $n . ' file(s)'); out(['ok' => true, 'n' => $n]);
        case 'backup_list': need($OA); $h = jread(HEALTH_FILE); out(['ok' => true, 'backups' => a7_bk_list(), 'lastCron' => $h['lastCron'] ?? null, 'format' => 'zip']);
        case 'backup_run': $u = need(['owner']); $b = a7_backup(($in['kind'] ?? '') === 'daily' ? 'daily' : 'full', $u); log_act($u, 'backup.create', $b['name']); out(['ok' => true, 'backup' => $b]);
        case 'backup_delete':
            $u = need(['owner']); foreach (a7_bk_list() as $b) if ($b['name'] === ($in['name'] ?? '')) { unlink(SBK_DIR . '/' . $b['name']); log_act($u, 'backup.delete', $b['name']); out(['ok' => true]); }
            fail('Backup not found', 404);
        case 'backup_restore':
            $u = need(['owner']); foreach (a7_bk_list() as $b) if ($b['name'] === ($in['name'] ?? '')) { $s = a7_backup('safety', $u); a7_restore(SBK_DIR . '/' . $b['name']); log_act($u, 'backup.restore', $b['name'] . ' (safety copy ' . $s['name'] . ')'); out(['ok' => true, 'safety' => $s['name']]); }
            fail('Backup not found', 404);
        case 'health_get': need($ED); $h = jread(HEALTH_FILE); out(['ok' => true, 'scan' => $h['scan'] ?? null, 'psi' => (object)($h['psi'] ?? []), 'psiKeySet' => !empty($h['psiKey']), 'site' => $h['site'] ?? SITE_URL_DEF, 'lastCron' => $h['lastCron'] ?? null]);
        case 'health_scan': $u = need($ED); @set_time_limit(180); @ini_set('memory_limit', '256M'); $h = jread(HEALTH_FILE); try { $h['scan'] = a7_health_scan(); } catch (Throwable $e) { error_log('health_scan: ' . $e->getMessage()); fail('Health check stopped: ' . mb_substr($e->getMessage(), 0, 200), 500); } jwrite(HEALTH_FILE, $h); log_act($u, 'health.scan', $h['scan']['score'] . '/100'); out(['ok' => true, 'scan' => $h['scan']]);
        case 'health_settings':
            need($OA); $h = jread(HEALTH_FILE); if (is_string($in['psiKey'] ?? null) && $in['psiKey'] !== '') $h['psiKey'] = substr(trim($in['psiKey']), 0, 100); if (!empty($in['clearKey'])) unset($h['psiKey']);
            if (preg_match('~^https://[a-z0-9.-]+$~i', (string)($in['site'] ?? ''))) $h['site'] = $in['site']; jwrite(HEALTH_FILE, $h); out(['ok' => true, 'psiKeySet' => !empty($h['psiKey']), 'site' => $h['site'] ?? SITE_URL_DEF]);
        case 'health_speed': need($ED); $h = jread(HEALTH_FILE); out(['ok' => true, 'psi' => (object)($h['psi'] ?? []), 'psiKeySet' => !empty($h['psiKey']), 'site' => $h['site'] ?? SITE_URL_DEF]);
        case 'health_psi':
            need($ED); $h = jread(HEALTH_FILE); $rel = (string)($in['rel'] ?? 'index.html'); if (!preg_match('~^[a-z0-9][a-z0-9/_\-.]*\.html$~i', $rel) || strpos($rel, '..') !== false) fail('Invalid page');
            $strategy = ($in['strategy'] ?? '') === 'desktop' ? 'desktop' : 'mobile'; $url = ($h['site'] ?? SITE_URL_DEF) . '/' . preg_replace('~index\.html$~', '', $rel);
            $qs = http_build_query(['url' => $url, 'strategy' => $strategy] + (!empty($h['psiKey']) ? ['key' => $h['psiKey']] : [])) . '&category=performance&category=accessibility&category=best-practices&category=seo';
            @set_time_limit(120); $ch = curl_init('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' . $qs); curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 100]);
            $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $cerr = curl_error($ch); curl_close($ch); $j = json_decode((string)$raw, true);
            if ($raw === false) fail('PageSpeed: could not reach Google (' . mb_substr($cerr, 0, 160) . '). Open Settings → System check.', 502);
            if ($code === 429 || stripos((string)($j['error']['message'] ?? ''), 'quota') !== false) fail('PageSpeed: Google\'s shared free quota is used up. Add your own free PageSpeed API key in Settings → Integrations → PageSpeed (takes 1 minute at console.cloud.google.com).', 429);
            if ($code !== 200 || !isset($j['lighthouseResult'])) fail('PageSpeed: ' . substr((string)($j['error']['message'] ?? ('request failed, HTTP ' . $code)), 0, 200));
            $cat = $j['lighthouseResult']['categories']; $au = $j['lighthouseResult']['audits']; $sc = fn($k) => isset($cat[$k]['score']) ? (int)round($cat[$k]['score'] * 100) : null;
            $res = ['at' => a7_now(), 'strategy' => $strategy, 'perf' => $sc('performance'), 'a11y' => $sc('accessibility'), 'bp' => $sc('best-practices'), 'seo' => $sc('seo'), 'lcp' => $au['largest-contentful-paint']['displayValue'] ?? null, 'cls' => $au['cumulative-layout-shift']['displayValue'] ?? null, 'tbt' => $au['total-blocking-time']['displayValue'] ?? null, 'fcp' => $au['first-contentful-paint']['displayValue'] ?? null, 'si' => $au['speed-index']['displayValue'] ?? null, 'tips' => psi_tips($au)];
            $h = jread(HEALTH_FILE); $k = $rel . '|' . $strategy; $h['psi'][$k] = array_slice(array_merge([$res], $h['psi'][$k] ?? []), 0, 10); jwrite(HEALTH_FILE, $h); out(['ok' => true, 'result' => $res]);
    }
    return false;
}
/** Raw download of a backup file: GET/POST admin.php?action=backup_dl&name=… with the X-WX-ADM header. */
function media_download(): void {
    $u = current_user(); if (!$u || $u['role'] !== 'owner') { http_response_code(403); exit('Only the owner can download backups'); }
    $name = (string)($_GET['name'] ?? ''); foreach (a7_bk_list() as $b) if ($b['name'] === $name) {
        $f = SBK_DIR . '/' . $name; header('Content-Type: application/zip'); header('Content-Disposition: attachment; filename="woodex-' . $name . '"'); header('Content-Length: ' . filesize($f)); header('Cache-Control: no-store'); readfile($f); exit;
    }
    http_response_code(404); exit('Not found');
}

/* P15: top 5 PageSpeed suggestions (failed audits with the biggest estimated saving). */
function psi_tips(array $au): array {
    $t = [];
    foreach ($au as $id => $a) {
        if (!isset($a['score']) || $a['score'] === null || $a['score'] >= 0.9) continue;
        $ms = (float)($a['details']['overallSavingsMs'] ?? 0); $ms = max($ms, (float)($a['metricSavings']['LCP'] ?? 0), (float)($a['metricSavings']['FCP'] ?? 0));
        $kb = (float)($a['details']['overallSavingsBytes'] ?? 0) / 1024;
        if ($ms <= 0 && $kb <= 0 && ($a['scoreDisplayMode'] ?? '') !== 'metricSavings') continue;
        $t[] = ['id' => $id, 'title' => substr(strip_tags((string)($a['title'] ?? $id)), 0, 120), 'value' => substr((string)($a['displayValue'] ?? ''), 0, 60), 'ms' => (int)round($ms), 'kb' => (int)round($kb)];
    }
    usort($t, fn($x, $y) => ($y['ms'] <=> $x['ms']) ?: ($y['kb'] <=> $x['kb']));
    return array_slice($t, 0, 5);
}
