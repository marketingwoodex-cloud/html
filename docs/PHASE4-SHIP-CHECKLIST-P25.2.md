# Phase 4 — Ship P25.2 · checklist and evidence tables

*The working sheet for `MASTER-PLAN-P25.2.md` §6. **O** = owner (hPanel, GitHub, Google) · **D** = developer
or agent session. Every table has an empty Evidence column on purpose: nothing here counts until the cell
is filled with what was seen (§7 of the plan — screenshots and command output, not prose). The deploy
steps themselves are `docs/DEPLOY-HOSTINGER-P25.2.md`; this sheet says who does what, in what order, and
where the proof is written down.*

## A. Before anything leaves this repository (D)

| # | Step | Evidence |
|---|---|---|
| A1 | Every document committed **before** `node tools/make-release.mjs` — the console's build stamp carries the minute, so a doc written after the build makes both the pack and its manifest stale | |
| A2 | `MANIFEST.json` reads `gitDirty:false`, the `gitSha` is the commit built, ~726 files, `consoleBase /admin-next/` | |
| A3 | The payload contains no `wx-install.php`, no `wx-demo.php`, no `wx-check.php`, no credential — and `sha256sum woodex-master-P25.zip` matches `payload.zipSha256` | |
| A4 | The five gate commands on this tree: suite · conformance · php-lint · `--check` · console smoke | |

## B. The owner's queue (O) — the items only you can do

| # | Step | Evidence |
|---|---|---|
| B1 | **Containment** (Phase 0 / Appendix A): back up `public_html` **and** the database; delete `downloads.html`, `blocks.html`, `wx-install.php`, `wx-check.php`, `wx-demo.php` | |
| B2 | **Rotate every key** after the deletion: every admin password, the database password, Telegram, WhatsApp, Google, AI and MCP keys, the cron key, the page-builder password | |
| B3 | **Make the repository private** (D-2) | |
| B4 | **Turn CI on**: Actions → New workflow → paste `ci/verify.yml` | |
| B5 | **Default-branch decision**: `main` stays the base and `arena/89662743-html` is merged into it, or the line is renamed — the plan needs one written answer | |
| B6 | Review what remains of PR #8's decisions and the P22.2 hotfix upload (`woodex-hotfix-P22.2/README.md`) | |
| B7 | **Google listing**: hours **Mon–Sat 10:00 am–7:30 pm, Sunday closed** (the site says it; the listing still shows 09:30–18:30); website `https://woodex.com.pk/`; add the social profiles. On Woodex Furniture's listing, fix the overnight hours | |
| B8 | Search Console: remove `/downloads.html` and `/blocks.html`; resubmit the sitemap | |
| B9 | Client consent before any case study is published (D-5) | |

## C. Staging (O + D) — the Phase 1 host gate, on a subdomain

Upload the pack to a **staging subdomain** with a copy of the database, then:

| # | Step | Evidence |
|---|---|---|
| C1 | `php db/migrate.php --status` → `--dry-run` → apply → re-apply is a no-op | |
| C2 | The 24 tables' row counts **before and after** the migrations | |
| C3 | The four `tests/run.php --db` failures on SQLite (finding N13) resolved or explained line by line on MySQL | |
| C4 | Publish an article → the header changes across 150 pages as one batch → roll that batch back from page history | |
| C5 | `/api/v2/health` answers; `/admin/` (v2.1) still works; `frontend-v1/api/forms.php` still writes a lead | |
| C6 | The console at `/admin-next/`: sign in, one quotation draft→invoice, one payment recorded, one lead moved on the board | |
| C7 | The five gate commands re-run **on the host**, counts recorded in `STATUS.md` beside their commit | |

## D. Production (O + D) — the same gate, again

| # | Step | Evidence |
|---|---|---|
| D1 | Maintenance window announced; the rollback zip at hand; the pre-deploy backup of `public_html` **and** database stored off the host | |
| D2 | Migrations applied on production; row counts recorded (same table as C2) | |
| D3 | The pack uploaded; the five containment URLs answer **403/404**; `/api/v2/health` answers | |
| D4 | The **host gate a second time** on production: publish → 150 pages → rollback (C4's steps, here) | |
| D5 | `/admin/` (v2.1) is the rollback path and still works; the console is additive at `/admin-next/` | |
| D6 | At mobile width: the board, the quotations screen and the payment form each usable (one screenshot each) | |

## E. The release record

| Field | Value |
|---|---|
| Pack bytes / SHA-256 | |
| `MANIFEST.json` `gitSha` | |
| Gates (suite · conformance · php-lint · `--check` · smoke · live) | |
| What changed since P25.1 | identity (NAP, hours, 2016) · intake (one enquiry one lead) · the Pipeline board · the quotation builder · the payment rules · request-isolation fixes · one plan family |
| What is still open | |

**Exit gate (plan §6):** the record above is complete, C and D each have their evidence or an explicit dated
list of what failed, and `/admin/` is confirmed working as the rollback path.
