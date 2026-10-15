-- db/migrations/010_media_pages.sql — the media library, the alt text, and the page history.
--
-- Phase 3 is the delivery phase, and it has one requirement that everything else leans on:
--
--   **an editor changes the header across 150 pages, and rolls the change back from page history.**
--
-- Today the site has no page history at all. `cms_file_backup()` in v2.1 copied a page into a
-- timestamped file before a media rewrite, which is a safety net for a *tool*, not a history a person
-- can read, search or reverse; and a change that touched 150 files left 150 unrelated copies with no
-- way to say "undo this morning's header change". So the version table carries a **batch**: every page
-- written by one action shares a batch id, and one rollback restores the set.
--
-- Two smaller things move out of JSON for the same reason — they are edited on a screen and queried by
-- the screens around them:
--
--   · `_private/media.json` held the alt text per image. Phase 3 asks for an alt-text *queue* ("which
--     images have no alt text"), which is a query, so the alt text belongs in a table.
--   · The media trash held every deleted file's metadata in the same JSON blob, growing without bound.
--     A row per deletion is both smaller and answerable ("what did we delete last week, and who").
--
-- Additive, as always. The JSON keeps working for v2.1 until the cleanup phase, and
-- `wx_media_import_legacy()` reads it across once.

/* ------------------------------------------------------------------- the pages
   One row per page on disk that the admin knows about. The HTML itself stays a file — the site is
   static HTML on Apache and that is not changing in this phase — so this table is the *index*: what the
   page is called, how big it is, when it was last written and by whom. `sha` lets a later scan notice
   that somebody edited a page outside the admin. */
CREATE TABLE IF NOT EXISTS wx_pages (
  rel VARCHAR(255) NOT NULL PRIMARY KEY,
  title VARCHAR(200) NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'page',
  bytes INT NOT NULL DEFAULT 0,
  sha CHAR(40) NULL,
  updated_at DATETIME NULL,
  updated_by INT NULL,
  updated_by_name VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------------------------------------------------------- the page history
   Every write keeps the *previous* content, so the newest version of a page is the file itself and the
   table holds what it used to be. That is deliberate: the file is what Apache serves, and a history
   table that also claims to be the current content is a second source of truth for the thing that
   matters most.

   MEDIUMTEXT holds 16 MB, which is more than any page on this site (the largest is about 90 KB). The
   per-page cap is applied by wx_page_prune(): 20 versions, which at 90 KB is under 2 MB per page. */
CREATE TABLE IF NOT EXISTS wx_page_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rel VARCHAR(255) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  bytes INT NOT NULL DEFAULT 0,
  sha CHAR(40) NULL,
  note VARCHAR(200) NULL,
  batch CHAR(36) NULL,
  restored_from INT NULL,
  created_at DATETIME NOT NULL,
  created_by INT NULL,
  created_by_name VARCHAR(120) NULL,
  INDEX wx_pv_page (rel, id),
  INDEX wx_pv_batch (batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* -------------------------------------------------------------- image alt text
   The key is the image's URL as it appears in the HTML (`/assets/img/kitchen-1.webp`), because that is
   what a page contains and what the alt-text writer has in hand. `checked_at` is what turns this into a
   queue: an image can be legitimately decorative, so "no alt text" is not the same as "not looked at
   yet" — the screen can tell the two apart and nobody has to write "decorative" into an empty field. */
CREATE TABLE IF NOT EXISTS wx_media_alt (
  url VARCHAR(255) NOT NULL PRIMARY KEY,
  alt VARCHAR(300) NOT NULL DEFAULT '',
  checked_at DATETIME NULL,
  checked_by INT NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------- the media trash
   Deleting an image is two things: move the file out of the site, and remember where it came from.
   `file` is the name inside `_private/media-trash`; `why` is 'deleted' or 'replaced', because a
   replacement puts the *old* picture aside and must not be restored over the new one by accident. */
CREATE TABLE IF NOT EXISTS wx_media_trash (
  id INT AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(255) NOT NULL,
  file VARCHAR(255) NOT NULL,
  bytes INT NOT NULL DEFAULT 0,
  why VARCHAR(12) NOT NULL DEFAULT 'deleted',
  at DATETIME NOT NULL,
  by_id INT NULL,
  by_name VARCHAR(120) NULL,
  INDEX wx_mtrash_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
