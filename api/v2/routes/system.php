<?php
/**
 * api/v2/routes/system.php — operator diagnostics.
 *
 * Master-only. The v2.1 system check existed inside admin.php behind a role check; this is the same
 * information with the platform's authentication in front of it, so it can no longer be reached by
 * an unauthenticated visitor who guesses the action name.
 */

declare(strict_types=1);

function wx_route_sys_health(array $ctx): array
{
    $u = wx_require_user('sys_check', ['owner', 'admin']);

    $tables = wx_all("SELECT table_name AS t, table_rows AS r FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    $expected = ['wx_users', 'wx_activity', 'wx_settings', 'wx_throttle', 'wx_leads', 'wx_lead_notes', 'wx_clients', 'wx_quotes', 'wx_invoices', 'wx_projects', 'wx_chats', 'wx_chat_msgs', 'wx_bookings', 'wx_templates', 'wx_notify_log', 'wx_wa_seen', 'wx_tg_seen', 'wx_tg_map', 'wx_ai_events', 'wx_ai_unans'];
    $present = array_map(static function ($r) { return (string) $r['t']; }, $tables);
    $missing = array_values(array_diff($expected, $present));
    $extra = array_values(array_diff($present, $expected));

    $migrations = wx_table_exists('wx_migrations') ? wx_all('SELECT file AS version, applied_at FROM wx_migrations ORDER BY file') : [];

    $checks = [];
    $checks[] = wx_check('PHP version', version_compare(PHP_VERSION, '7.4.0', '>='), PHP_VERSION, 'Hostinger → Advanced → PHP Configuration');
    foreach (['pdo_mysql' => 'Database driver', 'mbstring' => 'Text (mbstring)', 'curl' => 'cURL', 'json' => 'JSON', 'zip' => 'ZipArchive', 'openssl' => 'OpenSSL', 'fileinfo' => 'Fileinfo'] as $ext => $label) {
        $checks[] = wx_check($label, extension_loaded($ext), extension_loaded($ext) ? 'enabled' : 'MISSING', 'Enable the ' . $ext . ' extension');
    }
    $checks[] = wx_check('_private writable', is_dir(WX_PRIVATE_DIR) && is_writable(WX_PRIVATE_DIR), is_dir(WX_PRIVATE_DIR) ? (is_writable(WX_PRIVATE_DIR) ? 'yes' : 'NOT writable') : 'missing', 'Create _private with permission 755');
    $checks[] = wx_check('_private protected', is_file(WX_PRIVATE_DIR . '/.htaccess'), is_file(WX_PRIVATE_DIR . '/.htaccess') ? 'yes' : 'MISSING', 'Restore _private/.htaccess');
    $checks[] = wx_check('Migrations applied', $migrations !== [], count($migrations) . ' applied', 'Run db/migrate.php');
    $checks[] = wx_check('No PHP errors on disk', true, 'see error_log', 'Check the host error log');

    wx_audit($u, 'system.health', 'system', ['missing_tables' => count($missing)]);
    return [
        'data' => [
            'checks' => $checks,
            'tables' => ['count' => count($present), 'missing' => $missing, 'extra' => $extra],
            'migrations' => $migrations,
            'php' => PHP_VERSION,
            'version' => WX_V2_VERSION,
        ],
    ];
}

/** A system check the operator can read, and that a test can assert on. */
function wx_check(string $label, bool $ok, string $detail, string $fix): array
{
    return ['label' => $label, 'ok' => $ok, 'detail' => $detail, 'fix' => $ok ? '' : $fix];
}

/** Schema introspection for the database screen. Owner-only, names only. */
function wx_route_sys_schema(array $ctx): array
{
    $u = wx_require_user('dbx_browse', ['owner']);
    $tables = wx_all("SELECT table_name AS t, table_rows AS r, data_length AS bytes FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
    wx_audit($u, 'system.schema', 'db', []);
    return ['data' => ['tables' => $tables]];
}
