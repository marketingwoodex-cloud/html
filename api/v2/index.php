<?php
/**
 * api/v2/index.php — the front controller.
 *
 * Everything the API does enters and leaves through this file:
 *   1. start an output buffer, so a warning or a stray echo can never corrupt the JSON;
 *   2. mint a request-id;
 *   3. dispatch;
 *   4. wrap the result in the one envelope;
 *   5. catch *everything* — ApiError into its coded envelope, any other Throwable into INTERNAL with
 *      the request-id in the log and a generic message in the body.
 *
 * Step 5 is the v2.1 High finding this closes. admin.php caught PDOException and nothing else, so
 * `display_errors=0` turned every other throw — a TypeError from a null column, a missing include,
 * a json_encode failure — into a blank 200 or 500 that the operator could not trace.
 */

declare(strict_types=1);

if (PHP_VERSION_ID < 70400) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => ['code' => 'INTERNAL', 'message' => 'This server needs PHP 7.4 or newer'], 'meta' => ['requestId' => 'r_boot']]);
    exit;
}

require_once __DIR__ . '/lib/bootstrap.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();

/* A shutdown guard catches fatals that the try/catch cannot, e.g. a memory exhaustion midway. */
register_shutdown_function(static function (): void {
    $err = error_get_last();
    if ($err === null || !in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    error_log('[wx-v2 ' . wx_request_id() . '] fatal: ' . $err['message'] . ' at ' . $err['file'] . ':' . $err['line']);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('X-WX-Request-Id: ' . wx_request_id());
    }
    echo json_encode((new ApiError('INTERNAL', 'Internal error', null, null, ['fatal' => true]))->toEnvelope(wx_request_id()));
});

try {
    $method = wx_method();
    if ($method === 'OPTIONS') {
        // No CORS: this API is same-origin only. Answer the preflight with a refusal, not headers.
        wx_respond(['ok' => false, 'error' => ['code' => 'NOT_FOUND', 'message' => 'No such endpoint'], 'meta' => wx_base_meta()], 404);
    }

    $result = wx_dispatch();

    /* A route may answer with a file (the file manager's zip download). Streaming is the front
       controller's job, exactly like the JSON envelope: the handler decided *whether* the caller may
       have it, this decides how it leaves. */
    if (!empty($result['file'])) {
        wx_send_file($result['file']);
    }

    /* A route may answer with a page (the client's progress link). Same rule as the file above: the handler
       decided whether the caller may have it, the front controller decides how it leaves. */
    if (!empty($result['html'])) {
        wx_send_html($result['html']);
    }

    /* Two doors, two response shapes. A request that arrived as ?action=… came from a v2.1 client,
       which reads payload keys at the top level and `error` as a string; a resource request gets the
       v2 envelope. This is the only branch in the API that knows about the old shape, and it can be
       deleted the day the last v2.1 screen is gone (§14). */
    if (wx_is_legacy_request()) {
        require_once WX_V2_DIR . '/routes/legacy.php';
        wx_legacy_ok($result['data'], $result['meta']);
    }
    wx_ok($result['data'], $result['meta']);
} catch (ApiError $e) {
    wx_fail_request($e);
} catch (Throwable $e) {
    wx_fail_request(wx_error_boundary($e, wx_request_id()));
}
