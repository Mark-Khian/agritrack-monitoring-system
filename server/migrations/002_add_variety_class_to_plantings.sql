
-- Migration 002: Add variety_class to plantings for tiered variety selection
-- Run once before starting the server

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS variety_class VARCHAR(100) NOT NULL DEFAULT 'Irrigated / Lowland Varieties' AFTER field_id;

ALTER TABLE plantings
  ADD INDEX IF NOT EXISTS idx_variety_class (variety_class);
