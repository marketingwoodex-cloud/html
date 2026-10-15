# Woodex — status

The one tracker for the project (decision of 15 October 2026: no Linear). The plan is
`MASTER-PLAN-2026-10-15.md`; this file says where each part of it stands. Every PR ticks what it finished and
adds what it found. `WORK-SANDBOX-MEMORY.md` stays as the v2.5 engineering log.

**Last updated:** 15 Oct 2026 (G4 added in the evening), by the session on `arena/9e181806-marketingwoodex`.
**Owner:** O = business owner (hPanel, GitHub admin, Google, Meta) · D = developer or agent session.

## Now: the owner's queue

- [ ] **O · Phase 0 / Appendix A.** Back up `public_html` and the database; delete `downloads.html`, `blocks.html`,
      `wx-install.php`, `wx-check.php`, `wx-demo.php`; change every admin password; rotate the database password,
      Telegram, WhatsApp, Google, AI and MCP keys, the cron key and the page-builder password. *Still open on 15 Oct.*
- [ ] **O · Make the repository private** (D-2). Agent sessions get HTTP 403 when they try.
- [ ] **O · Turn on CI.** Actions → New workflow → paste `ci/verify.yml`.
- [ ] **O · Review and merge** the PR from `arena/9e181806-marketingwoodex`.
- [ ] **O · Upload hotfix P22.2** by following `woodex-hotfix-P22.2/README.md` (after Phase 0).
- [ ] **O · Delete branches** of closed PRs #1, #4, #5, #6 (after the repo is private). Keep `5dbf5461` for now.
- [ ] **O · Search Console:** remove `/downloads.html` and `/blocks.html`; resubmit the sitemap.
- [ ] **O · Ask clients for consent** to publish their projects (D-5): Peshawar Zalmi, UMT, Devsinc, Hotel One,
      Al Haram City, Jotun, CDC / Care Pro, Car Switch.
- [ ] **O · G4 on the live site** (`GOOGLE-PROFILE-AND-SOCIAL-LINKS.md` section 6, admin only, no upload):
      A. Business info → Social profiles: Facebook + LinkedIn → Update website.
      B. Header & footer → Find & replace (Footer): the two map-link pairs.
      Also: home page "267 reviews" → "12 Google reviews" if the builder allows it.
- [ ] **O · Google listing:** website → `https://woodex.com.pk/`; add the social profiles. On Woodex Furniture's
      listing, fix the overnight hours (10:30 to 07:30).
- [ ] **O · Confirm or reject** Instagram `woodexinterior`, Pinterest `woodex_interior`, TikTok `@woodexinterior`.
      Also confirm that the three home page reviews are on the Woodex Interior listing.
- [ ] **O · One founding year** everywhere: the site says 2016, Facebook says "since 2015".

## Phase 0: containment (target 17 Oct)

- [ ] O · 0.1 backup · 0.2 delete the five files · 0.3 passwords + 2FA · 0.4 rotate keys
- [ ] O · 0.5 repository private
- [ ] O · 0.6 Search Console removals
- [x] D · 0.7 PR #4's `woodex-database.sql` and preview bypass kept out of `main` (the branch was rebuilt without them)

## Phase 1: one source of truth (target 23 Oct)

- [x] D · 1.1 decisions D-1 to D-6 recorded (master plan section 0.1)
- [x] D · 1.2 `5dbf5461` folded in (selectively; the Integrations screen `82e60cf` waits for Phase 4c)
- [ ] O · 1.3 CI enabled (`ci/verify.yml` fixed and ready; needs the owner)
- [x] D · 1.4 PR #7 merged into `main` (`aa96524`)
- [x] D · 1.5 PRs #1, #4, #5, #6 closed with a salvage note
- [ ] O · 1.5b their branches deleted
- [ ] D · 1.6 production inventory (needs a `public_html` file list from the owner; no secrets)
- [ ] D · 1.8 v2.5 dev/test site root → a scratch copy of `frontend-v1/`; then delete the old root site (D-3)

## Phase 2: hotfix P22.2 and staging (target 30 Oct)

- [x] D · 2.1 P22.2 code (S-03, B-01, B-02, B-03, `.htaccess` wall, atomic `.htaccess` and sitemap)
- [x] D · 2.2 P22.2 package (`woodex-hotfix-P22.2/`, `tools/make-hotfix.py`)
- [ ] O · 2.3 deploy P22.2; then D compares the inventory with `MANIFEST.json`
- [ ] O · 2.4 staging subdomain with a copy of the database
- [ ] D · 2.5 migrations on staging (`--status`, `--dry-run`, then apply)
- [ ] D · 2.6 P25.x on staging at `/admin-next/`

## Phase 3 onward

- [ ] Phase 3: v2.5 beside v2.0 on production, host gate twice, fix A-02 (target 13 Nov)
- [ ] Phase 4: pipeline and quotation builder first, then daily operations, website control, automation,
      operations, cut-over (target 22 Jan 2027)
- [ ] Phase 5: migrations 003 / 004 / 010 on production, CSP, off-site backups, monitoring (target 29 Jan 2027)
- [ ] Phase 6: client portal, payments, AI scope generator (Feb–Apr 2027)

## Marketing

- [x] G1 (part): the six studies are called "Design studies"
- [ ] G1: real case studies, once consent arrives (4 by 13 Nov, 8 by 22 Jan)
- [ ] G2: logo wall, 20+ logos with permission
- [ ] G3: About page with the team
- [x] G4 (repo): Google listing found and verified (CID `301798693140782080`, place ID `ChIJt4DGF8wHGTkRAFxV-k80MAQ`).
      Facebook, LinkedIn and X verified. `tools/entity.json` + `tools/apply-entity.py` put `sameAs`, `hasMap`,
      `geo`, postal code and `@id` on 102 schema blocks, point 493 map links at the listing, add footer icons and
      update `llms.txt`. The CI step `--check` keeps the pages in step. Guide: `GOOGLE-PROFILE-AND-SOCIAL-LINKS.md`.
- [x] G4 (repo): the home page review panel shows the listing's real 5.0 / 12, not "4.5 / 267"; "Verified" ticks removed
- [ ] G4 (live): owner steps A and B (queue above); schema and in-page links go live with the P23 release
- [ ] G4: Google listing upkeep: services, weekly photos and posts, Q&A
- [ ] G4: re-issue the company profile PDF with the official NAP and without the spam phrase
- [ ] G5 reviews engine (review link ready: `GOOGLE-PROFILE-AND-SOCIAL-LINKS.md` section 1) · G6 diaspora page · G7 video · G8 conversion events · G9 quarterly guides · G10 alt text + CSS

## Open findings

| ID | Finding | Next step |
|---|---|---|
| N12 | v2.5 dev/test site root is the repository root (the old site) | task 1.8 |
| N13 | `tests/run.php --db` on SQLite: 4 failures tied to seeded redirects and the site tree | confirm on MySQL in CI |
| N16 | Fixed: v2.5's Business screen wrote footer social links as empty spans (no icon) | done in `914fb7c`; a test holds it to v2.0 |
| N17 | v2.5's Business screen updates the footer row but not the schema `sameAs` | sync `sameAs` on save (Phase 4c); until then use `tools/entity.json` |
| N18 | blog posts name their author organization "Woodex Studio", not the official name | change byline and schema together (G3/G9) |
| A-02 | the approval queue stores request bodies verbatim, including keys | Phase 3.4 |
| B-04 | the v2.0 token lives in `sessionStorage` | a CSP on `/admin/` (Phase 5); v2.5 uses HttpOnly cookies |
| B-05 | `mcp.php` and `wa-cron.php` accept keys in the query string | prefer the header; rotate after Phase 0 |
| L-02 | the demo password literal is in 63 `tools/` scripts | read it from an environment variable |
| — | `82e60cf` (Integrations screen) lives only on `5dbf5461` | port onto `main`'s connectors API in Phase 4c |
