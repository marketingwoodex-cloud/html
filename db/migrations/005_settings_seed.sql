-- db/migrations/005_settings_seed.sql — the settings v2.5 reads, with v2.1's values.
--
-- wx_settings is a key/value table that v2.1 already uses (company details, tracking keys, thresholds).
-- v2.5 reads it too, and the keys below are seeded so that a migrated host behaves the same as an
-- unmigrated one — no screen changes because a setting is absent.
--
-- Every row is INSERT IGNORE. On a live host, whatever the owner has already set wins: this file adds
-- what is missing and never overwrites a decision a person has made. That is the difference between a
-- seed and a reset, and getting it wrong once is how a company's bank details change themselves.

/* ------------------------------------------------------- what needs attention
   The dashboard's "needs attention" strip (plan §7). These four thresholds are the whole rule set; the
   rest of the widget is a query per rule. They live in settings so the owner can tune them without a
   deploy — the alternative is a constant nobody can find. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('attention.lead_stale_days', '3'),
  ('attention.invoice_overdue_days', '1'),
  ('attention.quote_expiring_days', '2'),
  ('attention.chat_waiting_minutes', '30');

/* ------------------------------------------------------------- platform identity
   `platform.api_version` is what /health and /version report. It is a setting rather than a constant so
   the API version can be raised on the host without shipping code, and so a rollback is one row. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('platform.api_version', '2.5.0-p1'),
  ('platform.name', 'Woodex Admin'),
  ('platform.timezone', 'Asia/Karachi');

/* ------------------------------------------------------------- company identity
   Same keys as v2.1's company.json, so the document header, the print pages and the WhatsApp templates
   all read the same values. Only the identity fields are seeded — never the bank accounts or the numbers
   on the invoices: those exist already on any host that has sent an invoice, and guessing them would be
   worse than leaving them. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('company.name', 'Woodex Interior'),
  ('company.prefix', 'WI-'),
  ('company.nextNo', '10100'),
  ('company.wfPrefix', 'WF-'),
  ('company.wfNext', '10050'),
  ('company.validDays', '15');

/* ------------------------------------------------------------ integration state
   Keys the integrations read, seeded **empty** on purpose. An empty tracking key is a documented state
   ("not connected"); an invented default is a silent misconfiguration — a pixel pointed at a test
   property is worse than no pixel. v2.5's integrations screen shows an empty key as "not connected"
   and asks for the real value. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('track.ga4', ''),
  ('track.gtm', ''),
  ('track.meta_pixel', ''),
  ('track.search_console', ''),
  ('wa.phone_id', ''),
  ('wa.token', ''),
  ('tg.bot_token', ''),
  ('tg.chat_id', '');

/* --------------------------------------------------------------- mail identity
   The address approvals and client updates are sent from. Empty means "not configured": the approval
   notification then stays in the bell, which is what v2.1 did when SMTP was unset. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('mail.from', ''),
  ('mail.from_name', 'Woodex Interior');

/* ------------------------------------------------------------------ numbering
   Quotations and invoices share the WI- series, the furniture line has its own WF- series (v2.1's
   s17_inv_no). Both counters are seeded by the two `nextNo` keys above; this key only decides whether
   a number is re-checked against what already exists, which v2.1 did because its counter could roll
   back with a file restore. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('numbering.check_collisions', '1');
