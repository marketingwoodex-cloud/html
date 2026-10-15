# Security fixes + re-audit (P19 security build)
Fixes applied to the P19 code after the audit. Each fix was re-checked by reading the source again (no PHP runtime in the sandbox, so nothing was run). `findings.json` still records the original audit of `a811424`.

| ID | Status | What changed |
|---|---|---|
| F-03 | **Fixed** | `api/media-lib.php`: all site-backup actions are now **Owner-only**: create, delete, download, upload, restore, DB download and DB upload. New `a7_restore_blocked()` skips anything under `api/ admin/ builder/ tools/ deploy/`, any dot-file (including `.htaccess` and `.user.ini`), script/ini extensions, `_private/` sub-folders and `_private/{config,security,db,mcp,google,google-sa,login-attempts}.json`. |
| F-04 | **Fixed** | Restore never touches `wx_users` or `wx_throttle` (`A7_DB_KEEP`), so logins and roles stay as they are now. Owner-only as well. |
| F-01 | **Fixed** | `api/forms.php`: at most 1 auto-reply per phone/email per 24 h and 60 per day site-wide (`forms_reply_ok`). The WhatsApp widget form no longer sends auto-replies (it sends people to WhatsApp anyway). Team alerts are unchanged. |
| F-02 | **Fixed** | `api/whatsapp.php`: fails closed. If the App secret is empty, the webhook answers 503 and does nothing; otherwise the signature must match. The admin field now says "Required". |
| F-05 | **Fixed** | `api/builder.php` `code_guard()`: only the Owner can **add** new `<script>`, `on…=` handlers, `javascript:` links, iframes/embeds or meta refresh to pages (save and new page). Scripts that already exist on the site stay allowed, and JSON-LD schema is allowed. Header/footer and blocks already blocked scripts. |
| F-06 | **Fixed** | `import_url`: redirects are followed by hand (max 3) and every hop is re-checked: https only, port 443, every DNS address must be public. Also fixed a duplicate `ssl` option that dropped the CA bundle. |
| NV-1 | **Mitigated** | `api/chat-lib.php`: site-wide cap of 400 AI answers per day. After that, chat falls back to the Q&A answers and the team. |
| Re-audit R-1 | **Fixed (new)** | `api/p18h-lib.php` Database → SQL export (includes password hashes) is now Owner-only. CSV export stays available to Admins (secrets masked). |

**Re-audit, nothing new found:** File manager (assets/ only, extension allow-list, code folders read-only), DB browser (read-only, secrets masked), user management (Owner protected), login/sessions.

**What you must do after deploying:** paste the Meta **App secret** in Admin → Live chat → Train AI → WhatsApp, otherwise WhatsApp messages will not arrive. Admin users will no longer see the backup buttons.
