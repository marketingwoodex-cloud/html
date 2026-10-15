# Woodex Master P25 — Hostinger release (Admin v2.5, first release)

Upload **one file**: `woodex-master-P25.zip` (the live site + the v2.5 API + the v2.5 console + migrations
+ the installer). 720 files, 43 MB uncompressed, 27.9 MB zipped.

This release is **additive**. It does not replace a single live page and it does not touch the v2.1 admin:
after uploading, the public site behaves exactly as it does now, `/admin/` is still the v2.1 admin, and the
new console is at **`/admin-next/`** while the remaining Phase 3 screens are finished (plan §14.2).

## What is in the zip

| Path | What it is |
|---|---|
| the 150-page site, `assets/`, `builder/`, `insights/` … | the live site, byte-identical to the P22 release |
| `admin/` | the v2.1 admin — **the rollback path, unchanged** |
| `api/` | the v2.1 PHP API (365 actions), unchanged |
| `api/v2/` | **new** — the v2.5 API: one front controller, one file per resource, 150 of v2.1's actions bridged to it |
| `db/` | **new** — migrations `000…014`, `migrate.php`, `owner.php`; denied over HTTP by `db/.htaccess` |
| `admin-next/` | **new** — the built v2.5 console (React), serving at `/admin-next/` |
| `_private/`, `_database/`, `_templates/` | as before |

Not in the zip, on purpose: any database credential (`_private/db.json` stays yours), sourcemaps, the
repository's tools and tests, and the newer v26 marketing pages that live at the repository root — see
`MEMORY-PLAN.md` §2 before mixing the two.

**Also not in the zip, since P25.2: `wx-install.php`, `wx-check.php` and `wx-demo.php`.** They are setup and
diagnostic scripts whose own header tells the owner to delete them after use, and one of them
(`wx-demo.php`) creates demo logins in the live database. They are refused by `tools/make-release.mjs`
rather than left standing behind a deny rule, because the deny rule lives in `.htaccess` — a file the
product itself rewrites when the owner publishes. `MANIFEST.json` records what was left out and why
(`payload.excluded`). An existing install needs none of them: `db/migrate.php` and `db/owner.php` ship as
before. A **fresh** install uploads `wx-install.php` from the repository — see below.

## Upgrade a live site (File Manager, not "Import website")

1. **Back up** `public_html` and the database first.
2. Upload `woodex-master-P25.zip` to `public_html`, right-click → **Extract** (Overwrite), then delete the
   zip.
3. Run the migrations — they are forward-only and re-runnable:
   ```
   php db/migrate.php --status      # what the database has, what it needs
   php db/migrate.php --dry-run     # say what would run, change nothing
   php db/migrate.php               # run them
   ```
   (`db/migrate.php` reads `_private/db.json`, which your v2.1 install already wrote.)
4. Open `https://woodex.com.pk/admin-next/` and sign in with an existing account. If nobody can sign in:
   ```
   php db/owner.php --status                  # who can sign in, and how — never a hash
   php db/owner.php --email admin --reset     # new password, printed once
   ```
5. Leave `/admin/` alone. It is the v2.1 admin and stays the rollback path until coverage is complete.
6. LiteSpeed Cache → Purge all, then check the site in incognito (the `.htaccess` gained one marked block,
   for the console's deep links — the public site and `/api` are untouched by it).
7. Cron is unchanged: `php public_html/api/wa-cron.php` every 5 minutes.

## Fresh install (a host that has never run v2.1)

Same upload — then **upload `wx-install.php` on its own**, because the pack no longer carries it (see above;
it is in the repository at `frontend-v1/wx-install.php`). Open
`https://woodex.com.pk/wx-install.php`, enter the database details and your owner name/email/password,
then **delete `wx-install.php`** and continue with step 3 above, then sign in at `/admin-next/`.

The v2.1 admin redirects to `/wx-install.php` while the database is unconfigured (`frontend-v1/admin/admin.js`
line 479), so on a genuinely fresh host keep the file uploaded only until setup finishes. On an installed
site nothing needs it: `php db/migrate.php` and `php db/owner.php` cover migration and account recovery.

## The proof this release is judged by (plan §11)

On the host, in the console, as an editor: **publish an article**, **change the header and watch the 150
pages change as one batch**, then **roll that batch back from page history**. Then check `/api/v2/health`
and that `/admin/` still works. Write the numbers into the plan's status table — the manifest in this folder
records which commit they belong to.

**Which commit the manifest names.** `gitSha` is the commit *the payload was built from* — `gitDirty:
false` is the promise that the code in the zip is exactly that commit's code. The zip, `MANIFEST.json` and
this file are themselves committed in the next commit, so `gitSha` is deliberately one step behind the
pack's own commit: an artifact cannot contain its own hash, and a manifest that named a commit it was
committed in could only do so by lying.

## Roll back

Restore the previous release zip over `public_html`, or any single file with
`git show <sha>:<path>` using the SHA in `MANIFEST.json` (also recorded: the console's own build stamp, file
counts, the SHA-256 of `api/v2/index.php` and of the zip itself, and the migration list).

## Where everything else is

- `MANIFEST.json` — what this zip was built from and what is in it.
- `MEMORY-PLAN.md` — the work-sandbox memory: state, traps, the next slice, the pending tasks.
- `CHANGELOG.md` — this release and the phases before it.
- Source, plan and pull request: <https://github.com/marketingwoodex-cloud/-marketingwoodex> ·
  <https://github.com/marketingwoodex-cloud/-marketingwoodex/pull/7>
- The release: <https://github.com/marketingwoodex-cloud/-marketingwoodex/releases/tag/p25> — what it
  contains, what its gate is, and the two links below.
- The payload, in the repository: folder
  <https://github.com/marketingwoodex-cloud/-marketingwoodex/tree/arena/4150341e-marketingwoodex/woodex-master-P25>
  · direct download
  <https://github.com/marketingwoodex-cloud/-marketingwoodex/raw/arena/4150341e-marketingwoodex/woodex-master-P25/woodex-master-P25.zip>.
  It is committed there rather than attached to the release because the asset upload endpoint
  (`uploads.github.com`) is not reachable from the sandbox this pack was built in.
- The same pack, for sharing: **<https://drive.google.com/drive/folders/12rpZKxUpHibqPZNMLi1VBMxlmWgTpBuz>**
  (the zip, this README, the manifest, the memory plan and the master plan PDF).

Both copies are the same bytes. Check them against `MANIFEST.json` before uploading to the host: the
`sizes…` line of Hostinger's File Manager popup is not a hash, but `sha256sum woodex-master-P25.zip` is,
and it should equal `payload.zipSha256`.
