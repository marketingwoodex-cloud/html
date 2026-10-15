<?php
/**
 * P16 — Smart dashboard data (one call). Role-based: CRM/money for owner/admin/sales only.
 * Actions: dash_data {days: 7|28|90}, dash_target_save {target}. File: _private/dash.json {target}.
 */
const DASH_FILE = PRIVATE_DIR . '/dash.json';

function dash_actions(string $action, array $in): bool {
    if (strpos($action, 'dash_') !== 0) return false;
    switch ($action) {
        case 'dash_target_save':
            $u = need(['owner', 'admin']); $t = (int)round(max(0, (float)($in['target'] ?? 0)));
            jwrite(DASH_FILE, ['target' => $t]); log_act($u, 'settings.target', (string)$t); out(['ok' => true, 'target' => $t]);
        case 'dash_data':
            $u = need(); $days = in_array((int)($in['days'] ?? 28), [7, 28, 90], true) ? (int)($in['days'] ?? 28) : 28;
            $crm = in_array($u['role'], ['owner', 'admin', 'sales'], true); $money = $crm;
            $today = date('Y-m-d'); $start = date('Y-m-d', strtotime("-" . ($days - 1) . " days")); $pStart = date('Y-m-d', strtotime("-" . (2 * $days - 1) . " days"));
            $out = ['ok' => true, 'days' => $days, 'role' => $u['role'], 'crm' => null];
            // visitors per day from the Google cache (if connected)
            $gc = jread(PRIVATE_DIR . '/google-cache.json'); $vis = [];
            foreach (($gc['ga4']['daily'] ?? []) as $d) $vis[$d['date']] = (int)$d['users'];
            $axis = []; for ($t = strtotime($start); $t <= strtotime($today); $t += 86400) $axis[] = date('Y-m-d', $t);
            $out['axis'] = $axis; $out['visitors'] = array_map(fn($d) => $vis[$d] ?? null, $axis);
            if ($crm) {
                crm_migrate(); sales_migrate();
                $z = array_fill_keys($axis, 0); $leadsD = $z; $sentD = $z; $wonD = $z; $invD = $z; $paidD = $z;
                $in2 = fn($d) => $d >= $start && $d <= $today; $inP = fn($d) => $d >= $pStart && $d < $start;
                $leadsN = 0; $leadsP = 0;
                foreach (q('SELECT created_at FROM wx_leads WHERE created_at >= ?', [$pStart . ' 00:00:00'])->fetchAll() as $r) { $d = substr($r['created_at'], 0, 10); if ($in2($d)) { $leadsN++; $leadsD[$d]++; } elseif ($inP($d)) $leadsP++; }
                $funnel = array_fill_keys(CRM_STAGES, 0); foreach (q('SELECT stage, COUNT(*) n FROM wx_leads GROUP BY stage')->fetchAll() as $r) $funnel[$r['stage']] = (int)$r['n'];
                $pipe = (int)q("SELECT COALESCE(SUM(value),0) FROM wx_leads WHERE stage NOT IN ('won','lost')")->fetchColumn();
                $sentN = 0; $sentP = 0; $wonN = 0; $openQ = 0; $openQV = 0;
                foreach (doc_all('wx_quotes') as $x) {
                    $s = substr((string)($x['sent_at'] ?? ''), 0, 10); $a = substr((string)($x['approved_at'] ?? ''), 0, 10);
                    if ($s && $in2($s)) { $sentN++; $sentD[$s]++; } elseif ($s && $inP($s)) $sentP++;
                    if ($a && $in2($a)) { $wonN++; $wonD[$a]++; }
                    if ($x['status'] === 'sent') { $openQ++; $openQV += (int)$x['total']; }
                }
                $paidN = 0; $paidP = 0; $unpaid = 0; $overdue = []; $monthPaid = 0; $m0 = date('Y-m-01');
                foreach (doc_all('wx_invoices') as $i) { $i = inv_pub($i);
                    $iss = (string)($i['issue_date'] ?? ''); if ($iss && $in2($iss)) $invD[$iss] += (int)$i['total'];
                    foreach ($i['payments'] as $p) { $d = (string)$p['date']; if ($in2($d)) { $paidN += (int)$p['amount']; $paidD[$d] += (int)$p['amount']; } elseif ($inP($d)) $paidP += (int)$p['amount']; if ($d >= $m0) $monthPaid += (int)$p['amount']; }
                    $unpaid += (int)$i['balance'];
                    if ($i['overdue']) $overdue[] = ['id' => (int)$i['id'], 'no' => $i['no'], 'client' => (string)($i['client']['name'] ?? ''), 'balance' => (int)$i['balance'], 'due' => $i['due_date']];
                }
                usort($overdue, fn($a, $b) => strcmp($a['due'], $b['due']));
                $recent = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'service' => (string)$r['service'], 'stage' => $r['stage'], 'source' => $r['source'], 'created_at' => $r['created_at'], 'read' => (bool)$r['is_read']],
                    q('SELECT id,name,service,stage,source,created_at,is_read FROM wx_leads ORDER BY id DESC LIMIT 6')->fetchAll());
                $follow = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'service' => (string)$r['service'], 'stage' => $r['stage'], 'followup' => $r['followup'], 'late' => $r['followup'] < $today],
                    q("SELECT id,name,service,stage,followup FROM wx_leads WHERE followup IS NOT NULL AND followup <= ? AND stage NOT IN ('won','lost') ORDER BY followup LIMIT 8", [$today])->fetchAll());
                $sources = []; foreach (q('SELECT source, COUNT(*) n FROM wx_leads WHERE created_at >= ? GROUP BY source ORDER BY n DESC', [$start . ' 00:00:00'])->fetchAll() as $r) $sources[] = ['name' => CRM_SOURCES[$r['source']] ?? $r['source'], 'n' => (int)$r['n']];
                $new = (int)q("SELECT COUNT(*) FROM wx_leads WHERE is_read=0")->fetchColumn();
                $target = (int)(jread(DASH_FILE)['target'] ?? 0);
                $out['crm'] = [
                    'kpi' => ['leads' => [$leadsN, $leadsP], 'pipeline' => $pipe, 'quotesSent' => [$sentN, $sentP], 'openQuotes' => [$openQ, $openQV], 'paid' => [$paidN, $paidP], 'unpaid' => $unpaid, 'won' => $wonN],
                    'series' => ['leads' => array_values($leadsD), 'sent' => array_values($sentD), 'won' => array_values($wonD), 'invoiced' => array_values($invD), 'paid' => array_values($paidD)],
                    'funnel' => $funnel, 'recent' => $recent, 'followups' => $follow, 'overdue' => array_slice($overdue, 0, 6), 'overdueN' => count($overdue), 'sources' => $sources,
                    'chips' => ['new' => $new, 'overdue' => count($overdue), 'follow' => count($follow)],
                    'target' => ['target' => $target, 'month' => $monthPaid, 'monthLabel' => date('F Y')],
                ];
            }
            out($out);
    }
    return false;
}
