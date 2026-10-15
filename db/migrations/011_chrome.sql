-- db/migrations/011_chrome.sql — the header, the menu and the footer have a history of their own.
--
-- Phase 3 changes the header across 150 pages, and the pages are already versioned (010). What is *not*
-- yet anywhere is the thing the editor was holding when they did it: the header text, the button label,
-- the footer block, the menu markup, the design block and the header phone number.
--
-- v2.1 kept ten versions of that data in `_private/chrome.json` — a file written by `chrome_save` and
-- read by a screen that only ever showed it. It is the right idea with the wrong home: it is small, it is
-- edited on a screen, and "who changed the button text and when" is a question a business asks.
--
-- So: settings hold the current chrome (`chrome.*` — read by the apply screen, and by nothing else), and
-- this table holds the versions. The pages on disk are the *result*; this is the *source*. Keeping the
-- two apart is what lets the screen say "this is what you are about to write" instead of guessing it back
-- out of the last page somebody edited by hand.

CREATE TABLE IF NOT EXISTS wx_chrome_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version INT NOT NULL,
  data TEXT NOT NULL,
  note VARCHAR(200) NULL,
  created_at DATETIME NOT NULL,
  created_by INT NULL,
  created_by_name VARCHAR(120) NULL,
  INDEX wx_chrome_v (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* The current chrome lives in wx_settings, so it needs no DDL — but the version counter is seeded here so
   a fresh install and an upgraded one agree on where the numbering starts. */
INSERT IGNORE INTO wx_settings (k, v) VALUES ('chrome.version', '0');
