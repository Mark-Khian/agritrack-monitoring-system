/**
 * Ratio-based lifecycle activity templates (execution layer).
 * lifecycle_template_index 0..N-1 maps to LIFECYCLE_ACTIVITY_TEMPLATES for idempotent partial/full generation.
 */

const db = require('../config/db');
const { addCalendarDays } = require('./plantingDates');

const getAnchorRatio = (method) => {
    if (method === 'TRANSPLANTED') {
        const template = LIFECYCLE_ACTIVITY_TEMPLATES.find(t => t.activityType === 'transplanting');
        return template ? template.ratio : 0.15;
    } else if (method === 'DIRECT_SEEDED') {
        const template = LIFECYCLE_ACTIVITY_TEMPLATES.find(t => t.activityType === 'direct_seeding');
        return template ? template.ratio : 0.0;
    }
    return 0.0;
};

const calculateNormalizedOffset = (templateRatio, anchorRatio, egd) => {
    if (anchorRatio >= 1.0) anchorRatio = 0.0; // fallback
    const normalizedRatio = (templateRatio - anchorRatio) / (1 - anchorRatio);
    return Math.round(normalizedRatio * egd);
};

const LIFECYCLE_ACTIVITY_TEMPLATES = [
    { ratio: 0.0, category: 'Crop Establishment', activityType: 'seeding', notes: 'System: Initial seedling preparation and monitoring.', status: 'PENDING', conditions: { establishment_method: 'TRANSPLANTED' } },
    { ratio: 0.0, category: 'Crop Establishment', activityType: 'direct_seeding', notes: 'System: Direct seeding into the field.', status: 'PENDING', conditions: { establishment_method: 'DIRECT_SEEDED' } },
    { ratio: 0.15, category: 'Crop Establishment', activityType: 'transplanting', notes: 'System: Transfer seedlings into the assigned plot/field.', status: 'PENDING', conditions: { establishment_method: 'TRANSPLANTED' } },
    { ratio: 0.20, category: 'Water Management', activityType: 'irrigation', notes: 'System: Begin continuous water management and irrigation checks.', status: 'PENDING' },
    { ratio: 0.30, category: 'Nutrient Management', activityType: 'first_fertilizing', notes: 'System: First fertilizer application during early vegetative/tillering stage.', status: 'PENDING' },
    { ratio: 0.45, category: 'Pest/Disease Management', activityType: 'pest_control', notes: 'System: Continuous crop inspection for pests and diseases.', status: 'PENDING' },
    { ratio: 0.60, category: 'Nutrient Management', activityType: 'second_fertilizing', notes: 'System: Second/top dressing fertilizer application during later growth stage.', status: 'PENDING' },
    { ratio: 0.75, category: 'Crop Monitoring', activityType: 'crop_monitoring', notes: 'System: Monitor crop growth, field condition, weed presence, nutrient deficiencies, and overall plant health throughout the growing season.', status: 'PENDING' },
    { ratio: 0.85, category: 'Pest/Disease Management', activityType: 'final_pest_inspection', notes: 'System: Final pest and disease inspection before harvest.', status: 'PENDING' },
    { ratio: 0.92, category: 'Water Management', activityType: 'drain_irrigation', notes: 'System: Drain excess water and prepare field for harvesting.', status: 'PENDING' },
    { ratio: 1.0, category: 'Harvest Management', activityType: 'harvesting', notes: 'System: Record harvest date, yield quantity, and harvest completion.', status: 'PENDING' }
];

const TEMPLATE_COUNT = LIFECYCLE_ACTIVITY_TEMPLATES.length;

const getExistingTemplateIndices = async (plantingId, connection = null) => {
    const q = connection || db;
    const [rows] = await q.query(
        `SELECT lifecycle_template_index FROM activities
         WHERE planting_id = ?
           AND activity_source = 'SYSTEM_SCHEDULED'
           AND deleted_at IS NULL
           AND lifecycle_template_index IS NOT NULL`,
        [plantingId]
    );
    return new Set(rows.map((r) => r.lifecycle_template_index));
};

const insertSingleTemplate = async (q, plantingId, plantingDate, expectedGrowthDays, templateIndex, method, adjustmentDays = 0) => {
    const t = LIFECYCLE_ACTIVITY_TEMPLATES[templateIndex];
    if (!t) return;
    const egd = Math.max(1, Number(expectedGrowthDays) || 1);
    
    const anchorRatio = getAnchorRatio(method);
    let offset = calculateNormalizedOffset(t.ratio, anchorRatio, egd);
    
    if (t.ratio >= 1.0) {
        offset += adjustmentDays;
    }
    
    const activityDate = addCalendarDays(plantingDate, offset);
    const initialStatus = t.status || 'PENDING';
    await q.query(
        `INSERT INTO activities
         (planting_id, activity_type, planned_date, original_scheduled_date,
          notes, performed_by, status, activity_source, is_system_generated, schedule_ratio, lifecycle_template_index, category)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 'SYSTEM_SCHEDULED', 1, ?, ?, ?)`,
        [plantingId, t.activityType, activityDate, activityDate, t.notes, initialStatus, t.ratio, templateIndex, t.category || null]
    );
};

/**
 * Insert templates for the given indices; skips indices already present.
 * @returns {number} rows inserted
 */
const generateTemplateIndices = async (plantingId, plantingDate, expectedGrowthDays, indices, method, adjustmentDays = 0, connection = null) => {
    const q = connection || db;
    const existing = await getExistingTemplateIndices(plantingId, q);
    let inserted = 0;
    const sorted = [...new Set(indices.map((i) => Number(i)).filter((i) => i >= 0 && i < TEMPLATE_COUNT))].sort(
        (a, b) => a - b
    );
    for (const i of sorted) {
        if (existing.has(i)) continue;
        await insertSingleTemplate(q, plantingId, plantingDate, expectedGrowthDays, i, method, adjustmentDays);
        existing.add(i);
        inserted++;
    }
    if (inserted > 0) {
        console.log(`[Scheduler] Inserted ${inserted} template row(s) for planting #${plantingId}`);
    }
    return inserted;
};

/** Full set (same as all indices) — skips existing slots, applies conditions. */
const ensureAllSystemTemplates = async (plantingId, plantingDate, expectedGrowthDays, connection = null) => {
    const q = connection || db;
    const [rows] = await q.query('SELECT establishment_method, adjustment_days FROM plantings WHERE id = ?', [plantingId]);
    const method = rows.length > 0 ? rows[0].establishment_method : null;
    const adjustmentDays = rows.length > 0 ? Number(rows[0].adjustment_days || 0) : 0;
    const anchorRatio = getAnchorRatio(method);

    const all = LIFECYCLE_ACTIVITY_TEMPLATES.map((t, i) => {
        if (t.conditions && t.conditions.establishment_method) {
             if (t.conditions.establishment_method !== method) return -1;
        }
        if (t.ratio < anchorRatio) return -1; // skip pre-establishment tasks automatically
        return i;
    }).filter((i) => i >= 0);
    return generateTemplateIndices(plantingId, plantingDate, expectedGrowthDays, all, method, adjustmentDays, connection);
};

/** @deprecated name kept for callers — now idempotent (fills only missing template slots). */
const autoGenerateActivities = async (plantingId, plantingDate, expectedGrowthDays, connection = null) => {
    return ensureAllSystemTemplates(plantingId, plantingDate, expectedGrowthDays, connection);
};

/**
 * Reschedule pending system-generated activities when the growth plan changes.
 */
const rescheduleFutureSystemActivities = async (plantingId, plantingDate, expectedGrowthDays, connection = null) => {
    const q = connection || db;
    const egd = Math.max(1, Number(expectedGrowthDays) || 1);

    const [rows] = await q.query('SELECT establishment_method, adjustment_days FROM plantings WHERE id = ?', [plantingId]);
    const method = rows.length > 0 ? rows[0].establishment_method : null;
    const adjustmentDays = rows.length > 0 ? Number(rows[0].adjustment_days || 0) : 0;
    const anchorRatio = getAnchorRatio(method);

    const [pending] = await q.query(
        `SELECT id, planned_date, schedule_ratio, lifecycle_template_index FROM activities
         WHERE planting_id = ?
           AND activity_source = 'SYSTEM_SCHEDULED'
           AND status = 'PENDING'
           AND deleted_at IS NULL
         ORDER BY COALESCE(lifecycle_template_index, 255), id ASC`,
        [plantingId]
    );

    for (const row of pending) {
        let ratio = row.schedule_ratio != null ? Number(row.schedule_ratio) : null;
        if (row.lifecycle_template_index != null && LIFECYCLE_ACTIVITY_TEMPLATES[row.lifecycle_template_index]) {
            ratio = LIFECYCLE_ACTIVITY_TEMPLATES[row.lifecycle_template_index].ratio;
        }
        if (ratio == null || Number.isNaN(ratio)) {
            ratio = 0.5;
        }

        if (ratio < anchorRatio) {
            // Obsolete pre-establishment activity on already established crop
            await q.query(
                `UPDATE activities
                 SET status = 'CANCELLED',
                     notes = CONCAT(COALESCE(notes, ''), '\\nSystem: Cancelled obsolete pre-establishment activity due to schedule realignment.')
                 WHERE id = ?`,
                [row.id]
            );
            continue;
        }

        let offset = calculateNormalizedOffset(ratio, anchorRatio, egd);
        if (ratio >= 1.0) {
            offset += adjustmentDays;
        }
        
        const newDate = addCalendarDays(plantingDate, offset);
        await q.query(
            `UPDATE activities
             SET planned_date = ?,
                 original_scheduled_date = COALESCE(original_scheduled_date, ?),
                 schedule_ratio = ?,
                 reschedule_count = reschedule_count + 1
             WHERE id = ?`,
            [newDate, row.planned_date, ratio, row.id]
        );
    }
};



module.exports = {
    LIFECYCLE_ACTIVITY_TEMPLATES,
    TEMPLATE_COUNT,
    generateTemplateIndices,
    ensureAllSystemTemplates,
    autoGenerateActivities,
    rescheduleFutureSystemActivities,
    getExistingTemplateIndices
};
