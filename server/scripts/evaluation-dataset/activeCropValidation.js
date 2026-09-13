'use strict';

const { REFERENCE_DATE } = require('./constants');
const { ACTIVE_CROP } = require('./datasetDefinition');
const { calendarDaysBetween } = require('../../utils/plantingDates');
const { getPlantingPresentation, legacyGrowthStageForApi } = require('../../services/plantingPresentationService');
const { toYmd, isBeforeYmd, isSameYmd, isAfterYmd } = require('./dateNormalize');

/**
 * Normalize a planting row from mysql2 so presentation helpers receive YYYY-MM-DD strings.
 */
const normalizePlantingRowForPresentation = (planting) => ({
    ...planting,
    planting_date: toYmd(planting.planting_date),
    expected_harvest: planting.expected_harvest != null ? toYmd(planting.expected_harvest) : null,
    expected_growth_days: Number(planting.expected_growth_days),
    adjustment_days: Number(planting.adjustment_days || 0),
    status: planting.status,
    lifecycle_state: planting.lifecycle_state,
    growth_stage_recorded: planting.growth_stage_recorded ?? null,
    observed_stage: planting.observed_stage ?? null,
    expected_stage: planting.expected_stage ?? null,
});

/**
 * Validate designed ACTIVE_01 activity plan (no DB required).
 */
const validateActiveCropDesign = () => {
    const issues = [];
    const plan = ACTIVE_CROP.activity_plan;
    const completedTypes = new Set(plan.complete.map((c) => c.activity_type));

    if (completedTypes.has(plan.overdue.activity_type)) {
        issues.push('overdue activity type also listed as completed');
    }
    if (completedTypes.has(plan.due_today.activity_type)) {
        issues.push('due-today activity type also listed as completed');
    }
    if (!isBeforeYmd(plan.overdue.planned_date, REFERENCE_DATE)) {
        issues.push(`overdue planned_date ${plan.overdue.planned_date} is not before ${REFERENCE_DATE}`);
    }
    if (!isSameYmd(plan.due_today.planned_date, REFERENCE_DATE)) {
        issues.push(`due-today planned_date must be ${REFERENCE_DATE}`);
    }
    for (const item of plan.complete) {
        if (isAfterYmd(item.actual_date, REFERENCE_DATE)) {
            issues.push(`completed ${item.activity_type} actual_date is in the future relative to reference`);
        }
        if (isBeforeYmd(item.actual_date, ACTIVE_CROP.planting_date)) {
            issues.push(`completed ${item.activity_type} actual_date before planting_date`);
        }
    }

    const egd = ACTIVE_CROP.expected_growth_days;
    const elapsed = calendarDaysBetween(ACTIVE_CROP.planting_date, REFERENCE_DATE);
    const plantingStub = normalizePlantingRowForPresentation({
        planting_date: ACTIVE_CROP.planting_date,
        expected_growth_days: egd,
        adjustment_days: 0,
        expected_harvest: null,
        status: 'active',
        lifecycle_state: 'ACTIVE',
        growth_stage_recorded: null,
        observed_stage: null,
        expected_stage: null,
    });
    const presentation = getPlantingPresentation(plantingStub, {
        harvestExists: false,
        overdueActivityCount: 1,
        todayYmd: REFERENCE_DATE,
    });
    const growthStage = legacyGrowthStageForApi(
        plantingStub,
        false,
        presentation.progress_estimate
    );

    return {
        ok: issues.length === 0,
        issues,
        reference_date: REFERENCE_DATE,
        planting_date: ACTIVE_CROP.planting_date,
        expected_lifecycle_state: 'ACTIVE',
        elapsed_days: elapsed,
        progress_estimate: presentation.progress_estimate,
        expected_growth_stage: growthStage,
        activity_plan: plan,
    };
};

/**
 * Validate ACTIVE planting rows after seed (within transaction or after commit).
 */
const validateActiveCropInDb = async (connection, plantingId) => {
    const issues = [];
    const [[planting]] = await connection.query(
        `SELECT id, field_name, status, lifecycle_state, planting_date, expected_growth_days, adjustment_days,
                expected_harvest, growth_stage_recorded, observed_stage, expected_stage
         FROM plantings WHERE id = ?`,
        [plantingId]
    );
    if (!planting) {
        return { ok: false, issues: [`planting #${plantingId} not found`] };
    }
    if (planting.status !== 'active') issues.push(`status is ${planting.status}, expected active`);
    if (planting.lifecycle_state !== 'ACTIVE') {
        issues.push(`lifecycle_state is ${planting.lifecycle_state}, expected ACTIVE`);
    }

    const [activities] = await connection.query(
        `SELECT id, activity_type, status, planned_date, actual_date
         FROM activities
         WHERE planting_id = ? AND deleted_at IS NULL
         ORDER BY id ASC`,
        [plantingId]
    );

    const byType = new Map(activities.map((a) => [a.activity_type, a]));
    const plan = ACTIVE_CROP.activity_plan;

    for (const item of plan.complete) {
        const row = byType.get(item.activity_type);
        if (!row) {
            issues.push(`missing completed activity ${item.activity_type}`);
            continue;
        }
        if (row.status !== 'COMPLETED') issues.push(`${item.activity_type} status=${row.status}`);
        const actualYmd = toYmd(row.actual_date);
        if (actualYmd !== item.actual_date) {
            issues.push(`${item.activity_type} actual_date=${actualYmd}`);
        }
    }

    const overdue = byType.get(plan.overdue.activity_type);
    if (!overdue) issues.push('missing overdue second_fertilizing');
    else {
        if (overdue.status !== 'PENDING') issues.push(`overdue status=${overdue.status}`);
        const overdueYmd = toYmd(overdue.planned_date);
        if (overdueYmd !== plan.overdue.planned_date) {
            issues.push(`overdue planned_date=${overdueYmd}`);
        }
        if (!isBeforeYmd(overdue.planned_date, REFERENCE_DATE)) {
            issues.push('overdue planned_date is not before reference date');
        }
    }

    const dueToday = byType.get(plan.due_today.activity_type);
    if (!dueToday) issues.push('missing due-today crop_monitoring');
    else {
        if (dueToday.status !== 'PENDING') issues.push(`due-today status=${dueToday.status}`);
        if (!isSameYmd(dueToday.planned_date, REFERENCE_DATE)) {
            issues.push(`due-today planned_date=${toYmd(dueToday.planned_date)}`);
        }
    }

    const futurePending = activities.filter((a) => (
        a.status === 'PENDING'
        && isAfterYmd(a.planned_date, REFERENCE_DATE)
    ));
    if (!futurePending.length) issues.push('no upcoming PENDING activities after reference date');

    const plantingNorm = normalizePlantingRowForPresentation(planting);
    const overdueCount = activities.filter((a) => (
        a.status === 'PENDING' && isBeforeYmd(a.planned_date, REFERENCE_DATE)
    )).length;

    const presentation = getPlantingPresentation(plantingNorm, {
        harvestExists: false,
        overdueActivityCount: overdueCount,
        todayYmd: REFERENCE_DATE,
    });
    const growthStage = legacyGrowthStageForApi(
        plantingNorm,
        false,
        presentation.progress_estimate
    );

    // Strict progress / stage expectations for ACTIVE_01 at REFERENCE_DATE
    const expectedElapsed = calendarDaysBetween(
        toYmd(planting.planting_date),
        REFERENCE_DATE
    );
    const duration =
        Number(plantingNorm.expected_growth_days || 0) + Number(plantingNorm.adjustment_days || 0);
    const expectedProgress = duration > 0
        ? Math.max(0, Math.min(1, expectedElapsed / duration))
        : 0;

    if (presentation.progress_estimate == null
        || Number.isNaN(presentation.progress_estimate)) {
        issues.push('progress_estimate is null/NaN');
    } else if (Math.abs(presentation.progress_estimate - expectedProgress) > 0.0001) {
        issues.push(
            `progress_estimate=${presentation.progress_estimate}, expected ≈ ${expectedProgress}`
        );
    }

    if (growthStage !== 'Reproductive Stage') {
        issues.push(`growth_stage=${growthStage}, expected Reproductive Stage`);
    }

    return {
        ok: issues.length === 0,
        issues,
        planting_id: plantingId,
        status: planting.status,
        lifecycle_state: planting.lifecycle_state,
        planting_date: plantingNorm.planting_date,
        expected_harvest: plantingNorm.expected_harvest,
        elapsed_days: expectedElapsed,
        progress_estimate: presentation.progress_estimate,
        growth_stage: growthStage,
        activity_counts: {
            total: activities.length,
            completed: activities.filter((a) => a.status === 'COMPLETED').length,
            pending: activities.filter((a) => a.status === 'PENDING').length,
            upcoming_after_reference: futurePending.length,
        },
    };
};

module.exports = {
    validateActiveCropDesign,
    validateActiveCropInDb,
    normalizePlantingRowForPresentation,
    toYmd,
};
