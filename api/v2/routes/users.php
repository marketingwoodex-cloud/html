<?php
/**
 * api/v2/routes/users.php — people, what they may do, and their way back in.
 *
 * Ported from `admin.php`'s `users` / `user_save` and `security-lib.php`'s `sec_*`. Three things are
 * worth saying before the code:
 *
 * **The rules that stop a company locking itself out** are in `wx_user_plan()`: only an owner makes an
 * owner, the last active owner cannot be demoted or switched off, and nobody deactivates themselves.
 * They are a pure function of (request, actor, target, other active owners), so they can be tested
 * without a database and reviewed without reading SQL. The route below applies the decision; it does not
 * contain it.
 *
 * **Two-factor state lives on the user row** (`wx_users.totp_secret`, `totp_on`, `recovery_json`,
 * `totp_last`). v2.1 kept it in `_private/security.json`, where a lost file or two hosts sharing a
 * database meant a person could be locked out of their own account with a code their phone said was
 * correct. `lib/auth.php` reads it from the columns and migrates a legacy row forward on first touch.
 *
 * **Recovery codes are hashed, never stored, and the comparison is shared.** `wx_recovery_hash()` is the
 * one implementation, used by both enrolment and sign-in: v2.1's comparison stripped dashes and
 * lowercased the code, and a comparison that disagrees with the enrolment about case or dashes is a code
 * that looks right and is refused — the worst possible failure, because it happens when someone has
 * already lost their phone.
 */

declare(strict_types=1);

/** The list shape for a person. Never the password hash; whether two-factor is on is a fact the screen needs. */
function wx_user_row(array $u, bool $twofa = false, int $sessions = 0): array
{
    return [
        'id' => (int) $u['id'],
        'name' => (string) $u['name'],
        'email' => (string) $u['email'],
        'role' => (string) $u['role'],
        'roleLabel' => WX_ROLE_LABELS[(string) $u['role']] ?? (string) $u['role'],
        'active' => (bool) $u['active'],
        'twofa' => $twofa,
        'sessions' => $sessions,
        'perms' => wx_user_perms((int) $u['id']),
        'created_at' => $u['created_at'] ?? null,
        'last_login' => $u['last_login'] ?? null,
    ];
}

/**
 * The account rules, as a decision rather than a side effect.
 *
 * @param array      $in          the request body
 * @param array      $me          the person making the change
 * @param array|null $before      the row being edited, or null when creating
 * @param int        $otherOwners how many *other* active owners exist (ignored when creating)
 *
 * @return array{set: array, password: string, signOut: bool, error?: string, field?: string}
 */
function wx_user_plan(array $in, array $me, ?array $before, int $otherOwners): array
{
    $name = trim((string) ($in['name'] ?? ''));
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $role = (string) ($in['role'] ?? 'editor');
    $active = array_key_exists('active', $in) ? !empty($in['active']) : ($before === null ? true : (bool) $before['active']);
    $password = (string) ($in['password'] ?? '');

    $no = static fn(string $msg, string $field) => ['set' => [], 'password' => '', 'signOut' => false, 'error' => $msg, 'field' => $field];

    if ($name === '') {
        return $no('Enter a name', 'name');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return $no('Enter a valid email address', 'email');
    }
    if (!in_array($role, WX_ROLES, true)) {
        return $no('Unknown role', 'role');
    }
    if ($role === 'owner' && (string) $me['role'] !== 'owner') {
        return $no('Only the owner can create another owner', 'role');
    }
    if ($before !== null && (string) $before['role'] === 'owner' && (string) $me['role'] !== 'owner') {
        return $no('Only the owner can edit the owner', 'role');
    }
    if ($before !== null && (string) $before['role'] === 'owner' && ($role !== 'owner' || !$active) && $otherOwners < 1) {
        return $no('There must be at least one active owner — add another owner first', 'role');
    }
    if ($before !== null && (int) $before['id'] === (int) $me['id'] && !$active) {
        return $no('You cannot deactivate yourself', 'active');
    }
    if ($password !== '') {
        try {
            wx_v_password($password);
        } catch (ApiError $e) {
            return $no($e->getMessage() !== '' ? $e->getMessage() : 'Choose a stronger password', 'password');
        }
    }
    if ($before === null && $password === '') {
        return $no('Set a password for the new account', 'password');
    }

    return [
        'set' => ['name' => mb_substr($name, 0, 120), 'email' => $email, 'role' => $role, 'active' => $active ? 1 : 0],
        'password' => $password,
        /* Ending every session is what a role change, a deactivated account and a new password have in
           common: in each case somebody is signed in holding permissions that have just moved. */
        'signOut' => $before !== null && ($password !== '' || !$active || (string) $before['role'] !== $role),
    ];
}

/** GET /users — the list, with what each person can do and whether they are signed in anywhere. */
function wx_route_users_list(array $ctx): array
{
    wx_require_user('users');
    $rows = wx_all('SELECT * FROM wx_users ORDER BY id');
    $live = [];
    foreach (wx_all('SELECT user_id, COUNT(*) AS n FROM wx_sessions WHERE revoked_at IS NULL AND expires_at > ? GROUP BY user_id', [wx_now()]) as $r) {
        $live[(int) $r['user_id']] = (int) $r['n'];
    }
    $users = [];
    foreach ($rows as $r) {
        $users[] = wx_user_row($r, !empty(wx_user_security((int) $r['id'])['twofa']), $live[(int) $r['id']] ?? 0);
    }
    return ['data' => [
        'users' => $users,
        'roles' => WX_ROLE_LABELS,
        'groups' => WX_PERM_GROUPS,
        'me' => (int) wx_current_user()['id'],
    ]];
}

/**
 * POST /users and PATCH /users/{id} — create or change one account.
 *
 * In one transaction: the row, the password, the per-user capability grants, and the sessions that have
 * to end. A half-applied change to someone's account is a support call at best.
 */
function wx_route_users_save(array $ctx): array
{
    return wx_appr_route('user_save', $ctx, 'users', 'wx_route_users_save_do', static fn() => wx_route_users_save_do($ctx));
}

function wx_route_users_save_do(array $ctx): array
{
    $me = wx_require_user('user_save');
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : (int) ($ctx['body']['id'] ?? 0);

    return wx_guard('users.save', static function () use ($ctx, $me, $id) {
        return wx_tx(static function () use ($ctx, $me, $id) {
            $before = null;
            $otherOwners = 0;
            if ($id > 0) {
                $before = wx_one('SELECT * FROM wx_users WHERE id = ?', [$id]);
                if ($before === null) {
                    throw ApiError::notFound('That user does not exist');
                }
                $otherOwners = (int) wx_val("SELECT COUNT(*) FROM wx_users WHERE role = 'owner' AND active = 1 AND id <> ?", [$id]);
            }

            $plan = wx_user_plan($ctx['body'], $me, $before, $otherOwners);
            if (isset($plan['error'])) {
                throw ApiError::validation((string) $plan['error'], (string) $plan['field']);
            }
            $set = $plan['set'];

            /* One email, one account: two accounts with the same address is how a password reset ends up
               in the wrong inbox, and how an audit trail stops meaning anything. */
            $clash = wx_val('SELECT id FROM wx_users WHERE email = ? AND id <> ?', [$set['email'], $id]);
            if ($clash !== null) {
                throw ApiError::validation('That email address is already used by another account', 'email');
            }

            if ($id > 0) {
                wx_update('wx_users', $set, ['id' => $id]);
                if ((string) $plan['password'] !== '') {
                    wx_q('UPDATE wx_users SET pass_hash = ?, pw_ver = pw_ver + 1 WHERE id = ?', [password_hash((string) $plan['password'], PASSWORD_DEFAULT), $id]);
                } elseif (!empty($plan['signOut'])) {
                    wx_q('UPDATE wx_users SET pw_ver = pw_ver + 1 WHERE id = ?', [$id]);
                }
                wx_audit($me, 'user.update', 'user:' . $id, [
                    'email' => (string) $set['email'],
                    'role' => (string) $set['role'],
                    'from' => (string) $before['role'],
                    'active' => (bool) $set['active'],
                    'passwordReset' => (string) $plan['password'] !== '',
                ]);
            } else {
                $set['pass_hash'] = password_hash((string) $plan['password'], PASSWORD_DEFAULT);
                $set['pw_ver'] = 1;
                $set['created_at'] = wx_now();
                $id = wx_insert('wx_users', $set);
                wx_audit($me, 'user.create', 'user:' . $id, ['email' => (string) $set['email'], 'role' => (string) $set['role']]);
            }

            if (isset($ctx['body']['perms']) && is_array($ctx['body']['perms'])) {
                $groups = array_values(array_intersect(array_map('strval', $ctx['body']['perms']), array_keys(WX_PERM_GROUPS)));
                wx_user_perms_set($id, $groups);
                wx_audit($me, 'user.perms', 'user:' . $id, ['groups' => $groups]);
            }

            if (!empty($plan['signOut'])) {
                /* Changing your own role or password signs you out of every other device, and only
                   leaves this one alone: the act of adjusting your own account should not end the
                   session you are adjusting it from, and it should not leave a laptop at home signed in
                   either. wx_session_revoke_others() is exactly that distinction. */
                $self = $id === (int) $me['id'];
                $ended = $self ? wx_session_revoke_others($id) : wx_session_revoke_user($id);
                wx_audit($me, 'security.sessions_revoked', 'user:' . $id, ['count' => $ended, 'reason' => 'account change']);
            }

            /* The password version changed under anyone who was signed in: read the row back so the
               response shows what is actually stored. */
            $fresh = wx_one('SELECT * FROM wx_users WHERE id = ?', [$id]);
            return ['data' => [
                'user' => wx_user_row($fresh, !empty(wx_user_security($id)['twofa'])),
                'created' => $before === null,
                'signedOut' => !empty($plan['signOut']),
            ]];
        });
    });
}

/**
 * DELETE /users/{id}/sessions — sign someone out of every device, including the ones they are holding.
 *
 * v2.1's `sec_revoke` with a `user_id`: owner and admin only, and an owner's sessions can only be ended
 * by another owner. Uses wx_session_revoke_user(), which does not spare the current one — the point of
 * this button is that nobody stays signed in.
 */
function wx_route_users_sessions_revoke(array $ctx): array
{
    $me = wx_require_user('sec_revoke', ['owner', 'admin']);
    $id = (int) $ctx['params']['id'];
    $target = wx_one('SELECT * FROM wx_users WHERE id = ?', [$id]);
    if ($target === null) {
        throw ApiError::notFound('That user does not exist');
    }
    if ((string) $target['role'] === 'owner' && (string) $me['role'] !== 'owner') {
        throw ApiError::forbidden('Only the owner can do this');
    }
    $n = wx_session_revoke_user($id);
    wx_audit($me, 'security.sessions_revoked', 'user:' . $id, ['count' => $n, 'by' => 'admin']);
    return ['data' => ['ended' => $n]];
}

/**
 * POST /users/{id}/2fa-reset — reset a lost phone.
 *
 * v2.1's `sec_2fa_reset`, owner only (the `master` group): it clears the secret and the recovery codes
 * so the person can enrol again. It also ends their sessions — a reset is what you do when you believe
 * the phone, or the account, is in someone else's hands.
 */
function wx_route_users_2fa_reset(array $ctx): array
{
    return wx_appr_route('sec_2fa_reset', $ctx, 'users', 'wx_route_users_2fa_reset_do', static fn() => wx_route_users_2fa_reset_do($ctx));
}

function wx_route_users_2fa_reset_do(array $ctx): array
{
    $me = wx_require_user('sec_2fa_reset');
    $id = (int) $ctx['params']['id'];

    return wx_guard('users.2fa_reset', static function () use ($me, $id) {
        return wx_tx(static function () use ($me, $id) {
            $target = wx_one('SELECT * FROM wx_users WHERE id = ?', [$id]);
            if ($target === null) {
                throw ApiError::notFound('That user does not exist');
            }
            $sec = wx_user_security($id);
            $had = !empty($sec['twofa']);
            $sec['twofa'] = false;
            $sec['totp_on'] = false;
            $sec['totp'] = '';
            $sec['recovery'] = [];
            unset($sec['totp_last']);
            wx_user_security_put($id, $sec);
            $ended = wx_session_revoke_user($id);
            wx_audit($me, '2fa.reset', 'user:' . $id, ['email' => (string) $target['email'], 'wasOn' => $had, 'sessionsEnded' => $ended]);
            return ['data' => ['id' => $id, 'twofa' => false, 'sessionsEnded' => $ended]];
        });
    });
}
