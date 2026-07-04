/**
 * Ratio-based lifecycle activity templates (execution layer).
 * lifecycle_template_index 0..N-1 maps to LIFECYCLE_ACTIVITY_TEMPLATES for idempotent partial/full generation.
 */

const db = require('../config/db');
const { addCalendarDays } = require('./plantingDates');

const LIFECYCLE_ACTIVITY_TEMPLATES = [
    { ratio: 0.0, activityType: 'seeding', notes: 'System: Initial seedling preparation and monitoring.', status: 'pending' },
    { ratio: 0.15, activityType: 'transplanting', notes: 'System: Transfer seedlings into the assigned plot/field.', status: 'pending' },
    { ratio: 0.20, activityType: 'irrigation', notes: 'System: Begin continuous water management and irrigation checks.', status: 'pending' },
    { ratio: 0.30, activityType: 'first_fertilizing', notes: 'System: First fertilizer application during early vegetative/tillering stage.', status: 'pending' },
    { ratio: 0.45, activityType: 'pest_control', notes: 'System: Continuous crop inspection for pests and diseases.', status: 'pending' },
    { ratio: 0.60, activityType: 'second_fertilizing', notes: 'System: Second/top dressing fertilizer application during later growth stage.', status: 'pending' },
    { ratio: 0.75, activityType: 'crop_monitoring', notes: 'System: Monitor crop growth, field condition, weed presence, nutrient deficiencies, and overall plant health throughout the growing season.', status: 'pending' },
    { ratio: 0.85, activityType: 'final_pest_inspection', notes: 'System: Final pest and disease inspection before harvest.', status: 'pending' },
    { ratio: 0.92, activityType: 'drain_irrigation', notes: 'System: Drain excess water and prepare field for harvesting.', status: 'pending' },
    { ratio: 1.0, activityType: 'harvesting', notes: 'System: Record harvest date, yield quantity, and harvest completion.', status: 'pending' }
];

const TEMPLATE_COUNT = LIFECYCLE_ACTIVITY_TEMPLATES.length;

const getExistingTemplateIndices = async (plantingId, connection = null) => {
    const q = connection || db;
    const [rows] = await q.query(
        `SELECT lifecycle_template_index FROM activities
         WHERE planting_id = ?
           AND is_system_generated = 1
           AND deleted_at IS NULL
           AND lifecycle_template_index IS NOT NULL`,
        [plantingId]
    );
    return new Set(rows.map((r) => r.lifecycle_template_index));
};

const insertSingleTemplate = async (q, plantingId, plantingDate, expectedGrowthDays, templateIndex) => {
    const t = LIFECYCLE_ACTIVITY_TEMPLATES[templateIndex];
    if (!t) return;
    const egd = Math.max(1, Number(expectedGrowthDays) || 1);
    const offset = Math.max(0, Math.round(t.ratio * egd));
    const activityDate = addCalendarDays(plantingDate, offset);
    const initialStatus = t.status || 'pending';
    await q.query(
        `INSERT INTO activities
         (planting_id, activity_type, activity_date, original_scheduled_date,
          notes, performed_by, status, is_system_generated, schedule_ratio, lifecycle_template_index)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
        [plantingId, t.activityType, activityDate, activityDate, t.notes, initialStatus, t.ratio, templateIndex]
    );
};

/**
 * Insert templates for the given indices; skips indices already present.
 * @returns {number} rows inserted
 */
const generateTemplateIndices = async (plantingId, plantingDate, expectedGrowthDays, indices, connection = null) => {
    const q = connection || db;
    const existing = await getExistingTemplateIndices(plantingId, q);
    let inserted = 0;
    const sorted = [...new Set(indices.map((i) => Number(i)).filter((i) => i >= 0 && i < TEMPLATE_COUNT))].sort(
        (a, b) => a - b
    );
    for (const i of sorted) {
        if (existing.has(i)) continue;
        await insertSingleTemplate(q, plantingId, plantingDate, expectedGrowthDays, i);
        existing.add(i);
        inserted++;
    }
    if (inserted > 0) {
        console.log(`[Scheduler] Inserted ${inserted} template row(s) for planting #${plantingId}`);
    }
    return inserted;
};

/** Full set (same as all indices) — skips existing slots. */
const ensureAllSystemTemplates = async (plantingId, plantingDate, expectedGrowthDays, connection = null) => {
    const all = LIFECYCLE_ACTIVITY_TEMPLATES.map((_, i) => i);
    return generateTemplateIndices(plantingId, plantingDate, expectedGrowthDays, all, connection);
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

    const [pending] = await q.query(
        `SELECT id, activity_date, schedule_ratio, lifecycle_template_index FROM activities
         WHERE planting_id = ?
           AND is_system_generated = 1
           AND status IN ('pending', 'ongoing')
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
        const offset = Math.max(0, Math.round(ratio * egd));
        const newDate = addCalendarDays(plantingDate, offset);
        await q.query(
            `UPDATE activities
             SET activity_date = ?,
                 original_scheduled_date = COALESCE(original_scheduled_date, ?),
                 schedule_ratio = ?,
                 reschedule_count = reschedule_count + 1
             WHERE id = ?`,
            [newDate, row.activity_date, ratio, row.id]
        );
    }
};

/**
 * Automatically transitions activity statuses based on today's date.
 */
const syncActivityStatuses = async (connection = null) => {
    const q = connection || db;
    // Get date helper today's date in YYYY-MM-DD format
    const { utcTodayYmd } = require('./plantingDates');
    const today = utcTodayYmd();

    // 1. Continuous activities whose date has arrived/passed and are pending -> ongoing
    await q.query(
        `UPDATE activities
         SET status = 'ongoing'
         WHERE status = 'pending'
           AND activity_type IN ('irrigation', 'pest_control', 'crop_monitoring')
           AND activity_date <= ?
           AND deleted_at IS NULL`,
        [today]
    );

    // 2. Continuous activities whose date is in the future and are ongoing -> pending
    await q.query(
        `UPDATE activities
         SET status = 'pending'
         WHERE status = 'ongoing'
           AND activity_type IN ('irrigation', 'pest_control', 'crop_monitoring')
           AND activity_date > ?
           AND deleted_at IS NULL`,
        [today]
    );

    // 3. One-time activities that are ongoing -> pending (to align with the rule)
    await q.query(
        `UPDATE activities
         SET status = 'pending'
         WHERE status = 'ongoing'
           AND activity_type NOT IN ('irrigation', 'pest_control', 'crop_monitoring')
           AND deleted_at IS NULL`
    );
};

module.exports = {
    LIFECYCLE_ACTIVITY_TEMPLATES,
    TEMPLATE_COUNT,
    generateTemplateIndices,
    ensureAllSystemTemplates,
    autoGenerateActivities,
    rescheduleFutureSystemActivities,
    getExistingTemplateIndices,
    syncActivityStatuses,
};
