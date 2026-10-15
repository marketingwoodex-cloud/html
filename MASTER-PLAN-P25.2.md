# WOODEX — MASTER PLAN P25.2

**Date:** 15 October 2026 · **Author:** Arena agent session (`arena/89662743-html`, repo `marketingwoodex-cloud/html`)
**Base:** P25.1, tag `p25`, commit `aa96524` of `marketingwoodex-cloud/-marketingwoodex`
**Status:** plan + import done; **no code change to the product yet** — Phase 0 is owner-led, Phase 1 onward waits on it

> This plan is written from measurements taken in this session, not from earlier documents. Where a number
> appears it was counted; where something is unproven it says so. The instruction it follows is the owner's,
> of 15 October: *copy the complete P25.1 project into this repository, delete the old content, make it
> deploy-ready, then plan P25.2 — containment and identity first, then the money path.*

---

## 0. What this repository is now

| Fact | Value |
|---|---|
| Root commit | `79b4636` — *"import P25.1 — the whole project, at the commit the release was built from"* |
| Branch | `arena/89662743-html` (pushed). **`main` was not touched** — it still holds the two old archives at `0ea725e` |
| Contents | 1,778 files · 68 MB · byte-for-byte identical to `p25` minus one file (verified by comparing every staged blob hash with the source tree's) |
| Deliberately absent | `woodex-master-P25/woodex-master-P25.zip` (29,158,455 B) — **rebuildable**, proven below |
| Removed at the owner's direction | `1-html.zip`, `next plan .zip` (a RAR5 archive), the 15 Oct analysis report, the old README — last commit `fe4d137`, whose parent `0ea725e` is still `main` |
| What ships from here | `frontend-v1/` — the live 150-page site. Decision of 15 Oct: **one shipping generation**, not three |

### The copy is functional — proved, not asserted

| Check | Result |
|---|---|
| Release payload rebuild (`node tools/make-release.mjs` in a scratch clone of the same content) | **727 files · 42.8 MB uncompressed · zip 29,158,456 B · `gitDirty:false`** |
| Difference from the published P25.1 artifact (29,158,455 B) | **1 byte** — the console's build stamp, which the manifest itself documents as *"two builds of one commit differ by exactly one line"* |
| `tests/conformance.mjs` | 86 / 0 |
| `tools/phplint/php-lint.mjs` | 163 files parse clean |
| `tools/phpwasm/run-php.cjs tests/run.php` | 1283 passed · 0 failed · 14 skipped |
| `admin-v25`: `tsc` · smoke | clean · 154 / 0 over 65 routes |
| Four generators `--check` | up to date (365 actions · 11 families; RBAC rows; quote starters; 24 connector cards) |

**Deploy-ready, with one honest caveat:** the pipeline works and the payload is reproducible, but *no PHP and
no MySQL exist in this sandbox*, so everything above runs under php-wasm and (for database work) SQLite. The
release still has never been through a host run. That is Phase 1 of this plan.

---

## 1. What the last 24 hours changed about the plan

The analysis behind this plan found four things that would have been wrong to build on. Measuring them first
changed the work — and mostly shrank it:

| Earlier finding | What is actually true | Effect on P25.2 |
|---|---|---|
| "Four conflicting identities are published; the site shows LG 90 Link Road, `+92 336 2259477`, `studio@woodex.interior`, `woodex.interior`" | **The shipping site already carries D-6.** `frontend-v1/`: M-71 Zainab ×146 pages, `+92 322 4000768` ×519 `tel:` links, `info@woodex.com.pk` ×692, canonical `woodex.com.pk` ×2116. The root v26 pages match (87/87). The wrong set lived **only in the `1-html` template site**, which is now deleted from this repo | Identity is **not** a bulk find-and-replace job. It becomes a small, precise job (§4) |
| "Unverified claims — 500+ projects, ISO 9001, Wellstar — published 63–141 times" | **Zero occurrences in either shipping tree.** Those claims exist only in the deleted template site and in the older plans | Downgraded from Critical to a record-keeping item: keep them out of the relaunch until the owner supplies evidence |
| "The website captures nothing — forms hand text to WhatsApp" | **The live site captures properly.** `frontend-v1/api/forms.php` inserts into `wx_leads` (source, page, name, phone, email, service, message, `fields` JSON, ip, stage `new`), with a honeypot, a 5-per-10-minute per-IP limit, an auto-reply throttle (1 per contact per day, 60/day site-wide) and optional Turnstile. `api/v2/routes/leads.php` and `lib/forms.php` read the **same table** | The money path is not a greenfield build — it is **three missing screens over a working pipe** (§5) |
| "The compare branch may be a newer line" | `p25...arena/8a776c65` = 82 behind / 3 ahead; PR #4 **closed** today, with its `.gitignore` item salvaged into PR #8 (`97d913a`) | The compare link is closed business. This repository is the only line |

**One thing the copy revealed that the plan must fix:** the P25.1 payload ships `wx-install.php`,
`wx-check.php` and `wx-demo.php` (all three listed in `MANIFEST.json`, all three present in `frontend-v1/`),
and the owner's Phase 0 task has been *"delete those files from `public_html`"* — a manual step that has been
open since September. **A release that ships an installer and a demo endpoint and relies on a human to delete
them is a release that will leak them again.** Phase 0 fixes it in the build, not in a checklist.

---

## 2. Phase 0 — Containment (owner-led, ~3 hours; blocks everything else)

Nothing in Phases 1–4 is worth doing while an installer and a demo endpoint answer on the public host.

**Owner, in this order**

1. **Back up** `public_html` and the database (verify the backup opens before deleting anything).
2. **Delete from `public_html`:** `downloads.html`, `blocks.html`, `wx-install.php`, `wx-check.php`, `wx-demo.php`. (The first two are already absent from the tree; the other three are shipped — see step 7.)
3. **Rotate every credential** — database password, Telegram bot token, WhatsApp keys, Google/AI keys, the cron key, the page-builder password — and change every admin password; enable 2FA.
4. **Make the repository private** (decision D-2, still unclicked; agent sessions get HTTP 403).
5. **Turn on CI:** Actions → New workflow → paste `ci/verify.yml` (the identity that pushes this repo lacks the `workflows` scope, so it cannot be done from here).
6. **Search Console:** remove `/downloads.html` and `/blocks.html`, resubmit the sitemap.
7. **Upload hotfix P22.2** for the live v2.0 admin (`woodex-hotfix-P22.2/README.md` on PR #8's branch)…

**Development, in parallel**

8. **Fold PR #8** (`arena/9e181806-marketingwoodex` — 258 files, unmerged) into this line. It already contains the `.htaccess` wall that answers 403 for `wx-*.php`, the P22.2 hotfix, the Netlify/Vercel/Supabase/MCP removal (decision D-4), the SQLite database gates, and the G4 identity work. Rebuilding any of that here would duplicate it and create a merge conflict later. **Owner action: review and merge PR #8; agent action: port it onto this repository's line.**
9. **Make the payload safe by construction** — **done, and the plan's first wording was wrong.** Reading the
   three files and their callers changed the task: `wx-demo.php` *creates demo logins in the live database*;
   `wx-check.php` and `wx-install.php` are scripts whose own headers tell the owner to delete them; and PR #8
   already denies all three over HTTP (`RewriteRule ^wx-[a-z0-9-]+\.php$ - [F,L,NC]`, master plan S-02).
   **Denial is not absence**: that rule lives in `.htaccess`, which v2.1's `publish_rules()` *rewrites* when
   the owner publishes — a rewrite that drops the rule re-exposes a file that is still on disk.
   `tools/make-release.mjs` now refuses all three, prints the reason for each, records them in
   `MANIFEST.json` (`payload.excluded`), and **fails the build on any fourth `wx-*.php`** at the site root
   until somebody decides it. Cost, accepted deliberately: a fresh install uploads `wx-install.php` from the
   repository for one run (the pack README says so; the v2.1 admin redirects there while the database is
   unconfigured, `frontend-v1/admin/admin.js:479`). An existing install needs none of the three —
   `db/migrate.php` and `db/owner.php` ship as before.
10. **Repository disposition (owner, one setting):** make `arena/89662743-html`'s line the default branch of `html` and delete `main`, or leave both. Until that happens the old README and the two archives are still what a visitor to the repo sees first.

**Exit gate for Phase 0:** all five files 404/403 on the host; every key rotated; repo private; CI green; the new pack builds without the installer and the demo script.

---

## 3. Phase 1 — The gates P25.1 never passed (dev, on staging; target: first week)

P25.1's own release notes say it plainly: *the publish → 150 pages → rollback flow has never been executed,
and migrations 000–014 have never run against MySQL.* P25.2 cannot claim anything until both are true.

| Task | Evidence required |
|---|---|
| 1.1 Migrations on **real MySQL** (staging, a clone of the live database) | `php db/migrate.php --status` → `--dry-run` → apply → re-apply is a no-op. Record the row counts of the 24 tables before and after. The four `tests/run.php --db` failures on SQLite (finding N13) are resolved or explained line by line |
| 1.2 The host run, as an editor, in the console | Publish an article → the header changes across the 150 pages as one batch → roll that batch back from page history → `/api/v2/health` answers → `/admin/` (v2.1) still works. **Screenshots plus the audit rows, not prose** |
| 1.3 The v2.1 API still behaves | `frontend-v1/api/forms.php` still writes a lead after the migrations; `/admin/` login, one lead edit and one invoice print still work |
| 1.4 Baseline numbers written down | The five gate commands re-run **on the host** where PHP exists, with the counts recorded in `STATUS.md` next to the commit they belong to |

**Exit gate:** a status table with host evidence, or an explicit, dated list of what failed.

---

## 4. Phase 2 — One identity, enforced (dev, small — target: second week)

The bulk replacement is unnecessary; the *drift* is the real risk. Today the same facts live in several
places with nothing keeping them equal.

**What must become one thing**

| Fact | Where it lives now | Conflict |
|---|---|---|
| Address / phone / email | `frontend-v1/` chrome ×146 pages, root v26 ×87, JSON-LD schema, footer | Consistent (D-6) — but hand-edited per page |
| Social profiles + map link | footer markup, JSON-LD `sameAs`, the console's *Business info* screen | **N17:** the console updates the footer row but not schema `sameAs` |
| Founding year | "2016" on 90 frontend-v1 pages | Facebook says "since 2015" (`STATUS.md`) |
| Opening hours | the site's chrome | the 90-day plan says Mon–Sat 10:00–19:00, Sun closed; the site prints 10:00–8:30 |
| Review figure | one line in `frontend-v1` (`267`) | the Google listing's real figure is 5.0 / 12 (fixed on PR #8's branch) |

**Tasks**

2.1 Extend `tools/entity.json` (the single-source file PR #8 introduced) to carry phone, WhatsApp, email,
hours, address and founding year, and `tools/apply-entity.py` to write all of them.
2.2 Apply it to both page generations; delete every hand-written copy it replaces.
2.3 Add `python3 tools/apply-entity.py --check` to `ci/verify.yml` so a page that drifts fails the build
(PR #8 already does this for the schema links — extend it, do not add a second mechanism).
2.4 Make the console's *Business info* save write the same facts — footer **and** schema `sameAs`, together.
2.5 Owner decides the two open facts: founding year, and the correct opening hours.
2.6 Keep `500+ / ISO 9001 / Wellstar` out of the relaunch copy until evidence exists, and record that decision in the repository so it cannot creep back in.

**Exit gate:** one file documents the identity; `--check` fails on a deliberate mismatch; the console and the site cannot disagree.

---

## 5. Phase 3 — The money path (dev; the largest piece; target: weeks 3–6)

The pipe already works: **a form on the live site writes `wx_leads`, and `api/v2` reads the same table.**
What is missing is everything after the lead arrives.

### 5.1 Harden the intake (1–3 days)

| Task | Notes |
|---|---|
| Decide Turnstile's failure mode | Today an unreachable Cloudflare means the enquiry is **accepted** (`forms.php`: *"Cloudflare unreachable: accept rather than lose the lead"*). Defensible — but it must be a written decision, with rate limits and the honeypot as the compensating controls |
| Duplicate submissions | A double-tap creates two leads. Add a short-window dedupe key (phone/email + form + page) and a test that proves one submission makes one lead |
| Attribution | The table already stores `source` and `page`. Ensure the console's *Forms* screen shows them per form, and that the reported numbers come from the server, never re-counted in the browser |
| No silent loss | If the alert or the sheets push fails, the lead must still exist and the failure must be visible in the console (it is logged today; it is not surfaced) |

### 5.2 The Pipeline board — the screen the owner asked for first (1–2 weeks)

* The registry entry says `planned` and the tile says SOON. The API is already there: `GET /leads`,
  `GET /leads/{id}`, `PATCH /leads/{id}`, `POST /leads/{id}/notes`.
* Stages come from the server constant `WX_LEAD_STAGES` (`new · contacted · visit · quote · hold · won · lost`) — the screen must not invent its own list, and a lead created by an old v2.1 screen must appear in the right column.
* Drag-and-drop is a convenience; **the write is `PATCH /leads/{id}` with the stage**, optimistic UI reverted on failure.
* Per-column counts come from the server's answer, never from array length; empty columns say "nothing in this stage", not "0".
* Acceptance: a lead submitted from a real page appears in the board within one refresh; its stage change persists; the change is visible in the lead's activity; a second user sees it; mobile widths work; the offline state says so.

### 5.3 The Quotation builder (2–3 weeks)

* Routes exist and are unused by any screen: `quotations` (list/save/get/delete), `/{id}/status`, `/{id}/revise`, `/{id}/invoice`, `quotations/templates` (+ import), and `POST /approvals/{id}/…` for the gate.
* Money rules already agreed in this project: **whole rupees, computed once by `doc_totals()` on the server**; the screen prints, it never re-adds; issued quotations are immutable — a revision is a *new* version; a template starts a draft, never edits a sent document.
* Required states for every panel: loading, empty, validation failure, API error, permission denied — and no number on screen that the server did not send.
* Acceptance: a quote is drafted from a template, approved by the required role, saved as a version, converted to an invoice idempotently (a double click cannot make two invoices), and every step appears in the audit trail.

### 5.4 Invoice, payment, reconciliation (1–2 weeks)

* `wx_invoice_payments` and `wx_approvals` already exist (migration `006`).
* **Write the allocation rule down before coding:** how a partial payment maps to an invoice, what happens to an overpayment, who may record a manual payment, and what evidence it needs. Status is *derived* from persisted payments, never typed in.
* Acceptance: balances reconcile against the payment rows for a fixture set including partial, over-, zero and reversed payments; the test runs in the gate.

**Exit gate for Phase 3:** one real test lead travels the whole path — page → `wx_leads` → board → quotation → approval → invoice → recorded payment — with the audit trail and the screenshots to prove it, on staging, at mobile width.

---

## 6. Phase 4 — Ship P25.2 (dev + owner, ~1 week)

1. Commit every document **before** building the pack (the trap P25.1 recorded: the console's build stamp carries the minute, so a doc written after the build makes both the pack and its manifest stale).
2. `node tools/make-release.mjs` → check `MANIFEST.json`: `gitDirty:false`, the right `gitSha`, 727-ish files, no `wx-install.php`, no demo script, no credential.
3. Upload to a **staging subdomain** with a copy of the database; run the Phase 1 host gate again there.
4. Apply migrations on production inside a maintenance window, with the rollback zip at hand.
5. Keep `/admin/` as the rollback path until the console is complete; the console stays additive at `/admin-next/`.
6. Record the release: bytes, SHA-256, gates, what changed, what is still open.

---

## 7. Evidence rules (what counts as proof in P25.2)

1. **A green local gate is not a release gate.** PHP and MySQL do not exist in the build sandbox; a claim about the host must come from the host.
2. **Every number on every screen comes from the server.** No re-counting in the browser, no figure when the API is silent. (This is already enforced in the console by a smoke sweep; the website's own pages and any new screen inherit the rule.)
3. **No demo data, no fixture fallback, no `?demo=1`** — P25.1 deleted them; P25.2 must not reintroduce one to "make the board look right".
4. **No screenshots of invented data**, and no screenshot presented as proof of a workflow without the matching audit row.
5. **Fix the function, not the string** — when a wrong label, figure or link appears, change the code that produced it so the same wrongness cannot surface elsewhere.
6. **Commit the reasoning.** The commit message is the project's second document.
7. **A failure reported with its evidence is worth more than a success reported without it.**

---

## 8. Status board

| Phase | What | Owner | Status |
|---|---|---|---|
| — | Import P25.1 into `html`, byte-identical minus the build artifact | agent | ✅ done (`79b4636`, branch pushed; `main` untouched) |
| — | Release payload rebuild proven | agent | ✅ 727 files · zip 29,158,456 B · `gitDirty:false` |
| — | **Fold PR #8** (SQLite runtime, `.htaccess` wall, hotfix P22.2, G4 identity, SQLite gates) | agent | ✅ done (`d936ac0`, 253 files, hand-merged in the two files both sides had edited) |
| — | **The product runs locally on PHP 8.2 + SQLite** — site, `api/v2`, console at `/admin-next/`, v2.1 admin at `/admin/` | agent | ✅ done: health `ok:true` · migrations 15 then 0 · roundtrip 47/0 · money-path 89/0 · suite 1336/4/7 · seeded through the API (13 leads, 3 quotations, 1 invoice, 474,100 PKR receivable) |
| — | Fix found by running it: the SQLite shim did not translate the literal `SHOW TABLES LIKE 'wx\_%'` | agent | ✅ fixed, probe finds all 44 tables |
| 0 | Back up; delete the five files; rotate keys | owner | ⬜ open |
| 0 | Repo private · CI on · Search Console | owner | ⬜ open |
| 0 | Merge PR #8 | owner | ✅ no longer needed — folded here (§0 note below); the PR can be closed with a pointer to this commit |
| 0 | Payload stops shipping installer/demo/check scripts | agent | ✅ done (`0e8afc7`): 3 refused, listed in `payload.excluded`, a 4th fails the build |
| 0 | Decide the default branch of `html` | owner | ⬜ open |
| 1 | Migrations on real MySQL (staging) | agent | ⬜ open — runbook ready |
| 1 | Host run: publish → 150 pages → rollback | owner + agent | ⬜ open — runbook ready |
| 2 | One identity, enforced by `--check` | agent | ✅ done: `tools/entity.json` is the one file; the tool writes **both generations** and `--check` gates CI (`ci/verify.yml:92`) |
| 2 | NAP, hours, founding year settled by the owner | owner | ✅ **2016** · **Mon–Sat 10:00–19:30, Sunday closed** · two published numbers · all applied (`telephone` array, `openingHoursSpecification`, `foundingDate`, legacy `openingHours` shorthand) |
| 2 | The console and the site cannot disagree — defect **N17** | agent | ✅ fixed: a Business info save writes the footer row **and** the schema's `sameAs` in one pass; proved end-to-end (apply → both halves → rollback → byte-identical) |
| 2 | One console address, in development and in production | agent | ✅ done (`e65dbd4`): dev serves `/admin-next/`, `/` 302s there, the release bundle routes off its own base, `/admin/` answers a pointer page |
| 3 | Intake hardening (dedupe, Turnstile decision, visible failures) | agent | ⬜ open |
| 3 | Pipeline board | agent | ⬜ open |
| 3 | Quotation builder | agent | ⬜ open |
| 3 | Invoice / payment recording + reconciliation | agent | ⬜ open |
| 4 | Build, stage, deploy P25.2 | both | ⬜ **runbook ready: `docs/DEPLOY-HOSTINGER-P25.2.md`** |

### One identity, enforced (15 October, night) — what "done" means here

`tools/entity.json` is the only place the studio's identity is written down: NAP, the two published numbers, the
opening hours, the founding year, the Google listing and its pin, the profiles that are the studio's own, and the
lines it must never print. `tools/apply-entity.py` puts it on every page — schema (`@id`, `url`, `telephone` as two
numbers, `email`, `PostalAddress`, `geo`, `openingHoursSpecification`, the legacy `openingHours` shorthand,
`hasMap`, `sameAs`, `foundingDate`), the footer's social row in the exact markup v2.1's console writes, the map
links, the score panel, and `llms.txt` — and `--check` fails when any page disagrees, on both generations:
`frontend-v1/` (146 pages) and the older v26 tree at the repository root (87 pages).

Two rules keep it from drifting back. **The console cannot introduce a fact the file does not know**: a Business
info save rewrites the footer row and the schema's `sameAs` together, so a profile added in the console reaches
both the visitor and the search engine — and the run prints `schema on 102 (103 node(s))`, which is how a person
sees that half happened. **A page that links a number the file does not publish stops the run** (`PHONE_RX`,
exit 1), which is the check that would have caught the sweep that silently dropped the second line.

Evidence, all on this branch: suite 1319/0/14 · conformance 86/0 · php-lint 164 · `--check` 146/0 and 87/0 · a
deliberate drift in one page fails `--check` naming that page · a console save moved a profile into 145 pages'
footer **and** 102 pages' schema, and `POST /pages/rollback` put every file back byte for byte.

### The fold, and the local run (15 October, evening)

Folding PR #8 rather than rebuilding its contents was the plan's Phase 0 task 8, and it also removed the
blocker the deployment phase had: the deployment runbook can now quote gates that actually ran, and the
pack that will be uploaded is the pack that was exercised. Three facts worth keeping:

1. **PR #8's own reading of plan S-02 was right**: the `.htaccess` wall belongs in the tree, and the pack
   must additionally *not contain* the scripts. Both are now true, and the manifest records which files
   were refused and why.
2. **The local run is not a MySQL rehearsal.** Foreign keys are dropped on SQLite by design and four suite
   tests (N13) only pass with seeded redirect rules and the real page tree. The migration step in
   `docs/DEPLOY-HOSTINGER-P25.2.md` §4 exists precisely because of this.
3. **Running it found a bug the tests had not**: `api/v2/lib/sqlite.php` translated the parameterised
   `SHOW TABLES LIKE ?` but not the literal form `connectors.php` uses. That is the argument for the local
   run being part of the gate rather than a convenience.


---

## 9. Risks, named

| Risk | Why it matters | Mitigation |
|---|---|---|
| **The sandbox cannot run the product** | Every database claim is an inference from SQLite/php-wasm until a host run happens | Phase 1 before any feature claim; keep the SQLite findings tied to their MySQL confirmations |
| **PR #8 is unmerged and carries the safety net** (`.htaccess` wall, Netlify removal, G4, SQLite gates) | Building P25.2 without it duplicates work and creates conflicts | Fold it first; do not re-implement its contents |
| **Tax and multi-currency are unimplemented** (whole rupees, no tax) | Fine for PKR retail work; wrong the first time a discount rounds or a foreign client pays | Decide the policy in Phase 3.4 **before** the invoice screen is built |
| **Only 43 % of v2.1 actions are bridged** (163/365) | The v2.1 admin remains the fallback; a screen that assumes v2.5 coverage can strand an operation | `aliases.php` is generated and checked — expand it deliberately, per screen |
| **Three page generations still exist in the repo** | The release ships `frontend-v1/`; the root v26 pages remain for the test harness | Decision taken (one shipping generation); retire the root pages once the tests point at a scratch copy (PR #8 task 1.8) |
| **No analytics of any kind** | The relaunch's measurement standard is unmet; nothing will tell the owner which page earns a lead | Add GA4 + consent + conversion events in Phase 3, tied to form submit / WhatsApp click / call click |
| **Packaging discipline** | P25.1 shipped an installer and a demo endpoint and trusted a checklist | Phase 0 task 9 makes the pack safe by construction |
| **Documentation sprawl** | Three plans plus two audits already disagree in places | This plan supersedes the P25 line; `STATUS.md` stays the single tracker; do not add a fourth plan |

---

## 10. What P25.2 will not do

* No migration to a different framework, and no second admin. The line is React + `api/v2` + MySQL on the existing hosting.
* No client portal, no payment gateway, no social/WhatsApp provider change — those are later, and each needs credentials the owner has not yet confirmed.
* No invented metrics, no demo rows, no "for illustration" screenshots.
* No secret in the repository, in a log, or in a chat message.
* No force-push to `main`, no history rewrite, no deployment without a backup and a rollback path.
