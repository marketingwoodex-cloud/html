# Woodex: Live Audit and Master To-Do Plan
**Date:** 30 Sep 2026 · **Live site:** https://woodex.com.pk (the woodex-live package) · **Inputs:** live check plus the owner's review of 15 screenshots

---

## 1. Live status: what I checked on woodex.com.pk

| Check | Result |
|---|---|
| Home page and sitemap | ✅ Live. The sitemap lists all 87 pages at the correct addresses on `woodex.com.pk`. |
| `/_private/` | ✅ 403 Forbidden, so it's protected. |
| Old WordPress (`/wp-login.php`) | ✅ Gone (404). |
| Leftover files (`opencode.json`, etc.) | ✅ Not present (404). |
| 404 page | ✅ Custom page, with the WhatsApp widget. |
| **`/admin/`** | 🔴 **Still shows "Set up Woodex Admin".** The admin is not installed yet. Leads, quotes and backups don't work until it is. |
| PageSpeed in the admin | 🔴 "Request failed". This was seen on the local admin, and it needs a Google API key (see P7). |

---

## 2. Bugs found in the screenshots (fix first)

| # | Page / section | Problem | Cause / fix |
|---|---|---|---|
| B1 | Contact: map | Map shows "This content is blocked". | The old `maps?q=…&output=embed` link is being blocked. Switch to the official `/maps/embed?pb=` link, add a static fallback image, and make the address card sit over the map properly (it currently overlaps the dark band). |
| B2 | WhatsApp floating button (every page) | A green ring with a tiny, almost invisible icon. | The site's global CSS shrinks the button's icon. Fix its size and colour, and show the proper WhatsApp green icon. |
| B3 | Contact: 4 info cards | The Email card is dark and overlaps its neighbours. The hover state sticks, and the heading text is too big for the card. | Rebuild as an even 4-column grid with a light style, hover lift only, and headings sized to fit. |
| B4 | Renovation: service menu | The browser's native scrollbar is visible inside the section (circled). | Use a hidden scrollbar with a fade, or better, a scroll-driven list (see F2). |
| B5 | "Talk to Woodex" block (all service pages) | The contact card repeats the address and hours (marked ✗), and the layout is unbalanced. | Rebuild the section (F4). |

---

## 3. Owner feedback grouped into projects

### P0: Go-live completion (urgent, owner with my guidance, about 30 min)
- [ ] P0.1 Install the admin at `/admin/` (database `u128159657_woodex`, owner account), then turn on 2FA.
- [ ] P0.2 SMTP email (`info@woodex.com.pk`) and send a test.
- [ ] P0.3 Cron job every 15 min, for scheduled posts and automatic backups.
- [ ] P0.4 Cloudflare Turnstile keys, for form spam protection.
- [ ] P0.5 Google Search Console: submit `sitemap.xml`.
- [ ] P0.6 Smoke test: a form on your phone creates a CRM lead and an email alert.
- [ ] P0.7 After 2–4 stable weeks, remove the `old-wordpress` folder and the old databases (keep the backup).

### P1: Frontend bug fixes (B1–B5 above)

### P2: Frontend motion and sections (renovation first, then every service page)
The owner's reference for "good animation" is the **"Practical answers" / "3D Visualization: FAQ"** section.
- [ ] F1 **Scroll-reveal system** on all pages: fade and rise, staggered cards, image clip reveal, and counters. Respects "reduce motion".
- [ ] F2 **Renovation "Every renovation service"**: replace the scroll box with a scroll-driven sticky list where the image changes per sector.
- [ ] F3 **"Built around occupancy" (10-step process)**: auto-sliding steps with a progress bar. The **image on the left changes with each step**, with a slide or fade animation.
- [ ] F4 **"Start with what exists / Talk to Woodex"**: redesigned contact section, used on **all service pages**. Balanced 2 columns, no duplicated info, a proper form that sends to the CRM, and a WhatsApp button.
- [ ] F5 **"Featured 3D Work"**: auto-sliding carousel (pauses on hover, swipe on mobile). Applied to the similar sections on other pages.
- [ ] F6 **Home hero**: shorter slide time (about 5 s), **more slides** (one per main service), a progress indicator, and pause on hover.
- [ ] F7 **Home "Common questions"**: redesigned using the owner's reference (dark style with bordered accordion cards, an image and a CTA).
- [ ] F8 **Home "Selected studies"**: **filter tabs** (All · Residential · Commercial · Renovation · Architecture · 3D) with animated filtering and an improved card design.
- [ ] F9 **Home "6 services"**: cards animate up in sequence, matching the attached "6 services" reference.
- [ ] F10 Same-pattern sections on the other service pages get the same treatment.

### P3: v26 theme adoption (the owner likes v26's header, footer, colours and buttons)
- [ ] T1 v26 colour palette, button styles, radius and shadows as site-wide design settings.
- [ ] T2 v26 header (pill navigation plus a "Get a quote" button) and mega menu.
- [ ] T3 v26 footer.
- [ ] T4 Theme polish: spacing rhythm, section alignment, less text per section.
> Note: this replaces the earlier rule of keeping the old colours. The owner must confirm.

### P4: Section and template library (builder and Admin → Section library)
- [ ] L1 Convert the **best 50 sections from v26** into builder templates (hero, services, process, FAQ, projects, testimonials, CTA, contact, stats, team, pricing, etc.).
- [ ] L2 **Hero templates**: pick a hero from any page and apply it to another. **Import and export** as a JSON file.
- [ ] L3 Improved section and element import (paste from a file, a thumbnail preview, category filters).
- [ ] L4 All templates available in both the **page builder** and **Admin → Section library**.

### P5: Header, footer and mega menu editor
- [ ] H1 Three tabs (**Header · Footer · Mega menu**), each with a **live preview**.
- [ ] H2 Changes apply immediately across all pages, with undo and a backup.

### P6: Admin starter templates (fill the empty screens)
- [ ] S1 FAQ groups: starter groups (General, Renovation, Fit-out, 3D, Pricing).
- [ ] S2 Team: starter profile templates.
- [ ] S3 Quotation templates: 3–4 ready templates (Interior, Fit-out, Renovation, 3D).
- [ ] S4 Invoice templates.
- [ ] S5 Projects: sample project plus a template.

### P7: Data, backups and settings
- [ ] D1 **Backups**: import (upload a backup file and restore it) plus export.
- [ ] D2 **Database** import and export (full, or per area: leads, quotes, content).
- [ ] D3 **Clients tracking**: monthly report plus CSV/Excel import and export.
- [ ] D4 Improved **General / Integrations / System** settings pages.
- [ ] D5 **Fix PageSpeed**: add a Google PageSpeed API key field, show a clear error, and retry.

### P8: Integrations and access
- [ ] I1 **WhatsApp**: improve the floating widget, message templates per page, click tracking in the CRM, and the "open chat" step after a form is sent.
- [ ] I2 **Sign in with Google (Gmail)** for the admin (OAuth, email allow-list, 2FA still respected).
- [ ] I3 **Woodex AI Agent connector (MCP)**: the safe replacement for AgentBridge. Scoped tokens, no code execution or raw SQL, drafts, and an activity log.

---

## 4. Suggested order

| Phase | Content | Why this order |
|---|---|---|
| **1** | P0 go-live completion + P1 bug fixes | The live site must capture leads correctly first. |
| **2** | P3 v26 theme (colours, buttons, header, footer) | Everything later builds on the final look. |
| **3** | P2 motion and sections (renovation, home, service pages) | Visible improvement for visitors. |
| **4** | P5 header, footer and mega menu editor | Needs the v26 header and footer from phase 2. |
| **5** | P4 50 templates + hero import and export | Uses the finished theme. |
| **6** | P6 admin starter templates | Quick wins. |
| **7** | P7 backups, database, clients, settings, PageSpeed | Data safety. |
| **8** | P8 WhatsApp, Google sign-in, AI Agent (MCP) | Integrations last. |

Each phase follows the same routine: questions, then build, then test, then your review, then a new deploy zip.

## 5. How each phase ships
1. Built and tested in `frontend-v1/` (automated browser tests on desktop and mobile).
2. A new `deploy/woodex-live-vX.zip`, plus a short list of the files that changed.
3. Upload to `public_html`, extract, and tick **Overwrite**. The admin database and `_private` data are kept.

## 6. Next plan: owner requests added on 30 Sep 2026 (after Phase 6)

### P9: Quotation system v2
- Single-page PDF: fixed header and footer, with the body in between. When the items table grows, it continues on page 2, 3 and so on, repeating the header and footer.
- A scope-of-work template for every service: 3D visualization, interior design (residential and commercial), renovation, turnkey, fit-out, architecture, and more.
- Decoration item templates: typing "paint" suggests paint work lines. The same goes for wood, glass, ceiling, flooring, electrical, plumbing and others.
- Send the quote by email or WhatsApp.

### P10: Live chat agent (whole website)
- A chat widget on every page, answering from the site's complete information (services, prices, process, FAQs, contact details).
- Quote replies: answers any question about a Woodex quotation. It checks the client's phone and quote number first.
- Hands over to a human and saves each chat as a lead.

### P11: WhatsApp agent training
- The same knowledge base as live chat, plus an admin screen to train it (Q&A pairs, tone, and topics it must not answer).

### P12: Client integration updates
- Automatic WhatsApp and email updates to clients at each stage (quote sent, site visit, work started, handover).

### P13: Complete SEO system (Yoast-style), page by page
- For every page, project, insight and new page: focus keyword, SEO score, readability, title and description preview, schema, OG image, canonical, noindex.
- Also: sitemap, redirects and broken-link checks.

### P14: Insights blog templates + AI SEO writer
- Article templates, an AI writer that aims for a good SEO score, and blocks: before/after image comparison, gallery, quote, table, FAQ, CTA.

### P15: Responsive + PageSpeed
- Check the full site on phone, tablet and desktop, fix what breaks, and aim for 90+ PageSpeed on mobile and desktop.
- **Done (30 Sep 2026).** Mobile 91–97 on every template, desktop 98–99, accessibility 97–100, SEO 100 (local Lighthouse). WebP + srcset images, per-page critical CSS, mobile layout fixes on all 87 pages, Admin → Speed dashboard, Reconnect-database screen. Package: `deploy/p15/woodex-live-p15-full.zip` (steps in `deploy/p15/README-UPLOAD.md`). Task list: `P15-TODO.md`.

(Section import and v26 templates were done in Phase 5; "use a section block on any page" is covered by the builder's global sections.)
