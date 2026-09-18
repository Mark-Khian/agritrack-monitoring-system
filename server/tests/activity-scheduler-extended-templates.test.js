'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    LIFECYCLE_ACTIVITY_TEMPLATES,
    computeTemplateOffset,
    listLifecycleTemplateIndicesForMethod,
} = require('../utils/activityScheduler');
const { addCalendarDays } = require('../utils/plantingDates');

describe('extended lifecycle templates (land prep + postharvest)', () => {
    it('appends land_preparation and postharvest at indices 11 and 12', () => {
        assert.equal(LIFECYCLE_ACTIVITY_TEMPLATES[10].activityType, 'harvesting');
        assert.equal(LIFECYCLE_ACTIVITY_TEMPLATES[11].activityType, 'land_preparation');
        assert.equal(LIFECYCLE_ACTIVITY_TEMPLATES[11].offsetDaysFromPlanting, -21);
        assert.equal(LIFECYCLE_ACTIVITY_TEMPLATES[12].activityType, 'postharvest');
        assert.equal(LIFECYCLE_ACTIVITY_TEMPLATES[12].offsetDaysAfterHarvest, 2);
    });

    it('TRANSPLANTED EGD=120: land prep -21, harvest 120, postharvest 122; core 9 offsets unchanged', () => {
        const method = 'TRANSPLANTED';
        const egd = 120;
        const adj = 0;
        const plantingDate = '2026-06-01';

        const coreByType = {
            transplanting: 0,
            irrigation: 7,
            first_fertilizing: 21,
            pest_control: 42,
            second_fertilizing: 64,
            crop_monitoring: 85,
            final_pest_inspection: 99,
            drain_irrigation: 109,
            harvesting: 120,
        };

        for (const t of LIFECYCLE_ACTIVITY_TEMPLATES) {
            if (t.offsetDaysFromPlanting != null || t.offsetDaysAfterHarvest != null) continue;
            if (t.conditions && t.conditions.establishment_method !== method) continue;
            if (t.ratio < 0.15) continue;
            assert.equal(
                computeTemplateOffset(t, method, egd, adj),
                coreByType[t.activityType],
                t.activityType
            );
        }

        const landPrep = LIFECYCLE_ACTIVITY_TEMPLATES[11];
        const harvest = LIFECYCLE_ACTIVITY_TEMPLATES[10];
        const postharvest = LIFECYCLE_ACTIVITY_TEMPLATES[12];
        const harvestOffset = computeTemplateOffset(harvest, method, egd, adj);
        const landOffset = computeTemplateOffset(landPrep, method, egd, adj);
        const postOffset = computeTemplateOffset(postharvest, method, egd, adj);

        assert.equal(landOffset, -21);
        assert.equal(harvestOffset, 120);
        assert.equal(postOffset, harvestOffset + 2);
        assert.equal(addCalendarDays(plantingDate, landOffset), '2026-05-11');
        assert.equal(addCalendarDays(plantingDate, harvestOffset), '2026-09-29');
        assert.equal(addCalendarDays(plantingDate, postOffset), '2026-10-01');
    });

    it('TRANSPLANTED generates 11 template indices (9 core + 2 extended)', () => {
        const indices = listLifecycleTemplateIndicesForMethod('TRANSPLANTED');
        assert.equal(indices.length, 11);
        assert.ok(indices.includes(11));
        assert.ok(indices.includes(12));
        assert.ok(!indices.includes(0));
        assert.ok(!indices.includes(1));
    });
});
