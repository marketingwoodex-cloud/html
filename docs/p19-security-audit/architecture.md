# Architecture (attack-surface view)
- **Public PHP endpoints** (`frontend-v1/api/`): `forms.php` (enquiries), `chat.php` (live chat + AI), `whatsapp.php` (Meta webhook), `quote-view.php` (client quote links), `wa-cron.php`, `mcp.php` (AI-agent tools).
- **Admin API** `admin.php`: HMAC session token in `X-WX-ADM` header, roles Owner > Admin > Editor/Sales. Action chain dispatches to the `*-lib.php` modules.
- **Builder** `builder.php`: page save/import, Editor role and above.
- **Secrets/state**: `_private/` (config.json HMAC secret, security.json sessions, crm.json), MySQL `wx_*` tables.
- **Trust boundaries**: anonymous → public endpoints; Editor → Admin → Owner; Meta → webhook; server → outbound URL fetch.
