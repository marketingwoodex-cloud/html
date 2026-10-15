# WOODEX — Hostinger-Only Master Plan

**Version:** 1.0 · **Date:** 2026-09-29 · **Status:** shared → questions → start
**Decision:** **D11 — supersedes D1.** Everything (hosting, database, backend,
email, DNS) runs on **Hostinger only. No Supabase. No Vercel.**

---

## 0. Why this plan exists

Vercel + Supabase require env-var setup, migration SQL, and two external
accounts — too many steps. Hostinger (hPanel + File Manager + PHP + MySQL)
is one control panel you already know. This plan rewrites the backend so the
**ready-to-upload `wf-admin` folder is everything**.

## 1. What STAYS / What CHANGES

| Piece | Today | Hostinger-only version |
|---|---|---|
| 87 public pages + admin UI | static files | **unchanged** ✅ |
| Block builder, typed editors, content/blocks JSON | static + API | **unchanged** ✅ |
| Backend API | Vercel/Netlify Node functions | **PHP files on Hostinger** (`/api/`) |
| Database | Supabase (Postgres) | **MySQL on Hostinger** (same tables) |
| Publish to live | GitHub → Vercel rebuild (~1–2 min) | **direct file write — instant** (PHP regenerates the page on save) |
| Backups | Vercel/GitHub | **nightly MySQL dump + file zip** in `backups/` (downloadable) |
| Live chat | Supabase Realtime | **polling** — replies appear within ~5 seconds |
| Quotation/invoice emails | Resend | **Hostinger mail (SMTP)** |
| WhatsApp | wa.me links | **unchanged** (Cloud API optional later) |
| Login/auth | server session | **PHP sessions** (same login screen) |
| Redirects (31) | vercel.json | **`.htaccess`** (same rules) |
| Domain DNS | → Vercel | **→ Hostinger only** |

**Not affected:** all CRM features (leads, quotations, invoices, clients,
tracking timelines), Reports, page import, backup export/import, integrations
hub — same features, new storage.

## 2. Why direct publish is better for you

- Save draft → **live immediately** (no 1–2 minute wait)
- **No GitHub token stored on the server** (security win)
- Your site = the files on Hostinger; **nightly backup zip = your safety net**
- GitHub repo stays as the **development source** (this branch) — and as an
  optional weekly mirror if you ever want it

## 3. Build phases (gate after each → your “done ✅”)

### H1 — Hosting foundation
- `.htaccess`: same 31 rewrites + 20 redirects as vercel.json, forced HTTPS,
  `www` handling, directory protection for `/config`, `/content-backups`,
  caching headers, block for `*.sql`/`*.log`
- Folder layout: `/api/*.php`, `/config/` (outside reach), `/sql/`,
  `/backups/` (protected), existing pages/admin/assets
- **Deliverable:** upload package boots on Hostinger with pages + admin UI
  visible (API returns “install needed”)

### H2 — Database (MySQL)
- Translate `supabase/COMPLETE-MIGRATION.sql` → `sql/install.sql` (MySQL):
  users, settings, pages/blocks, enquiries, estimator leads, leads, clients,
  quotations, invoices, timeline, analytics events, chat channels/messages,
  audit log, backups index
- One-time install: import via **phpMyAdmin** (2 clicks) or open
  `/install.php` once → creates tables + seeds admin user
- **Gate:** `install.php` reports “ready”, admin login works

### H3 — PHP API (port of every function)
- `api/router.php` with actions matching today’s endpoints 1:1
  (auth, cms-pages, cms-save, cms-publish, cms-enquiries, cms-leads,
  cms-quotations, cms-invoices, cms-clients, cms-settings, cms-stats,
  cms-backup, cms-chat, cms-users, cms-audit, cms-ai stubs…)
- Same JSON shapes → **admin JS keeps working** (only the base URL changes)
- Rate limit + audit trail retained
- **Gate:** API smoke list all green (script included)

### H4 — Admin wiring
- `api()` points to `/api/router.php` (single switch in admin/index.html)
- PHP session auth = same sign-in gate; roles admin/editor/viewer kept
- **Gate:** full login → edit → save draft → publish → see live change

### H5 — Direct publish + backups
- Publish pipeline: blocks JSON → rendered HTML written in place (atomic
  write: temp file + rename), sitemap regenerated
- Nightly cron (Hostinger Cron): MySQL dump + `content/` + pages zip →
  `/backups/` (keep 14); “Download backup” button in admin → Backups view
- **Gate:** edit page → instant live; backup zip downloads & restores

### H6 — Chat + email
- Chat: visitor widget (already in site) + agent console; 5-second polling,
  unread badges, transcript to CRM timeline
- Email: PHPMailer/SMTP (Hostinger credentials in `/config/`, not in repo) —
  quotation & invoice send buttons
- **Gate:** test chat reply round-trip + test quotation email received

### H7 — Ready-to-upload package + cutover
- Rebuild **`wf-admin` v2** = complete folder with `.htaccess`, `/api/*.php`,
  `/sql/install.sql`, `/config/config.example.php`, `UPLOAD-NOTES.md`
  (updated Hostinger-only steps) — **no Vercel/Supabase files required**
- Staging test: upload to `stage.woodex.com.pk` (subdomain) → run checklist
- Cutover: point woodex.com.pk DNS to Hostinger (A record → Hostinger IP,
  www → same) — **DNS only, no other service**
- Post-cutover: smoke test (home, 3 deep pages, admin login, publish, chat,
  enquiry submit) + credential rotation
- **Gate:** your final “go live ✅”

## 4. Ready-to-upload version — definition of done

The `wf-admin` zip must:
1. Upload to `public_html` and show the website with **no extra setup**
2. Contain `install.php` + `sql/install.sql` (run once)
3. Contain `/api/` (all PHP endpoints) — nothing else needed (no Node, no
   Vercel, no Supabase anywhere)
4. Include updated `UPLOAD-NOTES.md` with **exact hPanel steps**
5. Pass the smoke checklist on the Hostinger staging subdomain

## 5. Your involvement (numbered, at the end)

1. Upload zip via File Manager → extract
2. Import SQL (or open `/install.php` once)
3. Create MySQL DB in hPanel (name/user/pass → paste into config screen)
4. Add 2 cron jobs (backup + cleanup) — copy-paste lines provided
5. Change DNS A record to Hostinger IP
6. Run the 8-point live test with me

## 6. Risks & honest notes

- **Shared hosting limits:** fine for this traffic; PHP sessions + MySQL are
  lightweight. Chat polling = 5s delay (Realtime was instant).
- **Email:** Hostinger mail can be rate-limited; for high volume later, add
  an external sender (optional, not required).
- **Backups:** nightly zips on the same server + your weekly manual download
  = recommended belt-and-braces (off-site copy optional).
- **Old plan docs:** `BACKEND-MASTER-PLAN.md` (Vercel/Supabase) becomes
  historical; features list still applies, stack section superseded by this.

## 7. Execution order (after your “start”)

```
H1 foundation → H2 database → H3 API → H4 admin wiring
   → H5 publish+backup → H6 chat+email → H7 package+cutover
```
Each phase = preview/test → your “done ✅” → next. Deployment happens only
with your final approval (unchanged rule).
