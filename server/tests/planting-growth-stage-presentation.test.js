'use strict';

/**
 * Growth-stage presentation: Active plantings must not show Harvested
 * without a valid harvest closeout.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    STAGE_HARVESTED,
    STAGE_READY_FOR_HARVEST,
    getGrowthStageForPlanting,
    legacyGrowthStageForApi,
    getPlantingPresentation,
    enrichPlantingRow,
} = require('../services/plantingPresentationService');

const baseActive = {
    id: 1,
    status: 'active',
    lifecycle_state: 'ACTIVE',
    planting_date: '2026-01-01',
    expected_growth_days: 100,
    adjustment_days: 0,
    expected_harvest: '2026-04-11',
    growth_stage_recorded: null,
    observed_stage: null,
    expected_stage: null,
};

/** Mirrors Plantings.jsx Active / Completed tab filters (status only). */
const filterByStatusTab = (plantings, statusFilter) =>
    (plantings || []).filter((p) => {
        if (statusFilter === 'active') return p.status === 'active';
        if (statusFilter === 'completed') return p.status === 'completed';
        return true;
    });

describe('planting growth-stage presentation', () => {
    it('1. active immature planting → normal vegetative/reproductive stage, not Harvested', () => {
        const planting = { ...baseActive, planting_date: '2026-08-01', expected_growth_days: 120 };
        const presentation = getPlantingPresentation(planting, {
            harvestExists: false,
            todayYmd: '2026-09-13',
        });
        // elapsed ~43 / 120 ≈ 0.36 → Vegetative
        assert.ok(presentation.progress_estimate > 0 && presentation.progress_estimate < 0.5);
        const stage = legacyGrowthStageForApi(planting, false, presentation.progress_estimate);
        assert.equal(stage, 'Vegetative Stage');
        assert.notEqual(stage, STAGE_HARVESTED);
        assert.notEqual(stage, 'Harvest Stage');
    });

    it('2. active mature/past-window planting → Ready for Harvest, NOT Harvested', () => {
        const planting = {
            ...baseActive,
            planting_date: '2025-01-01',
            expected_growth_days: 100,
            expected_harvest: '2025-04-11',
        };
        const presentation = getPlantingPresentation(planting, {
            harvestExists: false,
            todayYmd: '2026-09-13',
        });
        assert.equal(presentation.progress_estimate, 1);
        const stage = legacyGrowthStageForApi(planting, false, presentation.progress_estimate);
        assert.equal(stage, STAGE_READY_FOR_HARVEST);
        assert.notEqual(stage, STAGE_HARVESTED);
        assert.notEqual(stage, 'Harvest Stage');
    });

    it('3. completed harvested planting → Harvested', () => {
        const planting = {
            ...baseActive,
            status: 'completed',
            lifecycle_state: 'HARVESTED',
            lifecycle_state_reason: 'Harvest recorded',
        };
        assert.equal(legacyGrowthStageForApi(planting, true, 1), STAGE_HARVESTED);
        assert.equal(getGrowthStageForPlanting(planting, true, 1), STAGE_HARVESTED);
        // status=completed alone (enrich path) also Harvested
        assert.equal(legacyGrowthStageForApi(planting, true), STAGE_HARVESTED);
    });

    it('4. delete-harvest state: ACTIVE + no harvest → Ready for Harvest (not Harvested)', () => {
        // Mirrors harvestController.deleteHarvest revert when last live harvest removed.
        const afterDeleteHarvest = {
            ...baseActive,
            status: 'active',
            lifecycle_state: 'ACTIVE',
            lifecycle_state_reason: null,
            planting_date: '2025-01-01',
            expected_growth_days: 100,
            expected_harvest: '2025-04-11',
            // Stale recorded label must not stick as Harvested on Active
            growth_stage_recorded: 'Harvest Stage',
        };
        const presentation = getPlantingPresentation(afterDeleteHarvest, {
            harvestExists: false,
            todayYmd: '2026-09-13',
        });
        const stage = legacyGrowthStageForApi(
            afterDeleteHarvest,
            false,
            presentation.progress_estimate
        );
        assert.equal(afterDeleteHarvest.status, 'active');
        assert.equal(stage, STAGE_READY_FOR_HARVEST);
        assert.notEqual(stage, STAGE_HARVESTED);
        assert.notEqual(stage, 'Harvest Stage');

        const enriched = enrichPlantingRow(afterDeleteHarvest, {
            harvestSet: new Set(),
            overdueMap: new Map(),
        }, '2026-09-13');
        assert.equal(enriched.growth_stage, STAGE_READY_FOR_HARVEST);
    });

    it('5. Active / Completed tab filters remain status-only', () => {
        const rows = [
            { id: 1, status: 'active', growth_stage: STAGE_READY_FOR_HARVEST },
            { id: 2, status: 'active', growth_stage: 'Vegetative Stage' },
            { id: 3, status: 'completed', growth_stage: STAGE_HARVESTED },
            { id: 4, status: 'completed', growth_stage: STAGE_HARVESTED },
        ];
        const active = filterByStatusTab(rows, 'active');
        const completed = filterByStatusTab(rows, 'completed');
        assert.deepEqual(active.map((p) => p.id), [1, 2]);
        assert.deepEqual(completed.map((p) => p.id), [3, 4]);
        // Mature active stays on Active tab (not moved by Ready for Harvest label)
        assert.ok(active.some((p) => p.growth_stage === STAGE_READY_FOR_HARVEST));
        assert.ok(!completed.some((p) => p.status === 'active'));
    });

    it('ripening band still used below harvest threshold', () => {
        const planting = {
            ...baseActive,
            planting_date: '2026-01-01',
            expected_growth_days: 100,
        };
        // progress 0.85 → Ripening
        assert.equal(getGrowthStageForPlanting(planting, false, 0.85), 'Ripening Stage');
        assert.equal(getGrowthStageForPlanting(planting, false, 1.0), STAGE_READY_FOR_HARVEST);
    });
});
