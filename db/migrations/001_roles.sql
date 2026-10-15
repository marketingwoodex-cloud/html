-- db/migrations/001_roles.sql
--
-- GENERATED FILE — do not edit by hand.
-- Source: frontend-v1/api/roles-lib.php (the live v2.1 authority) via tools/gen-caps.mjs.
-- Regenerate:  node tools/gen-caps.mjs
-- Verify:      node tools/gen-caps.mjs --check   (CI fails when this file drifts from v2.1)
--
-- Why a generated file rather than a table someone edits: the capability answer must not change when
-- v2.1 is replaced. v2.1 built its matrix out of five consts and two functions; if v2.5 typed that
-- matrix out again the two would disagree within a release, and the disagreement would show up as
-- somebody losing access they have today — or keeping access they should not. So the matrix is
-- extracted from the code that is running in production right now.
--
-- What each table is:
--
--   wx_roles          role id → the word a person reads
--   wx_role_groups    what each role may do in general, plus `expand` (see below)
--   wx_action_groups  group → the pattern its actions match, in evaluation order
--   wx_action_shared  screens of more than one group: allowed when the user has ANY of them
--   wx_action_roles   screens restricted to named roles, overriding the group answer
--   wx_user_perms     per-user grants on top of the role, which v2.1 kept in a JSON column
--
-- `expand` is v2.1's EXPAND const: it lets a role perform an action whose own role list was narrower,
-- where the *screen* belongs to that role. It is the mechanism that lets a developer save a page
-- without holding the permissions of whoever wrote the page list.
--
-- Re-running this file is safe: every row is INSERT IGNORE and nothing is ever deleted, so a host that
-- has granted per-user permissions keeps them.

CREATE TABLE IF NOT EXISTS wx_roles (
  id VARCHAR(20) NOT NULL PRIMARY KEY,
  label VARCHAR(40) NOT NULL,
  sort INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_role_groups (
  role VARCHAR(20) NOT NULL,
  grp VARCHAR(40) NOT NULL,
  expand TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (role, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* 400 characters: one of the patterns below is longer than 300, and a truncated pattern is a
   permission that quietly stops matching. */
CREATE TABLE IF NOT EXISTS wx_action_groups (
  ord VARCHAR(4) NOT NULL PRIMARY KEY,
  grp VARCHAR(40) NOT NULL,
  pattern VARCHAR(400) NOT NULL,
  is_regex TINYINT(1) NOT NULL DEFAULT 1,
  INDEX wx_action_groups_grp (grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_action_shared (
  action VARCHAR(80) NOT NULL,
  grp VARCHAR(40) NOT NULL,
  PRIMARY KEY (action, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_action_roles (
  action VARCHAR(80) NOT NULL,
  role VARCHAR(20) NOT NULL,
  PRIMARY KEY (action, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_user_perms (
  user_id INT NOT NULL,
  grp VARCHAR(40) NOT NULL,
  granted_at DATETIME NULL,
  granted_by INT NULL,
  PRIMARY KEY (user_id, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------------------------------------------------------------- generated content */
INSERT IGNORE INTO wx_roles (id, label, sort) VALUES
  ('owner', 'Master', 1),
  ('admin', 'Manager', 2),
  ('editor', 'Developer', 3),
  ('sales', 'Sales', 4),
  ('support', 'Support', 5);

INSERT IGNORE INTO wx_role_groups (role, grp, expand) VALUES
  ('owner', 'self', 0),
  ('owner', 'sales', 0),
  ('owner', 'conversations', 0),
  ('owner', 'updates', 0),
  ('owner', 'broadcast', 0),
  ('owner', 'ai', 0),
  ('owner', 'website', 0),
  ('owner', 'settings', 0),
  ('owner', 'master', 0),
  ('admin', 'self', 0),
  ('admin', 'sales', 0),
  ('admin', 'conversations', 0),
  ('admin', 'updates', 0),
  ('admin', 'broadcast', 0),
  ('admin', 'ai', 0),
  ('admin', 'website', 0),
  ('admin', 'settings', 0),
  ('editor', 'self', 0),
  ('editor', 'website', 1),
  ('editor', 'settings', 1),
  ('sales', 'self', 0),
  ('sales', 'sales', 0),
  ('sales', 'conversations', 1),
  ('support', 'self', 0),
  ('support', 'conversations', 1),
  ('support', 'updates', 1),
  ('support', 'support_view', 1);

INSERT IGNORE INTO wx_action_shared (action, grp) VALUES
  ('est_tpls', 'sales'),
  ('est_tpls', 'website'),
  ('est_tpl_save', 'sales'),
  ('est_tpl_save', 'website'),
  ('est_save', 'sales'),
  ('est_save', 'website'),
  ('crm_wa_status', 'conversations'),
  ('crm_wa_status', 'settings'),
  ('crm_wa_status', 'broadcast'),
  ('gdata_report', 'sales'),
  ('gdata_report', 'website'),
  ('s17_meta', 'sales'),
  ('s17_meta', 'support_view'),
  ('projs_table', 'sales'),
  ('projs_table', 'support_view'),
  ('notify_get', 'settings'),
  ('notify_get', 'updates');

/* Screens that stay owner+admin even where a broader pattern also matches them. v2.1 hardcoded this
   list inside wx_allowed(); it is data here so the answer is visible without reading PHP. */
INSERT IGNORE INTO wx_action_roles (action, role) VALUES
  ('users', 'owner'),
  ('users', 'admin'),
  ('backups', 'owner'),
  ('backups', 'admin'),
  ('backup_list', 'owner'),
  ('backup_list', 'admin'),
  ('backup_get', 'owner'),
  ('backup_get', 'admin'),
  ('dbx_browse', 'owner'),
  ('dbx_browse', 'admin'),
  ('dbx_export', 'owner'),
  ('dbx_export', 'admin'),
  ('dbx_tables', 'owner'),
  ('dbx_tables', 'admin'),
  ('mcp_tokens', 'owner'),
  ('mcp_tokens', 'admin'),
  ('mcp_log', 'owner'),
  ('mcp_log', 'admin');

/* The patterns, in the order wx_action_group() evaluates them. Order decides the answer where two
   patterns match the same action, which is why `ord` is part of the table rather than a comment. */
INSERT IGNORE INTO wx_action_groups (ord, grp, pattern, is_regex) VALUES
  ('01', 'self', '~^(tg_link_code|tg_unlink|me|me_get|me_save|me_avatar|me_avatars|profile|password|logout|ping|poll|notif_poll|typing|dashboard|dash_data|site_stats|leads_count|mt_get|sec_(get|alerts|2fa_begin|2fa_enable|2fa_disable|recovery_new|revoke)|google_(me|link|unlink))$~'),
  ('02', 'master', '~^(user_save|sec_2fa_reset|backup_(run|delete|restore)|restore|dbx_row|db_reconnect|google_save|mcp_token_(new|regen|revoke|toggle))$~'),
  ('03', 'support_view', '~^(client_360|get_lead|projs_list)$~'),
  ('04', 'updates', '~^(proj_update|notify_proj_send)$~'),
  ('05', 'conversations', '~^(chat_(list|get|reply|close|file|mode|lead|typing|assign|note|tags|suggest)|wa_stats|whatsapp_stats|crm_wa_status)$~'),
  ('06', 'ai', '~^(chat_cfg_get|chat_cfg_save|chat_test|ai_test|ai_report|ai_unans_[a-z]+|aic_[a-z]+)$~'),
  ('07', 'broadcast', '~^(crm_offers|crm_offer_(save|send|delete)|wag_[a-z_]+|wah_[a-z_]+)$~'),
  ('08', 'sales', '~^(leads?_[a-z0-9_]+|add_lead_note|lead_note|get_lead|list_leads|clients?_[a-z0-9_]+|list_clients|quotes?_[a-z_]+|get_quote|list_quotes|create_quote_draft|invs?_[a-z_]+|pay_(add|delete)|projs?_[a-z_]+|bk_[a-z_]+|est_[a-z_]+|s17_meta|dash_target_save|monthly_report|tpl_(list|save|delete|import)|company_get)$~'),
  ('09', 'settings', '~^(tg_(get|save|connect|disconnect|test)|set_[a-z_]+|crm_settings|crm_settings_save|crm_test|crm_wa_connect|crm_wa_disconnect|notify_(get|save|test)|company_save|cms_biz_[a-z_]+|cms_ai_[a-z_]+|cms_announce_[a-z_]+|mt_set|sys_check|activity|google_cfg|health_settings|sheets_[a-z_]+|gdata_(save|clear))$~'),
  ('10', 'website', '~^(cms_[a-z_]+|page_[a-z_]+|pages|pages_list|list_pages|seo_[a-z_]+|blocks_[a-z_]+|global_[a-z_]+|chrome_[a-z_]+|theme|theme_get|media|media_[a-z_]+|fm_[a-z_]+|redirects|redirects_[a-z_]+|r404_[a-z_]+|health_(get|psi|scan|speed)|forms_(get|save)|gdata_(status|report)|backups|backup_(list|get)|users|dbx_(browse|export|tables)|mcp_(tokens|log))$~');
