# Hostinger deployment — P25.2

**Date:** 15 October 2026 · **Order:** containment → hotfix P22.2 → P25.2 pack → verify → record
**Written by:** Arena agent session (`arena/89662743-html`, repo `marketingwoodex-cloud/html`)
**Who does what:** everything on the host is **yours** (O). Everything buildable and checkable here is done (D).

> This is the last phase. Nothing here is speculative: the pack has been built, unpacked into a stand-in
> `public_html`, served on SQLite with PHP 8.2, and exercised through the real HTTP stack — see §6 for what
> that proved and what it did not.

---

## 0. Before you touch the host

| # | Check | Expected |
|---|---|---|
| 1 | Full backup of `public_html` **and** the database, downloaded, and **opened** once to prove it restores | done |
| 2 | hPanel → Advanced → PHP Configuration set to **PHP 8.2** (7.4 is the floor; 8.2 is what the pack is tested on) | extensions: `pdo_mysql`, `mbstring`, `curl`, `json`, `zip`, `openssl`, `fileinfo` |
| 3 | `_private/db.json` exists on the host (the v2.1 install wrote it) | **never delete or upload over it** |
| 4 | The two files you will upload are at hand | `woodex-hotfix-P22.2/woodex-hotfix-P22.2.zip` (144 KB, in this repo) · `woodex-master-P25/woodex-master-P25.zip` (27.8 MB, built by `node tools/make-release.mjs`) |
| 5 | The manifest hash, so the bytes on the host are the bytes built here | `sha256sum woodex-master-P25.zip` must equal `payload.zipSha256` in `woodex-master-P25/MANIFEST.json` (= `06421d9d…` for the pack committed with this document) |

**Use File Manager's Extract, not Hostinger's "Import website" tool.** The import tool has previously
flattened this project's structure; the README says so and it is worth repeating.

---

## 1. Containment (before anything new lands)

`downloads.html` and `blocks.html` were already removed from the tree; `wx-install.php`, `wx-check.php` and
`wx-demo.php` are **no longer in the pack** (refused by `tools/make-release.mjs`). On the **live** host they
are still sitting in `public_html` from earlier releases, so:

1. File Manager → `public_html` → delete `wx-install.php`, `wx-check.php`, `wx-demo.php`.
2. Delete `downloads.html` and `blocks.html` if they are still there.
3. Change every admin password; enable 2FA (Security screen).
4. Rotate: database password, Telegram bot token, WhatsApp keys, Google/AI keys, the cron key, the page-builder password.
5. Search Console → Removals → remove `/downloads.html` and `/blocks.html`; resubmit the sitemap.

Verify from outside (these should be 403 / 404 / 410, never 200):

```bash
for p in wx-install.php wx-check.php wx-demo.php downloads.html blocks.html; do
  printf '%-20s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://woodex.com.pk/$p)"
done
```

---

## 2. Hotfix P22.2 first (small, reversible, security-only)

Follow `woodex-hotfix-P22.2/README.md`. In short: upload the zip, extract over `public_html`, paste the
`.htaccess` lines it prints (the file is also its own `htaccess-snippet.txt`), confirm `/admin/` still signs
in, and **check one enquiry end-to-end** — the hotfix touches `api/admin.php` and `api/forms.php`.

Why first: it closes the v2.0 shared-password and session issues on the **currently live** admin, and it is
11 files — if anything is wrong, the rollback is one folder restore, not a whole release.

---

## 3. P25.2 pack

The pack is **additive** — it replaces no live page, and `/admin/` (v2.1) stays as the rollback path. It
adds `api/v2/`, `db/`, and the console at `/admin-next/`.

1. Upload `woodex-master-P25.zip` into `public_html`.
2. Right-click → **Extract** → overwrite.
3. **Delete the zip** from the host afterwards.
4. Do not touch `_private/db.json`.

### Migrations — run them in this order, and read each answer

```bash
cd ~/public_html                 # or the path hPanel shows
php db/migrate.php --status      # what the database has, what it needs
php db/migrate.php --dry-run     # say what would run; change nothing
php db/migrate.php               # run it
php db/migrate.php               # again: expect "0 applied, 15 already applied"
```

They are forward-only and re-runnable. If `--status` prints that `_private/db.json` is missing, stop and fix
that first — the migrations read it, and the pack never carries a credential.

### Sign in

Open `https://woodex.com.pk/admin-next/` and sign in with an existing account. If nobody can:

```bash
php db/owner.php --status                     # who can sign in, and how — never a hash
php db/owner.php --email you@example.com --reset   # new password, printed once
```

### Verify from outside

```bash
curl -s https://woodex.com.pk/api/v2/health     # expect ok:true, php 8.x, db reachable + migrated
curl -s -o /dev/null -w '%{http_code}\n' https://woodex.com.pk/admin-next/          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://woodex.com.pk/admin-next/leads     # 200 (the SPA fallback)
curl -s -o /dev/null -w '%{http_code}\n' https://woodex.com.pk/admin/               # 200 — the rollback path
curl -s -o /dev/null -w '%{http_code}\n' https://woodex.com.pk/wx-install.php       # 403 or 404, never 200
```

Two of those are the check that a console on this host *stays* on this host. The bundle's own asset URLs say
which build is deployed:

```bash
curl -s https://woodex.com.pk/admin-next/ | grep -o 'src="[^"]*assets[^"]*"'
```

It must print `/admin-next/assets/index-….js`. If it prints `/assets/index-….js`, the deployed bundle was built
without `--base=/admin-next/`: it will load, and then every link inside it will point at the domain root, where
the site's 404 answers — on 15 Oct that was the "white screen" report, and it is a rebuild, not a server fix.
The same defect appears the second way round as a blank *page*: `/admin-next/dashboard` answering 404 means the
`.htaccess` block this pack appends is missing (or LiteSpeed cached the response before it landed).

Then the gate this project has never passed. As an editor, in the console:

1. **Publish an article** — the page goes live and the sitemap follows its status.
2. **Change the header** — the change lands across the 150 pages as one batch.
3. **Roll that batch back** from page history — the pages return to what they were.
4. **Click through the sidebar, then refresh on a screen** — the address bar must stay inside
   `/admin-next/…` (e.g. `…/admin-next/leads`), and the refresh must render that screen again rather than a
   blank page. This is the one step that proves the console's base path and the host's rewrite agree.
5. Check `/api/v2/health` and that `/admin/` still works.

Record the four results in §5 below. That table is the evidence; a screenshot without it is not.

---

## 4. Staging first, if you can

If a staging subdomain exists (`staging.woodex.com.pk`) with a **copy** of the database:

1. Point the subdomain at its own folder, restore the database copy into a new database.
2. Upload the pack there, run migrations, sign in, run the gate.
3. Only then repeat §3 on production.

The migrations are the only irreversible-feeling step; a dry run on a copy of the real schema is what turns
"should be fine" into "the four tables with data came through".

---

## 5. Evidence table — fill this in and send it back

| Step | Command or action | Expected | What you got |
|---|---|---|---|
| Containment | the five URLs | 403/404/410 | |
| Hotfix | `/admin/` signs in, one enquiry arrives | yes | |
| Migrations | `--status` before | 15 pending | |
| Migrations | apply, then re-run | 15 applied, then 0 | |
| Health | `curl /api/v2/health` | `ok:true`, migrated | |
| Console | `/admin-next/` sign in | 200 | |
| Gate 1 | publish an article | live + in sitemap | |
| Gate 2 | header change across 150 pages | one batch | |
| Gate 3 | rollback from page history | pages restored | |
| Rollback path | `/admin/` still works | 200 | |
| Cron | `php public_html/api/wa-cron.php` every 5 min | unchanged | |

---

## 6. What the local rehearsal proved (and what it did not)

Run here on 15 October, on this repository's tree, with the real pack:

| Proved | Detail |
|---|---|
| The pack builds and is deploy-shaped | 725 files · 42.8 MB uncompressed · zip 29,190,871 B · `gitDirty:false` · manifest SHA recorded |
| The payload contains no setup or demo scripts | `/wx-install.php`, `/wx-check.php`, `/wx-demo.php` all answer **404** from the payload — absent, not merely denied |
| The whole product runs on PHP 8.2 + SQLite | `/api/v2/health` → `{"ok":true,…,"php":"8.2.33","db":{"reachable":true,"migrated":true}}`; the 150-page site serves at `/`; the console at `/admin-next/`; the v2.1 admin at `/admin/` |
| Migrations | v2.1 schema loaded from the dump + 15 migrations applied; a second run reports **0 applied, 15 already applied** |
| The gates | roundtrip **47/0** · money-path **89/0** · full suite **1336 passed · 4 failed · 7 skipped** |
| The write path, over HTTP | seeded through the API — 31 calls: 6 clients, 13 leads, 3 quotations (1 invoiced), 1 payment, 3 bookings |
| The read path, over HTTP | 13 leads across 7 stages (open value 7,375,000 PKR) · quotations draft 402,000 / sent 1,065,000 / invoiced 774,100 · invoices 774,100 invoiced, 300,000 received, **474,100 receivable** · payments 300,000 · 0 approvals pending |

| Not proved here — only the host can | Why it matters |
|---|---|
| Migrations against **MySQL** | SQLite is not MySQL: foreign keys are dropped by design (`004_fk`), and the shim translates the rest. `tests/run.php --db` shows **4 failures (N13)** that depend on seeded redirect rules and the real page tree — they must be settled on MySQL, not here |
| The publish → header → rollback gate | It needs a real page tree and a web server; it is the one release claim that has never been executed |
| Anything about the **live** database | Unknown data, unknown row counts, unknown encoding — which is exactly why §4 exists |
| **The console's sign-in gate** | The WebAssembly dev server keeps one PHP process for *every* request, so session state survives between requests: a caller with no cookie at all is answered as the signed-in owner. On the host, PHP-FPM gives each request its own process and normal session rules apply — this is a property of `tools/phpwasm/serve.cjs`, not of the product. Do not read a preview as an authentication test, and do not leave a dev server reachable from the internet |

**One fix came out of this run** (folded into the line): `api/v2/lib/sqlite.php` translated
`SHOW TABLES LIKE ?` but not the literal `SHOW TABLES LIKE 'wx\_%'` that `connectors.php` runs, so the query
reached SQLite and failed with `near "SHOW": syntax error`. It is translated now (backslash escape stripped,
reason written down); a probe finds all 44 tables.

---

## 7. If it goes wrong

| Symptom | What to do |
|---|---|
| `/admin-next/` is blank | read what the page says before assuming the worst: a bundle that never ran prints its own reason (the boot guard in `admin-next/index.html`), a crash prints the error (the console's error boundary), and a missing API is a sentence, not a blank page. If the page is *truly* empty, check `curl /api/v2/health`, then check the served HTML's script tag against the build (`grep -o 'src="[^"]*assets[^"]*"'` — it must say `/admin-next/…`) |
| `/admin-next/` loads but a link or a refresh goes blank | the bundle predates the base-path fix: rebuild with `npm run build -- --base=/admin-next/` (or `node tools/make-release.mjs`) and re-upload `admin-next/`. The host also needs the `# --- v2.5 console (admin-next) ---` block in `.htaccess` — the pack appends it, a hand-copied folder does not |
| `/admin/` shows a blank page, a 403 from `wx-install.php`, or a "the dashboard is at /admin-next/" page | that is the v2.1 console failing to reach **MySQL**, then asking for its own installer. On this host MySQL exists, so it means `_private/db.json` is wrong or missing — and the file that would "fix" it is deliberately not shipped. Do not upload an installer to a live host; use the v2.5 console at `/admin-next/` and repair `db.json` from the backup |
| Migrations stop halfway | they are re-runnable; fix the reported statement's cause and run `php db/migrate.php` again |
| The public site misbehaves | the pack did not replace a single page — purge LiteSpeed cache and re-check. If it persists, restore the previous release zip over `public_html` |
| One file needs to go back | `git show <sha>:<path>` using the SHA in the manifest (`d936ac0…` for this pack) |
| The whole release must go back | restore the pre-deploy backup (§0.1). `/admin/` is untouched and keeps working throughout |
| An installer page answers 200 | the pack does not contain one — if this happens, the host still has an old file: delete it and rotate the credentials that file could read |

---

## 8. What must not happen

* No `_private/db.json` upload, overwrite or deletion.
* No "Import website" tool.
* No `wx-install.php` on an installed host (fresh installs only — upload it from the repository, run it, delete it).
* No secrets in a screenshot, a ticket, or a chat message.
* No editing a live page directly in File Manager while the console is managing the same pages — the console
  writes versions, and a hand-edit outside it is invisible to the next rollback.
