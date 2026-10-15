# Woodex Admin v2: Master Plan (2026-09-29)

## Decisions
| Topic | Decision |
|---|---|
| Backend | Hostinger **PHP 8 + MySQL** (included in current hosting). No Netlify/Supabase/GitHub publish chain. |
| Dashboard UI | **TailAdmin free** (MIT, HTML + Tailwind), restyled to the Woodex palette. Tailwind CSS is built once and stored locally. |
| First phases | **A1 → A2 → A3** (dashboard, pages, section library), reviewed after each phase |
| APIs | Free set, plus **WhatsApp Cloud API** and **AI (Claude, optional OpenAI)** |
| Location | `frontend-v1/admin/` (UI) + `frontend-v1/api/` (PHP). Live site pages stay static HTML (fast, SEO-safe). |
| Existing rules | No page delete/rename in the builder (delete stays admin-only, with a redirect). Header/footer edits update all pages. |

## Why not the old wf-admin stack
It had 29 useful screens, but it depended on three services (Netlify functions, Supabase and GitHub publish), which caused sign-in bounces, failed publishes and data split across systems. v2 keeps the **features** and drops that stack. Old Supabase SQL (`wf-admin/supabase/*.sql`) is used as the reference for the MySQL tables.

## Architecture
```
Browser ──> /admin/ (TailAdmin UI, vanilla JS modules)
        ──> /builder/ (existing v3 builder, opened inside admin)
        ──> /api/*.php (one router, token auth, roles, CSRF)
                 ├─ MySQL: users, pages, sections, leads, clients, quotes, invoices, posts, settings, logs
                 └─ Files: static HTML pages, /assets/uploads, /_private/backups
```
Pages are still saved as static `.html`. MySQL stores page metadata, versions, the section library and the business data.

## Phases
### A1: Foundation + dashboard *(first)*
- MySQL installer (`/admin/setup`): creates the tables and the first owner account; the current builder password moves over.
- Login (hashed passwords, rate limit, session token), roles: **Owner, Admin, Editor, Sales**
- TailAdmin shell: sidebar, top bar, dark/light mode, mobile layout
- Dashboard home: KPI cards (pages, enquiries this month, open quotes, last backup), charts (Chart.js, local), recent activity
- The builder opens inside the admin with the same login (single sign-on)
- Activity log (who changed what)

### A2: Pages manager + global parts
- Page list across all 87 pages: search, filter by folder/type, status (published/draft/hidden), last edited, by whom
- New page from **template** (service, location, project, blog, blank), duplicate page
- SEO fields per page: title, description, OG image, canonical, noindex; bulk SEO audit (reuses the builder checker)
- Redirects manager (writes `.htaccess` rules); admin-only delete with a forced redirect
- Global **header / menu / footer** editor → updates all pages at once (with a backup first)
- Drafts: save without publishing, preview link, publish
- Version history per page with compare and restore

### A3: Section library (Elementor-style)
- Save any section/element from the builder, with name, category, tags and an **auto thumbnail**
- Categories: Hero, Services, Features, Projects, Testimonials, CTA, FAQ, Contact, Footer, Custom
- **Global sections**: edit once and every page using them updates (tracked in MySQL)
- Library grid in the admin and in the builder panel: search, filter, preview, rename, move category, delete
- Import/export as `.json` (share between sites); starter pack of Woodex-styled sections
- Move/reorder sections on a page from the admin page outline

### A4: Leads & CRM
- All site forms (contact, estimator, builder form) post to `/api/forms.php`, protected by Turnstile spam protection
- Enquiries inbox → lead → pipeline (Kanban drag-and-drop) → client
- Assign to a team member, notes, follow-up dates, CSV import/export
- Alerts: email (Hostinger SMTP) + **WhatsApp Cloud API** to the team

### A5: Quotations, invoices, projects
- Quote builder with items, templates, PDF, and a WhatsApp/email send link
- Quote → invoice, payment status; projects with stages and photos

### A6: Content collections
- Blog/insights, services, locations, testimonials, team as forms rendered into template pages

### A7: Media, backups, health
- Media manager (folders, WebP conversion, unused-image finder, alt text), full-site backup ZIP + restore, site health (broken links, image weight, 404 log)

### A8: Integrations & settings
- Single source of truth for contact details (fixes the WhatsApp number hardcoded in 230 places)
- Integrations page with a "Test connection" button for each

## APIs
| API | Cost | Use |
|---|---|---|
| wa.me links | Free | Customer-facing WhatsApp buttons |
| Hostinger SMTP | Free (included) | Email alerts, quote emails |
| Google Analytics 4 + Search Console | Free | Visits and search data on the dashboard |
| Cloudflare Turnstile | Free | Form spam protection |
| Openverse, Google Fonts, Lucide | Free | Photos, fonts, icons (already in the builder) |
| **WhatsApp Cloud API (Meta)** | Paid per conversation (service replies within 24h are free) | Lead alerts to staff, quote sending, templates |
| **AI: Claude (optional OpenAI)** | Pay per use | Write/rewrite text in the builder, SEO titles/descriptions, alt text, blog drafts, lead reply suggestions |
| DeepL (later, F7 Translate) | Free up to 500k characters/month | Urdu/English translation |

API keys are stored server-side only (`_private/`, never sent to the browser). AI calls go through `/api/ai.php` with a monthly spend limit set in Settings.

## Security baseline (every phase)
Password hashing, login rate limit, CSRF token, role checks on every API action, prepared SQL statements, upload type checks, `_private/` blocked by `.htaccess`, backup before every bulk change.

## Review gates
Each phase ends with a live preview + test report; the next phase starts only after approval.

## Progress
### ✅ A1 done (2026-09-29)
- `frontend-v1/admin/` (index.html, admin.css, admin.js, vendor/chart.umd.js, vendor/icons.js). Layout follows TailAdmin; written by hand with no build step.
- `frontend-v1/api/admin.php`: setup (MySQL tables `wx_users`, `wx_activity`, `wx_settings`, `wx_throttle`), login, me, logout, profile, password, users, user_save, dashboard, activity
- `builder.php`: accepts per-user single sign-on tokens (`exp.uid.hmac`), logs saves/uploads/theme/new pages to `_private/activity.jsonl` (moved into MySQL by the admin); `admin/` excluded from editable pages; page list includes `mtime`
- Preview: `tools/frontend-v1-admin.mjs` (JSON file instead of MySQL; DB fields hidden in setup)
- Tested in a browser: setup rejects a wrong builder password; builder opens with single sign-on; saves appear in activity; team add/edit; editor role blocked from Team (403); dark mode; mobile
- Not run yet: the PHP/MySQL version (needs Hostinger)

### ✅ A2 done (2026-09-29)
- **Pages manager** (`admin/admin-pages.js`): all pages with type/status filters, search, cards for published/hidden/draft/average SEO score, SEO score per page with an issue list, who changed each page last
- **SEO & settings** per page: status, title and description with character counters, Google preview, social image picker, canonical, noindex → written into the page `<head>` (backup first)
- **Status**: Published / Hidden (noindex, left out of the sitemap) / Draft (404 for visitors through the managed `.htaccess` block; the preview server mimics it)
- **New page** from a blank template or any existing page (sets the title and H1, optionally starts as a draft), **duplicate**, **delete** (owner/admin → file moved to `_private/trash`, 301 redirect added automatically)
- **Version history**: the last 30 versions of each page, **compare with now** (text/link changes), restore
- **Redirects** manager → `.htaccess` managed block; `sitemap.xml` rebuilt automatically (lastmod, leaves out draft/hidden/noindex pages)
- **Header & footer**: structured desktop menu (with the Services dropdown columns) and mobile menu editor → applied to all pages. The per-page "current page" highlight and each page's own "Get a quote" target are kept; 404.html is skipped. **Find & replace** limited to header / mobile menu / footer, with a preview first
- `admin/` excluded from builder pages; `robots.txt` disallows `/admin/`
- Tested: a menu round trip over all 87 pages changes nothing except indentation (and 13 pages now highlight their own link, which the original missed)

## Phase A3 — Section library ✅ (built 2026-09-29)
- Single store `_private/blocks.json` shared by builder + admin. Block: `{id,name,kind,cat,tags,global,html,t,updated}`.
- Admin → Section library: live scaled previews, search, category chips, global filter, edit modal (HTML + live preview), duplicate, export/import JSON, Woodex starter pack (12).
- Global sections: self-contained (`<style data-wx-gcss>` inside root, `WXCSS.globalize`); page copies carry `data-wx-global="ID"`. "Save & update N pages" / builder "Push to all pages" (per-page backup), Detach, in-use delete needs force (detaches copies).
- Builder: save-to-library dialog (name, category, tags, global), library grouped by category, global notice in Content tab.
- Pages ⋯ → Sections outline: reorder / remove / save section to library.
- API: blocks_list, blocks_save(id?), blocks_import, blocks_usage, blocks_sync, blocks_delete(force) — Node + PHP (PHP untested, needs Hostinger).

## Phase A4 — Leads & CRM ✅ (built 2026-09-29)
- All 5 site forms (contact, estimator, 3D brief, fit-out, office fit-out) → `/api/forms.php` via `WXForms` in `assets/site.js`; thank-you box + optional "Continue on WhatsApp" (pre-filled, ref #). No more mailto / Netlify.
- Spam: honeypot, 5 per 10 min per IP, Cloudflare Turnstile (auto-added to forms once keys are saved).
- Admin: Enquiries inbox (KPIs, filters, unread badge, CSV import/export, add enquiry), lead details (call / WhatsApp reply / email, stage, assignee, follow-up, value, tags, notes + stage history, convert to client, delete), Pipeline Kanban (drag between New → Contacted → Site visit → Quote sent → Won / Lost), Clients, Alerts & spam settings (SMTP email, WhatsApp Cloud API text/template, test buttons). Dashboard KPI "Enquiries this month".
- PHP: `api/forms.php`, `api/crm-lib.php` (tables wx_leads, wx_lead_notes, wx_clients; SMTP client; WhatsApp Cloud API) — untested until Hostinger. Preview server writes email alerts to `_private/outbox.jsonl`.

---

## A5: Quotations, invoices, payments, projects (DONE, 2026-09-29)

**Decisions:** Woodex Interior brand only; multi-page A4 quotation (a summary page, then one page per section); numbering WI-10100+; an approved quote becomes an invoice with the **same number**; tax is an optional %, off by default; full scope including projects.

**Files**
- `admin/admin-sales.js`: views for Quotations, Quotation editor, Templates, Invoices, Invoice, Projects; the "Create quotation" button in the lead drawer; the company/document settings modal.
- `admin/admin-print.js`: printable quotation, invoice and receipt (A4, DM Sans, Woodex logo), amount in words (Lakh/Crore), preview overlay with Print / Save PDF.
- `admin/vendor/quote-starter.js`: 9 starter templates taken from the Woodex Excel quotations (Renovation, Fit-out, Design…).
- `api/sales-lib.php`: PHP/MySQL version (tables `wx_templates`, `wx_quotes`, `wx_invoices`, `wx_projects`; JSON documents plus key columns; row locks on status, invoice and payment actions). **Untested until it runs on Hostinger.**
- `tools/frontend-v1-admin.mjs` `a5()`: Node preview version (tested).

**Flow:** enquiry → Create quotation (from a template) → edit sections and items (live totals) → PDF / send by WhatsApp → mark sent (lead moves to *Quote sent*) → new **version** (V2) or **option** (Option 2) under the same number → approve (other versions are superseded; lead moves to *Won* with its value) → convert to invoice (same number, payment schedule) → project opened automatically → record payments (overpayment blocked, receipts WI-10100-R1…) → project stages Planning → Completed, with site photos and updates.

**Tested (Node, headless):** the Renovation template totals match the Excel exactly (Civil 682,000 · Flooring 1,618,875 …); 12-page A4 PDF; version/option/approve/supersede; invoice; partial payment and overpayment guard; project photo upload and stage change; 0 JS errors.

---

## A6a: Content collections (DONE, 2026-09-29) · A6b (services + city pages) next

**Decisions:** manage everything, split into A6a and A6b; import the existing pages; block editor; SEO + drafts + scheduling; AI writing help with a choice of provider (Claude / OpenAI / OpenRouter, e.g. Hermes).

**Admin → Content**
- **Blog & insights / Portfolio**: forms with title, kicker, standfirst, hero, details strip, blocks (heading, paragraph with **bold**/*italic*/[links], list, image, quote), facts box (portfolio), short-version bullets, FAQs (or insert an FAQ group), pull quote, CTA heading and related items; SEO title/description with a Google preview; share image and listing card. Actions: Preview (desktop/mobile), Publish now, Schedule, Save draft.
  - Pages are rendered in the browser into the **existing page design** (the head, header, CTA, trust strip and footer come from a sibling page) and written through `builder.php` (same backups and checks). Publishing also updates the card on `/insights/` or `/projects/` and adds the URL to `sitemap.xml`. JSON-LD is rebuilt (Article/CreativeWork, BreadcrumbList, FAQPage).
  - **Import existing**: the 8 articles and 6 projects are parsed into forms; live pages stay untouched until an item is published.
  - Live pages can't be deleted (per the page-management rule); drafts can.
- **Testimonials / Team**: cards with drag-to-order and a Live switch. "Pages & heading" chooses the pages; "Update website" writes a `<!--wx:testimonials-->` / `<!--wx:team-->` section above the "Why Woodex" strip (styles in `assets/v1.css`).
- **FAQ groups**: reusable question sets (inserted into articles now; city/service pages in A6b).
- **AI**: draft a full article, improve a paragraph, alt text, SEO meta, card text, suggest FAQs. Keys are stored server-side and never returned.

**Scheduling:** times are stored in UTC. Due items publish on the next admin request; for exact timing on Hostinger add a cron job every 5 minutes: `curl -s "https://woodex.com.pk/api/admin.php?action=cron"`.

**Files:** `admin/admin-content.js`, `api/content-lib.php` (PHP, untested until Hostinger), `a6()` in `tools/frontend-v1-admin.mjs` (tested), CSS in `admin.css` and `assets/v1.css`, icons in `vendor/icons.js`.

**Tested (Node, headless):** import 8+6; every re-rendered page keeps the same text and images; new article published (file, listing card, sitemap); scheduled item auto-published; 3 testimonials on home + about; 4 team members on about; FAQ group; a clear AI "add a key" message; 0 JS errors.

## A6b — Service pages, City pages, Business info (done)
- **Service pages** (`#/services`, `admin-fields.js`): every non-blog/non-project page opens as a smart-field form (text, links, images + alt, SEO title/description/share image). Only changed fields are written; FAQ JSON-LD is rebuilt when FAQs change. "Open in builder" is available for layout changes.
- **City pages** (`#/cities`): edit live cities; **New city** copies a template city (name and address swapped in `<head>`/`<main>` only), with optional AI localisation; **Bulk create with AI** takes up to 25 cities per run → drafts → review → **Publish city** (writes the page and adds it to the sitemap). Add the city to the footer yourself via Header & footer.
- **Business info** (`#/business`): email, phones, WhatsApp, address, hours. **Check changes** is a dry run; **Update website** rewrites all pages (every spelling of the hours), `site.js` and the WhatsApp widget, with backups.
- API: `cms_page_kinds`, `cms_sitemap_add`, `cms_biz_get/save/assets`, type `city`, AI task `city` (Node + `content-lib.php`).

## A7 — Media library, Backups, Site health (done)
- **Media library** (`#/media`, `admin-media.js`): grid with folders, search, filters (unused / over 350 KB / no alt). Drag-and-drop upload; the browser resizes to max 2000px and converts to WebP (no GD needed). Detail view: dimensions, copy URL, alt text (+AI) that can be applied to pages missing alt, and where-used (pages, CSS/JS, stored content). **Optimise large images** re-encodes in the same format and name, so no pages change; originals go to Trash. Trash has restore, delete forever and empty. Deleting an image that is in use is blocked unless confirmed.
- **Backups** (`#/backups`): quick backup (pages + data + MySQL dump) or full backup (+ images) as zip on Hostinger (tar.gz in the Node preview), stored in `_private/site-backups/` (web-blocked). The cron job (`?action=cron`) makes a daily backup (keep 7) and a weekly one (keep 4); manual backups keep 10. Download, restore (type RESTORE; a safety copy is taken first; code folders are never overwritten), delete. A **Page history** tab views/restores any of the last 30 versions of a page.
- **Site health** (`#/health`): score plus SEO (title/description length, H1, canonical, duplicate titles), alt text, broken internal links (redirect-aware), missing and oversized images; filter by type/severity, with a Fix link to the smart-field editor. **Google PageSpeed** (mobile/desktop, 4 scores + LCP/CLS/TBT, history of 10 per page, change vs. last run); the API key is optional and stored server-side.
- Roles: owner/admin restore, delete, optimise and manage backups; editors upload, edit alt text and run checks.
- PHP: `api/media-lib.php` (needs ZipArchive + cURL, both standard on Hostinger). Builder API gained `backup_get`.

## A8 — Settings, integrations, security (done)
- **Settings → General**: site name (og:site_name), header logo (width recalculated for a 72px height), favicon and default share image. Check changes is a dry run; Update website rewrites every page through the builder API, with backups.
- **Settings → Integrations**: Email/SMTP (send test), Cloudflare Turnstile (keys checked against Cloudflare), tracking codes (GA4, Tag Manager, Meta Pixel, Search Console verification) injected as one managed `<!-- wx:tracking -->` block in every page's `<head>` (empty = removed; adding and removing is byte-identical). AI and PageSpeed status link to their screens. WhatsApp stays on wa.me links (Cloud API not used, per decision).
- **Settings → System**: server, zip/curl/openssl, cron last run, email/spam status, disk use.
- **My security** (every user): two-step sign-in (TOTP authenticator app, QR via bundled `vendor/qrcode.js` (MIT), 8 one-time recovery codes, replay-protected), login alerts by email for new devices, signed-in devices list with sign out one / all others, recent sign-ins. Owner/admin see Team security: sign someone out everywhere, reset their two-step.
- Tokens are now `uid.exp.sid.sig`; sessions are revocable; changing the password signs out all devices. (Existing sign-ins must log in again once after deploying.)
- PHP: `api/security-lib.php` (state in `_private/security.json` and `settings.json`, no DB migration).
