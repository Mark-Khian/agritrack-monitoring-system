-- Release archived usernames and emails for reuse.
-- Archived rows stay in place, including username, email, and every historical
-- reference. Uniqueness applies only while archived_at IS NULL.
--
-- This file does not UPDATE or DELETE user rows. Every check below runs before
-- the first schema change. A failed check stops the migration.
--
-- Prerequisites: migration 012 (users.archived_at) and varchar username/email
-- columns from migration 008.
--
-- Review these queries before deploying. Identical text in username on one
-- active row and email on another active row is not a duplicate. NULL values
-- are not duplicates. If either query returns rows, stop and resolve the
-- active accounts outside this migration.
--
--   SELECT username, COUNT(*) AS copies
--   FROM users
--   WHERE archived_at IS NULL AND username IS NOT NULL
--   GROUP BY username
--   HAVING COUNT(*) > 1;
--
--   SELECT email, COUNT(*) AS copies
--   FROM users
--   WHERE archived_at IS NULL AND email IS NOT NULL
--   GROUP BY email
--   HAVING COUNT(*) > 1;
--
-- Indexes this migration may drop, and only when each is a non-prefix
-- single-column unique index on that exact column:
--   uq_users_username (username)
--   email (email)
-- Composite indexes are not changed. Any other unique index that includes
-- username or email stops the migration because it can still block reuse.

-- Refuse to continue unless the archive column and identity columns exist.
SET @archived_ready := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'archived_at'
);
SET @sql := IF(
    @archived_ready = 1,
    'SELECT 1',
    'SELECT migration_014_requires_users_archived_at FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @username_column_type := (
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'username'
      AND DATA_TYPE = 'varchar'
);
SET @email_column_type := (
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'email'
      AND DATA_TYPE = 'varchar'
);
SET @sql := IF(
    @username_column_type LIKE 'varchar(%)' AND @email_column_type LIKE 'varchar(%)',
    'SELECT 1',
    'SELECT migration_014_requires_varchar_username_and_email FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Separate checks. A value that appears once as a username and once as an
-- email does not make either count positive. NULL and archived rows are excluded.
-- sql-fragment: active-username-duplicates
SET @active_username_duplicates := (
    SELECT COUNT(*)
    FROM (
        SELECT username
        FROM users
        WHERE archived_at IS NULL
          AND username IS NOT NULL
        GROUP BY username
        HAVING COUNT(*) > 1
    ) active_username_duplicates
);
-- end-sql-fragment: active-username-duplicates
-- sql-fragment: active-email-duplicates
SET @active_email_duplicates := (
    SELECT COUNT(*)
    FROM (
        SELECT email
        FROM users
        WHERE archived_at IS NULL
          AND email IS NOT NULL
        GROUP BY email
        HAVING COUNT(*) > 1
    ) active_email_duplicates
);
-- end-sql-fragment: active-email-duplicates
SET @sql := IF(
    @active_username_duplicates = 0 AND @active_email_duplicates = 0,
    'SELECT 1',
    'SELECT migration_014_refusing_active_username_or_email_duplicates FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing generated columns must already match the expression and type this
-- migration would create. A different definition stops the run.
SET @active_username_present := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'active_username'
);
SET @active_username_compatible := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS `generated`
    JOIN INFORMATION_SCHEMA.COLUMNS source
      ON source.TABLE_SCHEMA = `generated`.TABLE_SCHEMA
     AND source.TABLE_NAME = `generated`.TABLE_NAME
     AND source.COLUMN_NAME = 'username'
    WHERE `generated`.TABLE_SCHEMA = DATABASE()
      AND `generated`.TABLE_NAME = 'users'
      AND `generated`.COLUMN_NAME = 'active_username'
      AND `generated`.COLUMN_TYPE = source.COLUMN_TYPE
      AND `generated`.IS_NULLABLE = 'YES'
      AND `generated`.EXTRA = 'STORED GENERATED'
      AND LOWER(REPLACE(REPLACE(`generated`.GENERATION_EXPRESSION, '`', ''), ' ', ''))
          = 'if(archived_atisnull,username,null)'
);
SET @sql := IF(
    @active_username_present = 0 OR @active_username_compatible = 1,
    'SELECT 1',
    'SELECT migration_014_active_username_definition_mismatch FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @active_email_present := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'active_email'
);
SET @active_email_compatible := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS `generated`
    JOIN INFORMATION_SCHEMA.COLUMNS source
      ON source.TABLE_SCHEMA = `generated`.TABLE_SCHEMA
     AND source.TABLE_NAME = `generated`.TABLE_NAME
     AND source.COLUMN_NAME = 'email'
    WHERE `generated`.TABLE_SCHEMA = DATABASE()
      AND `generated`.TABLE_NAME = 'users'
      AND `generated`.COLUMN_NAME = 'active_email'
      AND `generated`.COLUMN_TYPE = source.COLUMN_TYPE
      AND `generated`.IS_NULLABLE = 'YES'
      AND `generated`.EXTRA = 'STORED GENERATED'
      AND LOWER(REPLACE(REPLACE(`generated`.GENERATION_EXPRESSION, '`', ''), ' ', ''))
          = 'if(archived_atisnull,email,null)'
);
SET @sql := IF(
    @active_email_present = 0 OR @active_email_compatible = 1,
    'SELECT 1',
    'SELECT migration_014_active_email_definition_mismatch FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing target indexes must be unique, non-prefix, and single-column.
SET @active_username_index_rows := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'uq_users_active_username'
);
SET @active_username_index_ok := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'uq_users_active_username'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1
           AND MIN(NON_UNIQUE) = 0
           AND MAX(NON_UNIQUE) = 0
           AND MIN(COLUMN_NAME) = 'active_username'
           AND MAX(COLUMN_NAME) = 'active_username'
           AND MIN(SEQ_IN_INDEX) = 1
           AND MAX(SEQ_IN_INDEX) = 1
           AND MAX(SUB_PART) IS NULL
    ) active_username_index_ok
);
SET @sql := IF(
    @active_username_index_rows = 0 OR @active_username_index_ok = 1,
    'SELECT 1',
    'SELECT migration_014_active_username_index_mismatch FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @active_email_index_rows := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'uq_users_active_email'
);
SET @active_email_index_ok := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'uq_users_active_email'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1
           AND MIN(NON_UNIQUE) = 0
           AND MAX(NON_UNIQUE) = 0
           AND MIN(COLUMN_NAME) = 'active_email'
           AND MAX(COLUMN_NAME) = 'active_email'
           AND MIN(SEQ_IN_INDEX) = 1
           AND MAX(SEQ_IN_INDEX) = 1
           AND MAX(SUB_PART) IS NULL
    ) active_email_index_ok
);
SET @sql := IF(
    @active_email_index_rows = 0 OR @active_email_index_ok = 1,
    'SELECT 1',
    'SELECT migration_014_active_email_index_mismatch FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Known legacy indexes are removable only when they have the expected shape.
SET @legacy_username_rows := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'uq_users_username'
);
SET @legacy_username_droppable := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'uq_users_username'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1
           AND MIN(NON_UNIQUE) = 0
           AND MAX(NON_UNIQUE) = 0
           AND MIN(COLUMN_NAME) = 'username'
           AND MAX(COLUMN_NAME) = 'username'
           AND MIN(SEQ_IN_INDEX) = 1
           AND MAX(SEQ_IN_INDEX) = 1
           AND MAX(SUB_PART) IS NULL
    ) legacy_username_droppable
);
SET @sql := IF(
    @legacy_username_rows = 0 OR @legacy_username_droppable = 1,
    'SELECT 1',
    'SELECT migration_014_legacy_username_index_unexpected FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @legacy_email_rows := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'email'
);
SET @legacy_email_droppable := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'email'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1
           AND MIN(NON_UNIQUE) = 0
           AND MAX(NON_UNIQUE) = 0
           AND MIN(COLUMN_NAME) = 'email'
           AND MAX(COLUMN_NAME) = 'email'
           AND MIN(SEQ_IN_INDEX) = 1
           AND MAX(SEQ_IN_INDEX) = 1
           AND MAX(SUB_PART) IS NULL
    ) legacy_email_droppable
);
SET @sql := IF(
    @legacy_email_rows = 0 OR @legacy_email_droppable = 1,
    'SELECT 1',
    'SELECT migration_014_legacy_email_index_unexpected FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Any other unique index that includes username or email can still reject an
-- archived identity when it is reused. Leave composite indexes unchanged.
SET @unexpected_identity_unique := (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND NON_UNIQUE = 0
          AND COLUMN_NAME IN ('username', 'email')
          AND INDEX_NAME NOT IN (
              'PRIMARY',
              'uq_users_active_username',
              'uq_users_active_email',
              'uq_users_username',
              'email'
          )
        GROUP BY INDEX_NAME
    ) unexpected_identity_indexes
);
SET @sql := IF(
    @unexpected_identity_unique = 0,
    'SELECT 1',
    'SELECT migration_014_unexpected_unique_index_blocks_archived_reuse FROM users WHERE 1 = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Schema changes start only after the checks above have passed.
SET @sql := IF(
    @active_username_present = 0,
    CONCAT(
        'ALTER TABLE users ADD COLUMN active_username ',
        @username_column_type,
        ' GENERATED ALWAYS AS (IF(archived_at IS NULL, username, NULL)) STORED'
    ),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @active_email_present = 0,
    CONCAT(
        'ALTER TABLE users ADD COLUMN active_email ',
        @email_column_type,
        ' GENERATED ALWAYS AS (IF(archived_at IS NULL, email, NULL)) STORED'
    ),
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @active_username_index_rows = 0,
    'ALTER TABLE users ADD UNIQUE KEY uq_users_active_username (active_username)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @active_email_index_rows = 0,
    'ALTER TABLE users ADD UNIQUE KEY uq_users_active_email (active_email)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @legacy_username_droppable = 1,
    'ALTER TABLE users DROP INDEX `uq_users_username`',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    @legacy_email_droppable = 1,
    'ALTER TABLE users DROP INDEX `email`',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
