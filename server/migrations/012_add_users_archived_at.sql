-- Soft-archive for disabled subordinate accounts (Accounts list removal without hard delete).
-- Rerun-safe: only adds archived_at when missing.

SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'archived_at'
);
SET @sql := IF(
    @col_exists = 0,
    'ALTER TABLE users ADD COLUMN archived_at DATETIME NULL DEFAULT NULL AFTER disabled_by',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
