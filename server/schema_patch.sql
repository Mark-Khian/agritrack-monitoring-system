-- ================================================================
-- USERS TABLE — Schema Patch
-- Run this in MySQL Workbench, phpMyAdmin, or your MySQL CLI
-- SAFE: Uses ALTER TABLE — does NOT delete existing data
-- ================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active       TINYINT(1)  NOT NULL DEFAULT 1    COMMENT 'Account active status',
  ADD COLUMN IF NOT EXISTS failed_attempts INT         NOT NULL DEFAULT 0    COMMENT 'Consecutive failed login count',
  ADD COLUMN IF NOT EXISTS locked_until    DATETIME    NULL     DEFAULT NULL  COMMENT 'Account locked until this datetime';

-- Verify the columns were added
DESCRIBE users;
