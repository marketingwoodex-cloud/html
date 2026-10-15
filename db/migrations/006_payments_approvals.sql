-- db/migrations/006_payments_approvals.sql — two JSON side-stores become queryable tables.
--
-- Phase 2 moves the money path off the v2.1 admin, and two things block that:
--
--   1. **Payments are an array inside the invoice JSON.** `pay_add` pushed onto `$i['payments']` and
--      rewrote the whole document. That makes a receipt impossible to query ("what did we receive in
--      August"), impossible to reverse without rewriting the invoice, and — because the invoice is
--      rewritten in full — a lost update whenever two people recorded a payment at once. A receipt is
--      a record; it gets a table.
--
--   2. **Approvals are a JSON file** (`_private/approvals.json`) with a companion config. The queue
--      is business process — who asked, for what, and what the Master decided — and it is the one
--      place where the audit trail matters most, so it belongs next to wx_activity.
--
-- Both tables are additive. The old JSON keeps working until the Phase 5 cleanup, and
-- db/backfill_payments.php copies existing receipts across so nothing is only in one place.

/* ------------------------------------------------------------- invoice payments
   `no` is the document number, kept denormalised so a receipt can be found without a join — a support
   call starts with the number on the receipt, not with the primary key. */
CREATE TABLE IF NOT EXISTS wx_invoice_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  no VARCHAR(30) NOT NULL,
  rcpt VARCHAR(40) NOT NULL,
  paid_on DATE NOT NULL,
  amount BIGINT NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'bank',
  ref VARCHAR(80) NULL,
  note VARCHAR(300) NULL,
  created_by VARCHAR(120) NULL,
  created_by_id INT NULL,
  created_at DATETIME NOT NULL,
  reversed_at DATETIME NULL,
  reversed_by INT NULL,
  INDEX wx_payments_invoice (invoice_id, id),
  INDEX wx_payments_date (paid_on),
  INDEX wx_payments_rcpt (rcpt),
  UNIQUE KEY wx_payments_rcpt_uniq (rcpt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* -------------------------------------------------------------------- approvals
   payload holds the request to replay when the Master approves, exactly as the JSON file stored it,
   capped at 3 MB like APPR_MAX_PAYLOAD. status is pending|approved|rejected|expired.

   requested_by_id / decided_by_id reference wx_users; the names are kept alongside because the queue
   is read by people who think in names, and a deleted user must not blank the history. */
CREATE TABLE IF NOT EXISTS wx_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  src VARCHAR(10) NOT NULL DEFAULT 'admin',
  action VARCHAR(60) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  requested_by VARCHAR(120) NULL,
  requested_by_id INT NULL,
  role VARCHAR(20) NULL,
  requested_at DATETIME NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  decided_by VARCHAR(120) NULL,
  decided_by_id INT NULL,
  decided_at DATETIME NULL,
  note VARCHAR(500) NULL,
  result VARCHAR(500) NULL,
  INDEX wx_approvals_status (status, requested_at),
  INDEX wx_approvals_actor (requested_by_id, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* The approval policy itself: which role needs approval for which pattern, and the global switches.
   v2.1 kept these in _private/approvals-cfg.json as three booleans; they are settings, so they go
   where the other settings are. Seeded to the v2.1 defaults: Manager on, Developer off, notify on. */
INSERT IGNORE INTO wx_settings (k, v) VALUES
  ('approval.manager', '1'),
  ('approval.developer', '0'),
  ('approval.notify', '1'),
  ('approval.expire_days', '14');

/* Every approval decision is an audit event; the request-id column added in migration 000 already
   covers the join back to a specific request. */
