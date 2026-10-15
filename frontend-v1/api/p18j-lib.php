<?php
/**
 * P18 J — My account (profile page).
 * Extra profile fields live in _private/profiles.json (keyed by user id) so the users table is not changed.
 * Avatar photos are saved to /assets/uploads/avatars/ (public, small JPG/PNG/WebP).
 */
const PROF_FILE = PRIVATE_DIR . '/profiles.json';
const PROF_KEYS = ['phone' => 30, 'whatsapp' => 30, 'title' => 80, 'city' => 60, 'bio' => 400];

function prof_get(int $id): array { $all = jread(PROF_FILE); return array_merge(array_fill_keys(array_keys(PROF_KEYS), ''), ['avatar' => ''], $all[(string)$id] ?? []); }
function prof_put(int $id, array $p): void { $all = jread(PROF_FILE); $all[(string)$id] = $p; jwrite(PROF_FILE, $all); }

function p18j_actions(string $action, array $in): bool {
    switch ($action) {
        case 'me_get':
            $u = need(); $id = (int)$u['id']; $p = prof_get($id);
            $m0 = gmdate('Y-m-01 00:00:00');
            $rows = q("SELECT action, COUNT(*) n FROM wx_activity WHERE user_id=? AND created_at>=? GROUP BY action", [$id, $m0])->fetchAll();
            $st = ['leads' => 0, 'quotes' => 0, 'invoices' => 0, 'messages' => 0, 'pages' => 0];
            foreach ($rows as $r) {
                $a = (string)$r['action']; $n = (int)$r['n'];
                if (preg_match('~^(lead|crm)\.~', $a)) $st['leads'] += $n;
                elseif (preg_match('~^quote~', $a)) $st['quotes'] += $n;
                elseif (preg_match('~^(invoice|inv|payment)~', $a)) $st['invoices'] += $n;
                elseif (preg_match('~^(chat|wa|inbox|notify)~', $a)) $st['messages'] += $n;
                elseif (preg_match('~^(page|content|builder|global|seo)~', $a)) $st['pages'] += $n;
            }
            $act = q("SELECT action, target, created_at FROM wx_activity WHERE user_id=? ORDER BY id DESC LIMIT 12", [$id])->fetchAll();
            $last = q("SELECT created_at, ip FROM wx_activity WHERE user_id=? AND action='login' ORDER BY id DESC LIMIT 1 OFFSET 1", [$id])->fetch() ?: null;
            $s = function_exists('sec_get_u') ? sec_get_u($id) : [];
            $sess = count(array_filter($s['sessions'] ?? [], fn($x) => ($x['exp'] ?? 0) > time()));
            out(['ok' => true, 'user' => ['id' => $id, 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created_at' => $u['created_at'] ?? null], 'profile' => $p,
                'stats' => $st, 'activity' => $act, 'security' => ['totp' => !empty($s['totp_on']), 'sessions' => max(1, $sess), 'lastLogin' => $last]]);

        case 'me_save':
            $u = need(); $id = (int)$u['id']; $p = prof_get($id);
            $name = trim((string)($in['name'] ?? $u['name'])); if ($name === '') fail('Name is required');
            if (preg_match('~[<>]~', $name)) fail('Name cannot contain < or >');
            foreach (PROF_KEYS as $k => $max) if (array_key_exists($k, $in)) $p[$k] = mb_substr(trim(strip_tags((string)$in[$k])), 0, $max);
            foreach (['phone', 'whatsapp'] as $k) if ($p[$k] !== '' && !preg_match('~^[+0-9 ()-]{7,30}$~', $p[$k])) fail(($k === 'phone' ? 'Phone' : 'WhatsApp') . ' number: digits, spaces and + only');
            q('UPDATE wx_users SET name=? WHERE id=?', [mb_substr($name, 0, 120), $id]); prof_put($id, $p); log_act($u, 'profile.update');
            out(['ok' => true, 'user' => pub(q('SELECT * FROM wx_users WHERE id=?', [$id])->fetch()), 'profile' => $p]);

        case 'me_avatar':
            $u = need(); $id = (int)$u['id']; $p = prof_get($id); $dir = ROOT_DIR . '/assets/uploads/avatars';
            $old = $p['avatar'] ?? '';
            if (!empty($in['remove'])) { $p['avatar'] = ''; }
            else {
                $data = (string)($in['data'] ?? ''); if (!preg_match('~^data:image/(jpeg|png|webp);base64,~', $data, $m)) fail('Choose a JPG, PNG or WebP photo');
                $bin = base64_decode(substr($data, strpos($data, ',') + 1), true); if ($bin === false || strlen($bin) > 2 * 1048576) fail('Photo must be under 2 MB');
                $info = @getimagesizefromstring($bin); if (!$info || $info[0] < 32 || $info[1] < 32) fail('That file is not a valid image');
                if (!is_dir($dir)) mkdir($dir, 0755, true);
                $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1]; $fn = 'u' . $id . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
                file_put_contents($dir . '/' . $fn, $bin, LOCK_EX); $p['avatar'] = '/assets/uploads/avatars/' . $fn;
            }
            if ($old !== '' && preg_match('~^/assets/uploads/avatars/u' . $id . '-[0-9a-f]{8}\.(jpg|png|webp)$~', $old) && is_file(ROOT_DIR . $old)) @unlink(ROOT_DIR . $old);
            prof_put($id, $p); log_act($u, 'profile.avatar'); out(['ok' => true, 'profile' => $p]);

        case 'me_avatars': // small map id → avatar URL for the top bar / team lists
            need(); $all = jread(PROF_FILE); $o = []; foreach ($all as $k => $v) if (!empty($v['avatar'])) $o[$k] = $v['avatar']; out(['ok' => true, 'avatars' => $o]);
    }
    return false;
}
