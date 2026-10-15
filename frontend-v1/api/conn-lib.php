<?php
/* P36 connectors: "Add connector" gallery (Facebook, Messenger, Instagram, Threads, … or any custom app).
   Saved in /_private/connectors.json (never web-readable). Secrets are write-only: the browser only ever sees the last 4 characters.
   Actions: conn_list, conn_save, conn_delete, conn_test (owner, admin). */
const CONN_FILE = PRIVATE_DIR . '/connectors.json';
function conn_pub(array $c): array { $p = $c; unset($p['secret']); $p['hasSecret'] = !empty($c['secret']); return $p; }
function conn_s($v, int $n): string { return mb_substr(trim(strip_tags((string)$v)), 0, $n); }
function conn_actions(string $action, array $in): bool {
    if (!in_array($action, ['conn_list', 'conn_save', 'conn_delete', 'conn_test', 'conn_gmail_send', 'conn_gmail_use', 'conn_push'], true)) return false;
    $u = need(['owner', 'admin']);
    $d = jread(CONN_FILE); $items = (array)($d['items'] ?? []);
    $put = function () use (&$items) { jwrite(CONN_FILE, ['items' => array_values($items)]); };
    $find = function ($id) use (&$items) { foreach ($items as $i => $c) if (($c['id'] ?? '') === $id) return $i; return -1; };
    if ($action === 'conn_list') out(['ok' => true, 'items' => array_map('conn_pub', array_values($items))]);
    if ($action === 'conn_delete') { $i = $find((string)($in['id'] ?? '')); if ($i < 0) fail('Connector not found', 404); log_act($u, 'conn.delete', $items[$i]['name']); array_splice($items, $i, 1); $put(); out(['ok' => true, 'items' => array_map('conn_pub', $items)]); }
    if ($action === 'conn_test') {
        $i = $find((string)($in['id'] ?? '')); if ($i < 0) fail('Connector not found', 404);
        $c = &$items[$i]; $url = (string)($c['url'] ?? ''); $msg = 'Saved. No test address, so nothing to check.'; $ok = !empty($c['secret']) || !empty($c['account']);
        $key = (string)($c['key'] ?? ''); $acc = trim((string)($c['account'] ?? '')); $sec = (string)($c['secret'] ?? '');
        if ($key === 'github') { /* P21: real check with the GitHub API */
            if (!preg_match('~^[\w.-]+/[\w.-]+$~', $acc) || $sec === '') { $ok = false; $msg = 'Enter the repository as owner/name and a token.'; }
            else {
                $ctx = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 10, 'ignore_errors' => true, 'header' => "User-Agent: WoodexAdmin\r\nAccept: application/vnd.github+json\r\nAuthorization: Bearer $sec\r\n"]]);
                $r = @file_get_contents('https://api.github.com/repos/' . $acc, false, $ctx, 0, 20000); $code = 0;
                foreach ((array)($http_response_header ?? []) as $h) if (preg_match('~^HTTP/\S+\s+(\d+)~', $h, $m)) $code = (int)$m[1];
                $j = json_decode((string)$r, true) ?: []; $ok = $code === 200;
                $msg = $ok ? 'Connected to ' . ($j['full_name'] ?? $acc) . (!empty($j['private']) ? ' (private)' : ' (public: make it private!)') . (empty($j['permissions']['push']) ? ' · token can only read' : ' · write access OK')
                    : ($code === 401 ? 'Token rejected. Create a new token.' : ($code === 404 ? 'Repository not found, or the token has no access to it.' : 'GitHub did not answer (HTTP ' . $code . ')'));
            }
        } elseif ($key === 'gmail') {
            $ok = (bool)filter_var($acc, FILTER_VALIDATE_EMAIL) && strlen(preg_replace('~\s+~', '', $sec)) === 16;
            $msg = $ok ? 'Gmail address and 16-letter app password look right. Use them in Settings → Email (SMTP smtp.gmail.com, port 587).' : 'Enter a Gmail address and the 16-letter app password (not your normal password).';
        } elseif ($key === 'gdrive') {
            $ok = (bool)preg_match('~^https://drive\.google\.com/(drive/(u/\d+/)?folders/|open\?id=)[\w-]+~', $acc . ' ') || (bool)preg_match('~^https://drive\.google\.com/~', $url);
            $msg = $ok ? 'Drive folder link saved. Your team opens it from Settings → Integrations.' : 'Paste a folder link that starts with https://drive.google.com/drive/folders/';
        } elseif ($url !== '' && preg_match('~^https://~i', $url)) {
            $ctx = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 8, 'ignore_errors' => true, 'header' => "User-Agent: WoodexAdmin\r\n"]]);
            $r = @file_get_contents($url, false, $ctx, 0, 2048); $code = 0;
            foreach ((array)($http_response_header ?? []) as $h) if (preg_match('~^HTTP/\S+\s+(\d+)~', $h, $m)) $code = (int)$m[1];
            $ok = $code >= 200 && $code < 400; $msg = $code ? "Address answered with HTTP $code" : 'Address did not answer';
        }
        $c['status'] = $ok ? 'connected' : 'error'; $c['checked'] = time(); $c['note'] = $msg; unset($c); $put();
        out(['ok' => true, 'pass' => $ok, 'message' => $msg, 'items' => array_map('conn_pub', array_values($items))]);
    }
    /* ---------- P22 working connections ---------- */
    if ($action === 'conn_gmail_send' || $action === 'conn_gmail_use') {
        $i = $find((string)($in['id'] ?? '')); if ($i < 0 || ($items[$i]['key'] ?? '') !== 'gmail') fail('Gmail connector not found', 404);
        $smtp = p22_gmail_smtp($items[$i]);
        if ($action === 'conn_gmail_use') {
            $u = need(['owner']); $c = crm_cfg(); $c = array_merge($c, $smtp); if ($c['emailTo'] === '') $c['emailTo'] = $smtp['smtpUser'];
            jwrite(CRM_FILE, $c); log_act($u, 'conn.gmail_use', $smtp['smtpUser']); out(['ok' => true, 'message' => 'Gmail is now used for all email alerts, password resets and client emails.']);
        }
        $to = strtolower(trim((string)($in['to'] ?? ''))) ?: $smtp['smtpUser']; if (!filter_var($to, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address');
        $e = smtp_send($smtp, [$to], 'Woodex Admin: Gmail test', "This test email was sent by Woodex Admin through Gmail.\n\nIf you can read it, the Gmail connector works.");
        $items[$i]['status'] = $e === '' ? 'connected' : 'error'; $items[$i]['note'] = $e === '' ? 'Test email sent to ' . $to : 'Gmail: ' . $e; $items[$i]['checked'] = time(); $put();
        out(['ok' => true, 'pass' => $e === '', 'message' => $items[$i]['note'], 'items' => array_map('conn_pub', array_values($items))]);
    }
    if ($action === 'conn_push') {
        $u = need(['owner', 'admin']); $i = $find((string)($in['id'] ?? '')); if ($i < 0) fail('Connector not found', 404);
        $r = p22_push($items[$i]); $put(); log_act($u, 'conn.push', $items[$i]['name'] . ': ' . $r['message']);
        out(['ok' => true, 'pass' => $r['ok'], 'message' => $r['message'], 'items' => array_map('conn_pub', array_values($items))]);
    }
    // conn_save
    $id = (string)($in['id'] ?? ''); $i = $id !== '' ? $find($id) : -1;
    $name = conn_s($in['name'] ?? '', 60); if ($name === '') fail('Give the connector a name');
    $url = trim((string)($in['url'] ?? '')); if ($url !== '' && !preg_match('~^https?://[^\s<>"]+$~i', $url)) fail('Address must start with https://');
    $c = $i >= 0 ? $items[$i] : ['id' => 'c' . bin2hex(random_bytes(5)), 'added' => time()];
    $c['key'] = preg_replace('~[^a-z0-9_-]~', '', strtolower((string)($in['key'] ?? 'custom'))) ?: 'custom';
    $c['name'] = $name; $c['cat'] = conn_s($in['cat'] ?? 'Custom', 40); $c['account'] = conn_s($in['account'] ?? '', 160);
    $c['url'] = mb_substr($url, 0, 300); $c['notes'] = conn_s($in['notes'] ?? '', 400); $c['on'] = !array_key_exists('on', $in) || !empty($in['on']);
    $sec = trim((string)($in['secret'] ?? ''));
    if ($sec !== '') { $c['secret'] = mb_substr($sec, 0, 2000); $c['hint'] = mb_substr($sec, -4); }
    $c['status'] = (!empty($c['secret']) || $c['account'] !== '') ? 'connected' : 'setup'; $c['updated'] = time();
    if ($i >= 0) $items[$i] = $c; else $items[] = $c;
    $put(); log_act($u, 'conn.save', $name);
    out(['ok' => true, 'item' => conn_pub($c), 'items' => array_map('conn_pub', array_values($items))]);
}

/* ================= P22: working connections (Gmail send, off-site backups to GitHub + Google Drive) ================= */
function p22_gmail_smtp(array $c): array {
    $user = trim((string)($c['account'] ?? '')); $pass = preg_replace('~\s+~', '', (string)($c['secret'] ?? ''));
    if (!filter_var($user, FILTER_VALIDATE_EMAIL) || strlen($pass) !== 16) fail('Save the Gmail address and the 16-letter app password first');
    return ['smtpHost' => 'smtp.gmail.com', 'smtpPort' => 465, 'smtpUser' => $user, 'smtpPass' => $pass, 'smtpFrom' => $user];
}
/** Off-site backup: website pages + database, WITHOUT secrets (no _private files, no logins/passwords). */
function p22_offsite_zip(): array {
    if (!class_exists('ZipArchive')) return ['', 'The ZipArchive PHP extension is not enabled'];
    @set_time_limit(300); $f = tempnam(sys_get_temp_dir(), 'wxb'); $z = new ZipArchive();
    if ($z->open($f, ZipArchive::OVERWRITE) !== true) return ['', 'Could not create the backup file'];
    $add = function (string $rel) use ($z) { $a = ROOT_DIR . '/' . $rel; if (is_file($a)) $z->addFile($a, $rel); };
    if (function_exists('a7_pages')) foreach (a7_pages() as $r) $add($r);
    foreach (['sitemap.xml', 'robots.txt', 'llms.txt', 'assets/site.js', 'assets/site-p21.css', 'assets/v1-p21.css', 'assets/theme.css'] as $r) $add($r);
    $db = []; try { foreach (q("SHOW TABLES LIKE 'wx\\_%'")->fetchAll(PDO::FETCH_NUM) as $t) { if (in_array($t[0], ['wx_users', 'wx_throttle', 'wx_settings'], true)) continue; $db[$t[0]] = q('SELECT * FROM `' . $t[0] . '`')->fetchAll(); } } catch (Throwable $e) { $db['_error'] = $e->getMessage(); }
    $z->addFromString('database.json', json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $z->addFromString('README.txt', "Woodex off-site backup " . gmdate('Y-m-d H:i') . " UTC\nWebsite pages + database (no passwords, no API keys).\nRestore: Admin > Settings > Backups, or upload the pages with File Manager.\n");
    $z->close(); return [$f, ''];
}
function p22_http(string $method, string $url, array $headers, ?string $body): array {
    if (!function_exists('curl_init')) return [0, 'cURL is not enabled on this hosting'];
    $ch = curl_init($url); $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_HTTPHEADER => $headers, CURLOPT_CUSTOMREQUEST => $method];
    if (is_file(__DIR__ . '/cacert.pem')) $o[CURLOPT_CAINFO] = __DIR__ . '/cacert.pem';
    if ($body !== null) $o[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($ch, $o); $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return [$code, $raw === false ? $err : (string)$raw];
}
function p22_push(array &$c): array {
    $key = (string)($c['key'] ?? ''); $acc = trim((string)($c['account'] ?? '')); $sec = (string)($c['secret'] ?? '');
    $done = function (bool $ok, string $m) use (&$c) { $c['lastPush'] = time(); $c['pushOk'] = $ok; $c['note'] = $m; $c['checked'] = time(); if ($ok) $c['status'] = 'connected'; return ['ok' => $ok, 'message' => $m]; };
    if ($key === 'github' && (!preg_match('~^[\w.-]+/[\w.-]+$~', $acc) || $sec === '')) return $done(false, 'Save the repository (owner/name) and token first');
    if ($key === 'gdrive') { $url = trim((string)($c['url'] ?? '')); if (!preg_match('~^https://script\.google\.com/macros/s/[\w-]+/exec$~', $url) || $sec === '' || !preg_match('~folders/([\w-]+)~', $acc, $fm)) return $done(false, 'Save the Drive folder link, the Apps Script web-app address and the script key first'); }
    if ($key !== 'github' && $key !== 'gdrive') return ['ok' => false, 'message' => 'Backups work with GitHub and Google Drive'];
    [$f, $err] = p22_offsite_zip(); if ($f === '') return $done(false, $err);
    $size = filesize($f); if ($size > 40 * 1048576) { @unlink($f); return $done(false, 'Backup is too big for an upload (' . round($size / 1048576) . ' MB)'); }
    $name = 'woodex-backup-' . gmdate('Ymd-His') . '.zip'; $b64 = base64_encode((string)file_get_contents($f)); @unlink($f);
    if ($key === 'github') {
        [$code, $raw] = p22_http('PUT', 'https://api.github.com/repos/' . $acc . '/contents/backups/' . $name, ['User-Agent: WoodexAdmin', 'Accept: application/vnd.github+json', 'Authorization: Bearer ' . $sec, 'Content-Type: application/json'], json_encode(['message' => 'Woodex backup ' . gmdate('Y-m-d H:i'), 'content' => $b64]));
        return $done($code === 201, $code === 201 ? 'Backup uploaded to GitHub: backups/' . $name . ' (' . round($size / 1024) . ' KB)' : ($code === 401 ? 'GitHub rejected the token' : ($code === 403 || $code === 404 ? 'Token cannot write to this repository (needs Contents: Read and write)' : 'GitHub upload failed (HTTP ' . $code . ')')));
    }
    [$code, $raw] = p22_http('POST', $url, ['Content-Type: application/json'], json_encode(['key' => $sec, 'folder' => $fm[1], 'name' => $name, 'data' => $b64]));
    $j = json_decode($raw, true) ?: [];
    return $done(!empty($j['ok']), !empty($j['ok']) ? 'Backup saved in Google Drive: ' . $name . ' (' . round($size / 1024) . ' KB)' : 'Drive upload failed: ' . mb_substr((string)($j['error'] ?? ('HTTP ' . $code . ', check the script is deployed as "Anyone"')), 0, 160));
}
/** Cron (wa-cron.php): one automatic off-site backup per day for each active GitHub / Drive connector. */
function conn_tick(): array {
    if (!defined('CONN_FILE')) return []; $d = jread(CONN_FILE); $items = (array)($d['items'] ?? []); $out = []; $ch = false;
    foreach ($items as &$c) if (in_array($c['key'] ?? '', ['github', 'gdrive'], true) && !empty($c['on']) && !empty($c['secret']) && time() - (int)($c['lastPush'] ?? 0) > 20 * 3600) { $r = p22_push($c); $out[] = $c['name'] . ': ' . $r['message']; $ch = true; }
    unset($c); if ($ch) jwrite(CONN_FILE, ['items' => array_values($items)]); return $out;
}
