/**
 * Presentation layer: progress estimates and operational alerts.
 * Does NOT infer lifecycle authority from calendars — uses stored lifecycle_state + harvest existence.
 */

const { calendarDaysBetween, utcTodayYmd } = require('../utils/plantingDates');

const ATTENTION_OVERDUE_THRESHOLD = 3;

/** Agronomic label for legacy UI when growth_stage_recorded is empty. */
const legacyGrowthStageFromLifecycle = (lifecycleState) => {
    const m = {
        PLANNED: 'land_preparation',
        ACTIVE: 'transplanting',
        MATURING: 'booting',
        READY_FOR_HARVEST: 'ripening',
        HARVESTED: 'harvested',
        ABANDONED: 'harvested',
    };
    return m[lifecycleState] || 'transplanting';
};

/**
 * @param {object} planting - row from plantings table
 * @param {object} opts
 * @param {boolean} opts.harvestExists
 * @param {number} opts.overdueActivityCount
 * @param {string} [opts.todayYmd] - YYYY-MM-DD
 */
const getPlantingPresentation = (
    planting,
    { harvestExists = false, overdueActivityCount = 0, todayYmd = null }
) => {
    const today = todayYmd || utcTodayYmd();
    const storedState = planting.lifecycle_state || 'ACTIVE';
    const effectiveLifecycle = harvestExists ? 'HARVESTED' : storedState;

    let progressEstimate = null;
    if (harvestExists || effectiveLifecycle === 'HARVESTED') {
        progressEstimate = 1;
    } else {
        const duration =
            Number(planting.expected_growth_days || 0) + Number(planting.adjustment_days || 0);
        const elapsed = Math.max(0, calendarDaysBetween(planting.planting_date, today));
        if (duration > 0) {
            progressEstimate = Math.max(0, Math.min(1, elapsed / duration));
        } else {
            progressEstimate = 0;
        }
    }

    const alerts = [];
    if (!harvestExists && planting.expected_harvest && today > planting.expected_harvest) {
        if (effectiveLifecycle !== 'HARVESTED' && effectiveLifecycle !== 'ABANDONED') {
            alerts.push({
                code: 'PAST_EXPECTED_WINDOW',
                message: 'Current date is past the planned expected harvest window (estimate).',
            });
        }
    }
    if (overdueActivityCount >= ATTENTION_OVERDUE_THRESHOLD) {
        alerts.push({
            code: 'HIGH_OPERATIONAL_BACKLOG',
            message: `There are ${overdueActivityCount} overdue activities (execution layer).`,
        });
    }

    const attentionNeeded = overdueActivityCount >= ATTENTION_OVERDUE_THRESHOLD;

    return {
        lifecycle_state: effectiveLifecycle,
        progress_estimate: progressEstimate,
        progress_is_estimate: !harvestExists,
        overdue_activity_count: overdueActivityCount,
        attention_needed: attentionNeeded,
        alerts,
    };
};

const legacyGrowthStageForApi = (planting) => {
    if (planting.growth_stage_recorded) return planting.growth_stage_recorded;
    return legacyGrowthStageFromLifecycle(planting.lifecycle_state || 'ACTIVE');
};

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {number[]} plantingIds
 */
const loadPresentationContext = async (db, plantingIds) => {
    if (!plantingIds.length) {
        return { harvestSet: new Set(), overdueMap: new Map() };
    }
    const ph = plantingIds.map(() => '?').join(',');

    const [harvestRows] = await db.query(
        `SELECT planting_id FROM harvests
         WHERE deleted_at IS NULL AND planting_id IN (${ph})`,
        plantingIds
    );
    const harvestSet = new Set(harvestRows.map((r) => r.planting_id));

    const [overdueRows] = await db.query(
        `SELECT planting_id, COUNT(*) AS c FROM activities
         WHERE deleted_at IS NULL
           AND status IN ('pending','ongoing')
           AND activity_date < CURDATE()
           AND planting_id IN (${ph})
         GROUP BY planting_id`,
        plantingIds
    );
    const overdueMap = new Map(overdueRows.map((r) => [r.planting_id, Number(r.c)]));

    return { harvestSet, overdueMap };
};

const enrichPlantingRow = (planting, ctx, todayYmd = null) => {
    const harvestExists = ctx.harvestSet.has(planting.id);
    const overdueActivityCount = ctx.overdueMap.get(planting.id) || 0;
    const presentation = getPlantingPresentation(planting, {
        harvestExists,
        overdueActivityCount,
        todayYmd,
    });

    return {
        ...planting,
        growth_stage: legacyGrowthStageForApi(planting),
        presentation,
        progress_estimate: presentation.progress_estimate,
        overdue_activity_count: presentation.overdue_activity_count,
        attention_needed: presentation.attention_needed,
        alerts: presentation.alerts,
    };
};

module.exports = {
    ATTENTION_OVERDUE_THRESHOLD,
    getPlantingPresentation,
    legacyGrowthStageForApi,
    loadPresentationContext,
    enrichPlantingRow,
};
