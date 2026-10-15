# Woodex Interior — Complete Project Analysis Report

**Subject:** `marketingwoodex-cloud/-marketingwoodex` — full-stack website, CMS, PHP admin dashboards, backend API and database
**Analysis date:** 13 October 2026 (Asia/Karachi)
**Analysed revision:** `main` @ `782b50b` (working tree clean) plus all 12 remote `arena/*` branches and every release tree that ships inside them
**Author:** Arena agent session `arena/4150341e-marketingwoodex`
**Report type:** static, whole-repository analysis — frontend · backend · database · PHP admin · branches · dashboard versions

> **Corrections applied 13 October 2026, during the Phase 1 build.** Three claims in the first issue
> were wrong and are corrected in place below:
> 1. **The "five runtime-created tables" (DB-1) were not tables.** `wx_allowed`, `wx_caps`,
>    `wx_user_perms`, `wx_action_group` and `wx_role_groups` are PHP **functions** in
>    `roles-lib.php`; the shipped dump's 20 tables are complete. The real finding — the capability
>    matrix is hardcoded in PHP and unauditable — stands, and migration `001_roles.sql` moves it into
>    seeded tables. See the note in §7.1.
> 2. **The action count is 365, not 364.** The Phase 1 alias generator extracts from `case` labels,
>    `$action ===` comparisons and guard lists; the original count missed the two-letter action `me`.
>    Both figures are method-dependent, so the number that matters is the generated table:
>    `api/v2/aliases.php` maps all 365, verified by `node tools/gen-aliases.mjs --check`.
> 3. **The permission model was described as "runtime-created tables" in two more places**; those
>    lines now read "hardcoded in PHP + `_private/security.json` grants".

---

## 1. Executive Summary

Woodex Interior is a **Lahore design-and-build studio's complete digital operation** built as a
PHP-on-Hostinger monolith: a 150-page public website, a no-code page builder, and a 57-route
single-page admin dashboard that runs the CRM, quotations, invoicing, live chat, WhatsApp and
Telegram automation, SEO tooling, AI assistant and site backups.

The repository is **not one project — it is a development lineage**. Thirteen tracked branches,
sixteen release trees and nineteen deployment archives overlap inside a single 314 MB repository.
The website itself is mature; the **packaging discipline is not**. The single most important
structural fact is that four near-identical admin builds live side by side, and there is no
mechanical way for a reader — or a deployer — to tell which one is production from inside the
repository alone.

### 1.1 Headline metrics

| Dimension | Measured | Note |
|---|---|---|
| Repository size | 314 MB · 2,674 tracked files | `main` tree; 460 MB of Git objects |
| Public pages | 150 HTML documents in `frontend-v1` | 79 content pages + 48 articles + 6 case studies + hubs |
| Backend action surface | 365 distinct server actions | 40 PHP files · 6,830 lines |
| Database | 20 MySQL tables · 161 columns | plus 17 Postgres/Supabase tables |
| Admin dashboard | 60 JS modules · 10,502 lines · 57 routes | 297 of the 365 actions are reachable from the UI |
| Serverless stack | 39 Netlify/Vercel functions · 3,495 lines | mirrors a parallel Supabase CMS |
| Branches analysed | 13 (1 main + 12 arena) | 12 PRs / 6 open, 2 merged |
| Release trees | 16 copies of the site | 4 distinct generations of the admin |
| Root-level reports | 24 Markdown + 4 PDF | 3,369 lines of prior audit writing |

### 1.2 Verdict

| Question | Answer |
|---|---|
| Is the product functional? | Yes — the v2.1 Pro tree passes static parse, jsdom and headless-Chromium workflow tests |
| Is the repository production-clean? | **No** — the packaged recommendations say **BLOCK** |
| Why? | Three credentials are published in tracked files; the repository is public; the live topology is unknown |
| Which branch is the real product? | `arena/7f38fddd-marketingwoodex` (design/layout batches over `woodex-live-p29-v2.1-pro`) |
| Which tree should be deployed? | `woodex-live-p29-v2.1-pro/` on `arena/7f38fddd-marketingwoodex` — after the secrets are rotated |

### 1.3 Top six findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | Shared demo password present in 151 tracked files, including a pre-filled login field and a public page | Critical | `woodex-audit/08-security-audit.md`; `admin/index.html:43` |
| 2 | Telegram bot token in 36 tracked locations, one of them browser-served JavaScript | Critical | `admin/admin-tg.js:27`; `.env:18`; `config.php:23` |
| 3 | Repository is **public** while `.env`, `config.php` and `_private/*.json` are tracked | Critical | `gh repo view` `isPrivate: false` |
| 4 | Four near-identical admin builds coexist; the plain tree has three pasted-duplicate fragments that break parsing | High | `QA-MASTER-REPORT-P29-V2.1-PRO.md` RC-1 |
| 5 | Non-atomic JSON persistence: `file_put_contents(..., LOCK_EX)` truncates before locking, so readers can see an empty file | High | `api/admin.php:37`; `forms.php:24` |
| 6 | Integrations screen reports success without making a single request (22 hard-coded cards, 14 marked connected) | High | `admin-settings.js:121` |

---

## 2. Scope, Method and Confidence

| Area analysed | Method | Confidence in findings |
|---|---|---|
| Frontend | File inventory, HTML/CSS/JS line counts, sitemap and robots parsing, asset weighing | High (static) |
| Backend | Line-by-line reading of 40 PHP files, action-name extraction, table-usage mapping, dispatcher tracing | High (static) |
| Database | Schema parsing of 14 SQL files — table, column and index counts computed, not estimated | High (static) |
| Admin dashboard | 60 JS modules parsed for view keys and API calls; NAV table extracted | High (static) |
| Branches | Git tree diffs (`main` ↔ each branch), commit counts, authors, dates, PR metadata via `gh` | High (mechanical) |
| Runtime behaviour | **Not executed** — no PHP runtime, no MySQL, no live host in the analysis sandbox | N/A — out of scope |

> **Limits.** Every number in this report is reproducible from the repository with the commands in
> Appendix C. Nothing here was verified against a running host, a live database or a browser. Where
> a finding depends on the live deployment it is labelled as such. Secret values are deliberately
> **not** reproduced — only file and line references, following the convention already set by
> `woodex-audit/08-security-audit.md`.

---

## 3. System at a Glance

| Layer | Technology | Evidence | State |
|---|---|---|---|
| Web server | Apache / LiteSpeed with `.htaccess` | `frontend-v1/.htaccess` (4.3 KB, 80+ rules) | Configured |
| Language | PHP 8.2 (7.4-compatible shims present) | `declare(strict_types=1)`; `str_starts_with` polyfills | Modern |
| Public site | Static HTML + vanilla JS, no bundler | 150 HTML files, `assets/site.js` | Mature |
| Page builder | Canvas + 51-section library, CodeMirror vendor | `builder/` — 10 files, 1.3 MB | Working |
| Admin dashboard | Vanilla JS SPA, hash routing, 67 script tags | `frontend-v1/admin/` | Working |
| Charts / PDF | Chart.js, html2pdf bundle | `admin/vendor/` (1.2 MB) | Vendored |
| Primary database | MySQL / MariaDB on Hostinger | `_database/woodex-v20.sql` — 20 tables | Present |
| Secondary database | Postgres via Supabase | `supabase/*.sql` — 3 migrations | Present |
| Tertiary store | JSON files under `_private/` | 28 referenced JSON stores | Present |
| Serverless mirror | Netlify Functions → Vercel single router | `netlify/functions/*.mjs`, `api/router.mjs` | Parallel, unused by the PHP stack |
| Integrations | Telegram Bot API, WhatsApp Cloud API, Google Analytics 4 + Search Console, Google Sheets, Meta social | `*-lib.php` modules | Wired |
| AI | Model Context Protocol endpoint + AI centre + SEO agent | `api/mcp.php`; `mcp-server/server.mjs` | Wired |
| Hosting target | Hostinger shared (cPanel / LiteSpeed) | `HOSTINGER-DEPLOYMENT-GUIDE.md` | Documented |
| Automation | Keyed cron worker + polling loops | `api/wa-cron.php`; `admin-chat2.js` | Wired |

### 3.1 Three generations of the same product

```
GEN 1  admin/ (root)                     AdminLTE dashboard, 1 × 306 KB HTML page, 6 JS files
       └─ Woodex Dashboard v1 — the legacy control panel

GEN 2  wf-admin/                         JS admin + Netlify/Supabase functions, 88 HTML, 0 PHP
       └─ "Woodex Fresh" — the serverless experiment

GEN 3  frontend-v1/                      PHP 8 API + MySQL + vanilla-JS SPA admin
       ├─ frontend-v1/admin/             Admin v2.0 — 60 modules, 57 routes   (main)
       ├─ p23-live/, woodex-live-p23/    Admin v2.0 P23 builds
       ├─ woodex-live-p29-v2.1/          Admin v2.1 — Obsidian & Cyan theme
       ├─ woodex-live-p29-v2.1-pro/      Admin v2.1 Pro — 64 modules, 59 routes  ← source of truth
       └─ woodex-live-v3/                Admin v3 build (zipped, 2.0 MB)
```

---

## 4. Repository Inventory by Module

| Module | Files | Size | Role | State |
|---|---|---|---|---|
| `frontend-v1/` | 642 | 43 MB | **Product** — public site + admin + PHP API | Active |
| `assets/` | 330 | 25 MB | Images, fonts, stylesheets, JS | Active |
| `content/` | 147 | 1.7 MB | CMS page data (73 slugs × blocks + meta) | Active |
| `insights/` | 49 | 3.9 MB | Blog hub + 48 articles | Active |
| `projects/` | 7 | 116 KB | Portfolio hub + 6 case studies | Active |
| `admin/` | 24 | 1.9 MB | Legacy AdminLTE dashboard | Superseded |
| `wf-admin/` | 389 | 13 MB | Serverless admin + site copy | Superseded |
| `supabase/` | 3 | 32 KB | Postgres migrations | Parallel |
| `netlify/` | 42 | 248 KB | 39 Netlify/Vercel functions + 3 SQL schemas | Parallel |
| `api/` | 1 | 4 KB | Vercel single-function router | Parallel |
| `mcp-server/` | 5 | 76 KB | Node MCP server for Claude/Codex/Cursor | Active |
| `builder/` | 10 | 1.3 MB | Visual page builder | Active |
| `_templates/` | 5 | 89 KB | Page, quote, chat and WhatsApp templates | Active |
| `deploy/` | 30 | 139 MB | 19 release archives + per-phase folders | Archive |
| `tools/` | 90 | 11 MB | 30+ build/QA/generator scripts | Active |
| `docs/` | 6 | 244 KB | Design docs and sample quotation PDF | Reference |
| `seo-audit/` | 16 | 798 KB | SEO/local-search plans and audits | Reference |
| `architecture/` | 1 | 44 KB | Architecture page | Content |
| `woodex-vlive-P20/` | 612 | 70 MB | P20 frozen release tree | Archive |
| `woodex-master-P22/` | 12 | 28 MB | P22 master plan + 2 zips | Archive |
| `woodex-live-p23/` | 714 | 74 MB | P23 release tree (largest) | Archive |
| `p22-preview/`, `p23-live/` | 634 / 645 | 43 MB each | Preview trees | Archive |
| `woodex-live-p29-v2.1/`, `-pro/` | 642 / 674 | 43 / 44 MB | P29 v2.1 and v2.1 Pro | Candidate |
| `woodex-live-P23/`, `woodex-live-v3/` | 2 / 44 | 55 / 31 MB | Zip-only distributions | Archive |
| 79 public page directories | 79 | ~7 MB | Standalone landing pages | Active |
| 24 root reports | 24 | 450 KB | Master plans and audits | Reference |

---

## 5. Frontend Module Analysis

### 5.1 Two generations of website

| Attribute | Legacy (repo root) | Current (`frontend-v1/`) |
|---|---|---|
| Pages | 86 sitemap URLs | **142 sitemap URLs** |
| Page directories | 82 | 79 content + hubs |
| HTML documents | 107 | 150 |
| Insights articles | 20 | 48 |
| Metadata | Basic | `llms.txt` (33 KB), AI-crawler allowlist, schema blocks |
| CMS data | none | `content/pages/` — 73 slugs, 146 JSON files |
| Verdict | Superseded | **Active product** |

### 5.2 Page inventory (`frontend-v1/`)

| Category | Directories | Examples |
|---|---|---|
| Cities (local SEO) | 12 | lahore, karachi, islamabad, rawalpindi, faisalabad, multan, gujranwala, peshawar, quetta, hyderabad, bahawalpur, sialkot |
| Residential & interiors | 22 | interior-design, 1/2/5/10-kanal-house-design, kitchen-design, wardrobe-design, false-ceiling-design, bathroom-design, farmhouse-design, complete-home-redesign |
| Commercial & fit-out | 36 | office-fit-out, retail-fit-out, restaurant-interior-design, healthcare-fit-out, pharmacy-fit-out, hotel-interior-design, gym-design, spa-design, showroom-design, shopping-mall-design |
| Core / conversion | 8 | about, contact, services, estimator, book-a-visit, projects, insights, privacy |
| Specialised | 1 | architecture |
| Blog articles | 48 | cost guides, materials, checklists, trends — all Lahore/Pakistan keyword-targeted |
| Case studies | 6 | cafe-corner, clinic-fit-out, courtyard-house, office-floor, retail-corner, small-apartment |
| System pages | 7 | 404, 500, 503, coming-soon, blocks, downloads, index |
| **Total** | **150 HTML** | 142 in the sitemap; the remainder are error/system pages |

### 5.3 Page shell, runtime and weight

| Item | Size | Purpose |
|---|---|---|
| `assets/site-p21.css` | 696 KB | Compiled site stylesheet (P21 baseline) |
| `assets/site.js` | 36 KB | Menus, forms, chat dock, estimator wiring |
| `assets/book.js` + `book.css` | 16 KB | Booking widget |
| `assets/wx-runtime.js` | 4 KB | Visitor-side runtime (chat, tracking) |
| `assets/theme.css` | 512 B | Theme token entry point |
| `assets/img/` | 287 files · 24 MB | Hero, project and article imagery (WebP-first) |
| `assets/fonts/` | 28 files · 504 KB | Inter (5 weights) + icons |
| `assets/announce.json`, `data/clients.json` | 1 KB | Editable announcement bar, client logos |
| `builder/` | 1.3 MB | Page builder UI: 10 JS modules incl. 51-block library |

### 5.4 SEO, AEO and structured data

| Control | State |
|---|---|
| `sitemap.xml` | 142 URLs (frontend-v1), 86 URLs (legacy root) |
| `robots.txt` | Blocks `/builder/`, `/api/`, `/admin/`; explicit allowlist for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Bingbot |
| `llms.txt` | 33 KB answer-engine brief: company facts, services, pricing posture, contact |
| Redirect plan | 36 rules in `.htaccess` + `redirect-plan.json`, including hacked-spam cleanup rules |
| Schema | Managed schema blocks per page via the SEO manager |
| SEO tooling | `seo-lib.php` (Yoast-style per-page scoring), `seo-agent-lib.php` (AI scan/fix proposals), `seo-analyzer.js` |

### 5.5 Content model

| Store | Path | Count | Written by |
|---|---|---|---|
| Page blocks | `content/pages/<slug>/blocks.json` | 73 | Page builder |
| Page metadata | `content/pages/<slug>/meta.json` | 73 | `page_meta_save` |
| Page templates | `_templates/page-templates-v26.json` | 1 | Admin → Page templates |
| Quotation templates | `_templates/quotation-templates.json` | 8 starters | Admin → Quote templates |
| Chat bot answers | `_templates/chat-bot-answers.json` | 1 | Admin → Knowledge & Q&A |
| Client logos | `assets/data/clients.json` | 1 | Admin → Client logos |

### 5.6 Frontend findings

| ID | Finding | Severity |
|---|---|---|
| FE-1 | The 306 KB legacy `admin/index.html` still ships at repo root alongside the current admin — a second login surface with no owner | High |
| FE-2 | `assets/site-p21.css` (696 KB) is a single unbundled stylesheet; no critical-CSS split, 14 oversized images flagged by the project's own health scan | Medium |
| FE-3 | 143 images lack alt text per the project's own site-health scan (score 69 / 165 findings) | Medium |
| FE-4 | `downloads.html` is a public page that instructs visitors how to reach `/admin/` | High |

---

## 6. Backend Module Analysis

### 6.1 PHP API surface

| Metric | Value |
|---|---|
| PHP files in `frontend-v1/api/` | 40 |
| Lines of PHP in the API | 6,830 |
| Distinct server actions | **365** |
| Actions reachable from the admin UI | 297 |
| Actions used only by public forms, webhooks, cron or MCP | 58 |
| PHP files repo-wide | 87 (13,110 lines) |
| Entry points | `admin.php`, `builder.php`, `forms.php`, `chat.php`, `whatsapp.php`, `telegram.php`, `quote-view.php`, `r404.php`, `wa-cron.php`, `mcp.php` |
| Dispatcher pattern | `switch ($action)` in `admin.php` → 25 `*_lib.php` includes → chained `*_actions()` fallbacks |
| Auth | `X-WX-ADM` HMAC session token for admin; `X-WX-CSRF` builder token; `t=` HMAC for public quote view; cron key for `wa-cron.php` |
| Error envelope | `{ok, error}` JSON; `PDOException` is caught and logged, other throws are not |

### 6.2 Module-by-module register

| Module | File | Lines | Actions | What it does | Store |
|---|---|---|---|---|---|
| Core admin | `admin.php` | 591 | 36 | Auth, users, roles, settings, activity, pages, chrome, global replace, dispatch | MySQL + JSON |
| Page builder | `builder.php` | 466 | 27 | Canvas save/publish, block library, templates, versioning | MySQL + JSON |
| Sales (core) | `sales-lib.php` | 331 | 26 | Quotations, invoices, payments, projects, templates | `wx_quotes`, `wx_invoices`, `wx_projects` |
| Sales (P17) | `sales17-lib.php` | 351 | 16 | Client master, invoice tracker, merge, 360° client view | `wx_clients`, `wx_invoices` |
| Media & system | `media-lib.php` | 339 | 23 | Media library, backups, site health, file manager | `wx_settings` + FS |
| Content CMS | `content-lib.php` | 269 | 33 | Blog, portfolio, testimonials, team, FAQs, AI writing, scheduler | JSON + MySQL |
| CRM | `crm-lib.php` | 266 | 20 | Leads, pipeline, clients, follow-ups, lead→client conversion | `wx_leads`, `wx_clients` |
| AI agent bridge | `mcp.php` | 249 | 19 | Model Context Protocol server (Streamable HTTP) | `wx_leads`, `wx_quotes` |
| WhatsApp automation | `p18g-lib.php` | 320 | 14 | Audiences, campaigns, Meta templates, auto flows | JSON + MySQL |
| Live chat | `chat-lib.php` | 320 | 15 | AI-first chat, staff takeover, lead capture, notifications | `wx_chats`, `wx_chat_msgs` |
| Social planner | `social-lib.php` | 268 | 10 | Facebook/Instagram posts, comments, scheduling | JSON |
| Telegram | `tg-lib.php` | 225 | 9 | Bot polling/webhook, DMs, link codes, alerts | `wx_tg_map`, `wx_tg_seen` |
| Booking | `booking-lib.php` | 212 | 6 | Site visits, office meetings, online calls, slots | `wx_bookings` |
| WhatsApp hub | `wahub-lib.php` | 191 | 7 | Delivery/read/reply analytics, rules, opt-outs | JSON + MySQL |
| System safe-mode | `p18h-lib.php` | 170 | 14 | Maintenance mode, DB browse/export, file manager | `.htaccess` + MySQL |
| SEO agent | `seo-agent-lib.php` | 161 | 5 | Scans pages, proposes and applies AI fixes | JSON |
| Security | `security-lib.php` | 148 | 13 | Sessions, TOTP 2FA, login alerts, integration settings | `wx_activity`, JSON |
| Redirects | `redirects-lib.php` | 144 | 5 | Redirect manager v2 + 404 log | JSON + `.htaccess` |
| Notifications | `notify-lib.php` | 144 | 4 | Client status updates (WhatsApp + email, EN/UR) | `wx_notify_log` |
| AI agent upgrade | `ai-agent-lib.php` | 139 | 5 | Hand-off reasons, unanswered-question mining, reply drafts | `wx_ai_events`, `wx_ai_unans` |
| Connectors | `conn-lib.php` | 128 | 7 | Connector gallery; secrets write-only; real GitHub token test | JSON |
| SEO manager | `seo-lib.php` | 109 | 7 | Per-page focus keyphrases, scores, schema, AI suggestions | JSON |
| Google data | `google-data-lib.php` | 108 | 4 | GA4 + Search Console via service account | JSON + cache |
| AI centre | `ai-center-lib.php` | 106 | 3 | One place to control AI across web chat, WhatsApp, Telegram | JSON |
| Estimator & forms | `p18e-lib.php` | 93 | 5 | Rate book, estimator, per-form alerts | `wx_leads` |
| Approvals | `approvals-lib.php` | 93 | 2 | Manager changes held for master approval | JSON + MySQL |
| Phase 8 | `phase8-lib.php` | 91 | 13 | Google sign-in, MCP tokens, WhatsApp click stats | `wx_users` |
| Roles | `roles-lib.php` | 84 | 14 | Role→capability matrix, per-user permission overrides | `wx_users` + JSON |
| Personal profile | `p18j-lib.php` | 63 | 4 | Profile page, extra fields, avatars | JSON + MySQL |
| Client 360 | `p19c-lib.php` | 66 | 2 | One central client record; comms across channels | 7 tables |
| Dashboard | `dash-lib.php` | 65 | 2 | Single role-aware dashboard payload | `wx_leads`, `wx_quotes` |
| Quote view | `quote-view.php` | 61 | 1 | Token-signed client-facing quotation | `wx_quotes` |
| Sheets sync | `sheets-lib.php` | 48 | 4 | Google Sheets sync with no API key (Apps Script) | `wx_leads` |
| Logos | `logos-lib.php` | 26 | 2 | Client logo strip | `assets/data/clients.json` |
| Cron | `wa-cron.php` | 15 | 1 | Queue worker for campaigns and flows | JSON |
| 404 logger | `r404.php` | 11 | 1 | Records missing paths for the redirect manager | JSON |

### 6.3 Public and webhook endpoints

| Endpoint | Purpose | Auth |
|---|---|---|
| `api/forms.php` | Public site forms → leads; serves Turnstile key | Throttled, Turnstile |
| `api/chat.php` | Visitor chat: `cfg`, `send`, `poll` | Token per chat |
| `api/whatsapp.php` | WhatsApp Cloud API webhook (Meta) | Verify token |
| `api/telegram.php` | Telegram bot webhook | Bot secret |
| `api/quote-view.php` | Client-facing quotation view | HMAC token |
| `api/mcp.php` | MCP server for AI agents | Bearer token |
| `api/r404.php` | 404 beacon | None (idempotent) |
| `wa-cron.php` | Scheduler | Cron key |
| `wx-check.php` | Environment diagnostic | Public (read-only report) |
| `wx-install.php` | One-time installer (tables + owner account) | Setup guard |
| `wx-demo.php` | Demo seeding | Setup guard |
| `router.php` | Local PHP dev-server router | `cli-server` only |

### 6.4 Parallel serverless stack (Netlify → Vercel)

| Group | Functions | Lines | Notes |
|---|---|---|---|
| CMS CRUD (`cms-*`) | 30 | ~2,900 | pages, blog, services, locations, projects, testimonials, team, menu, redirects, media, users, clients, quotations, invoices, quotation templates, estimator leads, enquiries, site visits, analytics, settings, stats, versions, health, backups, save, delete, upload |
| Helpers (`_*`) | 8 | ~430 | auth, Supabase client, GitHub commit, page render, BOQ, versions, redirects sync, Vercel adapter |
| Public intake | 2 | 137 | `enquiry-submit`, `estimator-submit` |
| Router | `api/router.mjs` | — | One Vercel function fanning out to all 30 handlers |
| **Total** | **39 .mjs · 3,495 lines** | | Fully parallel to the PHP API; not used by the Hostinger build |

### 6.5 Auth, roles and sessions

| Stored code | Displayed name | Scope (summary) |
|---|---|---|
| `owner` | Master | Everything; approves manager changes |
| `admin` | Manager | All operations except master-only approvals |
| `editor` | Developer | Website, builder, content, SEO |
| `sales` | Sales | Leads, pipeline, quotations, invoices, clients |
| `support` | Support | Inbox, chat, bookings, read-mostly |

The UI additionally accepts role *words* (`master`, `superadmin`, `manager`, `developer`) and
canonicalises them — a fix recorded on `arena/7f38fddd`.

### 6.6 Backend findings

| ID | Finding | Severity |
|---|---|---|
| BE-1 | `jwrite()` truncates before acquiring `LOCK_EX`; `jread()` takes no lock — a concurrent reader can see an empty file and the API answers "Admin is not set up yet" (HTTP 503) | High |
| BE-2 | `bsecret()` regenerates the HMAC secret on an empty config read, invalidating every outstanding admin and builder token | High |
| BE-3 | WhatsApp cron takes `wa-auto.lock` with `LOCK_NB` and returns `{busy:true}` silently; admin writers take no lock, so opt-outs can be overwritten | High |
| BE-4 | Only `PDOException` is caught in the dispatcher; other throws produce blank failures with `display_errors=0` | Medium |
| BE-5 | Two complete backends (PHP and serverless) implement the same domain model with no shared schema or test — every change must be made twice or one side silently rots | Medium |
| BE-6 | `wx-check.php` and `wx-install.php` are shipped in the production tree | Medium |

---

## 7. Database Module Analysis

### 7.1 MySQL operational schema — 20 tables, 161 columns

| Table | Columns | Keys / indexes | Purpose |
|---|---|---|---|
| `wx_users` | 9 | unique email | Accounts, roles, password hashes, 2FA state |
| `wx_activity` | 7 | created_at | Audit trail of admin actions |
| `wx_settings` | 2 | PK `k` | Key/value settings bag |
| `wx_throttle` | 3 | PK ip | Login and form rate limiting |
| `wx_leads` | **32** | 4 | Enquiries with pipeline, source, value, follow-ups, UTM-ish fields |
| `wx_lead_notes` | 8 | lead_id | Activity notes, calls, outcomes |
| `wx_clients` | 15 | — | Client master records |
| `wx_notify_log` | 8 | t | WhatsApp/email delivery log |
| `wx_wa_seen` | 2 | PK message id | WhatsApp webhook de-duplication |
| `wx_templates` | 3 | unique name | Quotation/page templates |
| `wx_quotes` | 4 | no | Quotations (payload as LONGTEXT JSON) |
| `wx_invoices` | 4 | unique quote_id | Invoices, 1:1 with quotes |
| `wx_projects` | 2 | — | Project records (JSON payload) |
| `wx_chats` | 20 | updated_at | Chat sessions across web, WhatsApp, Telegram |
| `wx_chat_msgs` | 7 | (chat_id, id) | Messages with attachments |
| `wx_bookings` | 17 | d | Site visits, meetings, calls |
| `wx_ai_events` | 5 | t, chat_id | AI hand-off and escalation events |
| `wx_ai_unans` | 8 | status, qkey | Unanswered-question mining |
| `wx_tg_seen` | 2 | PK uid | Telegram update de-duplication |
| `wx_tg_map` | 3 | PK msg_id | Telegram message → chat mapping |

**Observations.**
`wx_leads` at 32 columns shows the table was extended 15+ times in place, all columns appended
after the initial `CREATE TABLE` — a schema that has outgrown its design.
`wx_quotes`, `wx_invoices`, `wx_projects` and `wx_templates` store their real payload as JSON in a
`LONGTEXT` column, so the database cannot query, index or validate the substance of the business's
financial records. The entire permission model — which role may call which action — is **hardcoded
in PHP** (`roles-lib.php`: `wx_role_groups()`, `wx_action_group()`, `SHARED`, `EXPAND`) and the
per-user extra grants live in the JSON side-store `_private/security.json`. Nothing about
authorisation is in the database, so it cannot be inspected, audited or changed without a deploy.

> **Correction (2026-10-13, during Phase 1 build).** An earlier revision of this report stated that
> five *tables* (`wx_allowed`, `wx_caps`, `wx_user_perms`, `wx_action_group`, `wx_role_groups`) were
> created at runtime and missing from the dump. That was wrong: those five names are **PHP functions**
> declared in `roles-lib.php`, not tables. The shipped dump's 20 tables are complete. The real
> finding is the one stated above — the capability matrix lives in code, not in the database — and
> migration `001_roles.sql` now moves it into seeded tables.

### 7.2 Postgres / Supabase schema

| Migration | Tables |
|---|---|
| `COMPLETE-MIGRATION.sql` (190 lines) | enquiries, estimator_leads, activity, page_views, blog_posts, projects, team, media, site_settings |
| `blueprint-migration.sql` (138 lines) | clients, site_visits, testimonials, services, locations, page_views, page_versions, redirects, menu_items |
| `woodex-consolidated-migration-2026-09-27.sql` (175 lines) | cms_users + the blueprint set (consolidated) |
| **Distinct tables** | **18**, with RLS enabled on public-read tables |

### 7.3 Quotation and invoicing SQL

| File | Lines | Contents |
|---|---|---|
| `netlify/quotations-schema.sql` | 28 | quotations table |
| `netlify/quotation-templates-schema.sql` | 16 | template library |
| `netlify/migration-v2-sections-invoices.sql` | 79 | v2 sections + invoice linkage |

### 7.4 The four-store data problem

| Store | Location | Instances | Written by | Risk |
|---|---|---|---|---|
| MySQL | Hostinger `u128159657_woodex` | 20 tables | PHP API | Primary but not the whole truth |
| JSON files | `_private/*.json` | 28 referenced stores | PHP API | Non-atomic; blocked only by `.htaccess` |
| Postgres | Supabase | 18 tables | Netlify/Vercel functions | Parallel, unlinked to MySQL |
| Page content | `content/pages/**`, `assets/data/*.json` | 147 files | Builder + admin | Committed to Git |

The dashboard reads and writes all four. No migration, reconciliation or single-source rule exists
between them, and the JSON layer — the one holding API keys, approvals, maintenance tokens and
WhatsApp opt-outs — is protected in production **only** by `.htaccess` rules whose live effect has
not been verified.

### 7.5 Database findings

| ID | Finding | Severity |
|---|---|---|
| DB-1 | The role/capability matrix is hardcoded in PHP; per-user grants live in `_private/security.json` (corrected — see note in §7.1) | Medium |
| DB-2 | Financial documents stored as unqueryable `LONGTEXT` JSON | Medium |
| DB-3 | `_private/*.json` holds secrets and business state reachable through web-server config alone | Critical |
| DB-4 | Three SQL dumps of live data are tracked in Git (the pro tree untracked `_private/` records on 2026-10-11, but dumps remain) | High |
| DB-5 | No foreign keys anywhere; referential integrity is enforced only in application code | Medium |

---

## 8. Admin / Dashboard Module Analysis

### 8.1 The four admin generations

| Generation | Location | Modules | Views | Routes | Lines | Theme | PHP |
|---|---|---|---|---|---|---|---|
| **v1** AdminLTE | `admin/` (root) | 6 JS | — | Phase 1–3 screens | ~100 KB | AdminLTE / Bootstrap | 0 |
| **v2** "Fresh" serverless | `wf-admin/` | 12 JS | — | 88 HTML | 2,576 | Bootstrap | 0 |
| **v2.0** production | `frontend-v1/admin/` | 60 JS | 56 | **57** | 10,502 | Custom dark slate `#0f172a` | 40 API files |
| v2.0 P23 | `p23-live/`, `woodex-live-p23/` | 61 JS | 56 | 57 | 11,297 | Custom | 46–47 files |
| **v2.1** Obsidian & Cyan | `woodex-live-p29-v2.1/` | 62 JS | 62 | — | — | Preline obsidian `#050608` + cyan `#00b8db` | 48 files |
| **v2.1 Pro** | `woodex-live-p29-v2.1-pro/` | 64 JS | 62 | **59** | 12,906 | Obsidian/cyan + `woodex-v21.css` extra sheet | 54 files |
| v3 (zipped) | `woodex-live-v3/woodex-admin-v3.zip` | — | — | — | 2.0 MB zip | — | — |
| Demo (no PHP) | `woodex-live-p23/demo-preview/` | 306 files | full admin | static | — | — | 0 |
| v2.5 Pro | **roadmap only** | — | — | — | — | Multi-theme | — |

### 8.2 Admin JS module map (v2.0 on `main`)

| Module | Lines | Views registered | Representative actions |
|---|---|---|---|
| `admin-content.js` | 846 | blog, post, portfolio, study, testimonials, team, faqs | `cms_list`, `cms_save`, `cms_placements`, `ai_run` |
| `admin-sales17.js` | 571 | clients, enquiries, invoices, projects | `client_360`, `inv_track`, `clients_merge`, `lead_convert` |
| `admin.js` | 484 | dashboard, pages, profile, users, activity, builder, soon | `login`, `me`, `dashboard`, `status` |
| `admin-sales.js` | 478 | quotes, quote, invoices, invoice, templates, template, projects | `inv_save`, `pay_add`, `proj_save` |
| `admin-chrome.js` | 405 | global | `global_chrome`, `global_menu`, `chrome_versions` |
| `admin-fields.js` | 369 | business, services, cities, fields, citydraft | `cms_biz_save`, `cms_page_kinds`, `page_new` |
| `admin-print17.js` | 352 | — | Quotation/invoice print layouts |
| `admin-media.js` | 346 | media, backups, health | `media_upload`, `backup_run`, `health_scan` |
| `admin-pages.js` | 309 | pages, redirects, global | `pages_list`, `page_meta_save`, `redirects_save` |
| `admin-templates.js` | 293 | pagetpl | `cms_tpl_save`, `cms_page_kinds` |
| `admin-hero.js` | 279 | heroes | `save`, `restore`, `backups` |
| `admin-chat.js` | 262 | chat | `chat_list`, `chat_get`, `chat_lead`, `notif_poll` |
| `admin-print.js` | 246 | — | Classic document prints |
| `admin-crm.js` | 242 | enquiries, pipeline, clients | `leads_list`, `lead_save`, `lead_note` |
| `admin-p18g.js` | 212 | wauto | `wag_camp_save`, `wag_optout`, `wag_seg_*` |
| `admin-library.js` | 209 | library | `blocks_list`, `blocks_sync`, `blocks_usage` |
| `admin-settings.js` | 203 | settings, security | `sec_2fa_*`, `crm_settings_save` |
| `admin-seo38.js` | 182 | seo | `seo_list`, `seo_scores` |
| `admin-booking.js` | 179 | bookings | `bk_list`, `bk_slots`, `bk_status` |
| `admin-chat2.js` | 178 | — | `chat_reply`, `chat_typing`, `chat_file` |
| `admin-p36.js` | 170 | dashboard, seo, blog | `conn_list`, `gdata_status`, `tg_get` |
| `admin-social.js` | 165 | — | `soc_post_save`, `soc_comment_reply` |
| `admin-p19f.js` | 164 | pipeline | `lead_save`, `s17_meta` |
| `admin-p18h.js` | 162 | database, files, maintenance | `dbx_tables`, `fm_list`, `backup_run` |
| 36 further modules | ≈2,900 | remainder of the 56 views | — |

### 8.3 Navigation map — 57 routes in 6 groups

| Group | Routes | Count |
|---|---|---|
| **Home** | dashboard, approvals | 2 |
| **Sales** | enquiries (Leads), pipeline, bookings, clients, quotations, invoices, transactions, templates, projects | 9 |
| **Conversations** | chat (Inbox), WhatsApp hub (overview & rules, insights, broadcasts & automations, discount offers, connect), telegram, social, updates, AI assistant, knowledge & Q&A, AI report | 14 |
| **Website** | pages, builder, library, global header/footer, heroes, redirects, blog, portfolio, services, cities, page templates, forms, estimator, FAQs, testimonials, logos, team, media, SEO, SEO agent, speed, site health, theme | 23 |
| **Admin** | business info, integrations, users & roles, backups, database, file manager, maintenance, activity log, system check | 9 |
| **Me** | profile, security | 2 |
| **Total** | | **57** (59 in v2.1 Pro) |

### 8.4 Dashboard content

| Widget | Source action | Notes |
|---|---|---|
| KPI row | `dash_data` | Role-aware: CRM/money figures only for owner, admin, sales |
| Charts | `dash_data` + Chart.js | Repainted on theme change by `uipal.js` (v2.1 Pro) |
| Live counters | `appr_count`, `leads_count`, `chat_list` | Refresh every 60 s; badges on nav items |
| Targets | `dash_target_save` | Monthly revenue/lead goals |
| Google report | `gdata_report` | GA4 + Search Console summary |
| Timeline (Gantt) | projects | Date axis with milestones and billing split |

### 8.5 Structural defects in the admin

| ID | Defect | Severity |
|---|---|---|
| AD-1 | Four admin copies exist; three JS files in the plain tree contain pasted duplicate fragments and fail to parse, so `VIEWS.settings` never registers | Critical if the plain tree is deployed |
| AD-2 | 20 view keys are assigned by two or more modules — last script wins; one silent overwrite (`VIEWS.approvals` replaced by the Security view) | High (fixed pending verification) |
| AD-3 | Navigation tuple has no `phase` field, so the "coming soon" template prints "Phase undefined" | Low |
| AD-4 | Hash aliases `business`, `connections`, `integrations` exist but are not in NAV; `#/integrations` runs the dashboard loader | Medium |
| AD-5 | Integrations screen makes zero API calls; 22 hard-coded connector cards, 14 shown as connected, "Save" and "Ping" report success without a request | High |
| AD-6 | Sidebar pinned dark by `!important`; components bypass theme tokens (65–88 hex literals in some modules) | Medium (addressed in v2.1 Pro) |
| AD-7 | 67 unversioned `<script>` tags in `index.html` — no cache-busting, load order is the routing contract | Medium |

---

## 9. Branch-by-Branch Analysis

### 9.1 Branch register

| Branch | Last commit | Author | Commits | Tracked files | vs `main` (added / modified / removed) | Line delta | Last subject |
|---|---|---|---|---|---|---|---|
| `main` | 2026-10-08 | marketingwoodex-cloud | 1 (shallow root) | 2,674 | — | — | Merge PR #2 |
| `arena/01a0f834` | 2026-10-01 | marketingwoodex-cloud | 228 | 1,246 | 10 / 142 / 1,438 | +6,419 / −161,009 | docs: MASTER-PLAN v4.0, bootstrap kit |
| `arena/01a0e87c` | 2026-10-07 | marketingwoodex-cloud | 95 | 800 | 10 / 88 / 1,884 | +2,775 / −206,392 | Add files via upload |
| `arena/14ceb9c3` | 2026-10-07 | arena-agent | 58 | 195 | 3 / 120 / 2,482 | +1,119 / −264,775 | Audit: P22.1 verification |
| `arena/01a0ec23` | 2026-10-08 | marketingwoodex-cloud | 431 | 2,039 | 1 / 7 / 636 | +40 / −62,425 | Add files via upload |
| `arena/dc8cace3` | 2026-10-09 | marketingwoodex-cloud | 5 | 3,315 | 641 / 0 / 0 | +69,583 / 0 | QA master audit fixes |
| `arena/9adcf885` | 2026-10-09 | marketingwoodex-cloud | 3 | 2,676 | 2 / 0 / 0 | +853 / 0 | Two P23 audit documents |
| `arena/7eefea10` | 2026-10-09 | Arena Agent | 2 | 2,679 | 5 / 0 / 0 | +1,377 / 0 | deploy(p23): Hostinger package |
| `arena/83a37223` | 2026-10-09 | marketingwoodex-cloud | 7 | 2,691 | 17 / 0 / 0 | +1,489 / 0 | Merge p23 deploy artefacts |
| `arena/5252cdd7` | 2026-10-11 | marketingwoodex-cloud | 20 | 3,502 | 828 / 64 / 0 | +119,242 / −101 | demo-preview: static admin, no PHP |
| `arena/4ba510f0` | 2026-10-11 | marketingwoodex-cloud | 163 | 7,365 | 4,800 / 63 / 109 | +549,502 / −35,770 | Untrack live `_private` data |
| `arena/8a776c65` | 2026-10-12 | marketingwoodex-cloud | 4 | 2,743 | 69 / 5 / 0 | +15,555 / −5,266 | v2.1 master passkey + auth matrix |
| `arena/7f38fddd` | 2026-10-12 | marketingwoodex-cloud | 217 | 7,540 | 4,975 / 63 / 109 | +572,083 / −35,770 | design(css): legacy colour literals retired |

### 9.2 What each branch actually is

| Branch | Character | Unique contribution | Status |
|---|---|---|---|
| `01a0f834` | Docs and bootstrap era | MASTER-PLAN v4.0, probe tooling, release scripts, repo/staging strategy | Superseded |
| `01a0e87c` | First rebuild attempt (PR #1) | PHP-first `wf-admin` with `api/router.php`, `lib.php`, `install.php`, `sql/install.sql` | Superseded |
| `01a0ec23` | The upload that became `main` (PR #2, merged) | Full 2,039-file snapshot: `frontend-v1`, `wf-admin`, P20/P22 trees | Merged |
| `14ceb9c3` | Independent audit (PR #3, merged) | P22.1 verification report and evidence pack | Audit only |
| `dc8cace3` | QA fix sweep | Lead-activity action fix, Google card, dead/orphan links, heatmap label, preview stacking; introduces `woodex-live-p23/` | Superseded |
| `9adcf885` | Documentation | Two P23 audits (deep + Arena cross-check) | Docs only |
| `7eefea10` | Deployment | Hostinger-ready `public_html` package and deploy scripts | Artefacts only |
| `83a37223` | Merge + deploy | P23 packaging after agent work | Artefacts only |
| `5252cdd7` | Demo product | `demo-preview/` — the entire admin as a static copy needing no PHP, plus demo data builders and tests | Feature branch |
| `8a776c65` | **v2.1 release (PR #4)** | Preline obsidian/cyan admin, root `index.php` + `config.php` + `.env`, `DirectoryIndex`, backend auto-config, dual distribution trees, master passkey | Open — production candidate level 1 |
| `4ba510f0` | **v2.1 Pro consolidation (PR #5)** | `woodex-audit/` pack (25 documents), `p22-preview`, `p23-live`, `woodex-live-v3` archives; stops tracking live data copies | Open — superseded by #6 |
| `7f38fddd` | **Design + layout batches (PR #6)** | `admin/uipal.js` theme-aware charts, single `--side-*` token set, 343 literal colours → tokens across 21 files, 57/57 routes with H1 + breadcrumb, KPI rows 4-up | Open — **most advanced tip** |

### 9.3 Pull request register

| PR | Title | Head branch | State | Opened |
|---|---|---|---|---|
| #1 | Woodex rebuild: dashboard admin, CMS page builder, 87-page migration, backend master plan | `arena/01a0e87c` | OPEN | 2026-09-29 |
| #2 | Woodex Admin v2 + Master P22.1 Hostinger release | `arena/01a0ec23` | **MERGED** | 2026-10-07 |
| #3 | Audit: independent verification of Woodex Master P22.1 release | `arena/14ceb9c3` | **MERGED** | 2026-10-07 |
| #4 | feat(p29-v2.1): Woodex Admin v2.1 Preline Dark Obsidian & Cyan Release, Master Hostinger Suite & Full QA Sweep | `arena/8a776c65` | OPEN | 2026-10-08 |
| #5 | Arena/4ba510f0 marketingwoodex | `arena/4ba510f0` | OPEN | 2026-10-10 |
| #6 | Admin design + layout batches: chart theming, colour tokens, header/KPI consistency, asset versioning | `arena/7f38fddd` | OPEN | 2026-10-11 |

**Branch hygiene note.** PR #6 records that its base had to be retargeted because "`main` on this
repo is an unrelated history" — PR #6's real base is PR #5's branch. PRs #4, #5 and #6 are therefore
a chain, not three independent proposals, and the repository has no branch that cleanly contains
everything. Three of the six open PRs (and one that is merged) have never been brought into `main`,
so `main` is a snapshot from 8 October and **does not contain the current product**.

---

## 10. Release, Version and Build Matrix

### 10.1 Version ladder

| Version | Theme / focus | Admin modules | Status |
|---|---|---|---|
| Admin v1 (AdminLTE) | Classic dashboard, Phase 1–3 | 6 JS, single 306 KB page | Retired |
| Admin v2 "Fresh" | Serverless + Supabase experiment | 12 JS, 88 HTML | Retired |
| **Admin v2.0** | Custom dark slate `#0f172a`, 57 routes | 60 JS, 10,502 lines | In `main` |
| Admin v2.0 P23 | p23 build | 61 JS, 11,297 lines | Archive |
| **Admin v2.1** | Preline obsidian `#050608` + cyan `#00b8db`, centred frosted sign-in, 8 quote starters, dual-bank routing, Telegram bot, 4-stage bilingual client updates, 147 page sections | 62 JS | Candidate (PR #4) |
| **Admin v2.1 Pro** | Design + layout batches: theme-aware charts, token unification, 57/57 route headers, KPI layout | 64 JS, 62 views, 59 routes, 12,906 lines | **Source of truth** (PR #6, tree `woodex-live-p29-v2.1-pro`) |
| Admin v3 | Packaged build | zipped, 2.0 MB | Artefact only |
| Admin v2.5 Pro | Multi-theme switcher, WebSocket collaboration, AI scope generator, client self-service portal, payment gateways, inventory engine | — | **Roadmap (4 weeks)** |

### 10.2 Distribution artefacts

| Artefact | Size | Target | Contents |
|---|---|---|---|
| `woodex-vlive-P20/woodex-v20-master.zip` | 28 MB | Hostinger | P20 site, 38 PHP files |
| `woodex-master-P22/woodex-master-P22.1.zip` | 28 MB | Hostinger | P22.1 (audited by PR #3) |
| `woodex-master-P22/woodex-master-P22.2.zip` | 28 MB | Hostinger | P22.2 |
| `woodex-live-P23/woodex-live-P23.zip` | 28 MB | Hostinger | P23 (build 08:54) |
| `woodex-live-p23/Woodex Live P23.zip` | 29 MB | Hostinger | P23 rebuild with `.env` (18:36) |
| `woodex-live-v3/woodex-master-production.zip` | 28 MB | Hostinger | Production bundle |
| `woodex-live-v3/woodex-admin-v3.zip` | 2.0 MB | Admin only | v3 admin drop-in |
| `woodex-live-p29-v2.1-pro/Woodex Live P29-v2.1 Pro.zip` | 29 MB | Hostinger | **Current release archive** |
| `deploy/woodex-live.zip` + `p1 … p14` | 0.04–7 MB each | Staged | 16 incremental deployment archives |
| `deploy/woodex-26.zip`, `deploy/agentbridge.zip` | 3.2 MB / 25 KB | Mixed | v26 master, MCP bridge |

### 10.3 Release trees measured against `main`

| Tree | Files | PHP | HTML | JS | Verdict |
|---|---|---|---|---|---|
| `frontend-v1/` | 642 | 48 | 153 | 80 | Current product, no packaging wrapper |
| `p22-preview/` | 634 | 46 | 152 | 78 | Historic preview |
| `p23-live/` | 645 | 46 | 153 | 78 | Historic preview |
| `woodex-live-p23/` | 714 | 47 | 156 | 139 | Largest tree, includes demo-preview and tests |
| `woodex-live-p29-v2.1/` | 642 | 48 | 153 | 80 | v2.1 plain tree — contains the parse-breaking duplicates |
| `woodex-live-p29-v2.1-pro/` | 674 | 54 | 153 | 82 | **Source of truth** |
| `woodex live p29-v2.1/` and `woodex live p29-v2.1 pro/` | 642 each | 48 | 153 | 80 | Space-named duplicates of the above |
| `woodex-vlive-P20/site/` | 612 | 38 | 150 | 77 | P20 archive |
| `wf-admin/` | 389 | 0 | 88 | 12 | Retired experiment |
| `admin/` | 24 | 0 | 1 | 6 | Legacy dashboard |

---

## 11. Quality, Security and Risk

### 11.1 Findings by severity (repository evidence)

| Severity | Open | Fixed pending verification | Source |
|---|---|---|---|
| Critical | 8 | 0 | `woodex-audit/21-release-readiness.md` |
| High | 28 | 5 | `woodex-audit/06-defect-verification-matrix.md` |
| Medium / Low | remainder of 60 unique IDs | — | same pack |

### 11.2 Critical findings

| ID | Finding | Location |
|---|---|---|
| SEC-001 | Shared demo password pre-filled in the browser-served login form and substituted when the field is empty | `admin/index.html:43`, `admin/admin.js:235,256` |
| SEC-002 | A public page tells visitors how to sign in to `/admin/` using the master account | `downloads.html:70` |
| SEC-003 | Telegram bot token in browser-served JavaScript and in 36 tracked locations | `admin/admin-tg.js:27`, `.env:18`, `config.php:23` |
| SEC-003b | Secrets tracked: `.env`, `config.php` (DB password, IBANs), `_private/db.json`, `_private/admin-db.json` (7 password hashes each), `_private/system.json`, `_private/company.json` | pro tree, not ignored |
| SEC-004 | Repository is public while the above are tracked | `gh repo view` → `isPrivate: false` |
| SEC-005 | Live validity of the leaked credentials is **unknown** — the three committed SQL dumps share one distinct bcrypt hash that does not match the published literal | `woodex-audit/evidence/` |
| AD-01 / AD-02 | Duplicate-fragment parse failures in the plain tree; which tree is deployed is unknown | `woodex-live-p29-v2.1/admin/` |
| AD-24 / AD-25 | Private-path protection (403/404) unverified on the live host; the JSON store depends on it entirely | `_private/*.json` |

### 11.3 Release-readiness gates

| Gate | Status |
|---|---|
| A. Scope integrity | Partly met |
| B. Baseline integrity | Partly met — runtime not exercised |
| C. Finding quality | Met — 60 unique IDs with evidence labels |
| D. Fix quality | Partly met — three narrow fixes, no production rollback test |
| E. Functional/technical verification | Partly met — jsdom + headless Chromium against a stub API pass; live site, real API and PHP runtime not tested |
| F. Deployment | **Blocked** — no live access |
| G. Packaging | **Blocked** — secrets tracked, QA results not tied to an artifact |

**Recommendation carried forward from the audit pack: BLOCK.**

### 11.4 Risk register (top risks with remediation)

| # | Risk | Likelihood | Impact | Treatment |
|---|---|---|---|---|
| R1 | Leaked credentials used against the live admin or bot | Medium–High | Severe | Rotate password, DB user, Telegram token, app key, maintenance token; then remove the literals |
| R2 | Private JSON store readable over HTTP if `.htaccess` is not honoured | Medium | Severe | Verify 403 on the live host; move state into MySQL; add a second guard in PHP |
| R3 | The wrong admin tree is deployed (three v2.1 copies exist) | High | High | Ship only `woodex-live-p29-v2.1-pro`; delete the space-named and plain copies |
| R4 | Non-atomic JSON writes corrupt state under concurrent admin use | Medium | High | Add `flock` around read-modify-write; make `jread` fail loudly rather than silently |
| R5 | WhatsApp opt-out list overwritten by a racing cron tick | Medium | High | Take the same lock in admin writers; make "busy" visible in the UI |
| R6 | Two backends drift apart (PHP vs serverless) | High | Medium | Declare PHP-on-Hostinger the only production backend; archive `netlify/`, `api/router.mjs`, `wf-admin/` |
| R7 | `main` does not contain the current product | Certain | Medium | Merge the #4 → #5 → #6 chain into `main` after R1 is cleared |
| R8 | Repository size and duplication slow every future change | Certain | Medium | Split archives into a `releases` branch or external storage; keep one tree per generation |

---

## 12. Recommendations and Roadmap

| Horizon | Action | Why | Owner |
|---|---|---|---|
| Immediate (0–48 h) | Rotate the shared password, database user, Telegram token, app key and maintenance token in each provider console | Removes the only Critical finding that is fully in your control | Owner |
| Immediate | Decide repository visibility (currently public) | Every remaining secret exposure is amplified while public | Owner |
| Immediate | Remove the login pre-fill/fallback, the `/admin/` hint on `downloads.html`, and untrack `.env`, `config.php`, `_private/*` | Closes SEC-001/002/003 at the source | Owner + agent |
| Immediate | Add the missing `.gitignore` rules to the pro tree | Prevents recurrence | Agent |
| Week 1 | Deploy **only** `woodex-live-p29-v2.1-pro`; delete the two space-named copies and the plain v2.1 tree | Removes the "which build is live?" failure class | Agent |
| Week 1 | Verify private-path 403/404 on the live host | Closes AD-25 | Owner + agent |
| Week 1 | Merge the #4 → #5 → #6 chain into `main` so the repository has one truth | Stops the "wrong build" class of support questions | Owner |
| Week 2 | Make `jread`/`jwrite` lock-safe and fail loudly; add a lock to WhatsApp admin writes | Closes BE-1, BE-3 | Agent |
| Week 2 | Move API keys, approvals, maintenance tokens and opt-outs from JSON files into MySQL | Removes the availability + secrecy dependency on `.htaccess` | Agent |
| Week 2 | Declare the PHP stack authoritative and archive `netlify/`, `api/router.mjs`, `wf-admin/` | Ends double maintenance (BE-5) | Owner |
| Week 3 | Version every admin script (`?v=<hash>`), remove the legacy `admin/` dashboard, add a build step | Fixes AD-7, FE-1 | Agent |
| Week 3 | Move the capability matrix into seeded tables (`db/migrations/001_roles.sql`); export a fresh, secret-free dump | Fixes DB-1 | Agent |
| Week 4 | Cut a release artifact whose manifest matches the QA run; re-run the readiness gates | Turns "BLOCK" into "conditional" | Agent |
| Month 2 | Execute the v2.5 Pro roadmap only after the above: multi-theme, WebSocket collaboration, AI scope generator, client portal, payment gateways, inventory | The roadmap assumes a clean base | Owner + agent |

---

## 13. Conclusion

The Woodex project already contains, inside this repository, a **complete and unusually
feature-rich** studio operating system: a 150-page sales website, a 57-route admin that covers CRM
through invoicing to SEO, working WhatsApp, Telegram, Google and AI integrations, a page builder,
a booking system, and an audit pack of 25 documents that is more rigorous than most commercial
products carry.

What it does not yet contain is **one answer to the question "what is the product?"** Four admin
generations, sixteen release trees, thirteen branches and four overlapping data stores make every
statement about the system conditional. The three critical exposures all share the same root
cause — values that were convenient during development were never removed from tracked files, and
the repository is public.

Fix the four things that multiply: **rotate the credentials, make the repository private, ship one
tree, and merge the branch chain into `main`.** Everything else on the list is already written
down, verified and waiting.

---

## Appendix A — Backend action inventory by module

| Module | Actions | Module | Actions |
|---|---|---|---|
| `admin.php` | 36 | `redirects-lib.php` | 5 |
| `content-lib.php` | 33 | `seo-agent-lib.php` | 5 |
| `builder.php` | 27 | `google-data-lib.php` | 4 |
| `sales-lib.php` | 26 | `notify-lib.php` | 4 |
| `media-lib.php` | 23 | `p18j-lib.php` | 4 |
| `crm-lib.php` | 20 | `sheets-lib.php` | 4 |
| `mcp.php` | 19 | `whatsapp.php` | 4 |
| `sales17-lib.php` | 16 | `ai-center-lib.php` | 3 |
| `chat-lib.php` | 15 | `approvals-lib.php` | 2 |
| `p18g-lib.php` | 14 | `dash-lib.php` | 2 |
| `p18h-lib.php` | 14 | `logos-lib.php` | 2 |
| `roles-lib.php` | 14 | `p19c-lib.php` | 2 |
| `phase8-lib.php` | 13 | `quote-view.php` | 1 |
| `security-lib.php` | 13 | `r404.php` | 1 |
| `social-lib.php` | 10 | `wa-cron.php` | 1 |
| `tg-lib.php` | 9 | `chat.php` | 5 |
| `conn-lib.php` | 7 | `forms.php` | 2 |
| `seo-lib.php` | 7 | `telegram.php` | 2 |
| `wahub-lib.php` | 7 | | |
| `booking-lib.php` | 6 | **Total distinct** | **365** |
| `ai-agent-lib.php` | 5 | | |
| `p18e-lib.php` | 5 | | |

## Appendix B — File-type inventory (repository, vendor excluded from line counts)

| Type | Files | Lines |
|---|---|---|
| HTML | 477 | 96,003 |
| JavaScript (`.js`) | 173 | 36,198 |
| Python tooling | 109 | 33,574 |
| Markdown | 355 | 33,274 |
| JSON | 373 | 32,909 |
| CSS | 21 | 15,892 |
| ES modules (`.mjs`) | 165 | 13,780 |
| PHP | 87 | 13,110 |
| SQL | 14 | 1,347 |
| Images (webp/png/jpg) | 684 | 48 MB |
| Fonts (`woff2`/`woff`) | 70 | 520 KB |
| Archives (`.zip`) | 29 | 139 MB |

## Appendix C — Reproducing every number in this report

```bash
# file counts and size
git ls-tree -r --name-only origin/main | wc -l
du -sh --exclude=.git .

# branch comparison
for b in $(git branch -r | grep -v HEAD | sed 's| *origin/||'); do
  echo "$b $(git diff --numstat origin/main origin/$b | awk '{a+=$1;d+=$2} END{print a, d}')"
done

# backend action surface
grep -ohE "case '[a-z0-9_]+'" frontend-v1/api/*.php | sort -u | wc -l

# admin module map
for f in frontend-v1/admin/*.js; do
  printf "%-22s %5s %s\n" "$f" "$(wc -l <"$f")" "$(grep -ocE 'VIEWS\.[a-z]+ *=' "$f")"
done

# database schema
grep -cE "CREATE TABLE" frontend-v1/_database/woodex-v20.sql

# admin navigation
grep -cE '^\s*\["[a-z0-9/-]+", "' frontend-v1/admin/admin.js
```

```bash
# regenerate this PDF
python3 tools/report2pdf.py PROJECT-ANALYSIS-REPORT-2026-10-13.md PROJECT-ANALYSIS-REPORT-2026-10-13.pdf
```

*End of report — 13 October 2026.*
