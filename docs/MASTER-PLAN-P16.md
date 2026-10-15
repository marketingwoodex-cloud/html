# Woodex Admin — Master Plan P16 (Advanced features + bug fixing)

**Rules:** baseline = `deploy/p15/woodex-live-p15-full.zip` (live). Improve existing modules — never rewrite/overwrite working code.
Work only in `frontend-v1/`. Every phase: QA on preview → FULL zip in `deploy/p16/` + plain-English upload steps → user review.

---

## Phase 1 — Baseline + foundation (from p15 full zip)
- [x] Confirm `frontend-v1` = p15 full zip + small additions only
- [x] System check screen (PHP, extensions, DB, `_private`, SSL, sign-in, builder token reason)
- [x] Page-builder sign-in fix (no builder-password dependency, admin-token fallback, reason shown)
- [x] SSL fix: bundled `api/cacert.pem` used by every outgoing call (AI, Google, WhatsApp, PageSpeed)
- [x] Clear error toasts instead of silent failures / endless "Loading…"
- [ ] **User:** upload FINAL zip (deploy/p16/woodex-live-p16-full.zip), send System check screenshot (all ✓) — confirms bugs 5, 7, 8, 11, 12, 13 root causes

## Phase 2 — Fix the 13 reported bugs (deep QA per module)
- [x] 1  Test-AI: readable chat bubbles (font, contrast, size, dark/light), copy button
- [x] 2  Bulk create cities: "Copy from" list loads; error + Retry if empty
- [x] 3  Service & site pages list loads (builder API) with search
- [x] 4  FAQ groups: explain purpose on screen + sample groups (Renovation, Pricing, Cities) + where each shows on site
- [x] 5  Page builder: runtime page view, new page create + save, Layers, Theme panel; **50 v26 templates in Sections tab**
- [x] 6  Dashboard: live CRM, quotation, invoice data (not only website) — done in Phase 3 dashboard
- [x] 7  Section library: loads, v26 templates (50), save own sections
- [x] 8  Blog: AI writer works (SSL fixed); **AI model auto-list from provider API**; empty-state help
- [x] 9  Integrations: reorganised (see Phase 3); WhatsApp change/reconnect number + discount offers to leads
- [x] 10 Google (free): Sign-in with Google + Analytics 4 + Search Console data on dashboard
- [x] 11 Speed test works (PageSpeed via SSL fix; key optional; clear error)
- [x] 12 Health check works (links, SSL, DB, disk, backups)
- [x] 13 Header/footer editor loads + saves (auto-updates all pages)
- [x] QA script: every admin route, zero JS errors / failed APIs / stuck loaders → full zip

## Phase 3 — Advanced UI/UX + features
**Sidebar (TailAdmin style)** ✅ done — headings + dropdowns, collapse to icons, Ctrl+K search, dark mode
- MENU: Dashboard
- SALES: Enquiries/Pipeline · Clients · Quotations · Invoices · Projects
- SUPPORT: Inbox (Chat + WhatsApp) · Updates to clients
- WEBSITE: Pages & Builder · Section library · Header/Footer · Blog · Projects gallery · Cities · Services · FAQ · Media
- MARKETING: SEO · Speed · Google (Analytics/Search Console)
- AI: AI Assistant · Training · AI Settings
- SETTINGS: Integrations · API keys · Users (All/Profile/Activity) · Company · Security · System check · Backups

**Smart dashboard** (TailAdmin layout, live data)
- [x] KPI cards: new leads, pipeline value, quotes sent, invoices paid/unpaid (PKR) + % vs last period
- [x] Statistics chart tabs: Overview = visitors vs leads · Sales = quotes sent vs won · Revenue = invoiced vs paid; date range
- [x] Monthly target meter (editable target)
- [x] Recent enquiries table, pipeline funnel, leads by city, overdue invoices, today's follow-ups
- [x] Website strip: visitors, speed score, SEO score, open chats

**Integrations (card grid)** — logo, status, Connect / Settings / Disconnect, Test button
- [x] Google, WhatsApp Cloud API, AI providers, Email (SMTP), Turnstile, PageSpeed, Maps
- [x] API keys table: masked, enable toggle, Test, Edit, Regenerate (MCP tokens)
- [x] **Local AI endpoint** (9router / OmniRoute): OpenAI-compatible base URL (public tunnel URL) + key; auto model list

**Inbox (Flowbite chat style)** — contacts left · thread middle · lead/CRM panel right; website chat + WhatsApp; AI/team takeover; send quote/offer

**Users** — All users · Profile · Activity feed

- [x] Full go-live QA → FULL zip `deploy/p16/woodex-live-p16-full.zip`

## Delivery
Full zip per phase. Upload → Extract → Overwrite → Ctrl+F5 → System check.

---
## Phase 3 — Build plan (approved designs: deploy/p16/mockup-*.png, wireframe-sidebar-modules.png)
Decisions: navy sidebar + gold · hover-expand icon rail + pin · split login · Plus Jakarta Sans · role-based dashboard ·
UI libraries converted to Woodex blocks (no Tailwind) · ~40 new blocks · ONE final full zip after full QA · full audit (admin + API + public pages).

- [x] 3.1 Sidebar: navy, hover-expand rail, pin, flyouts in mini mode, live count badges (leads, inbox), user card
- [x] 3.2 Dashboard: action chips · 4 KPI cards (trend vs last period) · Statistics chart (Overview/Sales/Revenue, 7/28/90) · monthly target meter (PKR, editable) · pipeline funnel · recent enquiries · today's follow-ups · Google/website strip · activity · role-based
- [x] 3.3 Login: split screen (photo + tagline | grouped card: Google, email/password, remember me, forgot, 2-step note)
- [x] 3.4 Page pattern on list screens: breadcrumb, title + gold primary button, filter bar, mini KPI cards, table, empty state, error + retry (Leads, Clients, Quotes, Invoices, Projects)
- [x] 3.5 Integrations card grid + API keys table (masked, toggle, test, MCP tokens)
- [x] 3.6 Inbox redesign (contacts | thread | lead panel)
- [x] 3.7 Users: All users · Profile · Activity feed
- [x] 3.8 Page builder: ~40 new blocks from Flowbite / Meraki UI designs (MIT) rebuilt in v1.css + Charts.css stats; new "UI kit" category
- [x] 3.8b Redirects (see REDIRECT-PLAN.md): www→non-www site-wide 301; 24 verified 301s (Google index + old WP menu + user table); 410 Gone for hacked spam (casino/Lego/Hello world); upgrade Admin Redirects manager (301/302/410, patterns, www switch, preloaded plan, target test + loop check, 404 monitor with one-click redirect, CSV, hit counts); active in final zip
- [x] 3.9 Go-live audit: every admin route (click/forms/errors), every API action (PHP lint + mirror tests), every public page (links, mobile, Lighthouse key pages), fix all
- [x] 3.10 FINAL full zip `deploy/p16/woodex-live-p16-full.zip` + README + CHANGES
