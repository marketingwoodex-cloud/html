<?php
/**
 * Woodex Admin v2 — Phase A4 shared CRM code (leads, clients, alerts).
 * Included by api/admin.php (team actions) and api/forms.php (public site forms).
 * Needs from the includer: q(), now(), ip(), jread(), jwrite(), fail(), out(), PRIVATE_DIR.
 */
declare(strict_types=1);
if (!defined('PRIVATE_DIR')) { http_response_code(404); exit; }

const CRM_FILE   = PRIVATE_DIR . '/crm.json';
const OFFERS_FILE = PRIVATE_DIR . '/offers.json';
const CRM_STAGES = ['new', 'contacted', 'visit', 'quote', 'hold', 'won', 'lost'];
const CRM_TEAM_SRC = ['manual', 'client', 'referral', 'walkin', 'phone', 'facebook', 'instagram', 'google', 'tiktok', 'portal', 'architect', 'builder', 'event', 'outreach', 'other'];
const CRM_SOURCES = ['contact' => 'Contact form', 'booking' => 'Online booking', 'estimator' => 'Cost estimator', 'brief' => '3D brief', 'fitout-hub' => 'Fit-out quote', 'office-fitout' => 'Office fit-out quote', 'whatsapp' => 'WhatsApp', 'chat' => 'Live chat', 'client' => 'Existing client (repeat)', 'referral' => 'Referral / word of mouth', 'walkin' => 'Walk-in / office visit', 'phone' => 'Phone call', 'facebook' => 'Facebook', 'instagram' => 'Instagram', 'google' => 'Google search / Maps', 'tiktok' => 'TikTok / YouTube', 'portal' => 'Zameen / OLX / portals', 'architect' => 'Architect / consultant', 'builder' => 'Builder / developer', 'event' => 'Exhibition / event', 'outreach' => 'Cold call / outreach', 'other' => 'Other', 'manual' => 'Added by team', 'import' => 'CSV import'];
const CRM_SECRETS = ['smtpPass', 'waToken', 'tsSecret'];

function crm_migrate(): void {
    static $done = false; if ($done) return; $done = true;
    q("CREATE TABLE IF NOT EXISTS wx_leads (id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL, source VARCHAR(30) NOT NULL, page VARCHAR(200) NULL,
        name VARCHAR(120) NOT NULL, phone VARCHAR(40) NULL, email VARCHAR(190) NULL, service VARCHAR(190) NULL, message TEXT NULL, fields TEXT NULL,
        stage VARCHAR(20) NOT NULL DEFAULT 'new', assigned_to INT NULL, followup DATE NULL, value BIGINT NOT NULL DEFAULT 0, lost_reason VARCHAR(190) NULL,
        client_id INT NULL, tags VARCHAR(400) NULL, is_read TINYINT(1) NOT NULL DEFAULT 0, ip VARCHAR(64) NULL,
        INDEX(stage), INDEX(created_at), INDEX(client_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    q("CREATE TABLE IF NOT EXISTS wx_lead_notes (id INT AUTO_INCREMENT PRIMARY KEY, lead_id INT NOT NULL, t DATETIME NOT NULL, user_name VARCHAR(120) NULL,
        text TEXT NOT NULL, sys TINYINT(1) NOT NULL DEFAULT 0, INDEX(lead_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    q("CREATE TABLE IF NOT EXISTS wx_clients (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, phone VARCHAR(40) NULL, email VARCHAR(190) NULL,
        company VARCHAR(120) NULL, city VARCHAR(80) NULL, address VARCHAR(300) NULL, notes TEXT NULL, created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
function clip($v, int $n = 500): string { return mb_substr(trim((string)($v ?? '')), 0, $n); }
function crm_cfg(): array {
    return array_merge(['emailOn' => false, 'emailTo' => '', 'smtpHost' => '', 'smtpPort' => 465, 'smtpUser' => '', 'smtpPass' => '', 'smtpFrom' => '',
        'waOn' => false, 'waToken' => '', 'waPhoneId' => '', 'waTo' => '', 'waTemplate' => '', 'waLang' => 'en', 'tsSite' => '', 'tsSecret' => ''], jread(CRM_FILE));
}
function crm_cfg_pub(array $c): array { foreach (CRM_SECRETS as $k) { $c[$k . 'Set'] = $c[$k] !== ''; $c[$k] = ''; } return $c; }

function lead_text(array $l): string {
    $f = ''; foreach (($l['fields'] ?? []) as $k => $v) if ($v !== '') $f .= "\n$k: $v";
    return "New enquiry #{$l['id']} — " . (CRM_SOURCES[$l['source']] ?? $l['source']) . "\nName: {$l['name']}\nPhone: {$l['phone']}"
        . ($l['email'] ? "\nEmail: {$l['email']}" : '') . ($l['service'] ? "\nService: {$l['service']}" : '') . ($l['message'] ? "\nMessage: {$l['message']}" : '')
        . $f . "\nPage: " . ($l['page'] ?: '-');
}

/** Minimal SMTP client (SSL on 465 or STARTTLS on 587) — Hostinger mailboxes. Returns '' on success or an error. */
/** $att: [['name' => 'x.pdf', 'type' => 'application/pdf', 'data' => <binary>], ...] (optional) */
function smtp_send(array $c, array $to, string $subject, string $text, array $att = []): string {
    $host = $c['smtpHost']; $port = (int)$c['smtpPort'] ?: 465; if (!$host || !$c['smtpUser']) return 'SMTP host and user are required';
    $fp = @stream_socket_client(($port === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $port, $en, $es, 10);
    if (!$fp) return "Could not connect to $host:$port ($es)";
    stream_set_timeout($fp, 10);
    $read = function () use ($fp) { $d = ''; while (($l = fgets($fp, 515)) !== false) { $d .= $l; if (isset($l[3]) && $l[3] === ' ') break; } return $d; };
    $cmd = function (string $s, string $ok) use ($fp, $read) { if ($s !== '') fwrite($fp, $s . "\r\n"); $r = $read(); if (strpos($r, $ok) !== 0) throw new RuntimeException(trim($r) ?: 'no reply'); return $r; };
    try {
        $cmd('', '220'); $cmd('EHLO woodex.com.pk', '250');
        if ($port !== 465) { $cmd('STARTTLS', '220'); if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('TLS failed'); $cmd('EHLO woodex.com.pk', '250'); }
        $cmd('AUTH LOGIN', '334'); $cmd(base64_encode($c['smtpUser']), '334'); $cmd(base64_encode($c['smtpPass']), '235');
        preg_match('~<?([^<>\s]+@[^<>\s]+)>?\s*$~', $c['smtpFrom'] ?: $c['smtpUser'], $m); $from = $m[1] ?? $c['smtpUser'];
        $cmd('MAIL FROM:<' . $from . '>', '250');
        foreach ($to as $t) $cmd('RCPT TO:<' . $t . '>', '25');
        $cmd('DATA', '354');
        $hdr = 'From: ' . ($c['smtpFrom'] ?: $from) . "\r\nTo: " . implode(', ', $to) . "\r\nSubject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\nDate: " . date('r') .
            "\r\nMIME-Version: 1.0\r\n";
        if ($att) {
            $bd = 'wx' . bin2hex(random_bytes(12)); $msg = $hdr . "Content-Type: multipart/mixed; boundary=\"$bd\"\r\n\r\n--$bd\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text));
            foreach ($att as $a) { $n = preg_replace('~[^\w.\- ]~', '', (string)$a['name']) ?: 'file'; $msg .= "--$bd\r\nContent-Type: " . ($a['type'] ?? 'application/octet-stream') . "; name=\"$n\"\r\nContent-Disposition: attachment; filename=\"$n\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode((string)$a['data'])); }
            $msg .= "--$bd--\r\n";
            $cmd(preg_replace('~^\.~m', '..', $msg) . "\r\n.", '250');
        } else $cmd($hdr . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) . "\r\n.", '250');
        $cmd('QUIT', '221');
    } catch (Throwable $e) { fclose($fp); return 'SMTP: ' . $e->getMessage(); }
    fclose($fp); return '';
}
/** Send a plain WhatsApp text (inside the 24-hour customer window) with the Cloud API number from Settings → Integrations. */
function wa_text(string $to, string $text): string {
    $c = crm_cfg(); if (!$c['waToken'] || !$c['waPhoneId']) return 'WhatsApp is not connected (Settings → Integrations)';
    if (!function_exists('curl_init')) return 'cURL missing';
    $ch = curl_init('https://graph.facebook.com/v21.0/' . rawurlencode($c['waPhoneId']) . '/messages');
    curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $c['waToken'], 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['messaging_product' => 'whatsapp', 'to' => preg_replace('~\D~', '', $to), 'type' => 'text', 'text' => ['body' => mb_substr($text, 0, 4000)]])]);
    $r = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) { if (function_exists('wa_mark')) wa_mark(false, $err); return 'failed: ' . $err; }
    if ($code >= 300) { $j = json_decode((string)$r, true); $m = (string)($j['error']['message'] ?? "HTTP $code"); if (function_exists('wa_mark') && $code !== 400) wa_mark(false, $m); return 'failed: ' . $m; }
    if (function_exists('wa_mark')) wa_mark(true);
    return '';
}
/** P16: check a Cloud API number with Meta (also used to verify a new/changed number). */
function wa_phone_info(string $tok, string $pid): array {
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'cURL missing'];
    $ch = curl_init('https://graph.facebook.com/v21.0/' . rawurlencode($pid) . '?fields=display_phone_number,verified_name,quality_rating,code_verification_status');
    curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $tok]]);
    $r = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) return ['ok' => false, 'error' => $err];
    $j = json_decode((string)$r, true) ?: []; if ($code >= 300) return ['ok' => false, 'error' => (string)($j['error']['message'] ?? "HTTP $code")];
    return ['ok' => true, 'number' => (string)($j['display_phone_number'] ?? ''), 'name' => (string)($j['verified_name'] ?? ''), 'quality' => (string)($j['quality_rating'] ?? ''), 'verified' => (string)($j['code_verification_status'] ?? '')];
}
/** P16: fill an offer message: {name} {code} {percent} {expires} */
function offer_text(array $o, array $l): string {
    $first = trim(explode(' ', trim((string)$l['name']))[0] ?? '');
    return strtr($o['msg'], ['{name}' => $first ?: 'there', '{code}' => $o['code'], '{percent}' => (string)$o['percent'], '{expires}' => $o['expires'] ? date('j M Y', strtotime($o['expires'])) : '']);
}
function wa_send(array $c, string $to, array $l, string $text): string {
    $to = preg_replace('~\D~', '', $to);
    $body = $c['waTemplate'] !== ''
        ? ['messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'template', 'template' => ['name' => $c['waTemplate'], 'language' => ['code' => $c['waLang'] ?: 'en'],
            'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => '#' . $l['id'] . ' ' . $l['name']], ['type' => 'text', 'text' => $l['phone']], ['type' => 'text', 'text' => (CRM_SOURCES[$l['source']] ?? $l['source']) . ($l['service'] ? ' · ' . $l['service'] : '')]]]]]]
        : ['messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'text', 'text' => ['body' => mb_substr($text, 0, 4000)]];
    $ch = curl_init('https://graph.facebook.com/v21.0/' . rawurlencode($c['waPhoneId']) . '/messages');
    curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $c['waToken'], 'Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body)]);
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) return 'failed: ' . $err;
    if ($code >= 300) { $j = json_decode((string)$r, true); return 'failed: ' . ($j['error']['message'] ?? "HTTP $code"); }
    return 'sent';
}
function send_alerts(array $l, string $only = '', array $over = []): array {
    $c = crm_cfg(); $res = []; $text = lead_text($l);
    if (!$only && function_exists('tg_alert')) tg_alert('leads', "📥 <b>New lead</b>\n" . tg_h($text));
    if (!empty($over['alertTo'])) $c['emailTo'] = (string)$over['alertTo']; // P18 E: per-form recipients
    if (!empty($over['waTo'])) $c['waTo'] = (string)$over['waTo']; // P19 F7: per-form WhatsApp numbers
    if (array_key_exists('waAlert', $over) && !$over['waAlert'] && !$only) $c['waOn'] = false;
    if (($only ? $only === 'email' : $c['emailOn']) && $c['emailTo']) {
        $to = array_values(array_filter(preg_split('~[\s,]+~', $c['emailTo'])));
        $e = smtp_send($c, $to, 'New enquiry #' . $l['id'] . ': ' . $l['name'], $text); $res['email'] = $e === '' ? 'sent' : 'failed: ' . $e;
    }
    if (($only ? $only === 'whatsapp' : $c['waOn']) && $c['waToken'] && $c['waPhoneId'] && $c['waTo']) {
        foreach (array_filter(preg_split('~[\s,]+~', $c['waTo'])) as $to) $res['whatsapp'] = wa_send($c, $to, $l, $text);
    }
    return $res;
}
function lead_row(array $r, ?array $notes = null): array {
    $r['id'] = (int)$r['id']; $r['value'] = (int)$r['value']; $r['assigned_to'] = $r['assigned_to'] !== null ? (int)$r['assigned_to'] : null;
    $r['client_id'] = $r['client_id'] !== null ? (int)$r['client_id'] : null; $r['read'] = (bool)$r['is_read']; unset($r['is_read'], $r['ip']);
    $r['fields'] = json_decode((string)$r['fields'], true) ?: []; $r['tags'] = $r['tags'] ? explode(',', $r['tags']) : []; $r['followup'] = (string)($r['followup'] ?? '');
    foreach (['page', 'phone', 'email', 'service', 'message', 'lost_reason', 'company', 'designation', 'location', 'line', 'lead_type', 'project_type', 'budget', 'area', 'priority', 'quote_status', 'last_contact', 'next_at', 'next_type'] as $k) $r[$k] = (string)($r[$k] ?? '');
    $r['notes'] = $notes ?? array_map(fn($n) => ['t' => $n['t'], 'user' => $n['user_name'], 'text' => $n['text'], 'sys' => (bool)$n['sys'], 'kind' => (string)($n['kind'] ?? ''), 'outcome' => (string)($n['outcome'] ?? '')], q('SELECT * FROM wx_lead_notes WHERE lead_id=? ORDER BY id', [$r['id']])->fetchAll());
    return $r;
}
function lead_get(int $id): array {
    $r = q('SELECT l.*, u.name assigned_name FROM wx_leads l LEFT JOIN wx_users u ON u.id=l.assigned_to WHERE l.id=?', [$id])->fetch();
    if (!$r) fail('Enquiry not found', 404); $r['assigned_name'] = (string)($r['assigned_name'] ?? ''); return lead_row($r);
}
function lead_note_add(int $id, string $user, string $text, bool $sys = false): void { q('INSERT INTO wx_lead_notes (lead_id,t,user_name,text,sys) VALUES (?,?,?,?,?)', [$id, now(), $user, $text, $sys ? 1 : 0]); }

/** Team-side actions (called from admin.php). Returns false if the action is not a CRM action. */
function crm_actions(string $action, array $in): bool {
    if (!preg_match('~^(leads?_|clients?_|crm_)~', $action)) return false;
    crm_migrate(); s17_migrate(); $SALES = ['owner', 'admin', 'sales'];
    switch ($action) {
        case 'leads_list':
            need($SALES);
            $notes = []; foreach (q('SELECT * FROM wx_lead_notes ORDER BY id')->fetchAll() as $n) $notes[(int)$n['lead_id']][] = ['t' => $n['t'], 'user' => $n['user_name'], 'text' => $n['text'], 'sys' => (bool)$n['sys'], 'kind' => (string)($n['kind'] ?? ''), 'outcome' => (string)($n['outcome'] ?? '')];
            $rows = q('SELECT l.*, u.name assigned_name FROM wx_leads l LEFT JOIN wx_users u ON u.id=l.assigned_to ORDER BY l.id DESC LIMIT 5000')->fetchAll();
            $leads = array_map(function ($r) use ($notes) { $r['assigned_name'] = (string)($r['assigned_name'] ?? ''); return lead_row($r, $notes[(int)$r['id']] ?? []); }, $rows);
            $team = array_map(fn($u) => ['id' => (int)$u['id'], 'name' => $u['name']], q("SELECT id,name FROM wx_users WHERE active=1 AND role IN ('owner','admin','sales') ORDER BY name")->fetchAll());
            out(['ok' => true, 'leads' => $leads, 'stages' => CRM_STAGES, 'sources' => CRM_SOURCES, 'teamSources' => CRM_TEAM_SRC, 'team' => $team]);
        case 'leads_count':
            need(); out(['ok' => true, 'unread' => (int)q('SELECT COUNT(*) FROM wx_leads WHERE is_read=0')->fetchColumn()]);
        case 'lead_save':
            $u = need($SALES); $id = (int)($in['id'] ?? 0);
            if (!$id) { $name = clip($in['name'] ?? '', 120); if ($name === '') fail('Name is required'); q("INSERT INTO wx_leads (created_at,source,name,stage,is_read) VALUES (?,'manual',?,'new',1)", [now(), $name]); $id = (int)db()->lastInsertId(); }
            $l = lead_get($id); $set = []; $p = [];
            foreach (['name' => 120, 'phone' => 40, 'email' => 190, 'service' => 190, 'message' => 4000, 'lost_reason' => 190] as $k => $n) if (array_key_exists($k, $in)) { $set[] = "$k=?"; $p[] = clip($in[$k], $n); }
            if (array_key_exists('stage', $in)) { if (!in_array($in['stage'], CRM_STAGES, true)) fail('Unknown stage'); $set[] = 'stage=?'; $p[] = $in['stage']; }
            if (array_key_exists('assigned_to', $in)) { $a = (int)$in['assigned_to'] ?: null; if ($a && !q('SELECT 1 FROM wx_users WHERE id=?', [$a])->fetchColumn()) fail('Unknown team member'); $set[] = 'assigned_to=?'; $p[] = $a; }
            if (array_key_exists('followup', $in)) { $f = clip($in['followup'], 10); if ($f !== '' && !preg_match('~^\d{4}-\d{2}-\d{2}$~', $f)) fail('Follow-up must be a date'); $set[] = 'followup=?'; $p[] = $f ?: null; }
            if (array_key_exists('value', $in)) { $set[] = 'value=?'; $p[] = max(0, (int)round((float)$in['value'])); }
            if (array_key_exists('tags', $in)) { $t = is_array($in['tags']) ? $in['tags'] : explode(',', (string)$in['tags']); $t = array_slice(array_values(array_filter(array_map(fn($x) => mb_strtolower(clip($x, 30)), $t))), 0, 10); $set[] = 'tags=?'; $p[] = implode(',', $t); }
            if (array_key_exists('source', $in) && in_array($in['source'], CRM_TEAM_SRC, true) && (in_array($l['source'], CRM_TEAM_SRC, true) || $l['source'] === 'import')) { $set[] = 'source=?'; $p[] = $in['source']; }
            if (array_key_exists('read', $in)) { $set[] = 'is_read=?'; $p[] = !empty($in['read']) ? 1 : 0; }
            if ($set) { $p[] = $id; q('UPDATE wx_leads SET ' . implode(',', $set) . ' WHERE id=?', $p); }
            s17_lead_extra($id, $in);
            if (isset($in['stage']) && $in['stage'] !== $l['stage']) lead_note_add($id, $u['name'], "Stage: {$l['stage']} → {$in['stage']}", true);
            if (!(count($in) === 3 && isset($in['read']))) log_act($u, !empty($in['id']) ? 'lead.update' : 'lead.create', '#' . $id . ' ' . $l['name'] . (isset($in['stage']) && $in['stage'] !== $l['stage'] ? ' → ' . $in['stage'] : ''));
            out(['ok' => true, 'lead' => lead_get($id)]);
        case 'lead_note':
            $u = need($SALES); $id = (int)($in['id'] ?? 0); lead_get($id); $t = clip($in['text'] ?? '', 2000); if ($t === '') fail('Write a note first');
            lead_note_add($id, $u['name'], $t); log_act($u, 'lead.note', '#' . $id); out(['ok' => true, 'lead' => lead_get($id)]);
        case 'lead_delete':
            $u = need(['owner', 'admin']); $l = lead_get((int)($in['id'] ?? 0));
            q('DELETE FROM wx_lead_notes WHERE lead_id=?', [$l['id']]); q('DELETE FROM wx_leads WHERE id=?', [$l['id']]); log_act($u, 'lead.delete', '#' . $l['id'] . ' ' . $l['name']); out(['ok' => true]);
        case 'leads_import':
            $u = need(['owner', 'admin']); $n = 0;
            foreach (array_slice((array)($in['rows'] ?? []), 0, 2000) as $r) {
                if (!is_array($r) || ($name = clip($r['name'] ?? '', 120)) === '') continue;
                $st = in_array(strtolower((string)($r['stage'] ?? '')), CRM_STAGES, true) ? strtolower($r['stage']) : 'new';
                $ca = preg_match('~^\d{4}-\d{2}-\d{2}~', (string)($r['created_at'] ?? '')) ? clip($r['created_at'], 19) : now();
                q("INSERT INTO wx_leads (created_at,source,name,phone,email,service,message,stage,value,is_read) VALUES (?,'import',?,?,?,?,?,?,?,1)", [$ca, $name, clip($r['phone'] ?? '', 40), clip($r['email'] ?? '', 190), clip($r['service'] ?? '', 190), clip($r['message'] ?? '', 4000), $st, max(0, (int)($r['value'] ?? 0))]); $n++;
            }
            log_act($u, 'lead.import', $n . ' rows'); out(['ok' => true, 'imported' => $n]);
        case 'lead_convert':
            $u = need($SALES); $l = lead_get((int)($in['id'] ?? 0));
            if ($l['client_id'] && q('SELECT 1 FROM wx_clients WHERE id=?', [$l['client_id']])->fetchColumn()) out(['ok' => true, 'client_id' => $l['client_id']]);
            $digits = preg_replace('~\D~', '', $l['phone']); $cid = 0;
            foreach (q('SELECT id,phone,email FROM wx_clients')->fetchAll() as $c) if (($digits && preg_replace('~\D~', '', (string)$c['phone']) === $digits) || ($l['email'] && $c['email'] === $l['email'])) { $cid = (int)$c['id']; break; }
            if (!$cid) { q("INSERT INTO wx_clients (name,phone,email,company,city,address,notes,created_at) VALUES (?,?,?,'','Lahore','','',?)", [$l['name'], $l['phone'], $l['email'], now()]); $cid = (int)db()->lastInsertId(); }
            q('UPDATE wx_leads SET client_id=? WHERE id=?', [$cid, $l['id']]);
            if (!in_array($l['stage'], ['won', 'lost'], true)) { q("UPDATE wx_leads SET stage='won' WHERE id=?", [$l['id']]); lead_note_add($l['id'], $u['name'], "Stage: {$l['stage']} → won", true); }
            log_act($u, 'client.create', $l['name'] . ' (from #' . $l['id'] . ')'); out(['ok' => true, 'client_id' => $cid]);
        case 'clients_list':
            need($SALES); $by = [];
            foreach (q('SELECT id,client_id,stage,service,value,created_at FROM wx_leads WHERE client_id IS NOT NULL')->fetchAll() as $l) $by[(int)$l['client_id']][] = ['id' => (int)$l['id'], 'stage' => $l['stage'], 'service' => (string)$l['service'], 'value' => (int)$l['value'], 'created_at' => $l['created_at']];
            $cl = array_map(function ($c) use ($by) { $c['id'] = (int)$c['id']; $ls = $by[$c['id']] ?? []; foreach (['phone', 'email', 'company', 'city', 'address', 'notes'] as $k) $c[$k] = (string)($c[$k] ?? '');
                $c['leads'] = $ls; $c['value'] = array_sum(array_map(fn($l) => $l['stage'] === 'won' ? $l['value'] : 0, $ls)); return $c; }, q('SELECT * FROM wx_clients ORDER BY id DESC')->fetchAll());
            out(['ok' => true, 'clients' => $cl]);
        case 'client_save':
            $u = need($SALES); $name = clip($in['name'] ?? '', 120); if ($name === '') fail('Name is required'); $id = (int)($in['id'] ?? 0);
            $v = [$name, clip($in['phone'] ?? '', 40), clip($in['email'] ?? '', 190), clip($in['company'] ?? '', 120), clip($in['city'] ?? '', 80), clip($in['address'] ?? '', 300), clip($in['notes'] ?? '', 4000)];
            if ($id) { if (!q('SELECT 1 FROM wx_clients WHERE id=?', [$id])->fetchColumn()) fail('Client not found', 404); q('UPDATE wx_clients SET name=?,phone=?,email=?,company=?,city=?,address=?,notes=? WHERE id=?', array_merge($v, [$id])); }
            else { q('INSERT INTO wx_clients (name,phone,email,company,city,address,notes,created_at) VALUES (?,?,?,?,?,?,?,?)', array_merge($v, [now()])); $id = (int)db()->lastInsertId(); }
            s17_client_extra($id, $in);
            log_act($u, !empty($in['id']) ? 'client.update' : 'client.create', $name); out(['ok' => true, 'client' => q('SELECT * FROM wx_clients WHERE id=?', [$id])->fetch()]);
        case 'client_delete':
            $u = need(['owner', 'admin']); $c = q('SELECT * FROM wx_clients WHERE id=?', [(int)($in['id'] ?? 0)])->fetch(); if (!$c) fail('Client not found', 404);
            q('UPDATE wx_leads SET client_id=NULL WHERE client_id=?', [$c['id']]); q('DELETE FROM wx_clients WHERE id=?', [$c['id']]); log_act($u, 'client.delete', $c['name']); out(['ok' => true]);
        case 'crm_settings':
            need(['owner', 'admin']); out(['ok' => true, 'settings' => crm_cfg_pub(crm_cfg())]);
        case 'crm_settings_save':
            $u = need(['owner', 'admin']); $c = crm_cfg(); $s = (array)($in['settings'] ?? []);
            foreach ($c as $k => $old) { if (!array_key_exists($k, $s)) continue; if (in_array($k, CRM_SECRETS, true) && $s[$k] === '' && empty($s[$k . 'Clear'])) continue;
                $c[$k] = is_bool($old) ? !empty($s[$k]) : ($k === 'smtpPort' ? ((int)$s[$k] ?: 465) : clip($s[$k], 600)); }
            foreach (array_filter(preg_split('~[\s,]+~', $c['emailTo'])) as $e) if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fail('Check the alert email address(es)');
            jwrite(CRM_FILE, $c); log_act($u, 'settings.crm'); out(['ok' => true, 'settings' => crm_cfg_pub($c)]);
        /* ---------- P16: WhatsApp connection (connect / change number / disconnect) ---------- */
        case 'crm_wa_status':
            need(['owner', 'admin']); $c = crm_cfg(); if (!$c['waToken'] || !$c['waPhoneId']) out(['ok' => true, 'connected' => false]);
            $i = wa_phone_info($c['waToken'], $c['waPhoneId']); out(['ok' => true, 'connected' => $i['ok'], 'info' => $i, 'alerts' => (bool)$c['waOn'], 'alertTo' => $c['waTo']]);
        case 'crm_wa_connect':
            $u = need(['owner', 'admin']); $c = crm_cfg(); $tok = trim((string)($in['token'] ?? '')) ?: $c['waToken']; $pid = preg_replace('~\D~', '', (string)($in['phoneId'] ?? ''));
            if ($tok === '' || $pid === '') fail('Enter the access token and the Phone number ID');
            $i = wa_phone_info($tok, $pid); if (!$i['ok']) fail('Meta did not accept this: ' . $i['error']);
            $c['waToken'] = $tok; $c['waPhoneId'] = $pid; jwrite(CRM_FILE, $c); log_act($u, 'settings.wa', $i['number']); out(['ok' => true, 'info' => $i]);
        case 'crm_wa_disconnect':
            $u = need(['owner', 'admin']); $c = crm_cfg(); $c['waToken'] = ''; $c['waPhoneId'] = ''; $c['waOn'] = false; jwrite(CRM_FILE, $c); log_act($u, 'settings.wa', 'disconnected'); out(['ok' => true]);
        /* ---------- P16: discount offers sent to leads ---------- */
        case 'crm_offers':
            need($SALES); out(['ok' => true, 'offers' => jread(OFFERS_FILE)['offers'] ?? [], 'waConnected' => crm_cfg()['waToken'] !== '' && crm_cfg()['waPhoneId'] !== '']);
        case 'crm_offer_save':
            $u = need(['owner', 'admin']); $d = jread(OFFERS_FILE); $list = $d['offers'] ?? []; $id = (string)($in['id'] ?? '') ?: bin2hex(random_bytes(4));
            $o = ['id' => $id, 'title' => clip($in['title'] ?? '', 80), 'code' => strtoupper(preg_replace('~[^A-Za-z0-9-]~', '', (string)($in['code'] ?? ''))), 'percent' => max(0, min(90, (int)($in['percent'] ?? 0))),
                  'expires' => preg_match('~^\d{4}-\d{2}-\d{2}$~', (string)($in['expires'] ?? '')) ? $in['expires'] : '', 'msg' => clip($in['msg'] ?? '', 1000), 'sent' => 0];
            if ($o['title'] === '' || $o['msg'] === '') fail('Enter a title and the message');
            $found = false; foreach ($list as &$x) if ($x['id'] === $id) { $o['sent'] = (int)($x['sent'] ?? 0); $x = $o; $found = true; } unset($x); if (!$found) $list[] = $o;
            $d['offers'] = $list; jwrite(OFFERS_FILE, $d); log_act($u, 'offer.save', $o['title']); out(['ok' => true, 'offers' => $list]);
        case 'crm_offer_delete':
            $u = need(['owner', 'admin']); $d = jread(OFFERS_FILE); $d['offers'] = array_values(array_filter($d['offers'] ?? [], fn($x) => $x['id'] !== (string)($in['id'] ?? ''))); jwrite(OFFERS_FILE, $d); out(['ok' => true, 'offers' => $d['offers']]);
        case 'crm_offer_send':
            $u = need($SALES); $d = jread(OFFERS_FILE); $off = null; foreach (($d['offers'] ?? []) as $x) if ($x['id'] === (string)($in['id'] ?? '')) $off = $x; if (!$off) fail('Offer not found', 404);
            if ($off['expires'] && $off['expires'] < date('Y-m-d')) fail('This offer has expired — change the date first');
            $ids = array_slice(array_map('intval', (array)($in['leads'] ?? [])), 0, 50); if (!$ids) fail('Choose at least one lead');
            $res = []; $sent = 0;
            foreach ($ids as $lid) { try { $l = lead_get($lid); } catch (Throwable $e) { continue; }
                $txt = offer_text($off, $l); $link = 'https://wa.me/' . preg_replace('~\D~', '', (string)$l['phone']) . '?text=' . rawurlencode($txt);
                $err = $l['phone'] ? wa_text((string)$l['phone'], $txt) : 'no phone number';
                if ($err === '') { $sent++; lead_note_add($lid, $u['name'], 'Offer sent on WhatsApp: ' . $off['title'] . ($off['code'] ? ' (' . $off['code'] . ')' : '')); }
                $res[] = ['id' => $lid, 'name' => $l['name'], 'ok' => $err === '', 'error' => $err, 'link' => $l['phone'] ? $link : ''];
            }
            foreach ($d['offers'] as &$x) if ($x['id'] === $off['id']) $x['sent'] = (int)($x['sent'] ?? 0) + $sent; unset($x); jwrite(OFFERS_FILE, $d);
            log_act($u, 'offer.send', $off['title'] . ' → ' . $sent); out(['ok' => true, 'sent' => $sent, 'results' => $res]);
        case 'crm_test':
            need(['owner', 'admin']); $ch = ($in['channel'] ?? '') === 'whatsapp' ? 'whatsapp' : 'email'; $c = crm_cfg();
            if ($ch === 'email' && !$c['emailTo']) fail('Add an alert email address first');
            if ($ch === 'whatsapp' && !($c['waToken'] && $c['waPhoneId'] && $c['waTo'])) fail('Add the WhatsApp token, phone number ID and recipient first');
            $r = send_alerts(['id' => 0, 'source' => 'manual', 'name' => 'Test enquiry', 'phone' => '+92 300 0000000', 'email' => '', 'service' => 'Test', 'message' => 'This is a test alert from Woodex Admin.', 'fields' => [], 'page' => '/admin/'], $ch);
            $v = $r[$ch] ?? 'not sent'; if (strpos($v, 'failed') === 0) fail($v); out(['ok' => true, 'result' => $v]);
    }
    return false;
}
require_once __DIR__ . '/sheets-lib.php';
