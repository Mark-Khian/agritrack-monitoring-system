-- Migration 004: Variety catalog + plantings.variety_id (nullable FK)
-- Run after 003. Seeds all known rice varieties with default/min/max growth days for planning.

CREATE TABLE IF NOT EXISTS varieties (
  id INT NOT NULL AUTO_INCREMENT,
  variety_class VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  default_expected_growth_days INT NOT NULL DEFAULT 120,
  min_growth_days INT NOT NULL DEFAULT 90,
  max_growth_days INT NOT NULL DEFAULT 150,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_varieties_class_name (variety_class, name),
  KEY idx_varieties_class (variety_class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed: Irrigated / Lowland (default 120d, window 100–140)
INSERT IGNORE INTO varieties (variety_class, name, default_expected_growth_days, min_growth_days, max_growth_days) VALUES
('Irrigated / Lowland Varieties', 'NSIC Rc110', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc118', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc120', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc128', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc130', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc134', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc160', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc172', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc194', 120, 100, 140),
('Irrigated / Lowland Varieties', 'NSIC Rc212', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc214', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc216', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc218 SR', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc220 SR', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc222', 120, 100, 140),
('Irrigated / Lowland Varieties', 'NSIC Rc224', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc226', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc238', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc240', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc242 SR', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc298', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc300', 120, 100, 140),
('Irrigated / Lowland Varieties', 'NSIC Rc396', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc398', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc414', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc482SR', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc484SR', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc508', 120, 100, 140),
('Irrigated / Lowland Varieties', 'Rc510', 120, 100, 140),
('Irrigated / Lowland Varieties', 'PSB RC1', 120, 100, 140),
('Irrigated / Lowland Varieties', 'RC2', 120, 100, 140),
('Irrigated / Lowland Varieties', 'RC4', 120, 100, 140),
('Irrigated / Lowland Varieties', 'RC6', 120, 100, 140),
('Irrigated / Lowland Varieties', 'RC8', 120, 100, 140),
('Irrigated / Lowland Varieties', 'RC10', 120, 100, 140),
('Irrigated / Lowland Varieties', 'RC18', 120, 100, 140);

-- Rainfed / DSR (slightly shorter window typical)
INSERT IGNORE INTO varieties (variety_class, name, default_expected_growth_days, min_growth_days, max_growth_days) VALUES
('Rainfed / Dry-Seeded Varieties (DSR)', 'NSIC 2020 Rc598', 115, 95, 135),
('Rainfed / Dry-Seeded Varieties (DSR)', 'Rc596', 115, 95, 135),
('Rainfed / Dry-Seeded Varieties (DSR)', 'Rc594', 115, 95, 135),
('Rainfed / Dry-Seeded Varieties (DSR)', 'Rc592', 115, 95, 135),
('Rainfed / Dry-Seeded Varieties (DSR)', 'NSIC 2011 Rc278', 115, 95, 135);

-- Upland
INSERT IGNORE INTO varieties (variety_class, name, default_expected_growth_days, min_growth_days, max_growth_days) VALUES
('Upland Varieties', 'NSIC Rc29', 110, 90, 130),
('Upland Varieties', 'Rc27', 110, 90, 130),
('Upland Varieties', 'Rc25', 110, 90, 130),
('Upland Varieties', 'NSIC Rc286', 110, 90, 130),
('Upland Varieties', 'RC9', 110, 90, 130),
('Upland Varieties', 'RC11', 110, 90, 130),
('Upland Varieties', 'PSB RC3', 110, 90, 130),
('Upland Varieties', 'RC5', 110, 90, 130),
('Upland Varieties', 'RC7', 110, 90, 130);

ALTER TABLE plantings
  ADD COLUMN IF NOT EXISTS variety_id INT NULL AFTER variety;

ALTER TABLE plantings
  ADD INDEX IF NOT EXISTS idx_plantings_variety_id (variety_id);

-- FK (ignore if exists — manual check in non-supporting MySQL versions)
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'plantings'
    AND CONSTRAINT_NAME = 'fk_plantings_variety'
);
SET @sqlfk := IF(@fk = 0,
  'ALTER TABLE plantings ADD CONSTRAINT fk_plantings_variety FOREIGN KEY (variety_id) REFERENCES varieties(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmtfk FROM @sqlfk;
EXECUTE stmtfk;
DEALLOCATE PREPARE stmtfk;

UPDATE plantings p
INNER JOIN varieties v ON v.name = p.variety AND v.variety_class = p.variety_class
SET p.variety_id = v.id
WHERE p.variety_id IS NULL AND p.deleted_at IS NULL;
