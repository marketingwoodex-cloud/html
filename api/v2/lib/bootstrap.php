<?php
/**
 * api/v2/lib/bootstrap.php — constants, PHP compatibility shims, includes.
 *
 * Every v2 file starts here. Targets PHP 7.4 (Hostinger shared hosting may still run 7.4) while
 * being strict about types. Included by api/v2/index.php and by the CLI tools in db/.
 *
 * Master plan §6.3: the platform is same-origin; there is no CORS story because there is no
 * cross-origin client. Anything that renders to a browser lives under the same host.
 */

declare(strict_types=1);

/* ------------------------------------------------------------------ PHP 7.4 shims
   PHP 8 string helpers, so the code can use them regardless of the host's PHP version. */
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $h, string $n): bool { return $n === '' || strncmp($h, $n, strlen($n)) === 0; }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(string $h, string $n): bool { return $n === '' || substr($h, -strlen($n)) === $n; }
}
if (!function_exists('str_contains')) {
    function str_contains(string $h, string $n): bool { return $n === '' || strpos($h, $n) !== false; }
}
if (!function_exists('array_is_list')) {
    function array_is_list(array $a): bool { return $a === [] || array_keys($a) === range(0, count($a) - 1); }
}

/* ------------------------------------------------------------------ constants */
if (!defined('WX_V2_DIR'))      define('WX_V2_DIR', __DIR__ ? dirname(__DIR__) : '');           // api/v2
if (!defined('WX_SITE_ROOT'))   define('WX_SITE_ROOT', dirname(dirname(WX_V2_DIR)));            // site root
if (!defined('WX_PRIVATE_DIR')) define('WX_PRIVATE_DIR', WX_SITE_ROOT . '/_private');
if (!defined('WX_DB_FILE'))     define('WX_DB_FILE', WX_PRIVATE_DIR . '/db.json');
if (!defined('WX_V2_VERSION'))  define('WX_V2_VERSION', '2.5.0-p1');
if (!defined('WX_SESSION_COOKIE')) define('WX_SESSION_COOKIE', 'wx_sid');
if (!defined('WX_SESSION_TTL'))    define('WX_SESSION_TTL', 12 * 3600);
if (!defined('WX_PW_MIN'))         define('WX_PW_MIN', 10);
if (!defined('WX_CLI'))            define('WX_CLI', PHP_SAPI === 'cli');

/* Roles are unchanged from v2.1 so existing users keep working (plan §6.3). */
if (!defined('WX_ROLES')) define('WX_ROLES', ['owner', 'admin', 'editor', 'sales', 'support']);
if (!defined('WX_ROLE_LABELS')) define('WX_ROLE_LABELS', [
    'owner' => 'Master', 'admin' => 'Manager', 'editor' => 'Developer', 'sales' => 'Sales', 'support' => 'Support',
]);
/* The stages a project moves through — the same list the v2.1 project screen used, under the names
   v2.5 gives them. It lives here rather than in a route file because two things need it: the projects
   screen, and the client notifications that fire when a project passes a stage. A constant in a route
   file is only defined once that file has been loaded, which is exactly the kind of ordering dependency
   that turns into "notification sent twice" or "fatal: undefined constant". */
if (!defined('WX_PROJECT_STAGES')) define('WX_PROJECT_STAGES', ['planning', 'design', 'production', 'installation', 'handover', 'closed']);
/* What the six stages are called on screen, and the three business lines a project belongs to. Both are
   v2.1's own vocabulary (`sales-lib.php`'s SALES_PSTAGES and `sales17-lib.php`'s S17_LINES), held here so
   the list, the detail, the timeline and the save route cannot disagree about the words — the save route's
   validation list used to be typed out inline, which is one edit away from accepting a line the screens do
   not know about. */
if (!defined('WX_PROJECT_STAGE_LABELS')) define('WX_PROJECT_STAGE_LABELS', [
    'planning'     => 'Planning',
    'design'       => 'Design',
    'production'   => 'Production',
    'installation' => 'Installation',
    'handover'     => 'Handover',
    'closed'       => 'Closed',
]);
if (!defined('WX_PROJECT_LINES')) define('WX_PROJECT_LINES', ['furniture' => 'Furniture', 'interior' => 'Interior', 'project' => 'Project']);

if (!defined('WX_PERM_GROUPS')) define('WX_PERM_GROUPS', [
    'sales'         => 'Leads, pipeline, clients, quotes, invoices, projects, bookings',
    'conversations' => 'Inbox (website chat + WhatsApp)',
    'updates'       => 'Client updates (project messages)',
    'broadcast'     => 'WhatsApp offers, broadcasts and automation',
    'ai'            => 'Train AI and chat settings',
    'website'       => 'Pages, builder, content, media, SEO, theme',
    'settings'      => 'Business info, integrations, notifications, maintenance',
]);

/* ------------------------------------------------------------------ includes
   Order matters: errors → http → store/db → settings → validate → money → audit → auth → caps →
   approvals → router.
   money.php calls wx_v_* (validate) and wx_secret (auth), so caps/router come last but money is
   safe to place after validate because PHP resolves function calls at call time, not at include. */
require_once WX_V2_DIR . '/lib/errors.php';
require_once WX_V2_DIR . '/lib/http.php';
require_once WX_V2_DIR . '/lib/store.php';
require_once WX_V2_DIR . '/lib/settings.php';
require_once WX_V2_DIR . '/lib/db.php';
require_once WX_V2_DIR . '/lib/sqlite.php';
/* docs.php was written but never included, which meant wx_doc_get()/wx_doc_put()/wx_payload_column()
   — the whole document layer the money path is built on — were undefined at runtime. Nothing caught it:
   a lint sees a valid file, and the tests that call into the document layer need a database. The check
   that would have caught it ("every lib is included, or nothing uses it") is in tests/conformance.mjs. */
require_once WX_V2_DIR . '/lib/docs.php';
require_once WX_V2_DIR . '/lib/validate.php';
require_once WX_V2_DIR . '/lib/money.php';
require_once WX_V2_DIR . '/lib/audit.php';
require_once WX_V2_DIR . '/lib/notify.php';
require_once WX_V2_DIR . '/lib/redirects.php';
require_once WX_V2_DIR . '/lib/pages.php';
require_once WX_V2_DIR . '/lib/media.php';
require_once WX_V2_DIR . '/lib/files.php';
require_once WX_V2_DIR . '/lib/chrome.php';
require_once WX_V2_DIR . '/lib/announce.php';
require_once WX_V2_DIR . '/lib/content.php';
require_once WX_V2_DIR . '/lib/ai.php';
require_once WX_V2_DIR . '/lib/blocks.php';
require_once WX_V2_DIR . '/lib/placements.php';
require_once WX_V2_DIR . '/lib/heroes.php';
require_once WX_V2_DIR . '/lib/forms.php';
require_once WX_V2_DIR . '/lib/clientview.php';
require_once WX_V2_DIR . '/lib/templates.php';
require_once WX_V2_DIR . '/lib/business.php';
require_once WX_V2_DIR . '/lib/pageedit.php';
require_once WX_V2_DIR . '/lib/seo.php';
require_once WX_V2_DIR . '/lib/connectors.php';
require_once WX_V2_DIR . '/lib/theme.php';
require_once WX_V2_DIR . '/lib/fetch.php';
require_once WX_V2_DIR . '/lib/auth.php';
require_once WX_V2_DIR . '/lib/caps.php';
require_once WX_V2_DIR . '/lib/approvals.php';
require_once WX_V2_DIR . '/lib/router.php';

/**
 * Where the browser-facing half of the product lives. v2.1 served /admin/; v2.5 ships the React
 * build to /admin/v25/ and keeps /admin/ alive until cut-over (plan §14 strangler).
 */
if (!function_exists('wx_spa_url')) {
    function wx_spa_url(string $path = ''): string
    {
        return '/admin/v25/' . ltrim($path, '/');
    }
}
