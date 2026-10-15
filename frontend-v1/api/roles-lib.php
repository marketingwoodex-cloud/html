<?php
/** P39 Phase 1: roles + permissions.
 *  Stored role codes stay the same so existing users keep working:
 *    owner = Master · admin = Manager · editor = Developer · sales = Sales / Lead · support = Support (new)
 *  Every action belongs to a group. need() asks wx_allowed() first:
 *    - a role (or a per-user extra permission) must include the group
 *    - the older per-action role lists still apply, except where this file grants a group to a role on purpose (EXPAND)
 *  Actions that match no group keep their old rules (safe fallback). */

const ROLE_LABELS = ['owner' => 'Master', 'admin' => 'Manager', 'editor' => 'Developer', 'sales' => 'Sales', 'support' => 'Support'];
const PERM_GROUPS = [
    'sales' => 'Leads, pipeline, clients, quotes, invoices, projects, bookings',
    'conversations' => 'Inbox (website chat + WhatsApp)',
    'updates' => 'Client updates (project messages)',
    'broadcast' => 'WhatsApp offers, broadcasts and automation',
    'ai' => 'Train AI and chat settings',
    'website' => 'Pages, builder, content, media, SEO, theme',
    'settings' => 'Business info, integrations, notifications, maintenance',
];

/** Which groups each role has. 'master' = Master-only admin actions. */
function wx_role_groups(string $role): array {
    switch ($role) {
        case 'owner': return ['self', 'sales', 'conversations', 'updates', 'broadcast', 'ai', 'website', 'settings', 'master'];
        case 'admin': return ['self', 'sales', 'conversations', 'updates', 'broadcast', 'ai', 'website', 'settings'];
        case 'editor': return ['self', 'website', 'settings'];
        case 'sales': return ['self', 'sales', 'conversations'];
        case 'support': return ['self', 'conversations', 'updates', 'support_view'];
    }
    return ['self'];
}
/** Groups opened to a role on purpose, even where an older check listed fewer roles. */
const EXPAND = ['website' => ['editor'], 'settings' => ['editor'], 'conversations' => ['sales', 'support'], 'updates' => ['support'], 'support_view' => ['support']];

/** Actions used by screens of more than one group: allowed when the user has ANY of these groups. */
const SHARED = ['est_tpls' => ['sales', 'website'], 'est_tpl_save' => ['sales', 'website'], 'est_save' => ['sales', 'website'], 'crm_wa_status' => ['conversations', 'settings', 'broadcast'], 'gdata_report' => ['sales', 'website'], 's17_meta' => ['sales', 'support_view'], 'projs_table' => ['sales', 'support_view'], 'notify_get' => ['settings', 'updates']];

function wx_action_group(string $a): ?string {
    static $map = null;
    if ($map === null) $map = [
        // everyone signed in (own account, notifications, dashboard)
        'self' => '~^(tg_link_code|tg_unlink|me|me_get|me_save|me_avatar|me_avatars|profile|password|logout|ping|poll|notif_poll|typing|dashboard|dash_data|site_stats|leads_count|mt_get|sec_(get|alerts|2fa_begin|2fa_enable|2fa_disable|recovery_new|revoke)|google_(me|link|unlink))$~',
        // Master only
        'master' => '~^(user_save|sec_2fa_reset|backup_(run|delete|restore)|restore|dbx_row|db_reconnect|google_save|mcp_token_(new|regen|revoke|toggle))$~',
        // support may read a client / project to answer a chat
        'support_view' => '~^(client_360|get_lead|projs_list)$~',
        'updates' => '~^(proj_update|notify_proj_send)$~',
        'conversations' => '~^(chat_(list|get|reply|close|file|mode|lead|typing|assign|note|tags|suggest)|wa_stats|whatsapp_stats|crm_wa_status)$~',
        'ai' => '~^(chat_cfg_get|chat_cfg_save|chat_test|ai_test|ai_report|ai_unans_[a-z]+|aic_[a-z]+)$~',
        'broadcast' => '~^(crm_offers|crm_offer_(save|send|delete)|wag_[a-z_]+|wah_[a-z_]+)$~',
        'sales' => '~^(leads?_[a-z0-9_]+|add_lead_note|lead_note|get_lead|list_leads|clients?_[a-z0-9_]+|list_clients|quotes?_[a-z_]+|get_quote|list_quotes|create_quote_draft|invs?_[a-z_]+|pay_(add|delete)|projs?_[a-z_]+|bk_[a-z_]+|est_[a-z_]+|s17_meta|dash_target_save|monthly_report|tpl_(list|save|delete|import)|company_get)$~',
        'settings' => '~^(tg_(get|save|connect|disconnect|test)|set_[a-z_]+|crm_settings|crm_settings_save|crm_test|crm_wa_connect|crm_wa_disconnect|notify_(get|save|test)|company_save|cms_biz_[a-z_]+|cms_ai_[a-z_]+|cms_announce_[a-z_]+|mt_set|sys_check|activity|google_cfg|health_settings|sheets_[a-z_]+|gdata_(save|clear))$~',
        'website' => '~^(cms_[a-z_]+|page_[a-z_]+|pages|pages_list|list_pages|seo_[a-z_]+|blocks_[a-z_]+|global_[a-z_]+|chrome_[a-z_]+|theme|theme_get|media|media_[a-z_]+|fm_[a-z_]+|redirects|redirects_[a-z_]+|r404_[a-z_]+|health_(get|psi|scan|speed)|forms_(get|save)|gdata_(status|report)|backups|backup_(list|get)|users|dbx_(browse|export|tables)|mcp_(tokens|log))$~',
    ];
    foreach ($map as $g => $re) if (preg_match($re, $a)) return $g;
    return null;
}

function wx_user_perms(array $u): array {
    if (!function_exists('sec_get_u') || empty($u['id'])) return [];
    $p = sec_get_u((int)$u['id'])['perms'] ?? [];
    return array_values(array_intersect(is_array($p) ? $p : [], array_keys(PERM_GROUPS)));
}

/** true = allowed, false = blocked, null = no rule (fall back to the older check). $legacy = roles listed by the action's own need(). */
function wx_allowed(array $u, string $action, array $legacy = []): ?bool {
    $role = (string)$u['role'];
    if (isset(SHARED[$action])) { $mine = array_merge(wx_role_groups($role), wx_user_perms($u)); foreach (SHARED[$action] as $g) if (in_array($g, $mine, true) || ($g === 'support_view' && in_array('sales', $mine, true))) return true; return false; }
    $g = wx_action_group($action); if ($g === null) return null;
    // a few screens are view-only for Manager/Developer; the lists stay owner+admin for these
    if (in_array($action, ['users', 'backups', 'backup_list', 'backup_get', 'dbx_browse', 'dbx_export', 'dbx_tables', 'mcp_tokens', 'mcp_log'], true)) return in_array($role, ['owner', 'admin'], true);
    $extra = wx_user_perms($u);
    $mine = array_merge(wx_role_groups($role), $extra);
    $has = in_array($g, $mine, true) || (in_array($g, ['support_view', 'updates'], true) && in_array('sales', $mine, true));
    if (!$has) return false;
    if (!$legacy || in_array($role, $legacy, true)) return true;
    return in_array($role, EXPAND[$g] ?? [], true) || in_array($g, $extra, true);
}

/** For the admin menu: what this user can open. */
function wx_caps(array $u): array {
    $extra = wx_user_perms($u);
    return ['label' => ROLE_LABELS[$u['role']] ?? ucfirst((string)$u['role']), 'groups' => array_values(array_unique(array_merge(wx_role_groups((string)$u['role']), $extra))), 'perms' => $extra];
}
