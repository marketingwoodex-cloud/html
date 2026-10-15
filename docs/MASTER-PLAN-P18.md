# Woodex: Master Plan, Phase 18 (revision of P17)

Source: owner review, 2 Oct 2026, with 12 reference images. The questions were skipped, so the **recommended options** are used (marked ★). Each module is built, tested, then shown to you for review.

| # | Module | Status |
|---|---|---|
| A | Quotations, invoices and PDF | ✅ **Built** (`a1229f9`) |
| A2 | Login button fix + design system (buttons, forms, tables: sort, Show N entries) | ✅ **Built** |
| A3 | Billing pages: Invoices list (status tabs + totals cards), Single invoice view, Create invoice form, **Transactions** + single receipt (ref TailAdmin) | Next |
| A4 | Profile and account: avatar, details, socials, address, password, 2-step, sessions, notifications (refs 3 and 5) | |
| B | Header/footer builder and mega-menu fix | |
| C | Media library 2 | |
| D | Live chat, dashboard chat pop-up and alerts | |
| E | Content: estimator and forms tabs, AI agent tone | |
| F | Page builder: 50 sections, UI kit tab, template export | |
| G | WhatsApp automation (bulk and targeted) | |
| H | System: maintenance mode, error pages, file manager, database | |
| I | UI polish: blog editor (ref 10), Integrations (ref 11), API keys (ref 12) | |

---

## A. Quotations and invoices ✅
- **Totals:** Subtotal → − Discount → + Rent/transport → + Total tax (charged on subtotal − discount + rent) → **GRAND TOTAL** → − Advance → **BALANCE PAYABLE**. Rows appear only when they have a value. Amount in words follows the balance when there is an advance.
- **Blocks per quotation:** Summary of cost, Scope, Items/BOQ, Totals, Terms, Payment details, Signatures. You can drag them, move them with ↑ ↓, or switch them on and off. They are saved with the quotation, and copies and templates keep them. Summary of cost is **optional** (off by default on Single page, on for Project).
- **Invoices** have the same blocks panel. Rent carries over from the quotation; the advance is replaced by real payments.
- **Footer strip:** phone | email | address | website, "Thank you for your business", and a black bar with an angled grey corner and a gold line.
  - Quotation email default: woodexinterior.pk@gmail.com. If an older email was saved before, check **Settings → Quotation**.
- **No browser header** ("10/2/26 … Page 3 of 3"): print margins are set to zero, and our own spacing repeats on every page.
- **Download PDF** button: a real file named by serial number, e.g. `WI-10101-V2-Quotation.pdf`, `WI-10101-Option-2-Quotation.pdf`, `WF-10050-Invoice.pdf`. Print → Save as PDF suggests the same name.

## A2. Design system ✅
- Login: the Sign in button was navy on the dark background, so it was nearly invisible. Now it is **gold with navy text** in dark mode, with a focus ring.
- Buttons: 40px, semibold, soft shadow, gold focus ring; primary navy (gold in dark mode); ghost and solid-danger variants.
- Tables: grey uppercase headers, row hover, **click a header to sort** (numbers, money and dates sort correctly; sort is kept when the list refreshes), and **Show 10/25/50/100 entries**, remembered per screen.
- Forms, cards and badges unified.
- Chat widget redesign (ref 3, Messages-style): moved into module D.

## B. Header/footer builder + mega menu
- Fix: mega-menu text is white on a white background, and there was no way to change it. Add mega-menu colour controls (background, text, hover, columns).
- Turn the Header & footer page into a **builder**: rows and columns, drag elements (logo, menu, button, contacts, socials, text, newsletter), live desktop and mobile preview, presets, and import/export (already exists).

## C. Media library 2
- **Replace picture:** the file keeps the same URL, so every page updates.
- Auto-optimise on upload: WebP + 3 responsive sizes (480/960/1600) + `srcset`, keeping the original. Bulk "optimise all"; alt-text editing; shows where each file is used.

## D. Chat and alerts
- A dashboard chat icon with a badge. When a client writes, a **chat pop-up opens** (with a hide button), plus sound and a desktop alert.
- Chat extras: images, files, **voice notes** (recorded in the browser), emoji, typing status. Clean sidebar layout like ref 7.
- Alert centre redesign: one feed for leads, chats, bookings, payments and overdue items, with per-type sound and email settings.

## E. Content
- New **Estimator** tab (rates, items, formula, preview) and **Forms** tab (fields, where submissions go, auto-reply).
- AI agent tone: **professional designer, not chatty**; **never quotes prices** (it offers a site visit or quotation instead); office hours **Mon–Sat 10:00 am – 7:30 pm**.

## F. Page builder
- Section library goes from 12 to **50 complete sections** in categories.
- Left panel tabs: **Sections | UI kit | Templates | Images**. Page **template export/import**.

## G. WhatsApp automation ★
- **Audiences:** filter by business line, stage, city, tag, last contact, or client vs. lead; save a filter as a segment.
- **Campaigns:** Meta-approved template, then audience, then send now or schedule. Sending is throttled with a daily cap and respects opt-outs (STOP).
- **Auto flows:** new lead → welcome; quote sent → follow-up after 2 days; invoice due → reminder; booking → reminder the day before.
- Reports show sent, delivered, read and replied.

## H. System ★ (safe mode)
- **Maintenance mode:** one switch. Visitors see the maintenance page; signed-in staff still see the site.
- **Error pages:** 404, 500 and 503 plus Coming soon, editable in the builder.
- **File manager:** uploads and assets only (upload, rename, delete, zip download).
- **Database:** browse and search tables, export CSV/SQL, one-click backup and restore. No raw SQL.

## I. UI polish
- Blog editor like ref 10: toolbar, plus Status, Visibility, Category and Tags side cards.
- Integrations card grid like ref 11; API keys table like ref 12 (copy, regenerate, enable switch).

**Delivery:** one full zip after the final QA, as with P17.
