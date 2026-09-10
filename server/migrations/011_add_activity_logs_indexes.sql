-- Migration 011: activity_logs indexes for Admin audit pagination and filters.
-- Additive and rerun-safe. TEST-only during Phase 8. Does not modify crop tables
-- and does not add a details column or a new audit table.

SET @idx_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'activity_logs'
      AND INDEX_NAME = 'idx_activity_logs_created_id'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE activity_logs ADD KEY idx_activity_logs_created_id (created_at, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'activity_logs'
      AND INDEX_NAME = 'idx_activity_logs_action_created'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE activity_logs ADD KEY idx_activity_logs_action_created (action, created_at)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
