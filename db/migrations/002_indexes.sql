-- db/migrations/002_indexes.sql — the indexes the v2.5 screens need, and nothing more.
--
-- Why these: the audit measured the admin's slowest screens against the live data, and every one of
-- them was slow for the same reason — the query had no index to use, so MySQL walked the table. Adding
-- an index is the smallest possible fix and the only one that cannot change an answer: unlike a query
-- rewrite, it cannot return different rows.
--
-- Deliberately **not** here: an index on every column that appears in a WHERE clause. Each index costs
-- write time and disk, and a host on shared MySQL notices. These are the ones the screens actually
-- need, named after the screen that needs them.
--
-- Guards: MySQL 8 has no CREATE INDEX IF NOT EXISTS, so each index is created only when
-- information_schema says it is missing. A migration that fails on the second run is not a migration.

/* ---------------------------------------------------- wx_leads — the pipeline
   `leads_list` filters by stage and sorts by recency; the follow-up widgets filter by next_at and ask
   for the next one due. Both were full scans. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_leads' AND INDEX_NAME = 'wx_leads_stage') = 0,
  'ALTER TABLE wx_leads ADD INDEX wx_leads_stage (stage, created_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_leads' AND INDEX_NAME = 'wx_leads_next') = 0,
  'ALTER TABLE wx_leads ADD INDEX wx_leads_next (next_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_leads' AND INDEX_NAME = 'wx_leads_source') = 0,
  'ALTER TABLE wx_leads ADD INDEX wx_leads_source (source, created_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ------------------------------------------------------- wx_lead_notes
   The lead drawer loads a conversation at a time; without this it sorted the whole table per lead. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_lead_notes' AND INDEX_NAME = 'wx_lead_notes_lead') = 0,
  'ALTER TABLE wx_lead_notes ADD INDEX wx_lead_notes_lead (lead_id, id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ---------------------------------------------------------- wx_clients
   Client de-duplication compares phone digits and email on every quotation conversion (v2.1 called
   that loop *inside* the transaction that creates the invoice). An index makes it a lookup.

   The phone index is on the stored text, which includes spaces and dashes; that is deliberate — the
   comparison normalises digits in PHP, and an index on a functional expression would be a MySQL 8
   feature the host may not have enabled. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_clients' AND INDEX_NAME = 'wx_clients_email') = 0,
  'ALTER TABLE wx_clients ADD INDEX wx_clients_email (email)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_clients' AND INDEX_NAME = 'wx_clients_phone') = 0,
  'ALTER TABLE wx_clients ADD INDEX wx_clients_phone (phone)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_clients' AND INDEX_NAME = 'wx_clients_created') = 0,
  'ALTER TABLE wx_clients ADD INDEX wx_clients_created (created_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ------------------------------------------------------------ wx_quotes
   The quotation list filters by status and sorts by recency; `no` already has its own index from the
   v2.1 schema. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND INDEX_NAME = 'wx_quotes_status') = 0,
  'ALTER TABLE wx_quotes ADD INDEX wx_quotes_status (status, id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ---------------------------------------------------------- wx_invoices
   The invoice tracker lists everything, newest first, and the "overdue" widget wants the same rows
   that are not paid. `quote_id` carries the v2.1 UNIQUE index. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND INDEX_NAME = 'wx_invoices_no') = 0,
  'ALTER TABLE wx_invoices ADD INDEX wx_invoices_no (no)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ------------------------------------------------------------ wx_chats
   The unified inbox sorts by last message and counts what needs a person. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND INDEX_NAME = 'wx_chats_status') = 0,
  'ALTER TABLE wx_chats ADD INDEX wx_chats_status (status, updated_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ---------------------------------------------------------------- wx_users
   The team list and the approval "who is a Manager" lookups. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND INDEX_NAME = 'wx_users_role') = 0,
  'ALTER TABLE wx_users ADD INDEX wx_users_role (role, active)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ------------------------------------------------------------- wx_bookings
   The booking calendar reads a date range; `d` had no index at all. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_bookings' AND INDEX_NAME = 'wx_bookings_day') = 0,
  'ALTER TABLE wx_bookings ADD INDEX wx_bookings_day (d, tm)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;
