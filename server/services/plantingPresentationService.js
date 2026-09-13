/**
 * Presentation layer: progress estimates and operational alerts.
 * Does NOT infer lifecycle authority from calendars — uses stored status + harvest existence.
 * Growth-stage labels are display-only; they must not imply a harvest was recorded.
 */

const { calendarDaysBetween, utcTodayYmd } = require('../utils/plantingDates');

const ATTENTION_OVERDUE_THRESHOLD = 3;

/** Completed / harvested display label (valid harvest closeout only). */
const STAGE_HARVESTED = 'Harvested';
/** Active planting at/past maturity without a recorded harvest. */
const STAGE_READY_FOR_HARVEST = 'Ready for Harvest';

const normalizeStageLabel = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Labels that imply harvest closeout — remapped on Active plantings. */
const isHarvestCompletedLabel = (value) => {
    const n = normalizeStageLabel(value);
    return n === 'harvested' || n === 'harvest stage' || n === 'harvest';
};

/**
 * True only when the planting is in a valid harvested/completed state.
 * Active plantings (including post deleteHarvest) are never treated as harvested here.
 */
const isTrulyHarvested = (planting, harvestExists) => {
    if (harvestExists) return true;
    return String(planting?.status || '').toLowerCase() === 'completed';
};

const getGrowthStageForPlanting = (planting, harvestExists, progressEstimate) => {
    if (isTrulyHarvested(planting, harvestExists)) {
        return STAGE_HARVESTED;
    }

    if (planting.status === 'failed') return 'Abandoned';

    // Active (or other non-completed) plantings must never display Harvested /
    // Harvest Stage — remap recorded/observed/expected harvest-equivalent labels.
    const recorded = planting.growth_stage_recorded;
    if (recorded) {
        if (isHarvestCompletedLabel(recorded)) return STAGE_READY_FOR_HARVEST;
        return recorded;
    }

    const observed = planting.observed_stage;
    if (observed) {
        if (isHarvestCompletedLabel(observed)) return STAGE_READY_FOR_HARVEST;
        return observed;
    }

    const expected = planting.expected_stage;
    if (expected) {
        if (isHarvestCompletedLabel(expected)) return STAGE_READY_FOR_HARVEST;
        return expected;
    }

    const progress = progressEstimate != null ? progressEstimate : 0;
    if (progress < 0.15) {
        return 'Seedling Stage';
    }
    if (progress < 0.50) {
        return 'Vegetative Stage';
    }
    if (progress < 0.80) {
        return 'Reproductive Stage';
    }
    if (progress < 1.00) {
        return 'Ripening Stage';
    }
    return STAGE_READY_FOR_HARVEST;
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
    const isCompleted = isTrulyHarvested(planting, harvestExists);
    const isFailed = planting.status === 'failed';

    let progressEstimate = null;
    if (isCompleted) {
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
        if (!isCompleted && !isFailed) {
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
        progress_estimate: progressEstimate,
        progress_is_estimate: !harvestExists,
        overdue_activity_count: overdueActivityCount,
        attention_needed: attentionNeeded,
        alerts,
    };
};

const legacyGrowthStageForApi = (planting, harvestExists = false, progressEstimate = null) => {
    let pe = progressEstimate;
    if (pe == null) {
        const isCompleted = isTrulyHarvested(planting, harvestExists);
        if (isCompleted) {
            pe = 1.0;
        } else {
            const duration =
                Number(planting.expected_growth_days || 0) + Number(planting.adjustment_days || 0);
            const today = utcTodayYmd();
            const elapsed = Math.max(0, calendarDaysBetween(planting.planting_date, today));
            pe = duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 0;
        }
    }
    return getGrowthStageForPlanting(planting, harvestExists, pe);
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
           AND status IN ('PENDING')
           AND planned_date < CURDATE()
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

    const legacyGrowthStage = legacyGrowthStageForApi(
        planting,
        harvestExists,
        presentation.progress_estimate
    );
    const expected_stage = planting.expected_stage || legacyGrowthStage;
    const observed_stage = planting.observed_stage || null;

    return {
        ...planting,
        growth_stage: legacyGrowthStage,
        expected_stage,
        observed_stage,
        presentation,
        progress_estimate: presentation.progress_estimate,
        overdue_activity_count: presentation.overdue_activity_count,
        attention_needed: presentation.attention_needed,
        alerts: presentation.alerts,
    };
};

module.exports = {
    ATTENTION_OVERDUE_THRESHOLD,
    STAGE_HARVESTED,
    STAGE_READY_FOR_HARVEST,
    isTrulyHarvested,
    isHarvestCompletedLabel,
    getGrowthStageForPlanting,
    getPlantingPresentation,
    legacyGrowthStageForApi,
    loadPresentationContext,
    enrichPlantingRow,
};
