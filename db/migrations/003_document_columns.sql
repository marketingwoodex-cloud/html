-- db/migrations/003_document_columns.sql — real columns beside the JSON documents.
--
-- Quotes, invoices and projects store their document as JSON in a LONGTEXT column. That was a
-- reasonable choice in v2.1 and it is why the product shipped fast; it is also why the invoice tracker
-- is slow (every row is decoded in PHP to answer "how much is outstanding") and why nothing can be
-- indexed, sorted or joined by a total.
--
-- The fix is not to move the documents into columns. The fix is to **promote the few fields that are
-- asked questions about** into real columns, and keep the JSON as the document. Both are written in the
-- same statement by wx_doc_put(), so they cannot disagree.
--
-- NOTE ON MONEY: totals are BIGINT whole rupees, which is the unit v2.1 already uses — doc_totals()
-- rounds with (int)round() and pay_add with (int)round(numv(...)). The alternative (paisa) was
-- considered and rejected: the v2.1 admin reads these same rows during the cut-over, so changing the
-- unit would make every invoice wrong by 100x in whichever admin was not rebuilt yet.
--
-- BIGINT rather than INT for the eight rupees columns (subtotal, tax, total, paid, project value):
-- INT tops out at 2,147,483,647 — about 2.1 billion rupees. That is inside the range of a commercial
-- fit-out, and the failure mode is an insert that errors on the biggest contract of the year, at the
-- moment the invoice is being issued. Four bytes a row removes that ceiling; wx_leads.value is already
-- BIGINT, so this is also the shape the rest of the schema already uses.

/* ------------------------------------------------------------ wx_quotes
   `no` and `status` already exist on the v2.1 table. What is added is what a quotation list needs to
   answer without decoding: which client, which project, how much, and when. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'client_id') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN client_id INT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'project') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN project VARCHAR(190) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'subtotal') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN subtotal BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'tax') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN tax BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'total') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN total BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'currency') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN currency CHAR(3) NOT NULL DEFAULT ''PKR''',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'issued_at') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN issued_at DATETIME NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'valid_until') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN valid_until DATE NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* The hash of the PDF that was last generated for this document. Storing it is what makes "the client
   has a different copy from us" a question with an answer — and it belongs to the document, not to a
   filename someone typed. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND COLUMN_NAME = 'pdf_sha256') = 0,
  'ALTER TABLE wx_quotes ADD COLUMN pdf_sha256 CHAR(64) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* The client filter and the "quotes for this project" view. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_quotes' AND INDEX_NAME = 'wx_quotes_client') = 0,
  'ALTER TABLE wx_quotes ADD INDEX wx_quotes_client (client_id, id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ----------------------------------------------------------- wx_invoices
   `no` and `quote_id` exist on the v2.1 table (`quote_id` with its UNIQUE index, which is what stops a
   quotation being invoiced twice). Added: the money, the client, and the two dates the tracker sorts
   and filters on. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'client_id') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN client_id INT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'project') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN project VARCHAR(190) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'subtotal') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN subtotal BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'tax') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN tax BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'total') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN total BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* `paid` is denormalised on purpose: it is written in the same transaction as the receipt row that
   changes it. It is not the source of truth — wx_inv_public() derives the position from the receipts
   and uses this column only to answer "which invoices are unpaid" without a join. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'paid') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN paid BIGINT NOT NULL DEFAULT 0',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'currency') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN currency CHAR(3) NOT NULL DEFAULT ''PKR''',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'issued_at') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN issued_at DATETIME NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'due_at') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN due_at DATE NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND COLUMN_NAME = 'pdf_sha256') = 0,
  'ALTER TABLE wx_invoices ADD COLUMN pdf_sha256 CHAR(64) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* The overdue widget: what is unpaid and past its due date, without decoding any JSON. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND INDEX_NAME = 'wx_invoices_due') = 0,
  'ALTER TABLE wx_invoices ADD INDEX wx_invoices_due (due_at, paid)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_invoices' AND INDEX_NAME = 'wx_invoices_client') = 0,
  'ALTER TABLE wx_invoices ADD INDEX wx_invoices_client (client_id, id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* ----------------------------------------------------------- wx_projects
   v2.1's wx_projects table is one column (`data`) and every screen reads all of it (`projs_table`
   decodes the whole table on every load — the 1.4 s table the plan measured). Project rows are few and
   wide, so the columns added are just the ones a list needs to exist at all. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'no') = 0,
  'ALTER TABLE wx_projects ADD COLUMN no VARCHAR(30) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'client_id') = 0,
  'ALTER TABLE wx_projects ADD COLUMN client_id INT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'stage') = 0,
  'ALTER TABLE wx_projects ADD COLUMN stage VARCHAR(20) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'value') = 0,
  'ALTER TABLE wx_projects ADD COLUMN value BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'invoice_id') = 0,
  'ALTER TABLE wx_projects ADD COLUMN invoice_id INT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND COLUMN_NAME = 'target') = 0,
  'ALTER TABLE wx_projects ADD COLUMN target DATE NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND INDEX_NAME = 'wx_projects_stage') = 0,
  'ALTER TABLE wx_projects ADD INDEX wx_projects_stage (stage, id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_projects' AND INDEX_NAME = 'wx_projects_client') = 0,
  'ALTER TABLE wx_projects ADD INDEX wx_projects_client (client_id, id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* --------------------------------------------------------- wx_templates
   Templates are documents too (the same JSON, a different name), and the quotation builder lists them
   by name. `name` already carries the v2.1 UNIQUE index, so nothing is added here except the note: the
   list endpoint and the builder read `data` exactly as v2.1 wrote it. */
