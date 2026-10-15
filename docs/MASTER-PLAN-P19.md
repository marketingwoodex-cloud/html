# Woodex — Master Plan P19: Revision & bug-fix round
Source: user feedback of 5 Oct 2026, with 8 screenshots. Rule: **improve existing modules, do not overwrite them**. Review after each module.
Security: the admin login that was posted in chat is **not stored anywhere**. Change that password after go-live.

## Priority 1 — Bugs (fix first)
| # | Problem | Fix |
|---|---|---|
| B1 | Live chat not replying | Trace the AI reply path (Settings → AI key / local endpoint). Add a fallback auto-reply when AI is down. Show the AI status in the Inbox. Test full flow: visitor → AI → team takeover. |
| B2 | "Live chat" button always shows on the dashboard | Admin: hide by default, open from the top-bar chat icon, add an × to hide. Public site: unchanged. |
| B3 | Coming-soon mode ON not working | Fix the guard for PHP/Hostinger and browser cache (no-store headers). Logged-in admins bypass it. New design (ref: countdown page): Woodex navy, countdown, email "notify me", WhatsApp + social links. |
| B4 | Enquiries → Add lead: data does not save / "Write what happened" error; no draft when the box is closed | Make the note optional. Show a clear error. Auto-save a draft (local) and restore it on reopen. |
| B5 | Quotation "PDF blocks" switches/reorder not reflected in the preview; switches look off; preview footer missing | Wire blocks → live preview instantly. Fix the switch styling. Add a "Summary" block with show/hide. Show the footer strip in the preview. Test the complete quote flow. |
| B6 | Clients page shows 2025 dates / stale data | Fix the date source (created vs. last activity); refresh after edits. |
| B7 | Images not refreshing after replace | Cache-busting `?v=` on replaced images across the site + admin. |

## Priority 2 — One central client database
- Every lead, chat, WhatsApp contact, quotation, invoice and project links to **one client record** (match by phone/email).
- Client page = full timeline (chats, WhatsApp, quotes, invoices, payments, notes).

## Priority 3 — Re-organise the admin (same feature in one place)
- **Settings = one page with tabs:** General · Business info · Integrations & APIs · Users & roles · Security · Backups · Maintenance & error pages · Files · Database · Activity log · System check. Sidebar shows only "Settings".
- **WhatsApp = one page with tabs:** Inbox/Contacts · Offers · Automation · Templates · Connection.
- Menu groups: Dashboard · Sales · Support · Website · Content · Marketing · Settings.

## Priority 4 — Feature improvements
| # | Area | Plan |
|---|---|---|
| F1 | Pipeline | Better cards (value, days in stage, next follow-up, owner avatar), stage totals, filters (owner/line/date), quick actions (WhatsApp, call, quote), drag + won/lost reason, fit-to-screen (no long scroll bar). |
| F2 | Quotation design | Footer exactly as the approved design, Summary on/off, template logic (Single / Project / BOQ) checked end to end. |
| F3 | Team | Real profiles: role/department, phone, email, social, order, featured, linked to a user account (optional), "show on site" pages. |
| F4 | Testimonials | Explain + improve: choose the pages where they show, a live preview, import from Google reviews (manual paste), star/photo layout. |
| F5 | FAQ | FAQ groups per page (Home, Services, each service, Contact…), assign a group to pages, FAQ schema auto-added for SEO. |
| F6 | Services | Show the "new service / import" option. Service pages from a template. |
| F7 | Forms | Form builder: fields, required, which page, alert email/WhatsApp per form, entries go to Enquiries. Fix the "no email set" default alert. |
| F8 | Estimator | Estimator templates (rates per room/sector), duplicate, assign to page. |
| F9 | Page templates | More full-page templates (Service, Project/case study, City, Landing, About, Contact) built from real pages + "Save page as template". |
| F10 | Settings & APIs design | Modern cards with status badges (connected / not set), test buttons, help text for every key. |

## Order
B1–B7 → central client DB → re-organise (Settings, WhatsApp) → F1 Pipeline → F2 Quotation → F3–F7 content → F8–F10 → QA → ONE full P19 zip in `deploy/p19/`.
