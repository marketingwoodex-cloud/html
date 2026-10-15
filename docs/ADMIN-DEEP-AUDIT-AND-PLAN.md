# Woodex Admin — Deep Audit, QA & Plan (Phase 16)

Date: 30 Sep 2026 · Source: owner review of live admin (13 points + 6 screenshots) + code audit + automated QA.

## 1. What the QA found

**Automated QA (preview):** all 34 admin screens were opened in a browser, logged in as owner. On the preview, every
screen loads with no JavaScript errors and no failed API calls. So most of the problems on **woodex.com.pk**
come from the live server (Hostinger PHP), not from the screens themselves.

**Two root causes explain most of the 13 points:**

| Root cause | What breaks | Your points |
|---|---|---|
| **A. The page-builder API rejects the admin on the live server** ("Not signed in"). Many admin screens get their page list from the builder API. When it says no, those screens stay empty or stuck on "Loading…". | Header & footer, Section library, Service pages, City "Copy from", Page builder (new page / save / layers / theme), Blog "Import existing" | 2, 3, 5, 7, 13 |
| **B. The server can't check SSL certificates** ("unable to get local issuer certificate"). Hostinger's PHP has no certificate list, so every outgoing call to Google, OpenAI, Gemini or WhatsApp fails. | AI writer, AI chat test, Speed test, Google sign-in check, WhatsApp Cloud API, Turnstile | 8, 10, 11, (12) |

**Other real issues found:**

| # | Issue | Finding |
|---|---|---|
| 1 | Test the AI | The yellow bubbles use white text on a light background, so they're unreadable in dark mode. The AI replies fail because of root cause B. |
| 4 | FAQ groups | The screen gives no explanation. Groups are sets of questions shown on service/city pages and added to Google FAQ results, but that isn't said anywhere. It needs an explanation and a "used on these pages" list. |
| 6 | Dashboard | It shows website numbers only. No leads pipeline, quotes, invoices, chats or projects. The roadmap card is old (Phase A2). |
| 8 | AI model | You have to type the model name. It should load the list from the provider with your key and pick the best one automatically. |
| 9 | Integrations | One long page. It needs groups (Messaging, AI, Google, Security, Email) with a status on each card. WhatsApp number change should happen here, with a clear "connected / not connected" state. |
| 10 | Google | Google sign-in already uses the free Google service. It fails because of root cause B. Google Analytics and Search Console can also be connected for free. |
| 12 | Site health | The scan runs on the server. It may time out on Hostinger, or break on a missing PHP extension. The System check will show which. |
| Nav | Menu | 34 items in one long list. It needs groups and a clear hierarchy. |

## 2. Plan (Phase 16 — "Admin go-live fix")

**Q1. Fix the foundation (root causes A + B) — first, most important**
- New **Admin → System check** screen, run on the live server. It checks:
  - PHP version and extensions;
  - database;
  - whether `_private` is writable;
  - builder sign-in (whether the builder token works, and why not);
  - SSL connections to Google, OpenAI and Meta;
  - whether the server receives the admin headers.

  It shows a clear ✅/❌ with a fix for each line.
- Builder API: it also accepts the normal admin session as a backup, so one bad token can't break 6 screens.
- No more endless "Loading…": every screen shows the real error and a **Retry** button.
- A trusted certificate list (Mozilla CA bundle) ships with the site, and all outgoing calls use it. This fixes the AI, Speed test, Google sign-in and WhatsApp.

**Q2. Menu hierarchy + smart dashboard**
- The menu goes from 34 items to 7 collapsible groups (it remembers what you opened):
  - **Overview:** Dashboard
  - **Sales:** Enquiries · Pipeline · Clients · Quotations (templates as a tab) · Invoices · Projects · Client updates
  - **Conversations:** Live chat · Train AI
  - **Website:** Pages · Page builder · Section library · Header & footer · Media
  - **Content:** Blog · Portfolio · Service pages · City pages · FAQs · Testimonials · Team
  - **Marketing & SEO:** SEO · Redirects · Speed · Site health
  - **Settings:** Business info · Integrations · Team & roles · Backups · Activity · My security · System check
- The dashboard shows what matters for your role:
  - **Business numbers:** new leads, pipeline value, quotes waiting and accepted, unpaid and overdue invoices, active projects, chats waiting.
  - **Needs attention:** leads not contacted for over 24 hours, overdue invoices, quotes about to expire, chats waiting.
  - **Charts:** leads per week by source, and revenue per month.
  - **Website (small panel):** Speed score, health score and recent edits.

**Q3. Page builder — full QA and fixes**
- New page: create, then save, then it appears in the Pages list.
- Layers panel, Theme panel, Undo, and Save/Publish all checked.
- The **Sections** tab shows all 50 v26 templates as thumbnails, with drag-in or click-to-insert, plus your saved sections.

**Q4. Content modules**
- Service pages list and editor.
- City pages: "Copy from" dropdown and Bulk create (with and without AI).
- FAQ groups: explanation, "used on these pages", and a link to a page.
- Blog: Import existing articles, and the AI writer working end-to-end.

**Q5. AI**
- The model list loads automatically from the provider, with a recommended default.
- Clear AI error messages.
- Test-AI chat readable in light and dark mode.

**Q6. Integrations page redesign**
- Grouped cards with status.
- WhatsApp: number change, links vs Cloud API, and a test message.
- Google: sign-in, Analytics and Search Console (free).
- PageSpeed key, Turnstile and email (SMTP), each with a **Test** button.

**Q7. Go-live deep QA**
- Run the real PHP backend locally (PHP-WASM) so PHP code is tested, not only the Node copy.
- Test every screen and every action (create, edit, delete, publish).
- Report plus a full zip, with upload steps.

## 3. Order
Q1 → Q2 → Q3 → Q4 → Q5 → Q6 → Q7. Q1 is first because it unblocks most of the list. Review after each step.
