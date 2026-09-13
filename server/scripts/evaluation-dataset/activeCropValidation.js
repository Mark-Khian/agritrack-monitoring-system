'use strict';

const { REFERENCE_DATE } = require('./constants');
const { ACTIVE_CROP } = require('./datasetDefinition');
const { calendarDaysBetween } = require('../../utils/plantingDates');
const { getPlantingPresentation, legacyGrowthStageForApi } = require('../../services/plantingPresentationService');

const ymd = (value) => String(value).slice(0, 10);

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
    if (plan.overdue.planned_date >= REFERENCE_DATE) {
        issues.push(`overdue planned_date ${plan.overdue.planned_date} is not before ${REFERENCE_DATE}`);
    }
    if (plan.due_today.planned_date !== REFERENCE_DATE) {
        issues.push(`due-today planned_date must be ${REFERENCE_DATE}`);
    }
    for (const item of plan.complete) {
        if (item.actual_date > REFERENCE_DATE) {
            issues.push(`completed ${item.activity_type} actual_date is in the future relative to reference`);
        }
        if (item.actual_date < ACTIVE_CROP.planting_date) {
            issues.push(`completed ${item.activity_type} actual_date before planting_date`);
        }
    }

    const egd = ACTIVE_CROP.expected_growth_days;
    const elapsed = calendarDaysBetween(ACTIVE_CROP.planting_date, REFERENCE_DATE);
    const progress = Math.max(0, Math.min(1, elapsed / egd));
    const plantingStub = {
        planting_date: ACTIVE_CROP.planting_date,
        expected_growth_days: egd,
        adjustment_days: 0,
        expected_harvest: null,
        status: 'active',
        lifecycle_state: 'ACTIVE',
        growth_stage_recorded: null,
        observed_stage: null,
        expected_stage: null,
    };
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
        if (ymd(row.actual_date) !== item.actual_date) {
            issues.push(`${item.activity_type} actual_date=${ymd(row.actual_date)}`);
        }
    }

    const overdue = byType.get(plan.overdue.activity_type);
    if (!overdue) issues.push('missing overdue second_fertilizing');
    else {
        if (overdue.status !== 'PENDING') issues.push(`overdue status=${overdue.status}`);
        if (ymd(overdue.planned_date) !== plan.overdue.planned_date) {
            issues.push(`overdue planned_date=${ymd(overdue.planned_date)}`);
        }
        if (ymd(overdue.planned_date) >= REFERENCE_DATE) {
            issues.push('overdue planned_date is not before reference date');
        }
    }

    const dueToday = byType.get(plan.due_today.activity_type);
    if (!dueToday) issues.push('missing due-today crop_monitoring');
    else {
        if (dueToday.status !== 'PENDING') issues.push(`due-today status=${dueToday.status}`);
        if (ymd(dueToday.planned_date) !== REFERENCE_DATE) {
            issues.push(`due-today planned_date=${ymd(dueToday.planned_date)}`);
        }
    }

    const futurePending = activities.filter((a) => (
        a.status === 'PENDING'
        && ymd(a.planned_date) > REFERENCE_DATE
    ));
    if (!futurePending.length) issues.push('no upcoming PENDING activities after reference date');

    const presentation = getPlantingPresentation(planting, {
        harvestExists: false,
        overdueActivityCount: activities.filter((a) => (
            a.status === 'PENDING' && ymd(a.planned_date) < REFERENCE_DATE
        )).length,
        todayYmd: REFERENCE_DATE,
    });
    const growthStage = legacyGrowthStageForApi(
        planting,
        false,
        presentation.progress_estimate
    );

    return {
        ok: issues.length === 0,
        issues,
        planting_id: plantingId,
        status: planting.status,
        lifecycle_state: planting.lifecycle_state,
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
};
