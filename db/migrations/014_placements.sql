-- db/migrations/014_placements.sql — where a kind of content appears on the site.
--
-- Phase 3's "placements and designs": testimonials and team members do not become pages of their own, they
-- appear *inside* pages — a reviews strip on the home page, the team on About. v2.1 kept that decision in
-- `_private/content.json` as `placements`, and its admin composed the markup in the browser and posted each
-- page back one at a time.
--
-- This is the same decision in two tables, and the same five testimonial designs:
--
--   · `wx_placements`     — one row per (kind, page). The pages a kind appears on.
--   · `wx_placement_sets` — one row per kind: the small label above the heading, the heading, the design and
--                           a maximum number of items (0 = every live item).
--
-- The `design` column on a placement row is the per-page override v2.1 offered (`designs` in its JSON, one
-- design per page). NULL means "whatever the set says", which is also how v2.1 read a missing entry.
--
-- What is deliberately *not* stored here is the rendered HTML. The section on a page is composed from the
-- items at the moment somebody presses Update website, so editing a testimonial does not require anybody to
-- remember to press it twice, and the pages carry a marker (`<!--wx:testimonials-->`) that says the section
-- is generated. That marker is v2.1's own convention, kept exactly, because the v2.1 admin is still live.
--
-- The API also answers v2.1's `cms_placements` shape — `{testimonial: [...], testimonialSet: {...}}` — so
-- the old admin and this one read the same truth during the cut-over rather than two files that drift.

CREATE TABLE IF NOT EXISTS wx_placements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(20) NOT NULL,
  rel VARCHAR(190) NOT NULL,
  design VARCHAR(12) NULL,
  updated_at DATETIME NOT NULL,
  updated_by_name VARCHAR(120) NULL,
  UNIQUE KEY wx_placements_kind_rel (kind, rel),
  INDEX wx_placements_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wx_placement_sets (
  kind VARCHAR(20) NOT NULL,
  kicker VARCHAR(60) NOT NULL DEFAULT '',
  heading VARCHAR(120) NOT NULL DEFAULT '',
  design VARCHAR(12) NOT NULL DEFAULT 'cards',
  max_items INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  updated_by_name VARCHAR(120) NULL,
  PRIMARY KEY (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* The two kinds, seeded with v2.1's own defaults so a fresh install answers `cms_placements` the way the
   builder always did. */
INSERT IGNORE INTO wx_placement_sets (kind, kicker, heading, design, max_items, updated_at)
VALUES ('testimonial', '', '', 'cards', 0, NOW()), ('member', '', '', 'cards', 0, NOW());

/* v2.1's defaults for where each kind appeared, kept as a setting rather than as rows: the seed only
   matters on a site that has never said otherwise, and an import that "knows" this could place a reviews
   strip on pages nobody chose. */
INSERT IGNORE INTO wx_settings (k, v) VALUES ('placements.legacy_path', '_private/content.json');
