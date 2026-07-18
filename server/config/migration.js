const runMigrations = async (db) => {
    console.log('🔄 Running database migrations...');
    try {
        const [[{ hasFieldsTable }]] = await db.query(
            `SELECT COUNT(*) as hasFieldsTable
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'fields'`
        );

        const [[{ hasPlantingsTable }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsTable
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'`
        );

        if (hasPlantingsTable === 0) {
            console.log('⚠️ plantings table not found; skipping Fields removal migration.');
            console.log('🎉 Migrations completed successfully!');
            return;
        }

        // ── Plantings ownership + embedded field metadata ───────────────────────

        const [[{ hasPlantingsUserId }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsUserId
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND COLUMN_NAME = 'user_id'`
        );
        if (hasPlantingsUserId === 0) {
            console.log('🔹 Adding user_id to plantings...');
            await db.query('ALTER TABLE plantings ADD COLUMN user_id INT NULL AFTER id');
            await db.query('ALTER TABLE plantings ADD INDEX idx_plantings_user_id (user_id)');
        }

        const [[{ hasPlantingsFieldName }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsFieldName
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND COLUMN_NAME = 'field_name'`
        );
        if (hasPlantingsFieldName === 0) {
            console.log('🔹 Adding field_name to plantings...');
            await db.query("ALTER TABLE plantings ADD COLUMN field_name VARCHAR(120) NULL AFTER user_id");
            await db.query('ALTER TABLE plantings ADD INDEX idx_plantings_field_name (field_name)');
        }

        const [[{ hasPlantingsFieldLocation }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsFieldLocation
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND COLUMN_NAME = 'field_location'`
        );
        if (hasPlantingsFieldLocation === 0) {
            console.log('🔹 Adding field_location to plantings (optional)...');
            await db.query("ALTER TABLE plantings ADD COLUMN field_location VARCHAR(255) NULL AFTER field_name");
        }

        const [[{ hasPlantingsFieldSize }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsFieldSize
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND COLUMN_NAME = 'field_size'`
        );
        if (hasPlantingsFieldSize === 0) {
            console.log('🔹 Adding field_size to plantings (optional)...');
            await db.query("ALTER TABLE plantings ADD COLUMN field_size DECIMAL(10,2) NULL AFTER field_location");
        }

        const [[{ hasPlantingsFieldCategory }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsFieldCategory
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND COLUMN_NAME = 'field_category'`
        );
        if (hasPlantingsFieldCategory === 0) {
            console.log('🔹 Adding field_category to plantings (optional)...');
            await db.query("ALTER TABLE plantings ADD COLUMN field_category VARCHAR(100) NULL AFTER field_size");
        }

        // If legacy Fields table exists, migrate linked data into plantings
        if (hasFieldsTable > 0) {
            const [[{ hasPlantingsFieldId }]] = await db.query(
                `SELECT COUNT(*) as hasPlantingsFieldId
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'plantings'
                   AND COLUMN_NAME = 'field_id'`
            );
            if (hasPlantingsFieldId > 0) {
                console.log('🔹 Backfilling plantings.user_id + field metadata from fields...');
                await db.query(
                    `UPDATE plantings p
                     JOIN fields f ON p.field_id = f.id
                     SET
                       p.user_id = COALESCE(p.user_id, f.user_id),
                       p.field_name = COALESCE(p.field_name, f.name),
                       p.field_location = COALESCE(p.field_location, f.location),
                       p.field_size = COALESCE(p.field_size, f.size),
                       p.field_category = COALESCE(p.field_category, f.category)
                     WHERE p.deleted_at IS NULL`
                );
            }
        }

        // Fallback for any null user_id (orphaned legacy rows)
        const [users] = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        if (users.length > 0) {
            const defaultUserId = users[0].id;
            await db.query('UPDATE plantings SET user_id = ? WHERE user_id IS NULL', [defaultUserId]);
        }

        // Ensure a usable field_name for all rows
        await db.query(
            `UPDATE plantings
             SET field_name = CONCAT('Field ', id)
             WHERE field_name IS NULL OR field_name = ''`
        );

        // Make user_id + field_name required
        await db.query('ALTER TABLE plantings MODIFY COLUMN user_id INT NOT NULL');
        await db.query('ALTER TABLE plantings MODIFY COLUMN field_name VARCHAR(120) NOT NULL');

        // Normalize duplicates BEFORE adding the uniqueness constraint.
        // If a user has multiple plantings with the same field_name + planting_date,
        // we keep the oldest record's field_name and suffix the rest to make them unique.
        const [dupKeys] = await db.query(
            `SELECT user_id, field_name, planting_date, COUNT(*) AS cnt
             FROM plantings
             WHERE deleted_at IS NULL
             GROUP BY user_id, field_name, planting_date
             HAVING cnt > 1
             LIMIT 2000`
        );

        if (dupKeys.length > 0) {
            console.warn(`⚠️ Found ${dupKeys.length} duplicate planting key(s); normalizing field_name to satisfy uq_user_field_planting...`);
            for (const k of dupKeys) {
                const [rows] = await db.query(
                    `SELECT id
                     FROM plantings
                     WHERE user_id = ? AND field_name = ? AND planting_date = ?
                       AND deleted_at IS NULL
                     ORDER BY created_at ASC, id ASC`,
                    [k.user_id, k.field_name, k.planting_date]
                );
                // Keep first row untouched, rename the rest.
                for (let i = 1; i < rows.length; i += 1) {
                    const id = rows[i].id;
                    const suffix = ` (dup ${id})`;
                    const base = String(k.field_name || 'Field').slice(0, 120 - suffix.length);
                    await db.query(
                        `UPDATE plantings
                         SET field_name = ?
                         WHERE id = ?`,
                        [`${base}${suffix}`, id]
                    );
                }
            }
            console.log('✅ Duplicate planting keys normalized.');
        }

        // Unique planting per user/field_name/date (replaces uq_field_planting)
        const [[{ hasIndex }]] = await db.query(
            `SELECT COUNT(*) as hasIndex
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND INDEX_NAME = 'uq_user_field_planting'`
        );
        if (hasIndex === 0) {
            try {
                await db.query(
                    'ALTER TABLE plantings ADD UNIQUE KEY uq_user_field_planting (user_id, field_name, planting_date)'
                );
                console.log('✅ Added uq_user_field_planting constraint.');
            } catch (err) {
                console.warn('⚠️ Could not add uq_user_field_planting:', err.message);
            }
        }

        // ── Drop legacy plantings.field_id + Fields table ───────────────────────
        const [[{ hasPlantingsFieldId }]] = await db.query(
            `SELECT COUNT(*) as hasPlantingsFieldId
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'plantings'
               AND COLUMN_NAME = 'field_id'`
        );
        if (hasPlantingsFieldId > 0) {
            console.log('🔹 Dropping plantings.field_id dependency (legacy Fields module)...');
            try {
                await db.query('ALTER TABLE plantings DROP FOREIGN KEY fk_plantings_field');
            } catch {
                try { await db.query('ALTER TABLE plantings DROP FOREIGN KEY plantings_ibfk_1'); }
                catch { /* ignore */ }
            }
            try {
                await db.query('ALTER TABLE plantings DROP KEY uq_field_planting');
            } catch (err) {
                /* ignore */
            }
            await db.query('ALTER TABLE plantings DROP COLUMN field_id');
            console.log('✅ Dropped plantings.field_id.');
        }

        if (hasFieldsTable > 0) {
            console.log('🔹 Dropping legacy fields table...');
            try {
                await db.query('DROP TABLE fields');
                console.log('✅ Dropped fields table.');
            } catch (err) {
                // Surface what is still referencing fields so the user can decide whether to migrate/drop it.
                try {
                    const [refs] = await db.query(
                        `SELECT
                            TABLE_NAME AS table_name,
                            COLUMN_NAME AS column_name,
                            CONSTRAINT_NAME AS constraint_name
                         FROM information_schema.KEY_COLUMN_USAGE
                         WHERE CONSTRAINT_SCHEMA = DATABASE()
                           AND REFERENCED_TABLE_NAME = 'fields'
                         ORDER BY TABLE_NAME, COLUMN_NAME`
                    );
                    const summary = refs.length === 0
                        ? '(no FK references found in information_schema)'
                        : refs.map((r) => `${r.table_name}.${r.column_name} (${r.constraint_name})`).join(', ');
                    console.warn('⚠️ Could not drop fields table (still referenced by FK):', err.message);
                    console.warn('   References:', summary);
                } catch (metaErr) {
                    console.warn('⚠️ Could not drop fields table (may be referenced elsewhere):', err.message);
                    console.warn('   Also failed to inspect FK references:', metaErr.message);
                }
            }
        }

        // ── Alter activities.activity_type to VARCHAR(100) ───────────────────
        const [[{ isEnum }]] = await db.query(
            `SELECT COUNT(*) as isEnum
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'activities'
               AND COLUMN_NAME = 'activity_type'
               AND DATA_TYPE = 'enum'`
        );
        if (isEnum > 0) {
            console.log('🔹 Modifying activities.activity_type from ENUM to VARCHAR(100)...');
            await db.query('ALTER TABLE activities MODIFY COLUMN activity_type VARCHAR(100) NOT NULL');
            console.log('✅ Modified activities.activity_type to VARCHAR(100).');
        }

        // ── Add financial_value to harvests ──────────────────────────────────
        const [[{ hasFinancialValue }]] = await db.query(
            `SELECT COUNT(*) as hasFinancialValue
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'harvests'
               AND COLUMN_NAME = 'financial_value'`
        );
        if (hasFinancialValue === 0) {
            console.log('🔹 Adding financial_value to harvests...');
            await db.query('ALTER TABLE harvests ADD COLUMN financial_value DECIMAL(10,2) NULL AFTER remarks');
            console.log('✅ Added financial_value to harvests.');
        }

        console.log('🎉 Migrations completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    }
};

module.exports = runMigrations;
