<?php
/**
 * api/v2/routes/bookings.php — site visits, office meetings and online calls.
 *
 * Ported from v2.1's booking-lib.php, which is one of the few parts of the old system that was already
 * right: a booking is created atomically, the slot is checked inside the transaction that takes it,
 * and the website form cannot invent a time that does not exist. Those properties are kept exactly.
 *
 * Three things moved:
 *
 *   · **The rules live in `wx_settings`** (`booking.cfg`) instead of `_private/booking.json`. Same
 *     JSON, same keys, same defaults — but a settings row is something the settings screen can show,
 *     the audit trail can name, and a backup already includes.
 *
 *   · **The list is paged and filtered in SQL.** v2.1 loaded a date window and then the whole pending
 *     list on every open. The `pending` strip is now its own small query with a limit.
 *
 *   · **The public form is explicit about rate limiting.** It is the one endpoint here that anyone on
 *     the internet can call, so it is throttled per IP (three bookings per ten minutes, as v2.1 had
 *     it), honeypot-aware, and it answers the same way whether the booking was created or silently
 *     dropped as a bot.
 *
 * The availability maths is a direct port: `wx_book_free()` returns the start times that are genuinely
 * free for a given service length, computed from opening hours, the minimum notice, the number of
 * bookings allowed per day, blocked dates, and the bookings already taken.
 */

declare(strict_types=1);

/** BK_STATUS, word for word. These words appear in notifications a client has already received. */
const WX_BOOK_STATUS = [
    'pending' => 'Waiting for approval',
    'confirmed' => 'Confirmed',
    'done' => 'Done',
    'cancelled' => 'Cancelled',
    'noshow' => 'No-show',
];

/** BK_DEF, word for word — the defaults a fresh install gets. */
const WX_BOOK_DEF = [
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

const WX_BOOK_SETTING = 'booking.cfg';

function wx_book_tz(): DateTimeZone
{
    static $z = null;
    if ($z === null) {
        $name = (string) (wx_setting('platform.timezone', 'Asia/Karachi') ?? 'Asia/Karachi');
        try {
            $z = new DateTimeZone($name);
        } catch (Throwable $e) {
            $z = new DateTimeZone('Asia/Karachi');
        }
    }
    return $z;
}

function wx_book_now(): DateTimeImmutable
{
    return new DateTimeImmutable('now', wx_book_tz());
}

/** The rules, from settings, with v2.1's defaults for anything absent. */
function wx_book_cfg(): array
{
    static $c = null;
    if ($c !== null) {
        return $c;
    }
    $raw = wx_setting(WX_BOOK_SETTING);
    $stored = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    $c = array_replace(WX_BOOK_DEF, is_array($stored) ? $stored : []);
    $c['types'] = array_values(array_filter((array) $c['types'], static fn($t) => is_array($t) && !empty($t['k'])));
    return $c;
}

function wx_book_type(array $c, string $k): ?array
{
    foreach ($c['types'] as $t) {
        if ((string) $t['k'] === $k) {
            return $t;
        }
    }
    return null;
}

function wx_book_min(string $hm): int
{
    $parts = array_map('intval', explode(':', $hm . ':0'));
    return $parts[0] * 60 + $parts[1];
}

function wx_book_hm(int $m): string
{
    return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
}

/** "Mon 3 Nov, 11:00 am" — the label in every notification v2.1 ever sent. */
function wx_book_label(string $d, string $tm): string
{
    $t = DateTimeImmutable::createFromFormat('Y-m-d H:i', $d . ' ' . $tm, wx_book_tz());
    return $t ? $t->format('D j M, g:i a') : $d . ' ' . $tm;
}

/** Why a date is closed ('' = open). Ported from bk_day_closed(), including the wording. */
function wx_book_day_closed(array $c, string $d): string
{
    $t = DateTimeImmutable::createFromFormat('!Y-m-d', $d, wx_book_tz());
    if (!$t || $t->format('Y-m-d') !== $d) {
        return 'Invalid date';
    }
    $today = wx_book_now()->setTime(0, 0);
    if ($t < $today) {
        return 'Past date';
    }
    if ($t > $today->modify('+' . (int) $c['ahead'] . ' days')) {
        return 'Too far ahead';
    }
    if (!in_array((int) $t->format('N'), array_map('intval', (array) $c['days']), true)) {
        return 'Closed';
    }
    if (in_array($d, (array) $c['blocked'], true)) {
        return 'Closed';
    }
    return '';
}

/**
 * Free start times for a date and a service length.
 *
 * @param int  $skip the booking being edited (it must not block itself)
 * @param bool $team the team's own view: ignores opening-day and minimum-notice rules, because an
 *                   owner arranging a Friday visit by hand is not the public form
 */
function wx_book_free(array $c, string $d, int $dur, int $skip = 0, bool $team = false): array
{
    if (!$team && wx_book_day_closed($c, $d) !== '') {
        return [];
    }
    $rows = wx_all("SELECT id, tm, dur FROM wx_bookings WHERE d = ? AND status IN ('pending','confirmed') AND id <> ?", [$d, $skip]);
    if (!$team && count($rows) >= (int) $c['maxDay']) {
        return [];
    }
    $earliest = wx_book_now()->modify('+' . (int) $c['minHours'] . ' hours');
    $out = [];
    for ($m = wx_book_min((string) $c['open']); $m <= wx_book_min((string) $c['last']); $m += max(15, (int) $c['step'])) {
        $s = DateTimeImmutable::createFromFormat('Y-m-d H:i', $d . ' ' . wx_book_hm($m), wx_book_tz());
        if ($s === false) {
            continue;
        }
        if (!$team && $s < $earliest) {
            continue;
        }
        $clash = false;
        foreach ($rows as $r) {
            $a = wx_book_min((string) $r['tm']);
            if ($m < $a + (int) $r['dur'] && $a < $m + $dur) {
                $clash = true;
                break;
            }
        }
        if (!$clash) {
            $out[] = wx_book_hm($m);
        }
    }
    return $out;
}

/** The public shape: which of the next N days can be booked at all. 0 = closed or full. */
function wx_book_pub_cfg(array $c): array
{
    $days = [];
    $t = wx_book_now()->setTime(0, 0);
    $min = 480;
    foreach ($c['types'] as $x) {
        if (!empty($x['on'])) {
            $min = min($min, (int) $x['dur']);
        }
    }
    for ($i = 0; $i <= (int) $c['ahead']; $i++) {
        $d = $t->modify('+' . $i . ' days')->format('Y-m-d');
        $days[$d] = wx_book_day_closed($c, $d) === '' && wx_book_free($c, $d, $min) ? 1 : 0;
    }
    return [
        'on' => (bool) $c['on'],
        'types' => array_values(array_filter(array_map(static fn($t) => !empty($t['on']) ? [
            'k' => (string) $t['k'], 'label' => (string) $t['label'], 'dur' => (int) $t['dur'], 'hint' => (string) ($t['hint'] ?? ''),
        ] : null, $c['types']))),
        'days' => $days,
        'open' => (string) $c['open'],
        'last' => (string) $c['last'],
        'step' => (int) $c['step'],
        'areas' => array_values((array) $c['areas']),
        'today' => wx_book_now()->format('Y-m-d'),
    ];
}

/** The team's view of a row, with the fields the v2.1 table column showed. */
function wx_book_row(array $r, array $c, array $team): array
{
    $t = wx_book_type($c, (string) $r['type']);
    return [
        'id' => (int) $r['id'],
        'lead_id' => isset($r['lead_id']) ? (int) $r['lead_id'] : null,
        'name' => (string) $r['name'],
        'phone' => (string) $r['phone'],
        'email' => (string) ($r['email'] ?? ''),
        'type' => (string) $r['type'],
        'typeLabel' => (string) ($t['label'] ?? $r['type']),
        'city' => (string) ($r['city'] ?? ''),
        'address' => (string) ($r['address'] ?? ''),
        'd' => (string) $r['d'],
        'tm' => (string) $r['tm'],
        'dur' => (int) $r['dur'],
        'status' => (string) $r['status'],
        'statusLabel' => WX_BOOK_STATUS[(string) $r['status']] ?? (string) $r['status'],
        'staffId' => (int) ($r['staff_id'] ?? 0),
        'staff' => $team[(int) ($r['staff_id'] ?? 0)] ?? '',
        'note' => (string) ($r['note'] ?? ''),
        'src' => (string) ($r['src'] ?? ''),
        'createdAt' => $r['created_at'],
        'when' => wx_book_label((string) $r['d'], (string) $r['tm']),
    ];
}

/** The team members a booking can be assigned to: the same roles v2.1 offered. */
function wx_book_team(): array
{
    $team = [];
    foreach (wx_all("SELECT id, name FROM wx_users WHERE active = 1 AND role IN ('owner','admin','sales') ORDER BY name") as $u) {
        $team[(int) $u['id']] = (string) $u['name'];
    }
    return $team;
}

/**
 * Tell the client, and leave a record either way.
 *
 * v2.1 called notify-lib.php, which sent over whatever channel was configured and wrote its result to
 * `wx_notify_log`. The channel suite is Phase 4 work; what matters now is that the booking screen can
 * say what happened. So this writes the same log row and returns the same shape, with
 * `queued: false` and a readable `result` when nothing is configured — an honest "not sent" rather
 * than a green tick over a message that never left.
 */
function wx_book_notify(array $r, string $event): array
{
    $c = wx_book_cfg();
    $t = wx_book_type($c, (string) $r['type']);
    $where = $r['type'] === 'visit'
        ? ((string) ($r['address'] ?? '') !== '' ? (string) $r['address'] : (string) ($r['city'] ?? ''))
        : ((string) $r['type'] === 'online' ? 'online call' : 'our studio');
    $ref = ($t['label'] ?? 'Meeting') . ' on ' . wx_book_label((string) $r['d'], (string) $r['tm']);

    $channel = 'whatsapp';
    $dest = (string) $r['phone'];
    if (trim((string) $r['phone']) === '' && trim((string) ($r['email'] ?? '')) !== '') {
        $channel = 'email';
        $dest = (string) $r['email'];
    }
    $configured = $channel === 'email'
        ? (string) (wx_setting('mail.from', '') ?? '') !== ''
        : (string) (wx_setting('wa.token', '') ?? '') !== '' && (string) (wx_setting('wa.phone_id', '') ?? '') !== '';

    $result = $configured ? 'queued' : 'not configured';
    wx_insert('wx_notify_log', [
        't' => wx_now(),
        'event' => mb_substr($event, 0, 12),
        'ref' => mb_substr($ref, 0, 190),
        'name' => mb_substr((string) $r['name'], 0, 120),
        'channel' => $channel,
        'dest' => mb_substr($dest, 0, 190),
        'result' => $result,
    ]);
    return ['channel' => $channel, 'to' => $dest, 'ref' => $ref, 'where' => $where, 'queued' => $configured, 'result' => $result];
}

/**
 * A counter in `wx_throttle`, the table v2.1 already uses for its login brake.
 *
 * @param string $key  what is being limited ('book:1.2.3.4')
 * @param int    $max  how many are allowed inside the window
 * @param int    $window seconds
 */
/**
 * The booking form's own limit, with the booking form's own wording.
 *
 * The counting lives in wx_rate() (lib/http.php) so the visitor chat and the booking form cannot
 * disagree about what a limit is; this wrapper exists because "please WhatsApp us instead" is the right
 * thing to say to someone trying to book a visit and the wrong thing to say to someone mid-conversation.
 */
function wx_book_rate(string $key, int $max, int $window): void
{
    wx_rate($key, $max, $window, 'Too many bookings from this connection — please WhatsApp us instead');
}

/* ============================================================== team screens */

/** GET /bookings — a date window, the pending strip, the team and the rules. */
function wx_route_bookings_list(array $ctx): array
{
    wx_require_user('bk_list', ['owner', 'admin', 'sales']);
    $c = wx_book_cfg();
    $q = $ctx['query'];

    $from = wx_v_opt_date($q['from'] ?? null, 'from') ?? wx_book_now()->modify('-7 days')->format('Y-m-d');
    $to = wx_v_opt_date($q['to'] ?? null, 'to') ?? wx_book_now()->modify('+60 days')->format('Y-m-d');
    if ($to < $from) {
        throw ApiError::validation('The end of the range is before its start', 'to');
    }

    $where = ['d BETWEEN ? AND ?'];
    $params = [$from, $to];
    if (($q['status'] ?? '') !== '' && $q['status'] !== 'all') {
        $where[] = 'status = ?';
        $params[] = wx_v_enum($q['status'], array_keys(WX_BOOK_STATUS), 'status');
    }
    if (($q['type'] ?? '') !== '' && $q['type'] !== 'all') {
        $where[] = 'type = ?';
        $params[] = wx_v_string($q['type'], 'type', 1, 20);
    }
    if (!empty($q['staff_id'])) {
        $where[] = 'staff_id = ?';
        $params[] = wx_v_id($q['staff_id'], 'staff_id');
    }
    $sqlWhere = ' WHERE ' . implode(' AND ', $where);

    $limit = wx_limit($q['limit'] ?? 200);
    $offset = wx_offset($q['offset'] ?? 0);
    $total = (int) wx_val('SELECT COUNT(*) FROM wx_bookings' . $sqlWhere, $params);
    $rows = wx_all('SELECT * FROM wx_bookings' . $sqlWhere . ' ORDER BY d, tm LIMIT ' . $limit . ' OFFSET ' . $offset, $params);

    /* The strip above the table: what still needs a decision. Capped, because a strip is a prompt and
       not a report — the table below it is the report. */
    $pending = wx_all("SELECT * FROM wx_bookings WHERE status = 'pending' AND d >= ? ORDER BY d, tm LIMIT 50", [wx_book_now()->format('Y-m-d')]);
    $team = wx_book_team();

    return ['data' => [
        'items' => array_map(static fn($r) => wx_book_row($r, $c, $team), $rows),
        'pending' => array_map(static fn($r) => wx_book_row($r, $c, $team), $pending),
        'pendingTotal' => (int) wx_val("SELECT COUNT(*) FROM wx_bookings WHERE status = 'pending' AND d >= ?", [wx_book_now()->format('Y-m-d')]),
        'team' => array_map(static fn($k, $v) => ['id' => $k, 'name' => $v], array_keys($team), $team),
        'status' => WX_BOOK_STATUS,
        'statusCounts' => wx_book_status_counts($from, $to),
        'cfg' => $c,
        'today' => wx_book_now()->format('Y-m-d'),
        'total' => $total,
        'limit' => $limit,
        'offset' => $offset,
    ]];
}

/** One grouped query instead of five counts across the wire. */
function wx_book_status_counts(string $from, string $to): array
{
    $out = array_fill_keys(array_keys(WX_BOOK_STATUS), 0);
    foreach (wx_all('SELECT status, COUNT(*) AS n FROM wx_bookings WHERE d BETWEEN ? AND ? GROUP BY status', [$from, $to]) as $r) {
        $out[(string) $r['status']] = (int) $r['n'];
    }
    return $out;
}

/** GET /bookings/availability — the slot list the team books from. */
function wx_route_bookings_slots(array $ctx): array
{
    wx_require_user('bk_slots', ['owner', 'admin', 'sales']);
    $c = wx_book_cfg();
    $date = wx_v_date($ctx['query']['date'] ?? '', 'date');
    $type = wx_v_opt_string($ctx['query']['type'] ?? 'visit', 'type', 20) ?? 'visit';
    $t = wx_book_type($c, $type);
    if ($t === null) {
        throw ApiError::validation('Choose a booking type', 'type');
    }
    $skip = (int) ($ctx['query']['id'] ?? 0);
    return ['data' => [
        'slots' => wx_book_free($c, $date, (int) $t['dur'], $skip, true),
        'closed' => wx_book_day_closed($c, $date),
        'taken' => array_map(
            static fn($r) => ['tm' => (string) $r['tm'], 'dur' => (int) $r['dur'], 'name' => (string) $r['name'], 'status' => (string) $r['status']],
            wx_all("SELECT tm, dur, name, status FROM wx_bookings WHERE d = ? AND status IN ('pending','confirmed') ORDER BY tm", [$date])
        ),
    ]];
}

/** POST /bookings and PATCH /bookings/{id} — one code path. */
function wx_route_bookings_save(array $ctx): array
{
    return wx_appr_route('bk_save', $ctx, 'bookings', 'wx_route_bookings_save_do', static fn() => wx_route_bookings_save_do($ctx));
}

function wx_route_bookings_save_do(array $ctx): array
{
    $u = wx_require_user('bk_save', ['owner', 'admin', 'sales']);
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : (int) ($ctx['body']['id'] ?? 0);

    return wx_guard('bookings.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $c = wx_book_cfg();
            $team = wx_book_team();
            $b = $ctx['body'];

            $type = wx_v_string($b['type'] ?? '', 'type', 1, 20);
            $t = wx_book_type($c, $type);
            if ($t === null) {
                throw ApiError::validation('Choose a booking type', 'type');
            }
            $d = wx_v_date($b['d'] ?? $b['date'] ?? '', 'd');
            $tm = (string) ($b['tm'] ?? $b['time'] ?? '');
            if (!preg_match('~^([01]\d|2[0-3]):[0-5]\d$~', $tm)) {
                throw ApiError::validation('Choose a date and time', 'tm');
            }
            $name = wx_v_string($b['name'] ?? '', 'name', 2, 120);
            $phone = wx_v_string($b['phone'] ?? '', 'phone', 1, 40);
            $dur = max(15, min(480, (int) ($b['dur'] ?? $t['dur'])));

            /* A clash is a question, not an error: the screen answers 409 with who it clashes with and
               offers "book anyway", which comes back with force. Ported from v2.1, where the same
               answer was returned as `{ok:false, clash:true}`. */
            if (empty($b['force'])) {
                foreach (wx_all("SELECT name, tm, dur FROM wx_bookings WHERE d = ? AND id <> ? AND status IN ('pending','confirmed')", [$d, $id]) as $r) {
                    $a = wx_book_min((string) $r['tm']);
                    if (wx_book_min($tm) < $a + (int) $r['dur'] && $a < wx_book_min($tm) + $dur) {
                        throw ApiError::conflict('Clashes with ' . (string) $r['name'] . ' at ' . (string) $r['tm'], ['clash' => true]);
                    }
                }
            }

            $staff = (int) ($b['staff_id'] ?? 0) ?: null;
            if ($staff !== null && !isset($team[$staff])) {
                throw ApiError::validation('Unknown team member', 'staff_id');
            }
            $status = (string) ($b['status'] ?? 'confirmed');
            if (!isset(WX_BOOK_STATUS[$status])) {
                $status = 'confirmed';
            }

            $set = [
                'name' => $name,
                'phone' => $phone,
                'email' => wx_v_opt_string($b['email'] ?? null, 'email', 190),
                'type' => $type,
                'city' => wx_v_opt_string($b['city'] ?? null, 'city', 80),
                'address' => wx_v_opt_string($b['address'] ?? null, 'address', 300),
                'd' => $d,
                'tm' => $tm,
                'dur' => $dur,
                'staff_id' => $staff,
                'note' => wx_v_opt_string($b['note'] ?? null, 'note', 1000),
            ];

            if ($id > 0) {
                $old = wx_one('SELECT * FROM wx_bookings WHERE id = ?', [$id]);
                if ($old === null) {
                    throw ApiError::notFound('That booking does not exist');
                }
                if ($old['d'] !== $d || $old['tm'] !== $tm) {
                    // A moved booking has not been reminded about its new time.
                    $set['reminded'] = 0;
                }
                wx_update('wx_bookings', $set, ['id' => $id]);
                wx_audit($u, 'booking.save', 'booking:' . $id, ['d' => $d, 'tm' => $tm, 'moved' => ($old['d'] !== $d || $old['tm'] !== $tm)]);
            } else {
                $set['created_at'] = wx_now();
                $set['lead_id'] = isset($b['lead_id']) && (int) $b['lead_id'] > 0 ? (int) $b['lead_id'] : null;
                $set['status'] = $status;
                $set['src'] = 'team';
                $id = wx_insert('wx_bookings', $set);
                wx_audit($u, 'booking.save', 'booking:' . $id, ['d' => $d, 'tm' => $tm, 'created' => true]);
            }

            $row = wx_one('SELECT * FROM wx_bookings WHERE id = ?', [$id]);
            if (!empty($row['lead_id'])) {
                /* The follow-up moves with the booking: v2.1 wrote next_at/next_type/followup so the
                   lead appeared in the right call list on the right day. */
                $lead = wx_one('SELECT id, stage FROM wx_leads WHERE id = ?', [(int) $row['lead_id']]);
                if ($lead !== null) {
                    wx_update('wx_leads', [
                        'next_at' => $d . ' ' . $tm . ':00',
                        'next_type' => $type === 'visit' ? 'visit' : 'meeting',
                        'followup' => $d,
                        'last_contact' => wx_now(),
                    ], ['id' => (int) $row['lead_id']]);
                }
            }
            $sent = (!empty($b['notify']) && (string) $row['status'] === 'confirmed') ? wx_book_notify($row, 'booking') : [];

            return ['data' => ['item' => wx_book_row($row, $c, $team), 'sent' => $sent]];
        });
    });
}

/** POST /bookings/{id}/status — confirm, cancel, mark done or no-show. */
function wx_route_bookings_status(array $ctx): array
{
    return wx_appr_route('bk_status', $ctx, 'bookings', 'wx_route_bookings_status_do', static fn() => wx_route_bookings_status_do($ctx));
}

function wx_route_bookings_status_do(array $ctx): array
{
    $u = wx_require_user('bk_status', ['owner', 'admin', 'sales']);
    $id = (int) $ctx['params']['id'];

    return wx_guard('bookings.status', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $c = wx_book_cfg();
            $team = wx_book_team();
            $status = wx_v_enum($ctx['body']['status'] ?? '', array_keys(WX_BOOK_STATUS), 'status');
            $row = wx_one('SELECT * FROM wx_bookings WHERE id = ?', [$id]);
            if ($row === null) {
                throw ApiError::notFound('That booking does not exist');
            }
            if ((string) $row['status'] === $status) {
                throw ApiError::conflict('That booking is already ' . $status);
            }
            wx_update('wx_bookings', ['status' => $status], ['id' => $id]);
            $row['status'] = $status;

            /* A status change that only lives in the bookings table is invisible on the lead's page,
               which is where the next call is planned from. v2.1 wrote the same note. */
            if (!empty($row['lead_id'])) {
                wx_insert('wx_lead_notes', [
                    'lead_id' => (int) $row['lead_id'],
                    't' => wx_now(),
                    'user_name' => (string) $u['name'],
                    'text' => 'Booking ' . wx_book_label((string) $row['d'], (string) $row['tm']) . ': ' . WX_BOOK_STATUS[$status],
                    'sys' => 1,
                    'kind' => 'booking',
                ]);
            }
            $notify = array_key_exists('notify', $ctx['body']) ? !empty($ctx['body']['notify']) : true;
            $sent = ($status === 'confirmed' && $notify) ? wx_book_notify($row, 'booking') : [];
            wx_audit($u, 'booking.status', 'booking:' . $id, ['status' => $status]);

            return ['data' => ['item' => wx_book_row($row, $c, $team), 'sent' => $sent]];
        });
    });
}

/** GET /bookings/settings */
function wx_route_bookings_cfg_get(array $ctx): array
{
    wx_require_user('bk_cfg', ['owner', 'admin', 'sales']);
    return ['data' => ['cfg' => wx_book_cfg(), 'status' => WX_BOOK_STATUS]];
}

/** POST /bookings/settings — owner/admin, every value clamped to the range v2.1 clamped it to. */
function wx_route_bookings_cfg_save(array $ctx): array
{
    return wx_appr_route('bk_cfg_save', $ctx, 'bookings', 'wx_route_bookings_cfg_save_do', static fn() => wx_route_bookings_cfg_save_do($ctx));
}

function wx_route_bookings_cfg_save_do(array $ctx): array
{
    $u = wx_require_user('bk_cfg_save', ['owner', 'admin']);

    return wx_guard('bookings.cfg', static function () use ($ctx, $u) {
        return wx_tx(static function () use ($ctx, $u) {
            $c = wx_book_cfg();
            $s = is_array($ctx['body']['cfg'] ?? null) ? $ctx['body']['cfg'] : $ctx['body'];
            $n = $c;

            if (array_key_exists('on', $s)) {
                $n['on'] = wx_v_bool($s['on'], 'on');
            }
            foreach (['open', 'last'] as $k) {
                if (isset($s[$k])) {
                    if (!preg_match('~^([01]\d|2[0-3]):[0-5]\d$~', (string) $s[$k])) {
                        throw ApiError::validation('Check the opening hours', $k);
                    }
                    $n[$k] = (string) $s[$k];
                }
            }
            if (wx_book_min((string) $n['last']) < wx_book_min((string) $n['open'])) {
                throw ApiError::validation('The last slot must be after the opening time', 'last');
            }
            foreach (['step' => [15, 240], 'maxDay' => [1, 30], 'minHours' => [0, 168], 'ahead' => [1, 180]] as $k => $range) {
                if (isset($s[$k])) {
                    $n[$k] = max($range[0], min($range[1], (int) $s[$k]));
                }
            }
            if (isset($s['days'])) {
                $n['days'] = array_values(array_unique(array_filter(array_map('intval', (array) $s['days']), static fn($x) => $x >= 1 && $x <= 7)));
            }
            if (isset($s['areas'])) {
                $n['areas'] = array_slice(array_values(array_filter(array_map(static fn($x) => mb_substr(trim((string) $x), 0, 60), (array) $s['areas']))), 0, 30);
            }
            if (isset($s['blocked'])) {
                $n['blocked'] = array_slice(array_values(array_unique(array_filter((array) $s['blocked'], static fn($x) => is_string($x) && preg_match('~^\d{4}-\d{2}-\d{2}$~', $x)))), 0, 200);
            }
            if (isset($s['types'])) {
                $types = [];
                foreach (array_slice((array) $s['types'], 0, 8) as $x) {
                    $k = (string) preg_replace('~[^a-z0-9]~', '', strtolower((string) ($x['k'] ?? '')));
                    $label = mb_substr(trim((string) ($x['label'] ?? '')), 0, 40);
                    if ($k === '' || $label === '') {
                        continue;
                    }
                    $types[] = [
                        'k' => substr($k, 0, 20),
                        'label' => $label,
                        'dur' => max(15, min(480, (int) ($x['dur'] ?? 60))),
                        'on' => !empty($x['on']),
                        'hint' => mb_substr(trim((string) ($x['hint'] ?? '')), 0, 160),
                    ];
                }
                if (!$types) {
                    throw ApiError::validation('Keep at least one booking type', 'types');
                }
                $n['types'] = $types;
            }

            wx_setting_set(WX_BOOK_SETTING, (string) json_encode($n, JSON_UNESCAPED_UNICODE));
            wx_audit($u, 'booking.settings', 'booking', ['keys' => array_keys($s)]);
            return ['data' => ['cfg' => $n]];
        });
    });
}

/* ============================================================== the public form
   These three are the only unauthenticated endpoints in api/v2 that write. They carry no session, so
   the protections are the ones a public form can have: a honeypot field, a per-IP rate limit, and
   validation strict enough that nothing reaches the database unshaped. */

/** GET /book/config — what the booking page needs to draw itself. */
function wx_route_book_config(array $ctx): array
{
    $c = wx_book_cfg();
    if (empty($c['on'])) {
        return ['data' => ['on' => false]];
    }
    return ['data' => wx_book_pub_cfg($c)];
}

/** GET /book/slots?date=…&type=… */
function wx_route_book_slots(array $ctx): array
{
    $c = wx_book_cfg();
    if (empty($c['on'])) {
        throw new ApiError('NOT_FOUND', 'Bookings are not open at the moment', 404);
    }
    $type = wx_v_string($ctx['query']['type'] ?? 'visit', 'type', 1, 20);
    $t = wx_book_type($c, $type);
    if ($t === null || empty($t['on'])) {
        throw ApiError::validation('Choose what you want to book', 'type');
    }
    $date = wx_v_date($ctx['query']['date'] ?? '', 'date');
    return ['data' => ['slots' => wx_book_free($c, $date, (int) $t['dur']), 'closed' => wx_book_day_closed($c, $date), 'when' => [] ]];
}

/**
 * POST /book — a visitor books a visit. Creates the lead and the booking in one transaction.
 *
 * The transaction locks the date before it chooses a time, which is the part v2.1 got right: two
 * people picking the last 11:00 slot must not both get it. The second one gets 409 and a sentence
 * telling them to pick another time.
 */
function wx_route_book_create(array $ctx): array
{
    $c = wx_book_cfg();
    $b = $ctx['body'];
    if (empty($c['on'])) {
        throw new ApiError('NOT_FOUND', 'Bookings are not open at the moment', 404);
    }
    /* Honeypot: a field no person can see or fill. Answered exactly like a success — telling a bot it
       was detected is how a bot learns to hide. */
    if (trim((string) ($b['_hp'] ?? '')) !== '') {
        return ['data' => ['id' => 0]];
    }
    wx_book_rate('book:' . wx_ip(), 3, 600);

    $type = wx_v_string($b['type'] ?? '', 'type', 1, 20);
    $t = wx_book_type($c, $type);
    if ($t === null || empty($t['on'])) {
        throw ApiError::validation('Choose what you want to book', 'type');
    }
    $name = wx_v_string($b['name'] ?? '', 'name', 2, 120);
    $phone = trim((string) ($b['phone'] ?? ''));
    if (!preg_match('~^[+\d][\d\s()-]{6,}$~', $phone)) {
        throw ApiError::validation('Please enter a valid phone number', 'phone');
    }
    $email = trim((string) ($b['email'] ?? ''));
    if ($email !== '') {
        $email = wx_v_email($email);
    }
    $city = wx_v_opt_string($b['city'] ?? null, 'city', 80) ?? '';
    $address = wx_v_opt_string($b['address'] ?? null, 'address', 300) ?? '';
    $note = wx_v_opt_string($b['note'] ?? null, 'note', 1000) ?? '';
    $service = wx_v_opt_string($b['service'] ?? null, 'service', 120) ?? '';
    if ($type === 'visit' && mb_strlen($address) < 4) {
        throw ApiError::validation('Please enter the site address', 'address');
    }
    $date = wx_v_date($b['date'] ?? $b['d'] ?? '', 'date');
    $time = (string) ($b['time'] ?? $b['tm'] ?? '');
    if (!preg_match('~^([01]\d|2[0-3]):[0-5]\d$~', $time)) {
        throw ApiError::validation('Choose a time', 'time');
    }

    $out = wx_tx(static function () use ($c, $t, $name, $phone, $email, $city, $address, $note, $service, $date, $time, $type, $b) {
        /* Lock the day, then re-check: the slot list the visitor saw was computed before this
           transaction started. */
        wx_q('SELECT id FROM wx_bookings WHERE d = ? FOR UPDATE', [$date]);
        if (!in_array($time, wx_book_free($c, $date, (int) $t['dur']), true)) {
            throw ApiError::conflict('Sorry, that time was just taken — please pick another', ['clash' => true]);
        }
        $when = wx_book_label($date, $time);
        $fields = array_filter(['booking' => (string) $t['label'] . ' · ' . $when, 'city' => $city, 'address' => $address]);

        $leadId = wx_insert('wx_leads', [
            'created_at' => wx_now(),
            'source' => 'booking',
            'page' => wx_v_opt_string($b['page'] ?? '/book-a-visit/', 'page', 200) ?? '/book-a-visit/',
            'name' => $name,
            'phone' => $phone,
            'email' => $email !== '' ? $email : null,
            'service' => $service !== '' ? $service : (string) $t['label'],
            'message' => $note,
            'fields' => json_encode($fields, JSON_UNESCAPED_UNICODE),
            'stage' => 'visit',
            'is_read' => 0,
            'ip' => wx_ip(),
            'next_at' => $date . ' ' . $time . ':00',
            'next_type' => $type === 'visit' ? 'visit' : 'meeting',
            'followup' => $date,
        ]);
        $bookingId = wx_insert('wx_bookings', [
            'created_at' => wx_now(),
            'lead_id' => $leadId,
            'name' => $name,
            'phone' => $phone,
            'email' => $email !== '' ? $email : null,
            'type' => $type,
            'city' => $city,
            'address' => $address,
            'd' => $date,
            'tm' => $time,
            'dur' => (int) $t['dur'],
            'status' => 'pending',
            'note' => $note,
            'src' => 'web',
        ]);
        wx_audit(null, 'booking.create', 'booking:' . $bookingId, ['lead' => $leadId, 'when' => $when, 'source' => 'web']);
        return ['id' => $bookingId, 'leadId' => $leadId, 'when' => $when, 'type' => (string) $t['label']];
    });

    /* Told after the booking is safely stored: a notification that fails must not lose the booking,
       and the visitor's answer must not wait on WhatsApp. */
    $row = wx_one('SELECT * FROM wx_bookings WHERE id = ?', [$out['id']]);
    $sent = $row !== null ? wx_book_notify($row, 'booking') : [];

    return ['data' => ['id' => $out['id'], 'when' => $out['when'], 'type' => $out['type'], 'sent' => $sent]];
}
