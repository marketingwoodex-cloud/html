<?php
/**
 * P17 S1+S2 — client master database + leads with follow-ups (extends crm-lib.php; nothing is rewritten).
 * Adds columns only (safe migration). Hooks: s17_lead_extra() from lead_save, s17_client_extra() from client_save.
 * Actions: lead_activity, leads_followups, leads_stats, leads_import2, clients_master, client_360, clients_merge.
 */
declare(strict_types=1);

const S17_LINES   = ['furniture' => 'Furniture', 'interior' => 'Interior', 'project' => 'Project'];
const S17_LTYPES  = ['new' => 'New lead', 'returning' => 'Returning client', 'referral' => 'Referral'];
const S17_QSTAT   = ['' => '—', 'pending' => 'Pending', 'proposal' => 'Proposal / Quotation', 'done' => 'Done'];
const S17_NEXT    = ['call' => 'Call', 'whatsapp' => 'WhatsApp', 'visit' => 'Site visit', 'meeting' => 'Meeting', 'email' => 'Email'];
const S17_KINDS   = ['call', 'whatsapp', 'visit', 'meeting', 'email', 'note'];
const S17_PRIO    = ['low', 'normal', 'high'];
const S17_CTYPES  = ['individual' => 'Individual', 'company' => 'Company', 'developer' => 'Developer / builder', 'architect' => 'Architect / consultant'];
const S17_PTYPES  = ['Kitchen design', 'Wardrobe & storage', 'Bedroom design', 'Living room design', 'Dining room design', 'Kids room design', 'Home office design', 'Basement design', 'Complete home redesign / refurbishment', 'House design (5 / 10 marla, 1 / 2 kanal)', 'Farmhouse design', 'Front elevation design', 'Office interior design', 'Office fit-out', 'Co-working space', 'Retail / showroom design', 'Shopping mall design', 'Restaurant / café interior', 'Hotel interior design', 'Healthcare / clinic design', 'Pharmacy fit-out', 'Gym design', 'Spa / beauty salon design', 'Educational building design', 'Commercial fit-out', 'Residential renovation', 'Commercial / office renovation', 'Restaurant / showroom renovation', 'Architecture & master planning', 'Turnkey design-build', '3D visualisation', 'Furniture supply', 'Other'];
const S17_LEAD_COLS = ['company' => 'VARCHAR(120) NULL', 'designation' => 'VARCHAR(80) NULL', 'location' => 'VARCHAR(160) NULL', 'line' => 'VARCHAR(20) NULL',
    'lead_type' => 'VARCHAR(20) NULL', 'project_type' => 'VARCHAR(60) NULL', 'budget' => 'VARCHAR(60) NULL', 'area' => 'VARCHAR(30) NULL', 'priority' => 'VARCHAR(10) NULL',
    'quote_status' => 'VARCHAR(20) NULL', 'last_contact' => 'DATETIME NULL', 'next_at' => 'DATETIME NULL', 'next_type' => 'VARCHAR(20) NULL'];
const S17_NOTE_COLS = ['kind' => 'VARCHAR(20) NULL', 'outcome' => 'VARCHAR(190) NULL'];
const S17_CLIENT_COLS = ['type' => 'VARCHAR(20) NULL', 'source' => 'VARCHAR(40) NULL', 'tags' => 'VARCHAR(400) NULL', 'line' => 'VARCHAR(20) NULL', 'designation' => 'VARCHAR(80) NULL', 'updated_at' => 'DATETIME NULL'];

/** Adds missing columns once (version flag in _private). */
function s17_migrate(): void {
    static $done = false; if ($done) return; $done = true;
    $flag = PRIVATE_DIR . '/s17.json'; if ((jread($flag)['v'] ?? 0) >= 1) return;
    crm_migrate();
    foreach (['wx_leads' => S17_LEAD_COLS, 'wx_lead_notes' => S17_NOTE_COLS, 'wx_clients' => S17_CLIENT_COLS] as $t => $cols) {
        $have = array_map(fn($r) => strtolower((string)($r['Field'] ?? $r['field'] ?? '')), q("SHOW COLUMNS FROM $t")->fetchAll());
        foreach ($cols as $c => $def) if (!in_array($c, $have, true)) q("ALTER TABLE $t ADD COLUMN $c $def");
    }
    try { q('CREATE INDEX wx_leads_next ON wx_leads (next_at)'); } catch (Throwable $e) { /* exists */ }
    jwrite($flag, ['v' => 1, 't' => date('c')]);
}
function s17_dt($v): ?string { $v = trim((string)$v); if ($v === '') return null; $t = strtotime(str_replace('T', ' ', $v)); if (!$t) fail('Check the date / time "' . clip($v, 30) . '"'); return date('Y-m-d H:i:s', $t); }
function s17_digits($p): string { $d = preg_replace('~\D~', '', (string)$p); if (strlen($d) === 11 && $d[0] === '0') $d = '92' . substr($d, 1); elseif (strlen($d) === 10 && $d[0] === '3') $d = '92' . $d; return $d; }

/** Extra lead fields (called from lead_save after the base fields). */
function s17_lead_extra(int $id, array $in): void {
    s17_migrate(); $set = []; $p = [];
    foreach (['company' => 120, 'designation' => 80, 'location' => 160, 'project_type' => 60, 'budget' => 60, 'area' => 30] as $k => $n) if (array_key_exists($k, $in)) { $set[] = "$k=?"; $p[] = clip($in[$k], $n); }
    $enum = ['line' => array_keys(S17_LINES), 'lead_type' => array_keys(S17_LTYPES), 'quote_status' => array_keys(S17_QSTAT), 'next_type' => array_keys(S17_NEXT), 'priority' => S17_PRIO];
    foreach ($enum as $k => $ok) if (array_key_exists($k, $in)) { $v = (string)$in[$k]; if ($v !== '' && !in_array($v, $ok, true)) fail('Unknown ' . str_replace('_', ' ', $k)); $set[] = "$k=?"; $p[] = $v ?: null; }
    if (array_key_exists('next_at', $in)) { $d = s17_dt($in['next_at']); $set[] = 'next_at=?'; $p[] = $d; $set[] = 'followup=?'; $p[] = $d ? substr($d, 0, 10) : null; }
    if (array_key_exists('last_contact', $in)) { $set[] = 'last_contact=?'; $p[] = s17_dt($in['last_contact']); }
    if (!empty($in['client_id'])) { $c = (int)$in['client_id']; if (!q('SELECT 1 FROM wx_clients WHERE id=?', [$c])->fetchColumn()) fail('Client not found', 404); $set[] = 'client_id=?'; $p[] = $c; }
    if ($set) { $p[] = $id; q('UPDATE wx_leads SET ' . implode(',', $set) . ' WHERE id=?', $p); }
}
function s17_client_extra(int $id, array $in): void {
    s17_migrate(); $set = ['updated_at=?']; $p = [now()];
    foreach (['designation' => 80, 'source' => 40] as $k => $n) if (array_key_exists($k, $in)) { $set[] = "$k=?"; $p[] = clip($in[$k], $n); }
    if (array_key_exists('type', $in)) { $v = (string)$in['type']; if ($v !== '' && !isset(S17_CTYPES[$v])) fail('Unknown client type'); $set[] = 'type=?'; $p[] = $v ?: null; }
    if (array_key_exists('line', $in)) { $v = (string)$in['line']; if ($v !== '' && !isset(S17_LINES[$v])) fail('Unknown business line'); $set[] = 'line=?'; $p[] = $v ?: null; }
    if (array_key_exists('tags', $in)) { $t = is_array($in['tags']) ? $in['tags'] : explode(',', (string)$in['tags']); $set[] = 'tags=?'; $p[] = implode(',', array_slice(array_values(array_filter(array_map(fn($x) => mb_strtolower(clip($x, 30)), $t))), 0, 12)); }
    $p[] = $id; q('UPDATE wx_clients SET ' . implode(',', $set) . ' WHERE id=?', $p);
}

/** Sales documents for one client (by client_id, or phone match for older docs). */
function s17_docs_for(array $c): array {
    sales_migrate(); $d = s17_digits($c['phone'] ?? ''); $cid = (int)$c['id'];
    $mine = function ($x) use ($cid, $d) { if ((int)($x['client_id'] ?? 0) === $cid) return true; $ph = s17_digits($x['client']['phone'] ?? ''); return $d !== '' && strlen($d) >= 10 && $ph === $d; };
    $quotes = array_values(array_filter(doc_all('wx_quotes'), $mine));
    $invs = array_map('inv_pub', array_values(array_filter(doc_all('wx_invoices'), $mine)));
    $projs = array_values(array_filter(doc_all('wx_projects'), fn($x) => (int)($x['client_id'] ?? 0) === $cid));
    return [$quotes, $invs, $projs];
}
function s17_client_status(array $invs, array $projs, array $leads): string {
    $n = count($invs); $open = array_filter($projs, fn($p) => !in_array($p['stage'] ?? '', ['handover', 'done', 'closed'], true));
    $bal = array_sum(array_column($invs, 'balance')); $won = count(array_filter($leads, fn($l) => $l['stage'] === 'won'));
    if ($n >= 2 || $won >= 2) return 'returning';
    if ($open || $bal > 0 || $n === 1 && strtotime((string)end($invs)['issue_date']) > strtotime('-90 days')) return 'active';
    if ($n === 0 && $won === 0) return 'prospect';
    return 'past';
}


// ---------------------------------------------------------------- S3 invoice tracker helpers
const S17_IMODES = ['' => 'Standard', 'after_delivery' => 'Payment after delivery'];
/** Next number in a series: WF- (furniture, own counter from 10050) or the main WI- series shared with quotations. */
function s17_inv_no(string $line): string {
    for ($k = 0; $k < 500; $k++) { $no = s17_inv_no1($line); if (!q('SELECT 1 FROM wx_invoices WHERE no=?', [$no])->fetchColumn() && !q('SELECT 1 FROM wx_quotes WHERE data LIKE ?', ['%"no":"' . $no . '"%'])->fetchColumn()) return $no; }
    fail('Could not find a free invoice number; set the next number in Company settings');
}
function s17_inv_no1(string $line): string {
    if ($line !== 'furniture') return next_no();
    $fh = fopen(COMPANY_FILE . '.lock', 'c'); flock($fh, LOCK_EX);
    $c = jread(COMPANY_FILE); $n = max(10050, (int)($c['wfNext'] ?? 10050)); $c['wfNext'] = $n + 1; jwrite(COMPANY_FILE, $c);
    flock($fh, LOCK_UN); fclose($fh); return ($c['wfPrefix'] ?? 'WF-') . $n;
}
/** Tracker view of an invoice: status Paid / Partial / After delivery / Unpaid + late delivery. */
function s17_inv_row(array $i): array {
    $i = inv_pub($i); $t = date('Y-m-d');
    $i['track'] = $i['total'] > 0 && $i['balance'] <= 0 ? 'paid' : (($i['mode'] ?? '') === 'after_delivery' && empty($i['delivered']) ? 'after_delivery' : ($i['paid'] > 0 ? 'partial' : 'unpaid'));
    $i['late'] = !empty($i['delivery_date']) && empty($i['delivered']) && $i['delivery_date'] < $t;
    foreach (['po', 'delivery_date', 'line', 'mode', 'track_note'] as $k) $i[$k] = (string)($i[$k] ?? '');
    $i['delivered'] = (string)($i['delivered'] ?? ''); $i['company'] = (string)($i['client']['company'] ?? '') ?: (string)($i['client']['name'] ?? '');
    unset($i['sections']); return $i;
}
function s17_inv_client(array $in): array {
    $cid = (int)($in['client_id'] ?? 0); $cl = ['name' => clip($in['client']['name'] ?? '', 120), 'company' => clip($in['client']['company'] ?? '', 120), 'phone' => clip($in['client']['phone'] ?? '', 40), 'email' => clip($in['client']['email'] ?? '', 190), 'address' => clip($in['client']['address'] ?? '', 300)];
    if ($cid) { $c = q('SELECT * FROM wx_clients WHERE id=?', [$cid])->fetch(); if (!$c) fail('Client not found', 404); foreach ($cl as $k => $v) if ($v === '') $cl[$k] = (string)($c[$k] ?? ''); }
    if ($cl['name'] === '') $cl['name'] = $cl['company']; if ($cl['name'] === '') fail('Pick a client or type the company name');
    if (!$cid) { // find by phone / company, else create
        $d = s17_digits($cl['phone']);
        foreach (q('SELECT id,phone,company,name FROM wx_clients')->fetchAll() as $c) if (($d !== '' && strlen($d) >= 10 && s17_digits($c['phone']) === $d) || ($cl['company'] !== '' && mb_strtolower((string)$c['company']) === mb_strtolower($cl['company']))) { $cid = (int)$c['id']; break; }
        if (!$cid) { q("INSERT INTO wx_clients (name,phone,email,company,city,address,notes,created_at) VALUES (?,?,?,?,'Lahore',?,'',?)", [$cl['name'], $cl['phone'], $cl['email'], $cl['company'], $cl['address'], now()]); $cid = (int)db()->lastInsertId(); }
    }
    return [$cid, $cl];
}

function s17_proj_row(array $p, array $inv, array $names, string $today): array {
    $ms = $p['milestones'] ?? []; $mine = array_values(array_filter($inv, fn($i) => (int)($i['project_id'] ?? 0) === (int)$p['id'] || (!empty($p['invoice_id']) && (int)$i['id'] === (int)$p['invoice_id'])));
    $byId = []; foreach ($mine as $i) $byId[(int)$i['id']] = $i;
    $invoiced = (int)array_sum(array_column($mine, 'total')); $rec = (int)array_sum(array_column($mine, 'paid')); $value = (int)($p['value'] ?? 0);
    $si = array_search($p['stage'], SALES_PSTAGES, true); $done = in_array($p['stage'], ['handover', 'completed'], true);
    $last = end($p['updates']) ?: null;
    return ['id' => (int)$p['id'], 'name' => $p['name'], 'client_id' => $p['client_id'] ?? null, 'client_name' => $p['client_name'] ?? '', 'no' => $p['no'] ?? '', 'site' => $p['site'] ?? '', 'line' => $p['line'] ?? '', 'ptype' => $p['ptype'] ?? '', 'area' => (int)($p['area'] ?? 0),
        'stage' => $p['stage'], 'progress' => $si === false ? 0 : (int)round($si / (count(SALES_PSTAGES) - 1) * 100), 'start' => $p['start'] ?? '', 'target' => $p['target'] ?? '', 'late' => !$done && !empty($p['target']) && $p['target'] < $today,
        'value' => $value, 'invoiced' => $invoiced, 'received' => $rec, 'balance' => max(0, $invoiced - $rec), 'unbilled' => max(0, $value - $invoiced),
        'manager' => $p['manager'] ?? null, 'manager_name' => !empty($p['manager']) ? ($names[(int)$p['manager']] ?? '') : '', 'team' => $p['team'] ?? [], 'team_names' => array_values(array_filter(array_map(fn($t) => $names[(int)$t] ?? '', $p['team'] ?? []))),
        'photos' => count($p['photos'] ?? []), 'cover' => ($p['photos'] ?? []) ? end($p['photos'])['url'] : '', 'last' => $last ? ['t' => $last['t'] ?? '', 'text' => $last['text'] ?? ''] : null, 'quote_id' => $p['quote_id'] ?? null, 'invoice_id' => $p['invoice_id'] ?? null,
        'milestones' => array_map(function ($m) use ($byId, $value) { $i = $m['inv_id'] ? ($byId[(int)$m['inv_id']] ?? null) : null; return $m + ['amount' => (int)round($value * $m['pct'] / 100), 'inv_no' => $i['no'] ?? '', 'paid' => $i['paid'] ?? 0, 'status' => !$m['inv_id'] ? 'unbilled' : (!$i ? 'missing' : ($i['balance'] <= 0 ? 'paid' : ($i['paid'] > 0 ? 'partial' : 'billed')))]; }, $ms),
        'invoices' => array_map(fn($i) => ['id' => (int)$i['id'], 'no' => $i['no'], 'total' => $i['total'], 'paid' => $i['paid'], 'balance' => $i['balance']], $mine)];
}

function sales17_actions(string $action, array $in): bool {
    if (!in_array($action, ['lead_activity', 'leads_followups', 'leads_stats', 'leads_import2', 'clients_master', 'client_360', 'clients_merge', 's17_meta', 'projs_table', 'proj_meta', 'proj_milestones', 'proj_bill', 'inv_new', 'inv_track', 'invs_tracker', 'invs_import'], true)) return false;
    s17_migrate(); $SALES = ['owner', 'admin', 'sales'];
    switch ($action) {
        case 's17_meta':
            need($SALES); out(['ok' => true, 'lines' => S17_LINES, 'leadTypes' => S17_LTYPES, 'quoteStatus' => S17_QSTAT, 'nextTypes' => S17_NEXT, 'clientTypes' => S17_CTYPES, 'projectTypes' => S17_PTYPES]);

        case 'lead_activity': // log a call / WhatsApp / visit / meeting + set the next follow-up in one step
            $u = need($SALES); $l = lead_get((int)($in['id'] ?? 0)); $k = (string)($in['kind'] ?? 'note'); if (!in_array($k, S17_KINDS, true)) fail('Unknown activity type');
            $text = clip($in['text'] ?? '', 2000); $out = clip($in['outcome'] ?? '', 190);
            if ($text === '' && $out === '') { $chg = (!empty($in['stage']) && $in['stage'] !== $l['stage']) || !empty($in['next_at']);
                if (!$chg && $k === 'note') fail('Add a short note, pick an outcome, or set a follow-up');
                $text = ucfirst($k === 'note' ? 'update' : $k) . ' logged' . (!empty($in['next_at']) ? ' · next follow-up set' : ''); }
            q('INSERT INTO wx_lead_notes (lead_id,t,user_name,text,sys,kind,outcome) VALUES (?,?,?,?,0,?,?)', [$l['id'], now(), $u['name'], $text ?: $out, $k, $out ?: null]);
            $set = ['is_read=1']; $p = [];
            if ($k !== 'note') { $set[] = 'last_contact=?'; $p[] = now(); if ($l['stage'] === 'new') { $set[] = "stage='contacted'"; lead_note_add($l['id'], $u['name'], 'Stage: new → contacted', true); } }
            if (array_key_exists('next_at', $in)) { $d = s17_dt($in['next_at']); $set[] = 'next_at=?'; $p[] = $d; $set[] = 'followup=?'; $p[] = $d ? substr($d, 0, 10) : null;
                $nt = (string)($in['next_type'] ?? 'call'); if (!isset(S17_NEXT[$nt])) $nt = 'call'; $set[] = 'next_type=?'; $p[] = $d ? $nt : null; }
            if (!empty($in['stage']) && in_array($in['stage'], CRM_STAGES, true) && $in['stage'] !== $l['stage']) { $set[] = 'stage=?'; $p[] = $in['stage']; lead_note_add($l['id'], $u['name'], "Stage: {$l['stage']} → {$in['stage']}", true); }
            $p[] = $l['id']; q('UPDATE wx_leads SET ' . implode(',', $set) . ' WHERE id=?', $p);
            log_act($u, 'lead.activity', '#' . $l['id'] . ' ' . $k); out(['ok' => true, 'lead' => lead_get($l['id'])]);

        case 'leads_followups':
            need($SALES); $now = date('Y-m-d H:i:s'); $today = date('Y-m-d'); $wk = date('Y-m-d', strtotime('+7 days'));
            $rows = q("SELECT l.id,l.name,l.company,l.phone,l.stage,l.next_at,l.next_type,l.line,u.name assigned_name FROM wx_leads l LEFT JOIN wx_users u ON u.id=l.assigned_to
                WHERE l.next_at IS NOT NULL AND l.stage NOT IN ('won','lost') AND l.next_at < ? ORDER BY l.next_at", [$wk . ' 23:59:59'])->fetchAll();
            $g = ['overdue' => [], 'today' => [], 'upcoming' => []];
            foreach ($rows as $r) { $r['id'] = (int)$r['id']; $r['assigned_name'] = (string)($r['assigned_name'] ?? ''); $d = substr($r['next_at'], 0, 10);
                $g[$r['next_at'] < $now && $d < $today ? 'overdue' : ($d === $today ? 'today' : ($r['next_at'] < $now ? 'overdue' : 'upcoming'))][] = $r; }
            out(['ok' => true] + $g);

        case 'leads_stats': // counters per month, like the "Lead Management" sheet
            need($SALES); $m = preg_match('~^\d{4}-\d{2}$~', (string)($in['month'] ?? '')) ? $in['month'] : '';
            $w = $m ? ' WHERE created_at >= ? AND created_at < ?' : ''; $p = $m ? [$m . '-01', date('Y-m-01', strtotime($m . '-01 +1 month'))] : [];
            $k = ['total' => 0, 'new' => 0, 'client' => 0, 'meeting' => 0, 'proposal' => 0, 'hold' => 0, 'done' => 0, 'won' => 0, 'lost' => 0, 'value' => 0, 'wonValue' => 0];
            foreach (q('SELECT stage,lead_type,client_id,quote_status,value FROM wx_leads' . $w, $p)->fetchAll() as $r) {
                $k['total']++; $k['value'] += (int)$r['value'];
                if ($r['lead_type'] === 'returning' || $r['client_id']) $k['client']++; else $k['new']++;
                if ($r['stage'] === 'visit') $k['meeting']++; if ($r['stage'] === 'quote' || $r['quote_status'] === 'proposal') $k['proposal']++;
                if ($r['stage'] === 'hold') $k['hold']++; if ($r['quote_status'] === 'done') $k['done']++;
                if ($r['stage'] === 'won') { $k['won']++; $k['wonValue'] += (int)$r['value']; } if ($r['stage'] === 'lost') $k['lost']++;
            }
            $months = array_column(q("SELECT DISTINCT DATE_FORMAT(created_at,'%Y-%m') m FROM wx_leads ORDER BY m DESC LIMIT 36")->fetchAll(), 'm');
            out(['ok' => true, 'month' => $m, 'stats' => $k, 'months' => $months]);

        case 'leads_import2': // your Lead-Management sheet → leads (+ clients for "Client" rows)
            $u = need(['owner', 'admin']); $n = 0; $skip = 0;
            $team = []; foreach (q('SELECT id,name FROM wx_users')->fetchAll() as $t) $team[mb_strtolower(strtok((string)$t['name'], ' '))] = (int)$t['id'];
            $known = []; foreach (q('SELECT phone,name FROM wx_leads')->fetchAll() as $r) $known[s17_digits($r['phone']) . '|' . mb_strtolower((string)$r['name'])] = 1;
            $mkc = !array_key_exists('clients', $in) || !empty($in['clients']); $cix = $mkc && function_exists('p19c_index') ? p19c_index() : [[], []]; $cn = 0; $cl = 0; // P19: also fill the central client database
            foreach (array_slice((array)($in['rows'] ?? []), 0, 3000) as $r) {
                if (!is_array($r)) continue; $name = clip($r['name'] ?? '', 120); $co = clip($r['company'] ?? '', 120);
                if ($name === '' || preg_match('~^name$~i', $name)) $name = $co; if ($name === '' || preg_match('~^(company|name)$~i', $name)) { $skip++; continue; }
                $key = s17_digits($r['phone'] ?? '') . '|' . mb_strtolower($name); if (isset($known[$key])) { $skip++; continue; } $known[$key] = 1;
                $act = mb_strtolower(trim((string)($r['action'] ?? ''))); $stage = ['won' => 'won', 'hold' => 'hold', 'meeting' => 'visit', 'visit' => 'visit', 'close' => 'lost', 'closed' => 'lost', 'lost' => 'lost', 'done' => 'contacted', 'contacted' => 'contacted'][$act] ?? 'new';
                $qs = mb_strtolower((string)($r['quotation'] ?? '')); $qs = str_contains($qs, 'done') ? 'done' : (preg_match('~propo|quot~', $qs) ? 'proposal' : (str_contains($qs, 'pend') ? 'pending' : null));
                if ($qs === 'proposal' && $stage === 'new') $stage = 'quote';
                $line = mb_strtolower((string)($r['line'] ?? '')); $line = isset(S17_LINES[$line]) ? $line : null;
                $lt = preg_match('~client~i', (string)($r['source'] ?? '')) ? 'returning' : (preg_match('~refer~i', (string)($r['source'] ?? '')) ? 'referral' : 'new');
                $as = $team[mb_strtolower(strtok(trim((string)($r['assigned'] ?? '')) ?: '-', ' '))] ?? null;
                $date = function ($v) { $v = trim((string)$v); if ($v === '' || stripos($v, 'dd/') !== false) return null; if (preg_match('~^(\d{1,2})/(\d{1,2})/(\d{4})~', $v, $m)) return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]); $t = strtotime($v); return $t ? date('Y-m-d H:i:s', $t) : null; };
                $ca = $date($r['date'] ?? '') ?: now(); $ca = strlen($ca) === 10 ? $ca . ' 10:00:00' : $ca; $meet = $date($r['meeting'] ?? ''); $last = $date($r['last_contact'] ?? '');
                q('INSERT INTO wx_leads (created_at,source,name,phone,company,designation,location,line,lead_type,quote_status,stage,assigned_to,last_contact,next_at,next_type,followup,message,is_read) VALUES (?,\'import\',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
                    [$ca, $name, clip($r['phone'] ?? '', 40), $co === $name ? '' : $co, clip($r['designation'] ?? '', 80), clip($r['location'] ?? '', 160), $line, $lt, $qs, $stage, $as,
                     $last ? (strlen($last) === 10 ? $last . ' 10:00:00' : $last) : null, $meet ? (strlen($meet) === 10 ? $meet . ' 11:00:00' : $meet) : null, $meet ? 'meeting' : null, $meet ? substr($meet, 0, 10) : null, clip($r['note'] ?? '', 2000)]);
                $n++;
                if ($mkc && function_exists('p19c_key') && ($pk = p19c_key($r['phone'] ?? '')) !== '') {
                    $lid = (int)db()->lastInsertId(); $cid = p19c_match($cix, $r['phone'] ?? '', '');
                    if (!$cid) { q('INSERT INTO wx_clients (name,phone,email,company,city,address,notes,created_at) VALUES (?,?,?,?,?,?,?,?)', [$name, clip($r['phone'] ?? '', 40), '', $co === $name ? '' : $co, clip($r['location'] ?? '', 80), '', '', $ca]); $cid = (int)db()->lastInsertId(); $cix[0][$pk] = $cid; $cn++;
                        try { s17_client_extra($cid, ['type' => $co !== '' && $co !== $name ? 'company' : 'individual', 'source' => 'import', 'line' => $line, 'designation' => clip($r['designation'] ?? '', 80)]); } catch (Throwable $e) {} }
                    else $cl++;
                    q('UPDATE wx_leads SET client_id=? WHERE id=?', [$cid, $lid]);
                }
            }
            log_act($u, 'lead.import', $n . ' rows (sheet), ' . $cn . ' new clients'); out(['ok' => true, 'imported' => $n, 'skipped' => $skip, 'clientsNew' => $cn, 'clientsLinked' => $cl]);

        case 'clients_master': // client list with live totals from leads, quotes, invoices and projects
            need($SALES); sales_migrate(); if (function_exists('p19c_link')) p19c_link(true);
            $leads = []; foreach (q('SELECT id,client_id,stage,value,created_at,last_contact FROM wx_leads WHERE client_id IS NOT NULL')->fetchAll() as $l) $leads[(int)$l['client_id']][] = $l;
            $Q = doc_all('wx_quotes'); $I = array_map('inv_pub', doc_all('wx_invoices')); $P = doc_all('wx_projects');
            $by = function (array $docs) { $o = []; foreach ($docs as $x) if ($c = (int)($x['client_id'] ?? 0)) $o[$c][] = $x; return $o; };
            $q = $by($Q); $i = $by($I); $pj = $by($P);
            $rows = array_map(function ($c) use ($leads, $q, $i, $pj) {
                $id = (int)$c['id']; $ls = $leads[$id] ?? []; $iv = $i[$id] ?? []; $pp = $pj[$id] ?? []; $qq = $q[$id] ?? [];
                $last = max(array_merge([(string)$c['created_at']], array_map(fn($l) => (string)($l['last_contact'] ?: $l['created_at']), $ls), array_map(fn($x) => (string)($x['issue_date'] ?? ''), $iv), array_map(fn($x) => (string)($x['updated_at'] ?? $x['date'] ?? ''), $qq)));
                return ['id' => $id, 'name' => $c['name'], 'company' => (string)$c['company'], 'phone' => (string)$c['phone'], 'email' => (string)$c['email'], 'city' => (string)$c['city'],
                    'type' => (string)($c['type'] ?? ''), 'line' => (string)($c['line'] ?? ''), 'tags' => $c['tags'] ? explode(',', $c['tags']) : [], 'created_at' => $c['created_at'],
                    'leads' => count($ls), 'quotes' => count($qq), 'openQuotes' => count(array_filter($qq, fn($x) => in_array($x['status'] ?? '', ['draft', 'sent'], true))),
                    'invoices' => count($iv), 'lifetime' => (int)array_sum(array_column($iv, 'total')), 'paid' => (int)array_sum(array_column($iv, 'paid')), 'balance' => (int)array_sum(array_column($iv, 'balance')),
                    'projects' => count($pp), 'last' => $last, 'status' => s17_client_status($iv, $pp, $ls)];
            }, q('SELECT * FROM wx_clients ORDER BY id DESC')->fetchAll());
            out(['ok' => true, 'clients' => $rows, 'types' => S17_CTYPES, 'lines' => S17_LINES]);

        case 'client_360':
            need($SALES); $c = q('SELECT * FROM wx_clients WHERE id=?', [(int)($in['id'] ?? 0)])->fetch(); if (!$c) fail('Client not found', 404);
            $c['id'] = (int)$c['id']; foreach (['phone', 'email', 'company', 'city', 'address', 'notes', 'type', 'source', 'line', 'designation'] as $k) $c[$k] = (string)($c[$k] ?? ''); $c['tags'] = $c['tags'] ? explode(',', (string)$c['tags']) : [];
            $leads = array_map(fn($r) => lead_get((int)$r['id']), q('SELECT id FROM wx_leads WHERE client_id=? ORDER BY id DESC', [$c['id']])->fetchAll());
            [$quotes, $invs, $projs] = s17_docs_for($c);
            $tl = [];
            foreach ($leads as $l) { $tl[] = ['t' => $l['created_at'], 'k' => 'lead', 'title' => 'Enquiry #' . $l['id'] . ($l['service'] ? ' — ' . $l['service'] : ''), 'sub' => 'Stage: ' . $l['stage'], 'id' => $l['id']];
                foreach ($l['notes'] as $n) if (empty($n['sys'])) $tl[] = ['t' => $n['t'], 'k' => 'note', 'title' => $n['text'], 'sub' => (string)$n['user'], 'id' => $l['id']]; }
            foreach ($quotes as $x) $tl[] = ['t' => ($x['created_at'] ?? $x['date'] ?? ''), 'k' => 'quote', 'title' => 'Quotation ' . q_label($x) . ' — ' . ($x['status'] ?? ''), 'sub' => 'Rs ' . number_format((float)($x['total'] ?? 0)), 'id' => $x['id']];
            foreach ($invs as $x) { $tl[] = ['t' => ($x['issue_date'] ?? '') . ' 09:00:00', 'k' => 'invoice', 'title' => 'Invoice ' . ($x['no'] ?? '') . ' — Rs ' . number_format((float)$x['total']), 'sub' => ucfirst($x['payStatus']) . ($x['balance'] ? ' · balance Rs ' . number_format($x['balance']) : ''), 'id' => $x['id']];
                foreach ($x['payments'] as $py) $tl[] = ['t' => ($py['date'] ?? '') . ' 12:00:00', 'k' => 'payment', 'title' => 'Payment Rs ' . number_format((float)$py['amount']) . ' (' . ($py['method'] ?? '') . ')', 'sub' => 'Invoice ' . ($x['no'] ?? ''), 'id' => $x['id']]; }
            foreach ($projs as $p) $tl[] = ['t' => (string)($p['created_at'] ?? $p['start'] ?? ''), 'k' => 'project', 'title' => 'Project ' . ($p['name'] ?? ''), 'sub' => 'Stage: ' . ($p['stage'] ?? ''), 'id' => $p['id']];
            usort($tl, fn($a, $b) => strcmp((string)$b['t'], (string)$a['t']));
            $next = null; foreach ($leads as $l) if (!empty($l['next_at']) && !in_array($l['stage'], ['won', 'lost'], true) && (!$next || $l['next_at'] < $next['at'])) $next = ['at' => $l['next_at'], 'type' => $l['next_type'], 'lead' => $l['id']];
            $k = ['lifetime' => (int)array_sum(array_column($invs, 'total')), 'paid' => (int)array_sum(array_column($invs, 'paid')), 'balance' => (int)array_sum(array_column($invs, 'balance')),
                  'quoted' => (int)array_sum(array_map(fn($x) => (float)($x['total'] ?? 0), $quotes)), 'projects' => count($projs), 'last' => $tl[0]['t'] ?? $c['created_at']];
            out(['ok' => true, 'client' => $c, 'status' => s17_client_status($invs, $projs, $leads), 'kpis' => $k, 'next' => $next,
                 'leads' => $leads, 'quotes' => array_map('q_pub', $quotes), 'invoices' => $invs, 'projects' => $projs, 'timeline' => array_slice($tl, 0, 300)]);


        case 'inv_new': // standalone invoice (no quotation needed): items optional, or one total line
            $u = need($SALES); sales_migrate(); [$cid, $cl] = s17_inv_client($in);
            $line = isset(S17_LINES[$in['line'] ?? '']) ? $in['line'] : 'interior';
            $secs = clean_sections($in['sections'] ?? []);
            if (!$secs || !array_sum(array_map(fn($x) => count($x['items']), $secs))) { $amt = numv($in['total'] ?? 0); if ($amt <= 0) fail('Enter the invoice amount or add items');
                $secs = [['name' => 'Supply & services', 'note' => '', 'items' => [['desc' => clip($in['desc'] ?? '', 600) ?: (clip($in['project'] ?? '', 160) ?: 'As per work order'), 'qty' => 1, 'unit' => 'job', 'rate' => $amt, 'amount' => $amt]]]]; }
            $no = trim((string)($in['no'] ?? '')) !== '' ? clip($in['no'], 30) : s17_inv_no($line);
            if (q('SELECT 1 FROM wx_invoices WHERE no=?', [$no])->fetchColumn()) fail('Invoice ' . $no . ' already exists');
            $i = doc_totals(['sections' => $secs, 'discount' => $in['discount'] ?? 0, 'rent' => $in['rent'] ?? 0, 'taxPct' => $in['taxPct'] ?? 0]);
            $i += ['no' => $no, 'quote_id' => null, 'quote_label' => '', 'client' => $cl, 'client_id' => $cid, 'project' => clip($in['project'] ?? '', 160), 'site' => clip($in['site'] ?? '', 200),
                'issue_date' => ymd($in['issue_date'] ?? '') ?: date('Y-m-d'), 'due_date' => ymd($in['due_date'] ?? ''), 'terms' => clip($in['terms'] ?? '', 3000), 'notes' => '', 'schedule' => clip($in['schedule'] ?? '', 600),
                'payments' => [], 'seqPay' => 0, 'created_by' => $u['name'], 'created_at' => now(), 'po' => clip($in['po'] ?? '', 60), 'delivery_date' => ymd($in['delivery_date'] ?? ''), 'delivered' => '',
                'line' => $line, 'mode' => ($in['mode'] ?? '') === 'after_delivery' ? 'after_delivery' : '', 'track_note' => clip($in['track_note'] ?? '', 500)];
            $i = doc_put('wx_invoices', $i, ['no' => $no, 'quote_id' => null]);
            log_act($u, 'invoice.create', $no . ' ' . $cl['name'] . ' (standalone)'); out(['ok' => true, 'invoice' => s17_inv_row($i)]);

        case 'inv_track': // tracker fields on any invoice
            $u = need($SALES); sales_migrate(); $i = doc_get('wx_invoices', $in['id'] ?? 0, 'Invoice');
            foreach (['po' => 60, 'track_note' => 500] as $k => $n) if (array_key_exists($k, $in)) $i[$k] = clip($in[$k], $n);
            if (array_key_exists('delivery_date', $in)) $i['delivery_date'] = ymd($in['delivery_date']);
            if (array_key_exists('line', $in)) $i['line'] = isset(S17_LINES[$in['line']]) ? $in['line'] : '';
            if (array_key_exists('mode', $in)) $i['mode'] = $in['mode'] === 'after_delivery' ? 'after_delivery' : '';
            if (array_key_exists('delivered', $in)) $i['delivered'] = $in['delivered'] ? (ymd($in['delivered']) ?: date('Y-m-d')) : '';
            $i = doc_put('wx_invoices', $i); log_act($u, 'invoice.track', $i['no']); out(['ok' => true, 'invoice' => s17_inv_row($i)]);

        case 'invs_tracker': // rows for a year + monthly totals bar
            need($SALES); sales_migrate(); $y = preg_match('~^\d{4}$~', (string)($in['year'] ?? '')) ? (string)$in['year'] : date('Y');
            $all = array_map('s17_inv_row', doc_all('wx_invoices', 'id DESC'));
            $years = array_values(array_unique(array_merge([date('Y')], array_map(fn($i) => substr((string)$i['issue_date'], 0, 4), $all)))); rsort($years);
            $rows = array_values(array_filter($all, fn($i) => substr((string)$i['issue_date'], 0, 4) === $y));
            $months = []; for ($m = 1; $m <= 12; $m++) $months[sprintf('%s-%02d', $y, $m)] = ['count' => 0, 'total' => 0, 'received' => 0, 'balance' => 0];
            foreach ($rows as $i) { $k = substr($i['issue_date'], 0, 7); if (!isset($months[$k])) continue; $months[$k]['count']++; $months[$k]['total'] += $i['total']; $months[$k]['received'] += $i['paid']; $months[$k]['balance'] += $i['balance']; }
            $late = array_values(array_filter($all, fn($i) => $i['late']));
            out(['ok' => true, 'year' => $y, 'years' => $years, 'rows' => $rows, 'months' => $months, 'lateAll' => count($late), 'outstandingAll' => (int)array_sum(array_column($all, 'balance'))]);

        case 'invs_import': // your invoice-tracking sheet → invoices (+ one payment for "Received")
            $u = need(['owner', 'admin']); sales_migrate(); $n = 0; $skip = 0;
            $have = array_flip(array_column(q('SELECT no FROM wx_invoices')->fetchAll(), 'no'));
            $dt = function ($v) { $v = trim((string)$v); if (preg_match('~^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})~', $v, $m)) return sprintf('%04d-%02d-%02d', strlen($m[3]) === 2 ? 2000 + (int)$m[3] : $m[3], $m[2], $m[1]); $t = $v !== '' ? strtotime($v) : 0; return $t ? date('Y-m-d', $t) : ''; };
            $num = fn($v) => (int)round((float)preg_replace('~[^\d.]~', '', (string)$v));
            foreach (array_slice((array)($in['rows'] ?? []), 0, 3000) as $r) {
                if (!is_array($r)) continue; $no = clip($r['no'] ?? '', 30); $co = clip($r['company'] ?? '', 120); $tot = $num($r['total'] ?? 0);
                if ($no === '' || $co === '' || $tot <= 0 || preg_match('~^(invoice|inv)~i', $no) && !preg_match('~\d~', $no)) { $skip++; continue; }
                if (isset($have[$no])) { $skip++; continue; } $have[$no] = 1;
                [$cid, $cl] = s17_inv_client(['client' => ['company' => $co, 'name' => $co]]);
                $date = $dt($r['date'] ?? '') ?: date('Y-m-d'); $rec = min($tot, $num($r['received'] ?? 0)); $stt = mb_strtolower((string)($r['status'] ?? ''));
                $i = doc_totals(['sections' => [['name' => 'Supply & services', 'note' => '', 'items' => [['desc' => clip($r['note'] ?? '', 600) ?: 'As per PO ' . clip($r['po'] ?? '', 60), 'qty' => 1, 'unit' => 'job', 'rate' => $tot, 'amount' => $tot]]]], 'discount' => 0, 'taxPct' => 0]);
                $i += ['no' => $no, 'quote_id' => null, 'quote_label' => '', 'client' => $cl, 'client_id' => $cid, 'project' => '', 'site' => '', 'issue_date' => $date, 'due_date' => '', 'terms' => '', 'notes' => '', 'schedule' => '',
                    'payments' => [], 'seqPay' => 0, 'created_by' => $u['name'], 'created_at' => now(), 'po' => clip($r['po'] ?? '', 60), 'delivery_date' => $dt($r['delivery'] ?? ''), 'delivered' => str_contains($stt, 'paid') && !str_contains($stt, 'part') ? $date : '',
                    'line' => stripos($no, 'WF') === 0 ? 'furniture' : 'interior', 'mode' => str_contains($stt, 'after') ? 'after_delivery' : '', 'track_note' => clip($r['note'] ?? '', 500)];
                if ($rec > 0) { $i['seqPay'] = 1; $i['payments'][] = ['id' => 1, 'rcpt' => $no . '-R1', 'date' => $date, 'amount' => $rec, 'method' => 'bank', 'ref' => '', 'note' => 'Imported from sheet', 'by' => $u['name'], 't' => now()]; }
                doc_put('wx_invoices', $i, ['no' => $no, 'quote_id' => null]); $n++;
            }
            log_act($u, 'invoice.import', $n . ' rows'); out(['ok' => true, 'imported' => $n, 'skipped' => $skip]);

        // ---------- S5 projects table + milestone billing
        case 'projs_table':
            need(['owner', 'admin', 'sales', 'editor']); sales_migrate(); $today = date('Y-m-d');
            $inv = array_map('inv_pub', doc_all('wx_invoices')); $names = []; foreach (q('SELECT id,name FROM wx_users')->fetchAll() as $r) $names[(int)$r['id']] = $r['name'];
            $rows = []; $k = ['active' => 0, 'value' => 0, 'invoiced' => 0, 'received' => 0, 'balance' => 0, 'late' => 0];
            foreach (doc_all('wx_projects') as $p) $rows[] = s17_proj_row($p, $inv, $names, $today);
            foreach ($rows as $r) { if ($r['stage'] !== 'completed') { $k['active']++; $k['value'] += $r['value']; $k['late'] += $r['late'] ? 1 : 0; } $k['invoiced'] += $r['invoiced']; $k['received'] += $r['received']; $k['balance'] += $r['balance']; }
            usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
            $team = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], q('SELECT id,name FROM wx_users WHERE active=1 ORDER BY name')->fetchAll());
            out(['ok' => true, 'projects' => $rows, 'kpi' => $k, 'stages' => SALES_PSTAGES, 'team' => $team, 'lines' => S17_LINES, 'types' => S17_PTYPES]);
        case 'proj_meta':
            $u = need($SALES); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project');
            if (array_key_exists('line', $in)) $p['line'] = isset(S17_LINES[$in['line']]) ? $in['line'] : '';
            if (array_key_exists('ptype', $in)) $p['ptype'] = clip($in['ptype'], 60);
            if (array_key_exists('area', $in)) $p['area'] = max(0, (int)round(numv($in['area'])));
            if (array_key_exists('team', $in)) $p['team'] = array_values(array_unique(array_filter(array_map('intval', is_array($in['team']) ? $in['team'] : []))));
            if (array_key_exists('client_id', $in)) { $cid = (int)$in['client_id']; if ($cid) { $c = q('SELECT id,name,company FROM wx_clients WHERE id=?', [$cid])->fetch(); if (!$c) fail('Client not found', 404); $p['client_id'] = $cid; $p['client_name'] = $c['company'] ?: $c['name']; } }
            $p = doc_put('wx_projects', $p); log_act($u, 'project.update', $p['name']); out(['ok' => true, 'project' => $p]);
        case 'proj_milestones':
            $u = need($SALES); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project'); $old = $p['milestones'] ?? []; $new = []; $sum = 0;
            foreach (array_slice(is_array($in['plan'] ?? null) ? $in['plan'] : [], 0, 12) as $j => $m) { $pct = round(numv($m['pct'] ?? 0), 2); if ($pct <= 0) continue; $sum += $pct;
                $new[] = ['label' => clip($m['label'] ?? '', 80) ?: 'Milestone ' . ($j + 1), 'pct' => $pct, 'inv_id' => $old[$j]['inv_id'] ?? null]; }
            foreach ($old as $j => $m) if (!empty($m['inv_id']) && (($new[$j]['inv_id'] ?? null) !== $m['inv_id'] || (float)$new[$j]['pct'] !== (float)$m['pct'])) fail('Milestone ' . ($j + 1) . ' is already billed; it cannot be changed');
            if ($new && abs($sum - 100) > 0.01) fail('Milestones must add up to 100% (now ' . $sum . '%)');
            $p['milestones'] = $new; $p = doc_put('wx_projects', $p); log_act($u, 'project.milestones', $p['name']); out(['ok' => true, 'project' => $p]);
        case 'proj_bill':
            $u = need($SALES); sales_migrate(); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project'); $j = (int)($in['k'] ?? -1); $m = $p['milestones'][$j] ?? null;
            if (!$m) fail('Milestone not found', 404); if (!empty($m['inv_id'])) fail('This milestone is already billed');
            if ((int)($p['value'] ?? 0) <= 0) fail('Set the contract value first');
            $base = $p['no'] ?? ''; $full = !empty($p['invoice_id']) ? q('SELECT id,data FROM wx_invoices WHERE id=?', [$p['invoice_id']])->fetch() : null;
            if ($full) { $fd = json_decode($full['data'], true) ?: []; if (!empty($fd['payments'])) fail('The full contract invoice already has payments, so milestone billing cannot replace it');
                if (empty($in['replace'])) fail('REPLACE'); q('DELETE FROM wx_invoices WHERE id=?', [$full['id']]); $p['updates'][] = hist($u, 'Full invoice ' . ($fd['no'] ?? '') . ' replaced by milestone invoices') + ['sys' => true]; $p['invoice_id'] = null; }
            $line = $p['line'] ?? '' ?: 'project'; if ($base === '') { $base = s17_inv_no($line); $p['no'] = $base; }
            $no = $base . '-' . ($j + 1); if (q('SELECT 1 FROM wx_invoices WHERE no=?', [$no])->fetchColumn()) fail('Invoice ' . $no . ' already exists');
            $amt = (int)round($p['value'] * $m['pct'] / 100); $cid = (int)($p['client_id'] ?? 0);
            [$cid, $cl] = s17_inv_client($cid ? ['client_id' => $cid] : ['client' => ['company' => $p['client_name'] ?: $p['name']]]);
            $secs = [['name' => 'Milestone billing', 'note' => '', 'items' => [['desc' => 'Milestone ' . ($j + 1) . ': ' . $m['label'] . ' — ' . $m['pct'] . '% of contract value Rs ' . number_format($p['value']) . ($base ? ' (' . $base . ')' : ''), 'qty' => 1, 'unit' => 'job', 'rate' => $amt, 'amount' => $amt]]]];
            $i = doc_totals(['sections' => $secs, 'discount' => 0, 'taxPct' => 0]);
            $i += ['no' => $no, 'quote_id' => null, 'quote_label' => $base, 'client' => $cl, 'client_id' => $cid, 'project' => $p['name'], 'project_id' => (int)$p['id'], 'site' => $p['site'] ?? '', 'issue_date' => date('Y-m-d'), 'due_date' => date('Y-m-d', strtotime('+7 days')),
                'terms' => '', 'notes' => '', 'schedule' => '', 'payments' => [], 'seqPay' => 0, 'created_by' => $u['name'], 'created_at' => now(), 'po' => '', 'delivery_date' => '', 'delivered' => '', 'line' => $line, 'mode' => '', 'track_note' => 'Milestone ' . ($j + 1) . ' · ' . $m['label']];
            $i = doc_put('wx_invoices', $i, ['no' => $no, 'quote_id' => null]);
            $p['milestones'][$j]['inv_id'] = (int)$i['id']; $p['client_id'] = $cid; $p['updates'][] = hist($u, 'Invoice ' . $no . ' raised: ' . $m['label'] . ' (' . $m['pct'] . '%) Rs ' . number_format($amt)) + ['sys' => true];
            $p = doc_put('wx_projects', $p); log_act($u, 'invoice.create', $no . ' milestone'); out(['ok' => true, 'invoice' => s17_inv_row($i), 'project' => $p]);

        case 'clients_merge': // keep one record, move everything from the duplicate onto it
            $u = need(['owner', 'admin']); $keep = (int)($in['keep'] ?? 0); $drop = (int)($in['merge'] ?? 0);
            if (!$keep || !$drop || $keep === $drop) fail('Pick two different clients');
            $a = q('SELECT * FROM wx_clients WHERE id=?', [$keep])->fetch(); $b = q('SELECT * FROM wx_clients WHERE id=?', [$drop])->fetch(); if (!$a || !$b) fail('Client not found', 404);
            sales_migrate(); $pdo = db(); $pdo->beginTransaction();
            q('UPDATE wx_leads SET client_id=? WHERE client_id=?', [$keep, $drop]);
            foreach (['wx_quotes', 'wx_invoices', 'wx_projects'] as $t) foreach (q("SELECT id,data FROM $t")->fetchAll() as $r) { $d = json_decode($r['data'], true) ?: []; if ((int)($d['client_id'] ?? 0) === $drop) { $d['client_id'] = $keep; q("UPDATE $t SET data=? WHERE id=?", [json_encode($d, JSON_UNESCAPED_UNICODE), $r['id']]); } }
            $fill = []; $p = []; foreach (['phone', 'email', 'company', 'city', 'address'] as $k) if (trim((string)$a[$k]) === '' && trim((string)$b[$k]) !== '') { $fill[] = "$k=?"; $p[] = $b[$k]; }
            $notes = trim((string)$a['notes'] . "\n" . (string)$b['notes']); $fill[] = 'notes=?'; $p[] = $notes; $p[] = $keep; q('UPDATE wx_clients SET ' . implode(',', $fill) . ' WHERE id=?', $p);
            q('DELETE FROM wx_clients WHERE id=?', [$drop]); $pdo->commit();
            log_act($u, 'client.merge', $b['name'] . ' → ' . $a['name']); out(['ok' => true, 'id' => $keep]);
    }
    return false;
}
