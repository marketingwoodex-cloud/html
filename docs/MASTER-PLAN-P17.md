# Woodex: Phase 17 master plan (for review before building)

Base: `deploy/p16/woodex-live-p16-full.zip`. Rule kept from P16: **improve existing modules, don't rewrite them; never overwrite live data.**

## Decisions (you skipped the questions, so these are the recommended defaults; change any)
| # | Question | Default |
|---|---|---|
| D1 | Login `marketing.woodex@gmail.com` | Auto-created **only if that email doesn't exist**, stored hashed, **must change password on first sign-in**. Never overwrites users. |
| D2 | Build order | **Sales system first** (S), then Content (C) |
| D3 | Quotation / invoice design | Build the builder system now; apply **your** templates when you send them |
| D4 | Booking | **Website booking + admin calendar** (site visit / consultation slots) |
| D5 | WhatsApp automation | **One-click prepared messages** by default; a per-type switch to make any type automatic once Cloud API templates are approved |
| D6 | Delivery | Plan → build in parts → you review each → **one final tested zip** |

---

## Architecture: one master data model (the "single source of truth")
Every sales screen reads and writes the same records, so nothing gets out of sync.

```
Contact/Client (master) ──< Enquiry/Lead ──< Activity (calls, WA, notes, follow-ups, visits)
        │                        │
        │                        └──> Booking (site visit / consultation)
        ├──< Quotation (versions) ──> Invoice ──< Payment (schedule + received)
        ├──< Project (stages, photos, client updates) 
        └──< Messages (WhatsApp / email log, offers, reminders)
```
- **Client master** = one record per person/company (dedupe by phone/email). New vs returning is calculated automatically.
- **Timeline** on every client: all leads, quotes, invoices, payments, projects, messages and bookings in date order.
- **Automation engine** (rules + daily cron): "when X happens / is due → prepare message or task". Handles follow-ups, quote expiry, payment due/overdue, project stage updates, booking reminders.
- **Sync rule:** a change in one place updates the others. For example, quote approved → lead stage "Won" → client type "Active" → project created → invoice draft.
- Built on the existing tables (`wx_leads`, `wx_clients`, `wx_quotes`, `wx_invoices`, `wx_projects`), with safe migrations (only add columns or tables; no data loss).

---

## Your real data → system design (from your sheets and templates, 1 Oct)
**Decisions (questions skipped → recommended defaults, change any):**
| # | Topic | Default |
|---|---|---|
| R1 | Brands / numbering | A **business line** on every lead / quote / invoice: **Furniture · Interior · Project** (from your sheet). Prefix per line: Furniture → **WF-**, Interior & Project → **WI-** (editable in settings). Old WF numbers kept on import. |
| R2 | Quotation types | **3 types:** ① Single-page (your template) ② Project-based (summary + trade tabs) ③ Proposal (scope of work + summary). **Presets:** Fit-out · Renovation · Interior design = project-based with their own default trades. |
| R3 | Billing big projects | **Milestones by %** (e.g. 50 / 30 / 20) → invoices WI-10100-1, -2, -3; **per-trade billing** optional per project |
| R4 | Pipeline | Your words merged: **New lead → Contacted → Meeting / Visit → Proposal / Quotation → Hold → Won / Closed** (+ lost reason) |
| R5 | Old sheets | **Import screen** in admin: upload your Lead-management and Invoice-tracking CSVs; columns auto-matched; preview → import |
| R6 | Where | Keep current menu items; add a **Sales tracker** (sheet-style view) + **Client 360** page |

**Leads (your "Lead Management" sheet) → fields:** date · company · name · contact · designation · location · **lead source** (Client / New lead / Referral / Website / WhatsApp…) · **business line** (Furniture / Interior / Project) · **assigned to** (Abdullah, Nabeel, Imtiaz, Amir… = team users) · **quotation status** (Pending / Proposal-Quotation / Done) · **last contact** · **action/stage** (Visit, Meeting, Hold, Won, Close, Done) · **meeting schedule** (date + time → calendar) · note.
Top counters like your sheet: New lead · Client · Done · Proposal/Quotation · Hold · Won · Meeting, **per month** (month picker = your monthly tabs). Red row = overdue follow-up / closed.

**Invoice tracking (your sheet) → fields:** date · **PO # (client purchase order)** · invoice # · company · total · received · balance (auto) · status (**Paid / Partial / After delivery / Unpaid / Overdue**, auto from payments) · **delivery date** (red when passed and unpaid) · note.
Monthly bar: Total · Paid · Due · invoice count (Jan 2025 example: 3,143,000 · 2,345,000 · 798,000 · 13).

**Quotation & invoice design (your single-page template, redesigned):**
- Header: logo left · document no., address, phones, email, web right (per business line).
- Boxes: **Prepared for** (client, company, contact) · **Project details** (project, site, location) · option & version (e.g. OPTION-1, V-1) · date.
- Table: **Sr · Description · Qty · Unit · Rate · Amount**. Grey **section rows** ("01 Electrical and HVAC", "02 Glass and doors"), numbered items 1, 2, 3 below each; optional long spec paragraph per item.
- Totals: subtotal, discount, tax %, **TOTAL (Rs)**, amount in words (Rupees … lakh … only).
- Terms & conditions, bank details, **signature block (Consultant / Client, "Approved by")**, footer "Phone | Address | Website · Thank you for your business".
- Fixes vs the sample: no "[cite: …]" text, no browser date/URL at the top, page numbers "Page 1 of N" on multi-page.

**Project-based quotation (your "Interior Arch" 10-tab workbook):**
- **Summary page:** Sr · Particulars (trade) · Total area · Per sft · Sub total · Amount (Rs) → e.g. Civil 682,000 · Flooring 1,618,875 · Ceiling 120,000 · Paint 132,125 · Wood 1,187,650 · Glass 416,650 · Curtain & blinds – · Electrical – · Plumbing – · **TOTAL 4,157,300**; approval block.
- **One tab per trade** (Civil, Flooring, Ceiling, Paint, Wood, Glass, Curtain & blinds, Electrical, Plumbing + custom): Item # · Description · Unit · No's · Rate · Amount, with headings like **5.1 Media wall / 5.2 Bed wall / 5.3 Wardrobe**, a spec paragraph, and sub-items (5.1.1 Master bed-01, sft 143 × 1,200 = 171,000).
- Trade totals flow to the summary automatically; empty trades show "–".
- Prints as one PDF: summary first, then one page set per trade.
- **Item library** (saved specs + rates per trade) to build quotes fast.

**New table: Projects** (linked to client + won quotation): project name, site, business line, start / handover dates, stage, contract value, invoiced, received, balance, team, photos, client updates.

## Part S: Sales system (built first)

**S1 Master client database**
- Fields: client type (individual / company / developer / architect), source, city, tags, lifetime value, balance due, first and last project.
- New / returning / active / past status worked out automatically.
- Merge duplicates. Import / export CSV (existing old clients).
- **Client 360 page:** summary cards + timeline + tabs (Leads · Quotes · Invoices · Payments · Projects · Messages · Files).

**S2 Enquiries & leads**
- New fields: **lead type** (new / returning / referral), **project type** (kitchen, office, full home, renovation…), budget range, area (sq ft), city, timeline, priority.
- **Follow-up system:** next follow-up date and time, type (call / WhatsApp / visit), outcome, notes. Edit and reschedule. A "Today / Overdue / Upcoming" list.
- Activity log per lead. One-click "Convert to client + quote".

**S3 Booking system**
- Website form: pick a service, date and free slot → creates a lead + booking and sends WhatsApp/email confirmation.
- Admin calendar (day / week / month), working hours, blocked days, staff assignment, reminders the day before.

**S4 Pipeline**
- Board with drag-and-drop stages (New → Contacted → Site visit → Quote sent → Negotiation → Won / Lost).
- Value per column, probability-weighted forecast, stuck-deal warning (no activity for X days), lost reason.

**S5 Quotations**
- Quotation builder: **sidebar live preview**, sections on/off (cover, scope, BOQ items, payment terms, timeline, terms, signature), item library, options A/B.
- **Template import / export (JSON)**, versioning.
- *Visual redesign waits for your templates (D3).*

**S6 Invoices**
- **New invoice** directly (not only from a quote).
- Payment schedule (advance / stages / final), partial payments, receipts, credit notes, overdue tracking.
- Same number as the quote (WI-10100 rule kept).

**S7 Projects + Client updates**
- Projects linked to the client and the quote. Stages, budget vs paid, photos.
- **Client updates** pull the client's phone and email from the master record. Key-step messages (EN + UR) as before, plus a payment-due step.

**S8 WhatsApp offers + automation**
- Offers target segments (new leads, past clients, quote-not-approved, by city or project type).
- Automation rules list with on/off switches (one-click vs automatic, D5).
- Daily "To send" queue.

**S9 Sales dashboard**
- Funnel (enquiry → lead → quote → won), revenue invoiced vs collected, receivables ageing, follow-ups due, bookings today, top sources, win rate.

**S10 Inbox**
- Link each chat to its client.
- Contact panel shows client history and open quotes / invoices. "Create booking" and "Create quote" from a chat.

## Part C: Content system (after S)

**C1 Section library import**
- Import HTML / JSON / zip.
- **Pick sections from any HTML page** (paste a URL or HTML → click the sections to keep → convert to Woodex blocks).
- Category + tags; preview before saving.

**C2 New-section designer**
- Create a section in the builder from library parts.
- Category and tags below the HTML.
- It appears in the Sections tab immediately (no reload).

**C3 Header & footer builder**
- Colour options (background, text, accent, sticky / transparent).
- Layout presets, logo size, menu / CTA / phone blocks.
- Import / export; updates all pages (rule kept).

**C4–C6 Article, portfolio and city templates**
- One template system for all three:
  - Customise sections (add / remove / reorder).
  - Several templates per type.
  - Import / export.
  - Apply a template to new **and existing** pages (with preview + backup).
  - The AI agent (MCP) can create and update new and old items.
- **C6 also fixes the City pages list showing no pages** (root cause first: the builder connection / page-type detection).

**C7 FAQ groups**
- Reuse one group on many pages ("used on" list).
- Duplicate a group to change it for one page.
- Sync edits to every page that uses it.

**C8 Testimonials**
- A testimonials manager (name, project, city, rating, photo, text).
- **5 testimonial block designs** that pull from it.

**C9 Media library** (TailAdmin "images" reference)
- Grid / list views, folders, drag-drop upload, multi-select bulk actions.
- Filters (type, size, unused), image details panel (alt, size, usage), crop / resize, copy URL.

## Order and review points
S1+S2 → review → S3+S4 → review → S5+S6 (+ your templates) → review → S7–S10 → review → C1–C3 → review → C4–C7 → review → C8–C9 → full audit (like 3.9) → **final zip** `deploy/p17/woodex-live-p17-full.zip` + README + CHANGES.

## What I need from you
1. ✅ Templates received (single-page + project-based). Optional: a sample **invoice** and your **bank details / terms** text.
2. Your **project types** list and **lead sources** if different from: kitchen, wardrobe, full home, office, retail, restaurant, clinic, renovation, architecture, 3D.
3. Booking: working days and hours, visit length, and which areas you visit.
4. Old sheets: no need to send them. You'll import them yourself on the new **Import** screen (preview before saving).

## Decisions received 1 Oct (bookings, project types, lead sources)
- **Business / booking hours:** Mon–Sat, 10:00 am – 7:30 pm (Sunday closed). Site visits / meetings booked in 60-min slots inside these hours; last slot 6:30 pm. Applied to the website footer, contact page, Google schema (`Mo-Sa 10:00-19:30`), WhatsApp widget, AI chat office hours.
- **Project types:** taken from the website's service pages (33 types: residential rooms, house design by size, commercial, fit-out, renovation, architecture, 3D, furniture supply, other).
- **Lead sources (recommended):** Existing client · Referral · Walk-in · Phone call · Facebook · Instagram · Google · TikTok/YouTube · Zameen/OLX · Architect/consultant · Builder/developer · Exhibition/event · Cold call/outreach · Other — plus the automatic website sources (contact form, estimator, 3D brief, fit-out quotes, WhatsApp, live chat).
- **Signatories:** Imtiaz Ahmad (Director, default) · Nabeel Afzal (Marketing Manager). **Banks:** Bank Alfalah – WOODEX INTERIOR (WI docs) · Meezan – WOODEX FURNITURE (WF docs) · JazzCash / Easypaisa +92 321 3656096.
