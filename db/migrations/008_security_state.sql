-- db/migrations/008_security_state.sql — put the 2FA state in the user row, where the rest of the user is.
--
-- v2.1 kept every account's two-factor secret, recovery codes and session list in `_private/security.json`
-- — a file, keyed by user id, that the permission model and the security screens both read. Migration
-- 000 already moved the secret and the recovery hashes into `wx_users` (totp_secret, totp_on,
-- recovery_json); two pieces of state had nowhere to go, and this file gives them a home:
--
--   · `totp_last` — the time step of the last accepted code. Without it a code can be replayed inside
--     its own thirty-second window: the classic TOTP replay, and the reason the column is a counter and
--     not a boolean.
--
--   · `alerts` — "tell me when someone signs in as me". A per-user preference, so it belongs on the user
--     and not in a settings row named after them.
--
-- Both are additive and guarded, like every other migration here. The file itself is then only read for
-- users who enrolled before this migration ran; `wx_security_state()` reads them forward on first use
-- and cleared rows are dropped, so security.json empties itself out rather than needing a backfill.

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'totp_last') = 0,
  'ALTER TABLE wx_users ADD COLUMN totp_last BIGINT NULL',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wx_users' AND COLUMN_NAME = 'alerts') = 0,
  'ALTER TABLE wx_users ADD COLUMN alerts TINYINT NOT NULL DEFAULT 1',
  'DO 0'
);
PREPARE wx_stmt FROM @sql;
EXECUTE wx_stmt;
DEALLOCATE PREPARE wx_stmt;
