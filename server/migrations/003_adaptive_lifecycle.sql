-- Migration 003: State-driven lifecycle, adaptive growth plan, activity scheduling metadata
-- Run after 001 and 002. Review BACKUP / production schema before applying.
--
-- Summary:
-- 1) plantings: lifecycle_state, growth plan fields, drop calendar growth_stage enum
-- 2) activities: cancelled status, original_scheduled_date, reschedule_count, schedule_ratio
-- 3) Backfill from existing expected_harvest / status

-- ── plantings: new lifecycle & planning columns ───────────────────────────
ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS lifecycle_state
    ENUM('PLANNED','ACTIVE','MATURING','READY_FOR_HARVEST','HARVESTED','ABANDONED')
    NOT NULL DEFAULT 'ACTIVE'
    AFTER season;

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS expected_growth_days INT NULL AFTER lifecycle_state;

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS adjustment_days INT NOT NULL DEFAULT 0 AFTER expected_growth_days;

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS lifecycle_state_changed_at DATETIME NULL AFTER adjustment_days;

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS lifecycle_state_reason TEXT NULL AFTER lifecycle_state_changed_at;

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS growth_stage_recorded VARCHAR(100) NULL AFTER lifecycle_state_reason;

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS growth_stage_source
    ENUM('user','system_estimate') NOT NULL DEFAULT 'system_estimate'
    AFTER growth_stage_recorded;

-- Backfill expected_growth_days from calendar span (minimum 1 day)
UPDATE plantings
SET expected_growth_days = GREATEST(1, DATEDIFF(expected_harvest, planting_date))
WHERE expected_growth_days IS NULL;

-- Default for any stragglers
UPDATE plantings
SET expected_growth_days = 120
WHERE expected_growth_days IS NULL;

ALTER TABLE plantings
  MODIFY COLUMN expected_growth_days INT NOT NULL;

-- Copy legacy agronomic stage into growth_stage_recorded before dropping growth_stage
UPDATE plantings
SET growth_stage_recorded = growth_stage,
    growth_stage_source = 'system_estimate'
WHERE growth_stage_recorded IS NULL;

-- Lifecycle from operational status
UPDATE plantings SET lifecycle_state = 'HARVESTED' WHERE status = 'completed';
UPDATE plantings SET lifecycle_state = 'ABANDONED' WHERE status = 'failed';

-- Drop calendar-driven growth_stage column (no longer authoritative)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'plantings'
    AND COLUMN_NAME = 'growth_stage'
);
SET @sql := IF(@col_exists > 0, 'ALTER TABLE plantings DROP COLUMN growth_stage', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Recompute expected_harvest from plan (single source of truth: date = planting + days + adjustment)
UPDATE plantings
SET expected_harvest = DATE_ADD(planting_date, INTERVAL (expected_growth_days + adjustment_days) DAY);

ALTER TABLE plantings
  ADD INDEX IF NOT EXISTS idx_plantings_lifecycle (lifecycle_state);

-- ── activities: scheduling metadata & cancelled status ─────────────────────
ALTER TABLE activities
  MODIFY COLUMN status ENUM('pending','ongoing','completed','cancelled') NOT NULL DEFAULT 'pending';

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS original_scheduled_date DATE NULL AFTER activity_date;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS reschedule_count INT NOT NULL DEFAULT 0 AFTER original_scheduled_date;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS schedule_ratio DECIMAL(8,6) NULL AFTER reschedule_count;

UPDATE activities
SET original_scheduled_date = activity_date
WHERE original_scheduled_date IS NULL;
