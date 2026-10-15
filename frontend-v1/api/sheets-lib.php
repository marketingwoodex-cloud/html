<?php
/**
 * Phase 3 — Google Sheets sync (free, no Google API key): the owner deploys a small Apps Script "web app"
 * in their sheet and pastes its URL here. Every new website enquiry is POSTed to it as one row.
 * Settings: _private/sheets.json {url, on}. Admin actions: sheets_get / sheets_save / sheets_test / sheets_sync.
 */
const SHEETS_FILE = PRIVATE_DIR . '/sheets.json';
function sheets_cfg(): array { return array_merge(['url' => '', 'on' => false, 'last' => '', 'lastErr' => ''], is_file(SHEETS_FILE) ? (array)jread(SHEETS_FILE) : []); }
function sheets_row(array $l): array {
    $f = is_array($l['fields'] ?? null) ? $l['fields'] : (json_decode((string)($l['fields'] ?? ''), true) ?: []);
    return ['id' => (int)($l['id'] ?? 0), 'date' => (string)($l['created_at'] ?? now()), 'source' => (string)($l['source'] ?? ''), 'name' => (string)($l['name'] ?? ''), 'phone' => (string)($l['phone'] ?? ''),
        'email' => (string)($l['email'] ?? ''), 'service' => (string)($l['service'] ?? ''), 'message' => (string)($l['message'] ?? ''), 'page' => (string)($l['page'] ?? ''), 'stage' => (string)($l['stage'] ?? 'new'),
        'details' => implode('; ', array_map(fn($k) => $k . ': ' . (is_scalar($f[$k]) ? $f[$k] : ''), array_keys($f)))];
}
function sheets_post(string $url, array $rows): array {
    $body = json_encode(['rows' => $rows, 'site' => 'woodex'], JSON_UNESCAPED_UNICODE);
    if (function_exists('curl_init')) {
        $c = curl_init($url); curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 20]);
        $r = curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); $err = curl_error($c); curl_close($c);
    } else { $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => $body, 'timeout' => 20, 'ignore_errors' => true]]); $r = @file_get_contents($url, false, $ctx); $code = $r === false ? 0 : 200; $err = $r === false ? 'network error' : ''; }
    $j = json_decode((string)$r, true); $ok = $code >= 200 && $code < 300 && is_array($j) && !empty($j['ok']);
    return ['ok' => $ok, 'error' => $ok ? '' : ($err ?: (is_array($j) && !empty($j['error']) ? (string)$j['error'] : 'The sheet did not answer correctly (HTTP ' . $code . '). Check the web app URL and that access is "Anyone".')), 'added' => is_array($j) ? (int)($j['added'] ?? 0) : 0];
}
function sheets_push(array $lead): void {
    $c = sheets_cfg(); if (!$c['on'] || $c['url'] === '') return;
    $r = sheets_post($c['url'], [sheets_row($lead)]); $c['last'] = now(); $c['lastErr'] = $r['ok'] ? '' : $r['error']; jwrite(SHEETS_FILE, $c);
}
function sheets_actions(string $action, array $in): bool {
    if (strpos($action, 'sheets_') !== 0) return false;
    $OA = ['owner', 'admin']; $u = need($OA); $c = sheets_cfg();
    switch ($action) {
        case 'sheets_get': out(['ok' => true, 'cfg' => $c]);
        case 'sheets_save':
            $url = trim((string)($in['url'] ?? ''));
            if ($url !== '' && !preg_match('~^https://script\.google(usercontent)?\.com/[A-Za-z0-9/_\-\.?=&]+$~', $url)) fail('Paste the Apps Script web app URL (it starts with https://script.google.com/)');
            $c['url'] = $url; $c['on'] = !empty($in['on']) && $url !== ''; jwrite(SHEETS_FILE, $c); log_act($u, 'sheets.save', ''); out(['ok' => true, 'cfg' => $c]);
        case 'sheets_test':
            if ($c['url'] === '') fail('Save the web app URL first');
            $r = sheets_post($c['url'], [['id' => 0, 'date' => now(), 'source' => 'test', 'name' => 'Test row from Woodex admin', 'phone' => '', 'email' => '', 'service' => '', 'message' => 'You can delete this row.', 'page' => '', 'stage' => '', 'details' => '']]);
            if (!$r['ok']) fail($r['error']); out(['ok' => true]);
        case 'sheets_sync':
            if ($c['url'] === '') fail('Save the web app URL first');
            $rows = array_map('sheets_row', q('SELECT * FROM wx_leads ORDER BY id ASC LIMIT 5000')->fetchAll());
            $added = 0; foreach (array_chunk($rows, 200) as $ch) { $r = sheets_post($c['url'], $ch); if (!$r['ok']) fail($r['error']); $added += $r['added']; }
            log_act($u, 'sheets.sync', count($rows) . ' leads'); out(['ok' => true, 'sent' => count($rows), 'added' => $added]);
    }
    return false;
}
