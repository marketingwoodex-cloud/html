# WOODEX — MASTER PLAN v1.0
## Master Dashboard · Live Page Builder · CRM · Quotations & Invoices

**Status:** FOR APPROVAL — development starts only after this plan is approved
**Date:** 28 September 2026
**Based on:** Go-Live Deep Audit (AUDIT-REPORT-2026-09-28.md) + design mockup (ChatGPT dashboard) + admin screenshots
**Repository:** marketingwoodex-cloud/-marketingwoodex · **Environment:** Vercel (production + previews)

---

# 1. Executive Summary

The goal is **one master dashboard, fully no-code**, that runs the entire Woodex web operation:

1. **The website (87 HTML pages)** — customized, edited, and extended live through a **block-based page builder** (header/footer locked, add & remove pages from templates).
2. **Lead generation & CRM** — enquiries and estimator leads flowing in from the site, **WhatsApp click-to-chat**, and a **built-in live chat** (Supabase Realtime) with an inbox in the dashboard.
3. **Client database → quotations → tracking → invoices** — quotation templates & per-quote customization, **server-generated PDF emailed to the client**, status tracking (sent/accepted/invoiced/paid), and invoice tracking.
4. **A redesigned dashboard home** matching the approved design mockup, with existing broken modules repaired rather than rebuilt wholesale.
5. **Audit P0/P1 remediation** folded into the schedule (domain cutover, security headers, redirects, OG/favicon, performance).

Hosting decision: **everything stays on Vercel** (site + admin + 30 API functions). Hostinger is used for the **domain only** — DNS points to Vercel. No PHP rewrite, no dual-deploy.

**Timeline: 13 weeks (Phase 0–6), with an approval gate at the end of each phase.**

---

# 2. Decisions Locked (Q&A, 28 Sep 2026)

| # | Decision | Choice |
|---|---|---|
| D1 | Hosting architecture | **Stay on Vercel for everything** (site + admin + API). Hostinger = domain/DNS only. |
| D2 | Live chat & WhatsApp | **Custom live chat via Supabase Realtime** built into the dashboard; WhatsApp stays click-to-chat deep links feeding the same CRM. |
| D3 | Page builder model | **Block/section builder with locked header & footer**; add/remove pages from templates; true no-code. |
| D4 | Dashboard design scope | **Redesign Dashboard home + fix broken modules** to match the mockup; keep working screens (Templates, Pipeline, etc.) with light restyle. |
| D5 | Quotation documents | **Server-side PDF + email to client**, with tracking; approved in principle — *this document is the plan; development starts after approval.* |

---

# 3. Target Architecture

```
BROWSER (visitor)
   │  HTTPS
   ▼
VERCEL ─── static: 87 HTML pages + assets (CDN, cache headers from audit P0-4)
   │
   ├── /api/router?fn=…  (single serverless function → 30 handlers, Node 20)
   │        │
   │        ├── Supabase Postgres (RLS on, service_role server-side only)
   │        │        └── Realtime (live-chat broadcasts)
   │        ├── GitHub Contents API (publish pipeline → commit → auto-deploy)
   │        └── Resend API (transactional email + PDF attachments)
   │
   └── anon key + Realtime Broadcast (public, thread-token scoped) ← chat widget

ADMIN (/admin) — memory session + HMAC, roles admin/editor/viewer
DESIGN — mockup tokens (dark navy + gold), Bootstrap 5 base restyled
```

**Principles**

- Static HTML output is preserved for SEO — the builder renders blocks to HTML on **publish**, never at request time.
- The browser never sees service_role/GitHub tokens (unchanged from audit).
- Every feature is operable by a non-developer from the dashboard (no-code rule).
- One repo, one deploy pipeline: content commits on `main` → Vercel deploy (~40 s).

---

# 4. Current State → Gap Map

Module status from the audit + your screenshots, mapped to your sidebar:

| Sidebar module | Status today | Work required | Phase |
|---|---|---|---|
| Dashboard | Works, basic | **Rebuild home screen to match mockup** (stats, chart, activity, quick actions) | 1 |
| Analytics | Works (page_views) | Add leads/conversions series per mockup tabs | 1 |
| Enquiries | Works | WhatsApp source tagging, notifications | 1, 3 |
| Estimator Leads | Backend works | Dashboard tile still says "Coming soon" → wire | 1 |
| Pipeline | Partial — shows SAMPLE rows | Real stages (New→Contacted→Site Visit→Quoted→Won/Lost), remove samples | 3 |
| Site Visits | Backend exists | Calendar/list UI + status flow | 3 |
| Quotations | Works (screenshot 2) | Lifecycle tracking + server PDF + email | 4 |
| Templates | Works (screenshot 3) | Customization fields, richer section editor | 4 |
| Invoices | Backend exists | Status tracking (unpaid/partial/paid) + reminders | 4 |
| Clients | Backend exists | Client hub: contact + quotation history | 3–4 |
| Pages (builder) | GrapesJS over raw HTML — fragile | **Replace with block builder** | 2 |
| Services / Locations | Backend exists | Content moves to block-backed pages where applicable | 2, 5 |
| Projects / Insights / Testimonials / Team | Mostly work | Builder integration, sample-data guards | 2, 5 |
| Media Library | Works | Remove SVG upload (audit P2-3), keep PNG/JPG/WEBP | 1 |
| Theme | Works (tokens) | Keep, minor polish | 5 |
| Navigation | cms-menu-items exists | Mega-menu editor UI | 5 |
| SEO Manager | **Redirects dead (audit P0-2)** | Fix redirect engine + per-page meta editor + sitemap regen | 0, 2, 5 |
| Site Settings | Works | Keep | 1 |
| Users & Roles | Works | Password hashing → Argon2 (audit P2-1) | 5 |
| Audit Trail / Versions / Backups / Health | Backend exists | Surface polished UIs, scheduled backups | 5 |
| **Live Chat** | **Missing** | **Widget + inbox + realtime (new)** | 3 |
| Forms / Pricing & Estimator / Mega Menu / Integrations (mockup nav) | New in mockup | Forms manager; estimator rates view; nav builder; integration status cards | 3, 5 |

**Audit items folded in:** P0 security headers · P0 redirects engine · P0 password rotation (user) · P1 OG/Twitter + favicon (batch over all pages) · P1 `/services/` link · P1 404 page refresh · P1 estimator orphan fix · P1 empty FAQ schema · P1 privacy page · P1 image/CSS performance pass.

---

# 5. Workstreams (Scope & Acceptance)

## W-A · Audit Remediation (P0/P1) — Phase 0
- `vercel.json` security headers (CSP report-only first), `X-Robots-Tag` on `/admin`, immutable cache for `/assets`.
- **Redirect engine:** Vercel Edge middleware reading the `redirects` table (60 s edge cache) → 308s. This is the prerequisite for domain cutover.
- Batch edits over all 87 pages: Open Graph + Twitter cards, favicon, estimator links (nav/footer/sitemap), `/services/` link fix, `404.html` nav refresh, empty `FAQPage` JSON-LD populated or removed, privacy page + footer link.
- Image recompression pass (hero WebP ≤ 150 KB) + explicit dimensions + lazy-loading; CSS minify.
- **Acceptance:** audit P0=0, P1=0; link-crawler script green; headers verified in Vercel preview.

## W-B · Admin Shell + Dashboard Home — Phase 1
- Apply mockup design tokens (see §11) to app shell: sidebar with section labels + active gold pill, top bar (search, ⌘K, Live Site, bell, avatar), date-range picker, Quick Actions panel, System Status cards, testimonial/quote card.
- **Dashboard home widgets (live data, not mock):** Total Leads (+30-day delta), Quotation Value (sum of active quotes), Scheduled Visits (this week), Active Chats, Website Analytics area chart (visitors/page views/leads/conversions tabs), Recent Enquiries list, Latest Projects, Recent Blog Posts, Recent Activity feed.
- Repair triage: every sidebar item opened and tested; broken fetches/wiring fixed; "Coming soon" tiles connected (Estimator Leads).
- Chart library: **Chart.js** (lightweight, matches mockup chart style).
- **Acceptance:** all nav items render real data or an explicit empty state; dashboard matches mockup layout; responsive down to 768 px.

## W-C · Live Page Builder (the core) — Phase 2
Full specification in §6. Deliverables: block schema, renderer/publish pipeline, editor UI, add/remove page flows, migration of all 87 pages, preview + version history.
- **Acceptance:** a non-developer can edit any section of any page, preview, publish, and create/delete a page — with the site never left in a broken state (validator gates every publish).

## W-D · CRM, WhatsApp & Live Chat — Phase 3
Full specification in §7. Deliverables: pipeline rework, source attribution, WhatsApp deep-links from CRM rows, live-chat widget + realtime inbox + header notifications, site-visit manager, forms manager.
- **Acceptance:** visitor opens chat → dashboard receives message < 1 s; reply appears in widget; enquiry created from chat; every lead shows its true source (page / WhatsApp / chat / estimator).

## W-E · Quotations → PDF → Invoices — Phase 4
Full specification in §8. Deliverables: lifecycle + tracking, server PDF, Resend email, invoice statuses, client hub.
- **Acceptance:** quote built from template → customized → PDF emailed (lands in inbox, branded, correct PKR figures) → status moves Sent → Accepted → Invoiced → Paid, all visible in tracking.

## W-F/G/H · Content, SEO & System — Phase 5
- **F:** Services/Locations/Projects/Insights/Testimonials/Media/Team editors all routed through the new block manifest where they are pages; sample-data guards on every "Load samples" button (confirm + never auto-publish).
- **G — SEO Manager:** per-page meta editor (title/description/canonical/OG) writing into the page manifest; sitemap regeneration with `lastmod`; redirects UI now truly live (middleware from W-A); robots editor; Article schema for insights; Template/Navigation/Mega-menu editors.
- **H — System:** Argon2 password migration, audit-trail & versions UIs, scheduled Supabase backups (daily pg_dump → storage), health panel, Integrations status cards (GitHub/Supabase/Resend/Vercel).
- **Acceptance:** each screen has CRUD + validation + empty states; roles enforced (viewer read-only).

## W-6 · Testing & Go-Live — Phase 6
See §13 and §14.

---

# 6. Page Builder Specification (D3)

## 6.1 Why block-based (not raw HTML)
The current GrapesJS builder edits raw page HTML — one drag can destroy layout (part of "admin not working properly"). The mockup's job is a **safe, structured editor**: content-changers get sensible controls; the shell stays consistent; SEO cannot be accidentally destroyed.

## 6.2 Data model

```
content/
  pages/
    fit-out/            blocks.json      ← ordered block array + per-block props
                        meta.json        ← title, description, canonical, og, schema flags
    interior-design/    …
    insights/interior-design-cost-pakistan/ …
  layouts/
    header.json          ← edited once, applies to all pages (nav via Navigation module)
    footer.json
    head.json            ← favicon, OG defaults, analytics hooks
  templates/
    service-page.json    city-page.json  article.json  listing.json  landing.json
```

- **Published output** remains a static `index.html` at the existing URL — renderer = `layout shell + blocks → HTML`, committed by the existing GitHub helper (`validPagePath` unchanged, admin/netlify/api still write-protected).
- Publish flow: **Validate → Render → Version snapshot (page_versions) → Commit → Vercel deploy**. Preview flow: same render to a sandbox preview URL without commit (dashboard iframe).

## 6.3 Block library (initial 18 types)

| Block | Purpose |
|---|---|
| hero | kicker, H1, lead, buttons, image, dark/light variant |
| rich-text | headings, paragraphs, lists, links, inline images |
| feature-grid | icon + title + text cards (mockup home sections) |
| services-grid | numbered service links with arrows |
| gallery | image grid / carousel with alt fields |
| stats-band | big numbers (124 leads, Rs 4.5M style) |
| process-steps | numbered timeline (01–04) |
| faq | accordion — **auto-emits valid FAQPage JSON-LD** (fixes audit P1-6) |
| testimonials | quote slider with author/role/rating |
| cta-band | conversion strip with buttons |
| contact-form | enquiry form embed (source-tagged) |
| estimator-embed | cost calculator embed |
| hub-cards | related-pages card grid (services/cities) |
| team-grid | member cards |
| pricing-table | estimator rates rows |
| blog-list | latest N insights |
| map-visit | address, hours, map link |
| raw-html | **admin-gated** escape hatch for complex one-offs |

Every text field runs through the same `esc()` rules on render; no inline scripts from normal blocks.

## 6.4 Editor UX (no-code)
- Left: block list (add / reorder drag / duplicate / hide / delete).
- Center: live preview (desktop / mobile toggle — matches current builder toolbar).
- Right: selected-block fields (text inputs, image picker from Media Library, link picker, color limited to design tokens).
- **Page settings drawer:** title, meta description, slug, template, publish/unpublish.
- **Add page:** pick template → enter slug + title + meta → scaffold blocks → edit → publish (auto-added to sitemap).
- **Remove page:** confirm dialog → file deleted → **301 redirect auto-suggested** (feeds the redirects table — synergy with W-A) → sitemap regenerated.

## 6.5 Migration of the 87 pages
1. Converter script maps current HTML → blocks per **page family**: home (1), hub pages (services + cities ≈ 40), service detail (≈ 30), insights articles (9), listing (projects/insights), utility (about/contact/estimator/404).
2. Rendered output compared byte-close to current page (visual diff checklist per family).
3. Manual QA per family (10 families), then batch apply.
4. Old GrapesJS editor retained read-only for one phase, then removed.

**Estimate:** converter 3–4 days; QA/fixes 4–5 days; editor UI 5–7 days; templates & publish pipeline 4–5 days → fits Phase 2 (4 weeks).

---

# 7. CRM, WhatsApp & Live Chat Specification (D2)

## 7.1 Lead sources & attribution
Every lead row carries `source`: `website|whatsapp|chat|estimator|manual` + `source_page`. The estimator/contact forms already POST — extend payloads with `source_page: location.pathname`. WhatsApp buttons pass `?source=wa_<page>` so dashboard shows *which page* prompted the WhatsApp message.

## 7.2 WhatsApp (no Business API in scope)
- Existing floating widget kept (quick replies → wa.me).
- **CRM side:** each lead row gets a **WhatsApp button** → `wa.me/<number>?text=<prefilled with lead ref & stage>` — agent chats in WhatsApp app; when the client replies, agent clicks "Mark WhatsApp contact" (stage log records it).
- Enquiry success screen offers "Continue on WhatsApp" handoff.
- *Future (out of scope):* Meta WhatsApp Cloud API two-way sync — parked in roadmap §16.

## 7.3 Live chat (custom, Supabase Realtime)
- **Widget** (public pages): bubble + panel, pre-chat name/phone optional, quick-reply chips (Get a quote / Book a site visit / Ask a question — mirroring the WhatsApp widget's flows), message input. Visitor gets a random `visitor_token` (localStorage) and `thread_id` (UUID).
- **Transport (keeps service key server-side):**
  1. Persistence via existing router: `POST /.netlify/functions/cms-chat` (send/history/mark-read, validated + rate-limited, service_role writes).
  2. Live delivery via **Supabase Realtime Broadcast** on channel `chat:<thread_id>` — browser uses the **anon key** (public by design) + RLS-strict tables; channel name is an unguessable UUID.
  3. Dashboard inbox subscribes to broadcast + polls REST on reconnect; header **bell badge** updates from a `cms-notifications` counter (or `cms-stats` extension).
- **Agent UX (mockup "Live Chat" item):** thread list (online/offline, unread counts), conversation view, canned replies, "convert to enquiry", close thread → auto-creates/links CRM lead, offline-hours auto-reply offering WhatsApp fallback.
- **Availability:** toggle in Site Settings (widget shows "We're offline — WhatsApp us" outside hours).

## 7.4 Pipeline & site visits
- Stage machine on enquiries/estimator leads: **New → Contacted → Site Visit → Quoted → Won / Lost** (matches screenshot), stage changes logged to activity (audit trail), drag or dropdown, per-stage counters like the mockup.
- Site Visits: date/time, address, assigned member, outcome; feeds "Scheduled Visits" dashboard widget.
- Clients: auto-created on Won (or manual), stores contact + linked quotations/invoices history.

**Acceptance:** chat round-trip < 1 s; every source tagged; no SAMPLE data can exist in production (sample loaders gated).

---

# 8. Quotations → PDF → Invoices Specification (D5)

## 8.1 Lifecycle
```
Draft → Sent (PDF emailed, log entry) → Viewed* → Accepted → Invoiced → Paid
                                       (* optional: track PDF link opens later)
```
- Status pills + history timeline per record (who/when/what).
- WhatsApp "send quote link" button alongside email.

## 8.2 Templates & customization
- Keep the existing template engine (sections + line items — proven in screenshot 3).
- Enhancements: default discount/tax fields, terms & conditions block, logo/brand header, currency PKR formatting (existing `fmtPKR`), reuse from any client record.
- Per-quote customization: add/remove/edit lines after loading a template; changes never mutate the template.

## 8.3 Server PDF (new backend)
- Endpoint: `cms-quotations` gains `action=pdf&id=` (admin session required) → **pdfkit-style** server-side PDF (pure JS, no headless Chrome — fits Vercel Hobby limits).
- Branded layout: letterhead (logo, address, NAP), ref no, client block, sectioned line items, totals, payment terms, page numbers.
- Stored in Supabase storage table as base64/blob or streamed directly for download; button in dashboard: **Download PDF** + **Email PDF**.

## 8.4 Email (new)
- **Resend API** (free tier 3,000/month) — `send-email` wrapper in the router.
- Requires: `woodex.com.pk` **SPF + DKIM records** added at Hostinger DNS (added to Go-Live checklist §14).
- Emails: quotation (PDF attached, subject `Woodex Quotation <REF>`), invoice, payment reminder (template variables), plus optional enquiry auto-acknowledge.
- Every send logged to `email_log` (status, error, timestamp).

## 8.5 Invoice tracking
- Invoices from quotations (one-click "Create invoice from quote" pulling accepted lines).
- Fields: inv no, issue/due dates, paid amounts → status auto (unpaid/partial/paid), partial payments list, WhatsApp reminder button, printable/PDF same pipeline.

**Acceptance:** end-to-end test: template → quote → email received with PDF → accepted → invoice → marked paid; all states reflected on dashboard and client history.

---

# 9. Database Changes (Supabase)

**New tables**

| Table | Key columns |
|---|---|
| chat_threads | id uuid, visitor_token, status(hot/closed), lead_id?, agent, last_msg_at, created_at |
| chat_messages | id, thread_id, sender(visitor/agent), body, read_at, created_at |
| notifications | id, kind, body, link, read_at, created_at |
| quotation_events | id, quote_id, event(sent/accepted/rejected/viewed), actor, note, created_at |
| invoice_payments | id, invoice_id, amount, paid_at, method |
| email_log | id, kind, to_addr, subject, status, error, created_at |
| form_submissions | id, form_key, payload jsonb, source_page, created_at (Forms module) |

**Altered**
- enquiries / estimator_leads: + `source`, `source_page`, `stage`, `client_id`
- quotations: + `email_sent_at`, `accepted_at`, `pdf_path`
- invoices: + `quote_id`, `due_date`, `paid_amount`
- activity: used as-is for audit trail (kinds extended: `stage`, `email`, `chat`)

RLS: enabled, **no public policies**; chat tables additionally gated via service-key-only REST + Realtime broadcast (anon key never gets table read). Schema shipped as one migration file (fixes audit note: migrations must cover ALL tables incl. enquiries/activity).

---

# 10. API Surface Changes

| Endpoint | Change |
|---|---|
| cms-chat (new) | send/history/close/mark-read (session for agent; visitor-token header for widget, rate-limited) |
| cms-notifications (new) | unread counter + list |
| cms-quotations | + `pdf` action, + `email` action, + events timeline |
| cms-invoices | + payments, + create-from-quote |
| cms-pages (new) | manifest CRUD, preview render, publish, add/remove page (replaces page-builder calls to cms-save for HTML) |
| cms-seo (new) | meta get/put per page, sitemap regenerate, robots get/put |
| cms-enquiries / estimator-leads | + stage PATCH, source filters |
| enquiry-submit / estimator-submit | + `source_page` capture |
| (fix) redirects | middleware now consumes the table (audit P0-2) |

All remain behind `verifySession` + roles, routed through the single `api/router` (Vercel Hobby 12-function cap respected — **no new function files**).

---

# 11. Design System (from your mockup)

- **Palette:** page bg `#0B0F1A` · card `#121826` / `#0F1524` · sidebar `#0A0F1E` · accent gold `#E9C97B` (active pill, primary buttons) · text `#F5F7FA` / muted `#8A8F9C` · success `#22C55E` · danger `#EF4444` · info `#38BDF8`.
- **Type:** Inter (or system stack fallback), 14/16/24/32 scale; numerals tabular in stat cards.
- **Components:** stat cards with delta arrows, area chart (Chart.js gradient), pill badges (New / In Progress / Contacted), quick-action rows with chevrons, glassy dark cards with 1 px `rgba(255,255,255,.06)` borders, radius 12–16.
- **Base:** keep Bootstrap 5 (already loaded) + AdminLTE removed where it conflicts; custom `woodex-admin.css` extended with tokens above — lowest-risk restyle path.
- **Public site** stays on its current identity (dark navy + white, matching brand) — mockup applies to `/admin` only.

---

# 12. Phasing & Timeline (13 weeks)

| Phase | Weeks | Content | Gate |
|---|---|---|---|
| **0 — Audit P0/P1** | 1 | Headers, redirect engine, OG/favicon batch, link fixes, 404, FAQ schema, privacy page, perf pass | Security headers live; crawler green |
| **1 — Dashboard home + fixes** | 2–3 | Design system, app shell, dashboard widgets (mockup), broken-module triage, estimator tile, media SVG removal | Every nav item works w/ real data |
| **2 — Block page builder** | 4–7 | Schema, renderer, editor UI, add/remove pages, migrate 87 pages, preview + versions | Non-dev publishes a page end-to-end |
| **3 — CRM + chat** | 8–9 | Pipeline, visits, sources, WhatsApp buttons, live chat widget+inbox+bell, forms | Chat RT < 1 s; sources correct |
| **4 — Quotes/PDF/Invoices** | 10–11 | Lifecycle, server PDF, Resend email, invoice tracking, client hub | Full E2E with real email |
| **5 — SEO + system** | 12 | SEO manager, sitemap regen, Argon2, audit/versions/backups UIs, theme/nav/mega-menu | Roles + audit enforced |
| **6 — Test & go-live** | 13 | §13 test cycle → UAT → §14 cutover | **Site live on woodex.com.pk** |

Dependencies: 0 → 1 → (2 ∥ 3) → 4 → 5 → 6. Phases 2 and 3 can partially overlap if two work streams run in parallel.

---

# 13. Testing Plan (Vercel-first)

**Automated (run on every deploy — GitHub Action added in Phase 5):**
1. Link & asset crawler (the audit script): 0 broken internal links.
2. JSON-LD parse + FAQ/Article schema validation: 0 invalid blocks.
3. Meta coverage: unique title/description/canonical/OG on every page; estimator in sitemap.
4. API auth matrix: each endpoint with/without token × viewer/editor/admin → expected 401/403/200.
5. Builder publish validator: render → HTML well-formedness + `validPagePath` invariants.

**Manual / E2E (per phase, on Vercel preview URLs):**
- Responsive QA (360 px / 768 px / 1440 px) of dashboard + builder + chat widget.
- Chat E2E: two windows (visitor + agent), offline fallback, bell, convert-to-lead.
- Quote E2E: template → customize → PDF → email → accept → invoice → pay.
- Role QA: viewer cannot mutate (UI hidden + server 403).
- Performance budget: LCP < 2.5 s, total page < 1.5 MB on homepage after W-A; Lighthouse ≥ 90 all categories.
- **UAT sign-off checklist** provided to you; approval per phase.

**Environments:** feature branch → Vercel preview URL → (approve) → `main` production. No direct production edits.

---

# 14. Go-Live Checklist (Phase 6)

1. P0 password rotation (user) — `CMS_ADMIN_PASS_SHA256` updated.
2. Vercel project → add domain `woodex.com.pk` + `www` (apex `76.76.21.21`, CNAME `cname.vercel-dns.com`), HTTPS forced, www→apex redirect.
3. Hostinger DNS switch (A/CNAME records).
4. Redirect engine live: legacy WordPress URLs from old sitemap (`/contact-us-2/`, `/design-planning/`, `*.html`, `/page/*`) → 301 mapped.
5. Resend domain verify: **SPF + DKIM** DNS records at Hostinger.
6. Google Search Console: verify domain, submit new sitemap, kick old cache, monitor spam URLs.
7. Analytics: GA4/Clarity optional install (page_views beacon already running).
8. Security headers confirmed on production (incl. HSTS).
9. Backups: first scheduled pg_dump completed + restore tested.
10. `marketingwoodex.vercel.app` → either 301 to apex or `X-Robots-Tag: noindex` (avoid duplicate content).

---

# 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 87-page migration produces content diffs | High | Per-family converter + visual diff QA; old editor kept read-only one phase |
| Realtime chat leaks messages via public channel | Medium | Channel name = random UUID; bodies persisted server-side only; RLS on all tables; rotate thread ids on close |
| Vercel Hobby limits (12 functions, 10 s CPU) hit by PDF/email | Medium | Single-router pattern kept; pdfkit is pure-JS fast; email is async queued |
| Resend spam-foldering | Medium | SPF/DKIM/DMARC configured before first send; warm-up volume |
| Scope creep (mockup shows forms, mega menu, integrations) | Medium | All deferred into Phase 5 with fixed list; anything new → roadmap |
| Domain cutover index loss (audit P0-1) | High | Redirect middleware live *before* DNS switch; GSC submitted same day |
| Editor breaks a page via raw-html block | Low | raw-html admin-gated; validator rejects script/iframe outside allowlist; versions rollback |

---

# 16. Out of Scope / Future Roadmap
- WhatsApp Business Cloud API (two-way official sync) — after Meta verification.
- Client portal (tokenized quote/invoice links with online acceptance).
- Multi-language (UR/EN).
- Payments gateway integration (Stripe/JazzCash) on invoices.
- Full pixel-perfect redesign of *every* admin screen (D4 limited scope).
- Hostinger PHP migration (explicitly rejected — D1).

---

# 17. Cost Estimate (monthly, at current scale)

| Item | Plan | Cost |
|---|---|---|
| Vercel | Hobby (site + API within limits) | $0 |
| Supabase | Free (500 MB DB / 2 GB egress / realtime) — Pro $25 when exceeding | $0 → $25 |
| Resend | Free 3,000 emails/mo | $0 |
| Hostinger | Domain renewal (already owned) | ~$10–15/yr |
| Chat / builder / PDF libraries | Open source (pdfkit, chart.js) | $0 |
| **Total to launch** | | **≈ $0 + domain** |

---

# 18. Approval Gate

> **This master plan is the deliverable for approval. No development begins until you approve.**
> Approve as-is / approve with changes (annotate decisions D1–D5) / request revision.
> On approval: Phase 0 starts immediately; phase gates require your sign-off before the next phase begins.
