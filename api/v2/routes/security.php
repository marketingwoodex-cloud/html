<?php
/**
 * api/v2/routes/security.php — the account-security screens: two-factor, recovery codes, sign-in history.
 *
 * v2.1's security-lib.php kept this state in `_private/security.json`. Migration 000 and 008 moved it
 * onto the user row, and lib/auth.php reads it from there — so this file is only the screens. That
 * matters for one specific reason: **the same code path enrols the secret that the login verifies.**
 * v2.1 had the enrolment writing to a file and the login reading it, and a race between the two is how
 * a person ends up locked out of their own account with a code their phone says is correct.
 *
 * Every action here is in the `self` capability group: a person may always manage their own security.
 * Nothing here can touch another account — that is `POST /users/{id}/2fa-reset`, which is owner-only.
 */

declare(strict_types=1);

/** GET /security — everything the account-security screen shows, in one response. */
function wx_route_security_get(array $ctx): array
{
    $u = wx_require_user('sec_get');
    $state = wx_security_state((int) $u['id']);
    return ['data' => [
        'twofa' => (bool) $state['on'],
        'alerts' => (bool) $state['alerts'],
        'recoveryLeft' => count((array) $state['recovery']),
        'sessions' => wx_session_list((int) $u['id']),
        'events' => wx_login_alerts((int) $u['id']),
        'hasPassword' => (string) $u['pass_hash'] !== '',
    ]];
}

/**
 * POST /security/2fa/begin — mint a secret and hand back the URI the QR code is drawn from.
 *
 * The secret is stored as *pending* (in the same column, with `totp_on` still 0) so that a person who
 * scans the code and then closes the tab has not half-enabled two-factor. Enabling is a separate step
 * that proves the phone can produce a code.
 */
function wx_route_security_2fa_begin(array $ctx): array
{
    $u = wx_require_user('sec_2fa_begin');
    $state = wx_security_state((int) $u['id']);
    if (!empty($state['on'])) {
        throw ApiError::conflict('Two-factor is already on for this account');
    }
    $secret = wx_b32_enc(random_bytes(20));
    /* A pending secret replaces any earlier pending one: two half-finished attempts must not leave two
       valid secrets, only the newest one the person is actually looking at. */
    $state['secret'] = $secret;
    $state['last'] = 0;
    wx_security_state_put((int) $u['id'], $state);
    wx_audit($u, '2fa.begin', 'user:' . (int) $u['id']);

    return ['data' => ['secret' => $secret, 'uri' => wx_2fa_uri($secret, (string) $u['email'])]];
}

/** POST /security/2fa/enable — prove the phone works, then turn it on. Codes are shown once. */
function wx_route_security_2fa_enable(array $ctx): array
{
    $u = wx_require_user('sec_2fa_enable');
    $code = wx_v_string($ctx['body']['code'] ?? '', 'code', 6, 6);
    $state = wx_security_state((int) $u['id']);
    if ((string) $state['secret'] === '') {
        throw ApiError::validation('Start the setup again — there is no pending secret', 'code');
    }
    $probe = $state;
    if (!wx_totp_ok((string) $state['secret'], $code, $probe)) {
        throw ApiError::validation("That code is not right — check your phone's clock and try the current code", 'code');
    }
    $codes = wx_recovery_codes();
    $state['on'] = true;
    $state['recovery'] = array_map('wx_recovery_hash', $codes);
    $state['last'] = (int) ($probe['totp_last'] ?? 0);
    wx_security_state_put((int) $u['id'], $state);
    wx_audit($u, '2fa.enable', 'user:' . (int) $u['id'], ['recovery' => count($codes)]);

    /* The only time the plain codes exist is in this response. If they are lost, the only way back in
       is a recovery-code reissue (which needs the password) or an owner's reset. */
    return ['data' => ['twofa' => true, 'codes' => wx_recovery_fmt($codes)]];
}

/** POST /security/2fa/disable — password required. Turning off a second factor is a security change. */
function wx_route_security_2fa_disable(array $ctx): array
{
    $u = wx_require_user('sec_2fa_disable');
    $password = (string) ($ctx['body']['password'] ?? '');
    if (!password_verify($password, (string) $u['pass_hash'])) {
        wx_audit($u, '2fa.disable_denied', 'user:' . (int) $u['id']);
        throw ApiError::auth('Password is wrong');
    }
    $state = wx_security_state((int) $u['id']);
    if (empty($state['on'])) {
        throw ApiError::conflict('Two-factor is not on for this account');
    }
    $state['on'] = false;
    $state['secret'] = '';
    $state['recovery'] = [];
    $state['last'] = 0;
    wx_security_state_put((int) $u['id'], $state);
    wx_audit($u, '2fa.disable', 'user:' . (int) $u['id']);
    return ['data' => ['twofa' => false]];
}

/** POST /security/recovery — issue a fresh set of recovery codes, password required. */
function wx_route_security_recovery(array $ctx): array
{
    $u = wx_require_user('sec_recovery_new');
    if (!password_verify((string) ($ctx['body']['password'] ?? ''), (string) $u['pass_hash'])) {
        wx_audit($u, '2fa.recovery_denied', 'user:' . (int) $u['id']);
        throw ApiError::auth('Password is wrong');
    }
    $state = wx_security_state((int) $u['id']);
    if (empty($state['on'])) {
        throw ApiError::conflict('Two-factor is not on, so there are no recovery codes to issue');
    }
    $codes = wx_recovery_codes();
    $state['recovery'] = array_map('wx_recovery_hash', $codes);
    wx_security_state_put((int) $u['id'], $state);
    /* Every code that was in the old list stops working now — which is the point of reissuing, and the
       line the screen prints. */
    wx_audit($u, '2fa.recovery_new', 'user:' . (int) $u['id'], ['count' => count($codes)]);
    return ['data' => ['codes' => wx_recovery_fmt($codes), 'previousCodesInvalidated' => true]];
}

/** POST /security/alerts — "tell me when someone signs in as me". */
function wx_route_security_alerts(array $ctx): array
{
    $u = wx_require_user('sec_alerts');
    $on = wx_v_bool($ctx['body']['on'] ?? true, 'on');
    $state = wx_security_state((int) $u['id']);
    $state['alerts'] = $on;
    wx_security_state_put((int) $u['id'], $state);
    wx_audit($u, 'security.alerts', 'user:' . (int) $u['id'], ['on' => $on]);
    return ['data' => ['alerts' => $on]];
}
