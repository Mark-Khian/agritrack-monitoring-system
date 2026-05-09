/**
 * Calendar-safe date helpers for planting / harvest planning (UTC noon anchor).
 */

const addCalendarDays = (dateStr, days) => {
    const d = new Date(`${dateStr}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + Number(days));
    return d.toISOString().slice(0, 10);
};

/** Inclusive calendar days from date A to date B (B >= A). */
const calendarDaysBetween = (startStr, endStr) => {
    const a = new Date(`${startStr}T12:00:00.000Z`);
    const b = new Date(`${endStr}T12:00:00.000Z`);
    return Math.round((b - a) / 86400000);
};

/**
 * Single source of truth: expected harvest date from plan.
 */
const expectedHarvestFromPlan = (plantingDate, expectedGrowthDays, adjustmentDays = 0) => {
    const span = Number(expectedGrowthDays) + Number(adjustmentDays || 0);
    return addCalendarDays(plantingDate, Math.max(1, span));
};

const utcTodayYmd = () => new Date().toISOString().slice(0, 10);

module.exports = {
    addCalendarDays,
    calendarDaysBetween,
    expectedHarvestFromPlan,
    utcTodayYmd,
};
