<?php
/**
 * api/v2/routes/legacy.php — the bridge that keeps v2.1 clients alive during the strangler cut-over.
 *
 * Master plan §6.2 and §14: v2.1 stays live while v2.5 is built behind it, so for a while the same
 * host serves an old admin that calls `?action=lead_save` and a new SPA that calls `POST /leads`.
 * The old client cannot be changed first — it is the one being replaced.
 *
 * Two rules keep this honest:
 *
 *   1. **The shape is v2.1's.** Legacy clients do `r.error` and `r.ok` and read payload keys at the
 *      top level (`r.user`, `r.leads`, `r.token`). Wrapping those in `{data:…}` would break every
 *      screen at once. So a legacy request gets `{ok:true, …payload, meta:{…}}` — the v2.1 body with
 *      the request-id added, which v2.1 clients ignore harmlessly.
 *
 *   2. **The list is explicit.** Only actions named in WX_LEGACY_BRIDGED are served. Anything else
 *      gets a coded 404 that names the v2.1 endpoint to use, rather than a half-guessed translation.
 *      Guessing is how a migration silently corrupts data.
 *
 * Every bridged action maps onto the same handler the resource route uses — there is no second
 * implementation of lead saving, so the bridge cannot drift from the resource.
 */

declare(strict_types=1);

/** Legacy action => [route file, function, which ctx keys it needs] */
function wx_legacy_bridged(): array
{
    return [
        'status'          => ['health', 'wx_route_health', []],
        'ping'            => ['health', 'wx_route_version', []],
        'login'           => ['auth', 'wx_route_login', []],
        'login_2fa'       => ['auth', 'wx_route_login_2fa', []],
        'logout'          => ['auth', 'wx_route_logout', []],
        'me'              => ['me', 'wx_route_me', []],
        'me_get'          => ['me', 'wx_route_me', []],
        'me_save'         => ['me', 'wx_route_me_save', []],
        'password'        => ['me', 'wx_route_password', []],
        'dashboard'       => ['dashboard', 'wx_route_dashboard', []],
        'dash_data'       => ['dashboard', 'wx_route_dashboard', []],
        'list_leads'      => ['leads', 'wx_route_leads_list', []],
        'leads_list'      => ['leads', 'wx_route_leads_list', []],
        'get_lead'        => ['leads', 'wx_route_leads_get', ['id']],
        'lead_save'       => ['leads', 'wx_route_leads_save', ['id']],
        'lead_note'       => ['leads', 'wx_route_lead_note_add', ['id']],
        'add_lead_note'   => ['leads', 'wx_route_lead_note_add', ['id']],
        'activity'        => ['dashboard', 'wx_route_activity', []],
        /* Phase 2 — the money path. The v2.1 admin calls these names; each one lands on the same
           handler the resource route uses, so there is still one implementation of each change. */
        'list_quotes'     => ['quotations', 'wx_route_quotes_list', []],
        'quotes_list'     => ['quotations', 'wx_route_quotes_list', []],
        'get_quote'       => ['quotations', 'wx_route_quotes_get', ['id']],
        'quote_save'      => ['quotations', 'wx_route_quotes_save', ['id']],
        'create_quote_draft' => ['quotations', 'wx_route_quotes_save', []],
        'quote_status'    => ['quotations', 'wx_route_quotes_status', ['id']],
        'quote_delete'    => ['quotations', 'wx_route_quotes_delete', ['id']],
        'quote_invoice'   => ['quotations', 'wx_route_quotes_invoice', ['id']],
        'invs_tracker'    => ['invoices', 'wx_route_invoices_list', []],
        'proj_bill'       => ['projects', 'wx_route_projects_bill', ['id']],
        'pay_add'         => ['invoices', 'wx_route_invoices_pay', ['id']],
        'pay_delete'      => ['invoices', 'wx_route_invoices_pay_delete', ['id']],
        'projs_table'     => ['projects', 'wx_route_projects_list', []],
        'proj_meta'       => ['projects', 'wx_route_projects_get', ['id']],
        'proj_milestones' => ['projects', 'wx_route_projects_save', ['id']],
        /* v2.1's older project names, which the sales screen still uses. They map onto the same handlers
           as the resource routes rather than onto a second implementation: `proj_save` is PATCH
           /projects/{id}, `proj_update` posts a stage update, `projs_list` is the list. */
        'proj_save'       => ['projects', 'wx_route_projects_save', ['id']],
        'proj_update'     => ['projects', 'wx_route_projects_update', ['id']],
        'projs_list'      => ['projects', 'wx_route_projects_list', []],
        'quote_get'       => ['quotations', 'wx_route_quotes_get', ['id']],
        'appr_list'       => ['approvals', 'wx_route_approvals_list', []],
        'appr_count'      => ['approvals', 'wx_route_approvals_count', []],
        'appr_get'        => ['approvals', 'wx_route_approvals_get', ['id']],
        'appr_apply'      => ['approvals', 'wx_route_approvals_approve', ['id']],
        'appr_reject'     => ['approvals', 'wx_route_approvals_reject', ['id']],
        'appr_cancel'     => ['approvals', 'wx_route_approvals_cancel', ['id']],
        'appr_cfg_get'    => ['approvals', 'wx_route_approvals_cfg_get', []],
        'appr_cfg_save'   => ['approvals', 'wx_route_approvals_cfg_save', []],
        /* Phase 2 — clients. The old admin's three client screens and the page that opens one. */
        'clients_list'    => ['clients', 'wx_route_clients_list', []],
        'list_clients'    => ['clients', 'wx_route_clients_list', []],
        'clients_master'  => ['clients', 'wx_route_clients_list', []],
        'client_360'      => ['clients', 'wx_route_clients_get', ['id']],
        'client_save'     => ['clients', 'wx_route_clients_save', ['id']],
        'client_delete'   => ['clients', 'wx_route_clients_delete', ['id']],
        'clients_merge'   => ['clients', 'wx_route_clients_merge', ['id']],
        'clients_link'    => ['clients', 'wx_route_clients_link', []],
        'client_comms'    => ['clients', 'wx_route_clients_comms', ['id']],
        /* Phase 2 — bookings. */
        'bk_list'         => ['bookings', 'wx_route_bookings_list', []],
        'bk_save'         => ['bookings', 'wx_route_bookings_save', ['id']],
        'bk_status'       => ['bookings', 'wx_route_bookings_status', ['id']],
        'bk_slots'        => ['bookings', 'wx_route_bookings_slots', []],
        'bk_cfg'          => ['bookings', 'wx_route_bookings_cfg_get', []],
        'bk_cfg_save'     => ['bookings', 'wx_route_bookings_cfg_save', []],
        /* Phase 2 — the inbox. Notifications poll reads it too (notif_poll arrives with the bell). */
        'chat_list'       => ['chats', 'wx_route_chats_list', []],
        'chat_get'        => ['chats', 'wx_route_chats_get', ['id']],
        'chat_reply'      => ['chats', 'wx_route_chats_reply', ['id']],
        'chat_note'       => ['chats', 'wx_route_chats_note', ['id']],
        'chat_mode'       => ['chats', 'wx_route_chats_mode', ['id']],
        'chat_assign'     => ['chats', 'wx_route_chats_assign', ['id']],
        'chat_close'      => ['chats', 'wx_route_chats_close', ['id']],
        'chat_tags'       => ['chats', 'wx_route_chats_tags', ['id']],
        'chat_lead'       => ['chats', 'wx_route_chats_lead', ['id']],
        'chat_typing'     => ['chats', 'wx_route_chats_typing', ['id']],
        'chat_file'       => ['chats', 'wx_route_chats_file', ['id']],
        'chat_suggest'    => ['chats', 'wx_route_chats_suggest', ['id']],
        'chat_cfg_get'    => ['chats', 'wx_route_chats_cfg_get', []],
        'chat_cfg_save'   => ['chats', 'wx_route_chats_cfg_save', []],
        'chat_test'       => ['chats', 'wx_route_chats_test', []],
        /* Phase 2 — people and account security. */
        'users'           => ['users', 'wx_route_users_list', []],
        'user_save'       => ['users', 'wx_route_users_save', ['id']],
        'sec_2fa_reset'   => ['users', 'wx_route_users_2fa_reset', ['id']],
        'sec_2fa_begin'   => ['security', 'wx_route_security_2fa_begin', []],
        'sec_2fa_enable'  => ['security', 'wx_route_security_2fa_enable', []],
        'sec_2fa_disable' => ['security', 'wx_route_security_2fa_disable', []],
        'sec_recovery_new' => ['security', 'wx_route_security_recovery', []],
        'sec_alerts'      => ['security', 'wx_route_security_alerts', []],
        /* Phase 2 — the bell and what the client is told. */
        'notif_poll'      => ['notifications', 'wx_route_notif_poll', []],
        'notify_get'      => ['notifications', 'wx_route_notify_get', []],
        'notify_save'     => ['notifications', 'wx_route_notify_save', []],
        'notify_test'     => ['notifications', 'wx_route_notify_test', []],
        'notify_proj_send' => ['notifications', 'wx_route_notify_proj_send', ['id']],
        'sys_check'       => ['system', 'wx_route_sys_health', []],
        /* Phase 3 — delivery: the addresses that moved and the ones nobody found. */
        'redirects'       => ['redirects', 'wx_route_redirects_list', []],
        'redirects_save'  => ['redirects', 'wx_route_redirects_save', []],
        'redirects_plan'  => ['redirects', 'wx_route_redirects_plan', []],
        'r404_list'       => ['redirects', 'wx_route_r404_list', []],
        'r404_clear'      => ['redirects', 'wx_route_r404_clear', []],
        /* Phase 3 — the library: pictures and files. media_restore and media_purge take the trash id in
           the body, as v2.1's screen sent it. */
        'media_list'      => ['media', 'wx_route_media_list', []],
        'media_sizes'     => ['media', 'wx_route_media_sizes', []],
        'media_folder'    => ['media', 'wx_route_media_folder', []],
        'media_upload'    => ['media', 'wx_route_media_upload', []],
        'media_replace'   => ['media', 'wx_route_media_replace', []],
        'media_alt'       => ['media', 'wx_route_media_alt_save', []],
        'media_move'      => ['media', 'wx_route_media_move', []],
        'media_trash'     => ['media', 'wx_route_media_trash', []],
        'media_trash_list' => ['media', 'wx_route_media_trash_list', []],
        'media_restore'   => ['media', 'wx_route_media_restore', ['id']],
        'media_purge'     => ['media', 'wx_route_media_purge', ['id']],
        'fm_list'         => ['files', 'wx_route_files_list', []],
        'fm_upload'       => ['files', 'wx_route_files_upload', []],
        'fm_mkdir'        => ['files', 'wx_route_files_folder', []],
        'fm_rename'       => ['files', 'wx_route_files_rename', []],
        'fm_delete'       => ['files', 'wx_route_files_delete', []],
        'fm_trash'        => ['files', 'wx_route_files_trash', []],
        /* fm_restore's id is a timestamp-and-random string, not a number, so it is read from the body by
           the handler rather than cast to an int here. */
        'fm_restore'      => ['files', 'wx_route_files_restore', []],
        'fm_zip'          => ['files', 'wx_route_files_zip', []],
        /* Phase 3 — the chrome: the header, the menu and the footer across every page. */
        'global_chrome'   => ['chrome', 'wx_route_chrome_apply', []],
        'global_menu'     => ['chrome', 'wx_route_chrome_apply', []],
        'global_replace'  => ['chrome', 'wx_route_chrome_replace', []],
        'chrome_save'     => ['chrome', 'wx_route_chrome_apply', []],
        'chrome_versions' => ['chrome', 'wx_route_chrome_get', []],
        /* Phase 3 — the content CMS. The v2.1 action names are kept because the permission matrix and the
           approval policy are keyed on them; the screens use the routes. */
        'cms_list'         => ['content', 'wx_route_content_list', []],
        'cms_get'          => ['content', 'wx_route_content_get', []],
        'cms_save'         => ['content', 'wx_route_content_save', []],
        'cms_published'    => ['content', 'wx_route_content_publish', []],
        'cms_status'       => ['content', 'wx_route_content_status', []],
        'cms_reorder'      => ['content', 'wx_route_content_reorder', []],
        'cms_delete'       => ['content', 'wx_route_content_delete', []],
        'cms_page_kinds'   => ['content', 'wx_route_content_page_kinds', []],
        'cms_sitemap_add'  => ['content', 'wx_route_content_sitemap_add', []],
        'cms_tpl_list'     => ['content', 'wx_route_content_tpl_list', []],
        'cms_tpl_save'     => ['content', 'wx_route_content_tpl_save', []],
        'cms_tpl_delete'   => ['content', 'wx_route_content_tpl_delete', []],
        'cms_placements'   => ['placements', 'wx_route_place_get', []],
        'cms_placements_save' => ['placements', 'wx_route_place_save', []],
        /* Phase 3 — findability. Every one of these lands on the resource route's own handler, and the reply
           carries v2.1's key names inside it (`pages` is the store keyed by address, `page` the record a save
           wrote, `faq` a count) — see the note at the top of `routes/seo.php`. The one semantic difference is
           `seo_scores`: v2.1 stored the numbers a browser computed, and this recomputes them instead, which is
           why the old screen's own arithmetic still shows and the store no longer carries a second opinion. */
        /* The studio's integrations. The id is a string (`c` + ten hex characters), so it is mapped as a
           string — `['id']` would cast it to an int and every bridged call would address connector 0. */
        'conn_list'       => ['connectors', 'wx_route_connectors_list', []],
        'conn_save'       => ['connectors', 'wx_route_connectors_save', []],
        'conn_delete'     => ['connectors', 'wx_route_connectors_delete', ['id' => 'id']],
        'conn_test'       => ['connectors', 'wx_route_connectors_test', ['id' => 'id']],
        'conn_push'       => ['connectors', 'wx_route_connectors_push', ['id' => 'id']],
        'seo_list'         => ['seo', 'wx_route_seo_pages', []],
        'seo_page'         => ['seo', 'wx_route_seo_page', ['path' => 'rel']],
        'seo_save'         => ['seo', 'wx_route_seo_save', ['path' => 'rel']],
        'seo_scores'       => ['seo', 'wx_route_seo_audit', []],
        'seo_robots_save'  => ['seo', 'wx_route_seo_robots_save', []],
        'seo_sitemap'      => ['seo', 'wx_route_seo_sitemap_rebuild', []],
        'seo_ai'           => ['seo', 'wx_route_seo_suggest', ['path' => 'rel']],
        /* Phase 3 — the section library. The builder's own six library actions; the rest of the builder
           (page load/save, uploads, the theme file) is its own slice. */
        'blocks_list'      => ['blocks', 'wx_route_blocks_list', []],
        'blocks_usage'     => ['blocks', 'wx_route_blocks_usage', []],
        'blocks_save'      => ['blocks', 'wx_route_blocks_save', []],
        'blocks_import'    => ['blocks', 'wx_route_blocks_import', []],
        'blocks_delete'    => ['blocks', 'wx_route_blocks_delete', []],
        'blocks_sync'      => ['blocks', 'wx_route_blocks_sync', []],
        /* Phase 3 — the page editor half of the builder bridge: list, load, save, create, restore. The
           response shapes are v2.5's (`routes/pages.php`); what is preserved is the action name, because
           the permission matrix and the approval policy are keyed on it. `load` is the GET route that
           already answered it. */
        'pages'            => ['pages', 'wx_route_pages_list', []],
        /* `path` is v2.1's word for a page and `rel` is the route's. The alias is what lets the old page
           screen keep loading and saving: without it the route sees an empty `rel` and the caller gets a
           validation error about a parameter it never knew it had. */
        'load'             => ['pages', 'wx_route_pages_get', ['path' => 'rel']],
        'save'             => ['pages', 'wx_route_pages_write', ['path' => 'rel']],
        'backups'          => ['pages', 'wx_route_pages_backups', ['path' => 'rel']],
        'page_new'         => ['pages', 'wx_route_pages_new', []],
        /* v2.1's page settings screen: status, title, description, canonical, og image and one checkbox for
           search. The old admin sends `path`, the route reads `rel`. */
        'page_meta_save'   => ['pages', 'wx_route_pages_publish', ['path' => 'rel']],
        'restore'          => ['pages', 'wx_route_pages_restore', ['path' => 'rel']],
        /* Phase 3 — the site theme. v2.1's builder screen called these two names; the theme itself now lands
           in the stylesheet the live pages load, which is why the port is not a copy of the old file. */
        'theme_get'        => ['theme', 'wx_route_theme_get', []],
        'theme'            => ['theme', 'wx_route_theme_save', []],
        /* Two more of the builder's names, and the two that are *not* here are named for a reason.
           `media` is the builder's file list and `upload` is its image upload — both land on the handlers the
           media screen already uses, which is what the one-implementation rule asks for.
           `media_delete` and `media_usage` are left out on purpose: v2.5 has no delete (it has a trash with a
           30-day window, so the v2.1 request needs an adapter from `url` to `urls[]`), and it has no separate
           usage action (usage is a field of the library read). Neither is a mapping — they are a decision
           about what deleting an image should mean now, and half-answering them under the old name would
           teach the caller something untrue. */
        'media'            => ['media', 'wx_route_media_list', []],
        'upload'           => ['media', 'wx_route_media_upload', []],
        /* The two fetchers. Both are in the policy's skip list, as they were in v2.1 — looking at a public
           page or pulling an image changes nothing on the site, so there is nothing for the Master to
           approve. What they do need is the SSRF rules, which travel with them in `lib/fetch.php`. */
        'import_url'       => ['media', 'wx_route_media_import', []],
        'fetch_page'       => ['pages', 'wx_route_pages_fetch', []],
    ];
}

/**
 * The parameters a bridged action carries, in the names the route reads.
 *
 * v2.1's callers use v2.1's words — a page is a `path`, not a `rel` — and the route is written against a
 * v2.5 URL. Two forms, because both exist in the map:
 *
 *   · `['id']`              an integer the route reads from `params`;
 *   · `['path' => 'rel']`   the legacy name => the route's name, copied as a string.
 *
 * The old client sends both kinds in the body or the query string, never in the path. A missing one is a
 * validation error naming the key the *caller* used, because that is the key they can do something about.
 */
function wx_legacy_params(array $keys, array $body, array $query): array
{
    $params = [];
    foreach ($keys as $k => $v) {
        if (is_int($k)) {
            $val = $body[$v] ?? $query[$v] ?? null;
            if ($val === null || $val === '') {
                throw ApiError::validation('Missing ' . $v, $v);
            }
            $params[$v] = (int) $val;
            continue;
        }
        $val = $body[$k] ?? $query[$k] ?? '';
        if ($val === '' || $val === null) {
            throw ApiError::validation('Missing ' . $k, $k);
        }
        $params[$v] = (string) $val;
    }
    return $params;
}

function wx_route_legacy(string $action, string $resource, string $method): array
{
    $map = wx_legacy_bridged();
    if (!isset($map[$action])) {
        require_once WX_V2_DIR . '/aliases.php';
        $row = WX_V2_ALIASES[$action] ?? null;
        $origin = $row[1] ?? 'admin.php';
        throw new ApiError('NOT_FOUND', 'Not served by api/v2 yet — use /api/' . $origin . ' until this action is ported', null, 'action', ['action' => $action, 'resource' => $resource, 'servedBy' => 'v2.1']);
    }
    list($file, $fn, $paramKeys) = $map[$action];
    require_once WX_V2_DIR . '/routes/' . $file . '.php';

    $body = wx_body();
    $params = wx_legacy_params($paramKeys, $body, $_GET);
    $ctx = [
        'method' => $method,
        'path' => '/' . $action,
        'pattern' => $action,
        'params' => $params,
        'action' => $action,
        'query' => $_GET,
        /* The aliased names are available in the body too, because a route written against a URL (`{rel}`)
           often reads the body as well — `POST /pages` does. Adding the alias does not change any name the
           caller sent: `path` is still there beside `rel`. */
        'body' => $params + $body,
        'user' => null,
        'legacy' => true,
    ];
    return wx_normalise_result(call_user_func($fn, $ctx));
}

/** v2.1's success body: payload flattened, meta additive. */
function wx_legacy_ok(array $payload, array $meta = []): void
{
    wx_respond(array_merge(['ok' => true], $payload, ['meta' => array_merge(wx_base_meta(), $meta)]));
}

/** v2.1's failure body: `error` is a string, because that is what the old clients render. */
function wx_legacy_fail(ApiError $e): void
{
    wx_respond([
        'ok' => false,
        'error' => $e->getMessage(),
        'errorCode' => $e->code,
        'meta' => array_merge(wx_base_meta(), ['requestId' => wx_request_id()]),
    ], $e->status);
}
