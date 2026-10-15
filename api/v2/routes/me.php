<?php
/**
 * api/v2/routes/me.php — the signed-in user's own account.
 *
 * GET /me is the SPA's bootstrap call: it answers "who am I, what may I open, and what is my CSRF
 * token" in one round trip. After a page reload this is where the token comes back from — which is
 * safe, because a cross-site request cannot read the response body.
 */

declare(strict_types=1);

function wx_route_me(array $ctx): array
{
    $u = wx_current_user();
    if ($u === null) {
        // The client maps AUTH on /me to "show the sign-in screen" — an expected answer, not a fault.
        throw ApiError::auth();
    }
    return [
        'data' => [
            'user' => wx_user_public($u),
            'caps' => wx_caps($u),
            'csrf' => wx_csrf_rotate(),
            'session' => [
                'expires_at' => wx_session_row()['expires_at'] ?? null,
                'ip' => wx_session_row()['ip'] ?? null,
            ],
        ],
    ];
}

function wx_route_me_save(array $ctx): array
{
    $u = wx_require_user('me_save');
    $fields = wx_v_pick($ctx['body'], ['name', 'email']);
    $set = [];
    if (array_key_exists('name', $fields)) {
        $set['name'] = wx_v_string($fields['name'], 'name', 2, 120);
    }
    if (array_key_exists('email', $fields)) {
        $email = wx_v_email($fields['email']);
        $taken = wx_val('SELECT id FROM wx_users WHERE email = ? AND id <> ?', [$email, (int) $u['id']]);
        if ($taken) {
            throw ApiError::conflict('That email is already used by another account', ['field' => 'email']);
        }
        $set['email'] = $email;
    }
    if (!$set) {
        throw ApiError::validation('Nothing to change');
    }
    wx_update('wx_users', $set, ['id' => (int) $u['id']]);
    wx_audit($u, 'me.save', 'user:' . $u['id'], ['fields' => array_keys($set)]);
    return ['data' => ['user' => wx_user_public(wx_one('SELECT * FROM wx_users WHERE id = ?', [(int) $u['id']]))]];
}

/** Changing the password bumps pw_ver, which ends every other session — including the attacker's. */
function wx_route_password(array $ctx): array
{
    $u = wx_require_user('password');
    $current = (string) ($ctx['body']['current'] ?? '');
    $next = wx_v_password($ctx['body']['password'] ?? '', 'password');
    if (!password_verify($current, (string) $u['pass_hash'])) {
        wx_audit($u, 'security.password_wrong_current', 'user:' . $u['id']);
        throw ApiError::validation('The current password is not correct', 'current');
    }
    if (hash_equals((string) $u['pass_hash'], (string) password_hash($next, PASSWORD_DEFAULT))) {
        throw ApiError::validation('The new password must be different', 'password');
    }
    $others = wx_session_revoke_others((int) $u['id']);
    wx_update('wx_users', [
        'pass_hash' => password_hash($next, PASSWORD_DEFAULT),
        'pw_ver' => (int) $u['pw_ver'] + 1,
    ], ['id' => (int) $u['id']]);
    wx_audit($u, 'security.password_changed', 'user:' . $u['id'], ['other_sessions_ended' => $others]);
    // The caller's own session dies with the version bump, so hand back a fresh one.
    wx_session_revoke();
    $fresh = wx_one('SELECT * FROM wx_users WHERE id = ?', [(int) $u['id']]);
    return ['data' => wx_login_finish($fresh)];
}

function wx_route_sessions(array $ctx): array
{
    $u = wx_require_user('sec_get');
    return ['data' => ['sessions' => wx_session_list((int) $u['id'])]];
}

function wx_route_sessions_revoke(array $ctx): array
{
    $u = wx_require_user('sec_revoke');
    $n = wx_session_revoke_others((int) $u['id']);
    wx_audit($u, 'security.sessions_revoked', 'user:' . $u['id'], ['count' => $n]);
    return ['data' => ['ended' => $n]];
}
