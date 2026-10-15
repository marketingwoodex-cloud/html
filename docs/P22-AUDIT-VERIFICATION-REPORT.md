# Independent Audit — Woodex Master P22.1 Hostinger Release

**Auditor:** Arena agent · **Date:** 2026-10-08 · **Scope:** the P22 release package, its claims, and its relationship to the earlier v20 package
**Artifacts audited:** `woodex-master-P22/woodex-master-P22.1.zip`, `P22-DEEP-CHECK-REPORT.md`, `woodex-vlive-P20/woodex-v20-master.zip`, and the branch source `frontend-v1/`
**Branch audited:** `arena/01a0ec23-marketingwoodex` (head of **PR #2** "Woodex Admin v2 + Master P22.1 Hostinger release", base `main`)

---

## 1. Verdict

| Question | Answer |
|---|---|
| Does the P22.1 zip match the branch source? | **Yes** — byte-for-byte identical to `frontend-v1/` (excluding `router.php`). The claim holds. |
| Is the zip well-formed and safe to extract? | **Yes** — no path traversal, no absolute paths, 158 folder entries, no `db.json`, no real keys. |
| Is the code syntactically sound? | **Yes** — PHP 43/43 (zip) / 44/44 (source incl. `router.php`), JS 77/77 independently re-run. |
| Is the release "Admin v2"? | **Yes for code, confusing for naming.** All Admin v2 (5-role) code is present, but the package still ships v20/P20-named files and page titles. |
| Is the `P22-DEEP-CHECK-REPORT.md` trustworthy? | **Partly.** It cites a **stale SHA-256** belonging to the pre-rebuild zip, so it was not re-run on the file it ships. Most technical claims re-verified TRUE; three are inaccurate. |
| Is the user's concern ("old v20 data, not v2") valid? | **Partly valid, and now precisely quantified.** The delta vs the old v20 zip is far smaller than the P22.1 label implies: only **18 non-page files** changed. |
| Any blocking security issue? | **One high-severity shipping issue** — a hardcoded, still-valid `admin`/`admin` bcrypt hash inside `_database/woodex-v20.sql`, plus a demo page that mints `owner`/`admin` logins with a known password. |

**Overall: the package is technically intact and deployable, but it is a thin layer over v20 rather than a clean "v2" release, and the release report overstates its own freshness.**

---

## 2. Evidence base

| Artifact | Size | Files | SHA-256 |
|---|---|---|---|
| `woodex-master-P22.1.zip` (shipped) | 28,575,323 B | 623 | `84cc33d4b27a2c019df373b4e4492f6804d35a597e254566eecdb26169c7537d` |
| `woodex-master-P22.zip` (pre-rebuild, commit `c784d63`) | 28,587,993 B | 623 | `acbe9b8ea350318ac7014539305b739344821979e2668c835bbfe9819cbc3308` |
| `woodex-v20-master.zip` (old P20 release) | 28,552,257 B | 618 | `26f85af0fe2724435470a4f09003881d525446a2ba0aaeef5a6f1807b2696f44` |

Method: both zips extracted and hashed path-by-path; the P22.1 zip diffed against `git archive frontend-v1`; PHP parsed with `php-parser` (no PHP binary in the audit sandbox); HTML links/contacts/content scanned directly.

---

## 3. Verification of every claim in `P22-DEEP-CHECK-REPORT.md`

| # | Report claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Archive test passes, 623 files | ✅ TRUE | Extract clean, 623 files |
| 2 | 623 files vs branch code, **0 content differences** | ✅ TRUE | `diff -rq` of zip vs `frontend-v1` = empty (only `router.php` excluded) |
| 3 | `db.json` not in zip | ✅ TRUE | Only `_private/db.example.json` (placeholder values) |
| 4 | `router.php` not in zip | ✅ TRUE | 624 source files − `router.php` = 623 |
| 5 | Separate setup zip removed | ✅ TRUE | Only one zip in `woodex-master-P22/` |
| 6 | PHP syntax 44/44 | ✅ TRUE | 43 in zip + `router.php` = 44, all parse |
| 7 | JS syntax 77/77 | ✅ TRUE | Re-run: 77/77 own code, 8/8 vendor |
| 8 | No real keys/tokens/private keys in zip | ✅ TRUE | Targeted scan; only hit is compressed data inside `html2pdf.bundle.min.js` (false positive) |
| 9 | No dangerous PHP (`eval`, shell, `unserialize`) | ✅ TRUE | 0 hits for `eval(`, `shell_exec`, `passthru`, `popen`, `proc_open`, `unserialize` |
| 10 | `_private`/`_database`/`_templates` web-blocked | ✅ TRUE | All three ship `.htaccess` = `Require all denied` / `Deny from all` |
| 11 | Security headers present | ✅ TRUE | `nosniff`, `X-Frame-Options`, `HSTS`, `Referrer-Policy` in root `.htaccess` |
| 12 | API refuses calls without login | ✅ TRUE | `api/admin.php:101` → `fail('Not signed in', 401)` |
| 13 | Saved tokens/passwords never returned to browser | ✅ TRUE | `conn-lib.php:72` returns only `mb_substr($sec, -4)` as a hint |
| 14 | Off-site backups exclude users/passwords/settings | ✅ TRUE | `conn-lib.php:93` skips `wx_users`, `wx_throttle`, `wx_settings`; no `_private` files |
| 15 | Backup targets strictly checked (no SSRF) | ✅ TRUE | GitHub `owner/name` regex; Drive must match `^https://script\.google\.com/macros/s/<id>/exec$` |
| 16 | Public pages: 146 · broken links: 0 | ⚠️ **NEARLY** | 146 pages ✅, but **1 broken reference**: `/favicon.ico` in `admin/index.html` has no file (only `assets/img/favicon.svg`) |
| 17 | Wrong contacts: 0 | ⚠️ **INACCURATE** | `api/sales-lib.php:55` ships default wallet numbers `+92 321 3656096` (JazzCash/Easypaisa) — outside the allowed `+92 322 4000768`. Settings data, not public copy, but it is a real default |
| 18 | Banned words: 0 | ✅ TRUE (on public HTML) | They appear only as *data* in tooling (`admin/seo-analyzer.js` banned-word list, `builder/uikit.js`, `api/social-lib.php`) |
| 19 | Installer demo-page brute-force lock (5 tries → 15 min) | ✅ TRUE | Implemented in `wx-install.php` and `wx-demo.php` |
| 20 | **SHA-256 starts `acbe9b8ea350318a`** | ❌ **FALSE** | That is the **pre-rebuild** zip. The shipped P22.1 is `84cc33d4b27a2c01…`. The report was **not** re-run on the file it ships |
| 21 | Admin sweep 174 screens / 0 errors (5 roles) | ⚠️ UNVERIFIABLE | Needs a live PHP+MySQL browser session, unavailable in this sandbox |
| 22 | Gmail/GitHub/Drive real delivery | ⚠️ UNVERIFIABLE | Requires owner accounts (report already flags this) |

> The report's opening line — *"All checks below were run fresh in this round on the exact zip"* — cannot be true for the shipped file, because the cited hash predates it. The reviewer's confidence signal is therefore weaker than presented.

---

## 4. The core question: "old v20 data, not v2?"

This is a fair criticism, and it is now measurable. Comparing the shipped P22.1 zip against the old v20 zip, path by path:

### 4.1 Genuinely new files — 8 only

```
_templates/.htaccess              assets/site-p21.css
_templates/README.md               assets/v1-p21.css
_templates/chat-bot-answers.json
_templates/page-templates-v26.json
_templates/quotation-templates.json
_templates/whatsapp-message-templates.md
```

### 4.2 Genuinely removed — 3 only

```
INSTALL-V20.txt     assets/site.css     assets/v1.css
```

### 4.3 Changed content — 164 files, of which only **19 are real code**

The other **145 HTML pages changed only by a CSS cache-bust** — `site.css → site-p21.css`, `v1.css → v1-p21.css`, `?v=p21` — a mechanical rename affecting 145 of 146 pages. The one page with real HTML changes is `admin/index.html`.

The entire real code delta vs v20 is these 19 files (~190 added lines):

| File | Δ lines |
|---|---|
| `api/conn-lib.php` | +88 (Gmail/GitHub/Drive connectors — **the actual P22 feature**) |
| `admin/admin-p36.js` | +26 |
| `wx-install.php` | +22 (owner-account field) |
| `admin/admin-conn.js` | +14 |
| `api/admin.php` | +10 |
| `admin/admin-sales.js` | +7 |
| `api/social-lib.php` | +6 |
| `.htaccess`, `_private/db.example.json`, `admin/admin-content.js`, `admin/admin-hero.js`, `admin/admin-lib26.js`, `admin/admin-library.js`, `admin/admin.js`, `api/media-lib.php`, `api/wa-cron.php`, `builder/builder.js`, `builder/builder-p17.js` | ±1–3 each |

### 4.4 Legacy v20/P20 naming shipped inside the "P22" package

| Where | What it says |
|---|---|
| `_database/woodex-v20.sql` | **v20** — the only schema source, loaded by the installer |
| `wx-install.php` | `<title>Woodex V20 installer</title>`, *"creates all 20 tables from `_database/woodex-v20.sql`"* |
| `wx-demo.php` | *"Woodex demo logins **(P20)**"* |
| `.htaccess` | *"Woodex frontend-v1"* |
| `admin/index.html` | **no version string at all** |
| Branch git tags | releases are still *committed as* "Master P21 r6", "Master P22 r2/r3/r5/r6" |

**Conclusion:** the *code* is Admin v2 (5-role, verified — see §5.1), but the *package identity* is still v20/P20/P21-named end to end. Anyone inspecting the zip sees "V20 installer" and "woodex-v20.sql" and reasonably concludes they received the old build. That is a naming/packaging defect with real support-cost consequences, not primarily a functional one.

### 4.5 Old packages still on the branch

`README.md` states *"Old P21 zips are deleted — use only P22."* True for P21, but the **v20 package is still shipped twice on the same branch**: `woodex-vlive-P20/woodex-v20-master.zip` and `deploy/p20/woodex-v20-master.zip` (both byte-identical, 28,552,257 B). A person grabbing "the master zip" from the branch has a real chance of taking the wrong one.

---

## 5. Findings by severity

### 🔴 HIGH — Hardcoded, valid `admin`/`admin` credential ships inside the zip

`_database/woodex-v20.sql` ends with:

```sql
INSERT INTO wx_users (name,email,role,pass_hash,...)
VALUES ('Admin','admin','owner','$2y$10$.xP9p.h.R3H7AaDj/wW1P.pB25YEM0qx07xus/3GmFkI4QCygXGw2',1,1,NOW())
ON DUPLICATE KEY UPDATE pass_hash=VALUES(pass_hash), role='owner', active=1;
```

I confirmed interactively with bcrypt: **the hash is the password `admin`** (`admin` → match; `password`, `woodex`, `admin123`, `Admin@123` → no match).

Why it matters:
- The installer's guard is `elseif ($users === 0 && $seed !== '')` — i.e. **on any fresh/empty `wx_users` table the known credential is installed as an active `owner` (Master)**.
- The `P21 fix` comment claims *"never reset existing passwords"*, but the statement still carries `ON DUPLICATE KEY UPDATE pass_hash=VALUES(pass_hash), role='owner', active=1` — a **Password-Reset-and-Privesc primitive** sitting in a file that is one `phpMyAdmin → Import` click from executing.
- The zip is meant to be uploaded to `public_html`, so this file is on the server and directly web-fetchable at `/ _database/woodex-v20.sql` in any window where `.htaccess` is missing/not honored.

**Fix:** delete the `INSERT` from the .sql, generate `admin/admin` only in PHP (the installer already can), and force a password change on first login.

### 🟠 MEDIUM — `wx-demo.php` mints Master + Manager logins with a hardcoded password

- Constant `DEMO_PASS = 'Demo@Woodex2026'`; creates/resets `owner@demo.woodex.pk` (**Master**) and `admin@demo.woodex.pk` (**Manager**), plus sales/editor.
- Guarded only by entering the *database* password (plus a 5-try / 15-min lock) — the same secret already stored in `_private/db.json`.
- Accounts expire after 7 days via `_private/demo.json`, and expiry **is** enforced at login (`api/admin.php:87-90`) — so a forgotten file is not permanent, but 7 days of Master access at a guessable password is a wide window.
- The file is reachable by URL on the live domain until deleted, exactly like `wx-check.php` (which the report does flag).

**Fix:** drop `wx-demo.php` from the production zip, or ship demo seeding only behind a token created by the installer.

### 🟡 LOW — Release-integrity and hygiene

1. **Stale hash in the report** (§3 #20) — regenerates the SHA-256 after every rebuild, or describe the file instead of hashing a stale build.
2. **Broken favicon reference** — `admin/index.html` requests `/favicon.ico`; only `assets/img/favicon.svg` exists.
3. **Unlisted default contacts** — `api/sales-lib.php:55` JazzCash/Easypaisa `+92 321 3656096`.
4. **Two stale v20 zips still on the branch** (`woodex-vlive-P20/`, `deploy/p20/`) — delete or move behind a clearly-named `archive/` path.
5. **No version string in `admin/index.html`** — the admin UI cannot be identified by its own output; add one so a screenshot proves which build is live.
6. **CSP still absent** (report already notes this).

---

## 6. What is genuinely good (do not lose this in the criticism)

- The zip is a **faithful, byte-exact build** of the branch source — no drift between "what we tested" and "what you upload".
- All 145 pages carry consistent cache-busting; the CSS-stale-cache bug is properly closed.
- Security design in the P22 layer is sound: secrets are write-only (last-4 hint only), backups exclude `wx_users`/`wx_throttle`/`wx_settings` and all `_private` files, and GitHub/Drive upload targets are regex-pinned against SSRF.
- `_templates/` correctly ships an empty `.htaccess` deny so starter JSON cannot be harvested.
- 5-role model is real and wired: `api/roles-lib.php` maps legacy codes `owner/admin/editor/sales/support` → **Master/Manager/Developer/Sales/Support** with group permissions and a Master-only action set.

---

## 7. Recommended actions before go-live

| # | Priority | Action |
|---|---|---|
| 1 | **Blocker** | Remove the seeded `admin/admin` INSERT from `_database/woodex-v20.sql`; confirm the hash is no longer bcrypt("admin") |
| 2 | **Blocker** | Delete `wx-demo.php` from the production zip (or gate it properly) |
| 3 | High | Rename the package identity: `woodex-v20.sql` → `woodex-schema.sql`, "Woodex V20 installer" → "Woodex installer", add a `P22.1` build tag to `admin/index.html` |
| 4 | High | Regenerate `P22-DEEP-CHECK-REPORT.md` against the actual shipped hash and re-state claims 16/17 |
| 5 | Medium | Add `/favicon.ico` (or point admin at the existing `.svg`); fix the JazzCash/Easypaisa default |
| 6 | Medium | Remove the two stale v20 zips still on the branch |
| 7 | Low | After deploy: delete `wx-install.php`, `wx-check.php`, `wx-demo.php`; add cron `php public_html/api/wa-cron.php`; purge LiteSpeed cache |

---

## 8. Answers to the specific questions asked

**"Analyse the project."** `-marketingwoodex` is one repository carrying several generations at once: a live static site (`frontend-v1/`, 146 public pages), the newer Admin v2 (`frontend-v1/admin/` + `frontend-v1/api/`), packaging folders (`woodex-master-P22/`, `woodex-vlive-P20/`, `deploy/p1…p20/`), ~20 planning/audit documents at root, and two other Arena branches (`01a0e87c` = `wf-admin` legacy Netlify/Supabase stack, `01a0f834` = Laravel/Supabase master-plan docs only). PR #2 merges 2,605 files / +264,775 lines from `arena/01a0ec23-marketingwoodex`.

**"Audit the zip and report."** Done above — do not treat the existing P22 report as independently verified: its hash claim is stale and three of its public-site claims are inaccurate, though its code, security and structure claims hold up.

**"Old v20 data, not v2?"** The **Admin v2 code is present and correct**; the **P22.1 package still carries v20/P20 naming and a v20-named schema**, and the true delta over v20 is only 19 real code files plus 8 new template files. The impression of receiving an old build is well-founded at the packaging layer, not at the code layer.

**"Find the P22 report data."** The report is `woodex-master-P22/P22-DEEP-CHECK-REPORT.md` on branch `arena/01a0ec23-marketingwoodex` — added in commit `c784d63` and last edited in `8ef7c76` (which changed only two filename references inside it: `woodex-master-P22.zip` → `woodex-master-P22.1.zip`, and the upload step; **the hash line was left unchanged**). Its full text is reproduced in Appendix A.

---

## Appendix A — Original `P22-DEEP-CHECK-REPORT.md` (verbatim, as shipped)

```
# Woodex Master P22 — Deep Check Report

**Date:** 2026-10-08 · **File checked:** `woodex-master-P22.1.zip` (28.6 MB, 623 files, SHA-256 starts `acbe9b8ea350318a`)
**Result: READY TO UPLOAD.** One file only. No blocking issues.

All checks below were run fresh in this round on the exact zip (not copied from earlier reports).

## 1. Zip integrity
| Check | Result |
|---|---|
| Archive test (`unzip -t`) | No errors |
| Files in zip vs code on branch | 623 = 623, **0 content differences** |
| `db.json` (real DB password) in zip | Not included |
| `router.php` (preview only) in zip | Not included |
| Separate setup zip | Removed — its 2 files (`_private/.htaccess`, `db.example.json`) are already inside the main zip |

## 2. Code checks
| Check | Result |
|---|---|
| PHP syntax, all files | **44 / 44 pass** (fresh run) |
| JavaScript syntax (own code) | **77 / 77 pass** |
| Admin browser sweep, 5 roles | **174 screens, 0 errors** — Master 59 · Manager 59 · Developer 35 · Sales 14 · Support 7 |

Note: "Something went wrong" appears 7 times in the sweep. It is only the title of the site's own `500.html` error page shown in page lists (Pages, SEO, Developer home) — not a real error. The checker now recognises it automatically.

## 3. Security audit (fresh)
| Check | Result |
|---|---|
| API without login (users, leads, chats, connectors, backup) | All refused: "Not signed in" |
| Create user as Sales / Support / Developer / Manager | All refused — only Master manages users |
| Connectors (Gmail, GitHub, Drive) as Sales / Support / Developer | Refused |
| Saved tokens/passwords sent back to browser | Never (tested with a dummy token) |
| Login brute-force | Throttle table + lock in PHP |
| Installer / demo page brute-force | 5 wrong tries → 15 min lock |
| Real keys/tokens in zip (GitHub, OpenAI, AWS, Meta, Telegram, private keys) | None. 2 scanner hits were false alarms (compressed PDF library data, public SSL certificates) |
| Dangerous PHP (eval, shell, exec, unserialize) | None |
| `_private`, `_database`, `_templates` folders | Web-blocked by `.htaccess` (Deny all) |
| Security headers | nosniff, X-Frame-Options, HSTS |
| Off-site backups (GitHub/Drive) | Exclude users, passwords, settings with API keys, all `_private` files |
| Backup targets | GitHub repo name and Drive `script.google.com` URL strictly checked (no SSRF) |

## 4. Public website
| Check | Result |
|---|---|
| Public pages | 146 |
| Broken internal links / images | **0** |
| Wrong contacts (only +92 322 4000768 / info@woodex.com.pk allowed) | **0** |
| Banned words (warranty, guarantee, delve, in conclusion) | **0** |
| Home, admin, sitemap, robots, llms.txt, chat API | All respond OK |

## 5. Known, non-blocking (your action on Hostinger)
1. **Delete `wx-install.php`, `wx-demo.php`, `wx-check.php` after setup.** `wx-check.php` shows server/DB health to anyone while it exists.
2. No Content-Security-Policy header yet (low risk; would need testing against Google Maps, Turnstile, fonts).
3. Gmail, GitHub and Drive real delivery needs your own accounts — test with **Send test email** and **Back up now** after connecting.
4. Old `site.css` / `v1.css` stay on the server — harmless, pages use `site-p21.css` / `v1-p21.css`.

## 6. Upload (one file)
1. hPanel → Databases → create MySQL DB + user.
2. File Manager → `public_html` → upload `woodex-master-P22.1.zip` → **Extract** (Overwrite).
3. Open `/wx-install.php` → DB details + your owner name/email/password → Install.
4. Log in at `/admin/` → delete the 3 `wx-*.php` files.
5. Cron every 5 min: `php public_html/api/wa-cron.php`.
6. LiteSpeed Cache → Purge all → check in incognito.
```

*(Note: inside this shipped quote, the report's own reference to "Old `site.css` / `v1.css` stay on the server" conflicts with the zip, which **removed** both files — a further sign the report was not regenerated for the rebuild.)*

---

## Appendix B — Reproducing this audit

```bash
# get the artifacts (branch: arena/01a0ec23-marketingwoodex)
git fetch origin 'refs/heads/*:refs/remotes/origin/*'
git show origin/arena/01a0ec23-marketingwoodex:woodex-master-P22/woodex-master-P22.1.zip > P22.1.zip
sha256sum P22.1.zip                      # expect 84cc33d4b27a2c01...
unzip -q P22.1.zip -d p22
git archive origin/arena/01a0ec23-marketingwoodex frontend-v1 | tar -x -C src
diff -rq --exclude=router.php src/frontend-v1 p22    # expect: no output

# the credential finding
grep -n "INSERT INTO wx_users" p22/_database/woodex-v20.sql
node -e "const b=require('bcryptjs');
  console.log(b.compareSync('admin','\$2y\$10\$.xP9p.h.R3H7AaDj/wW1P.pB25YEM0qx07xus/3GmFkI4QCygXGw2'))"
# -> true   (the shipped seed hash is the password "admin")
```
