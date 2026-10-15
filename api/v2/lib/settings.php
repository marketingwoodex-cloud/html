<?php
/**
 * api/v2/lib/settings.php — small read/write helpers for wx_settings.
 *
 * The table is key/value on purpose: the migration seeds sensible defaults, and a host can change a
 * threshold or a company detail without a deploy. Reads are cached per request because a single page
 * may ask for the same setting a dozen times (company identity is read for every document header).
 */

declare(strict_types=1);

/** The stored string, or $default when the key has never been set. */
function wx_setting(string $k, ?string $default = null): ?string
{
    $all = wx_settings_all();
    return array_key_exists($k, $all) ? $all[$k] : $default;
}

/** Every setting, one query per request. */
function wx_settings_all(): array
{
    return wx_once('settings.all', static function (): array {
        $out = [];
        if (!wx_table_exists('wx_settings')) {
            return $out;
        }
        foreach (wx_all('SELECT k, v FROM wx_settings') as $r) {
            $out[(string) $r['k']] = (string) $r['v'];
        }
        return $out;
    });
}

/** Write a setting, inserting it if this host has never had it. */
function wx_setting_set(string $k, string $v): void
{
    $exists = wx_val('SELECT k FROM wx_settings WHERE k = ?', [$k]);
    if ($exists === null) {
        wx_insert('wx_settings', ['k' => $k, 'v' => $v]);
    } else {
        wx_update('wx_settings', ['v' => $v], ['k' => $k]);
    }
    // Drop the per-request cache so the rest of this request sees the new value.
    unset($GLOBALS['WX_ONCE'][wx_request_generation()]['settings.all']);
}

/** A boolean setting: '1', 'true', 'yes', 'on' all mean yes. */
function wx_setting_bool(string $k, bool $default = false): bool
{
    $v = wx_setting($k, null);
    if ($v === null || $v === '') {
        return $default;
    }
    return in_array(strtolower(trim($v)), ['1', 'true', 'yes', 'on'], true);
}
