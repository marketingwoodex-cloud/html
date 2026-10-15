# Woodex Master P22 — Hostinger release

Upload ONE file: **woodex-master-P22.1.zip** (website + Admin v2 + installer + example settings).
Code source: `frontend-v1/` on this branch. Old P21 zips are deleted — use only P22.

## Install (PHP 7.4+)
1. hPanel → Databases → create MySQL DB + user.
2. **Use File Manager, NOT the "Import website" tool** (it says "website couldn't be recognized" for PHP+admin sites). File Manager → `public_html` → Upload `woodex-master-P22.1.zip` → right-click → **Extract** → extract to `public_html` (Overwrite) → delete the zip.
3. Open `https://woodex.com.pk/wx-install.php` → DB details + your owner name / email / password → Install.
4. Log in at `/admin/` with that email.
5. Delete `wx-install.php`, `wx-demo.php`, `wx-check.php`.
6. Cron every 5 min: `php public_html/api/wa-cron.php` (backups, social, follow-ups).
7. LiteSpeed Cache → Purge all → check in incognito.

## Connect Gmail (email alerts)
1. Google Account → Security → 2-Step Verification ON → **App passwords** → create → copy 16 letters.
2. Admin → Settings → Integrations → Gmail → Connect → email + app password → Save.
3. **Send test email** → then **Use for all email alerts**.

## Connect GitHub (daily backup)
1. GitHub → New **private** repo (e.g. `woodex-backup`).
2. Settings → Developer settings → Fine-grained token → only that repo → Contents: Read and write → copy.
3. Admin → GitHub → repo `owner/name` + token → Save → **Back up now** → file appears in `backups/`.

## Connect Google Drive (daily backup)
1. Drive → New folder → copy link.
2. script.google.com → New project → paste the code shown in the Drive form → change `MY-KEY` → Save.
3. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone → Deploy → allow → copy Web app URL.
4. Admin → Google Drive → folder link + same key + Web app URL → Save → **Back up now**.

Backups contain pages + database, but never passwords, API keys, users or `_private` files.

Full check results: P22-DEEP-CHECK-REPORT.md. Also FEATURES.md, CHANGELOG.md.
