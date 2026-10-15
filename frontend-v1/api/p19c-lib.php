<?php
/* P19 C — one central client record.
   - p19c_link(): attach leads / quotes / invoices / projects that have no client yet to the client with the same phone (last 10 digits) or email.
   - client_comms: live-chat + WhatsApp conversations for a client (matched by phone/email), for the client page "Messages" tab.
   - clients_link: run the linker now and report counts. */

function p19c_key($p): string { $d = preg_replace('~\D~', '', (string)$p); return strlen($d) >= 10 ? substr($d, -10) : ''; }

function p19c_index(): array {
    $ph = []; $em = [];
    foreach (q('SELECT id,phone,email FROM wx_clients ORDER BY id')->fetchAll() as $c) {
        $k = p19c_key($c['phone']); if ($k !== '' && !isset($ph[$k])) $ph[$k] = (int)$c['id'];
        $e = strtolower(trim((string)$c['email'])); if ($e !== '' && !isset($em[$e])) $em[$e] = (int)$c['id'];
    }
    return [$ph, $em];
}
function p19c_match(array $ix, $phone, $email): int {
    $k = p19c_key($phone); if ($k !== '' && isset($ix[0][$k])) return $ix[0][$k];
    $e = strtolower(trim((string)$email)); return ($e !== '' && isset($ix[1][$e])) ? $ix[1][$e] : 0;
}

function p19c_link(bool $throttle = false): array {
    $n = ['leads' => 0, 'quotes' => 0, 'invoices' => 0, 'projects' => 0];
    if ($throttle) { $t = (int)(q("SELECT v FROM wx_settings WHERE k='p19c_link_t'")->fetchColumn() ?: 0); if (time() - $t < 60) return $n; }
    q("REPLACE INTO wx_settings (k,v) VALUES ('p19c_link_t',?)", [(string)time()]);
    $ix = p19c_index(); if (!$ix[0] && !$ix[1]) return $n;
    foreach (q('SELECT id,phone,email FROM wx_leads WHERE client_id IS NULL')->fetchAll() as $l) {
        if ($c = p19c_match($ix, $l['phone'], $l['email'])) { q('UPDATE wx_leads SET client_id=? WHERE id=?', [$c, $l['id']]); $n['leads']++; }
    }
    if (function_exists('sales_migrate')) sales_migrate();
    foreach (['wx_quotes' => 'quotes', 'wx_invoices' => 'invoices', 'wx_projects' => 'projects'] as $t => $k) {
        foreach (q("SELECT id,data FROM $t")->fetchAll() as $r) {
            $d = json_decode($r['data'], true) ?: []; if (!empty($d['client_id'])) continue;
            $cl = $d['client'] ?? []; $c = p19c_match($ix, $cl['phone'] ?? ($d['client_phone'] ?? ''), $cl['email'] ?? '');
            if (!$c && $t === 'wx_projects' && !empty($d['quote_id'])) continue;
            if ($c) { $d['client_id'] = $c; q("UPDATE $t SET data=? WHERE id=?", [json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $r['id']]); $n[$k]++; }
        }
    }
    return $n;
}

function p19c_comms(array $c): array {
    if (function_exists('chat_migrate')) chat_migrate();
    $k = p19c_key($c['phone'] ?? ''); $e = strtolower(trim((string)($c['email'] ?? '')));
    $leadIds = array_map('intval', array_column(q('SELECT id FROM wx_leads WHERE client_id=?', [(int)$c['id']])->fetchAll(), 'id'));
    $out = [];
    try { $rows = q('SELECT id,created_at,updated_at,name,phone,email,status,mode,channel,last_text,lead_id FROM wx_chats ORDER BY updated_at DESC LIMIT 2000')->fetchAll(); }
    catch (Throwable $x) { return []; }
    foreach ($rows as $r) {
        $hit = ($k !== '' && p19c_key($r['phone']) === $k) || ($e !== '' && strtolower((string)$r['email']) === $e) || ($r['lead_id'] && in_array((int)$r['lead_id'], $leadIds, true));
        if (!$hit) continue;
        $msgs = array_reverse(q('SELECT t,who,name,text FROM wx_chat_msgs WHERE chat_id=? ORDER BY id DESC LIMIT 6', [$r['id']])->fetchAll());
        $out[] = ['id' => (int)$r['id'], 'channel' => (string)($r['channel'] ?? 'web'), 'status' => $r['status'], 'mode' => $r['mode'], 'started' => $r['created_at'], 'updated' => $r['updated_at'],
            'count' => (int)q('SELECT COUNT(*) FROM wx_chat_msgs WHERE chat_id=?', [$r['id']])->fetchColumn(), 'last' => $msgs];
        if (count($out) >= 30) break;
    }
    return $out;
}

function p19c_actions(string $action, array $in): bool {
    if (!in_array($action, ['client_comms', 'clients_link'], true)) return false;
    $u = need(['owner', 'admin', 'sales']);
    if ($action === 'clients_link') { $n = p19c_link(false); log_act($u, 'clients.link', json_encode($n)); out(['ok' => true, 'linked' => $n]); }
    $c = q('SELECT id,name,phone,email FROM wx_clients WHERE id=?', [(int)($in['id'] ?? 0)])->fetch(); if (!$c) fail('Client not found', 404);
    out(['ok' => true, 'chats' => p19c_comms($c)]);
}
