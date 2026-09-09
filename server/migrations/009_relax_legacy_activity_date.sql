-- Migration 009: Relax legacy activity_date column to allow NULLs
-- The backend has transitioned to planned_date and actual_date. The legacy activity_date 
-- is omitted in newer INSERTs, causing strict-mode violations since it lacks a default.
-- This safely relaxes the constraint without modifying other logic.

SET @dbname = DATABASE();
SET @tablename = 'activities';
SET @columnname = 'activity_date';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
      AND IS_NULLABLE = 'NO'
  ) > 0,
  'ALTER TABLE activities MODIFY COLUMN activity_date DATE NULL DEFAULT NULL;',
  'SELECT 1;'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
