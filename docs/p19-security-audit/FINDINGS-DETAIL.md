# Findings detail (paths under `frontend-v1/`)
**F-03 backup-restore-writes-private (High).** `api/media-lib.php` `backup_up` (:92) → `backup_restore` (:282) → `a7_restore` (:116) only blocks `api|admin|builder` folders and script extensions. A crafted zip can write `_private/config.json` (HMAC secret read in `api/admin.php` :33) and `_private/security.json`, letting an Admin forge an Owner token (`pw_ver` comes from a DB download), or write `.htaccess` for possible code execution.

**F-04 db-restore-users-table (High).** `db_up` (:103) → `a7_db_restore` (:80) replaces `wx_users`, so the "only the owner can edit the owner" rule (`api/admin.php` :360) can be bypassed.

**F-01 forms-autoreply-relay (Medium).** `api/forms.php` :66 skips Turnstile for `form=whatsapp`; :90 calls the client auto-reply; `api/notify-lib.php` :52/:57 send WhatsApp/email to the number/address the visitor submitted. Only the per-IP rate limit restricts it.

**F-02 whatsapp-webhook-fail-open (Medium).** `api/whatsapp.php` :24 checks `X-Hub-Signature-256` only if `waSecret` is set. Unsigned posts create chats/leads, trigger AI replies and can mark customers STOP (`api/p18g-lib.php` :192).

**F-05 editor-script-in-admin-preview (Medium).** `api/builder.php` save (:202/:207) keeps `<script>`. `admin/admin-chrome.js` :172 and `admin/admin-p18h.js` :43 load pages in same-origin iframes without a sandbox; the admin token sits in `sessionStorage` (`admin/admin.js` :8), so the script can read it.

**F-06 import-url-redirect-ssrf (Low).** `api/builder.php` :261 validates the host, but :266/:267 fetch with `follow_location=1`, so a redirect can reach internal addresses.
