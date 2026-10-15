-- db/migrations/012_content.sql — the content items and their page templates.
--
-- Phase 3 asks for "the full content CMS" and "an editor publishes an article". v2.1 kept both in one
-- JSON file (`_private/content.json`) — items, templates, business info, placements and the AI settings,
-- in a single document that every content screen rewrote in full. Two problems with that, and the second
-- is why this migration exists:
--
--   1. **A read-modify-write of the whole file.** Two editors, two screens, one file: the second save
--      drops the first one's work, silently, and there is nothing anywhere that says it happened.
--   2. **"Which posts are drafts" is a question nobody could ask.** The list screen loaded every item and
--      filtered in the browser. Drafts due for review, posts by an author, unlisted items, scheduled
--      items whose time has passed — all of them are one `WHERE` clause away in a table, and were a full
--      scan of a JSON blob before.
--
-- Templates move with the items because they are the same edit: a template says which sections an
-- article of this kind has, and the publisher reads it when it composes the page.
--
-- Additive. The JSON keeps working for v2.1 until the cleanup phase, and `wx_content_import_legacy()`
-- reads it across once — items, templates and the sequence, so ids stay stable for links in the wild.

/* --------------------------------------------------------------------- the items
   `data` holds the article itself (sections, hero fields, category, read time, visibility) as JSON,
   because a section list is a document, not a set of columns. `seo` is separate and narrow: the four
   fields the search result and the social card are made of, which are the ones that get queried and
   compared. `rel` is the page on disk once it has been published — null while it is a draft. */
CREATE TABLE IF NOT EXISTS wx_content (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'draft',
  slug VARCHAR(60) NOT NULL DEFAULT '',
  title VARCHAR(200) NOT NULL,
  rel VARCHAR(255) NULL,
  tpl_id INT NULL,
  data JSON NULL,
  seo JSON NULL,
  flag_order INT NOT NULL DEFAULT 0,
  imported TINYINT NOT NULL DEFAULT 0,
  publish_at DATETIME NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  created_by VARCHAR(120) NULL,
  updated_at DATETIME NULL,
  updated_by VARCHAR(120) NULL,
  INDEX wx_content_type (type, flag_order),
  INDEX wx_content_status (status),
  INDEX wx_content_rel (rel),
  UNIQUE KEY wx_content_slug (type, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------------ the templates
   Which sections an article of this kind carries, in which order, on or off. Small and structured, so it
   is stored as JSON rather than as fourteen columns; the rules about what a valid template *is* live in
   `wx_content_tpl_clean()`, where they can be tested without a database. */
CREATE TABLE IF NOT EXISTS wx_content_tpl (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  tpl JSON NOT NULL,
  is_default TINYINT NOT NULL DEFAULT 0,
  updated_at DATETIME NULL,
  updated_by VARCHAR(120) NULL,
  INDEX wx_tpl_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* Which page on disk is the shell each kind of article is published into: the site's own header, head and
   footer, taken from a real page so a new article looks like the site rather than like a template.
   Seeded, and editable from the screen — every site's list page has a different name. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('content.shell.post', 'insights/index.html'),
  ('content.shell.study', 'projects/index.html'),
  ('content.seq', '0'),
  ('content.tplseq', '0');
