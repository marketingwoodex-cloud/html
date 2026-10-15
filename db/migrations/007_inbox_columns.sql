-- db/migrations/007_inbox_columns.sql — the four columns the unified inbox needs, and nothing else.
--
-- v2.1's chat-lib.php created these on first use, inside a try/catch, from the request that needed
-- them ("ALTER TABLE wx_chats ADD COLUMN assigned_to INT NULL" guarded by catching the error). That
-- works exactly once per host and is invisible afterwards: the columns exist, nobody knows when they
-- were added, and a second host that never opened the inbox has a different schema. They live here
-- instead — same columns, same types, but created by a migration that runs before the code that uses
-- them, and recorded in wx_migrations with everything else.
--
-- wx_chats on the live host already has: token, created_at, updated_at, name, phone, email, page, ip,
-- status, mode, agent_name, unread, needs, last_text, lead_id, alerted, channel, vtype, atype.
-- The four below are the ones it does not have.

/* Which agent has picked this conversation up. NULL means nobody has, which is the state the inbox's
   "Unassigned" box exists to show. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND COLUMN_NAME = 'assigned_to') = 0,
  'ALTER TABLE wx_chats ADD COLUMN assigned_to INT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* Free labels on a conversation ("kitchen", "DHA", "whatsapp follow-up"). Six of them, each up to 24
   characters, stored comma-separated exactly as v2.1 stored them — a tag column does not need a join
   table to be useful, and staying compatible means the old admin still reads them. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND COLUMN_NAME = 'tags') = 0,
  'ALTER TABLE wx_chats ADD COLUMN tags VARCHAR(200) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* Set while the AI is handing over to a person, so the assistant stops answering mid-sentence. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND COLUMN_NAME = 'handoff') = 0,
  'ALTER TABLE wx_chats ADD COLUMN handoff VARCHAR(20) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* The external id a WhatsApp or Telegram conversation arrives with, so a reply can be sent back to the
   same thread instead of guessing from the phone number. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND COLUMN_NAME = 'ext') = 0,
  'ALTER TABLE wx_chats ADD COLUMN ext VARCHAR(40) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* The inbox orders by "needs a person first, then most recent" and filters by assignee; both are
   index shapes rather than new columns. `wx_chats.updated_at` is already indexed by the live schema. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND INDEX_NAME = 'wx_chats_box') = 0,
  'ALTER TABLE wx_chats ADD INDEX wx_chats_box (status, needs, updated_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_chats' AND INDEX_NAME = 'wx_chats_assigned') = 0,
  'ALTER TABLE wx_chats ADD INDEX wx_chats_assigned (assigned_to)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;
