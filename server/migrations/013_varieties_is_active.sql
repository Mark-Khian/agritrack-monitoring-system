-- Soft-disable Rainfed/DSR and Upland catalog rows; keep rows for historical plantings.
-- Rerun-safe: adds is_active when missing, then deactivates non-Irrigated classes.

SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'varieties' AND COLUMN_NAME = 'is_active'
);
SET @sql := IF(
    @col_exists = 0,
    'ALTER TABLE varieties ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER max_growth_days',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE varieties
SET is_active = 0
WHERE variety_class IN (
    'Rainfed / Dry-Seeded Varieties (DSR)',
    'Upland Varieties'
);

UPDATE varieties
SET is_active = 1
WHERE variety_class = 'Irrigated / Lowland Varieties';
