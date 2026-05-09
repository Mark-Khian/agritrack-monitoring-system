-- Migration 005: Manual growth override flag + lifecycle template index for idempotent partial/full generation
-- Idempotent: uses IF NOT EXISTS patterns consistent with prior migrations.

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS growth_plan_manual_override TINYINT(1) NOT NULL DEFAULT 0
  AFTER adjustment_days;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS lifecycle_template_index TINYINT NULL
  COMMENT 'Index into LIFECYCLE_ACTIVITY_TEMPLATES (0-6); NULL for legacy/user rows'
  AFTER schedule_ratio;

ALTER TABLE activities
  ADD INDEX IF NOT EXISTS idx_activities_planting_template (planting_id, is_system_generated, lifecycle_template_index);

-- Legacy system rows may have lifecycle_template_index NULL; scheduler falls back to schedule_ratio / row order.
