<?php
/**
 * api/v2/lib/router.php — resource routing plus the v2.1 alias bridge.
 *
 * Master plan §6.2: "a noun is a resource; a verb becomes a method or a sub-resource", and the 364
 * v2.1 action names survive as an alias table so nothing breaks mid-migration. The alias table is
 * generated from the live dispatcher by tools/gen-aliases.mjs, which is what makes the
 * "cannot drift" promise in the plan checkable rather than aspirational.
 *
 * A request may arrive in any of these shapes; all resolve to the same handler:
 *
 *   GET  /api/v2/leads?stage=new                     resource + query
 *   GET  /api/v2/index.php?path=leads                no mod_rewrite
 *   POST /api/v2/index.php?action=leads_list         v2.1 alias
 *   POST /api/v2/leads                                JSON body
 *   GET  /api/v2/index.php/leads/12                  PATH_INFO
 */

declare(strict_types=1);

/**
 * The route register. Pattern segments in braces capture as params.
 * [method, pattern, handler-file, function, action-name-for-permissions]
 */
function wx_routes(): array
{
    static $routes = null;
    if ($routes !== null) {
        return $routes;
    }
    $routes = [
        /* ---------------------------------------------------------- platform */
        ['GET',    'health',                          'health', 'wx_route_health',        null],
        ['GET',    'version',                         'health', 'wx_route_version',       null],

        /* ---------------------------------------------------------- auth (public) */
        ['POST',   'auth/login',                      'auth',   'wx_route_login',         null],
        ['POST',   'auth/login/2fa',                  'auth',   'wx_route_login_2fa',     null],
        ['POST',   'auth/logout',                     'auth',   'wx_route_logout',        null],

        /* ---------------------------------------------------------- me */
        ['GET',    'me',                              'me',     'wx_route_me',            null],
        ['PATCH',  'me',                              'me',     'wx_route_me_save',       'me_save'],
        ['POST',   'me/password',                     'me',     'wx_route_password',      'password'],
        ['GET',    'me/sessions',                     'me',     'wx_route_sessions',      'sec_get'],
        ['DELETE', 'me/sessions',                     'me',     'wx_route_sessions_revoke', 'sec_revoke'],

        /* ---------------------------------------------------------- dashboard */
        ['GET',    'dashboard',                       'dashboard', 'wx_route_dashboard',  'dashboard'],

        /* ---------------------------------------------------------- leads */
        ['GET',    'leads',                           'leads',  'wx_route_leads_list',    'list_leads'],
        ['POST',   'leads',                           'leads',  'wx_route_leads_save',    'lead_save'],
        ['GET',    'leads/{id}',                      'leads',  'wx_route_leads_get',     'get_lead'],
        ['PATCH',  'leads/{id}',                      'leads',  'wx_route_leads_save',    'lead_save'],
        ['DELETE', 'leads/{id}',                      'leads',  'wx_route_leads_delete',  'lead_delete'],
        ['GET',    'leads/{id}/notes',                'leads',  'wx_route_leads_notes',   'get_lead'],
        ['POST',   'leads/{id}/notes',                'leads',  'wx_route_lead_note_add', 'add_lead_note'],

        /* ---------------------------------------------------------- activity */
        ['GET',    'activity',                        'dashboard', 'wx_route_activity',   'activity'],

        /* ------------------------------------------------------- quotations
           The chain the Phase 2 gate names: a lead is quoted, the quotation is approved, it becomes
           an invoice, the invoice is paid — all without the v2.1 admin. */
        ['GET',    'quotations',                      'quotations', 'wx_route_quotes_list',    'list_quotes'],
        ['POST',   'quotations',                      'quotations', 'wx_route_quotes_save',    'quote_save'],
        ['GET',    'quotations/{id}',                 'quotations', 'wx_route_quotes_get',     'get_quote'],
        ['PATCH',  'quotations/{id}',                 'quotations', 'wx_route_quotes_save',    'quote_save'],
        ['DELETE', 'quotations/{id}',                 'quotations', 'wx_route_quotes_delete',  'quote_delete'],
        ['POST',   'quotations/{id}/status',          'quotations', 'wx_route_quotes_status',  'quote_status'],
        ['POST',   'quotations/{id}/revise',          'quotations', 'wx_route_quotes_revise',  'create_quote_draft'],
        ['POST',   'quotations/{id}/invoice',         'quotations', 'wx_route_quotes_invoice', 'quote_invoice'],

        /* Quotation templates. Declared before `quotations/{id}` reads them, and the paths are their own
           segment (`templates`) rather than a number, so a template id can never be mistaken for a
           quotation's. */
        ['GET',    'quotations/templates',            'quotations', 'wx_route_tpl_list',       'tpl_list'],
        ['POST',   'quotations/templates',            'quotations', 'wx_route_tpl_save',       'tpl_save'],
        ['POST',   'quotations/templates/import',     'quotations', 'wx_route_tpl_import',     'tpl_import'],
        ['PATCH',  'quotations/templates/{id}',       'quotations', 'wx_route_tpl_save',       'tpl_save'],
        ['DELETE', 'quotations/templates/{id}',       'quotations', 'wx_route_tpl_delete',     'tpl_delete'],

        /* --------------------------------------------------------- invoices */
        ['GET',    'invoices',                        'invoices', 'wx_route_invoices_list',    'invs_list'],
        ['GET',    'invoices/{id}',                   'invoices', 'wx_route_invoices_get',     'inv_get'],
        ['PATCH',  'invoices/{id}',                   'invoices', 'wx_route_invoices_save',    'inv_save'],
        ['DELETE', 'invoices/{id}',                   'invoices', 'wx_route_invoices_delete',  'inv_save'],
        ['GET',    'invoices/summary',                'invoices', 'wx_route_invoices_summary', 'invs_tracker'],
        ['POST',   'invoices/{id}/payments',          'invoices', 'wx_route_invoices_pay',     'pay_add'],
        ['DELETE', 'invoices/{id}/payments/{payment}','invoices', 'wx_route_invoices_pay_delete', 'pay_delete'],

        /* ---------------------------------------------------------- payments */
        ['GET',    'payments',                        'invoices', 'wx_route_payments_list',    'invs_tracker'],

        /* ---------------------------------------------------------- projects */
        ['GET',    'projects',                        'projects', 'wx_route_projects_list',    'projs_table'],
        ['GET',    'projects/{id}',                   'projects', 'wx_route_projects_get',     'proj_meta'],
        ['PATCH',  'projects/{id}',                   'projects', 'wx_route_projects_save',    'proj_meta'],
        ['POST',   'projects/{id}/updates',           'projects', 'wx_route_projects_update',  'proj_meta'],
        ['POST',   'projects/{id}/bill',              'projects', 'wx_route_projects_bill',    'proj_bill'],

        /* --------------------------------------------------------- approvals */
        ['GET',    'approvals',                       'approvals', 'wx_route_approvals_list',      'appr_list'],
        ['GET',    'approvals/count',                 'approvals', 'wx_route_approvals_count',     'appr_count'],
        ['GET',    'approvals/config',                'approvals', 'wx_route_approvals_cfg_get',   'appr_cfg_get'],
        ['POST',   'approvals/config',                'approvals', 'wx_route_approvals_cfg_save',  'appr_cfg_save'],
        ['GET',    'approvals/{id}',                  'approvals', 'wx_route_approvals_get',       'appr_get'],
        ['POST',   'approvals/{id}/approve',          'approvals', 'wx_route_approvals_approve',   'appr_apply'],
        ['POST',   'approvals/{id}/reject',           'approvals', 'wx_route_approvals_reject',    'appr_reject'],
        ['POST',   'approvals/{id}/cancel',           'approvals', 'wx_route_approvals_cancel',    'appr_cancel'],

        /* ----------------------------------------------------------- clients
           Three read shapes of one resource: the list, one client in full, and the conversations.
           `clients_master` and `client_360` are v2.1's own action names, so the permission each route
           asks for is the permission v2.1 already granted — a salesperson who could open the client
           master still can, and support's read-only view of client_360 is still read-only. */
        ['GET',    'clients',                         'clients', 'wx_route_clients_list',    'clients_master'],
        ['POST',   'clients',                         'clients', 'wx_route_clients_save',    'client_save'],
        ['POST',   'clients/link',                    'clients', 'wx_route_clients_link',    'clients_link'],
        ['GET',    'clients/{id}',                    'clients', 'wx_route_clients_get',     'client_360'],
        ['PATCH',  'clients/{id}',                    'clients', 'wx_route_clients_save',    'client_save'],
        ['DELETE', 'clients/{id}',                    'clients', 'wx_route_clients_delete',  'client_delete'],
        ['POST',   'clients/{id}/merge',              'clients', 'wx_route_clients_merge',   'clients_merge'],
        ['GET',    'clients/{id}/comms',              'clients', 'wx_route_clients_comms',   'client_comms'],

        /* ------------------------------------------------------------ inbox
           One conversation list for the widget, WhatsApp and Telegram. `chat_*` is in the approval
           policy's never-queue list: answering a customer cannot wait for the Master to wake up. */
        ['GET',    'chats',                        'chats', 'wx_route_chats_list',     'chat_list'],
        ['GET',    'chats/settings',               'chats', 'wx_route_chats_cfg_get',  'chat_cfg_get'],
        ['POST',   'chats/settings',               'chats', 'wx_route_chats_cfg_save', 'chat_cfg_save'],
        ['POST',   'chats/test',                   'chats', 'wx_route_chats_test',     'chat_test'],
        ['GET',    'chats/{id}',                   'chats', 'wx_route_chats_get',      'chat_get'],
        ['POST',   'chats/{id}/reply',             'chats', 'wx_route_chats_reply',    'chat_reply'],
        ['POST',   'chats/{id}/note',              'chats', 'wx_route_chats_note',     'chat_note'],
        ['POST',   'chats/{id}/mode',              'chats', 'wx_route_chats_mode',     'chat_mode'],
        ['POST',   'chats/{id}/assign',            'chats', 'wx_route_chats_assign',   'chat_assign'],
        ['POST',   'chats/{id}/close',             'chats', 'wx_route_chats_close',    'chat_close'],
        ['POST',   'chats/{id}/tags',              'chats', 'wx_route_chats_tags',     'chat_tags'],
        ['POST',   'chats/{id}/lead',              'chats', 'wx_route_chats_lead',     'chat_lead'],
        ['POST',   'chats/{id}/typing',            'chats', 'wx_route_chats_typing',   'chat_typing'],
        ['POST',   'chats/{id}/file',              'chats', 'wx_route_chats_file',     'chat_file'],
        ['POST',   'chats/{id}/suggest',           'chats', 'wx_route_chats_suggest',  'chat_suggest'],

        /* ---------------------------------------------------------- bookings
           The last three are the public booking form: no session, so they are rate-limited and
           honeypot-aware, and they create the lead as well as the booking. */
        ['GET',    'bookings',                        'bookings', 'wx_route_bookings_list',      'bk_list'],
        ['POST',   'bookings',                        'bookings', 'wx_route_bookings_save',      'bk_save'],
        ['GET',    'bookings/availability',           'bookings', 'wx_route_bookings_slots',     'bk_slots'],
        ['GET',    'bookings/settings',               'bookings', 'wx_route_bookings_cfg_get',   'bk_cfg'],
        ['POST',   'bookings/settings',               'bookings', 'wx_route_bookings_cfg_save',  'bk_cfg_save'],
        ['PATCH',  'bookings/{id}',                   'bookings', 'wx_route_bookings_save',      'bk_save'],
        ['POST',   'bookings/{id}/status',            'bookings', 'wx_route_bookings_status',    'bk_status'],
        ['GET',    'book/config',                     'bookings', 'wx_route_book_config',         null],
        ['GET',    'book/slots',                      'bookings', 'wx_route_book_slots',          null],
        ['POST',   'book',                            'bookings', 'wx_route_book_create',         null],

        /* -------------------------------------------------- people and security
           `users` and `user_save` are the two v2.1 action names for this screen; the capability matrix
           already restricts them to owner and admin (wx_action_roles), and user_save's group is
           `master`, which only the owner holds — so an admin can read the list and cannot change it.
           The security block is the `self` group: a person always manages their own account. */
        ['GET',    'users',                           'users',    'wx_route_users_list',              'users'],
        ['POST',   'users',                           'users',    'wx_route_users_save',              'user_save'],
        ['PATCH',  'users/{id}',                      'users',    'wx_route_users_save',              'user_save'],
        ['POST',   'users/{id}/2fa-reset',            'users',    'wx_route_users_2fa_reset',         'sec_2fa_reset'],
        ['DELETE', 'users/{id}/sessions',             'users',    'wx_route_users_sessions_revoke',   'sec_revoke'],

        ['GET',    'security',                        'security', 'wx_route_security_get',            'sec_get'],
        ['POST',   'security/2fa/begin',              'security', 'wx_route_security_2fa_begin',      'sec_2fa_begin'],
        ['POST',   'security/2fa/enable',             'security', 'wx_route_security_2fa_enable',     'sec_2fa_enable'],
        ['POST',   'security/2fa/disable',            'security', 'wx_route_security_2fa_disable',    'sec_2fa_disable'],
        ['POST',   'security/recovery',               'security', 'wx_route_security_recovery',       'sec_recovery_new'],
        ['POST',   'security/alerts',                 'security', 'wx_route_security_alerts',         'sec_alerts'],

        /* ------------------------------------------------------- delivery and SEO
           The redirect list is a file on the public server (`.htaccess`), so writing it is a change to
           what the world sees; the 404 report is public because the people who hit a 404 are exactly
           the people who have no session. Both are described in routes/redirects.php. */
        ['GET',    'redirects',                       'redirects', 'wx_route_redirects_list',  'redirects'],
        ['POST',   'redirects',                       'redirects', 'wx_route_redirects_save',  'redirects_save'],
        ['POST',   'redirects/plan',                  'redirects', 'wx_route_redirects_plan',  'redirects_plan'],
        ['GET',    '404s',                            'redirects', 'wx_route_r404_list',       'r404_list'],
        ['DELETE', '404s',                            'redirects', 'wx_route_r404_clear',      'r404_clear'],
        ['POST',   'r404',                            'redirects', 'wx_route_r404_report',     null],

        /* ------------------------------------------------------------- the library
           Phase 3: the pages, the pictures and the files. `pages` has no v2.1 alias (v2.1 had no pages
           API — screens wrote HTML directly and kept a copy), so its routes carry a null action and are
           checked by role. The media and file actions keep their v2.1 names, because the policy that
           decides what a Manager must ask the Master about is written in those names. */
        ['GET',    'pages',                           'pages', 'wx_route_pages_list',      null],
        ['GET',    'pages/search',                    'pages', 'wx_route_pages_search',    null],
        ['GET',    'pages/history',                   'pages', 'wx_route_pages_changes',   null],
        /* The write carries v2.1's builder action `save`, not an invented one: v2.1 queued a Manager's page
           save for the Master (`APPR_BUILDER_WRITE`), and a route named `page_write` would have slipped past
           the policy's verbs and quietly stopped asking — a Manager could edit any of the 150 pages while
           needing approval to change a section block. */
        ['POST',   'pages',                           'pages', 'wx_route_pages_write',     'save'],
        /* `null` in this column means "no v2.1 action to check the permission against" — a v2.5-only route,
           checked by role in its handler. The approval action it passes to the gate is a different thing and
           is `page_rollback`, which the policy names as never queued with its reason. */
        ['POST',   'pages/rollback',                  'pages', 'wx_route_pages_rollback',  null],
        ['POST',   'pages/new',                       'pages', 'wx_route_pages_new',       'page_new'],
        /* Publishing is v2.1's `page_meta_save`: it writes the head and one word in `_private/pages.json`,
           and the sitemap follows both ways. */
        ['POST',   'pages/{rel:any}/publish',         'pages', 'wx_route_pages_publish',   'page_meta_save'],
        /* v2.1's `fetch_page`: read another site's page so sections can be picked out of it. */
        ['POST',   'pages/fetch',                     'pages', 'wx_route_pages_fetch',     'fetch_page'],
        ['GET',    'pages/backups',                 'pages', 'wx_route_pages_backups',   'backups'],
        ['GET',    'pages/{rel:any}',                 'pages', 'wx_route_pages_get',       null],
        ['POST',   'pages/{rel:any}/restore',         'pages', 'wx_route_pages_restore',   'restore'],

        /* ------------------------------------------------------------- the site theme
           v2.1's builder wrote a `theme.css` every page linked. This site has no such file — the live pages
           load `/assets/site.css` — so the port keeps the settings and their validation and writes a marked
           block into the stylesheet the site actually reads. `theme` is on the builder's write list, and the
           gate is told so: a Manager's theme change waits for the Master here as it did there.
           The rollback's action is named in `WX_APPR_NEVER` with its reason — an undo does not queue. */
        ['GET',    'theme',                           'theme', 'wx_route_theme_get',       'theme_get'],
        ['POST',   'theme',                           'theme', 'wx_route_theme_save',      'theme'],
        ['POST',   'theme/rollback',                  'theme', 'wx_route_theme_rollback',  null],

        /* ------------------------------------------------------------- findability
           Phase 3's last screen for the site itself. The `seo_*` actions are v2.1's, because the approval policy
           is keyed on those names: `seo_save` ends in `save` and a Manager's change waits for the Master, while
           `seo_sitemap` is named in `WX_APPR_NEVER` with its reason (a sitemap is derived from the pages).
           A page's address is a path, so these carry `{rel:any}` — `insights/kitchens/index.html` is three
           segments. `seo/audit` is a GET: it recomputes the scores and stores nothing, which is the one thing
           it does differently from the v2.1 action it is named after. */
        ['GET',    'seo/pages',                       'seo',   'wx_route_seo_pages',       'seo_list'],
        ['GET',    'seo/audit',                       'seo',   'wx_route_seo_audit',       'seo_scores'],
        ['GET',    'seo/robots',                      'seo',   'wx_route_seo_robots',      'seo_list'],
        ['POST',   'seo/robots',                      'seo',   'wx_route_seo_robots_save', 'seo_robots_save'],
        ['GET',    'seo/sitemap',                     'seo',   'wx_route_seo_sitemap',     'seo_sitemap'],
        ['POST',   'seo/sitemap',                     'seo',   'wx_route_seo_sitemap_rebuild', 'seo_sitemap'],
        ['GET',    'seo/pages/{rel:any}',             'seo',   'wx_route_seo_page',        'seo_page'],
        ['POST',   'seo/pages/{rel:any}/suggest',     'seo',   'wx_route_seo_suggest',     'seo_ai'],
        ['POST',   'seo/pages/{rel:any}',             'seo',   'wx_route_seo_save',        'seo_save'],

        /* ------------------------------------------------------------ the studio's integrations
           v2.1's Settings → Integrations: 24 cards in a gallery and the records behind seven actions. Five of
           the seven have a route — the other two (`conn_gmail_send`, `conn_gmail_use`) are a real SMTP client
           this API does not have yet, and `wx_conn_list()` says so where the screen can read it. The action
           names are v2.1's: `conn_save`/`conn_delete` queue for a Manager, `conn_test` is skipped by the
           policy's `_test` rule, and `conn_push` is in `WX_APPR_NEVER` with its reason (the cron calls the
           same function). */
        ['GET',    'connectors',                      'connectors', 'wx_route_connectors_list',   'conn_list'],
        ['POST',   'connectors',                      'connectors', 'wx_route_connectors_save',   'conn_save'],
        ['DELETE', 'connectors/{id}',                 'connectors', 'wx_route_connectors_delete', 'conn_delete'],
        ['POST',   'connectors/{id}/test',            'connectors', 'wx_route_connectors_test',   'conn_test'],
        ['POST',   'connectors/{id}/push',            'connectors', 'wx_route_connectors_push',   'conn_push'],

        ['GET',    'media',                           'media', 'wx_route_media_list',      'media_list'],
        ['GET',    'media/alt',                       'media', 'wx_route_media_alt_queue', 'media_alt'],
        ['POST',   'media/alt',                       'media', 'wx_route_media_alt_save',  'media_alt'],
        ['POST',   'media/upload',                    'media', 'wx_route_media_upload',    'media_upload'],
        ['POST',   'media/replace',                   'media', 'wx_route_media_replace',   'media_replace'],
        ['POST',   'media/sizes',                     'media', 'wx_route_media_sizes',     'media_sizes'],
        /* v2.1's `import_url`: pull a stock image in from a public https link. It answers v2.1's action name
           because that is what the permission matrix knows; the fetching rules live in `lib/fetch.php`. */
        ['POST',   'media/import',                    'media', 'wx_route_media_import',    'import_url'],
        ['POST',   'media/folder',                    'media', 'wx_route_media_folder',    'media_folder'],
        ['POST',   'media/move',                      'media', 'wx_route_media_move',      'media_move'],
        ['GET',    'media/trash',                     'media', 'wx_route_media_trash_list', 'media_trash_list'],
        ['DELETE', 'media',                           'media', 'wx_route_media_trash',     'media_trash'],
        ['POST',   'media/trash/{id}/restore',        'media', 'wx_route_media_restore',   'media_restore'],
        ['DELETE', 'media/trash',                     'media', 'wx_route_media_purge',     'media_purge'],
        ['DELETE', 'media/trash/{id}',                'media', 'wx_route_media_purge',     'media_purge'],

        ['GET',    'files',                           'files', 'wx_route_files_list',      'fm_list'],
        ['GET',    'files/trash',                     'files', 'wx_route_files_trash',     'fm_trash'],
        ['GET',    'files/zip',                       'files', 'wx_route_files_zip',       'fm_zip'],
        ['POST',   'files/upload',                    'files', 'wx_route_files_upload',    'fm_upload'],
        ['POST',   'files/folder',                    'files', 'wx_route_files_folder',    'fm_mkdir'],
        ['POST',   'files/rename',                    'files', 'wx_route_files_rename',    'fm_rename'],
        ['DELETE', 'files',                           'files', 'wx_route_files_delete',    'fm_delete'],
        ['POST',   'files/trash/{id}/restore',        'files', 'wx_route_files_restore',   'fm_restore'],

        /* ------------------------------------------------------- the site's chrome
           The header, the menu and the footer, applied across every page as one change with one undo.
           This is the second half of the Phase 3 gate: 'changes the header across 150 pages, and rolls
           the change back from page history'. */
        ['GET',    'chrome',                          'chrome', 'wx_route_chrome_get',      'global_chrome'],
        ['POST',   'chrome',                          'chrome', 'wx_route_chrome_apply',    'global_chrome'],
        /* The preview writes nothing, so it carries no approval action at all: its permission is the
           role the handler asks for. Naming it `global_chrome` would put a *read* into the Master's
           queue, and adding a name to the policy's never-queue list would edit a list that is asserted
           to be a byte-for-byte copy of v2.1's. A null action is the honest description of "this is not
           a change". */
        ['POST',   'chrome/preview',                  'chrome', 'wx_route_chrome_preview',  null],
        ['POST',   'chrome/replace',                  'chrome', 'wx_route_chrome_replace',  'global_replace'],
        ['POST',   'chrome/versions/{id}',            'chrome', 'wx_route_chrome_restore',  'chrome_save'],
        /* The announcement bar: chrome, but not a region of the page — the site fetches one file and draws
           the bar itself, so these two write a file rather than 150 pages. The v2.1 action names are kept
           because the approval policy and the role map are written in terms of them. */
        ['GET',    'chrome/announce',                 'chrome', 'wx_route_announce_get',    'cms_announce_get'],
        ['POST',   'chrome/announce',                 'chrome', 'wx_route_announce_save',   'cms_announce_save'],

        /* --------------------------------------------------- the section library
           The reusable pieces a page is assembled from, and the global sections that live inside pages by
           reference: editing one block and pushing it rewrites every page that carries its token, as one
           change with one undo. */
        ['GET',    'blocks',                          'blocks',  'wx_route_blocks_list',   'blocks_list'],
        ['GET',    'blocks/usage',                    'blocks',  'wx_route_blocks_usage',  'blocks_usage'],
        ['POST',   'blocks',                          'blocks',  'wx_route_blocks_save',   'blocks_save'],
        ['POST',   'blocks/import',                   'blocks',  'wx_route_blocks_import', 'blocks_import'],
        ['POST',   'blocks/{blk}/sync',               'blocks',  'wx_route_blocks_sync',   'blocks_sync'],
        ['DELETE', 'blocks/{blk}',                    'blocks',  'wx_route_blocks_delete', 'blocks_delete'],

        /* ---------------------------------------------- the sections the CMS places
           Testimonials and team members do not become pages: they appear *inside* pages, wrapped in
           `<!--wx:testimonials-->` marker pairs that v2.1's builder also writes. The push composes the
           sections server-side and writes every changed page as one batch, so the whole push is one entry
           in the page history and one undo. `cms_placements` and `cms_placements_save` are v2.1's own
           action names, so the permission matrix and the approval policy are the ones already agreed to. */
        ['GET',    'placements',           'placements', 'wx_route_place_get',     'cms_placements'],
        ['GET',    'placements/preview',   'placements', 'wx_route_place_preview', null],
        ['GET',    'placements/plan',      'placements', 'wx_route_place_plan',    null],
        ['POST',   'placements',           'placements', 'wx_route_place_save',    'cms_placements_save'],
        ['POST',   'placements/push',      'placements', 'wx_route_place_push',    'save'],

        /* ------------------------------------------------------------ page heroes
           The hero at the top of a page, and the home page's slider. v2.1's own hero screen called the
           builder's `load` and `save` through `bapi` with no actions of its own, so these carry the same
           two names: a hero change waits for the Master on exactly the policy a page edit already had.
           `heroes/page` and `heroes/home` are static segments, so no `{rel}` row can swallow them — order
           matters here the same way it does under `pages/`. */
        ['GET',    'heroes',               'heroes',     'wx_route_hero_list',        'load'],
        ['GET',    'heroes/page',          'heroes',     'wx_route_hero_page',        'load'],
        ['GET',    'heroes/home',          'heroes',     'wx_route_hero_home',        'load'],
        ['GET',    'heroes/preview',       'heroes',     'wx_route_hero_preview',     null],
        ['POST',   'heroes/page',          'heroes',     'wx_route_hero_save_page',   'save'],
        ['POST',   'heroes/home',          'heroes',     'wx_route_hero_save_home',   'save'],

        /* ------------------------------------------------------------ forms and the rate book
           Two screens, five routes, and v2.1's own action names for all of them (`p18e-lib.php`), so the
           permission groups and the approval policy travel unchanged: a Manager's save waits for the Master,
           and the people who quote from the rate book are the ones who may edit it.
           Both path literals (`estimator` and `estimator/templates`) are listed here; a literal can only be
           matched exactly, so no `{rel}`-shaped row can swallow either one — unlike `pages/history`, which has
           to stay above `pages/{rel}`. */
        ['GET',    'forms',                   'forms',     'wx_route_forms_get',        'forms_get'],
        ['POST',   'forms',                   'forms',     'wx_route_forms_save',       'forms_save'],
        ['GET',    'estimator',               'estimator', 'wx_route_est_get',          'est_tpls'],
        ['GET',    'estimator/templates',     'estimator', 'wx_route_est_tpl_list',     'est_tpls'],
        ['POST',   'estimator',               'estimator', 'wx_route_est_save',         'est_save'],
        ['POST',   'estimator/templates',     'estimator', 'wx_route_est_tpl_save',     'est_tpl_save'],

        /* ------------------------------------------------------ the content CMS
           An editor's list, an editor, and a publish button that composes the page server-side out of
           the site's own page furniture. `?filter=draft|scheduled|due|live` is answered in SQL. */
        ['GET',    'content',                         'content', 'wx_route_content_list',       'cms_list'],
        ['GET',    'content/pages',                   'content', 'wx_route_content_page_kinds', 'cms_page_kinds'],
        ['GET',    'content/sitemap',                 'content', 'wx_route_content_sitemap',    'cms_sitemap_add'],
        ['GET',    'content/templates',               'content', 'wx_route_content_tpl_list',   'cms_tpl_list'],
        ['GET',    'content/{id}',                    'content', 'wx_route_content_get',        'cms_get'],
        ['POST',   'content',                         'content', 'wx_route_content_save',       'cms_save'],
        ['POST',   'content/sitemap',                 'content', 'wx_route_content_sitemap_add', 'cms_sitemap_add'],
        ['POST',   'content/templates',               'content', 'wx_route_content_tpl_save',   'cms_tpl_save'],
        ['POST',   'content/tick',                    'content', 'wx_route_content_tick',       'cms_published'],
        ['POST',   'content/reorder',                 'content', 'wx_route_content_reorder',    'cms_reorder'],
        ['POST',   'content/{id}/publish',            'content', 'wx_route_content_publish',    'cms_published'],
        /* The AI settings behind the writing help: one record in v2.1's `_private/content.json`, four
           providers, and two calls outward. Reads are owner/admin, as v2.1 asked. */
        ['GET',    'ai/settings',                     'ai', 'wx_route_ai_get',             'cms_ai_get'],
        ['POST',   'ai/settings',                     'ai', 'wx_route_ai_save',            'cms_ai_save'],
        ['POST',   'ai/models',                       'ai', 'wx_route_ai_models',          'cms_ai_models'],
        ['POST',   'ai/test',                         'ai', 'wx_route_ai_test',            'ai_test'],
        ['POST',   'content/{id}/schedule',           'content', 'wx_route_content_schedule',   'cms_save'],
        ['POST',   'content/{id}/status',             'content', 'wx_route_content_status',     'cms_status'],
        ['DELETE', 'content/{id}',                    'content', 'wx_route_content_delete',     'cms_delete'],
        ['DELETE', 'content/templates/{id}',          'content', 'wx_route_content_tpl_delete', 'cms_tpl_delete'],

        /* ------------------------------------------------- the visitor's widget
           Public on purpose: these five are what the website widget calls, and a visitor has no session
           to begin with. Auth here is the chat token in the body — 20 random bytes whose sha256 is the
           only thing stored — plus the per-IP limit inside each handler, so a request that guesses is
           cheap to refuse and a bot that scrapes is expensive to keep. `chat.php` was v2.1's entry point;
           the old URL keeps working until the widget itself is re-pointed in Phase 3. */
        /* ------------------------------------------------------ the client's page
           A project's progress page, opened from a WhatsApp message or an email with no session. The token
           is the credential and it answers with a page rather than an envelope (see
           routes/client_view.php), so there is no v2.1 action to translate. */
        ['GET',    'client/project/{id}',             'client_view', 'wx_route_client_project', null],

        ['GET',    'chat/config',                     'chat_public', 'wx_route_chat_cfg',    null],
        ['POST',   'chat/send',                       'chat_public', 'wx_route_chat_send',   null],
        ['POST',   'chat/poll',                       'chat_public', 'wx_route_chat_poll',   null],
        ['POST',   'chat/typing',                     'chat_public', 'wx_route_chat_typing', null],
        ['POST',   'chat/file',                       'chat_public', 'wx_route_chat_file',   null],

        /* ----------------------------------------------------------- the bell
           Polled by the shell, so it is in the `self` group: everyone gets their own bell, and what is
           in it depends on what they can see (see routes/notifications.php). The settings half is
           owner/admin — the `settings` group in the matrix. */
        ['GET',    'notifications/poll',              'notifications', 'wx_route_notif_poll',        'notif_poll'],
        ['GET',    'notifications',                   'notifications', 'wx_route_notify_get',        'notify_get'],
        ['POST',   'notifications/settings',          'notifications', 'wx_route_notify_save',       'notify_save'],
        ['POST',   'notifications/test',              'notifications', 'wx_route_notify_test',       'notify_test'],
        ['POST',   'notifications/project/{id}',      'notifications', 'wx_route_notify_proj_send',  'notify_proj_send'],

        /* -------------------------------------------- the business's own details
           Two halves of the screen v2.1 called Business info. The website half changes 150 pages in one
           batch (`wx_page_write_many`, the same undo the header/footer screen uses); the company half is
           the letterhead every quotation and invoice is printed with, which is why `company_save` is its
           own approval action — a Manager changing the bank account on every future invoice is exactly
           the kind of change the Master wants to see first. `check` and `from-site` write nothing, so
           they carry no approval action at all. */
        ['GET',    'business',                        'business', 'wx_route_biz_get',       'cms_biz_get'],
        ['POST',   'business',                        'business', 'wx_route_biz_apply',     'cms_biz_save'],
        ['POST',   'business/check',                  'business', 'wx_route_biz_check',     null],
        ['GET',    'business/from-site',              'business', 'wx_route_biz_from_site', 'cms_biz_get'],
        ['GET',    'business/company',                'business', 'wx_route_company_get',   'company_get'],
        ['POST',   'business/company',                'business', 'wx_route_company_save',  'company_save'],

        /* ---------------------------------------------------------- system */
        ['GET',    'system/health',                   'system', 'wx_route_sys_health',    'sys_check'],
        ['GET',    'system/schema',                   'system', 'wx_route_sys_schema',    'dbx_browse'],
    ];
    return $routes;
}

/**
 * Find a route for method+segments. Returns [route, params] or null.
 *
 * Every `{name}` in a pattern captures: `{id}` as an integer (digits only, so `invoices/summary`
 * cannot be read as invoice "summary"), anything else as a slug-ish string. Until this was
 * generalised the only brace the matcher knew was `{id}`, which meant
 * `DELETE invoices/{id}/payments/{payment}` was a route no request could ever reach — the pattern
 * stayed literal and the deletion 404'd. That is the sort of bug a test finds and a review does not,
 * so the pattern-a-capture test in tests/run.php now walks the register and asserts every brace in
 * every pattern resolves.
 */
/**
 * The patterns that answer without a session. One list, in one place, because two things need to agree
 * about it: the dispatcher's own review (tests/conformance.mjs reads this function) and anyone asking
 * "what can a stranger reach?".
 *
 * The rule for being on this list is that the route authenticates by something other than a session, and
 * says what: `health` and `version` are monitors with nothing to leak; `auth/*` is how a session is
 * obtained; `me` answers "who am I" and so must be able to say "nobody" with a clean 401; the booking
 * form and the chat widget are used by people who have never signed in — they carry a rate limit and, in
 * the chat's case, a per-conversation token instead.
 *
 * Anything not on this list must call wx_require_user() in its handler. That is checked, not assumed.
 */
function wx_public_routes(): array
{
    return [
        'health', 'version',
        'auth/login', 'auth/login/2fa', 'auth/logout',
        'me',
        'book/config', 'book/slots', 'book',
        'r404',
        'chat/config', 'chat/send', 'chat/poll', 'chat/typing', 'chat/file',
        /* The client's project page. No session by design: the token in the link is the credential, and it is
           the same construction the quotation link has always used (see lib/clientview.php). */
        'client/project/{id}',
    ];
}

function wx_route_match(string $method, array $segments): ?array
{
    $path = implode('/', $segments);
    foreach (wx_routes() as $route) {
        list($m, $pattern, $file, $fn, $action) = $route;
        if ($m !== $method) {
            continue;
        }
        if ($pattern === $path) {
            return [['method' => $m, 'pattern' => $pattern, 'file' => $file, 'fn' => $fn, 'action' => $action], []];
        }
        if (strpos($pattern, '{') === false) {
            continue;
        }
        $names = [];
        $regex = '~^' . wx_route_regex($pattern, $names) . '$~';
        if (preg_match($regex, $path, $mm)) {
            $params = [];
            foreach ($names as $i => $name) {
                $params[$name] = $name === 'id' ? (int) $mm[$i + 1] : (string) $mm[$i + 1];
            }
            return [['method' => $m, 'pattern' => $pattern, 'file' => $file, 'fn' => $fn, 'action' => $action], $params];
        }
    }
    return null;
}

/**
 * One route pattern as a regular expression, parametrising its placeholders.
 *
 * `{id}` is a number, `{name}` is one path segment — and `{rel:any}` is a *path*: one or more segments, slashes
 * included. That last form exists because a page's address is a path: `insights/kitchens-in-lahore/index.html`
 * has three segments, and a route that could only name one of them could not address the page at all. It is
 * written out explicitly rather than made the meaning of every placeholder, because a pattern that quietly
 * swallows the rest of a URL is how `POST /pages/search` would start editing a page called "search".
 *
 * Built a segment at a time rather than over the quoted pattern: one pass, no escaping games, and the
 * placeholder syntax is readable in the pattern itself.
 *
 * @param array<int,string> $names receives the placeholder names, in the order they appear
 */
function wx_route_regex(string $pattern, array &$names): string
{
    $parts = [];
    foreach (explode('/', $pattern) as $seg) {
        if (preg_match('~^\{([a-z0-9_]+)(:any)?\}$~', $seg, $m)) {
            $names[] = $m[1];
            $parts[] = isset($m[2]) ? '(.+)' : ($m[1] === 'id' ? '(\d+)' : '([A-Za-z0-9_.-]+)');
        } else {
            $parts[] = preg_quote($seg, '~');
        }
    }
    return implode('/', $parts);
}

/** The legacy action name, if the request came in through that door. */
function wx_legacy_action(): string
{
    return wx_once('legacy_action', static function (): string {
        $raw = (string) ($_GET['action'] ?? '');
        if ($raw === '') {
            return '';
        }
        return (string) preg_replace('~[^a-z0-9_]~', '', strtolower($raw));
    });
}

/**
 * Dispatch the request. Returns ['data' => …, 'meta' => …] for the front controller to envelope.
 *
 * Alias handling is deliberately thin: it maps the old action to a v2 resource and lets the normal
 * handlers run. Full per-action compatibility is Phase 2 work, done route by route with the v2.1
 * payload captured as a fixture first — inventing a translation layer now would be guessing.
 */
function wx_dispatch(): array
{
    $method = wx_method();
    $segments = wx_segments();
    $route = wx_route_match($method, $segments);

    if ($route === null) {
        $legacy = wx_legacy_action();
        if ($legacy !== '') {
            return wx_dispatch_legacy($legacy, $method);
        }
        throw ApiError::notFound('No such endpoint: ' . ($method . ' /' . implode('/', $segments)));
    }

    list($r, $params) = $route;
    $handlerFile = WX_V2_DIR . '/routes/' . $r['file'] . '.php';
    if (!is_file($handlerFile)) {
        throw ApiError::internal('Route file missing: routes/' . $r['file'] . '.php');
    }
    require_once $handlerFile;
    if (!function_exists($r['fn'])) {
        throw ApiError::internal('Route handler missing: ' . $r['fn']);
    }

    $ctx = [
        'method' => $method,
        'path' => '/' . implode('/', $segments),
        'pattern' => $r['pattern'],
        'params' => $params,
        'action' => $r['action'],
        'query' => $_GET,
        'body' => wx_body(),
        'user' => null,
    ];
    $result = call_user_func($r['fn'], $ctx);
    return wx_normalise_result($result);
}

/** Legacy ?action= → resource. Unknown actions are NOT_FOUND, never silently ignored. */
function wx_dispatch_legacy(string $action, string $method): array
{
    require_once WX_V2_DIR . '/aliases.php';
    $resource = wx_v2_resource_for($action);
    if ($resource === '') {
        throw ApiError::notFound('Unknown action: ' . $action);
    }
    $legacyFile = WX_V2_DIR . '/routes/legacy.php';
    if (!is_file($legacyFile)) {
        throw new ApiError('INTERNAL', 'The legacy bridge is not installed', null, null, ['action' => $action]);
    }
    require_once $legacyFile;
    return wx_normalise_result(wx_route_legacy($action, $resource, $method));
}

/** A handler may return its payload, or a full ['data'=>…,'meta'=>…] shape. */
function wx_normalise_result($result): array
{
    /* A handler may answer with a file instead of data — the file manager's zip download is the case
       that exists today. `__file` is deliberately not a word any handler would return by accident, and
       it is pulled out before the envelope is built so a file response can never carry a JSON body. */
    if (is_array($result) && isset($result['__file']) && is_array($result['__file'])) {
        return ['data' => null, 'meta' => [], 'file' => $result['__file']];
    }
    /* …and with a page instead of data — the client's progress link. Same construction, same reason:
       one word a handler would never return by accident, pulled out before the envelope is built. */
    if (is_array($result) && isset($result['__html']) && is_array($result['__html'])) {
        return ['data' => null, 'meta' => [], 'html' => $result['__html']];
    }
    if (!is_array($result)) {
        return ['data' => $result, 'meta' => []];
    }
    if (array_key_exists('data', $result) || array_key_exists('meta', $result)) {
        return ['data' => $result['data'] ?? null, 'meta' => $result['meta'] ?? []];
    }
    return ['data' => $result, 'meta' => []];
}
