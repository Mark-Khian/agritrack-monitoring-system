'use strict';

const { ensureAllSystemTemplates } = require('../../utils/activityScheduler');
const { expectedHarvestFromPlan, calendarDaysBetween } = require('../../utils/plantingDates');
const { SYNTHETIC_MARKER, SEED_DATASET_ID } = require('./constants');
const { FIELD_REGISTRY, harvestRemarks, ACTIVE_CROP } = require('./datasetDefinition');
const { toYmd } = require('./dateNormalize');

const clampGrowthDays = (requested, varietyMeta) => {
    let days = Number(requested) || varietyMeta.default_expected_growth_days || 120;
    const min = Number(varietyMeta.min_growth_days) || 90;
    const max = Number(varietyMeta.max_growth_days) || 150;
    if (days < min) days = min;
    if (days > max) days = max;
    return days;
};

const seedMarkerSql = `%${SEED_DATASET_ID}%`;

/**
 * Any non-deleted planting on a target field name (collision surface).
 */
const findFieldCollisions = async (connection) => {
    const [rows] = await connection.query(
        `SELECT p.id, p.field_name, p.status, p.planting_date, p.lifecycle_state_reason,
                h.id AS harvest_id, h.remarks AS harvest_remarks
         FROM plantings p
         LEFT JOIN harvests h
           ON h.planting_id = p.id AND h.deleted_at IS NULL
         WHERE p.deleted_at IS NULL
           AND p.field_name IN (?)
         ORDER BY p.field_name ASC, p.id ASC`,
        [FIELD_REGISTRY]
    );
    return rows.map((row) => {
        const reason = String(row.lifecycle_state_reason || '');
        const remarks = String(row.harvest_remarks || '');
        const seedOwned = (
            reason.includes(SEED_DATASET_ID)
            || reason.includes(SYNTHETIC_MARKER)
            || remarks.includes(SEED_DATASET_ID)
            || remarks.includes(SYNTHETIC_MARKER)
        );
        return { ...row, seed_owned: seedOwned };
    });
};

const classifyCollisions = (collisions) => {
    const seedOwned = collisions.filter((c) => c.seed_owned);
    const foreign = collisions.filter((c) => !c.seed_owned);
    return {
        collisions,
        seedOwned,
        foreign,
        hasAny: collisions.length > 0,
        hasForeign: foreign.length > 0,
        allSeedOwned: collisions.length > 0 && foreign.length === 0,
    };
};

const getOwnerUserId = async (connection) => {
    const [rows] = await connection.query(
        `SELECT id FROM users
         WHERE role IN ('admin', 'ADMIN')
           AND is_active = 1
           AND status = 'ACTIVE'
           AND (archived_at IS NULL)
         ORDER BY id ASC
         LIMIT 1`
    );
    if (!rows.length) {
        throw new Error('No active admin user found to own seeded plantings.');
    }
    return rows[0].id;
};

const listActivityIds = async (connection, plantingId) => {
    const [rows] = await connection.query(
        `SELECT id FROM activities WHERE planting_id = ? ORDER BY id ASC`,
        [plantingId]
    );
    return rows.map((r) => r.id);
};

const insertPlanting = async (connection, { ownerId, crop, variety }) => {
    const egd = clampGrowthDays(crop.expected_growth_days, variety);
    const expectedHarvest = expectedHarvestFromPlan(crop.planting_date, egd, 0);
    const season = crop.cropping_season === 'WET_SEASON' ? 'wet' : 'dry';

    const [result] = await connection.query(
        `INSERT INTO plantings
         (user_id, field_name, field_name_snapshot, field_size, variety_class, variety, variety_id,
          planting_date, expected_harvest, season, cropping_season, establishment_method, field_condition,
          lifecycle_state, expected_growth_days, adjustment_days, growth_plan_manual_override,
          lifecycle_state_changed_at, lifecycle_state_reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0, 0, NOW(), ?, 'active')`,
        [
            ownerId,
            crop.field_name,
            crop.field_name,
            crop.field_size != null ? crop.field_size : null,
            variety.variety_class,
            variety.variety,
            variety.variety_id,
            crop.planting_date,
            expectedHarvest,
            season,
            crop.cropping_season,
            crop.establishment_method,
            crop.field_condition,
            egd,
            `${SYNTHETIC_MARKER} [${SEED_DATASET_ID}:${crop.key}]`,
        ]
    );
    return {
        plantingId: result.insertId,
        expectedGrowthDays: egd,
        expectedHarvest,
    };
};

const completeActivityByType = async (connection, plantingId, activityType, actualDate, notes) => {
    const [rows] = await connection.query(
        `SELECT id, notes FROM activities
         WHERE planting_id = ?
           AND activity_type = ?
           AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT 1`,
        [plantingId, activityType]
    );
    if (!rows.length) return false;
    const mergedNotes = notes
        ? [rows[0].notes, notes].filter(Boolean).join('\n')
        : rows[0].notes;
    await connection.query(
        `UPDATE activities
         SET status = 'COMPLETED',
             actual_date = ?,
             notes = ?
         WHERE id = ?`,
        [actualDate, mergedNotes, rows[0].id]
    );
    return true;
};

const shapePendingActivity = async (connection, plantingId, activityType, plannedDate, notes) => {
    const [rows] = await connection.query(
        `SELECT id, notes FROM activities
         WHERE planting_id = ?
           AND activity_type = ?
           AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT 1`,
        [plantingId, activityType]
    );
    if (!rows.length) return false;
    const mergedNotes = notes
        ? [rows[0].notes, notes].filter(Boolean).join('\n')
        : rows[0].notes;
    await connection.query(
        `UPDATE activities
         SET status = 'PENDING',
             planned_date = ?,
             actual_date = NULL,
             notes = ?
         WHERE id = ?`,
        [plannedDate, mergedNotes, rows[0].id]
    );
    return true;
};

const completePreHarvestHistory = async (connection, plantingId, plantingDate, harvestDate) => {
    const [rows] = await connection.query(
        `SELECT id, activity_type, planned_date, schedule_ratio
         FROM activities
         WHERE planting_id = ?
           AND deleted_at IS NULL
           AND status = 'PENDING'
           AND activity_type <> 'harvesting'
         ORDER BY COALESCE(schedule_ratio, 0) ASC, id ASC`,
        [plantingId]
    );

    for (const row of rows) {
        let actual = row.planned_date
            ? toYmd(row.planned_date)
            : plantingDate;
        if (actual < plantingDate) actual = plantingDate;
        if (actual > harvestDate) {
            const d = new Date(`${harvestDate}T12:00:00.000Z`);
            d.setUTCDate(d.getUTCDate() - 1);
            actual = d.toISOString().slice(0, 10);
            if (actual < plantingDate) actual = plantingDate;
        }
        await connection.query(
            `UPDATE activities
             SET status = 'COMPLETED',
                 actual_date = ?,
                 notes = CONCAT(COALESCE(notes, ''), IF(notes IS NULL OR notes = '', '', '\\n'), ?)
             WHERE id = ?`,
            [actual, `${SYNTHETIC_MARKER}: completed for evaluation demo history.`, row.id]
        );
    }
};

/**
 * Mirrors harvestController createHarvest closeout (uses caller transaction connection).
 */
const recordHarvest = async (connection, {
    plantingId,
    plantingDate,
    harvestDate,
    yieldKg,
    qualityGrade,
    financialValue,
    remarks,
    cropKey,
}) => {
    const maturity = calendarDaysBetween(plantingDate, harvestDate);
    if (maturity < 60) {
        throw new Error(
            `Harvest for planting #${plantingId} violates 60-day rule `
            + `(${plantingDate} → ${harvestDate} = ${maturity} days).`
        );
    }

    const [existing] = await connection.query(
        `SELECT id, deleted_at FROM harvests WHERE planting_id = ? FOR UPDATE`,
        [plantingId]
    );

    let harvestId;
    if (existing.length > 0) {
        if (existing[0].deleted_at === null) {
            throw new Error(`Harvest already exists for planting #${plantingId}.`);
        }
        await connection.query(
            `UPDATE harvests
             SET harvest_date = ?, yield_kg = ?, quality_grade = ?,
                 remarks = ?, financial_value = ?, deleted_at = NULL
             WHERE id = ?`,
            [harvestDate, yieldKg, qualityGrade, remarks, financialValue, existing[0].id]
        );
        harvestId = existing[0].id;
    } else {
        const [ins] = await connection.query(
            `INSERT INTO harvests
             (planting_id, harvest_date, yield_kg, quality_grade, remarks, financial_value)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [plantingId, harvestDate, yieldKg, qualityGrade, remarks, financialValue]
        );
        harvestId = ins.insertId;
    }

    // Keep dataset id in lifecycle_state_reason so replace/rollback can prove ownership.
    await connection.query(
        `UPDATE plantings
         SET status = 'completed',
             lifecycle_state = 'HARVESTED',
             lifecycle_state_changed_at = NOW(),
             lifecycle_state_reason = ?
         WHERE id = ?`,
        [
            `Harvest recorded — ${SYNTHETIC_MARKER} [${SEED_DATASET_ID}:${cropKey}]`,
            plantingId,
        ]
    );

    await connection.query(
        `UPDATE activities
         SET status = 'COMPLETED', actual_date = ?
         WHERE planting_id = ?
           AND activity_type = 'harvesting'
           AND status = 'PENDING'
           AND deleted_at IS NULL`,
        [harvestDate, plantingId]
    );

    await connection.query(
        `UPDATE activities
         SET status = 'CANCELLED'
         WHERE planting_id = ?
           AND status = 'PENDING'
           AND actual_date IS NULL
           AND deleted_at IS NULL`,
        [plantingId]
    );

    await connection.query(
        `DELETE FROM notifications
         WHERE type IN ('activity_due', 'activity_overdue')
           AND related_id IN (
                SELECT id FROM activities WHERE planting_id = ?
           )`,
        [plantingId]
    );

    return harvestId;
};

const shapeActiveCropActivities = async (connection, plantingId) => {
    const plan = ACTIVE_CROP.activity_plan;
    for (const item of plan.complete) {
        const ok = await completeActivityByType(
            connection,
            plantingId,
            item.activity_type,
            item.actual_date,
            item.notes
        );
        if (!ok) {
            throw new Error(`Active crop missing template activity "${item.activity_type}"`);
        }
    }
    if (!(await shapePendingActivity(
        connection,
        plantingId,
        plan.overdue.activity_type,
        plan.overdue.planned_date,
        plan.overdue.notes
    ))) {
        throw new Error(`Active crop missing overdue activity "${plan.overdue.activity_type}"`);
    }
    if (!(await shapePendingActivity(
        connection,
        plantingId,
        plan.due_today.activity_type,
        plan.due_today.planned_date,
        plan.due_today.notes
    ))) {
        throw new Error(`Active crop missing due-today activity "${plan.due_today.activity_type}"`);
    }
};

/**
 * All writes use the provided connection (must already be inside a transaction).
 * ensureAllSystemTemplates participates via the same connection — no separate pool writes.
 */
const seedOneCrop = async (connection, { ownerId, crop, variety }) => {
    const { plantingId, expectedGrowthDays, expectedHarvest } = await insertPlanting(
        connection,
        { ownerId, crop, variety }
    );
    await ensureAllSystemTemplates(plantingId, crop.planting_date, expectedGrowthDays, connection);

    let harvestId = null;
    if (crop.status === 'active') {
        await shapeActiveCropActivities(connection, plantingId);
    } else {
        await completePreHarvestHistory(
            connection,
            plantingId,
            crop.planting_date,
            crop.harvest_date
        );
        harvestId = await recordHarvest(connection, {
            plantingId,
            plantingDate: crop.planting_date,
            harvestDate: crop.harvest_date,
            yieldKg: crop.yield_kg,
            qualityGrade: crop.quality_grade,
            financialValue: crop.financial_value,
            remarks: harvestRemarks(crop.key),
            cropKey: crop.key,
        });
    }

    const activityIds = await listActivityIds(connection, plantingId);
    return {
        key: crop.key,
        field_name: crop.field_name,
        plantingId,
        harvestId,
        activityIds,
        expectedHarvest,
        status: crop.status === 'active' ? 'active' : 'completed',
        harvest_date: crop.harvest_date || null,
        variety_id: variety.variety_id,
        variety: variety.variety,
    };
};

/**
 * Verify manifest IDs still match expected synthetic field + marker, then delete.
 */
const rollbackFromManifest = async (connection, manifest) => {
    const plantingIds = (manifest.plantings || []).map((p) => p.planting_id);
    const expectedById = new Map((manifest.plantings || []).map((p) => [p.planting_id, p]));

    if (!plantingIds.length) {
        return {
            deletedPlantings: 0,
            deletedHarvests: 0,
            deletedActivities: 0,
            deletedNotifications: 0,
            verified: [],
        };
    }

    const [rows] = await connection.query(
        `SELECT p.id, p.field_name, p.lifecycle_state_reason, h.remarks AS harvest_remarks
         FROM plantings p
         LEFT JOIN harvests h ON h.planting_id = p.id AND h.deleted_at IS NULL
         WHERE p.id IN (?)`,
        [plantingIds]
    );
    const found = new Map(rows.map((r) => [r.id, r]));

    for (const plantingId of plantingIds) {
        const expected = expectedById.get(plantingId);
        const row = found.get(plantingId);
        if (!row) {
            throw new Error(`Manifest planting #${plantingId} no longer exists — aborting rollback.`);
        }
        if (row.field_name !== expected.field_name) {
            throw new Error(
                `Manifest planting #${plantingId} field_name mismatch `
                + `(db="${row.field_name}" expected="${expected.field_name}") — aborting.`
            );
        }
        const blob = `${row.lifecycle_state_reason || ''}\n${row.harvest_remarks || ''}`;
        if (!blob.includes(SEED_DATASET_ID) && !blob.includes(SYNTHETIC_MARKER)) {
            throw new Error(
                `Manifest planting #${plantingId} failed synthetic marker verification — aborting.`
            );
        }
    }

    const activityIds = (manifest.activity_ids || []).length
        ? manifest.activity_ids
        : (await connection.query(
            `SELECT id FROM activities WHERE planting_id IN (?)`,
            [plantingIds]
        ))[0].map((r) => r.id);

    let deletedNotifications = 0;
    if (activityIds.length) {
        const [n1] = await connection.query(
            `DELETE FROM notifications
             WHERE type IN ('activity_due', 'activity_overdue')
               AND related_id IN (?)`,
            [activityIds]
        );
        deletedNotifications += n1.affectedRows || 0;
    }
    const [n2] = await connection.query(
        `DELETE FROM notifications
         WHERE type = 'lifecycle_update'
           AND related_id IN (?)`,
        [plantingIds]
    );
    deletedNotifications += n2.affectedRows || 0;

    const harvestIds = (manifest.harvests || [])
        .map((h) => h.harvest_id)
        .filter(Boolean);
    let deletedHarvests = 0;
    if (harvestIds.length) {
        const [h] = await connection.query(
            `DELETE FROM harvests WHERE id IN (?) AND planting_id IN (?)`,
            [harvestIds, plantingIds]
        );
        deletedHarvests = h.affectedRows || 0;
    } else {
        const [h] = await connection.query(
            `DELETE FROM harvests WHERE planting_id IN (?)`,
            [plantingIds]
        );
        deletedHarvests = h.affectedRows || 0;
    }

    const [a] = await connection.query(
        `DELETE FROM activities WHERE planting_id IN (?)`,
        [plantingIds]
    );
    const [p] = await connection.query(
        `DELETE FROM plantings WHERE id IN (?)`,
        [plantingIds]
    );

    return {
        deletedPlantings: p.affectedRows || 0,
        deletedHarvests,
        deletedActivities: a.affectedRows || 0,
        deletedNotifications,
        verified: plantingIds,
        seed_marker_sql: seedMarkerSql,
    };
};

/**
 * Fallback when no manifest: delete only plantings proven seed-owned on registry fields.
 */
const rollbackProvenSeedByMarker = async (connection) => {
    const classified = classifyCollisions(await findFieldCollisions(connection));
    if (classified.hasForeign) {
        throw new Error(
            'Cannot marker-rollback: one or more target fields have non-seed plantings. '
            + 'Use a seed manifest for exact-ID rollback, or resolve foreign collisions manually.'
        );
    }
    if (!classified.seedOwned.length) {
        return {
            deletedPlantings: 0,
            deletedHarvests: 0,
            deletedActivities: 0,
            deletedNotifications: 0,
            verified: [],
        };
    }

    const fakeManifest = {
        plantings: classified.seedOwned.map((r) => ({
            planting_id: r.id,
            field_name: r.field_name,
        })),
        harvests: classified.seedOwned
            .filter((r) => r.harvest_id)
            .map((r) => ({ harvest_id: r.harvest_id, planting_id: r.id })),
        activity_ids: [],
    };
    return rollbackFromManifest(connection, fakeManifest);
};

module.exports = {
    clampGrowthDays,
    findFieldCollisions,
    classifyCollisions,
    getOwnerUserId,
    seedOneCrop,
    rollbackFromManifest,
    rollbackProvenSeedByMarker,
};
