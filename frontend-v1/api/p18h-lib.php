<?php
/**
 * P18 H — System (safe mode):
 *  - Maintenance / Coming-soon switch → managed .htaccess block (503 for visitors; staff carry a secret cookie wx_mt and still see the site).
 *  - Error pages 404 / 500 / 503 / coming-soon are normal pages (editable in the builder); ErrorDocument lines are managed here.
 *  - File manager: /assets only. Uploads + images are editable; js/css/fonts/vendor are read-only. Delete = move to trash (restorable).
 *  - Database: browse + search wx_* tables (secrets masked), CSV / SQL export. No raw SQL. Backups reuse the existing backup system.
 */
const SYS_FILE = PRIVATE_DIR . '/system.json';
const SYS_PAGES = ['404.html', '500.html', '503.html', 'coming-soon.html'];
const FM_ROOT = 'assets';
const FM_RO = ['assets/js', 'assets/css', 'assets/fonts', 'assets/vendor'];
const FM_TRASH = PRIVATE_DIR . '/trash';
const FM_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'ico', 'pdf', 'mp4', 'webm', 'mp3', 'woff2', 'woff', 'txt', 'csv', 'json', 'zip', 'docx', 'xlsx', 'pptx'];

function sys_cfg(): array {
    $d = jread(SYS_FILE); $m = array_merge(['on' => false, 'mode' => 'maintenance', 'token' => '', 'since' => null, 'by' => '', 'until' => '', 'title' => '', 'text' => ''], $d['maint'] ?? []);
    if ($m['token'] === '') { $m['token'] = bin2hex(random_bytes(16)); $d['maint'] = $m; jwrite(SYS_FILE, $d); }
    return $m;
}
/** Lines for the managed .htaccess block (called by publish_rules). [before IfModule, inside rewrite] */
function sys_ht_lines(): array {
    $m = sys_cfg(); $page = '/coming-soon.html'; // P19 B3: one designed page for both modes (wording follows the mode via launch.json)
    $pre = ['ErrorDocument 500 /500.html', 'ErrorDocument 503 ' . $page];
    if ($m['on']) { $pre[] = '<IfModule LiteSpeed>'; $pre[] = 'CacheDisable public /'; $pre[] = '</IfModule>'; $pre[] = '<IfModule mod_headers.c>'; $pre[] = 'Header always set Cache-Control "no-store" "expr=%{REQUEST_STATUS} == 503"'; $pre[] = 'Header always set Retry-After "3600" "expr=%{REQUEST_STATUS} == 503"'; $pre[] = '</IfModule>'; }
    $rw = [];
    if ($m['on']) {
        $rw[] = '# maintenance mode (Admin → System → Maintenance): visitors get 503, staff with the wx_mt cookie see the site';
        $rw[] = '# ?asvisitor=1 lets signed-in staff see exactly what visitors see';
        $rw[] = 'RewriteCond %{QUERY_STRING} (^|&)asvisitor=1';
        $rw[] = 'RewriteRule ^ - [R=503,L]';
        $rw[] = 'RewriteCond %{REQUEST_URI} !^/(admin|api|builder|assets)(/|$)';
        $rw[] = 'RewriteCond %{REQUEST_URI} !^/(500|503|404|coming-soon)\.html$';
        $rw[] = 'RewriteCond %{REQUEST_URI} !^/(robots\.txt|favicon\.ico|sitemap\.xml)$';
        $rw[] = 'RewriteCond %{HTTP_COOKIE} !(^|;\s*)wx_mt=' . $m['token'];
        $rw[] = 'RewriteRule ^ - [R=503,L]';
    }
    return [$pre, $rw];
}

// ---------------- file manager
function fm_path(string $rel, bool $mustExist = true): string {
    $rel = trim(str_replace('\\', '/', $rel), '/'); if ($rel === '') $rel = FM_ROOT;
    if (!preg_match('~^assets(/|$)~', $rel) || preg_match('~(^|/)\.\.?(/|$)~', $rel) || preg_match('~(^|/)\.~', $rel)) fail('Outside the allowed folder');
    $abs = ROOT_DIR . '/' . $rel; if ($mustExist && !file_exists($abs)) fail('Not found', 404);
    $root = realpath(ROOT_DIR . '/' . FM_ROOT); $real = realpath($mustExist ? $abs : dirname($abs));
    if (!$real || ($real !== $root && !str_starts_with($real, $root . '/'))) fail('Outside the allowed folder');
    return $abs;
}
function fm_ro(string $rel): bool { $rel = trim($rel, '/'); foreach (FM_RO as $r) if ($rel === $r || str_starts_with($rel, $r . '/')) return true; return $rel === FM_ROOT; }
function fm_clean_name(string $n): string { $n = preg_replace('~[^a-z0-9._-]+~', '-', strtolower(trim($n))); $n = trim(preg_replace('~-+~', '-', $n), '-.'); return $n; }
function fm_used(string $url): array {
    $hits = []; foreach (all_pages() as $rel) { if (count($hits) >= 8) break; if (strpos((string)file_get_contents(ROOT_DIR . '/' . $rel), $url) !== false) $hits[] = url_of($rel); } return $hits;
}

// ---------------- database
function dbx_tables(): array { return array_map(fn($r) => $r[0], q("SHOW TABLES LIKE 'wx\\_%'")->fetchAll(PDO::FETCH_NUM)); }
function dbx_table(string $t): string { if (!in_array($t, dbx_tables(), true)) fail('Unknown table'); return $t; }
function dbx_mask(string $col, $v) { if ($v === null) return null; if (preg_match('~(pass|hash|token|secret|otp|reset|key)~i', $col)) return '••••••'; return $v; }
function dbx_cols(string $t): array { return array_map(fn($r) => ['name' => $r['Field'], 'type' => $r['Type']], q('SHOW COLUMNS FROM `' . $t . '`')->fetchAll()); }

function p18h_actions(string $action, array $in): bool {
    if (!preg_match('~^(mt_|fm_|dbx_)~', $action)) return false;
    $OA = ['owner', 'admin']; $STAFF = ['owner', 'admin', 'editor', 'sales'];
    switch ($action) {
        // ---------- maintenance
        case 'mt_get':
            $u = need(); $m = sys_cfg();
            out(['ok' => true, 'on' => $m['on'], 'mode' => $m['mode'], 'since' => $m['since'], 'by' => $m['by'], 'token' => $m['token'], 'until' => $m['until'], 'title' => $m['title'], 'text' => $m['text'], 'pages' => array_map(fn($p) => ['path' => $p, 'url' => '/' . $p, 'exists' => is_file(ROOT_DIR . '/' . $p)], SYS_PAGES)]);
        case 'mt_set':
            $u = need($OA); $d = jread(SYS_FILE); $m = sys_cfg();
            $m['on'] = !empty($in['on']); $m['mode'] = ($in['mode'] ?? $m['mode']) === 'soon' ? 'soon' : 'maintenance';
            if ($m['on']) { $m['since'] = $m['since'] && !empty($d['maint']['on']) ? $m['since'] : now(); $m['by'] = $u['name']; } else { $m['since'] = null; }
            if (!empty($in['newToken'])) $m['token'] = bin2hex(random_bytes(16));
            if (array_key_exists('until', $in)) $m['until'] = preg_match('~^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}~', (string)$in['until']) ? substr(str_replace('T', ' ', (string)$in['until']), 0, 16) : '';
            foreach (['title' => 120, 'text' => 400] as $k => $n) if (array_key_exists($k, $in)) $m[$k] = mb_substr(trim(strip_tags((string)$in[$k])), 0, $n);
            $d = jread(SYS_FILE); $d['maint'] = $m; jwrite(SYS_FILE, $d); publish_rules();
            @mkdir(ROOT_DIR . '/assets/data', 0755, true); // P19 B3: public, non-secret settings for coming-soon.html (never the bypass token)
            @file_put_contents(ROOT_DIR . '/assets/data/launch.json', json_encode(['mode' => $m['mode'], 'until' => $m['until'], 'title' => $m['title'], 'text' => $m['text']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            log_act($u, 'maintenance.' . ($m['on'] ? 'on' : 'off'), $m['mode']); out(['ok' => true, 'on' => $m['on'], 'mode' => $m['mode'], 'since' => $m['since'], 'token' => $m['token']]);

        // ---------- file manager
        case 'fm_list':
            need($STAFF); $rel = trim((string)($in['dir'] ?? FM_ROOT), '/') ?: FM_ROOT; $abs = fm_path($rel); if (!is_dir($abs)) fail('Not a folder');
            $items = [];
            foreach (scandir($abs) ?: [] as $n) {
                if ($n[0] === '.') continue; $a = $abs . '/' . $n; $isD = is_dir($a);
                $items[] = ['name' => $n, 'path' => $rel . '/' . $n, 'dir' => $isD, 'size' => $isD ? null : filesize($a), 'mtime' => date('Y-m-d H:i', filemtime($a)), 'count' => $isD ? count(array_diff(scandir($a) ?: [], ['.', '..'])) : null, 'ro' => fm_ro($rel . '/' . $n)];
            }
            usort($items, fn($x, $y) => [$y['dir'], strtolower($x['name'])] <=> [$x['dir'], strtolower($y['name'])]);
            $t = []; if (is_dir(FM_TRASH)) foreach (glob(FM_TRASH . '/*.json') ?: [] as $j) $t[] = 1;
            out(['ok' => true, 'dir' => $rel, 'ro' => fm_ro($rel), 'items' => $items, 'trash' => count($t), 'maxUpload' => (string)ini_get('upload_max_filesize')]);
        case 'fm_upload':
            $u = need(['owner', 'admin', 'editor']); $rel = trim((string)($in['dir'] ?? ''), '/'); $abs = fm_path($rel); if (fm_ro($rel)) fail('This folder is read-only. Upload into assets/uploads or assets/img.');
            $raw = base64_decode(preg_replace('~^data:[^,]*,~', '', (string)($in['data'] ?? '')), true); if ($raw === false || $raw === '') fail('Upload failed (empty file)');
            if (strlen($raw) > 25 * 1048576) fail('Files up to 25 MB');
            $name = fm_clean_name((string)($in['name'] ?? '')); $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION)); if (!in_array($ext, FM_EXT, true)) fail('This file type is not allowed (.' . $ext . ')');
            if ($ext === 'svg' && preg_match('~<script|on[a-z]+\s*=|javascript:~i', $raw)) fail('This SVG contains scripts and was blocked');
            $base = pathinfo($name, PATHINFO_FILENAME); $dst = $abs . '/' . $name; $i = 2; while (file_exists($dst)) $dst = $abs . '/' . $base . '-' . $i++ . '.' . $ext;
            if (file_put_contents($dst, $raw, LOCK_EX) === false) fail('Could not save the file'); @chmod($dst, 0644);
            log_act($u, 'file.upload', $rel . '/' . basename($dst)); out(['ok' => true, 'path' => $rel . '/' . basename($dst)]);
        case 'fm_mkdir':
            $u = need(['owner', 'admin', 'editor']); $rel = trim((string)($in['dir'] ?? ''), '/'); $abs = fm_path($rel); if (fm_ro($rel)) fail('This folder is read-only');
            $n = fm_clean_name((string)($in['name'] ?? '')); if ($n === '' || str_contains($n, '.')) fail('Use letters, numbers and - only'); if (file_exists($abs . '/' . $n)) fail('Already exists');
            mkdir($abs . '/' . $n, 0755); log_act($u, 'file.mkdir', $rel . '/' . $n); out(['ok' => true]);
        case 'fm_rename':
            $u = need(['owner', 'admin', 'editor']); $rel = trim((string)($in['path'] ?? ''), '/'); $abs = fm_path($rel); if (fm_ro($rel) || fm_ro(dirname($rel)) && dirname($rel) !== FM_ROOT) fail('Files in this folder are read-only');
            if (fm_ro($rel)) fail('Read-only'); $n = fm_clean_name((string)($in['name'] ?? '')); if ($n === '') fail('Enter a name');
            if (is_file($abs)) { $old = strtolower(pathinfo($abs, PATHINFO_EXTENSION)); if (strtolower(pathinfo($n, PATHINFO_EXTENSION)) !== $old) $n = pathinfo($n, PATHINFO_FILENAME) . '.' . $old; }
            $dst = dirname($abs) . '/' . $n; if (file_exists($dst)) fail('A file with that name already exists');
            $url = '/' . $rel; $used = is_file($abs) ? fm_used($url) : [];
            if ($used && empty($in['force'])) out(['ok' => false, 'used' => $used, 'error' => 'This file is used on ' . count($used) . ' page(s). Renaming will break it there.']);
            rename($abs, $dst); log_act($u, 'file.rename', $rel . ' → ' . $n); out(['ok' => true, 'path' => dirname($rel) . '/' . $n]);
        case 'fm_delete':
            $u = need(['owner', 'admin', 'editor']); $rel = trim((string)($in['path'] ?? ''), '/'); $abs = fm_path($rel); if (fm_ro($rel)) fail('This item is read-only');
            if (is_dir($abs) && count(array_diff(scandir($abs) ?: [], ['.', '..']))) fail('The folder is not empty');
            $used = is_file($abs) ? fm_used('/' . $rel) : []; if ($used && empty($in['force'])) out(['ok' => false, 'used' => $used, 'error' => 'This file is used on ' . count($used) . ' page(s).']);
            if (!is_dir(FM_TRASH)) mkdir(FM_TRASH, 0750, true);
            if (is_dir($abs)) { rmdir($abs); out(['ok' => true]); }
            $id = date('Ymd-His') . '-' . substr(bin2hex(random_bytes(3)), 0, 6); rename($abs, FM_TRASH . '/' . $id . '.bin');
            jwrite(FM_TRASH . '/' . $id . '.json', ['path' => $rel, 'size' => filesize(FM_TRASH . '/' . $id . '.bin'), 't' => now(), 'by' => $u['name']]);
            foreach (glob(FM_TRASH . '/*.json') ?: [] as $j) if (filemtime($j) < time() - 30 * 86400) { @unlink($j); @unlink(substr($j, 0, -5) . '.bin'); }
            log_act($u, 'file.delete', $rel); out(['ok' => true, 'trash' => $id]);
        case 'fm_trash':
            need($STAFF); $L = []; foreach (glob(FM_TRASH . '/*.json') ?: [] as $j) { $m = jread($j); $L[] = ['id' => basename($j, '.json')] + $m; }
            usort($L, fn($a, $b) => strcmp($b['t'], $a['t'])); out(['ok' => true, 'items' => $L]);
        case 'fm_restore':
            $u = need(['owner', 'admin', 'editor']); $id = preg_replace('~[^0-9a-f-]~', '', (string)($in['id'] ?? '')); $j = FM_TRASH . '/' . $id . '.json'; if (!is_file($j)) fail('Not in the trash', 404);
            $m = jread($j); $abs = fm_path($m['path'], false); if (file_exists($abs)) fail('A file with the same name exists again at ' . $m['path']);
            if (!is_dir(dirname($abs))) mkdir(dirname($abs), 0755, true); rename(FM_TRASH . '/' . $id . '.bin', $abs); unlink($j); log_act($u, 'file.restore', $m['path']); out(['ok' => true, 'path' => $m['path']]);
        case 'fm_zip':
            need($STAFF); if (!class_exists('ZipArchive')) fail('ZipArchive is not enabled on this hosting');
            $rel = trim((string)($in['dir'] ?? ''), '/'); $abs = fm_path($rel); if (!is_dir($abs)) fail('Not a folder');
            $tmp = tempnam(sys_get_temp_dir(), 'wxz'); $z = new ZipArchive(); $z->open($tmp, ZipArchive::OVERWRITE); $n = 0; $bytes = 0;
            $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($abs, FilesystemIterator::SKIP_DOTS));
            foreach ($it as $f) { if (!$f->isFile()) continue; $bytes += $f->getSize(); if ($bytes > 200 * 1048576) { $z->close(); @unlink($tmp); fail('Folder is over 200 MB — download a smaller folder'); } $z->addFile($f->getPathname(), substr($f->getPathname(), strlen($abs) + 1)); $n++; }
            $z->close(); header('Content-Type: application/zip'); header('Content-Disposition: attachment; filename="' . basename($rel) . '.zip"'); header('Content-Length: ' . filesize($tmp)); header('Cache-Control: no-store'); readfile($tmp); @unlink($tmp); exit;

        // ---------- database
        case 'dbx_tables':
            need($OA); $L = [];
            foreach (q("SHOW TABLE STATUS LIKE 'wx\\_%'")->fetchAll() as $r) $L[] = ['name' => $r['Name'], 'rows' => (int)q('SELECT COUNT(*) FROM `' . $r['Name'] . '`')->fetchColumn(), 'size' => (int)$r['Data_length'] + (int)$r['Index_length'], 'updated' => $r['Update_time']];
            out(['ok' => true, 'tables' => $L]);
        case 'dbx_browse':
            need($OA); $t = dbx_table((string)($in['table'] ?? '')); $cols = dbx_cols($t); $per = 50; $page = max(1, (int)($in['page'] ?? 1)); $qs = trim((string)($in['q'] ?? ''));
            $where = ''; $p = [];
            if ($qs !== '') { $w = []; foreach ($cols as $c) if (preg_match('~char|text|int|date~i', $c['type']) && !preg_match('~(pass|hash|token|secret)~i', $c['name'])) { $w[] = '`' . $c['name'] . '` LIKE ?'; $p[] = '%' . $qs . '%'; } if ($w) $where = ' WHERE ' . implode(' OR ', $w); }
            $total = (int)q('SELECT COUNT(*) FROM `' . $t . '`' . $where, $p)->fetchColumn();
            $hasId = in_array('id', array_column($cols, 'name'), true);
            $rows = q('SELECT * FROM `' . $t . '`' . $where . ($hasId ? ' ORDER BY id DESC' : '') . ' LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per), $p)->fetchAll();
            $rows = array_map(function ($r) { $o = []; foreach ($r as $k => $v) { $v = dbx_mask($k, $v); $o[$k] = is_string($v) && mb_strlen($v) > 240 ? mb_substr($v, 0, 240) . '…' : $v; } return $o; }, $rows);
            out(['ok' => true, 'table' => $t, 'cols' => $cols, 'rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $per))]);
        case 'dbx_row':
            need($OA); $t = dbx_table((string)($in['table'] ?? '')); $r = q('SELECT * FROM `' . $t . '` WHERE id=?', [(int)($in['id'] ?? 0)])->fetch(); if (!$r) fail('Row not found', 404);
            $o = []; foreach ($r as $k => $v) $o[$k] = dbx_mask($k, $v); out(['ok' => true, 'row' => $o]);
        case 'dbx_export':
            $u = need($OA); $fmt = ($in['fmt'] ?? 'csv') === 'sql' ? 'sql' : 'csv'; if ($fmt === 'sql' && $u['role'] !== 'owner') fail('Only the owner can download the full SQL export (it contains password hashes)', 403); $tabs = ($in['table'] ?? '') === '*' ? dbx_tables() : [dbx_table((string)($in['table'] ?? ''))];
            @set_time_limit(300); $outS = '';
            if ($fmt === 'csv') { $t = $tabs[0]; $fh = fopen('php://temp', 'w+'); $first = true; foreach (q('SELECT * FROM `' . $t . '`')->fetchAll() as $r) { $m = []; foreach ($r as $k => $v) $m[$k] = dbx_mask($k, $v); if ($first) { fputcsv($fh, array_keys($m)); $first = false; } fputcsv($fh, array_values($m)); } rewind($fh); $outS = "\xEF\xBB\xBF" . stream_get_contents($fh); }
            else {
                $outS = "-- Woodex database export " . now() . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n";
                foreach ($tabs as $t) { $c = q('SHOW CREATE TABLE `' . $t . '`')->fetch(PDO::FETCH_NUM); $outS .= "\nDROP TABLE IF EXISTS `$t`;\n" . $c[1] . ";\n";
                    foreach (array_chunk(q('SELECT * FROM `' . $t . '`')->fetchAll(), 100) as $ch) { $vals = array_map(fn($r) => '(' . implode(',', array_map(fn($v) => $v === null ? 'NULL' : db()->quote((string)$v), array_values($r))) . ')', $ch); $outS .= 'INSERT INTO `' . $t . '` VALUES ' . implode(",\n", $vals) . ";\n"; } }
                $outS .= "SET FOREIGN_KEY_CHECKS=1;\n";
            }
            log_act($u, 'db.export.' . $fmt, implode(',', $tabs));
            out(['ok' => true, 'name' => (count($tabs) > 1 ? 'woodex-db-' . date('Ymd-His') : $tabs[0]) . '.' . $fmt, 'mime' => $fmt === 'csv' ? 'text/csv' : 'application/sql', 'content' => $outS, 'note' => $fmt === 'sql' ? 'Contains password hashes and secrets — keep it private.' : 'Secrets are masked.']);
    }
    return false;
}
