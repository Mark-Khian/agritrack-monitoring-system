-- Migration 001: Add is_system_generated flag to activities
-- Run once before starting the server

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS is_system_generated TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE activities
  ADD INDEX IF NOT EXISTS idx_planting_id (planting_id);
