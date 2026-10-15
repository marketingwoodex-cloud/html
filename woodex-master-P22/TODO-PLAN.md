# P22 To-do plan (after deep QA + security audit)

## A. Fixed in P22 ✅
1. Social image path traversal / SSRF (LinkedIn upload) — fixed.
2. `api/*.json` public — blocked.
3. Mic blocked for chat voice notes — fixed.
4. Templates: new `_templates/` folder + "Import from file" in Sales → Templates.

## B. Before upload (owner, 15 min)
1. Backup current Hostinger `public_html` + database.
2. Upload `woodex-master-P22.zip`, extract (Overwrite), run `/wx-install.php`.
3. Change `admin` password; create real staff users (5 roles).
4. Delete `wx-demo.php`, `wx-check.php`.
5. Add cron: `php public_html/api/wa-cron.php` every 5 min.

## C. Connect services (Admin, fill CREDENTIALS-TEMPLATE.md first)
1. WhatsApp Cloud API: token, phone ID, **App secret**, verify token → webhook `/api/whatsapp.php`.
2. Telegram: BotFather bot token → Admin → Telegram → Connect (webhook secret auto).
3. Meta Page long-lived token (FB/IG), LinkedIn, Google Business.
4. AI key (Claude / OpenAI / OpenRouter / local).
5. Turnstile keys, SMTP email, Google service account (GA/GSC).

## D. Open items (next sprint)
| # | Priority | Item |
|---|---|---|
| 1 | Medium | Add Content-Security-Policy header (test widget + builder first) |
| 2 | Medium | Optional 2-factor login for Master |
| 3 | Low | Cosmetic: send icon size in replied comment |
| 4 | Low | Submit WhatsApp templates (`_templates/whatsapp-message-templates.md`) |
| 5 | Low | Google: 404 old WordPress URLs → redirects; www → non-www |
| 6 | Low | P39 open questions (recommended: no) |

## E. After go-live checks
Home, contact form → lead appears, chat reply, WhatsApp test, Telegram alert, quotation PDF, SEO agent scan, speed 90+.
