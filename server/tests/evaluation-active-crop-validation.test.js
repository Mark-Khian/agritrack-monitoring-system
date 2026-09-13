'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    toYmd,
    isBeforeYmd,
    isSameYmd,
    isAfterYmd,
} = require('../scripts/evaluation-dataset/dateNormalize');
const {
    validateActiveCropDesign,
    normalizePlantingRowForPresentation,
} = require('../scripts/evaluation-dataset/activeCropValidation');
const { REFERENCE_DATE } = require('../scripts/evaluation-dataset/constants');
const { ACTIVE_CROP } = require('../scripts/evaluation-dataset/datasetDefinition');
const { calendarDaysBetween } = require('../utils/plantingDates');
const {
    getPlantingPresentation,
    legacyGrowthStageForApi,
} = require('../services/plantingPresentationService');

/** Simulate mysql2 DATE materialization as a local-midnight JS Date. */
const mysqlDate = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
};

describe('evaluation dateNormalize', () => {
    it('1. JS Date object → YYYY-MM-DD normalization', () => {
        const d = mysqlDate('2026-09-08');
        assert.equal(toYmd(d), '2026-09-08');
        // Brittle String(date).slice path must NOT be used
        assert.notEqual(String(d).slice(0, 10), '2026-09-08');
        assert.match(String(d).slice(0, 10), /^[A-Za-z]{3} /);
    });

    it('2. YYYY-MM-DD string → unchanged', () => {
        assert.equal(toYmd('2026-09-13'), '2026-09-13');
        assert.equal(toYmd('2026-09-13T12:00:00.000Z'), '2026-09-13');
    });

    it('3. Sep 08 is correctly before Sep 13', () => {
        assert.equal(isBeforeYmd(mysqlDate('2026-09-08'), REFERENCE_DATE), true);
        assert.equal(isBeforeYmd('2026-09-08', '2026-09-13'), true);
        // Reproduce the false positive of String(date).slice comparison
        const brittle = String(mysqlDate('2026-09-08')).slice(0, 10);
        assert.equal(brittle >= REFERENCE_DATE, true, 'brittle path falsely sorts after');
        assert.equal(isBeforeYmd(mysqlDate('2026-09-08'), REFERENCE_DATE), true);
    });

    it('4. Sep 13 exactly matches Sep 13', () => {
        assert.equal(isSameYmd(mysqlDate('2026-09-13'), REFERENCE_DATE), true);
        assert.equal(isSameYmd('2026-09-13', REFERENCE_DATE), true);
        assert.equal(isAfterYmd(mysqlDate('2026-09-13'), REFERENCE_DATE), false);
    });

    it('5. no timezone day shift for calendar DATE', () => {
        const local = new Date(2026, 6, 5); // Jul 5 local
        assert.equal(toYmd(local), '2026-07-05');
        const afternoon = new Date(2026, 6, 5, 15, 30, 0);
        assert.equal(toYmd(afternoon), '2026-07-05');
    });
});

describe('ACTIVE_01 post-insert-style validation with mysql Date objects', () => {
    it('6. ACTIVE_01 computes ~70/120 progress', () => {
        const design = validateActiveCropDesign();
        assert.equal(design.ok, true, design.issues.join('; '));
        assert.equal(design.elapsed_days, 70);
        assert.ok(Math.abs(design.progress_estimate - 70 / 120) < 0.0001);

        // Simulate mysql2 planting row (Date objects)
        const plantingRaw = {
            status: 'active',
            lifecycle_state: 'ACTIVE',
            planting_date: mysqlDate(ACTIVE_CROP.planting_date),
            expected_harvest: mysqlDate('2026-11-02'),
            expected_growth_days: 120,
            adjustment_days: 0,
            growth_stage_recorded: null,
            observed_stage: null,
            expected_stage: null,
        };
        const plantingNorm = normalizePlantingRowForPresentation(plantingRaw);
        assert.equal(plantingNorm.planting_date, '2026-07-05');
        assert.equal(plantingNorm.expected_harvest, '2026-11-02');

        const presentation = getPlantingPresentation(plantingNorm, {
            harvestExists: false,
            overdueActivityCount: 1,
            todayYmd: REFERENCE_DATE,
        });
        assert.notEqual(presentation.progress_estimate, null);
        assert.equal(Number.isNaN(presentation.progress_estimate), false);
        assert.ok(Math.abs(presentation.progress_estimate - 70 / 120) < 0.0001);
        assert.equal(
            calendarDaysBetween(plantingNorm.planting_date, REFERENCE_DATE),
            70
        );
    });

    it('7. ACTIVE_01 validates as Reproductive Stage', () => {
        const design = validateActiveCropDesign();
        assert.equal(design.expected_growth_stage, 'Reproductive Stage');

        const plantingNorm = normalizePlantingRowForPresentation({
            status: 'active',
            lifecycle_state: 'ACTIVE',
            planting_date: mysqlDate(ACTIVE_CROP.planting_date),
            expected_harvest: mysqlDate('2026-11-02'),
            expected_growth_days: 120,
            adjustment_days: 0,
            growth_stage_recorded: null,
            observed_stage: null,
            expected_stage: null,
        });
        const presentation = getPlantingPresentation(plantingNorm, {
            harvestExists: false,
            overdueActivityCount: 1,
            todayYmd: REFERENCE_DATE,
        });
        const stage = legacyGrowthStageForApi(
            plantingNorm,
            false,
            presentation.progress_estimate
        );
        assert.equal(stage, 'Reproductive Stage');
        assert.notEqual(stage, 'Ready for Harvest');
    });

    it('8. incorrect dates still cause validation failure', () => {
        // Overdue planned_date equal to reference must fail isBefore check
        assert.equal(isBeforeYmd('2026-09-13', REFERENCE_DATE), false);
        assert.equal(isBeforeYmd('2026-09-14', REFERENCE_DATE), false);

        // Due-today mismatch
        assert.equal(isSameYmd(mysqlDate('2026-09-12'), REFERENCE_DATE), false);

        // Completed actual after reference
        assert.equal(isAfterYmd('2026-09-20', REFERENCE_DATE), true);

        // Un-normalized Date still fails equality against designed YMD strings
        // when using brittle slice — and our validator requires exact YMD match
        const wrongActual = toYmd(mysqlDate('2026-07-24'));
        assert.notEqual(wrongActual, '2026-07-23');
    });

    it('raw Date without normalize still produces NaN progress (documents root cause)', () => {
        const raw = {
            status: 'active',
            planting_date: mysqlDate('2026-07-05'),
            expected_growth_days: 120,
            adjustment_days: 0,
        };
        const broken = getPlantingPresentation(raw, {
            harvestExists: false,
            todayYmd: REFERENCE_DATE,
        });
        assert.equal(Number.isNaN(broken.progress_estimate), true);
        const brokenStage = legacyGrowthStageForApi(raw, false, broken.progress_estimate);
        assert.equal(brokenStage, 'Ready for Harvest');
    });
});
