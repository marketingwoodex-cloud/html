<?php
/**
 * api/v2/routes/auth.php — sign in, two-step sign in, sign out.
 *
 * The login response is the only place a CSRF token is issued with a fresh session (and /me re-issues
 * one after a reload). Both are same-origin JSON, so a cross-site page can neither read the token
 * nor set the header.
 */

declare(strict_types=1);

function wx_route_login(array $ctx): array
{
    /* The field is called `email` on the wire, but what arrives may be a sign-in name — v2.1's first-run
       account is `admin`. The form says "Email or sign-in name", so this accepts either and leaves the
       resolution (email first, then an unambiguous name) to wx_login(). */
    $ident = wx_v_string($ctx['body']['email'] ?? '', 'email', 1, 190);
    $password = wx_v_string($ctx['body']['password'] ?? '', 'password', 1, 200, false);
    $result = wx_login($ident, $password);
    return ['data' => $result, 'meta' => ['signedIn' => empty($result['need2fa'])]];
}

function wx_route_login_2fa(array $ctx): array
{
    $ticket = wx_v_string($ctx['body']['ticket'] ?? '', 'ticket', 10, 200);
    $code = wx_v_string($ctx['body']['code'] ?? '', 'code', 4, 12);
    return ['data' => wx_login_2fa($ticket, $code)];
}

function wx_route_logout(array $ctx): array
{
    $u = wx_current_user();
    if ($u !== null) {
        // A logout is a state change, so it needs the CSRF header; but a stale token must not trap
        // a user in a session they want to end, so a failure here still revokes.
        wx_session_revoke();
        wx_clear_cookie(WX_SESSION_COOKIE);
        wx_audit($u, 'logout', 'user:' . $u['id']);
    } else {
        wx_clear_cookie(WX_SESSION_COOKIE);
    }
    return ['data' => ['signedOut' => true]];
}
