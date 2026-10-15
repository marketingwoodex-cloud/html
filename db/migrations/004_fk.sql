-- db/migrations/004_fk.sql — foreign keys, where they are safe. The audit counted zero.
--
-- The live database has no foreign keys at all. That is why deleting a lead can leave its notes behind,
-- why a quotation can point at a client that no longer exists, and why the audit's "orphan rows" count
-- kept coming back non-zero. It is also why nothing here can be fixed by the application alone: two
-- screens writing to the same tables will eventually disagree, and the database is the only place that
-- can refuse.
--
-- Two rules kept this migration from breaking a running host:
--
--   1. **Clean up first, then constrain.** A foreign key cannot be created while a row violates it, and
--      the live data has violations. Orphans are not deleted — a dangling reference is set to NULL,
--      which keeps the row and its text while removing the claim that it belongs to something. Losing
--      the reference to a deleted record is not the same as losing the record.
--
--   2. **Only where the column can be NULL.** A NOT NULL child column can only be handled with
--      ON DELETE CASCADE, which deletes rows to satisfy the constraint. wx_lead_notes.lead_id is NOT
--      NULL, so it has no foreign key — and does not need one: leads are soft-deleted (the delete route
--      moves a lead to `lost` and keeps the history, in v2.1 and in v2.5), so an orphan note cannot be
--      created going forward. That is a design property, not an oversight, and it is written down here
--      so a later reader does not "fix" it by pointing a cascade at the notes table.
--
-- ON DELETE choices, and why:
--   · CASCADE where the child is meaningless without the parent (a session, a per-user permission);
--   · SET NULL where the child is a document that must survive the parent's deletion (an invoice keeps
--     its client's name in its payload and loses only the link).

/* ------------------------------------------------------------- orphan cleanup
   Each of these is a no-op on a clean database and a one-way repair on a live one. They are written
   as UPDATEs (never DELETEs) for the reason above. */
UPDATE wx_leads SET client_id = NULL
  WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM wx_clients);
UPDATE wx_quotes SET client_id = NULL
  WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM wx_clients);
UPDATE wx_invoices SET client_id = NULL
  WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM wx_clients);
UPDATE wx_projects SET client_id = NULL
  WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM wx_clients);
UPDATE wx_invoices SET quote_id = NULL
  WHERE quote_id IS NOT NULL AND quote_id NOT IN (SELECT id FROM wx_quotes);
UPDATE wx_activity SET user_id = NULL
  WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM wx_users);
UPDATE wx_sessions SET user_id = 1
  WHERE user_id NOT IN (SELECT id FROM wx_users);
UPDATE wx_user_perms SET user_id = 1
  WHERE user_id NOT IN (SELECT id FROM wx_users);

/* A project's invoice link is stored in its payload by v2.1, so the column is added here (unless 003
   already did) and then nullified: an invoice that has been deleted must not stay referenced. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'quote_id') = 0,
  'ALTER TABLE wx_projects ADD COLUMN quote_id INT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

UPDATE wx_projects SET invoice_id = NULL
  WHERE invoice_id IS NOT NULL AND invoice_id NOT IN (SELECT id FROM wx_invoices);
UPDATE wx_projects SET quote_id = NULL
  WHERE quote_id IS NOT NULL AND quote_id NOT IN (SELECT id FROM wx_quotes);

/* ---------------------------------------------------------------- the keys
   Each is created only when it is missing, because MySQL 8 cannot say ADD CONSTRAINT IF NOT EXISTS and
   this file must be re-runnable. */

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_activity' AND CONSTRAINT_NAME = 'wx_fk_activity_user') = 0,
  'ALTER TABLE wx_activity ADD CONSTRAINT wx_fk_activity_user FOREIGN KEY (user_id) REFERENCES wx_users (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_sessions' AND CONSTRAINT_NAME = 'wx_fk_sessions_user') = 0,
  'ALTER TABLE wx_sessions ADD CONSTRAINT wx_fk_sessions_user FOREIGN KEY (user_id) REFERENCES wx_users (id) ON DELETE CASCADE',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_user_perms' AND CONSTRAINT_NAME = 'wx_fk_perms_user') = 0,
  'ALTER TABLE wx_user_perms ADD CONSTRAINT wx_fk_perms_user FOREIGN KEY (user_id) REFERENCES wx_users (id) ON DELETE CASCADE',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_leads' AND CONSTRAINT_NAME = 'wx_fk_leads_client') = 0,
  'ALTER TABLE wx_leads ADD CONSTRAINT wx_fk_leads_client FOREIGN KEY (client_id) REFERENCES wx_clients (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND CONSTRAINT_NAME = 'wx_fk_quotes_client') = 0,
  'ALTER TABLE wx_quotes ADD CONSTRAINT wx_fk_quotes_client FOREIGN KEY (client_id) REFERENCES wx_clients (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND CONSTRAINT_NAME = 'wx_fk_invoices_client') = 0,
  'ALTER TABLE wx_invoices ADD CONSTRAINT wx_fk_invoices_client FOREIGN KEY (client_id) REFERENCES wx_clients (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND CONSTRAINT_NAME = 'wx_fk_invoices_quote') = 0,
  'ALTER TABLE wx_invoices ADD CONSTRAINT wx_fk_invoices_quote FOREIGN KEY (quote_id) REFERENCES wx_quotes (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND CONSTRAINT_NAME = 'wx_fk_projects_client') = 0,
  'ALTER TABLE wx_projects ADD CONSTRAINT wx_fk_projects_client FOREIGN KEY (client_id) REFERENCES wx_clients (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND CONSTRAINT_NAME = 'wx_fk_projects_invoice') = 0,
  'ALTER TABLE wx_projects ADD CONSTRAINT wx_fk_projects_invoice FOREIGN KEY (invoice_id) REFERENCES wx_invoices (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND CONSTRAINT_NAME = 'wx_fk_projects_quote') = 0,
  'ALTER TABLE wx_projects ADD CONSTRAINT wx_fk_projects_quote FOREIGN KEY (quote_id) REFERENCES wx_quotes (id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* Deferred to the phase that introduces the tables, because a constraint needs its parent to exist:
   wx_invoice_payments.invoice_id  → wx_invoices (CASCADE)   — in 006, with the table
   wx_approvals.requested_by_id    → wx_users    (SET NULL)  — in 006
   wx_approvals.decided_by_id      → wx_users    (SET NULL)  — in 006
   wx_chat_msgs.chat_id            → wx_chats    (CASCADE)   — the inbox phase: chat rows are created
                                                              by an unauthenticated visitor path, and
                                                              constraining it before that path is
                                                              reviewed would turn a public request into
                                                              a 500 on a busy day. */
