-- db/migrations/009_redirects.sql — the URL rules become a table, and the 404 log becomes one too.
--
-- Phase 3 is the delivery phase: pages, media, redirects. Two of these are files on disk, but the rules
-- about them are rows, and v2.1 kept both in JSON files:
--
--   · `_private/redirects.json` — the list of old address → new address, plus a "seeded" flag. It is
--     read on every request by the .htaccess publisher and edited on a screen, which means a
--     read-modify-write race could drop a rule, and there is no way to ask who added one.
--
--   · `_private/r404.json` — the log of addresses Google (or a customer) asked for and did not get.
--     It is the single most useful SEO input the site has: every 404 is either a redirect to write or
--     a link to fix. In a capped JSON map, its value is invisible to queries.
--
-- Both are additive. The JSON files keep working for v2.1 until the cleanup phase; this file gives
-- v2.5 somewhere queryable to write, and `wx_rd_import_legacy()` reads them across once.
--
-- One deliberate difference from v2.1: a redirect has a **hit counter**. v2.1 could tell you a rule was
-- switched on but not whether anyone had used it in a year, which is how a rules file grows to 200
-- entries that nobody dares delete.

/* --------------------------------------------------------------- the redirect rules
   `from_path` is stored normalised — leading and trailing slashes, lower case — because MySQL's default
   collation is case-insensitive and the check that matters ("does this rule already exist") must agree
   with the unique key. The uniqueness is on (from_path, match_kind): the same address may be redirected
   exactly and also covered by a prefix rule, but not twice by the same kind. */
CREATE TABLE IF NOT EXISTS wx_redirects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_path VARCHAR(255) NOT NULL,
  to_path VARCHAR(500) NOT NULL DEFAULT '',
  code SMALLINT NOT NULL DEFAULT 301,
  match_kind VARCHAR(10) NOT NULL DEFAULT 'exact',
  source VARCHAR(60) NULL,
  on_off TINYINT NOT NULL DEFAULT 1,
  hits INT NOT NULL DEFAULT 0,
  last_hit_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  updated_by INT NULL,
  UNIQUE KEY wx_redirects_rule (from_path, match_kind),
  INDEX wx_redirects_on (on_off)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------- addresses not found
   300 rows was v2.1's cap and it is kept: a log that grows forever stops being read. The cap is applied
   by dropping the least-visited entry, which is the one least likely to be worth a redirect. */
CREATE TABLE IF NOT EXISTS wx_r404 (
  path VARCHAR(255) NOT NULL PRIMARY KEY,
  n INT NOT NULL DEFAULT 0,
  first_at DATETIME NULL,
  last_at DATETIME NULL,
  ref VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------------------ settings
   The two switches v2.1 kept in the redirect config file: force one official hostname, and answer the
   hacked-spam URLs with 410. Seeded as INSERT IGNORE, so a host that has already decided keeps its
   answer. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('redirect.www', '1'),
  ('redirect.spam', '1'),
  ('redirect.seeded', '0');
