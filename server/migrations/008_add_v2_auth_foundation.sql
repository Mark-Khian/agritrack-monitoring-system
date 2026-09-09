-- =============================================================================
-- Migration 008: Add v2 Authentication, Authorization & Session Foundation
-- Environment-Neutral Transitional Compatibility Migration
-- Target Engine: MySQL 8.0+ (InnoDB)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE: ADDITIVE TRANSITIONAL COLUMNS
-- -----------------------------------------------------------------------------

-- 1.1 full_name (transitional mirrored field, nullable)
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN full_name VARCHAR(150) NULL DEFAULT NULL AFTER name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.2 username (transitional mirrored field, nullable)
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN username VARCHAR(100) NULL DEFAULT NULL AFTER full_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.3 password_hash (transitional mirrored field, nullable)
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL AFTER password', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.4 Expand transitional role ENUM to support new roles while preserving 'admin'
ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'SECRETARY', 'FARM_WORKER') NOT NULL DEFAULT 'admin';

-- 1.5 status (initially NULL to allow rerun-safe conditional backfill)
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN status ENUM(\'ACTIVE\', \'INACTIVE\') NULL DEFAULT NULL AFTER role', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.6 failed_login_attempts (initially NULL to allow rerun-safe conditional backfill)
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'failed_login_attempts'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN failed_login_attempts INT NULL DEFAULT NULL AFTER failed_attempts', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.7 last_failed_login_at
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_failed_login_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN last_failed_login_at DATETIME NULL DEFAULT NULL AFTER failed_login_attempts', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.8 password_changed_at
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL DEFAULT NULL AFTER last_failed_login_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.9 must_change_password (non-mirrored, defaults to 0)
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_changed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.10 created_by
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_by'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN created_by INT NULL DEFAULT NULL AFTER must_change_password', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.11 last_login_at
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL AFTER created_by', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.12 disabled_at
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'disabled_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN disabled_at DATETIME NULL DEFAULT NULL AFTER last_login_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.13 disabled_by
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'disabled_by'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN disabled_by INT NULL DEFAULT NULL AFTER disabled_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 2. RERUN-SAFE CONDITIONAL BACKFILLS
-- -----------------------------------------------------------------------------

UPDATE users SET full_name = name WHERE full_name IS NULL;
UPDATE users SET username = email WHERE username IS NULL;
UPDATE users SET password_hash = password WHERE password_hash IS NULL;
UPDATE users SET status = IF(is_active = 1, 'ACTIVE', 'INACTIVE') WHERE status IS NULL;
UPDATE users SET failed_login_attempts = COALESCE(failed_attempts, 0) WHERE failed_login_attempts IS NULL;
UPDATE users SET must_change_password = 0 WHERE must_change_password IS NULL;

-- Finalize non-null defaults for non-identity fields once backfilled
ALTER TABLE users MODIFY COLUMN status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users MODIFY COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 3. UNIQUE USERNAME CONSTRAINT
-- -----------------------------------------------------------------------------

SET @idx_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_username'
);
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4. SELF-REFERENCING USER FOREIGN KEYS
-- -----------------------------------------------------------------------------

SET @fk_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_created_by'
);
SET @sql := IF(@fk_exists = 0, 'ALTER TABLE users ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_disabled_by'
);
SET @sql := IF(@fk_exists = 0, 'ALTER TABLE users ADD CONSTRAINT fk_users_disabled_by FOREIGN KEY (disabled_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 5. SESSIONS TABLE: REVOKED_AT
-- -----------------------------------------------------------------------------

SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'revoked_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE sessions ADD COLUMN revoked_at DATETIME NULL DEFAULT NULL AFTER is_active', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 6. ACTIVITY_LOGS TABLE: ACTOR_ROLE
-- -----------------------------------------------------------------------------

SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activity_logs' AND COLUMN_NAME = 'actor_role'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE activity_logs ADD COLUMN actor_role VARCHAR(50) NULL DEFAULT NULL AFTER user_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 7. LOGIN_ATTEMPTS TABLE: USERNAME COMPATIBILITY COLUMN
-- -----------------------------------------------------------------------------

SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'username'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE login_attempts ADD COLUMN username VARCHAR(100) NULL DEFAULT NULL AFTER email', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- End of Migration 008
-- -----------------------------------------------------------------------------
