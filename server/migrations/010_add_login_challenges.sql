-- Migration 010: local login-challenge storage and login_attempts identity index.
-- Additive and rerun-safe. Does not modify crop-domain tables.

CREATE TABLE IF NOT EXISTS login_challenges (
    id CHAR(64) NOT NULL PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    identity_hash CHAR(64) NOT NULL,
    answer_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL DEFAULT NULL,
    KEY idx_login_challenges_ip_expires (ip_address, expires_at),
    KEY idx_login_challenges_identity_expires (identity_hash, expires_at)
);

SET @idx_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'login_attempts'
      AND INDEX_NAME = 'idx_login_attempts_username_attempted'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE login_attempts ADD KEY idx_login_attempts_username_attempted (username, attempted_at)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
