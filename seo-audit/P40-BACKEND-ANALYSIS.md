# P40 Part D — Backend analysis & QA (7 Oct 2026)

Scope: `frontend-v1/` (Hostinger PHP + MySQL build, Admin v2). Checked on the preview with php-wasm and headless Chrome.

## Results

| Check | Result |
|---|---|
| PHP syntax (38 API files + installer) | All OK |
| JavaScript syntax (admin + site scripts) | All OK |
| Admin screens opened (56 routes, Master login) | 56/56 load. 2 bugs found and fixed (below) |
| Public pages smoke test (10 key pages) | 10/10 load, no JS errors |
| Role checks on new actions (Manager / Developer / Sales / Support) | Correct. Only Master + Manager reach WhatsApp/AI settings; others denied unless Master grants the extra permission |
| Manager approval | Manager saves (follow-ups, AI settings) go to Master approval in PHP. **Fixed:** "Submit template to Meta" was not on the approval list |
| SQL injection scan | No user input reaches SQL text. One dynamic column (`mcp.php` report) uses fixed column names only |
| Webhooks / cron | WhatsApp webhook checks Meta's signature (fails closed). Telegram, cron and quote links use secret keys with `hash_equals` |
| Private data | `_private/` is blocked twice (folder `.htaccess` + root rewrite rule). PHP errors are hidden from visitors |
| Database installer | **Fixed:** 4 newer tables (AI events, unanswered questions, Telegram map/seen) added to `_database/woodex-v20.sql` (now 20 tables). The code also creates them on first use |

## Bugs fixed in Part D
1. **Client updates** and **AI training** screens kept a "Loading…" box at the bottom (the screen replaced the wrong card after another module added a card above it). Now uses its own id.
2. **Submit to Meta** could be used by a Manager without Master approval. Added `submit` to the approval rules.
3. **Live chat backup bot** (answers when the AI key is missing or the AI is down) answered "I need office design" with the studio address. Rewritten:
   - answers live in `api/chat-rules.json` (one file for live site + preview, easy to edit)
   - service topics are matched before address/contact; greeting words are ignored ("Hi, I need…")
   - 17 topics: person/human, hours, address, price (never quotes a price), kitchen/furniture, office/commercial, renovation, home, timeline, portfolio, 3D, other cities, payment, site visit, contact, services, thanks
   - never repeats the same answer in one chat; asks for the WhatsApp number when it is missing
   - anything it cannot answer goes to **AI report → Unanswered questions** and the team is alerted

## Not testable here (needs the live server)
- Real WhatsApp sending, Meta template submission, SMTP email and Telegram — need the keys in Admin.
- MySQL itself (the preview uses a JSON mirror). First real run is on Hostinger.
- The cron job must be added in hPanel or follow-ups, reminders and rules will not send (link: WhatsApp → Broadcasts & automations → Settings).

## Go-live checklist (owner)
1. Upload the zip, extract with Overwrite, open `/wx-install.php`, enter the DB password.
2. Log in `admin` / `admin`, change the password at once.
3. Delete `wx-demo.php` and `wx-check.php`.
4. Admin → Blog & insights → AI settings: add the AI key (the bot is much better with it; the backup answers work without).
5. AI Assistant → Behaviour: set the persona name (shown in the chat header).
6. Connect WhatsApp + Business Account ID; add SMTP email; add the cron job.
7. WhatsApp → Auto flows: turn on the follow-ups you want.
