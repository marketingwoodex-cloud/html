<?php
/**
 * Woodex Admin v2 — Phase A5: templates, quotations, invoices, payments, projects.
 * Included by api/admin.php. Mirrors tools/frontend-v1-admin.mjs a5() one-to-one.
 * Documents are stored as JSON (column `data`) with indexed key columns for listing.
 * Needs from the includer: q(), db(), now(), need(), fail(), out(), log_act(), clip(), lead_note_add(), jread(), jwrite(), PRIVATE_DIR, ROOT_DIR.
 */
declare(strict_types=1);
if (!defined('PRIVATE_DIR')) { http_response_code(404); exit; }

const SALES_UNITS   = ['sft', 'rft', 'sqmt', 'nos', 'each', 'set', 'point', 'job', 'lumpsum'];
const SALES_PSTAGES = ['planning', 'design', 'procurement', 'execution', 'finishing', 'handover', 'completed'];
const SALES_KINDS   = ['design', 'fitout', 'renovation', 'other'];
const COMPANY_FILE  = PRIVATE_DIR . '/company.json';

function sales_migrate(): void {
    static $done = false; if ($done) return; $done = true;
    $e = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    q('CREATE TABLE IF NOT EXISTS wx_templates (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, data LONGTEXT NOT NULL, UNIQUE(name))' . $e);
    q('CREATE TABLE IF NOT EXISTS wx_quotes (id INT AUTO_INCREMENT PRIMARY KEY, no VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL, data LONGTEXT NOT NULL, INDEX(no))' . $e);
    q('CREATE TABLE IF NOT EXISTS wx_invoices (id INT AUTO_INCREMENT PRIMARY KEY, no VARCHAR(30) NOT NULL, quote_id INT NULL, data LONGTEXT NOT NULL, UNIQUE(quote_id))' . $e);
    q('CREATE TABLE IF NOT EXISTS wx_projects (id INT AUTO_INCREMENT PRIMARY KEY, data LONGTEXT NOT NULL)' . $e);
}

// ---------------------------------------------------------------- JSON document helpers
function doc_all(string $t, string $order = 'id DESC'): array {
    return array_map(fn($r) => ['id' => (int)$r['id']] + (json_decode($r['data'], true) ?: []), q("SELECT id,data FROM $t ORDER BY $order")->fetchAll());
}
function doc_get(string $t, $id, string $what, bool $lock = false): array {
    $r = q("SELECT id,data FROM $t WHERE id=?" . ($lock ? ' FOR UPDATE' : ''), [(int)$id])->fetch();
    if (!$r) fail($what . ' not found', 404);
    return ['id' => (int)$r['id']] + (json_decode($r['data'], true) ?: []);
}
function doc_put(string $t, array $d, array $cols = []): array {
    $data = $d; unset($data['id']); $j = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $names = array_keys($cols);
    if (!empty($d['id'])) {
        $set = implode('', array_map(fn($c) => ",$c=?", $names));
        q("UPDATE $t SET data=?$set WHERE id=?", array_merge([$j], array_values($cols), [(int)$d['id']]));
    } else {
        q("INSERT INTO $t (data" . implode('', array_map(fn($c) => ",$c", $names)) . ') VALUES (?' . str_repeat(',?', count($names)) . ')', array_merge([$j], array_values($cols)));
        $d['id'] = (int)db()->lastInsertId();
    }
    return $d;
}
function quote_put(array $x): array { return doc_put('wx_quotes', $x, ['no' => $x['no'], 'status' => $x['status']]); }

// ---------------------------------------------------------------- business helpers
function company_cfg(): array {
    return array_merge(['name' => 'Woodex Interior', 'tagline' => 'Design · Build · Furniture', 'address' => 'M-71, Zainab Tower, Model Town Link Road, Lahore', 'phones' => '+92 322 4000768',
        'email' => 'info@woodex.com.pk', 'web' => 'woodex.com.pk', 'ntn' => '', 'bankName' => '', 'bankTitle' => '', 'bankAccount' => '', 'bankIban' => '', 'signName' => 'Imtiaz Ahmad', 'signTitle' => 'Director',
        'signers' => [['name' => 'Imtiaz Ahmad', 'title' => 'Director'], ['name' => 'Nabeel Afzal', 'title' => 'Marketing Manager']],
        'banks' => [['bank' => 'Bank Alfalah', 'title' => 'WOODEX INTERIOR', 'account' => '02931007869105', 'iban' => 'PK06ALFH0293001007869105', 'branch' => 'Link Rd Model Town Br: Lahore', 'code' => '0293', 'use' => 'interior'],
                    ['bank' => 'Meezan Bank', 'title' => 'WOODEX FURNITURE', 'account' => '02810111519091', 'iban' => 'PK43MEZN0002810111519091', 'branch' => 'Model Town Link Road, Lahore', 'code' => '', 'use' => 'furniture']],
        'wallets' => [['name' => 'JazzCash', 'number' => '+92 321 3656096'], ['name' => 'Easypaisa', 'number' => '+92 321 3656096']], 'payTerms' => '', 'prefix' => 'WI-', 'nextNo' => 10100,
        'validDays' => 15, 'consultant' => 'Woodex Interior'], jread(COMPANY_FILE));
}
/** Reserve the next document number atomically (file lock). */
function next_no(): string {
    $fh = fopen(COMPANY_FILE . '.lock', 'c'); flock($fh, LOCK_EX);
    $c = company_cfg(); $no = $c['prefix'] . $c['nextNo']; $c['nextNo'] = (int)$c['nextNo'] + 1; jwrite(COMPANY_FILE, $c);
    flock($fh, LOCK_UN); fclose($fh); return $no;
}
function numv($v): float { $n = is_numeric($v) ? (float)$v : 0.0; return is_finite($n) && $n >= 0 ? $n : 0.0; }
function r2(float $n): float { return round($n * 100) / 100; }
function ymd($v): string { return preg_match('~^\d{4}-\d{2}-\d{2}$~', (string)$v) ? (string)$v : ''; }
function clean_sections($sections): array {
    if (!is_array($sections)) return [];
    $out = [];
    foreach (array_slice($sections, 0, 40) as $s) {
        $items = [];
        foreach (array_slice(is_array($s['items'] ?? null) ? $s['items'] : [], 0, 300) as $it) {
            $desc = clip($it['desc'] ?? '', 600); if ($desc === '') continue;
            $qty = numv($it['qty'] ?? 0); $rate = numv($it['rate'] ?? 0); $unit = strtolower((string)($it['unit'] ?? ''));
            $kind = in_array($it['kind'] ?? '', ['head', 'spec'], true) ? $it['kind'] : '';
            $items[] = ['desc' => $kind === 'spec' ? clip($it['desc'] ?? '', 2000) : $desc, 'qty' => $kind ? 0 : $qty, 'unit' => in_array($unit, SALES_UNITS, true) ? $unit : 'job', 'rate' => $kind ? 0 : $rate, 'amount' => $kind ? 0 : r2($qty * $rate), 'kind' => $kind, 'code' => clip($it['code'] ?? '', 12)];
        }
        $out[] = ['name' => clip($s['name'] ?? '', 80) ?: 'Section', 'note' => clip($s['note'] ?? '', 600), 'area' => numv($s['area'] ?? 0), 'items' => $items];
    }
    return $out;
}
function doc_totals(array $d): array {
    $sub = 0.0;
    foreach ($d['sections'] as &$s) { $s['subtotal'] = r2(array_sum(array_column($s['items'], 'amount'))); $sub += $s['subtotal']; } unset($s);
    $d['subtotal'] = (int)round($sub); $d['discount'] = (int)min(round(numv($d['discount'] ?? 0)), $d['subtotal']); $d['taxPct'] = min(numv($d['taxPct'] ?? 0), 50);
    $d['rent'] = max(0, (int)round(numv($d['rent'] ?? 0))); /*P18rent*/
    $d['tax'] = (int)round(($d['subtotal'] - $d['discount'] + $d['rent']) * $d['taxPct'] / 100); $d['total'] = $d['subtotal'] - $d['discount'] + $d['rent'] + $d['tax'];
    $d['advance'] = min(max(0, (int)round(numv($d['advance'] ?? 0))), $d['total']);
    return $d;
}
function p18_blocks($b): array { $ok = ['summary', 'scope', 'items', 'totals', 'terms', 'bank', 'sign']; $o = []; foreach ((is_array($b) ? $b : []) as $k) { $k = (string)$k; $n = ltrim($k, '-'); if (in_array($n, $ok, true) && !in_array($n, array_map(fn($x) => ltrim($x, '-'), $o), true)) $o[] = $k; } return $o; }
function q_label(array $x): string { return $x['no'] . ((int)$x['version'] > 1 ? ' · V' . $x['version'] : '') . ($x['option'] ? ' · ' . $x['option'] : ''); }
function q_pub(array $x): array { $x['label'] = q_label($x); return $x; }
/** Secure client link: /api/quote-view.php?id=..&t=.. (no sign-in; the token is an HMAC of id + number). */
function q_view_token(array $x): string { return substr(hash_hmac('sha256', 'qv|' . $x['id'] . '|' . $x['no'], bsecret()), 0, 32); }
function q_view_url(array $x): string { $h = preg_replace('~[^a-z0-9.\-:]~i', '', (string)($_SERVER['HTTP_HOST'] ?? 'woodex.com.pk')); return 'https://' . $h . '/api/quote-view.php?id=' . $x['id'] . '&t=' . q_view_token($x); }
function inv_pub(array $i): array {
    $paid = (int)array_sum(array_column($i['payments'], 'amount'));
    $i['paid'] = $paid; $i['balance'] = max(0, $i['total'] - $paid); $i['payStatus'] = $paid <= 0 ? 'unpaid' : ($paid >= $i['total'] ? 'paid' : 'partial');
    $i['overdue'] = $paid < $i['total'] && $i['due_date'] && $i['due_date'] < date('Y-m-d'); return $i;
}
function client_of(array $in): array { return ['name' => clip($in['name'] ?? '', 120), 'phone' => clip($in['phone'] ?? '', 40), 'email' => clip($in['email'] ?? '', 190), 'address' => clip($in['address'] ?? '', 300), 'company' => clip($in['company'] ?? '', 120)]; }
function hist(array $u, string $text): array { return ['t' => now(), 'user' => $u['name'], 'text' => $text]; }
function lead_stage(int $leadId, array $from, string $to, array $u, string $why, ?int $value = null): void {
    $l = q('SELECT id,stage FROM wx_leads WHERE id=?', [$leadId])->fetch(); if (!$l || !in_array($l['stage'], $from, true)) return;
    q('UPDATE wx_leads SET stage=?' . ($value !== null ? ',value=' . (int)$value : '') . ' WHERE id=?', [$to, $leadId]);
    lead_note_add($leadId, $u['name'], 'Stage: ' . $l['stage'] . ' → ' . $to . ' (' . $why . ')', true);
}
function tpl_row(array $x): array {
    $kind = in_array($x['kind'] ?? '', SALES_KINDS, true) ? $x['kind'] : 'other';
    return ['name' => clip($x['name'] ?? '', 80), 'kind' => $kind, 'description' => clip($x['description'] ?? '', 400), 'sections' => clean_sections($x['sections'] ?? []), 'terms' => clip($x['terms'] ?? '', 3000)];
}

function sales_stats(): array {
    sales_migrate(); $open = 0; $openV = 0; $rec = 0;
    foreach (doc_all('wx_quotes') as $x) if ($x['status'] === 'sent') { $open++; $openV += $x['total']; }
    foreach (doc_all('wx_invoices') as $i) $rec += inv_pub($i)['balance'];
    return ['quotesOpen' => $open, 'quotesOpenValue' => $openV, 'receivable' => $rec, 'leadsOpen' => (int)q("SELECT COUNT(*) FROM wx_leads WHERE stage NOT IN ('won','lost')")->fetchColumn()];
}

// ---------------------------------------------------------------- actions
function co_list(string $k, $rows): array { // banks / wallets / signers lists from Settings
    $f = ['banks' => ['bank', 'title', 'account', 'iban', 'branch', 'code', 'use'], 'wallets' => ['name', 'number'], 'signers' => ['name', 'title']][$k] ?? null; if (!$f || !is_array($rows)) return [];
    $o = []; foreach (array_slice($rows, 0, 8) as $r) { if (!is_array($r)) continue; $x = []; foreach ($f as $n) $x[$n] = clip($r[$n] ?? '', 120);
        if ($k === 'banks') $x['use'] = in_array($x['use'], ['all', 'interior', 'furniture'], true) ? $x['use'] : 'all'; if (implode('', $x) !== '' && ($x[$f[0]] !== '' || $x[$f[1]] !== '')) $o[] = $x; }
    return $o;
}
function sales_actions(string $action, array $in): bool {
    if (!preg_match('~^(tpl_|quotes?_|invs?_|pay_|projs?_|company_)~', $action)) return false;
    sales_migrate(); crm_migrate();
    $SALES = ['owner', 'admin', 'sales']; $ALL = ['owner', 'admin', 'sales', 'editor']; $OA = ['owner', 'admin'];
    switch ($action) {
        // ---------- company / document settings
        case 'company_get': need($ALL); out(['ok' => true, 'company' => company_cfg(), 'units' => SALES_UNITS]);
        case 'company_save':
            $u = need($OA); $c = company_cfg(); $s = is_array($in['company'] ?? null) ? $in['company'] : [];
            foreach ($c as $k => $v) if (array_key_exists($k, $s)) $c[$k] = is_array($v) ? co_list($k, $s[$k]) : (in_array($k, ['nextNo', 'validDays'], true) ? max(1, (int)round(numv($s[$k]))) : clip($s[$k], $k === 'payTerms' ? 2000 : 300));
            $used = 0; foreach (q('SELECT DISTINCT no FROM wx_quotes')->fetchAll(PDO::FETCH_COLUMN) as $no) $used = max($used, (int)preg_replace('~\D~', '', $no));
            if ($c['nextNo'] <= $used) fail('Next number must be higher than ' . $used . ' (already used)');
            jwrite(COMPANY_FILE, $c); log_act($u, 'settings.company'); out(['ok' => true, 'company' => $c]);

        // ---------- templates
        case 'tpl_list': need($SALES); out(['ok' => true, 'templates' => array_map('doc_totals', doc_all('wx_templates', 'id'))]);
        case 'tpl_save':
            $u = need($OA); $t = tpl_row($in); if ($t['name'] === '') fail('Template name is required');
            $id = (int)($in['id'] ?? 0); $old = $id ? doc_get('wx_templates', $id, 'Template') : ['created_at' => now()];
            if (q('SELECT id FROM wx_templates WHERE name=? AND id<>?', [$t['name'], $id])->fetch()) fail('Another template already has that name');
            $t = doc_put('wx_templates', ['id' => $id ?: null, 'created_at' => $old['created_at'], 'updated_at' => now()] + $t, ['name' => $t['name']]);
            log_act($u, 'template.save', $t['name']); out(['ok' => true, 'template' => $t]);
        case 'tpl_import':
            $u = need($OA); $n = 0;
            foreach (array_slice(is_array($in['templates'] ?? null) ? $in['templates'] : [], 0, 50) as $x) {
                $t = tpl_row(is_array($x) ? $x : []); if ($t['name'] === '' || q('SELECT id FROM wx_templates WHERE name=?', [$t['name']])->fetch()) continue;
                doc_put('wx_templates', $t + ['created_at' => now(), 'updated_at' => now()], ['name' => $t['name']]); $n++;
            }
            log_act($u, 'template.import', $n . ' templates'); out(['ok' => true, 'imported' => $n]);
        case 'tpl_delete':
            $u = need($OA); $t = doc_get('wx_templates', $in['id'] ?? 0, 'Template'); q('DELETE FROM wx_templates WHERE id=?', [$t['id']]);
            log_act($u, 'template.delete', $t['name']); out(['ok' => true]);

        // ---------- quotations
        case 'quotes_list':
            need($SALES);
            out(['ok' => true, 'quotes' => array_map(function ($x) { $x['sectionCount'] = count($x['sections']); unset($x['sections']); return q_pub($x); }, doc_all('wx_quotes'))]);
        case 'quote_get':
            need($SALES); $x = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation');
            $fam = []; foreach (q('SELECT id,data FROM wx_quotes WHERE no=? ORDER BY id', [$x['no']])->fetchAll() as $r) { $f = ['id' => (int)$r['id']] + json_decode($r['data'], true); $fam[] = ['id' => $f['id'], 'label' => q_label($f), 'status' => $f['status'], 'total' => $f['total'], 'version' => $f['version'], 'option' => $f['option']]; }
            $inv = q('SELECT id,data FROM wx_invoices WHERE quote_id=?', [$x['id']])->fetch();
            out(['ok' => true, 'quote' => q_pub($x), 'family' => $fam, 'company' => company_cfg(), 'invoice' => $inv ? inv_pub(['id' => (int)$inv['id']] + json_decode($inv['data'], true)) : null]);
        case 'quote_save':
            $u = need($SALES); $id = (int)($in['id'] ?? 0); $c = company_cfg(); $new = false;
            $client = client_of(is_array($in['client'] ?? null) ? $in['client'] : []); if ($client['name'] === '') fail('Client name is required');
            if ($id) { $x = doc_get('wx_quotes', $id, 'Quotation'); if (in_array($x['status'], ['approved', 'invoiced', 'superseded'], true)) fail('This quotation is ' . $x['status'] . '. Create a new version to change it.'); }
            else { $new = true; $x = ['no' => next_no(), 'version' => 1, 'option' => '', 'status' => 'draft', 'lead_id' => null, 'client_id' => null, 'created_by' => $u['name'], 'created_at' => now(), 'sent_at' => null, 'approved_at' => null, 'history' => [hist($u, 'Created')]]; }
            $x = array_merge($x, ['client' => $client, 'client_id' => (int)($in['client_id'] ?? 0) ?: ($x['client_id'] ?? null), 'project' => clip($in['project'] ?? '', 160), 'site' => clip($in['site'] ?? '', 200),
                'kind' => clip($in['kind'] ?? '', 20) ?: ($x['kind'] ?? 'other'), 'date' => ymd($in['date'] ?? '') ?: ($x['date'] ?? date('Y-m-d')), 'valid_days' => max(1, (int)round(numv($in['valid_days'] ?? 0)) ?: (int)$c['validDays']),
                'sections' => clean_sections($in['sections'] ?? []), 'discount' => numv($in['discount'] ?? 0), 'taxPct' => numv($in['taxPct'] ?? 0), 'terms' => clip($in['terms'] ?? '', 3000),
                'notes' => clip($in['notes'] ?? '', 2000), 'intro' => clip($in['intro'] ?? '', 1500), 'design' => in_array($in['design'] ?? '', ['classic', 'minimal', 'premium'], true) ? $in['design'] : ($x['design'] ?? 'classic'),
                'layout' => in_array($in['layout'] ?? '', ['classic', 'single', 'project'], true) ? $in['layout'] : ($x['layout'] ?? 'classic'), 'qtype' => in_array($in['qtype'] ?? '', ['', 'fitout', 'renovation', 'interior', 'proposal', 'furniture'], true) ? ($in['qtype'] ?? '') : '',
                'scope' => clip($in['scope'] ?? '', 6000), 'sign_name' => clip($in['sign_name'] ?? '', 80), 'sign_title' => clip($in['sign_title'] ?? '', 80), 'rent' => numv($in['rent'] ?? 0), 'advance' => numv($in['advance'] ?? 0), 'blocks' => p18_blocks($in['blocks'] ?? []), 'updated_at' => now()]);
            if ($new && !empty($in['lead_id']) && q('SELECT id FROM wx_leads WHERE id=?', [(int)$in['lead_id']])->fetch()) { $x['lead_id'] = (int)$in['lead_id']; lead_stage($x['lead_id'], ['new', 'contacted', 'visit'], 'quote', $u, $x['no']); }
            $x = quote_put(doc_totals($x)); log_act($u, $new ? 'quote.create' : 'quote.update', q_label($x) . ' ' . $client['name']);
            out(['ok' => true, 'quote' => q_pub($x)]);
        case 'quote_copy':
            $u = need($SALES); $pdo = db(); $pdo->beginTransaction();
            $src = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation', true); $mode = in_array($in['mode'] ?? '', ['version', 'option', 'duplicate'], true) ? $in['mode'] : 'version';
            if ($src['status'] === 'invoiced' && $mode !== 'duplicate') { $pdo->rollBack(); fail('This quotation is already invoiced. Duplicate it to start a new number.'); }
            $fam = array_map(fn($r) => ['id' => (int)$r['id']] + json_decode($r['data'], true), q('SELECT id,data FROM wx_quotes WHERE no=? FOR UPDATE', [$src['no']])->fetchAll());
            $x = $src; unset($x['id']);
            $x = array_merge($x, ['status' => 'draft', 'created_by' => $u['name'], 'created_at' => now(), 'updated_at' => now(), 'sent_at' => null, 'approved_at' => null, 'history' => [hist($u, ($mode === 'duplicate' ? 'Duplicated from ' : 'Created from ') . q_label($src))]]);
            if ($mode === 'duplicate') { $x['no'] = next_no(); $x['version'] = 1; $x['option'] = ''; $x['lead_id'] = null; }
            elseif ($mode === 'version') { $x['version'] = max(array_map(fn($f) => (int)$f['version'], array_filter($fam, fn($f) => $f['option'] === $src['option']))) + 1; }
            else {
                $n = 1; foreach ($fam as $f) if (preg_match('~\d+~', (string)$f['option'], $m)) $n = max($n, (int)$m[0]);
                $x['option'] = 'Option ' . ($n + 1); $x['version'] = 1;
                foreach ($fam as $f) if (!$f['option']) { $f['option'] = 'Option 1'; quote_put($f); }
            }
            $x = quote_put($x); $pdo->commit(); log_act($u, 'quote.' . $mode, q_label($x)); out(['ok' => true, 'quote' => q_pub($x)]);
        case 'quote_status':
            $u = need($SALES); $to = (string)($in['status'] ?? ''); if (!in_array($to, ['draft', 'sent', 'approved', 'rejected'], true)) fail('Unknown status');
            $pdo = db(); $pdo->beginTransaction(); $x = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation', true);
            if ($x['status'] === 'invoiced') { $pdo->rollBack(); fail('This quotation is already invoiced'); }
            $fam = array_map(fn($r) => ['id' => (int)$r['id']] + json_decode($r['data'], true), q('SELECT id,data FROM wx_quotes WHERE no=? AND id<>? FOR UPDATE', [$x['no'], $x['id']])->fetchAll());
            if ($to === 'approved') foreach ($fam as $f) if (in_array($f['status'], ['approved', 'invoiced'], true)) { $pdo->rollBack(); fail('Another version of ' . $x['no'] . ' is already approved'); }
            $from = $x['status']; $x['status'] = $to; $x['updated_at'] = now(); if ($to === 'sent') $x['sent_at'] = now(); if ($to === 'approved') $x['approved_at'] = now();
            $x['history'][] = hist($u, "Status: $from → $to" . (!empty($in['note']) ? ' (' . clip($in['note'], 200) . ')' : ''));
            if ($to === 'approved') foreach ($fam as $f) if (in_array($f['status'], ['draft', 'sent'], true)) { $f['status'] = 'superseded'; $f['history'][] = hist($u, 'Superseded by ' . q_label($x)); quote_put($f); }
            $x = quote_put($x); $pdo->commit();
            if (!empty($x['lead_id'])) {
                if ($to === 'approved') lead_stage((int)$x['lead_id'], ['new', 'contacted', 'visit', 'quote', 'lost'], 'won', $u, q_label($x) . ' approved', (int)$x['total']);
                if ($to === 'sent') lead_stage((int)$x['lead_id'], ['new', 'contacted', 'visit'], 'quote', $u, q_label($x) . ' sent');
            }
            if ($to === 'sent' && $from === 'draft' && empty($in['silent'])) { $nr = notify_client('quote', ['name' => $x['client']['name'] ?? '', 'phone' => $x['client']['phone'] ?? '', 'email' => $x['client']['email'] ?? '', 'ref' => q_label($x), 'project' => $x['project'] ?: '', 'link' => q_view_url($x)]); }
            log_act($u, 'quote.' . $to, q_label($x)); out(['ok' => true, 'quote' => q_pub($x)]);
        case 'quote_link':
            need($SALES); $x = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation'); out(['ok' => true, 'link' => q_view_url($x)]);
        case 'quote_send': // channel: email (PDF attached) | whatsapp (the browser opens wa.me). Marks a draft as sent.
            $u = need($SALES); $x = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation'); $ch = (string)($in['channel'] ?? '');
            if (in_array($x['status'], ['superseded', 'rejected'], true)) fail('This quotation is ' . $x['status']);
            $link = q_view_url($x); $to = trim((string)($in['to'] ?? ''));
            if ($ch === 'email') {
                if (!filter_var($to, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address');
                $c = crm_cfg(); if ($c['smtpHost'] === '') fail('Email is not set up. Add SMTP details in Settings → Integrations.');
                $att = []; $pdf = (string)($in['pdf'] ?? '');
                if ($pdf !== '') { $bin = base64_decode($pdf, true); if ($bin === false || strncmp($bin, '%PDF', 4) !== 0 || strlen($bin) > 12 * 1024 * 1024) fail('The PDF file is not valid'); $att[] = ['name' => clip($in['pdfName'] ?? 'quotation.pdf', 120), 'type' => 'application/pdf', 'data' => $bin]; }
                $msg = clip($in['message'] ?? '', 5000); if (strpos($msg, $link) === false) $msg .= "\n\nView online: " . $link;
                $e = smtp_send($c, [$to], clip($in['subject'] ?? '', 200) ?: 'Quotation ' . q_label($x) . ' from ' . company_cfg()['name'], $msg, $att);
                if ($e !== '') fail('Email was not sent: ' . $e);
                $what = 'Emailed to ' . $to . ($att ? ' (PDF attached)' : '');
            } elseif ($ch === 'whatsapp') { $what = 'Shared on WhatsApp' . ($to !== '' ? ' with ' . clip($to, 40) : ''); }
            else fail('Choose email or WhatsApp');
            $x['history'][] = hist($u, $what); $x['last_sent'] = ['t' => now(), 'channel' => $ch, 'to' => clip($to, 190)];
            $was = $x['status']; if ($was === 'draft') { $x['status'] = 'sent'; $x['sent_at'] = now(); $x['history'][] = hist($u, 'Status: draft → sent'); }
            $x = quote_put($x);
            if ($was === 'draft' && !empty($x['lead_id'])) lead_stage((int)$x['lead_id'], ['new', 'contacted', 'visit'], 'quote', $u, q_label($x) . ' sent');
            log_act($u, 'quote.send', q_label($x) . ' · ' . $ch); out(['ok' => true, 'quote' => q_pub($x), 'link' => $link]);
        case 'quote_delete':
            $u = need($OA); $x = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation');
            if (!in_array($x['status'], ['draft', 'rejected', 'superseded'], true)) fail('Only draft, rejected or superseded quotations can be deleted');
            q('DELETE FROM wx_quotes WHERE id=?', [$x['id']]); log_act($u, 'quote.delete', q_label($x)); out(['ok' => true]);
        case 'quote_invoice':
            $u = need($SALES); $pdo = db(); $pdo->beginTransaction(); $x = doc_get('wx_quotes', $in['id'] ?? 0, 'Quotation', true);
            if ($x['status'] !== 'approved') { $pdo->rollBack(); fail('Approve the quotation before converting it to an invoice'); }
            if (q('SELECT id FROM wx_invoices WHERE quote_id=?', [$x['id']])->fetch()) { $pdo->rollBack(); fail('This quotation already has an invoice'); }
            $cid = (int)($x['client_id'] ?? 0);
            if (!$cid || !q('SELECT id FROM wx_clients WHERE id=?', [$cid])->fetch()) {
                $d = preg_replace('~\D~', '', $x['client']['phone']); $cid = 0;
                foreach (q('SELECT id,phone,email FROM wx_clients')->fetchAll() as $c) if (($d && preg_replace('~\D~', '', (string)$c['phone']) === $d) || ($x['client']['email'] && $c['email'] === $x['client']['email'])) { $cid = (int)$c['id']; break; }
                if (!$cid) { q("INSERT INTO wx_clients (name,phone,email,company,city,address,notes,created_at) VALUES (?,?,?,?,'Lahore',?,'',?)", [$x['client']['name'], $x['client']['phone'], $x['client']['email'], $x['client']['company'] ?? '', $x['client']['address'], now()]); $cid = (int)$pdo->lastInsertId(); }
                $x['client_id'] = $cid;
            }
            $sched = clip($in['schedule'] ?? '', 600) ?: (strpos($x['terms'], '75%') !== false ? '75% advance with work order, 25% on approval' : '50% advance with work order, balance on completion');
            $i = ['no' => $x['no'], 'quote_id' => $x['id'], 'quote_label' => q_label($x), 'client' => $x['client'], 'client_id' => $cid, 'project' => $x['project'], 'site' => $x['site'], 'sections' => $x['sections'],
                'subtotal' => $x['subtotal'], 'discount' => $x['discount'], 'rent' => (int)($x['rent'] ?? 0), 'taxPct' => $x['taxPct'], 'tax' => $x['tax'], 'total' => $x['total'], 'issue_date' => date('Y-m-d'), 'due_date' => date('Y-m-d', time() + 7 * 86400),
                'terms' => $x['terms'], 'notes' => '', 'schedule' => $sched, 'payments' => [], 'seqPay' => 0, 'created_by' => $u['name'], 'created_at' => now()];
            $i = doc_put('wx_invoices', $i, ['no' => $i['no'], 'quote_id' => $x['id']]);
            $x['status'] = 'invoiced'; $x['history'][] = hist($u, 'Converted to invoice ' . $i['no']); quote_put($x);
            if (($in['project'] ?? true) !== false) doc_put('wx_projects', ['name' => $x['project'] ?: $x['client']['name'], 'client_id' => $cid, 'client_name' => $x['client']['name'], 'quote_id' => $x['id'], 'invoice_id' => $i['id'], 'no' => $x['no'],
                'site' => $x['site'], 'stage' => 'planning', 'start' => date('Y-m-d'), 'target' => '', 'value' => $x['total'], 'manager' => null, 'updates' => [hist($u, 'Project opened from ' . q_label($x))], 'photos' => [], 'created_at' => now()]);
            $pdo->commit(); log_act($u, 'invoice.create', $i['no'] . ' ' . $i['client']['name']); out(['ok' => true, 'invoice' => inv_pub($i)]);

        // ---------- invoices & payments
        case 'invs_list': need($SALES); out(['ok' => true, 'invoices' => array_map(function ($i) { $i['sections'] = []; return inv_pub($i); }, doc_all('wx_invoices'))]);
        case 'inv_get': need($SALES); out(['ok' => true, 'invoice' => inv_pub(doc_get('wx_invoices', $in['id'] ?? 0, 'Invoice')), 'company' => company_cfg()]);
        case 'inv_save':
            $u = need($SALES); $i = doc_get('wx_invoices', $in['id'] ?? 0, 'Invoice');
            if (array_key_exists('due_date', $in)) $i['due_date'] = ymd($in['due_date']);
            if (ymd($in['issue_date'] ?? '')) $i['issue_date'] = $in['issue_date'];
            foreach (['notes', 'schedule', 'terms'] as $k) if (array_key_exists($k, $in)) $i[$k] = clip($in[$k], 3000);
            if (array_key_exists('blocks', $in)) $i['blocks'] = p18_blocks($in['blocks']); /*P18inv*/
            $i = doc_put('wx_invoices', $i); log_act($u, 'invoice.update', $i['no']); out(['ok' => true, 'invoice' => inv_pub($i)]);
        case 'pay_add':
            $u = need($SALES); $amount = (int)round(numv($in['amount'] ?? 0)); if (!$amount) fail('Enter the amount received');
            $pdo = db(); $pdo->beginTransaction(); $i = doc_get('wx_invoices', $in['id'] ?? 0, 'Invoice', true); $bal = inv_pub($i)['balance'];
            if ($amount > $bal) { $pdo->rollBack(); fail('Amount is more than the balance (PKR ' . number_format($bal) . ')'); }
            $i['seqPay'] = (int)($i['seqPay'] ?? count($i['payments'])) + 1;
            $p = ['id' => $i['seqPay'], 'rcpt' => $i['no'] . '-R' . (count($i['payments']) + 1), 'date' => ymd($in['date'] ?? '') ?: date('Y-m-d'), 'amount' => $amount,
                'method' => in_array($in['method'] ?? '', ['cash', 'bank', 'cheque', 'online'], true) ? $in['method'] : 'bank', 'ref' => clip($in['ref'] ?? '', 80), 'note' => clip($in['note'] ?? '', 300), 'by' => $u['name'], 't' => now()];
            $i['payments'][] = $p; $i = doc_put('wx_invoices', $i); $pdo->commit();
            log_act($u, 'payment.add', $i['no'] . ' PKR ' . $amount); out(['ok' => true, 'invoice' => inv_pub($i), 'payment' => $p]);
        case 'pay_delete':
            $u = need($OA); $i = doc_get('wx_invoices', $in['id'] ?? 0, 'Invoice'); $pid = (int)($in['pay_id'] ?? 0); $gone = null;
            $i['payments'] = array_values(array_filter($i['payments'], function ($p) use ($pid, &$gone) { if ((int)$p['id'] === $pid) { $gone = $p; return false; } return true; }));
            if (!$gone) fail('Payment not found', 404);
            $i = doc_put('wx_invoices', $i); log_act($u, 'payment.delete', $i['no'] . ' ' . $gone['rcpt']); out(['ok' => true, 'invoice' => inv_pub($i)]);

        // ---------- projects
        case 'projs_list':
            need($ALL); $paid = []; foreach (doc_all('wx_invoices') as $i) $paid[$i['id']] = inv_pub($i)['paid'];
            $names = []; foreach (q('SELECT id,name FROM wx_users')->fetchAll() as $r) $names[(int)$r['id']] = $r['name'];
            $ps = array_map(function ($p) use ($paid, $names) { $p['paid'] = $paid[$p['invoice_id'] ?? 0] ?? 0; $p['manager_name'] = $p['manager'] ? ($names[(int)$p['manager']] ?? '') : ''; return $p; }, doc_all('wx_projects'));
            $team = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], q('SELECT id,name FROM wx_users WHERE active=1 ORDER BY name')->fetchAll());
            out(['ok' => true, 'projects' => $ps, 'stages' => SALES_PSTAGES, 'team' => $team]);
        case 'proj_save':
            $u = need($SALES); $id = (int)($in['id'] ?? 0);
            if ($id) $p = doc_get('wx_projects', $id, 'Project');
            else { $name = clip($in['name'] ?? '', 160); if ($name === '') fail('Project name is required');
                $p = ['name' => $name, 'client_id' => null, 'client_name' => '', 'quote_id' => null, 'invoice_id' => null, 'no' => '', 'site' => '', 'stage' => 'planning', 'start' => date('Y-m-d'), 'target' => '', 'value' => 0, 'manager' => null, 'updates' => [hist($u, 'Project created')], 'photos' => [], 'created_at' => now()]; }
            $before = $p['stage'];
            foreach (['name', 'client_name', 'site'] as $k) if (array_key_exists($k, $in)) $p[$k] = clip($in[$k], 200) ?: $p[$k];
            foreach (['start', 'target'] as $k) if (array_key_exists($k, $in)) $p[$k] = ymd($in[$k]);
            if (array_key_exists('stage', $in)) { if (!in_array($in['stage'], SALES_PSTAGES, true)) fail('Unknown stage'); $p['stage'] = $in['stage']; }
            if (array_key_exists('manager', $in)) $p['manager'] = (int)$in['manager'] ?: null;
            if (array_key_exists('value', $in)) $p['value'] = (int)round(numv($in['value']));
            if ($before !== $p['stage']) $p['updates'][] = hist($u, "Stage: $before → {$p['stage']}") + ['sys' => true];
            $p = doc_put('wx_projects', $p); if ($id && $before !== $p['stage']) $p = notify_project_stage($p, $before);
            log_act($u, $id ? 'project.update' : 'project.create', $p['name']); out(['ok' => true, 'project' => $p]);
        case 'proj_update':
            $u = need($ALL); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project'); $t = clip($in['text'] ?? '', 2000); if ($t === '') fail('Write an update first');
            $p['updates'][] = hist($u, $t); $p = doc_put('wx_projects', $p); log_act($u, 'project.note', $p['name']); out(['ok' => true, 'project' => $p]);
        case 'proj_photo':
            $u = need($ALL); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project');
            if (!preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~', (string)($in['data'] ?? ''), $m)) fail('Only JPG, PNG or WebP photos');
            $bin = base64_decode($m[2], true); if ($bin === false) fail('That file is not an image'); if (strlen($bin) > 6 * 1024 * 1024) fail('Photo is larger than 6 MB');
            if (!preg_match('~^(\xFF\xD8\xFF|\x89PNG|RIFF)~', $bin) || !@getimagesizefromstring($bin)) fail('That file is not an image');
            $dir = ROOT_DIR . '/assets/uploads/projects'; if (!is_dir($dir)) mkdir($dir, 0755, true);
            $name = 'p' . $p['id'] . '-' . base_convert((string)time(), 10, 36) . '-' . bin2hex(random_bytes(2)) . '.' . ($m[1] === 'jpeg' ? 'jpg' : $m[1]);
            file_put_contents($dir . '/' . $name, $bin);
            $p['photos'][] = ['url' => '/assets/uploads/projects/' . $name, 'caption' => clip($in['caption'] ?? '', 200), 'stage' => $p['stage'], 't' => now(), 'by' => $u['name']];
            $p = doc_put('wx_projects', $p); log_act($u, 'project.photo', $p['name']); out(['ok' => true, 'project' => $p]);
        case 'proj_photo_delete':
            $u = need($SALES); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project'); $url = (string)($in['url'] ?? ''); $n = count($p['photos']);
            $p['photos'] = array_values(array_filter($p['photos'], fn($ph) => $ph['url'] !== $url)); if (count($p['photos']) === $n) fail('Photo not found', 404);
            if (preg_match('~^/assets/uploads/projects/[\w.-]+$~', $url)) @unlink(ROOT_DIR . $url);
            $p = doc_put('wx_projects', $p); out(['ok' => true, 'project' => $p]);
        case 'proj_delete':
            $u = need($OA); $p = doc_get('wx_projects', $in['id'] ?? 0, 'Project'); q('DELETE FROM wx_projects WHERE id=?', [$p['id']]);
            log_act($u, 'project.delete', $p['name']); out(['ok' => true]);
    }
    return false;
}
