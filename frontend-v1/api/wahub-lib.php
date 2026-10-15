<?php
/**
 * P39 Phase 6 — WhatsApp hub.
 *  - Overview numbers for the hub page (connection, sends, delivery/read/reply rates, opt-outs, waiting chats).
 *  - Simple if/then rules: "When a lead is in stage X for N days → send template / add tag / assign / alert the team". Worked by wag_tick().
 *  - "No reply" reminders: customer chats waiting for the team, and new leads nobody contacted, after N hours → bell + Telegram + note.
 *  - Template approval status from Meta (needs the WhatsApp Business Account ID).
 * State lives in _private/wa-auto.json next to the P18 G data: keys 'hub' and 'rules'.
 */
const WAH_STAGES = ['new' => 'New', 'contacted' => 'Contacted', 'visit' => 'Site visit', 'quote' => 'Quote sent', 'won' => 'Won', 'lost' => 'Lost'];

function wah_cfg(array $d): array {
    return array_merge(['remindHours' => 24, 'remindChats' => true, 'remindLeads' => true, 'waba' => ''], is_array($d['hub'] ?? null) ? $d['hub'] : []);
}
function wah_rules(array $d): array { return array_values(is_array($d['rules'] ?? null) ? $d['rules'] : []); }
function wah_base(): string { $h = preg_replace('~[^a-z0-9.:-]~i', '', (string)($_SERVER['HTTP_HOST'] ?? '')); return $h !== '' ? 'https://' . $h : 'https://woodex.com.pk'; }

/** Called from wag_tick() after the built-in flows. Works the rules and the reminders. */
function wah_tick(array &$d, int &$budget, callable $send, array &$sum): void {
    try { wah_rules_run($d, $budget, $send, $sum); } catch (Throwable $e) { error_log('wah rules: ' . $e->getMessage()); }
    try { wah_remind($d, $sum); } catch (Throwable $e) { error_log('wah remind: ' . $e->getMessage()); }
}

function wah_rules_run(array &$d, int &$budget, callable $send, array &$sum): void {
    $rules = wah_rules($d); if (!$rules) return;
    foreach ($rules as $i => $r) {
        if (empty($r['on']) || !isset(WAH_STAGES[$r['stage'] ?? ''])) continue;
        $cut = date('Y-m-d H:i:s', time() - max(0, (int)$r['days']) * 86400); $old = date('Y-m-d H:i:s', time() - 120 * 86400);
        $rows = q('SELECT id,name,phone,company,location,stage,tags,assigned_to,created_at,last_contact FROM wx_leads WHERE stage=? AND created_at>=? ORDER BY id LIMIT 3000', [$r['stage'], $old])->fetchAll();
        foreach ($rows as $l) {
            $since = ($r['when'] ?? 'quiet') === 'created' ? (string)$l['created_at'] : (string)($l['last_contact'] ?: $l['created_at']);
            if ($since > $cut) continue;
            $k = 'rule:' . $r['id'] . ':' . $l['id'] . ':' . $l['stage']; if (isset($d['flowlog'][$k])) continue;
            $did = [];
            if (!empty($r['tpl'])) {
                $t = wag_tpl($d, (string)$r['tpl']); $p = wag_phone((string)$l['phone']);
                if ($t && $p && !isset($d['optout'][$p])) {
                    if ($budget <= 0) return; // try again next tick
                    $x = $send($p, $t, wag_fill((array)($r['params'] ?? []), ['p' => $p, 'n' => (string)$l['name'], 'co' => (string)($l['company'] ?? ''), 'city' => (string)($l['location'] ?? '')]));
                    if ($x['ok']) { $did[] = 'WhatsApp “' . ($t['label'] ?? $t['name']) . '” sent'; $sum['flows']++; $d['rules'][$i]['sent'] = (int)($d['rules'][$i]['sent'] ?? 0) + 1; if (!empty($x['id'])) $d['mid'][$x['id']] = ['r', $r['id'], now()]; }
                    else { $did[] = 'WhatsApp failed: ' . mb_substr((string)$x['error'], 0, 120); $sum['failed']++; $d['rules'][$i]['lastError'] = $x['error']; }
                }
            }
            if (($tag = trim((string)($r['tag'] ?? ''))) !== '') {
                $tags = array_values(array_filter(array_map('trim', explode(',', (string)$l['tags'])))); if (!in_array(strtolower($tag), array_map('strtolower', $tags), true)) { $tags[] = $tag; q('UPDATE wx_leads SET tags=? WHERE id=?', [mb_substr(implode(',', $tags), 0, 400), $l['id']]); $did[] = 'tag “' . $tag . '” added'; }
            }
            if (!empty($r['assign']) && empty($l['assigned_to'])) {
                $nm = q('SELECT name FROM wx_users WHERE id=? AND active=1', [(int)$r['assign']])->fetchColumn();
                if ($nm) { q('UPDATE wx_leads SET assigned_to=? WHERE id=?', [(int)$r['assign'], $l['id']]); $did[] = 'assigned to ' . $nm; }
            }
            if (!empty($r['alert']) && function_exists('tg_alert')) { tg_alert('leads', '⚙️ <b>' . tg_h((string)$r['name']) . '</b>' . "\n" . tg_h((string)$l['name']) . ' · ' . tg_h(WAH_STAGES[$l['stage']]) . ' · ' . tg_h((string)$l['phone'])); $did[] = 'team alerted'; }
            $d['flowlog'][$k] = now(); $d['rules'][$i]['runs'] = (int)($d['rules'][$i]['runs'] ?? 0) + 1;
            if ($did) try { lead_note_add((int)$l['id'], 'WhatsApp automation', 'Rule “' . $r['name'] . '”: ' . implode(', ', $did), true); } catch (Throwable $e) {}
        }
    }
}

/** Remind the team about customers waiting too long. One reminder per chat / lead per day. */
function wah_remind(array &$d, array &$sum): void {
    $c = wah_cfg($d); $H = (int)$c['remindHours']; if ($H <= 0) return;
    $cut = date('Y-m-d H:i:s', time() - $H * 3600); $day = date('Y-m-d'); $n = 0;
    if ($c['remindChats'] && function_exists('chat_add')) {
        foreach (q("SELECT * FROM wx_chats WHERE status='open' AND updated_at<? AND updated_at>? ORDER BY id LIMIT 300", [$cut, date('Y-m-d H:i:s', time() - 14 * 86400)])->fetchAll() as $ch) {
            $k = 'remind:chat:' . $ch['id'] . ':' . $day; if (isset($d['flowlog'][$k])) continue;
            $last = (string)q("SELECT who FROM wx_chat_msgs WHERE chat_id=? AND who IN ('visitor','agent','ai') ORDER BY id DESC LIMIT 1", [$ch['id']])->fetchColumn();
            if (!($last === 'visitor' || (!empty($ch['handoff']) && $last !== 'agent'))) continue;
            $d['flowlog'][$k] = now(); $n++;
            q('UPDATE wx_chats SET needs=1 WHERE id=?', [$ch['id']]);
            chat_add((int)$ch['id'], 'note', 'Reminder', '⏰ Customer has been waiting more than ' . $H . ' hours for a team reply.');
            if (function_exists('tg_alert')) tg_alert('leads', '⏰ <b>No reply for ' . $H . 'h</b> · ' . tg_h((string)($ch['name'] ?: ($ch['phone'] ?? '') ?: 'Visitor #' . $ch['id'])) . ' · chat #' . (int)$ch['id']);
        }
    }
    if ($c['remindLeads']) {
        foreach (q("SELECT id,name,phone,service FROM wx_leads WHERE stage='new' AND created_at<? AND created_at>? AND last_contact IS NULL ORDER BY id LIMIT 200", [$cut, date('Y-m-d H:i:s', time() - 14 * 86400)])->fetchAll() as $l) {
            $k = 'remind:lead:' . $l['id']; if (isset($d['flowlog'][$k])) continue;
            $d['flowlog'][$k] = now(); $n++;
            try { lead_note_add((int)$l['id'], 'Reminder', '⏰ No one has contacted this lead for ' . $H . ' hours.', true); } catch (Throwable $e) {}
            if (function_exists('tg_alert')) tg_alert('leads', '⏰ <b>New lead not contacted (' . $H . 'h)</b>' . "\n" . tg_h((string)$l['name']) . ' · ' . tg_h((string)$l['phone']) . ($l['service'] ? ' · ' . tg_h((string)$l['service']) : ''));
        }
    }
    $sum['reminders'] = $n;
}

function wah_rule_clean(array $r, array $d): array {
    $stage = isset(WAH_STAGES[$r['stage'] ?? '']) ? $r['stage'] : 'new';
    $t = !empty($r['tpl']) ? wag_tpl($d, (string)$r['tpl']) : null;
    $o = ['id' => preg_match('~^[a-f0-9]{6,12}$~', (string)($r['id'] ?? '')) ? $r['id'] : wag_id(), 'name' => clip($r['name'] ?? '', 80), 'on' => !empty($r['on']), 'stage' => $stage,
        'when' => ($r['when'] ?? '') === 'created' ? 'created' : 'quiet', 'days' => max(0, min(90, (int)($r['days'] ?? 1))),
        'tpl' => $t ? $t['id'] : '', 'params' => $t ? array_pad(array_slice(array_map(fn($p) => clip($p, 200), (array)($r['params'] ?? $t['params'])), 0, count($t['params'])), count($t['params']), '{name}') : [],
        'tag' => clip(str_replace(',', ' ', (string)($r['tag'] ?? '')), 40), 'assign' => (int)($r['assign'] ?? 0) ?: null, 'alert' => !empty($r['alert'])];
    if ($o['name'] === '') $o['name'] = WAH_STAGES[$stage] . ' · ' . $o['days'] . ' day' . ($o['days'] === 1 ? '' : 's');
    if (!$o['tpl'] && $o['tag'] === '' && !$o['assign'] && !$o['alert']) fail('Choose at least one action: send a template, add a tag, assign or alert the team');
    return $o;
}

/** Ask Meta for the approval status of every template. */
function wah_tpl_sync(array &$d): array {
    $c = wah_cfg($d); $crm = crm_cfg(); $waba = preg_replace('~\D~', '', (string)$c['waba']);
    if ($crm['waToken'] === '') return ['ok' => false, 'error' => 'Connect WhatsApp first (WhatsApp hub → Connect)'];
    if ($waba === '') return ['ok' => false, 'error' => 'Add your WhatsApp Business Account ID in Settings first (Meta → WhatsApp Manager → Account tools)'];
    $ch = curl_init('https://graph.facebook.com/v21.0/' . $waba . '/message_templates?fields=name,status,language,category&limit=250');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $crm['waToken']]]);
    if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    $raw = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
    $j = json_decode((string)$raw, true); if (!is_array($j) || isset($j['error'])) return ['ok' => false, 'error' => 'Meta: ' . ($j['error']['message'] ?? ($err ?: 'no answer'))];
    $meta = []; foreach ((array)($j['data'] ?? []) as $x) $meta[strtolower((string)$x['name']) . '|' . strtolower((string)$x['language'])] = (string)$x['status'];
    $byName = []; foreach ((array)($j['data'] ?? []) as $x) $byName[strtolower((string)$x['name'])][] = (string)$x['status'];
    $n = 0;
    foreach ($d['tpls'] as &$t) {
        $st = $meta[strtolower($t['name']) . '|' . strtolower($t['lang'])] ?? (isset($byName[strtolower($t['name'])]) ? $byName[strtolower($t['name'])][0] : 'NOT_FOUND');
        $t['status'] = $st; $t['checked'] = now(); $n++;
    } unset($t);
    return ['ok' => true, 'checked' => $n, 'found' => count($meta)];
}

function wah_actions(string $action, array $in): bool {
    if (!preg_match('~^wah_~', $action)) return false;
    $OA = ['owner', 'admin']; $SALES = ['owner', 'admin', 'sales'];
    switch ($action) {
        case 'wah_overview':
            $u = need($SALES); $d = wag_load(); $crm = crm_cfg(); $hub = wah_cfg($d);
            $days7 = 0; for ($i = 0; $i < 7; $i++) $days7 += (int)($d['day'][date('Y-m-d', time() - $i * 86400)] ?? 0);
            $tot = ['sent' => 0, 'delivered' => 0, 'read' => 0, 'replied' => 0, 'failed' => 0];
            foreach ($d['camps'] as $c) { $s = wag_stats($c); foreach ($tot as $k => $_) $tot[$k] += $s[$k]; }
            $fl = 0; foreach ($d['flows'] as $f) $fl += (int)$f['sent']; foreach (wah_rules($d) as $r) $fl += (int)($r['sent'] ?? 0);
            $wa = ['open' => 0, 'waiting' => 0]; try { $x = q("SELECT COUNT(*) a, SUM(needs=1) w FROM wx_chats WHERE status='open' AND channel='wa'")->fetch(); $wa = ['open' => (int)$x['a'], 'waiting' => (int)$x['w']]; } catch (Throwable $e) {}
            $users = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => (string)$r['name']], q("SELECT id,name FROM wx_users WHERE active=1 AND role IN ('owner','admin','sales','support') ORDER BY name")->fetchAll());
            out(['ok' => true, 'connected' => $crm['waToken'] !== '' && $crm['waPhoneId'] !== '', 'today' => (int)($d['day'][date('Y-m-d')] ?? 0), 'week' => $days7, 'cap' => (int)$d['cfg']['dailyCap'],
                'camp' => $tot, 'camps' => count($d['camps']), 'running' => count(array_filter($d['camps'], fn($c) => in_array($c['status'], ['sending', 'scheduled'], true))),
                'flowsOn' => count(array_filter($d['flows'], fn($f) => $f['on'])) + count(array_filter(wah_rules($d), fn($r) => !empty($r['on']))), 'autoSent' => $fl,
                'optout' => count($d['optout']), 'tpls' => count($d['tpls']), 'approved' => count(array_filter($d['tpls'], fn($t) => ($t['status'] ?? '') === 'APPROVED')),
                'wa' => $wa, 'lastTick' => $d['lastTick'] ?? null, 'hub' => in_array($u['role'], $OA, true) ? $hub : array_diff_key($hub, ['waba' => 1]),
                'rules' => wah_rules($d), 'stages' => WAH_STAGES, 'users' => $users, 'tplList' => array_map(fn($t) => ['id' => $t['id'], 'label' => $t['label'], 'params' => $t['params'], 'status' => $t['status'] ?? ''], $d['tpls']), 'vars' => WAG_VARS]);
        case 'wah_rule_save':
            $u = need($OA); $d = wag_load(); $r = wah_rule_clean((array)($in['rule'] ?? []), $d); $d['rules'] = wah_rules($d);
            if ($r['on'] && $r['tpl'] === '' && !empty($in['rule']['tpl'])) fail('Template not found');
            $found = false; foreach ($d['rules'] as &$x) if ($x['id'] === $r['id']) { $x = array_merge($x, $r); $found = true; } unset($x);
            if (!$found) { if (count($d['rules']) >= 30) fail('Up to 30 rules'); $r['sent'] = 0; $r['runs'] = 0; $r['created'] = now(); $d['rules'][] = $r; }
            wag_save($d); log_act($u, 'wa.rule', $r['name']); out(['ok' => true, 'rules' => $d['rules']]);
        case 'wah_rule_delete':
            $u = need($OA); $d = wag_load(); $id = (string)($in['id'] ?? ''); $d['rules'] = array_values(array_filter(wah_rules($d), fn($r) => $r['id'] !== $id));
            wag_save($d); log_act($u, 'wa.rule.delete', $id); out(['ok' => true, 'rules' => $d['rules']]);
        case 'wah_cfg_save':
            $u = need($OA); $d = wag_load(); $c = wah_cfg($d); $s = (array)($in['hub'] ?? []);
            if (isset($s['remindHours'])) $c['remindHours'] = max(0, min(168, (int)$s['remindHours']));
            foreach (['remindChats', 'remindLeads'] as $k) if (array_key_exists($k, $s)) $c[$k] = !empty($s[$k]);
            if (isset($s['waba'])) $c['waba'] = substr(preg_replace('~\D~', '', (string)$s['waba']), 0, 30);
            $d['hub'] = $c; wag_save($d); log_act($u, 'wa.hub', ''); out(['ok' => true, 'hub' => $c]);
        case 'wah_insights': // P40 C: insights for the hub dashboard
            $u = need($SALES); $d = wag_load(); $days = max(7, min(90, (int)($in['days'] ?? 14))); $from = date('Y-m-d', time() - ($days - 1) * 86400);
            $ser = []; for ($i = $days - 1; $i >= 0; $i--) { $k = date('Y-m-d', time() - $i * 86400); $ser[$k] = ['d' => $k, 'web' => 0, 'wa' => 0, 'tg' => 0, 'leads' => 0, 'auto' => (int)($d['day'][$k] ?? 0)]; }
            try { foreach (q("SELECT DATE(created_at) d, channel c, COUNT(*) n FROM wx_chats WHERE created_at>=? GROUP BY DATE(created_at), channel", [$from . ' 00:00:00'])->fetchAll() as $r) { $c = in_array($r['c'], ['wa', 'tg'], true) ? $r['c'] : 'web'; if (isset($ser[$r['d']])) $ser[$r['d']][$c] += (int)$r['n']; } } catch (Throwable $e) {}
            $src = [];
            foreach (q("SELECT DATE(created_at) d, source s, COUNT(*) n FROM wx_leads WHERE created_at>=? GROUP BY DATE(created_at), source", [$from . ' 00:00:00'])->fetchAll() as $r) { if (isset($ser[$r['d']])) $ser[$r['d']]['leads'] += (int)$r['n']; $sk = (string)$r['s'] ?: 'other'; $src[$sk] = ($src[$sk] ?? 0) + (int)$r['n']; }
            arsort($src);
            $fun = array_fill_keys(array_keys(WAH_STAGES), 0);
            foreach (q("SELECT stage, COUNT(*) n FROM wx_leads WHERE created_at>=? GROUP BY stage", [date('Y-m-d H:i:s', time() - 90 * 86400)])->fetchAll() as $r) if (isset($fun[$r['stage']])) $fun[$r['stage']] = (int)$r['n'];
            $rt = ['ai' => [], 'team' => []];
            try {
                $rows = q("SELECT m.chat_id, m.who, m.t FROM wx_chat_msgs m JOIN wx_chats c ON c.id=m.chat_id WHERE c.created_at>=? ORDER BY m.chat_id, m.id LIMIT 20000", [$from . ' 00:00:00'])->fetchAll();
                $st = []; foreach ($rows as $r) { $c = (int)$r['chat_id']; if (!isset($st[$c])) $st[$c] = []; $x = &$st[$c]; if (!isset($x['v']) && $r['who'] === 'visitor') $x['v'] = strtotime($r['t']);
                    elseif (isset($x['v']) && in_array($r['who'], ['ai', 'agent'], true)) { $w = $r['who'] === 'ai' ? 'ai' : 'team'; if (!isset($x[$w])) { $x[$w] = 1; $rt[$w][] = max(0, strtotime($r['t']) - $x['v']); } } unset($x); }
            } catch (Throwable $e) {}
            $med = function (array $a) { if (!$a) return null; sort($a); return $a[intdiv(count($a), 2)]; };
            $flows = []; foreach ($d['flows'] as $k => $f) if ((int)$f['sent'] || (int)($f['mailed'] ?? 0) || (int)$f['failed'] || $f['on']) $flows[] = ['k' => $k, 'name' => WAG_FLOWS[$k] ?? $k, 'on' => (bool)$f['on'], 'sent' => (int)$f['sent'], 'mailed' => (int)($f['mailed'] ?? 0), 'failed' => (int)$f['failed']];
            $camps = array_map(fn($c) => ['name' => $c['name'], 'when' => $c['when'] ?? '', 'status' => $c['status']] + wag_stats($c), array_slice(array_reverse($d['camps']), 0, 6));
            $won = $fun['won']; $closed = $won + $fun['lost'];
            out(['ok' => true, 'days' => $days, 'series' => array_values($ser), 'sources' => $src, 'funnel' => $fun, 'stages' => WAH_STAGES, 'winRate' => $closed ? round($won * 100 / $closed) : null,
                'reply' => ['ai' => $med($rt['ai']), 'team' => $med($rt['team']), 'aiN' => count($rt['ai']), 'teamN' => count($rt['team'])], 'flows' => $flows, 'camps' => $camps, 'optout' => count($d['optout'])]);
        case 'wah_tpl_submit': // P40 C: send a template to Meta for approval
            $u = need($OA); $d = wag_load(); $t = wag_tpl($d, (string)($in['id'] ?? '')); if (!$t) fail('Template not found');
            $c = wah_cfg($d); $crm = crm_cfg(); $waba = preg_replace('~\D~', '', (string)$c['waba']);
            if ($crm['waToken'] === '') fail('Connect WhatsApp first (WhatsApp hub → Connect)');
            if ($waba === '') fail('Add your WhatsApp Business Account ID in the hub settings first');
            if (!preg_match('~^[a-z0-9_]{1,512}$~', (string)$t['name'])) fail('Template name must be lowercase letters, numbers and _ only');
            $n = 0; $body = preg_replace_callback('~\{\{\s*\d+\s*\}\}~', function () use (&$n) { return '{{' . (++$n) . '}}'; }, (string)$t['body']);
            $comp = ['type' => 'BODY', 'text' => $body]; if ($n) $comp['example'] = ['body_text' => [array_map(fn($i) => ['Ayesha', 'WI-10100', 'Lahore', '12 Oct', '10:30 am'][$i % 5], range(0, $n - 1))]];
            $ch = curl_init('https://graph.facebook.com/v21.0/' . $waba . '/message_templates');
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $crm['waToken'], 'Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode(['name' => $t['name'], 'language' => $t['lang'] ?: 'en', 'category' => ($t['cat'] ?? '') === 'marketing' ? 'MARKETING' : 'UTILITY', 'components' => [$comp]], JSON_UNESCAPED_UNICODE)]);
            if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
            $raw = curl_exec($ch); $err = curl_error($ch); curl_close($ch); $j = json_decode((string)$raw, true);
            if (!is_array($j) || isset($j['error'])) fail('Meta: ' . ($j['error']['error_user_msg'] ?? $j['error']['message'] ?? ($err ?: 'no answer')));
            foreach ($d['tpls'] as &$x) if ($x['id'] === $t['id']) { $x['status'] = (string)($j['status'] ?? 'PENDING'); $x['checked'] = now(); $x['metaId'] = (string)($j['id'] ?? ''); } unset($x);
            wag_save($d); log_act($u, 'wa.tpl.submit', $t['name']); out(['ok' => true, 'status' => (string)($j['status'] ?? 'PENDING'), 'tpls' => $d['tpls']]);
        case 'wah_tpl_sync':
            $u = need($OA); $d = wag_load(); $r = wah_tpl_sync($d); if (!$r['ok']) fail($r['error']);
            wag_save($d); out($r + ['tpls' => $d['tpls']]);
    }
    return false;
}
