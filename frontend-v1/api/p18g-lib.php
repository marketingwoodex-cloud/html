<?php
/**
 * P18 G — WhatsApp automation: audiences (saved segments), campaigns with Meta-approved templates (send now / schedule,
 * throttled with a daily cap, STOP opt-outs), auto flows (welcome, quote follow-up, invoice reminder, visit reminder) and reports
 * (sent / delivered / read / replied from the webhook).
 * State: _private/wa-auto.json. The queue is worked by wag_tick(): from the admin (every minute while a campaign is sending)
 * and from a cron job: https://<site>/api/wa-cron.php?key=<cronKey>  (Hostinger → Advanced → Cron jobs, every 5 minutes).
 */
const WAG_FILE = PRIVATE_DIR . '/wa-auto.json';
const WAG_VARS = ['{name}' => 'First name', '{fullname}' => 'Full name', '{company}' => 'Company', '{city}' => 'City', '{ref}' => 'Quote / invoice no.', '{amount}' => 'Amount (Rs)', '{date}' => 'Date', '{time}' => 'Time', '{link}' => 'Link'];
const WAG_FLOWS = ['welcome' => 'New enquiry → welcome', 'lead1' => 'New lead, no reply → 1st follow-up', 'lead2' => 'New lead, no reply → 2nd follow-up', 'lead3' => 'New lead, no reply → last follow-up', 'quote' => 'Quote sent → 1st follow-up', 'quote2' => 'Quote sent → 2nd follow-up', 'quote3' => 'Quote sent → last follow-up', 'invoice' => 'Invoice due soon → reminder', 'invoice0' => 'Invoice due today → reminder', 'invoice_late' => 'Invoice overdue → reminder', 'booking' => 'Site visit → reminder the day before'];
const WAG_STOP = '~^\s*(stop|unsubscribe|band karo|بند|ruk jao|no more)\s*[.!]*\s*$~iu';

function wag_load(): array {
    $d = jread(WAG_FILE);
    $d['cfg'] = array_merge(['dailyCap' => 250, 'perTick' => 25, 'cronKey' => '', 'quietFrom' => '21:00', 'quietTo' => '09:00'], $d['cfg'] ?? []);
    if ($d['cfg']['cronKey'] === '') $d['cfg']['cronKey'] = bin2hex(random_bytes(12));
    $fl = $d['flows'] ?? [];
    foreach (WAG_FLOWS as $k => $l) $fl[$k] = array_merge(['on' => false, 'tpl' => '', 'params' => [], 'days' => ['lead1' => 1, 'lead2' => 3, 'lead3' => 7, 'quote' => 1, 'quote2' => 3, 'quote3' => 7, 'invoice' => 3, 'invoice0' => 0, 'invoice_late' => 3][$k] ?? 1, 'sent' => 0, 'failed' => 0, 'mail' => false, 'subject' => '', 'body' => '', 'mailed' => 0], is_array($fl[$k] ?? null) ? $fl[$k] : []);
    $d['flows'] = $fl;
    foreach (['tpls', 'segs', 'camps'] as $k) $d[$k] = array_values($d[$k] ?? []);
    foreach (['optout', 'day', 'flowlog', 'mid'] as $k) $d[$k] = $d[$k] ?? [];
    return $d;
}
function wag_save(array $d): void {
    $cut = date('Y-m-d H:i:s', time() - 120 * 86400); $d['flowlog'] = array_filter($d['flowlog'], fn($t) => $t > $cut);
    $d['day'] = array_slice($d['day'], -40, null, true);
    if (count($d['mid']) > 20000) $d['mid'] = array_slice($d['mid'], -15000, null, true);
    jwrite(WAG_FILE, $d);
}
function wag_phone(string $p): string { $d = preg_replace('~\D~', '', $p); if (strlen($d) === 11 && $d[0] === '0') $d = '92' . substr($d, 1); if (strlen($d) === 10 && $d[0] === '3') $d = '92' . $d; return strlen($d) >= 10 ? $d : ''; }
function wag_id(): string { return substr(bin2hex(random_bytes(6)), 0, 10); }

/** All reachable contacts (leads + clients, one row per phone, newest lead wins). */
function wag_contacts(): array {
    $o = [];
    foreach (q('SELECT id,created_at,name,phone,company,location,line,stage,tags,last_contact,client_id FROM wx_leads ORDER BY id')->fetchAll() as $r) {
        $p = wag_phone((string)$r['phone']); if (!$p) continue;
        $o[$p] = ['p' => $p, 'n' => (string)$r['name'], 'co' => (string)($r['company'] ?? ''), 'city' => (string)($r['location'] ?? ''), 'line' => (string)($r['line'] ?? ''), 'stage' => (string)$r['stage'],
            'tags' => $r['tags'] ? explode(',', (string)$r['tags']) : [], 'last' => (string)($r['last_contact'] ?: $r['created_at']), 'created' => (string)$r['created_at'], 'lid' => (int)$r['id'], 'cid' => $r['client_id'] !== null ? (int)$r['client_id'] : (($o[$p]['cid'] ?? null)), 'kind' => 'lead'];
    }
    foreach (q('SELECT id,name,phone,company,city,created_at FROM wx_clients')->fetchAll() as $r) {
        $p = wag_phone((string)$r['phone']); if (!$p) continue;
        if (isset($o[$p])) { $o[$p]['kind'] = 'client'; $o[$p]['cid'] = (int)$r['id']; if ($o[$p]['city'] === '') $o[$p]['city'] = (string)($r['city'] ?? ''); continue; }
        $o[$p] = ['p' => $p, 'n' => (string)$r['name'], 'co' => (string)($r['company'] ?? ''), 'city' => (string)($r['city'] ?? ''), 'line' => '', 'stage' => 'won', 'tags' => [], 'last' => (string)$r['created_at'], 'created' => (string)$r['created_at'], 'lid' => null, 'cid' => (int)$r['id'], 'kind' => 'client'];
    }
    return array_values($o);
}
function wag_filter_clean($f): array {
    $f = is_array($f) ? $f : [];
    return ['who' => in_array($f['who'] ?? '', ['leads', 'clients'], true) ? $f['who'] : 'all', 'line' => clip($f['line'] ?? '', 30), 'stages' => array_values(array_intersect((array)($f['stages'] ?? []), ['new', 'contacted', 'visit', 'quote', 'won', 'lost'])),
        'city' => clip($f['city'] ?? '', 80), 'tag' => clip($f['tag'] ?? '', 40), 'quiet' => max(0, min(3650, (int)($f['quiet'] ?? 0))), 'recent' => max(0, min(3650, (int)($f['recent'] ?? 0)))];
}
function wag_match(array $c, array $f): bool {
    if ($f['who'] === 'leads' && $c['kind'] !== 'lead') return false;
    if ($f['who'] === 'clients' && $c['kind'] !== 'client') return false;
    if ($f['line'] !== '' && strcasecmp($c['line'], $f['line'])) return false;
    if ($f['stages'] && !in_array($c['stage'], $f['stages'], true)) return false;
    if ($f['city'] !== '' && stripos($c['city'], $f['city']) === false) return false;
    if ($f['tag'] !== '' && !in_array(strtolower($f['tag']), array_map('strtolower', array_map('trim', $c['tags'])), true)) return false;
    if ($f['quiet'] && $c['last'] > date('Y-m-d H:i:s', time() - $f['quiet'] * 86400)) return false;
    if ($f['recent'] && $c['created'] < date('Y-m-d H:i:s', time() - $f['recent'] * 86400)) return false;
    return true;
}
function wag_audience(array $f, array $d): array { $all = wag_contacts(); $m = array_values(array_filter($all, fn($c) => wag_match($c, $f))); $opt = array_values(array_filter($m, fn($c) => isset($d['optout'][$c['p']]))); return [array_values(array_filter($m, fn($c) => !isset($d['optout'][$c['p']]))), count($opt)]; }

/** Fill template params for one contact. */
function wag_fill(array $params, array $v): array {
    $first = trim(explode(' ', trim($v['n'] ?? ''))[0] ?? '');
    $map = ['{name}' => $first ?: 'there', '{fullname}' => $v['n'] ?? '', '{company}' => $v['co'] ?? '', '{city}' => $v['city'] ?? '', '{ref}' => $v['ref'] ?? '', '{amount}' => isset($v['amount']) ? number_format((float)$v['amount']) : '', '{date}' => $v['date'] ?? '', '{time}' => $v['time'] ?? '', '{link}' => $v['link'] ?? ''];
    return array_map(fn($p) => mb_substr(trim(strtr((string)$p, $map)) ?: '-', 0, 900), $params);
}
function wag_tpl(array $d, string $id): ?array { foreach ($d['tpls'] as $t) if ($t['id'] === $id) return $t; return null; }
/** Send a Meta template. Returns ['ok'=>bool, 'id'=>wamid, 'error'=>string]. */
function wag_send_tpl(string $to, array $t, array $vals): array {
    $c = crm_cfg(); if (!$c['waToken'] || !$c['waPhoneId']) return ['ok' => false, 'error' => 'WhatsApp is not connected'];
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'cURL missing'];
    $tp = ['name' => $t['name'], 'language' => ['code' => $t['lang'] ?: 'en']];
    if ($vals) $tp['components'] = [['type' => 'body', 'parameters' => array_map(fn($x) => ['type' => 'text', 'text' => $x], $vals)]];
    $ch = curl_init('https://graph.facebook.com/v21.0/' . rawurlencode($c['waPhoneId']) . '/messages');
    curl_setopt_array($ch, [CURLOPT_CAINFO => __DIR__ . '/cacert.pem', CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $c['waToken'], 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'template', 'template' => $tp])]);
    $r = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) return ['ok' => false, 'error' => $err ?: 'network error'];
    $j = json_decode((string)$r, true) ?: [];
    if ($code >= 300) return ['ok' => false, 'error' => (string)($j['error']['message'] ?? "HTTP $code")];
    return ['ok' => true, 'id' => (string)($j['messages'][0]['id'] ?? '')];
}
function wag_quiet(array $cfg): bool { $n = date('H:i'); $a = $cfg['quietFrom']; $b = $cfg['quietTo']; if (!$a || !$b || $a === $b) return false; return $a < $b ? ($n >= $a && $n < $b) : ($n >= $a || $n < $b); }
function wag_left(array $d): int { return max(0, (int)$d['cfg']['dailyCap'] - (int)($d['day'][date('Y-m-d')] ?? 0)); }

/** Work the queue: auto flows first (time-critical), then campaigns. Returns a summary. */
function wag_tick(bool $force = false): array {
    $lock = fopen(PRIVATE_DIR . '/wa-auto.lock', 'c'); if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['busy' => true];
    try {
        $d = wag_load(); $sum = ['flows' => 0, 'camp' => 0, 'failed' => 0];
        $budget = min((int)$d['cfg']['perTick'], wag_left($d));
        if (wag_quiet($d['cfg']) && !$force) { foreach ($d['camps'] as &$c0) if ($c0['status'] === 'scheduled' && $c0['when'] <= now()) $c0['status'] = 'sending'; unset($c0); wag_save($d); return $sum + ['quiet' => true]; }
        $send = function (string $p, array $t, array $vals) use (&$d, &$budget) { $r = wag_send_tpl($p, $t, $vals); $budget--; if ($r['ok']) { $k = date('Y-m-d'); $d['day'][$k] = (int)($d['day'][$k] ?? 0) + 1; } return $r; };
        // --- auto flows
        foreach (wag_flow_due($d) as $job) {
            if ($budget <= 0) break;
            [$fk, $key, $v] = $job; $f = $d['flows'][$fk]; $t = $f['tpl'] !== '' ? wag_tpl($d, $f['tpl']) : null; $p = (string)($v['p'] ?? '');
            $r = ['ok' => false, 'error' => $t ? 'No WhatsApp number' : 'No WhatsApp template'];
            if ($p !== '' && isset($d['optout'][$p])) { $d['flowlog'][$key] = now(); continue; }
            if ($t && $p !== '') $r = $send($p, $t, wag_fill($f['params'], $v));
            $d['flowlog'][$key] = now(); $how = 'WhatsApp';
            // P40 C: email backup when WhatsApp is not possible or failed
            if (!$r['ok'] && !empty($f['mail']) && !empty($v['em']) && trim((string)$f['body']) !== '' && function_exists('smtp_send')) {
                [$sub, $body] = wag_fill([(string)$f['subject'] ?: 'Woodex Interior', (string)$f['body']], $v);
                $e = smtp_send(crm_cfg(), [$v['em']], $sub, $body . "\n\nWoodex Interior\n+92 322 4000768 · info@woodex.com.pk");
                if ($e === '') { $r = ['ok' => true]; $how = 'Email'; $d['flows'][$fk]['mailed'] = (int)($f['mailed'] ?? 0) + 1; } else $r['error'] .= ' · email: ' . $e;
            }
            if ($r['ok']) { if ($how === 'WhatsApp') $d['flows'][$fk]['sent']++; $sum['flows']++; if (!empty($r['id'])) $d['mid'][$r['id']] = ['f', $fk, now()]; if (!empty($v['lid'])) try { lead_note_add((int)$v['lid'], 'Follow-up automation', $how . ' sent: ' . WAG_FLOWS[$fk], true); } catch (Throwable $e) {} }
            else { $d['flows'][$fk]['failed']++; $sum['failed']++; $d['flows'][$fk]['lastError'] = $r['error']; }
        }
        // --- P39 Phase 6: if/then rules + no-reply reminders
        if (function_exists('wah_tick')) wah_tick($d, $budget, $send, $sum);
        // --- campaigns
        foreach ($d['camps'] as &$c) {
            if ($c['status'] === 'scheduled' && $c['when'] <= now()) $c['status'] = 'sending';
            if ($c['status'] !== 'sending') continue;
            $t = wag_tpl($d, $c['tpl']); if (!$t) { $c['status'] = 'failed'; $c['error'] = 'Template was deleted'; continue; }
            foreach ($c['rcp'] as $i => &$r) {
                if ($r['s'] !== 'queued') continue; if ($budget <= 0) break 2;
                if (isset($d['optout'][$r['p']])) { $r['s'] = 'skipped'; $r['e'] = 'opted out'; continue; }
                $x = $send($r['p'], $t, wag_fill($c['params'], $r));
                $r['t'] = now();
                if ($x['ok']) { $r['s'] = 'sent'; $r['w'] = $x['id'] ?? ''; if ($r['w']) $d['mid'][$r['w']] = ['c', $c['id'], $i]; $sum['camp']++; }
                else { $r['s'] = 'failed'; $r['e'] = mb_substr($x['error'], 0, 200); $sum['failed']++; if (preg_match('~not connected|token|OAuth|permission~i', $x['error'])) { $c['status'] = 'paused'; $c['error'] = $x['error']; break; } }
            } unset($r);
            if ($c['status'] === 'sending' && !array_filter($c['rcp'], fn($r) => $r['s'] === 'queued')) { $c['status'] = 'done'; $c['done_at'] = now(); }
        } unset($c);
        $d['lastTick'] = now(); wag_save($d); return $sum + ['left' => wag_left($d)];
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
/** Due auto-flow jobs: [flowKey, dedupeKey, vars]. */
function wag_flow_due(array $d): array {
    $jobs = []; $F = $d['flows']; $log = $d['flowlog'];
    $on = fn($k) => !empty($F[$k]['on']) && ($F[$k]['tpl'] !== '' || (!empty($F[$k]['mail']) && trim((string)$F[$k]['body']) !== ''));
    if ($on('welcome')) {
        foreach (q('SELECT id,name,phone,company,location FROM wx_leads WHERE created_at >= ? ORDER BY id', [date('Y-m-d H:i:s', time() - 2 * 86400)])->fetchAll() as $l) {
            $k = 'welcome:' . $l['id']; $p = wag_phone((string)$l['phone']); if (!$p || isset($log[$k])) continue;
            $jobs[] = ['welcome', $k, ['p' => $p, 'n' => $l['name'], 'co' => (string)$l['company'], 'city' => (string)$l['location'], 'lid' => (int)$l['id']]];
        }
    }
    // P40 C: new leads nobody heard back from (stage New/Contacted, no customer message since the enquiry) → day 1 / 3 / 7
    foreach (['lead1', 'lead2', 'lead3'] as $lk) {
        if (!$on($lk)) continue; $n = max(1, (int)$F[$lk]['days']);
        $rows = q("SELECT id,name,phone,email,company,location,created_at FROM wx_leads WHERE stage IN ('new','contacted') AND created_at<=? AND created_at>=? ORDER BY id LIMIT 500", [date('Y-m-d H:i:s', time() - $n * 86400), date('Y-m-d H:i:s', time() - ($n + 7) * 86400)])->fetchAll();
        foreach ($rows as $l) {
            $k = $lk . ':' . $l['id']; $p = wag_phone((string)$l['phone']); $em = filter_var((string)$l['email'], FILTER_VALIDATE_EMAIL) ? (string)$l['email'] : '';
            if ((!$p && !$em) || isset($log[$k])) continue;
            try { if (q("SELECT 1 FROM wx_chat_msgs m JOIN wx_chats c ON c.id=m.chat_id WHERE c.lead_id=? AND m.who='visitor' AND m.t>? LIMIT 1", [(int)$l['id'], date('Y-m-d H:i:s', strtotime((string)$l['created_at']) + 600)])->fetchColumn()) continue; } catch (Throwable $e) {}
            $jobs[] = [$lk, $k, ['p' => $p, 'em' => $em, 'n' => $l['name'], 'co' => (string)$l['company'], 'city' => (string)$l['location'], 'lid' => (int)$l['id']]];
        }
    }
    if ($on('quote') || $on('quote2') || $on('quote3') || $on('invoice') || $on('invoice0') || $on('invoice_late')) {
        if (function_exists('doc_all')) {
            foreach (['quote', 'quote2', 'quote3'] as $qk) { // P39: day 1 / 3 / 7 follow-ups; stop when the customer replies or the quote is answered
                if (!$on($qk)) continue;
                $cut = date('Y-m-d H:i:s', time() - max(1, (int)$F[$qk]['days']) * 86400); $old = date('Y-m-d H:i:s', time() - (max(1, (int)$F[$qk]['days']) + 7) * 86400);
                foreach (doc_all('wx_quotes') as $x) {
                    if (($x['status'] ?? '') !== 'sent' || empty($x['sent_at']) || $x['sent_at'] > $cut || $x['sent_at'] < $old) continue;
                    $k = ($qk === 'quote' ? 'quote:' : $qk . ':') . $x['id']; $p = wag_phone((string)($x['client']['phone'] ?? '')); $em = filter_var((string)($x['client']['email'] ?? ''), FILTER_VALIDATE_EMAIL) ? (string)$x['client']['email'] : ''; if ((!$p && !$em) || isset($log[$k])) continue;
                    if (!empty($x['lead_id'])) { try { if (q("SELECT 1 FROM wx_chat_msgs m JOIN wx_chats c ON c.id=m.chat_id WHERE c.lead_id=? AND m.who='visitor' AND m.t>? LIMIT 1", [(int)$x['lead_id'], $x['sent_at']])->fetchColumn()) continue; } catch (Throwable $e) {} }
                    $jobs[] = [$qk, $k, ['p' => $p, 'em' => $em, 'n' => (string)($x['client']['name'] ?? ''), 'co' => (string)($x['client']['company'] ?? ''), 'ref' => (string)($x['no'] ?? ''), 'amount' => $x['total'] ?? 0, 'lid' => $x['lead_id'] ?? null]];
                }
            }
            foreach (['invoice' => 1, 'invoice0' => 0, 'invoice_late' => -1] as $ik => $dir) {
                if (!$on($ik)) continue;
                $due = date('Y-m-d', time() + $dir * max($dir ? 1 : 0, (int)$F[$ik]['days']) * 86400);
                foreach (doc_all('wx_invoices') as $i) {
                    $i = inv_pub($i); if (($i['due_date'] ?? '') !== $due || $i['balance'] <= 0) continue;
                    $k = $ik . ':' . $i['id'] . ':' . $due; $p = wag_phone((string)($i['client']['phone'] ?? '')); $em = filter_var((string)($i['client']['email'] ?? ''), FILTER_VALIDATE_EMAIL) ? (string)$i['client']['email'] : '';
                    if ((!$p && !$em) || isset($log[$k])) continue;
                    $jobs[] = [$ik, $k, ['p' => $p, 'em' => $em, 'n' => (string)($i['client']['name'] ?? ''), 'co' => (string)($i['client']['company'] ?? ''), 'ref' => (string)($i['no'] ?? ''), 'amount' => $i['balance'], 'date' => date('j M Y', strtotime((string)$i['due_date']))]];
                }
            }
        }
    }
    if ($on('booking')) {
        try { $rows = q("SELECT id,name,phone,d,tm,lead_id FROM wx_bookings WHERE d=? AND status='confirmed'", [date('Y-m-d', time() + 86400)])->fetchAll(); } catch (Throwable $e) { $rows = []; }
        foreach ($rows as $b) {
            $k = 'booking:' . $b['id'] . ':' . $b['d']; $p = wag_phone((string)$b['phone']); if (!$p || isset($log[$k])) continue;
            $h = (int)substr($b['tm'], 0, 2);
            $jobs[] = ['booking', $k, ['p' => $p, 'n' => $b['name'], 'date' => date('D j M', strtotime($b['d'])), 'time' => (($h % 12) ?: 12) . ':' . substr($b['tm'], 3, 2) . ($h < 12 ? ' am' : ' pm'), 'lid' => $b['lead_id']]];
        }
    }
    return $jobs;
}
/** Campaign report numbers. */
function wag_stats(array $c): array {
    $s = ['total' => count($c['rcp']), 'queued' => 0, 'sent' => 0, 'delivered' => 0, 'read' => 0, 'replied' => 0, 'failed' => 0, 'skipped' => 0];
    $rank = ['sent' => 1, 'delivered' => 2, 'read' => 3, 'replied' => 4];
    foreach ($c['rcp'] as $r) { $st = $r['s']; if (isset($rank[$st])) { foreach ($rank as $k => $n) if ($n <= $rank[$st]) $s[$k]++; } elseif (isset($s[$st])) $s[$st]++; }
    return $s;
}
function wag_camp_pub(array $c, bool $full = false): array { $o = $c; $o['stats'] = wag_stats($c); if (!$full) unset($o['rcp']); else $o['rcp'] = array_slice($c['rcp'], 0, 500); return $o; }

/** Webhook hook (api/whatsapp.php): delivery statuses, replies, STOP opt-outs. Returns phones that opted out in this payload. */
function wag_webhook(array $j): array {
    if (!is_file(WAG_FILE)) return [];
    $d = wag_load(); $dirty = false; $stopped = [];
    $rank = ['queued' => 0, 'sent' => 1, 'delivered' => 2, 'read' => 3, 'replied' => 4];
    $set = function (string $wamid, string $st) use (&$d, &$dirty, $rank) {
        $m = $d['mid'][$wamid] ?? null; if (!$m || $m[0] !== 'c') return;
        foreach ($d['camps'] as &$c) if ($c['id'] === $m[1] && isset($c['rcp'][$m[2]])) { $r = &$c['rcp'][$m[2]];
            if ($st === 'failed') { if (($rank[$r['s']] ?? 0) <= 1) { $r['s'] = 'failed'; $r['e'] = 'not delivered'; $dirty = true; } }
            elseif (($rank[$st] ?? 0) > ($rank[$r['s']] ?? 0)) { $r['s'] = $st; $dirty = true; } unset($r); } unset($c);
    };
    foreach (($j['entry'] ?? []) as $en) foreach (($en['changes'] ?? []) as $chg) {
        $v = $chg['value'] ?? [];
        foreach (($v['statuses'] ?? []) as $s) $set((string)($s['id'] ?? ''), (string)($s['status'] ?? ''));
        foreach (($v['messages'] ?? []) as $m) {
            $p = wag_phone((string)($m['from'] ?? '')); if (!$p) continue;
            $txt = (string)($m['text']['body'] ?? $m['button']['text'] ?? $m['interactive']['button_reply']['title'] ?? '');
            if (preg_match(WAG_STOP, $txt)) { if (!isset($d['optout'][$p])) { $d['optout'][$p] = now(); $dirty = true; } $stopped[] = $p; continue; }
            if (preg_match('~^\s*(start|subscribe)\s*$~i', $txt) && isset($d['optout'][$p])) { unset($d['optout'][$p]); $dirty = true; }
            // replied: newest campaign message to this phone in the last 14 days
            $since = date('Y-m-d H:i:s', time() - 14 * 86400);
            foreach (array_reverse(array_keys($d['camps'])) as $ci) { $hit = false;
                foreach ($d['camps'][$ci]['rcp'] as $ri => $r) if ($r['p'] === $p && in_array($r['s'], ['sent', 'delivered', 'read'], true) && ($r['t'] ?? '') >= $since) { $d['camps'][$ci]['rcp'][$ri]['s'] = 'replied'; $dirty = $hit = true; }
                if ($hit) break; }
        }
    }
    if ($dirty) wag_save($d);
    return $stopped;
}

function p18g_actions(string $action, array $in): bool {
    if (!preg_match('~^wag_~', $action)) return false;
    $OA = ['owner', 'admin']; $SALES = ['owner', 'admin', 'sales'];
    switch ($action) {
        case 'wag_get':
            $u = need($SALES); $d = wag_load(); if (!is_file(WAG_FILE)) wag_save($d);
            $all = wag_contacts(); $vals = fn($k) => array_values(array_unique(array_filter(array_map(fn($c) => trim((string)$c[$k]), $all)))); $tags = [];
            foreach ($all as $c) foreach ($c['tags'] as $t) if (trim($t) !== '') $tags[trim($t)] = 1;
            $c = crm_cfg(); $base = (isset($_SERVER['HTTP_HOST']) ? 'https://' . $_SERVER['HTTP_HOST'] : '');
            out(['ok' => true, 'cfg' => in_array($u['role'], $OA, true) ? $d['cfg'] : array_diff_key($d['cfg'], ['cronKey' => 1]), 'cronUrl' => in_array($u['role'], $OA, true) ? $base . '/api/wa-cron.php?key=' . $d['cfg']['cronKey'] : '',
                'flows' => $d['flows'], 'flowNames' => WAG_FLOWS, 'tpls' => $d['tpls'], 'segs' => $d['segs'], 'camps' => array_map('wag_camp_pub', array_reverse($d['camps'])), 'vars' => WAG_VARS,
                'optout' => count($d['optout']), 'today' => (int)($d['day'][date('Y-m-d')] ?? 0), 'left' => wag_left($d), 'lastTick' => $d['lastTick'] ?? null, 'connected' => (bool)($c['waToken'] && $c['waPhoneId']),
                'opts' => ['lines' => $vals('line'), 'cities' => array_slice($vals('city'), 0, 80), 'tags' => array_slice(array_keys($tags), 0, 80)], 'contacts' => count($all)]);
        case 'wag_audience':
            need($SALES); $d = wag_load(); [$L, $opt] = wag_audience(wag_filter_clean($in['filter'] ?? []), $d);
            out(['ok' => true, 'count' => count($L), 'optedOut' => $opt, 'sample' => array_map(fn($c) => ['name' => $c['n'], 'phone' => '+' . $c['p'], 'city' => $c['city'], 'stage' => $c['stage'], 'kind' => $c['kind'], 'line' => $c['line']], array_slice($L, 0, 25))]);
        case 'wag_seg_save':
            $u = need($SALES); $d = wag_load(); $name = clip($in['name'] ?? '', 60); if ($name === '') fail('Give the segment a name');
            $id = (string)($in['id'] ?? ''); $s = ['id' => $id ?: wag_id(), 'name' => $name, 'filter' => wag_filter_clean($in['filter'] ?? []), 'updated' => now()];
            $hit = false; foreach ($d['segs'] as &$x) if ($x['id'] === $s['id']) { $x = $s; $hit = true; } unset($x); if (!$hit) { if (count($d['segs']) >= 50) fail('Up to 50 segments'); $d['segs'][] = $s; }
            wag_save($d); log_act($u, 'wa.segment', $name); out(['ok' => true, 'seg' => $s]);
        case 'wag_seg_delete':
            $u = need($SALES); $d = wag_load(); $d['segs'] = array_values(array_filter($d['segs'], fn($x) => $x['id'] !== (string)($in['id'] ?? ''))); wag_save($d); out(['ok' => true]);
        case 'wag_tpl_save':
            $u = need($OA); $d = wag_load(); $name = strtolower(clip($in['name'] ?? '', 120));
            if (!preg_match('~^[a-z0-9_]{1,120}$~', $name)) fail('Template name must match the name in Meta exactly: lowercase letters, numbers and _ only');
            $body = clip($in['body'] ?? '', 1024); if ($body === '') fail('Paste the template text from Meta so you can preview it');
            preg_match_all('~\{\{(\d+)\}\}~', $body, $m); $n = $m[1] ? max(array_map('intval', $m[1])) : 0;
            $params = array_slice(array_map(fn($p) => clip($p, 200), (array)($in['params'] ?? [])), 0, $n); while (count($params) < $n) $params[] = '{name}';
            $t = ['id' => (string)($in['id'] ?? '') ?: wag_id(), 'name' => $name, 'lang' => clip($in['lang'] ?? 'en', 10) ?: 'en', 'label' => clip($in['label'] ?? '', 60) ?: $name, 'body' => $body, 'params' => $params, 'cat' => in_array($in['cat'] ?? '', ['marketing', 'utility'], true) ? $in['cat'] : 'marketing'];
            $hit = false; foreach ($d['tpls'] as &$x) if ($x['id'] === $t['id']) { if ($x['name'] === $t['name'] && $x['lang'] === $t['lang'] && isset($x['status'])) { $t['status'] = $x['status']; $t['checked'] = $x['checked'] ?? ''; } $x = $t; $hit = true; } unset($x); if (!$hit) $d['tpls'][] = $t;
            wag_save($d); log_act($u, 'wa.template', $name); out(['ok' => true, 'tpl' => $t]);
        case 'wag_tpl_delete':
            $u = need($OA); $d = wag_load(); $id = (string)($in['id'] ?? '');
            foreach ($d['flows'] as $k => $f) if ($f['on'] && $f['tpl'] === $id) fail('This template is used by the auto flow “' . WAG_FLOWS[$k] . '”. Turn it off first.');
            foreach ($d['camps'] as $c) if ($c['tpl'] === $id && in_array($c['status'], ['scheduled', 'sending', 'paused'], true)) fail('A campaign that is still sending uses this template');
            $d['tpls'] = array_values(array_filter($d['tpls'], fn($x) => $x['id'] !== $id)); wag_save($d); out(['ok' => true]);
        case 'wag_camp_save':
            $u = need($SALES); $d = wag_load(); $name = clip($in['name'] ?? '', 80); if ($name === '') fail('Give the campaign a name');
            $t = wag_tpl($d, (string)($in['tpl'] ?? '')); if (!$t) fail('Choose a template');
            $c0 = crm_cfg(); if (!($c0['waToken'] && $c0['waPhoneId']) && empty($in['draft'])) fail('Connect WhatsApp first (Settings → Integrations). You can save as a draft meanwhile.');
            $f = wag_filter_clean($in['filter'] ?? []); [$L] = wag_audience($f, $d); if (!$L) fail('No one matches this audience');
            if (count($L) > 5000) fail('Audience is over 5,000 people — narrow it down');
            $when = !empty($in['when']) ? date('Y-m-d H:i:s', strtotime((string)$in['when'])) : now(); if (!empty($in['when']) && strtotime((string)$in['when']) === false) fail('Invalid schedule time');
            $params = array_slice(array_map(fn($p) => clip($p, 200), (array)($in['params'] ?? $t['params'])), 0, count($t['params'])); while (count($params) < count($t['params'])) $params[] = $t['params'][count($params)];
            $c = ['id' => wag_id(), 'name' => $name, 'tpl' => $t['id'], 'tplName' => $t['label'], 'params' => $params, 'filter' => $f, 'seg' => clip($in['seg'] ?? '', 20), 'when' => $when,
                'status' => !empty($in['draft']) ? 'draft' : ($when > now() ? 'scheduled' : 'sending'), 'created_at' => now(), 'created_by' => $u['name'],
                'rcp' => array_map(fn($x) => ['p' => $x['p'], 'n' => $x['n'], 'co' => $x['co'], 'city' => $x['city'], 'lid' => $x['lid'], 's' => 'queued'], $L)];
            $d['camps'][] = $c; if (count($d['camps']) > 200) array_shift($d['camps']); wag_save($d); log_act($u, 'wa.campaign', $name . ' → ' . count($L));
            $tick = $c['status'] === 'sending' ? wag_tick() : null;
            out(['ok' => true, 'camp' => wag_camp_pub(wag_load()['camps'][count(wag_load()['camps']) - 1]), 'tick' => $tick]);
        case 'wag_camp_get':
            need($SALES); $d = wag_load(); foreach ($d['camps'] as $c) if ($c['id'] === (string)($in['id'] ?? '')) out(['ok' => true, 'camp' => wag_camp_pub($c, true)]); fail('Campaign not found', 404);
        case 'wag_camp_action':
            $u = need($SALES); $d = wag_load(); $do = (string)($in['do'] ?? ''); $hit = null;
            foreach ($d['camps'] as $i => &$c) if ($c['id'] === (string)($in['id'] ?? '')) {
                if ($do === 'cancel' && in_array($c['status'], ['draft', 'scheduled', 'sending', 'paused'], true)) { $c['status'] = 'cancelled'; foreach ($c['rcp'] as &$r) if ($r['s'] === 'queued') $r['s'] = 'skipped'; unset($r); }
                elseif ($do === 'pause' && in_array($c['status'], ['sending', 'scheduled'], true)) $c['status'] = 'paused';
                elseif (($do === 'resume' || $do === 'start') && in_array($c['status'], ['paused', 'draft'], true)) { $cc = crm_cfg(); if (!($cc['waToken'] && $cc['waPhoneId'])) fail('Connect WhatsApp first'); $c['status'] = 'sending'; unset($c['error']); }
                elseif ($do === 'retry') { foreach ($c['rcp'] as &$r) if ($r['s'] === 'failed') { $r['s'] = 'queued'; unset($r['e']); } unset($r); if (in_array($c['status'], ['done', 'paused'], true)) $c['status'] = 'sending'; }
                elseif ($do === 'delete' && !in_array($c['status'], ['sending', 'scheduled'], true)) { $hit = 'del'; unset($d['camps'][$i]); break; }
                else fail('That action is not possible now');
                $hit = $c; break;
            } unset($c);
            if (!$hit) fail('Campaign not found', 404); $d['camps'] = array_values($d['camps']); wag_save($d); log_act($u, 'wa.campaign.' . $do, (string)$in['id']);
            if (in_array($do, ['resume', 'start', 'retry'], true)) wag_tick();
            out(['ok' => true]);
        case 'wag_flows_save':
            $u = need($OA); $d = wag_load();
            foreach ((array)($in['flows'] ?? []) as $k => $f) { if (!isset(WAG_FLOWS[$k]) || !is_array($f)) continue;
                $t = wag_tpl($d, (string)($f['tpl'] ?? '')); $mailOk = !empty($f['mail']) && trim((string)($f['body'] ?? '')) !== ''; if (!empty($f['on']) && !$t && !$mailOk) fail(WAG_FLOWS[$k] . ': choose a template or write the backup email');
                $d['flows'][$k]['mail'] = !empty($f['mail']); $d['flows'][$k]['subject'] = clip($f['subject'] ?? '', 120); $d['flows'][$k]['body'] = mb_substr(trim(strip_tags((string)($f['body'] ?? ''))), 0, 2000);
                $d['flows'][$k] = array_merge($d['flows'][$k], ['on' => !empty($f['on']), 'tpl' => $t ? $t['id'] : '', 'days' => max(0, min(30, (int)($f['days'] ?? $d['flows'][$k]['days']))), 'params' => $t ? array_pad(array_slice(array_map(fn($p) => clip($p, 200), (array)($f['params'] ?? $t['params'])), 0, count($t['params'])), count($t['params']), '{name}') : []]); }
            if (isset($in['cfg'])) { $cf = (array)$in['cfg']; $d['cfg']['dailyCap'] = max(1, min(100000, (int)($cf['dailyCap'] ?? 250))); $d['cfg']['perTick'] = max(1, min(200, (int)($cf['perTick'] ?? 25)));
                foreach (['quietFrom', 'quietTo'] as $k) { $v = (string)($cf[$k] ?? ''); $d['cfg'][$k] = preg_match('~^\d\d:\d\d$~', $v) ? $v : ''; } }
            wag_save($d); log_act($u, 'wa.flows', ''); out(['ok' => true, 'flows' => $d['flows'], 'cfg' => $d['cfg']]);
        case 'wag_optout':
            $u = need($SALES); $d = wag_load(); $p = wag_phone((string)($in['phone'] ?? '')); if (!$p) fail('Enter a valid phone number');
            if (!empty($in['remove'])) unset($d['optout'][$p]); else $d['optout'][$p] = now(); wag_save($d); out(['ok' => true, 'optout' => count($d['optout'])]);
        case 'wag_optout_list':
            need($SALES); $d = wag_load(); arsort($d['optout']); out(['ok' => true, 'list' => array_map(fn($p, $t) => ['phone' => '+' . $p, 't' => $t], array_keys($d['optout']), array_values($d['optout']))]);
        case 'wag_tick':
            need($SALES); out(['ok' => true] + wag_tick());
        case 'wag_test':
            need($OA); $d = wag_load(); $t = wag_tpl($d, (string)($in['tpl'] ?? '')); if (!$t) fail('Choose a template'); $p = wag_phone((string)($in['phone'] ?? '')); if (!$p) fail('Enter your WhatsApp number');
            $r = wag_send_tpl($p, $t, wag_fill((array)($in['params'] ?? $t['params']), ['n' => 'Test Customer', 'co' => 'Test Co', 'city' => 'Lahore', 'ref' => 'WI-10100', 'amount' => 250000, 'date' => date('j M Y'), 'time' => '11:00 am']));
            if (!$r['ok']) fail($r['error']); out(['ok' => true]);
    }
    return false;
}
