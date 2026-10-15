-- db/migrations/000_platform.sql — the tables api/v2 needs that v2.1 never had.
--
-- Everything here is **additive**. v2.1 keeps running against this database during the cut-over, so
-- nothing in this series drops a column, renames one, or rewrites a row that v2.1 reads. The rules for
-- the whole series are in db/migrations/README.md.
--
-- The four new tables are the things v2.1 kept in places that cannot answer a question:
--
--   wx_sessions       v2.1's session was a signed cookie holding the user id, so a stolen cookie could
--                     not be revoked, a password change did not end other sessions, and "who is signed
--                     in" was unanswerable. A row per session makes all three possible.
--   wx_login_attempts v2.1 throttled by IP only (wx_throttle), so one attacker with a list of emails
--                     could try passwords from a pool of addresses. Failures are recorded per account
--                     as well, and the lockout reads both.
--   wx_secrets        the CSRF/quote-link key. v2.1 derived it from a file in _private/ which meant the
--                     key changed if the file was restored, silently invalidating every issued link.
--   wx_migrations     what has been applied, and the checksum it was applied with, so an edited
--                     migration is caught rather than ignored.
--
-- The two ALTERs at the end add columns to existing tables. They are guarded with information_schema
-- because MySQL 8 has no ADD COLUMN IF NOT EXISTS, and a migration that fails on a second run is not a
-- migration.

/* ------------------------------------------------------------------ sessions
   `id` is the SHA-256 of the cookie value, never the value itself: the database is copied to staging,
   backed up and emailed around, and a session table that holds usable session ids is a credential
   store. 64 hex characters, fixed width, primary key.
   `pw_ver` mirrors wx_users.pw_ver at the moment of sign-in, so changing a password invalidates the
   sessions opened with the old one without deleting them (the audit wants to know they existed). */
CREATE TABLE IF NOT EXISTS wx_sessions (
  id CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  pw_ver INT NOT NULL DEFAULT 1,
  csrf_hash CHAR(64) NOT NULL,
  ip VARCHAR(64) NULL,
  ua VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  revoked_reason VARCHAR(60) NULL,
  INDEX wx_sessions_user (user_id, last_seen),
  INDEX wx_sessions_expiry (expires_at),
  INDEX wx_sessions_live (revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------- login attempts
   Kept small on purpose: the throttle asks "how many failures for this account in the last N minutes",
   which one composite index answers. Rows older than the window are swept on write, not by a cron. */
CREATE TABLE IF NOT EXISTS wx_login_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NULL,
  ip VARCHAR(64) NULL,
  ok TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(40) NULL,
  at DATETIME NOT NULL,
  INDEX wx_login_email (email, at),
  INDEX wx_login_ip (ip, at),
  INDEX wx_login_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------- secrets
   Server-side keys. `checksum` is a hash of the key material: it lets --verify confirm the stored key
   has not been altered by hand or truncated by a restore, without ever printing it. */
CREATE TABLE IF NOT EXISTS wx_secrets (
  k VARCHAR(40) NOT NULL PRIMARY KEY,
  v VARCHAR(190) NOT NULL,
  checksum CHAR(64) NULL,
  created_at DATETIME NOT NULL,
  rotated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ----------------------------------------------------------- migrations
   `sha256` is the file's hash at the moment it was applied. db/migrate.php refuses to run when an
   applied file has changed — the alternative is a database that quietly does not match the migrations
   in the repository, which is how two environments drift apart. */
CREATE TABLE IF NOT EXISTS wx_migrations (
  file VARCHAR(80) NOT NULL PRIMARY KEY,
  sha256 CHAR(64) NOT NULL,
  applied_at DATETIME NOT NULL,
  ms INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------- existing tables
   wx_activity gains the request-id so an audit row can be tied to a customer report ("the page said
   r_1a2b3c4d at 14:02"), and a JSON blob for the detail that does not deserve a column each. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_activity' AND COLUMN_NAME = 'req_id') = 0,
  'ALTER TABLE wx_activity ADD COLUMN req_id VARCHAR(20) NULL AFTER user_name',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_activity' AND COLUMN_NAME = 'meta_json') = 0,
  'ALTER TABLE wx_activity ADD COLUMN meta_json TEXT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_activity' AND INDEX_NAME = 'wx_activity_req') = 0,
  'ALTER TABLE wx_activity ADD INDEX wx_activity_req (req_id)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_activity' AND INDEX_NAME = 'wx_activity_user') = 0,
  'ALTER TABLE wx_activity ADD INDEX wx_activity_user (user_id, created_at)',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

/* wx_users gains the columns the two-factor sign-in needs.

   v2.1 stored these in its own way; without somewhere to put them, porting the sign-in would either
   drop two-factor authentication for existing users (a security regression on the first deploy) or
   keep the old sign-in path alive forever. They are added here, and the values are read from the
   existing login code path when a host migrates. */
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'totp_secret') = 0,
  'ALTER TABLE wx_users ADD COLUMN totp_secret VARCHAR(64) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'totp_on') = 0,
  'ALTER TABLE wx_users ADD COLUMN totp_on TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'recovery_json') = 0,
  'ALTER TABLE wx_users ADD COLUMN recovery_json TEXT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'last_ip') = 0,
  'ALTER TABLE wx_users ADD COLUMN last_ip VARCHAR(64) NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'must_change') = 0,
  'ALTER TABLE wx_users ADD COLUMN must_change TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;
