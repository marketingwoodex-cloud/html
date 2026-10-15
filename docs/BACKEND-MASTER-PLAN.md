# WOODEX — Backend Master Plan

**Version:** 1.2 · **Date:** 2026-09-29 · **Status:** awaiting approval (phase gates)
**Relationship:** extends `MASTER-PLAN.md` (Phases 0–6). Phase 0, 1, 2 are delivered;
this plan governs the **backend/module build-out** that follows, in build order.

**v1.2 adds:** D0 design-system conversion (mockup boards → `docs/design/DESIGN-SYSTEM.md`,
every admin view to light content style), view build matrix, deployment-readiness
section (Vercel + Hostinger DNS cutover, "ready to upload" checklist), D6 resolved
(4200168), repo organization (`docs/design/` as durable design source of truth).

**v1.1:** Connectivity Verification (B4), Site Control, CRM Control Room (B7),
live-chat agent console (B5.1), client DB design (Appendix A), settings fixes.

---

## 0. Current State (what is live vs planned)

| Module | State |
|---|---|
| Dashboard home (KPIs, analytics, widgets) | ✅ live |
| Page Builder + typed blocks (87 pages converted) | ✅ live |
| Save draft → Publish → GitHub → live | ✅ live (tested end-to-end) |
| Enquiries (CRM list) + Page Builder | ✅ live |
| Reports (range, KPIs, chart, CSV) | ✅ live (fills after Supabase migration) |
| **Settings buttons contrast + session-expiry sign-in bounce** | ✅ **fixed this session** |
| **Design system spec** (mockup boards ingested → `docs/design/DESIGN-SYSTEM.md`) | ✅ **done** |
| All views converted to design-system look (light content, KPI cards, pills) | 🔲 D0 |
| Pages **management** (add/import/status/SEO) | 🔲 B1 |
| Live Chat (visitor + agent console), Header/Footer/Global Sections, Galleries, Image Optimization, Schema, WhatsApp module, Integrations + connectivity checks | 🔲 placeholders |
| CRM Control Room (dashboard, import/export, full tracking) | 🔲 B7 |
| Runtime backup import/export | 🔲 B3 |

**Pages vs Visual Builder (today):** both open the same combined editor screen.
**B1 splits them:** *Pages* = management of all 87 pages (list, add, import, status,
SEO, duplicate, delete-with-redirect); *Visual Builder* = the section editor.

---

## Decisions required (approval gate 0)

- **D6 — WhatsApp number: RESOLVED → +92 322 4200168** (user statement
  2026-09-29). Note: site currently hardcodes **4000768** (230 places) and an
  earlier message said **4200768** — B2 will replace all with 4200168 from the
  single Settings source; one final visual confirm before the global replace.
- **D7 — WhatsApp Cloud API (Meta): treated as YES** (“mata” = Meta read) —
  outbound enquiry/quotation alerts; wa.me stays customer-facing. Confirm in chat.
- **D8 — AI providers: Claude confirmed** (“claude”); Codex + Hermes optional
  extras (adapter supports all three; enable whichever keys you add).
- **D10 — Design authority:** the attached mockup boards, transcribed into
  `docs/design/DESIGN-SYSTEM.md`, govern all admin view design (sidebar = §29,
  already built; content areas = light theme per spec).
- **D9 — Hosting connectivity.** For the connectivity verifier: Hostinger check =
  DNS lookup only (D1 keeps Hostinger DNS-only); confirmation not needed unless
  you also want a Hostinger API module.

---

## D0 — Design System Conversion + Page Builds · *first build phase*

**Goal:** every admin view looks like the approved mockup boards (light content,
KPI cards, pills, blue primary actions) and the pending pages get built on top.

Spec: **`docs/design/DESIGN-SYSTEM.md`** (tokens, components, view matrix).

### Deliverables
1. **Light content theme:** `.wx-view` areas switch to `--panel #fff` on `#f4f6fa`,
   dark headings, borders `#e6e9f2` — sidebar stays navy (§29). Sign-in gate keeps
   its dark style. Kill remaining dark-Card overrides.
2. **Component kit CSS** (one file `admin/css/wx-components.css`): KPI card w/
   icon tile + delta chip, filter bar, status pills (9 colors), pagination,
   buttons (blue primary / white secondary), form controls + toggles, kanban
   columns, chat layout, activity feed, status-dot rows.
3. **View-by-view conversion** following the matrix in DESIGN-SYSTEM §4:
   Dashboard (CRM style) → Reports → Enquiries → Leads kanban (board 2) →
   Quotations table (board 1) → Invoices → Clients → Projects grid →
   Media Library folders → Settings vertical tabs → System status board.
   (Live Chat = B5.1 build, styled with kit from day one.)
4. **Regression:** all existing functionality keeps working (nav, publish,
   reports CSV, collapse groups) — visual only.

### Acceptance gate (D0)
- Side-by-side each converted view vs its mockup: same layout, KPI positions,
  pill colors, button hierarchy.
- `tools/smoke.mjs` green; no dark-on-dark or invisible text anywhere;
  contrast spot-check (WCAG AA) on pills/buttons/links.
- Your “done ✅” on the preview.

---

## B1 — Page Management System (87 pages) · *priority*

**Goal:** Pages becomes the control room for every page; Visual Builder is the editor.

### Deliverables
1. **Pages list view** (`view-pages`, `cms-pages?action=list` v2)
   - All 87 pages: title, slug, type (service/location/insight/project/…), status
     (Published / Draft-changes-pending), SEO score (title+desc+canonical+OG present),
     sections count, last published (GitHub commit time), open-editor / view-live links.
   - Search box + status filter + type filter; sortable columns.
2. **Add Page wizard** (blueprint §4): Step 1 type → Step 2 template donor →
   Step 3 content (title/slug/hero placeholder) → Step 4 SEO → Step 5 Preview → Publish.
   Backend: `cms-pages?action=create` extended with `template` presets.
3. **Page import system**
   - `cms-pages?action=import&slug=` — re-split a live page into blocks+meta
     (promotes `tools/blocks-convert.py` logic to a server module `_page-split.mjs`
     shared with the offline tool; identity validation required before overwrite).
   - Import external HTML: paste/upload HTML → validate (main-element required,
     scripts same-origin only) → register page.
   - “Re-sync from live” per page (discard local drafts, rebuild from current HTML).
4. **Page actions:** duplicate (new slug + donor copy), archive (hide from sitemap,
   keep file), delete with redirect (exists — surfaced in list UI).
5. **Visual Builder entry:** editor deep-link `?page=/slug/` opens straight into the
   builder; sidebar Visual Builder = “resume last edited”.

### API
`GET list|get` · `POST save|publish|create|import|resync|duplicate|archive|delete`

### Acceptance gate (B1)
- 87 pages listed with correct status/SEO columns; search+filters work.
- Wizard creates a page end-to-end (draft → preview → publish → live URL).
- Import of a live page reproduces it byte-identical (identity check) before any edit.
- Duplicate produces an independent page; delete inserts redirect row.

---

## B2 — WhatsApp API (number per D6/D7)

### Deliverables
1. **Settings → WhatsApp**: number, greeting text, off-hours message, admin notify
   toggle. Single source of truth (blueprint §23) — header, footer, floating button,
   contact page all read it (replace the 230 hardcoded occurrences with
   `assets/js/site-config.js` values, published via `cms-settings`).
2. **wa.me click-to-chat** everywhere (already present; re-pointed from settings).
3. **Cloud API outbound (if D7 approved):** `netlify/functions/whatsapp-send.mjs`
   — server-side Graph API call (token env `WHATSAPP_TOKEN`, phone id env),
   used by: new-enquiry admin alert, quotation-approved notification.
   Template messages only (Meta policy), rate-limit + idempotency key.
4. **Inbound (phase 2 of B2):** webhook endpoint `whatsapp-webhook.mjs` → creates/updates
   enquiry in CRM with source=whatsapp. Verify HMAC (`X-Hub-Signature-256`).

### Acceptance gate (B2)
- Number editable in Settings → updates all site touchpoints after publish.
- Test alert: create enquiry → admin WhatsApp received (or toggle off gracefully).
- Webhook (if enabled) creates a CRM row; invalid signatures rejected.

---

## B3 — Runtime Backup / Import / Export

**Goal:** never depend on manual exports; any point-in-time restore.

### Deliverables
1. **Export** (`cms-backup?action=export&scope=all|cms|content|media`)
   - JSON dump of all CMS tables (Supabase REST), `content/pages/**` (drafts),
     vercel.json redirects, settings row; media **manifest** (URLs+metadata).
   - Streams as single `.json` (zip when media binary included).
2. **Scheduled GitHub backup:** nightly `cms-backup?action=snapshot` committing
   `backups/YYYY-MM-DD.json` to a `backups` branch (keeps 14 days, oldest pruned).
3. **Import / restore** (`cms-backup?action=import`)
   - Upload JSON → schema validation → **dry-run diff preview** → confirmed apply;
     every import writes an audit-trail entry.
4. UI: improve existing **Backups** view — snapshot list, Download, Restore,
   Export-now, Last-backup status on System Health.

### Acceptance gate (B3)
- Export downloads a valid JSON that passes `import --dry-run` with 0 errors.
- Snapshot branch shows dated commits; retention prunes at 14.
- Restore of a dry-run-tested file reproduces CMS rows (tested on a sandbox page).

---

## B4 — Integrations Hub + Connectivity Verification (Settings → Integrations)

**Goal:** one place to connect AI + business services **and to see exactly what is
connected, what is broken, and what is missing**.

### B4.0 — Connectivity Verification System (new in v1.1)
“Where am I missing a connection?” — a status matrix, one row per service:

| Service | Check performed | Needs |
|---|---|---|
| **GitHub** | authenticated API ping + branch exists + write probe (issue a test blob) | `CMS_GITHUB_TOKEN` etc. |
| **Supabase** | REST ping + `cms_users`/settings tables exist + migration fingerprint | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Vercel** | deployment status via API + domain bound | `VERCEL_TOKEN`, project id |
| **Hostinger** | DNS resolution of woodex.com.pk → expected target (A/CNAME) | none (D1: DNS only) |
| **Resend / WhatsApp / AI keys** | provider ping (`/v1/messages`, `/v1/models`, …) | per-provider key |

- `GET cms-connect?action=check` runs all probes in parallel → per-service
  `{ok, latency, detail, missing_env:[…], fix_hint}`.
- UI: green/amber/red cards + **“Fix”** deep-link (which Vercel env var, which
  migration step) — turns checklist errors into one-click diagnostics.
- Runs automatically on System Health load and on demand (“Re-check connections”).

### B4.1 — Integrations model
- Table `integrations`: provider, name, api_key_enc, config jsonb, enabled,
  updated_by, updated_at. Key write-only from UI (masked `••••1234` display),
  service-role only on server.

### B4.2 — Providers (initial)
- **Claude (Anthropic)** · **Codex (OpenAI)** · **Hermes** — content drafts, FAQ
  generation, reply suggestions (adapter `_ai.mjs`, provider selected from enabled
  integrations; output lands in editor fields, never auto-published).
- **Resend** (D5) — quotation/invoice email.
- **GitHub / Vercel / Supabase / Hostinger** — read-only status (B4.0).

### B4.3 — Site Control center (Settings upgraded)
- One screen: contact/social/estimator rates (today) **+** WhatsApp (B2) **+**
  integrations & connectivity (B4.0) **+** publish switches (maintenance mode,
  cookie notice, chat widget on/off) — everything that controls the website,
  each with last-saved time + Publish-to-site action (existing pipeline).

### B4.4 — Webhooks out
- Generic webhook URL + event list (enquiry.created, quotation.sent,
  page.published) → HMAC-signed POST.

### Acceptance gate (B4)
- Connectivity matrix renders all services with correct green/red + missing-env hints.
- Save key → test → green; key never visible again in any response.
- One AI surface (meta description) generates into the Pages SEO form end-to-end.
- Webhook fires on enquiry.created with valid signature (verified by test receiver).
- Site Control publishes a switch (e.g., chat widget off) to the live site.

---

## B5 — Blueprint modules (build order)

| # | Module | Notes |
|---|---|---|
| B5.1 | **Live Chat — full agent console** | **Visitor side:** widget on every public page, offline → WhatsApp fallback. **Agent side (dashboard):** conversation list w/ unread badges, thread view, **agent replies** (live via Supabase Realtime), canned replies, visitor context (page, location, history), sound+desktop notification on new message, after-hours auto-reply, transcript saved to CRM timeline. Tables: `chat_channels/messages/agents` (migration add-on). |
| B5.2 | **Header & Navigation builder** | Controls per blueprint §8; writes header include used by publish pipeline. |
| B5.3 | **Footer editor** | Same pattern; global footer section. |
| B5.4 | **Global Sections** | Reusable CTA/banner sections referenced by pages (block type `global_ref`, resolved at publish). |
| B5.5 | **Galleries + Image Optimization** | Media folders/albums; sharp/AVIF pipeline via `cms-media` extension + nightly optimize job. |
| B5.6 | **Schema manager** | Per-page JSON-LD types (FAQ, Service, LocalBusiness, Article) rendered into `<head>` at publish; validation on save. |
| B5.7 | **Activity** | Activity feed from audit_trail (§28), filtered. |

Each module = its own approval gate (build → preview → “done ✅” → next).

---

## B6 — Backend hardening (continuous, parallel)

1. **API envelope:** consistent `{ok|error, data}` + machine error codes.
2. **Rate limiting:** IP+route buckets for public endpoints.
3. **Audit coverage:** every mutation writes `audit_trail`.
4. **Secrets hygiene:** keys in Vercel env or `integrations` table — never repo;
   rotation checklist at go-live (exposed setup credentials included).
5. **CI smoke suite:** `tools/smoke.mjs` (syntax, 86-page render identity, block
   identity, nav/TITLE integrity) + GitHub Action on push.
6. **Health enrichment:** System Health gains CMS API, Media, Publishing,
   Migrations rows (§27) + B4.0 connectivity matrix.
7. **Sitemap automation:** regenerated on every publish.

---

## B7 — CRM Control Room · *new in v1.1*

**Goal:** one screen to run the whole client lifecycle: lead → estimation →
quotation → invoice → payment, with full control (import/export, tracking, filters).

### B7.1 — CRM Dashboard
- Funnel KPIs: Enquiries → Qualified Leads → Estimations → Quotations → Invoices →
  Paid (counts + value per stage, conversion % between stages).
- Pipeline board (drag or status menu), value-weighted (PKR), per-user ownership.
- Follow-ups due today, visits this week, overdue invoices — action-required rail.
- Cohort strip: response time avg, win rate, avg quotation → invoice lag.

### B7.2 — CRM Import / Export
- **Export:** CSV/JSON for leads, clients, quotations, invoices (filter by date,
  status, source); one-click “full CRM backup” routed through B3 snapshot.
- **Import:** CSV upload per entity → column mapper (detect headers) → validation
  preview (bad rows listed with reasons) → dry-run diff → commit; duplicates
  matched on email/phone; every import logged to audit_trail.
- Round-trip guarantee: export → import → identical rows (tested in gate).

### B7.3 — Tracking system (linked lifecycle)
- **Lead tracking:** status timeline (New → Contacted → Qualified → Lost/Won),
  stage history with who/when, source attribution (form, WhatsApp, chat, call),
  notes + attachments, SLA timer (first response).
- **Estimation tracking:** estimator submissions linked to leads; saved
  configurations re-price with current rate card; send-for-quote button.
- **Quotation tracking:** statuses (Draft → Sent → Viewed → Accepted → Rejected →
  Expired), version history (revisions keep old PDFs), reminder schedule,
  link-view tracking (opened at).
- **Invoice tracking:** Draft → Sent → Partial → Paid → Overdue; payment log
  (date, method, reference); auto-overdue flagging; balance on client card.
- Every stage change writes CRM timeline entry; all four entities share
  `client_id` + `lead_id` joins (Appendix A).

### B7.4 — Client database (Appendix A) surfaced in UI
- Client card: contact, addresses, linked leads/quotations/invoices, communications
  (WhatsApp/chat/email log), documents, lifetime value.

### Acceptance gate (B7)
- Import a 50-row lead CSV (incl. 3 intentionally bad rows → clear errors) → commit →
  export → row count and values match.
- Advance a lead through all 5 stages → timeline shows 5 entries with authors.
- Quotation: send → mark viewed → accepted → invoice auto-created pre-filled →
  mark paid → client card lifetime value updates.
- Dashboard funnel numbers reconcile with list views (same filters).

---

## Suggested build order & gates

```
D0 Design conversion (mockups) ──► B1 Pages management ──► B3 Backup/Export
        │                                   │                      │
        │                                   ▼                      ▼
        │                            B7 CRM Control Room    B4 Integrations + connectivity
        │                                   │                      │
        └──► B5.1 Live Chat (parallel)      └──► B2 WhatsApp (D6=4200168, D7=Meta)
                    B5.2–B5.7 after B1          B6 continuous ──► Deployment readiness
```

- **Gate rule (unchanged):** each B-phase ends with your test on the preview +
  “done ✅” before the next starts. Deployment to Vercel stays the final step
  after your overall approval.

---

## Appendix A — Client database design (v1.1)

```
clients
  id uuid pk · company_name · contact_name · email · phone · whatsapp
  type (individual|company) · billing_address · notes · source
  status (active|archived) · lifetime_value numeric · created_at · updated_at

leads                          (B7.3)
  id · client_id fk? · enquiry_id fk? · title · status (new|contacted|
  qualified|won|lost) · source (form|whatsapp|chat|call|referral) ·
  value_estimate numeric · owner (username) · next_followup_at ·
  first_response_at · created_at

estimator_submissions
  id · lead_id fk? · service · tier · area · config jsonb ·
  price_quote numeric · status (received|quoted|converted)

quotations
  id · lead_id fk? · client_id fk? · number (WX-Q-YY-NNN) ·
  status (draft|sent|viewed|accepted|rejected|expired) · items jsonb ·
  subtotal · tax · discount · total PKR · pdf_path · send_at ·
  view_at · respond_at · valid_until · template_id · version int

invoices
  id · quotation_id fk? · client_id fk? · number (WX-I-YY-NNN) ·
  status (draft|sent|partial|paid|overdue) · items jsonb · total ·
  paid_amount · due_date · payments jsonb [{date, amount, method, ref}] ·
  pdf_path · sent_at · paid_at

crm_timeline                   (single feed for all entities)
  id · entity (lead|quotation|invoice|client|chat|enquiry) · entity_id ·
  event (created|stage_changed|sent|viewed|reminder|payment|note|…) ·
  from_status · to_status · actor · message · created_at

communications_log
  id · client_id · channel (whatsapp|chat|email|call) · direction ·
  summary · ref_url · at · actor

chat_channels / chat_messages  (B5.1)
  channels: id · visitor_id · page · status (open|waiting|closed) ·
            assigned_to · unread_admin · created_at · last_msg_at
  messages: id · channel_id · from (visitor|agent) · body ·
            agent_name · read_at · created_at
```

Indexes: `leads(status, owner)` · `quotations(status)` · `invoices(status, due_date)`
· `crm_timeline(entity, entity_id)` · `clients(phone)`/`(email)` (import matching).

---

## Deployment readiness — "ready to upload" (Vercel + Hostinger)

**Hosting model (D1):** site runs on **Vercel**; **Hostinger = DNS only**.
Checklist executed at go-live (after approval, with B3 backup in place):

1. **Vercel project `woodex` (team `marketig`):** connected to the repo,
   branch `arena/01a0e87c-marketingwoodex` (promote to `main` only if you want
   auto-deploys), 9 env vars set in **all three environments**, `COMPLETE-MIGRATION.sql`
   run (step ③ of B-verification), production domain bound.
2. **Hostinger DNS records** (hPanel → Domains → woodex.com.pk → DNS/Nameservers):

   | Type | Name | Value |
   |---|---|---|
   | A | @ | `76.76.21.21` (Vercel apex) |
   | CNAME | www | `cname.vercel-dns.com` |
   | (keep) | @ MX/email | existing records untouched |

   Then Vercel → Domains → add `woodex.com.pk` + `www.woodex.com.pk` →
   SSL auto-issues (wait for “Valid”).
3. **Pre-cutover smoke:** `tools/smoke.mjs` green, home + 3 deep links + admin
   login on the *.vercel.app URL, CMS publish round-trip on production.
4. **Cutover:** change Hostinger A/CNAME → wait TTL → HTTPS works → old-site
   301 map active (old 16 URLs per sitemap cutover list) → GSC resubmit sitemap.
5. **Post-cutover:** credential rotation (Supabase secret, GitHub PAT, Vercel
   token, admin pass) — the chat-exposed setup secrets included.
6. **Rollback:** DNS reverts to previous values; old site stays at Hostinger
   until you delete it.

## Go-live linkage (from MASTER-PLAN)

Renames/keeps: media metadata columns, project publishing columns, `cms_users`,
role testing, test publish, settings publish, desktop/mobile dashboard test,
public page tests, **credential rotation**, final acceptance — executed with B3
(backup safety net in place first) immediately before cutover.

---

## Changelog

- **v1.0** — initial: B1 page management, B2 WhatsApp, B3 backup, B4 integrations,
  B5 modules, B6 hardening; decisions D6–D8.
- **v1.1** — + B4.0 connectivity verification (GitHub/Supabase/Vercel/Hostinger
  missing-connection detector), B4.3 Site Control center, B7 CRM Control Room
  (dashboard, CSV import/export, lead/estimation/quotation/invoice tracking),
  B5.1 expanded to full agent console, Appendix A client DB design, D9.
  Recorded fixes: settings button contrast pass + 401 sign-in bounce.
- **v1.2** — + D0 design-system conversion driven by approved mockup boards
  (spec in `docs/design/DESIGN-SYSTEM.md`, view build matrix), deployment
  readiness section (Vercel + Hostinger DNS cutover checklist), D6 resolved
  to +92 322 4200168, D7/D8 recorded, repo organized under `docs/`.
