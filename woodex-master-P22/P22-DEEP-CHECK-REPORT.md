# Woodex Master P22 — Deep Check Report

**Date:** 2026-10-08 · **File checked:** `woodex-master-P22.1.zip` (28.6 MB, 623 files, SHA-256 starts `acbe9b8ea350318a`)
**Result: READY TO UPLOAD.** One file only. No blocking issues.

All checks below were run fresh in this round on the exact zip (not copied from earlier reports).

## 1. Zip integrity
| Check | Result |
|---|---|
| Archive test (`unzip -t`) | No errors |
| Files in zip vs code on branch | 623 = 623, **0 content differences** |
| `db.json` (real DB password) in zip | Not included ✔ |
| `router.php` (preview only) in zip | Not included ✔ |
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
| API without login (users, leads, chats, connectors, backup) | All refused: "Not signed in" ✔ |
| Create user as Sales / Support / Developer / Manager | All refused — only Master manages users ✔ |
| Connectors (Gmail, GitHub, Drive) as Sales / Support / Developer | Refused ✔ |
| Saved tokens/passwords sent back to browser | Never (tested with a dummy token) ✔ |
| Login brute-force | Throttle table + lock in PHP ✔ |
| Installer / demo page brute-force | 5 wrong tries → 15 min lock ✔ |
| Real keys/tokens in zip (GitHub, OpenAI, AWS, Meta, Telegram, private keys) | None. 2 scanner hits were false alarms (compressed PDF library data, public SSL certificates) |
| Dangerous PHP (eval, shell, exec, unserialize) | None |
| `_private`, `_database`, `_templates` folders | Web-blocked by `.htaccess` (Deny all) ✔ |
| Security headers | nosniff, X-Frame-Options, HSTS ✔ |
| Off-site backups (GitHub/Drive) | Exclude users, passwords, settings with API keys, all `_private` files ✔ |
| Backup targets | GitHub repo name and Drive `script.google.com` URL strictly checked (no SSRF) ✔ |

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
