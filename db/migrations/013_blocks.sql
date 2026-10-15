-- db/migrations/013_blocks.sql — the section library, and the global sections that live inside pages.
--
-- Phase 3 asks for a **section library**: the reusable pieces a page is assembled from. v2.1 kept it in
-- `_private/blocks.json` — one file holding up to 200 blocks, read and rewritten whole on every save. Two
-- things that file could not do, and they are why this table exists:
--
--   1. **"Where is this section used?"** The builder answered it by walking every page and looking for a
--      marker. That is a real answer, and it is also what this file keeps — but the *library* itself now
--      has a home where a block can be found by category, by tag, or by name without loading all 200.
--   2. **A partial write.** `blocks_save`, `blocks_delete` and `blocks_import` each read the file, changed
--      one block and wrote all of it back. Two tabs, one library, and the second save silently discards the
--      first one's block.
--
-- The **global** sections are the interesting half: a block marked `global` is inserted into pages with
-- `data-wx-global="<token>"` on its root element, and editing that one block can be pushed to every page
-- that carries it. Those pages are ordinary HTML files, so the push goes through the versioned page writer
-- and comes back as one batch — the same undo the header change uses.
--
-- `blk` is the token that appears *inside the pages* (`data-wx-global="3f9a2c1b8d4e"`). It is not the row
-- id on purpose: the row id is this database's business, while the token is written into 150 HTML files,
-- and renumbering it would orphan every global section on the site at once.

CREATE TABLE IF NOT EXISTS wx_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blk VARCHAR(12) NOT NULL,
  name VARCHAR(60) NOT NULL,
  kind VARCHAR(10) NOT NULL DEFAULT 'section',
  cat VARCHAR(40) NOT NULL DEFAULT 'Custom',
  tags VARCHAR(400) NOT NULL DEFAULT '',
  is_global TINYINT NOT NULL DEFAULT 0,
  html MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  updated_by VARCHAR(120) NULL,
  UNIQUE KEY wx_blocks_blk (blk),
  INDEX wx_blocks_cat (cat),
  INDEX wx_blocks_global (is_global)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* Where the v2.1 file was, so the import can be found on a fresh checkout too. */
INSERT IGNORE INTO wx_settings (k, v) VALUES ('blocks.legacy_path', '_private/blocks.json');
