# Woodex — Complete Feature Guide (P19)

> Every feature, from the admin dashboard to the public website, automations and APIs.
> Each feature lists **What** it does, **Where** to find it (admin link), **Who** can use it, **How** to use it, and a **Tech** line for developers (files and API actions).
> Version: P19 + security build (Oct 2026). Admin: `https://woodex.com.pk/admin/`

**Roles:** Owner (everything) · Admin (all except owner-only items) · Sales (Sales + Support) · Editor (Website + Content). Owner-only items are marked 🔒.

---

## Contents
1. [Sign-in & account](#1-sign-in--account)
2. [Dashboard](#2-dashboard)
3. [Sales](#3-sales)
4. [Quotes & invoices](#4-quotes--invoices)
5. [Projects](#5-projects)
6. [WhatsApp](#6-whatsapp)
7. [Support (chat, updates, AI)](#7-support)
8. [Website (pages & builder)](#8-website-pages--builder)
9. [Content](#9-content)
10. [Media library](#10-media-library)
11. [Marketing (SEO, speed, health)](#11-marketing)
12. [Settings](#12-settings)
13. [Public website](#13-public-website)
14. [Automations, cron & integrations](#14-automations-cron--integrations)
15. [Security features](#15-security-features)
16. [Developer reference](#16-developer-reference)

---

## 1. Sign-in & account

### 1.1 Login
- **What:** Split-screen sign-in with email + password. Sessions can be revoked.
- **Where:** `/admin/` · **Who:** all users
- **How:** Enter email and password, then press Sign in. If 2FA is on, enter the 6-digit code.
- **Tech:** `admin.js` · `admin.php` → `login`, `login_2fa`, `logout`, `me`. HMAC token in `X-WX-ADM`, rate-limited (`wx_throttle`).

### 1.2 Google sign-in
- **What:** Sign in with a linked Google account (no password).
- **Where:** Login screen → *Continue with Google*. Link it in *My security*. · **Who:** all (once linked)
- **Tech:** `phase8-lib.php` → `google_cfg`, `google_login`, `google_link`, `google_unlink`.

### 1.3 Forgot / reset password
- **What:** An emailed single-use reset link.
- **How:** Login → *Forgot password* → enter email → open the link → set a new password.
- **Tech:** `pw_forgot`, `pw_reset` (HMAC token, expires).

### 1.4 My profile & avatar
- **What:** Name, photo, designation and phone (also used on the website Team section).
- **Where:** Top-right avatar → Profile (`#/profile`) · **Who:** all
- **Tech:** `admin-p18j.js` · `me_get`, `me_save`, `me_avatar`, `me_avatars`.

### 1.5 My security (2FA, sessions, alerts)
- **What:** Turn on authenticator 2FA with recovery codes, see recent logins, sign out other devices, get login alerts.
- **Where:** `#/security` · **Who:** all
- **How:** *Enable 2FA* → scan the QR code → enter the code → save the recovery codes.
- **Tech:** `security-lib.php` → `sec_get`, `sec_2fa_begin/enable/disable/reset`, `sec_recovery_new`, `sec_revoke`, `sec_alerts`.

### 1.6 Admin layout
- **What:** Navy icon rail that opens on hover (with a pin), grouped menu (Sales / Support / Website / Content / Marketing / Settings), live count badges, global search (Ctrl+K), notification bell with sound and push, dark-friendly TailAdmin look.
- **Tech:** `admin.js` (NAV, `navBadges`), `admin-inbox.js`, `admin-chrome.js`; `notif_poll`.

---

## 2. Dashboard

### 2.1 Role-based dashboard
- **What:** Live KPIs: new enquiries, pipeline value, quotes, invoices due, payments, projects, chats waiting and sales target progress. Charts plus "today" lists. Sales staff see their own numbers.
- **Where:** `#/dashboard` · **Who:** all (content depends on role)
- **How:** Set a monthly target with *Edit target*. Click any card to open its list.
- **Tech:** `admin-dash.js` · `dash-lib.php` → `dash_data`, `dash_target_save`; `sales17-lib.php` → `leads_stats`, `leads_followups`.

### 2.2 Google Analytics & Search Console cards
- **What:** Visitors, top pages, search clicks and queries (free, through a service account).
- **Where:** Dashboard cards; set up in Settings → Integrations · **Who:** owner, admin
- **Tech:** `admin-google.js` · `google-data-lib.php` → `gdata_status`, `gdata_save`, `gdata_report`, `gdata_clear`.

---

## 3. Sales

### 3.1 Enquiries & leads
- **What:** Every website form, chat, WhatsApp and manual lead in one list. Filters (stage, source, unread), search and a lead drawer with notes, activity, follow-up date and one-click WhatsApp.
- **Where:** `#/enquiries` (alias `#/leads`) · **Who:** owner, admin, sales
- **How:** *Add lead* (`#s17-add`) → fill in the fields → Save → offer WhatsApp. The draft is kept if you close the box. Change the stage in the drawer.
- **Tech:** `admin-crm.js`, `admin-sales17.js` · `crm-lib.php` → `leads_list`, `lead_save`, `lead_note`, `lead_delete`, `lead_convert`, `leads_count`; `sales17-lib.php` → `lead_activity`, `leads_followups`.

### 3.2 Lead import (CSV / Google Sheet)
- **What:** Import leads from CSV (for example *Jan 2025 Lead Management*) with automatic column mapping, duplicate check and a link to existing clients.
- **Where:** Enquiries → *Import* · **Who:** owner, admin
- **How:** Upload the CSV → check the column mapping → Preview → Import.
- **Tech:** `importSheet` in `admin-sales17.js` · `leads_import2` (`sales17-lib.php`), old `leads_import`.

### 3.3 Pipeline
- **What:** Kanban board: New → Contacted → Site visit → Quote sent → Hold → Won / Lost. Drag cards, see column values, view overdue follow-ups.
- **Where:** `#/pipeline` · **Who:** owner, admin, sales
- **Tech:** `CRM_STAGES` = new, contacted, visit, quote, hold, won, lost · `lead_save` (stage).

### 3.4 Bookings (site visits / meetings)
- **What:** Public "Book a visit" calendar with open hours, slot length, clash prevention, status (confirmed / done / cancelled) and alerts.
- **Where:** `#/bookings` · **Who:** owner, admin, sales
- **How:** Settings tab → set the hours and days → bookings appear in the list → change their status.
- **Tech:** `admin-booking.js` · `booking-lib.php` → `bk_cfg`, `bk_cfg_save`, `bk_list`, `bk_save`, `bk_status`; public `bk_slots`, `bk_book`.

### 3.5 Clients (central client database)
- **What:** One master record per client, linked across leads, quotes, invoices, projects and chats. Client 360 view, merge duplicates, type, source, tags and designation.
- **Where:** `#/clients` · **Who:** owner, admin, sales
- **How:** Open a client → *360* tab shows everything. Use *Merge* to join duplicates. *Link all* auto-links leads by phone or email.
- **Tech:** `admin-p19c.js` · `crm-lib.php` → `clients_list`, `client_save`, `client_delete`; `sales17-lib.php` → `client_360`, `clients_master`, `clients_merge`; `p19c-lib.php` → `clients_link`, `client_comms`. Table `wx_clients`, `wx_leads.client_id`.

---

## 4. Quotes & invoices

### 4.1 Quotations
- **What:** Multi-page A4 quotes with WI-10100 numbering (Woodex Interior) and WF- numbering (Furniture). Blocks you can drag to reorder, Summary show/hide, live preview, PDF, client share link and status tracking.
- **Where:** `#/quotes`, editor `#/quote/<id>` · **Who:** owner, admin, sales
- **How:** *New quote* → pick a client and template → add items and blocks → Preview → *Send* (email / WhatsApp link) → mark Accepted → *Make invoice*.
- **Tech:** `admin-sales.js`, `admin-sales17.js`, `admin-print.js`, `admin-print17.js` · `sales-lib.php` → `quotes_list`, `quote_get/save/copy/delete/status/send/link/invoice`; public `quote-view.php` (HMAC link).

### 4.2 Quote templates
- **What:** Reusable layouts (single page, project, classic) with header, footer and signature.
- **Where:** `#/templates` · **Who:** owner, admin, sales
- **Tech:** `admin-templates.js` · `tpl_list`, `tpl_save`, `tpl_delete`, `tpl_import`.

### 4.3 Invoices
- **What:** An invoice keeps the quote's number. Balance = total − paid. Payments, due dates, PDF and a tracker.
- **Where:** `#/invoices`, `#/invoice/<id>` · **Who:** owner, admin, sales
- **Tech:** `invs_list`, `inv_get`, `inv_save`, `pay_add`, `pay_delete`; `sales17-lib.php` → `inv_new`, `inv_track`, `invs_tracker`, `invs_import`.

### 4.4 Transactions
- **What:** Every payment received across invoices, with filters and totals.
- **Where:** `#/transactions` · **Who:** owner, admin, sales

### 4.5 Company details
- **What:** Business name, logo, bank details, terms and signature, all used on quotes and invoices.
- **Tech:** `company_get`, `company_save`.

---

## 5. Projects
- **What:** Projects table with milestones, progress, photos, billing (linked invoices), updates and handover.
- **Where:** `#/projects` · **Who:** all staff (editing depends on role)
- **How:** Create one from a won quote or with *New project* → add milestones → upload photos → post updates (these can notify the client).
- **Tech:** `sales-lib.php` → `projs_list`, `proj_save/delete/update/photo/photo_delete`; `sales17-lib.php` → `projs_table`, `proj_meta`, `proj_milestones`, `proj_bill`.

---

## 6. WhatsApp

### 6.1 WhatsApp hub (offers + automation on one page)
- **What:** Connect or reconnect the number (Cloud API), send discount offers to leads, use templates, see stats.
- **Where:** `#/offers` · **Who:** owner, admin, sales
- **How:** *Connect* → paste the Phone ID and Token → test → create an offer → pick leads → Send.
- **Tech:** `admin-offers.js` · `crm_wa_connect`, `crm_wa_status`, `crm_wa_disconnect`, `crm_offers`, `crm_offer_save/send/delete`, `wa_stats`.

### 6.2 WhatsApp automation & campaigns
- **What:** Segments, message templates, campaigns (schedule / pause), auto flows (welcome, follow-up), STOP/START opt-out list, delivery and read receipts.
- **Where:** `#/offers` → Automation tab (old `#/wauto`) · **Who:** owner, admin, sales
- **Tech:** `admin-p18g.js` · `p18g-lib.php` → `wag_get`, `wag_seg_save/delete`, `wag_tpl_save/delete`, `wag_camp_save/get/action`, `wag_flows_save`, `wag_audience`, `wag_optout(_list)`, `wag_test`, `wag_tick`; cron `wa-cron.php`.

### 6.3 WhatsApp webhook (AI agent)
- **What:** Incoming WhatsApp messages become chats and leads. The AI replies in the customer's language and the team can take over.
- **Setup:** Meta → Callback URL `https://woodex.com.pk/api/whatsapp.php`. The Verify token and **App secret (required)** go in Train AI → WhatsApp.
- **Tech:** `whatsapp.php` (signature fail-closed), `chat-lib.php`.

---

## 7. Support

### 7.1 Inbox / live chat
- **What:** Website chat and WhatsApp threads in one inbox. AI first, then *Take over*. Typing indicator, files and voice notes, convert to lead, close. A floating chat dock on every admin page (minimise hides it).
- **Where:** `#/chat` · **Who:** owner, admin, sales
- **Tech:** `admin-chat.js`, `admin-chat2.js` · `chat_list`, `chat_get`, `chat_reply`, `chat_mode`, `chat_close`, `chat_lead`, `chat_file`, `chat_typing`.

### 7.2 Train AI
- **What:** Q&A, tone (professional designer, no prices), topics to avoid, office hours (10:00 am – 7:30 pm), a test chat and AI provider settings (including a local AI endpoint via tunnel). Daily cap of 400 AI replies; after that it answers from the Q&A list.
- **Where:** `#/train` · **Who:** owner, admin
- **Tech:** `admin-train.js` · `chat_cfg_get`, `chat_cfg_save`, `chat_test`; content-lib `cms_ai_get/save/models`, `ai_test`.

### 7.3 Client updates
- **What:** Automatic messages at key steps (enquiry received, quote sent, work started, handover) by WhatsApp and email, in English and Urdu.
- **Where:** `#/updates` · **Who:** owner, admin
- **Tech:** `admin-notify.js` · `notify-lib.php` → `notify_get`, `notify_save`, `notify_test`.

---

## 8. Website (pages & builder)

### 8.1 All pages
- **What:** Every page with type, status, SEO score, size and last edit. Edit, duplicate, edit meta, new page. Pages cannot be deleted or renamed.
- **Where:** `#/pages` · **Who:** owner, admin, editor
- **Tech:** `admin-pages.js` · `pages_list`, `page_meta_save`; builder `page_new`.

### 8.2 Page builder (Builder v3)
- **What:** Visual drag-and-drop editor: section library, inline text, image replace or upload, import an image from a URL, Openverse images, theme colours and fonts, mobile/tablet preview, page history (restore) and global sections that sync to all pages.
- **Where:** `#/builder` or `/builder/` · **Who:** owner, admin, editor
- **Rules:** Header and footer edits update every page. Only the **Owner** can add new scripts or embeds 🔒.
- **Tech:** `builder/builder.js` · `builder.php` → `load`, `save`, `page_new`, `backups`, `restore`, `upload`, `import_url`, `media*`, `theme(_get)`, `blocks_*`.

### 8.3 Section library
- **What:** About 40 Woodex blocks plus your saved blocks. Global blocks sync across pages.
- **Where:** `#/library` · **Tech:** `admin-library.js` · `blocks_list/save/delete/import/sync/usage`.

### 8.4 Header & footer
- **What:** Logo, menu (desktop and mobile), button text, header phone, footer contacts and design style, with version history. One save updates every page.
- **Where:** `#/global` · **Who:** owner, admin
- **Tech:** `admin-chrome.js` · `global_menu`, `global_chrome`, `global_replace`, `chrome_save`, `chrome_versions`.

### 8.5 Redirects & 404 monitor
- **What:** 301/302/410 rules written to `.htaccess`, a list of addresses visitors missed (404s) with one-click redirect, and a plan/test tool.
- **Where:** `#/redirects` · **Who:** owner, admin
- **Tech:** `admin-redirects.js` · `redirects`, `redirects_save`, `redirects_plan`, `r404_list`, `r404_clear`; public `r404.php`.

---

## 9. Content

### 9.1 Blog & insights
- **What:** 5 article templates. AI writes the full article and auto-fixes it to an SEO score of 70+. Images are added manually. Publish adds the article to the sitemap.
- **Where:** `#/blog`, `#/post/new` · **Who:** owner, admin, editor
- **Tech:** `admin-content.js` · `cms_list/get/save/delete/status`, `ai_run` (`outline`, `article`, `improve`, `fix`, `meta`, `excerpt`, `alt`), `cms_sitemap_add`.

### 9.2 Page templates
- **What:** Ready page layouts built from finished projects. Use one to create a new page, or import/create your own.
- **Where:** `#/pagetpl` · **Tech:** `admin-templates.js` · `cms_tpl_list/save/delete`.

### 9.3 Estimator
- **What:** Public cost estimator with rates per service and size, and a template system (several rate sets). Results become leads.
- **Where:** `#/estimator` · **Who:** owner, admin
- **Tech:** `admin-p18e.js` · `est_save`, `est_tpls`, `est_tpl_save` → `assets/js/estimator-rates.js`.

### 9.4 Forms
- **What:** Settings per form (contact, quote, WhatsApp, estimator, booking): alert email, alert WhatsApp number, auto-reply on/off and text. Spam protection: Turnstile, honeypot, rate limit, and auto-reply caps (1 per person per day, 60 per day).
- **Where:** `#/forms` · **Who:** owner, admin
- **Tech:** `admin-p18e.js` · `forms_get`, `forms_save`; public `forms.php`.

### 9.5 Portfolio
- **What:** Project case studies (photos, location, scope) shown on the Projects pages.
- **Where:** `#/portfolio` · **Who:** owner, admin, editor

### 9.6 Service pages
- **What:** Edit service page content (hero, sections, FAQ), create one from a template, duplicate.
- **Where:** `#/services` · **Tech:** `admin-fields.js` · `cms_page_kinds`; builder `page_new`.

### 9.7 City pages
- **What:** Local SEO pages (Lahore, Karachi, Islamabad, …). The AI writes local text.
- **Where:** `#/cities`, `#/citydraft` · **Tech:** `ai_run` → `city`.

### 9.8 FAQ groups
- **What:** FAQ groups for each website page. The group shows on the pages it's placed on, with FAQ schema.
- **Where:** `#/faqs` · **Tech:** `cms_placements`, `cms_placements_save`, `cms_reorder`.

### 9.9 Testimonials
- **What:** Client reviews with rating, photo and project. Pick a design (default for all pages or per page) and choose which pages show them.
- **Where:** `#/testimonials` · **How it shows:** published testimonials appear in the testimonial section of the selected pages.

### 9.10 Team (on website)
- **What:** Real team profiles (name, role, photo, bio) shown in the website Team section.
- **Where:** `#/team` · **Tech:** `.wx-team*` CSS in `assets/v1.css`.

---

## 10. Media library
- **What:** All images and files in folders: upload, alt text, find where a file is used, replace (keeps the address and refreshes the cache), move, trash/restore, WebP conversion plus 480/960 sizes (originals kept).
- **Where:** `#/media` · **Who:** owner, admin, editor
- **Tech:** `admin-media.js` · `media-lib.php` → `media_list/upload/alt/folder/move/replace/sizes/trash/trash_list/restore/purge`; builder `media_usage`.

---

## 11. Marketing

### 11.1 SEO manager
- **What:** SEO score per page, focus keyword plus 4 related keywords, title/description editor with AI suggestions, sitemap, robots.txt, schema, broken links. SEO panels also appear inside the editors.
- **Where:** `#/seo` · **Who:** owner, admin, editor
- **Tech:** `admin-seo.js`, `seo-analyzer.js` · `seo-lib.php` → `seo_list/page/save/scores/ai/sitemap/robots_save`.

### 11.2 Speed
- **What:** PageSpeed (mobile and desktop) per page with history: LCP, CLS, scores.
- **Where:** `#/speed` · **Tech:** `admin-speed.js` · `health_psi`, `health_speed`, `health_settings`.

### 11.3 Site health
- **What:** Scan for missing alt text, broken links, missing meta, large images and other issues, with a score out of 100 and fix links.
- **Where:** `#/health` · **Tech:** `health_get`, `health_scan`.

---

## 12. Settings
All settings are on **one Settings page** (`#/settings`) with tabs. **Who:** owner, admin.

| Tab | What it does | Tech |
|---|---|---|
| **Integrations & APIs** | Email (SMTP), WhatsApp Cloud API, Turnstile keys (with test), Google (sign-in, Analytics, Search Console service account), AI keys, tracking codes, MCP tokens | `admin-integ.js`, `admin-settings.js` · `crm_settings(_save)`, `crm_test`, `set_get`, `set_general_save`, `set_tracking_save`, `set_ts_test`, `google_save`, `mcp_token_*` |
| **Business info** | Name, address, phones, hours, socials, logo (used on site, schema, quotes, AI) | `cms_biz_get`, `cms_biz_save`, `cms_biz_assets` |
| **Users & roles** | Add, edit and disable team members; roles Owner / Admin / Sales / Editor. Only the Owner can edit the Owner | `admin-users.js` · `users`, `user_save` |
| **Activity log** | Who did what and when (filterable) | `activity` |
| **Backups** 🔒 | Daily, weekly and manual full backups (pages, data, images, DB). Download, upload, restore (safety copy first). Owner-only | `backup_list/run/delete/restore`, `backup_up`, `backup_dl` |
| **Maintenance & error pages** | Maintenance or coming-soon mode (countdown page) with a bypass link; edit 404/500/503 pages | `admin-p18h.js` · `mt_get`, `mt_set` |
| **File manager** | Browse `assets/` (upload, folders, rename, trash, zip download). Code folders are read-only | `fm_list/upload/mkdir/rename/delete/trash/restore/zip` |
| **Database** | Browse tables (secrets masked), CSV export; SQL export is Owner-only 🔒 | `dbx_tables/browse/row/export` |
| **System check** | PHP version, extensions, write permissions, DB, cron, mail checks | `admin-system.js` · `sys_check` |
| **AI agents (MCP)** | Tokens so external AI tools can read leads and quotes or create drafts | `phase8-lib.php` · `mcp_tokens`, `mcp_log`; `mcp.php` |

---

## 13. Public website
| Feature | What | Where / tech |
|---|---|---|
| Home page | Hero slider (mobile slider kept), services, projects, testimonials, contact | `index.html` |
| Service pages | Interior, renovation, fit-out, commercial, residential room pages, house-size pages (5/10 marla, 1/2 kanal) | `/interior-design/`, `/renovation/` … |
| City pages | 12+ cities for local SEO | `/lahore/`, `/karachi/` … |
| Projects / portfolio | Case studies | `/projects/` |
| Insights blog | Articles from the admin | `/insights/` |
| Estimator | Instant cost estimate → lead | `/estimator/` |
| Book a visit | Booking calendar | `/book-a-visit/` |
| Contact & forms | Turnstile + honeypot + rate limit → lead + alerts | `api/forms.php` |
| Chat / WhatsApp button | One button: Chat (AI + team) or WhatsApp | `assets/js/whatsapp-widget.js`, `api/chat.php` |
| Client quote link | Secure online quote view and accept | `api/quote-view.php` |
| Coming-soon / maintenance | Countdown page, noindex, 503 status | `coming-soon.html`, `503.html` |
| Error pages | 404 (logs missed URLs), 500 | `404.html`, `500.html`, `api/r404.php` |
| SEO | Sitemap, robots, schema, meta, canonical | `sitemap.xml`, `robots.txt` |
| Design | v26 look: navy/cream/wood, Plus Jakarta Sans, white/cream alternating sections | `assets/v1.css` |
| Speed | WebP, responsive sizes, lazy loading, local libraries | P15 |

---

## 14. Automations, cron & integrations
| Item | What | Tech |
|---|---|---|
| Cron job | Every 5–15 min: WhatsApp campaigns, auto flows, daily/weekly backups | `api/wa-cron.php?key=…` (cPanel cron) |
| Lead alerts | Email + WhatsApp to the team on each new lead (recipients per form) | `send_alerts()` in `crm-lib.php` |
| Client auto-reply | Thank-you message (capped) | `notify_client()` in `notify-lib.php` |
| WhatsApp Cloud API | Send, receive, templates, receipts | `whatsapp.php`, `p18g-lib.php` |
| Google | Sign-in, Analytics 4, Search Console | `phase8-lib.php`, `google-data-lib.php` |
| AI | Chat agent, blog writer, SEO suggestions, city text (OpenAI-compatible and local endpoints) | `content-lib.php`, `chat-lib.php` |
| MCP server | Tools for AI agents: list_leads, get_quote, create_quote_draft, monthly_report, … | `api/mcp.php` (Bearer token) |
| Cloudflare Turnstile | Spam check on forms | `forms.php` |

---

## 15. Security features
- Signed session tokens, revocable sessions, password version check, 2FA and recovery codes, login rate limit, login alerts.
- Role checks on every API action (sweep-tested). The Owner account is protected.
- Owner-only: backups, restore, SQL export, adding scripts or embeds to pages.
- Restores never write secrets, `.htaccess`, code or the users table.
- The WhatsApp webhook needs Meta's signature (fails closed). Quote links are signed.
- Uploads: type sniffing, random names, PHP disabled in upload folders.
- URL import: https only, public addresses only, each redirect re-checked.
- Spam: Turnstile, honeypot, per-IP limits, auto-reply caps, AI daily cap.
- Reports: `deploy/p19/security-audit/` (audit, fixes, final test). Test suite: `tools/sectest/`.

---

## 16. Developer reference
- **Stack:** Hostinger PHP 8 + MySQL, vanilla JS admin (TailAdmin-style), no build step.
- **Folders:** `frontend-v1/` (site root) · `admin/` (admin SPA) · `builder/` · `api/` · `_private/` (JSON config, never public) · `assets/`.
- **Admin API:** `POST /api/admin.php` `{action, …}` with header `X-WX-ADM: <token>`. Chain: p19c → p18j → sales17 → booking → crm → sales → content → media → security → gdata → dash → p8 → chat → notify → seo → redirects → p18e → p18g → p18h.
- **Builder API:** `POST /api/builder.php` with `X-WX-CSRF` (builder token) or `X-WX-ADM`.
- **Public endpoints:** `forms.php`, `chat.php` (`send`, `poll`, `typing`, `file`), `whatsapp.php`, `quote-view.php`, `r404.php`, `wa-cron.php`, `mcp.php`.
- **DB tables:** `wx_users`, `wx_leads`, `wx_lead_notes`, `wx_clients`, `wx_quotes`, `wx_invoices`, `wx_projects`, `wx_templates`, `wx_bookings`, `wx_chats`, `wx_chat_msgs`, `wx_activity`, `wx_notify_log`, `wx_settings`, `wx_throttle`, `wx_wa_seen`.
- **Admin JS globals:** `WXA` = api, bapi, modal, closeModal, toast, esc, ic, fillIcons, head, VIEWS, S, can, formDraft. NAV format `[view, label, icon, roles, pill, badge|"hide"]`.
- **UI kit:** `admin/master-components.html` + `MASTER-COMPONENTS.md`.
- **Deploy:** upload `deploy/p19/woodex-live-p19-full.zip` to `public_html` → Extract (Overwrite) → Ctrl+F5.
- **Local preview:** `node tools/frontend-v1-server.mjs` (port 8080); tests in `tools/phplint/` and `tools/sectest/`.
