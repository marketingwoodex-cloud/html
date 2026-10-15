<?php
/**
 * P17 — Booking system (site visit / office meeting / online call).
 * Public (via api/forms.php): book_cfg, book_slots, book_create → creates a lead (source "booking") + a pending booking.
 * Team (via api/admin.php):  bk_list, bk_save, bk_status, bk_cfg, bk_cfg_save. Daily cron: bk_remind() (day-before reminders).
 * Settings: _private/booking.json. Table: wx_bookings. Times are Asia/Karachi.
 */
declare(strict_types=1);

const BK_FILE = PRIVATE_DIR . '/booking.json';
const BK_STATUS = ['pending' => 'Waiting for approval', 'confirmed' => 'Confirmed', 'done' => 'Done', 'cancelled' => 'Cancelled', 'noshow' => 'No-show'];
const BK_DEF = [
    'on' => true,
    'types' => [
        ['k' => 'visit', 'label' => 'Site visit', 'dur' => 60, 'on' => true, 'hint' => 'Our designer visits your home, office or site to measure and discuss.'],
        ['k' => 'office', 'label' => 'Office meeting', 'dur' => 60, 'on' => true, 'hint' => 'Meet the team at our Lahore studio and see materials.'],
        ['k' => 'online', 'label' => 'Online call', 'dur' => 30, 'on' => true, 'hint' => 'A video or WhatsApp call to talk through your project.'],
    ],
    'days' => [1, 2, 3, 4, 5, 6], 'open' => '10:00', 'last' => '18:30', 'step' => 60,
    'maxDay' => 3, 'minHours' => 12, 'ahead' => 30,
    'areas' => ['Lahore', 'Other city (on request)'],
    'blocked' => [],
];

function bk_tz(): DateTimeZone { static $z = null; return $z ?: ($z = new DateTimeZone('Asia/Karachi')); }
function bk_now(): DateTimeImmutable { return new DateTimeImmutable('now', bk_tz()); }
function bk_cfg(): array {
    $c = array_replace(BK_DEF, jread(BK_FILE));
    $c['types'] = array_values(array_filter((array)$c['types'], fn($t) => is_array($t) && !empty($t['k'])));
    return $c;
}
function bk_type(array $c, string $k): ?array { foreach ($c['types'] as $t) if ($t['k'] === $k) return $t; return null; }
function bk_migrate(): void {
    static $d = false; if ($d) return; $d = true;
    q("CREATE TABLE IF NOT EXISTS wx_bookings (id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL, lead_id INT NULL, name VARCHAR(120) NOT NULL, phone VARCHAR(40) NOT NULL,
        email VARCHAR(190) NULL, type VARCHAR(20) NOT NULL, city VARCHAR(80) NULL, address VARCHAR(300) NULL, d DATE NOT NULL, tm CHAR(5) NOT NULL, dur SMALLINT NOT NULL DEFAULT 60,
        status VARCHAR(12) NOT NULL DEFAULT 'pending', staff_id INT NULL, note VARCHAR(1000) NULL, src VARCHAR(12) NULL, reminded TINYINT NOT NULL DEFAULT 0, INDEX (d)) DEFAULT CHARSET=utf8mb4");
}
function bk_min(string $hm): int { [$h, $m] = array_map('intval', explode(':', $hm . ':0')); return $h * 60 + $m; }
function bk_hm(int $m): string { return sprintf('%02d:%02d', intdiv($m, 60), $m % 60); }
function bk_label(string $d, string $tm): string { $t = DateTimeImmutable::createFromFormat('Y-m-d H:i', "$d $tm", bk_tz()); return $t ? $t->format('D j M, g:i a') : "$d $tm"; }

/** Why a date is closed ('' = open). */
function bk_day_closed(array $c, string $d): string {
    $t = DateTimeImmutable::createFromFormat('!Y-m-d', $d, bk_tz()); if (!$t || $t->format('Y-m-d') !== $d) return 'Invalid date';
    $today = bk_now()->setTime(0, 0);
    if ($t < $today) return 'Past date';
    if ($t > $today->modify('+' . (int)$c['ahead'] . ' days')) return 'Too far ahead';
    if (!in_array((int)$t->format('N'), array_map('intval', (array)$c['days']), true)) return 'Closed';
    if (in_array($d, (array)$c['blocked'], true)) return 'Closed';
    return '';
}
/** Free start times for a date and booking length. $skip = booking id being edited. */
function bk_free(array $c, string $d, int $dur, int $skip = 0, bool $team = false): array {
    if (!$team && bk_day_closed($c, $d) !== '') return [];
    bk_migrate();
    $rows = q("SELECT id,tm,dur FROM wx_bookings WHERE d=? AND status IN ('pending','confirmed') AND id<>?", [$d, $skip])->fetchAll();
    if (!$team && count($rows) >= (int)$c['maxDay']) return [];
    $earliest = bk_now()->modify('+' . (int)$c['minHours'] . ' hours'); $out = [];
    for ($m = bk_min($c['open']); $m <= bk_min($c['last']); $m += max(15, (int)$c['step'])) {
        $s = DateTimeImmutable::createFromFormat('Y-m-d H:i', $d . ' ' . bk_hm($m), bk_tz());
        if (!$team && $s < $earliest) continue;
        $clash = false; foreach ($rows as $r) { $a = bk_min($r['tm']); if ($m < $a + (int)$r['dur'] && $a < $m + $dur) { $clash = true; break; } }
        if (!$clash) $out[] = bk_hm($m);
    }
    return $out;
}
function bk_pub_cfg(array $c): array {
    $days = []; $t = bk_now()->setTime(0, 0); $min = 480; foreach ($c['types'] as $x) if (!empty($x['on'])) $min = min($min, (int)$x['dur']);
    for ($i = 0; $i <= (int)$c['ahead']; $i++) { $d = $t->modify("+$i days")->format('Y-m-d'); $days[$d] = bk_day_closed($c, $d) === '' && bk_free($c, $d, $min) ? 1 : 0; } // 0 = closed or fully booked
    return ['ok' => true, 'on' => (bool)$c['on'], 'types' => array_values(array_map(fn($x) => ['k' => $x['k'], 'label' => $x['label'], 'dur' => (int)$x['dur'], 'hint' => $x['hint'] ?? ''], array_filter($c['types'], fn($x) => !empty($x['on'])))),
        'areas' => array_values($c['areas']), 'days' => $days, 'today' => $t->format('Y-m-d')];
}

/** Public actions (called from api/forms.php before the normal enquiry code). */
function booking_public(array $in): void {
    $a = (string)($in['action'] ?? ''); $c = bk_cfg();
    if ($a === 'book_cfg') out(bk_pub_cfg($c));
    if (!$c['on']) fail('Online booking is closed right now. Please WhatsApp us.', 503);
    if ($a === 'book_slots') {
        $t = bk_type($c, (string)($in['type'] ?? 'visit')); if (!$t || empty($t['on'])) fail('Choose what you want to book');
        out(['ok' => true, 'slots' => bk_free($c, (string)($in['date'] ?? ''), (int)$t['dur'])]);
    }
    if ($a !== 'book_create') fail('Unknown action', 404);
    if (clip($in['_hp'] ?? '') !== '') out(['ok' => true, 'id' => 0]);
    crm_migrate(); bk_migrate();
    $key = 'book:' . ip(); $th = q('SELECT n,t FROM wx_throttle WHERE ip=?', [$key])->fetch();
    if ($th && time() - (int)$th['t'] < 600 && (int)$th['n'] >= 3) fail('Too many bookings from this connection. Please WhatsApp us instead.', 429);
    if (!$th || time() - (int)$th['t'] >= 600) q('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,1,?)', [$key, time()]); else q('UPDATE wx_throttle SET n=n+1 WHERE ip=?', [$key]);
    $t = bk_type($c, (string)($in['type'] ?? '')); if (!$t || empty($t['on'])) fail('Choose what you want to book');
    $name = clip($in['name'] ?? '', 120); $phone = clip($in['phone'] ?? '', 40); $email = clip($in['email'] ?? '', 190);
    if (mb_strlen($name) < 2) fail('Please enter your name');
    if (!preg_match('~^[+\d][\d\s()-]{6,}$~', $phone)) fail('Please enter a valid phone number');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please check your email address');
    $city = clip($in['city'] ?? '', 80); $addr = clip($in['address'] ?? '', 300); $note = clip($in['note'] ?? '', 1000); $svc = clip($in['service'] ?? '', 120);
    if ($t['k'] === 'visit' && mb_strlen($addr) < 4) fail('Please enter the site address');
    $d = (string)($in['date'] ?? ''); $tm = (string)($in['time'] ?? '');
    db()->beginTransaction();
    try {
        q('SELECT id FROM wx_bookings WHERE d=? FOR UPDATE', [$d]);
        if (!in_array($tm, bk_free($c, $d, (int)$t['dur']), true)) { db()->rollBack(); fail('Sorry, that time was just taken — please pick another.', 409); }
        $when = bk_label($d, $tm);
        $fields = ['booking' => $t['label'] . ' · ' . $when, 'city' => $city, 'address' => $addr];
        q("INSERT INTO wx_leads (created_at,source,page,name,phone,email,service,message,fields,stage,is_read,ip) VALUES (?,?,?,?,?,?,?,?,?,'visit',0,?)",
            [now(), 'booking', clip($in['page'] ?? '/book-a-visit/', 200), $name, $phone, $email, $svc ?: $t['label'], $note, json_encode(array_filter($fields), JSON_UNESCAPED_UNICODE), ip()]);
        $lid = (int)db()->lastInsertId();
        q('INSERT INTO wx_bookings (created_at,lead_id,name,phone,email,type,city,address,d,tm,dur,status,note,src) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [now(), $lid, $name, $phone, $email ?: null, $t['k'], $city, $addr, $d, $tm, (int)$t['dur'], 'pending', $note, 'web']);
        $bid = (int)db()->lastInsertId();
        db()->commit();
    } catch (PDOException $e) { if (db()->inTransaction()) db()->rollBack(); throw $e; }
    try { q('UPDATE wx_leads SET next_at=?, next_type=?, followup=? WHERE id=?', ["$d $tm:00", $t['k'] === 'visit' ? 'visit' : 'meeting', $d, $lid]); } catch (Throwable $e) { /* S17 columns not migrated yet */ }
    echo json_encode(['ok' => true, 'id' => $bid, 'when' => $when, 'type' => $t['label']]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else { @ob_end_flush(); @flush(); }
    ignore_user_abort(true);
    try { send_alerts(['id' => $lid, 'source' => 'booking', 'page' => '/book-a-visit/', 'name' => $name, 'phone' => $phone, 'email' => $email, 'service' => $t['label'] . ' — ' . $when, 'message' => $note, 'fields' => $fields]); } catch (Throwable $e) { error_log('booking alerts: ' . $e->getMessage()); }
    exit;
}

function bk_row(array $r, array $c, array $team): array {
    $t = bk_type($c, $r['type']);
    return ['id' => (int)$r['id'], 'lead_id' => (int)$r['lead_id'], 'name' => $r['name'], 'phone' => $r['phone'], 'email' => (string)$r['email'], 'type' => $r['type'], 'type_label' => $t['label'] ?? $r['type'],
        'city' => (string)$r['city'], 'address' => (string)$r['address'], 'd' => $r['d'], 'tm' => $r['tm'], 'dur' => (int)$r['dur'], 'status' => $r['status'], 'staff_id' => (int)$r['staff_id'],
        'staff' => $team[(int)$r['staff_id']] ?? '', 'note' => (string)$r['note'], 'src' => (string)$r['src'], 'created_at' => $r['created_at'], 'when' => bk_label($r['d'], $r['tm'])];
}
function bk_notify(array $r, string $ev): array {
    if (!is_file(__DIR__ . '/notify-lib.php')) return [];
    require_once __DIR__ . '/notify-lib.php'; $c = bk_cfg(); $t = bk_type($c, $r['type']);
    $where = $r['type'] === 'visit' ? ($r['address'] ?: $r['city']) : ($r['type'] === 'online' ? 'online call' : 'our studio');
    return notify_client($ev, ['name' => $r['name'], 'phone' => $r['phone'], 'email' => (string)$r['email'], 'ref' => ($t['label'] ?? 'Meeting') . ' on ' . bk_label($r['d'], $r['tm']), 'project' => $where]);
}
/** Day-before reminders for confirmed bookings (from the daily cron). */
function bk_remind(): int {
    bk_migrate(); $n = 0; $tom = bk_now()->modify('+1 day')->format('Y-m-d');
    foreach (q("SELECT * FROM wx_bookings WHERE d=? AND status='confirmed' AND reminded=0", [$tom])->fetchAll() as $r) { bk_notify($r, 'remind'); q('UPDATE wx_bookings SET reminded=1 WHERE id=?', [$r['id']]); $n++; }
    return $n;
}

function booking_actions(string $action, array $in): bool {
    if (!in_array($action, ['bk_list', 'bk_save', 'bk_status', 'bk_cfg', 'bk_cfg_save', 'bk_slots'], true)) return false;
    $c = bk_cfg(); bk_migrate();
    $team = []; foreach (q("SELECT id,name FROM wx_users WHERE active=1 AND role IN ('owner','admin','sales') ORDER BY name")->fetchAll() as $u) $team[(int)$u['id']] = $u['name'];
    switch ($action) {
        case 'bk_list':
            need(['owner', 'admin', 'sales']);
            $from = preg_match('~^\d{4}-\d{2}-\d{2}$~', (string)($in['from'] ?? '')) ? $in['from'] : bk_now()->modify('-7 days')->format('Y-m-d');
            $to = preg_match('~^\d{4}-\d{2}-\d{2}$~', (string)($in['to'] ?? '')) ? $in['to'] : bk_now()->modify('+60 days')->format('Y-m-d');
            $rows = q('SELECT * FROM wx_bookings WHERE d BETWEEN ? AND ? ORDER BY d,tm', [$from, $to])->fetchAll();
            $pend = q("SELECT * FROM wx_bookings WHERE status='pending' AND d>=? ORDER BY d,tm", [bk_now()->format('Y-m-d')])->fetchAll();
            out(['ok' => true, 'items' => array_map(fn($r) => bk_row($r, $c, $team), $rows), 'pending' => array_map(fn($r) => bk_row($r, $c, $team), $pend),
                'team' => array_map(fn($k, $v) => ['id' => $k, 'name' => $v], array_keys($team), $team), 'status' => BK_STATUS, 'cfg' => $c, 'today' => bk_now()->format('Y-m-d')]);
        case 'bk_slots':
            need(['owner', 'admin', 'sales']); $t = bk_type($c, (string)($in['type'] ?? 'visit'));
            out(['ok' => true, 'slots' => bk_free($c, (string)($in['date'] ?? ''), (int)($t['dur'] ?? 60), (int)($in['id'] ?? 0), true), 'closed' => bk_day_closed($c, (string)($in['date'] ?? ''))]);
        case 'bk_save':
            $u = need(['owner', 'admin', 'sales']); $id = (int)($in['id'] ?? 0);
            $t = bk_type($c, (string)($in['type'] ?? '')); if (!$t) fail('Choose a booking type');
            $d = (string)($in['d'] ?? ''); $tm = (string)($in['tm'] ?? '');
            if (!DateTimeImmutable::createFromFormat('!Y-m-d', $d) || !preg_match('~^([01]\d|2[0-3]):[0-5]\d$~', $tm)) fail('Choose a date and time');
            $name = clip($in['name'] ?? '', 120); $phone = clip($in['phone'] ?? '', 40); if (mb_strlen($name) < 2 || $phone === '') fail('Name and phone are required');
            $dur = max(15, min(480, (int)($in['dur'] ?? $t['dur'])));
            if (empty($in['force'])) {
                foreach (q("SELECT name,tm,dur FROM wx_bookings WHERE d=? AND id<>? AND status IN ('pending','confirmed')", [$d, $id])->fetchAll() as $r) {
                    $a = bk_min($r['tm']); if (bk_min($tm) < $a + (int)$r['dur'] && $a < bk_min($tm) + $dur) out(['ok' => false, 'clash' => true, 'error' => 'Clashes with ' . $r['name'] . ' at ' . $r['tm']]);
                }
            }
            $staff = (int)($in['staff_id'] ?? 0) ?: null; if ($staff && !isset($team[$staff])) fail('Unknown team member');
            $st = (string)($in['status'] ?? 'confirmed'); if (!isset(BK_STATUS[$st])) $st = 'confirmed';
            $vals = [$name, $phone, clip($in['email'] ?? '', 190) ?: null, $t['k'], clip($in['city'] ?? '', 80), clip($in['address'] ?? '', 300), $d, $tm, $dur, $staff, clip($in['note'] ?? '', 1000)];
            if ($id) {
                $old = q('SELECT * FROM wx_bookings WHERE id=?', [$id])->fetch(); if (!$old) fail('Booking not found', 404);
                q('UPDATE wx_bookings SET name=?,phone=?,email=?,type=?,city=?,address=?,d=?,tm=?,dur=?,staff_id=?,note=?' . ($old['d'] !== $d || $old['tm'] !== $tm ? ',reminded=0' : '') . ' WHERE id=?', array_merge($vals, [$id]));
            } else {
                $lid = (int)($in['lead_id'] ?? 0) ?: null;
                q('INSERT INTO wx_bookings (name,phone,email,type,city,address,d,tm,dur,staff_id,note,created_at,lead_id,status,src) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array_merge($vals, [now(), $lid, $st, 'team']));
                $id = (int)db()->lastInsertId();
            }
            $r = q('SELECT * FROM wx_bookings WHERE id=?', [$id])->fetch();
            if (!empty($r['lead_id'])) { try { q('UPDATE wx_leads SET next_at=?, next_type=?, followup=? WHERE id=?', ["$d $tm:00", $t['k'] === 'visit' ? 'visit' : 'meeting', $d, $r['lead_id']]); } catch (Throwable $e) {} }
            $sent = (!empty($in['notify']) && $r['status'] === 'confirmed') ? bk_notify($r, 'booking') : [];
            log_act($u, 'booking.save', '#' . $id . ' ' . $d . ' ' . $tm); out(['ok' => true, 'item' => bk_row($r, $c, $team), 'sent' => $sent]);
        case 'bk_status':
            $u = need(['owner', 'admin', 'sales']); $id = (int)($in['id'] ?? 0); $st = (string)($in['status'] ?? '');
            if (!isset(BK_STATUS[$st])) fail('Unknown status');
            $r = q('SELECT * FROM wx_bookings WHERE id=?', [$id])->fetch(); if (!$r) fail('Booking not found', 404);
            q('UPDATE wx_bookings SET status=? WHERE id=?', [$st, $id]); $r['status'] = $st;
            if (!empty($r['lead_id'])) {
                $note = 'Booking ' . bk_label($r['d'], $r['tm']) . ': ' . BK_STATUS[$st];
                try { q('INSERT INTO wx_lead_notes (lead_id,t,user_name,text) VALUES (?,?,?,?)', [$r['lead_id'], now(), $u['name'] ?? '', $note]); } catch (Throwable $e) { /* notes table differs */ }
            }
            $sent = ($st === 'confirmed' && ($in['notify'] ?? true)) ? bk_notify($r, 'booking') : [];
            log_act($u, 'booking.status', '#' . $id . ' ' . $st); out(['ok' => true, 'item' => bk_row($r, $c, $team), 'sent' => $sent]);
        case 'bk_cfg':
            need(['owner', 'admin', 'sales']); out(['ok' => true, 'cfg' => $c]);
        case 'bk_cfg_save':
            $u = need(['owner', 'admin']); $s = (array)($in['cfg'] ?? []); $n = $c;
            if (array_key_exists('on', $s)) $n['on'] = !empty($s['on']);
            foreach (['open', 'last'] as $k) if (isset($s[$k])) { if (!preg_match('~^([01]\d|2[0-3]):[0-5]\d$~', (string)$s[$k])) fail('Check the opening hours'); $n[$k] = $s[$k]; }
            if (bk_min($n['last']) < bk_min($n['open'])) fail('Last slot must be after opening time');
            foreach (['step' => [15, 240], 'maxDay' => [1, 30], 'minHours' => [0, 168], 'ahead' => [1, 180]] as $k => $r) if (isset($s[$k])) $n[$k] = max($r[0], min($r[1], (int)$s[$k]));
            if (isset($s['days'])) $n['days'] = array_values(array_unique(array_filter(array_map('intval', (array)$s['days']), fn($x) => $x >= 1 && $x <= 7)));
            if (isset($s['areas'])) $n['areas'] = array_slice(array_values(array_filter(array_map(fn($x) => clip($x, 60), (array)$s['areas']))), 0, 30);
            if (isset($s['blocked'])) $n['blocked'] = array_slice(array_values(array_unique(array_filter((array)$s['blocked'], fn($x) => is_string($x) && preg_match('~^\d{4}-\d{2}-\d{2}$~', $x)))), 0, 200);
            if (isset($s['types'])) {
                $ty = []; foreach (array_slice((array)$s['types'], 0, 8) as $x) { $k = preg_replace('~[^a-z0-9]~', '', strtolower((string)($x['k'] ?? ''))); $l = clip($x['label'] ?? '', 40); if ($k === '' || $l === '') continue;
                    $ty[] = ['k' => substr($k, 0, 20), 'label' => $l, 'dur' => max(15, min(480, (int)($x['dur'] ?? 60))), 'on' => !empty($x['on']), 'hint' => clip($x['hint'] ?? '', 160)]; }
                if (!$ty) fail('Keep at least one booking type'); $n['types'] = $ty;
            }
            jwrite(BK_FILE, $n); log_act($u, 'booking.settings', ''); out(['ok' => true, 'cfg' => $n]);
    }
    return false;
}
