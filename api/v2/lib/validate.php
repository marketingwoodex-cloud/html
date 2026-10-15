<?php
/**
 * api/v2/lib/validate.php — input checking that names the offending field.
 *
 * Master plan §6.1 shows `error.field: "lines.3.qty"`. That only helps if validation happens here,
 * once, rather than in each route with its own wording. Every function returns a clean value or
 * throws VALIDATION carrying the field path.
 */

declare(strict_types=1);

/** Text with a length window. Control characters are stripped: they have no place in business data. */
function wx_v_string($v, string $field, int $min = 1, int $max = 5000, bool $trim = true): string
{
    if (is_array($v) || is_object($v)) {
        throw ApiError::validation('Expected text', $field);
    }
    $s = (string) $v;
    if ($trim) {
        $s = trim($s);
    }
    $s = (string) preg_replace('~[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]~u', '', $s);
    $len = function_exists('mb_strlen') ? mb_strlen($s) : strlen($s);
    if ($len < $min) {
        throw ApiError::validation($min === 1 ? 'This is required' : 'Use at least ' . $min . ' characters', $field);
    }
    if ($len > $max) {
        throw ApiError::validation('Use at most ' . $max . ' characters', $field);
    }
    return $s;
}

function wx_v_opt_string($v, string $field, int $max = 5000): ?string
{
    if ($v === null || $v === '') {
        return null;
    }
    return wx_v_string($v, $field, 0, $max);
}

function wx_v_int($v, string $field, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): int
{
    if (is_bool($v)) {
        throw ApiError::validation('Expected a whole number', $field);
    }
    if (is_string($v)) {
        $v = trim($v);
        if ($v === '' || !preg_match('~^-?\d+$~', $v)) {
            throw ApiError::validation('Expected a whole number', $field);
        }
    }
    if (!is_numeric($v)) {
        throw ApiError::validation('Expected a whole number', $field);
    }
    $n = (int) $v;
    if ($n < $min) {
        throw ApiError::validation('Must be ' . $min . ' or more', $field);
    }
    if ($n > $max) {
        throw ApiError::validation('Must be ' . $max . ' or less', $field);
    }
    return $n;
}

/** A positive identifier, the common case for a path segment. */
function wx_v_id($v, string $field = 'id'): int
{
    return wx_v_int($v, $field, 1);
}

function wx_v_opt_int($v, string $field, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): ?int
{
    if ($v === null || $v === '') {
        return null;
    }
    return wx_v_int($v, $field, $min, $max);
}

/**
 * Money as a whole number of rupees (PKR).
 *
 * Why whole rupees and not paisa: every money field in this product already lives in v2.1 in whole
 * rupees — `doc_totals()` rounds document totals with `(int)round(...)`, and `pay_add` does
 * `(int)round(numv($in['amount']))`. The old admin keeps running during the cut-over and reads the
 * same columns, so a v2.5 that wrote paisa would be read back as rupees: every invoice off by 100x.
 * Matching the existing unit is worth more than sub-rupee precision nothing in the product uses.
 *
 * Line-item rates inside a document payload keep two decimals, exactly as v2.1 stores them; only the
 * stored totals are whole rupees. `wx_doc_totals()` in lib/money.php is the single implementation of
 * that arithmetic, and it is a deliberate port, not a redesign.
 */
function wx_v_pkr($v, string $field, ?int $min = null, ?int $max = null): int
{
    if (is_int($v)) {
        $rupees = $v;
    } elseif (is_float($v)) {
        $rupees = (int) round($v);
    } else {
        $s = trim((string) $v);
        $s = str_replace([',', ' ', "\xC2\xA0"], '', $s);
        if ($s === '' || !preg_match('~^-?\d+(\.\d{1,4})?$~', $s)) {
            throw ApiError::validation('Expected an amount', $field);
        }
        $rupees = (int) round((float) $s);
    }
    if ($min !== null && $rupees < $min) {
        throw ApiError::validation('Amount is too low', $field);
    }
    if ($max !== null && $rupees > $max) {
        throw ApiError::validation('Amount is too high', $field);
    }
    return $rupees;
}

/** A stored amount, written the way a document writes it: 1234 -> "1,234" */
function wx_pkr_out(int $rupees): string
{
    return number_format($rupees);
}

function wx_v_bool($v, string $field): bool
{
    if (is_bool($v)) {
        return $v;
    }
    $s = is_string($v) ? strtolower(trim($v)) : $v;
    if ($s === '1' || $s === 1 || $s === 'true' || $s === 'yes' || $s === 'on') {
        return true;
    }
    if ($s === '0' || $s === 0 || $s === 'false' || $s === 'no' || $s === 'off' || $s === '' || $s === null) {
        return false;
    }
    throw ApiError::validation('Expected yes or no', $field);
}

function wx_v_email($v, string $field = 'email'): string
{
    $s = strtolower(wx_v_string($v, $field, 3, 190));
    if (!filter_var($s, FILTER_VALIDATE_EMAIL)) {
        throw ApiError::validation('That does not look like an email address', $field);
    }
    return $s;
}

/** One of a fixed set. The message lists the allowed values, which is the whole point of an enum. */
function wx_v_enum($v, array $allowed, string $field, bool $caseSensitive = true): string
{
    $s = wx_v_string($v, $field, 1, 64);
    $hay = $caseSensitive ? $allowed : array_map('strtolower', $allowed);
    $needle = $caseSensitive ? $s : strtolower($s);
    $i = array_search($needle, $hay, true);
    if ($i === false) {
        throw ApiError::validation('Must be one of: ' . implode(', ', $allowed), $field);
    }
    return $allowed[$i];
}

/** YYYY-MM-DD, validated as a real calendar date (2026-02-31 is refused). */
function wx_v_date($v, string $field): string
{
    $s = wx_v_string($v, $field, 10, 10);
    if (!preg_match('~^(\d{4})-(\d{2})-(\d{2})$~', $s, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        throw ApiError::validation('Use the form YYYY-MM-DD', $field);
    }
    return $s;
}

function wx_v_opt_date($v, string $field): ?string
{
    return ($v === null || $v === '') ? null : wx_v_date($v, $field);
}

/**
 * A list of rows, each validated by $fn, with the index in the field path so the client can point at
 * the right row: lines.3.qty.
 */
function wx_v_list($v, string $field, callable $fn, int $max = 500): array
{
    if (!is_array($v) || !array_is_list($v)) {
        throw ApiError::validation('Expected a list', $field);
    }
    if (count($v) > $max) {
        throw ApiError::validation('At most ' . $max . ' items', $field);
    }
    $out = [];
    foreach ($v as $i => $item) {
        $out[] = $fn($item, $field . '.' . $i);
    }
    return $out;
}

/**
 * Copy only the declared keys out of raw input. Anything undeclared is dropped, so a caller cannot
 * set a column by guessing its name.
 */
function wx_v_pick(array $raw, array $fields): array
{
    $out = [];
    foreach ($fields as $k) {
        if (array_key_exists($k, $raw)) {
            $out[$k] = $raw[$k];
        }
    }
    return $out;
}

/** A password, with the policy in one place. */
function wx_v_password($v, string $field = 'password'): string
{
    $s = (string) (is_scalar($v) ? $v : '');
    if (strlen($s) < WX_PW_MIN) {
        throw ApiError::validation('Use at least ' . WX_PW_MIN . ' characters', $field);
    }
    if (strlen($s) > 200) {
        throw ApiError::validation('Too long', $field);
    }
    return $s;
}
