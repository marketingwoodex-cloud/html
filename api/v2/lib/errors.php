<?php
/**
 * api/v2/lib/errors.php — the closed error set and the exception that carries it.
 *
 * Master plan §6.1: every failure is one of eight codes. Nothing else may reach a client, so an
 * unexpected throw is reported as INTERNAL with a request-id the operator can grep for, never as a
 * blank page (the v2.1 behaviour: display_errors=0 and only PDOException caught).
 */

declare(strict_types=1);

/** The eight codes. Adding one is an API version change, not a patch. */
const WX_ERROR_CODES = ['AUTH', 'FORBIDDEN', 'VALIDATION', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMIT', 'UPSTREAM', 'INTERNAL'];

/** code → default HTTP status. A call site can override with an explicit status. */
const WX_ERROR_STATUS = [
    'AUTH'       => 401,
    'FORBIDDEN'  => 403,
    'VALIDATION' => 422,
    'NOT_FOUND'  => 404,
    'CONFLICT'   => 409,
    'RATE_LIMIT' => 429,
    'UPSTREAM'   => 502,
    'INTERNAL'   => 500,
];

/**
 * Every deliberate refusal in v2 is one of these. Thrown freely; caught once, in the front
 * controller, and turned into an envelope.
 */
final class ApiError extends Exception
{
    /** @var string one of WX_ERROR_CODES */
    public $code;

    /** @var string|null dotted path of the offending input, e.g. "lines.3.qty" */
    public $field;

    /** @var int */
    public $status;

    /** @var array non-secret extras for the logs (never sent to the client verbatim) */
    public $context;

    public function __construct(string $code, string $message, ?int $status = null, ?string $field = null, array $context = [], ?Throwable $previous = null)
    {
        if (!in_array($code, WX_ERROR_CODES, true)) {
            // A typo must not invent a ninth code.
            $context['invalid_code'] = $code;
            $code = 'INTERNAL';
            $message = 'Internal error';
        }
        parent::__construct($message, 0, $previous);
        $this->code = $code;
        $this->field = $field;
        $this->status = $status ?? (WX_ERROR_STATUS[$code] ?? 500);
        $this->context = $context;
    }

    /* ------------------------------------------------------------ constructors */
    public static function auth(string $m = 'Sign in to continue', ?string $field = null): self
    {
        return new self('AUTH', $m, null, $field);
    }

    public static function forbidden(string $m = 'Your role does not have permission for this', ?string $field = null): self
    {
        return new self('FORBIDDEN', $m, null, $field);
    }

    public static function validation(string $m, ?string $field = null): self
    {
        return new self('VALIDATION', $m, null, $field);
    }

    public static function notFound(string $m = 'Not found'): self
    {
        return new self('NOT_FOUND', $m);
    }

    public static function conflict(string $m, array $context = []): self
    {
        return new self('CONFLICT', $m, null, null, $context);
    }

    public static function rateLimit(string $m = 'Too many attempts — try again shortly'): self
    {
        return new self('RATE_LIMIT', $m);
    }

    public static function upstream(string $m = 'An upstream service failed', array $context = []): self
    {
        return new self('UPSTREAM', $m, null, null, $context);
    }

    public static function internal(string $m = 'Internal error', array $context = []): self
    {
        return new self('INTERNAL', $m, null, null, $context);
    }

    /** The client-facing body. Context stays in the log — it can hold SQL fragments. */
    public function toEnvelope(string $requestId, float $took = 0.0): array
    {
        $error = ['code' => $this->code, 'message' => $this->getMessage()];
        if ($this->field !== null) {
            $error['field'] = $this->field;
        }
        return [
            'ok' => false,
            'error' => $error,
            'meta' => ['requestId' => $requestId, 'took' => $took, 'version' => WX_V2_VERSION],
        ];
    }
}

/**
 * The last line of the error boundary. An unexpected throwable is logged with its request-id and
 * reported as INTERNAL; the message is deliberately generic because it may contain credentials.
 */
function wx_error_boundary(Throwable $e, string $requestId): ApiError
{
    if ($e instanceof ApiError) {
        return $e;
    }
    $line = $e->getFile() . ':' . $e->getLine();
    error_log('[wx-v2 ' . $requestId . '] ' . get_class($e) . ' ' . $e->getMessage() . ' at ' . $line);
    return new ApiError('INTERNAL', 'Internal error', null, null, [
        'class' => get_class($e),
        'at' => $line,
    ], $e);
}

/**
 * Run a callable and convert any PDO/other failure into an ApiError, so a route never leaks a
 * driver message. $what names the operation in the log, e.g. "leads.save".
 */
function wx_guard(string $what, callable $fn)
{
    try {
        return $fn();
    } catch (ApiError $e) {
        throw $e;
    } catch (PDOException $e) {
        error_log('[wx-v2] ' . $what . ': SQLSTATE ' . $e->getCode() . ' ' . $e->getMessage());
        throw ApiError::internal('The database could not complete that request', ['sqlstate' => (string) $e->getCode(), 'op' => $what]);
    } catch (Throwable $e) {
        error_log('[wx-v2] ' . $what . ': ' . get_class($e) . ' ' . $e->getMessage());
        throw ApiError::internal('That operation failed', ['op' => $what]);
    }
}
