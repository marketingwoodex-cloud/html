<?php
/**
 * tests/harness.php — the request harness both gate scripts drive the platform with.
 *
 * Extracted from tests/roundtrip.php so the Phase 2 gate (tests/money-path.php) exercises the front
 * controller exactly as the Phase 1 gate does. There is one implementation of `request()`: if the two
 * gates disagreed about how a request is formed, one of them would be testing a platform that does not
 * exist.
 *
 * The trick that makes it possible is capture mode (WX_RESPOND_CAPTURE in lib/http.php): wx_respond()
 * records its envelope instead of exiting the process, so a single PHP process can make many requests
 * in order — signing in, writing with a CSRF header, then asserting what the next request sees.
 *
 * Requires: bootstrap.php already loaded, and WX_RESPOND_CAPTURE defined.
 */

declare(strict_types=1);

function step(string $n, string $what): void
{
    echo "\n  " . $n . '. ' . $what . "\n";
}
function ok(bool $cond, string $what): void
{
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "     ✓ " . $what . "\n";
        return;
    }
    $failed++;
    echo "     ✗ " . $what . "\n";
}
function eq($a, $b, string $what): void
{
    if ($a !== $b) {
        echo "       got:      " . var_export($a, true) . "\n";
        echo "       expected: " . var_export($b, true) . "\n";
    }
    ok($a === $b, $what);
}

/**
 * Build a request and run it through the dispatch + envelope path, exactly as index.php does.
 * Returns the response the front controller would have written.
 */
function request(string $method, array $segments, array $options = []): array
{
    $GLOBALS['WX_RESPONSES'] = [];
    $GLOBALS['WX_TEST_SET_COOKIE'] = null;

    $_SERVER['REQUEST_METHOD'] = $method;
    $_SERVER['REQUEST_URI'] = '/api/v2/' . implode('/', $segments);
    $_SERVER['SCRIPT_NAME'] = '/api/v2/index.php';
    $_SERVER['PATH_INFO'] = '/' . implode('/', $segments);
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    $_SERVER['HTTP_USER_AGENT'] = 'woodex-roundtrip/1.0';
    $_SERVER['HTTP_X_WX_REQUEST_ID'] = 'r_' . bin2hex(random_bytes(4));

    $_GET = $options['query'] ?? [];
    $_POST = [];
    $_COOKIE = $options['cookie'] ?? [];
    if (isset($options['csrf'])) {
        $_SERVER['HTTP_X_WX_CSRF'] = $options['csrf'];
    } else {
        unset($_SERVER['HTTP_X_WX_CSRF']);
    }

    // The body is read from php://input, which a test cannot write to, so hand it over directly.
    $GLOBALS['WX_TEST_BODY'] = $options['body'] ?? [];

    // wx_body() caches per request; the static cache must not leak between simulated requests.
    wx_reset_request_cache();

    try {
        $result = wx_dispatch();
        wx_ok($result['data'], $result['meta']);
    } catch (ApiError $e) {
        wx_fail($e);
    } catch (Throwable $e) {
        wx_fail(wx_error_boundary($e, wx_request_id()));
    }
    $response = $GLOBALS['WX_RESPONSES'][0] ?? ['status' => 0, 'body' => null];
    $response['cookie'] = $GLOBALS['WX_TEST_SET_COOKIE'];
    return $response;
}

/** Pull the session cookie out of a Set-Cookie header value. */
function cookie_from(?string $setCookie): array
{
    if (!$setCookie) {
        return [];
    }
    if (preg_match('~^' . WX_SESSION_COOKIE . '=([^;]*)~', $setCookie, $m)) {
        return $m[1] === '' ? [] : [WX_SESSION_COOKIE => $m[1]];
    }
    return [];
}
