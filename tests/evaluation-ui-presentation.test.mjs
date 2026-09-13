/**
 * Analytics timeline range helpers + harvest remarks ownership tag.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    harvestByPeriod,
    fillTimelineForRange,
    getAnalyticsRangeBounds,
    timelineSubtitleForRange,
    toLocalYmd,
} from '../src/utils/analyticsTimeline.js';

describe('analytics timeline range', () => {
    const now = new Date(2026, 8, 13, 12, 0, 0); // Sep 13, 2026 local

    it('7d uses daily buckets within the selected window', () => {
        const { start, end, bucket } = getAnalyticsRangeBounds('7d', now);
        assert.equal(bucket, 'day');
        assert.equal(toLocalYmd(end), '2026-09-13');
        assert.equal(toLocalYmd(start), '2026-09-06');

        const harvests = [
            { id: 1, planting_id: 1, harvest_date: '2026-09-10', yield_kg: 4670 },
            { id: 2, planting_id: 2, harvest_date: '2026-09-12', yield_kg: 3880 },
            { id: 3, planting_id: 3, harvest_date: '2026-04-01', yield_kg: 9999 }, // outside
        ];
        const plantings = [
            { id: 1, variety: 'Rc222', field_name: 'A' },
            { id: 2, variety: 'Rc212', field_name: 'B' },
        ];
        // Filter as Analytics does for 7d
        const filtered = harvests.filter((h) => {
            const d = new Date(h.harvest_date);
            return d >= start && d <= end;
        });
        const agg = harvestByPeriod(filtered, plantings, '7d', now);
        const chart = fillTimelineForRange(agg, '7d', now);

        assert.equal(timelineSubtitleForRange('7d'), 'Daily yield in kilograms');
        assert.ok(chart.length >= 7 && chart.length <= 9);
        assert.ok(!chart.some((row) => String(row.month).includes('Apr')));
        const total = chart.reduce((s, r) => s + Number(r.yield_kg || 0), 0);
        assert.equal(total, 8550);
        assert.ok(chart.some((r) => Number(r.yield_kg) === 4670));
        assert.ok(chart.some((r) => Number(r.yield_kg) === 3880));
    });

    it('30d uses daily domain; 3m uses monthly domain', () => {
        assert.equal(getAnalyticsRangeBounds('30d', now).bucket, 'day');
        assert.equal(getAnalyticsRangeBounds('3m', now).bucket, 'month');
        const chart3m = fillTimelineForRange([], '3m', now);
        assert.ok(chart3m.length >= 3 && chart3m.length <= 4);
        assert.equal(timelineSubtitleForRange('3m'), 'Monthly yield in kilograms');
    });
});

describe('export harvest heading pluralization', () => {
    const heading = (n) => `Select Harvest Record${n === 1 ? '' : 's'} (${n})`;
    it('singular and plural', () => {
        assert.equal(heading(1), 'Select Harvest Record (1)');
        assert.equal(heading(14), 'Select Harvest Records (14)');
        assert.equal(heading(0), 'Select Harvest Records (0)');
    });
});

describe('evaluation harvest remarks are user-facing only', () => {
    it('remarks match quality grade and contain no ownership tokens', async () => {
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        const {
            harvestRemarks,
            HARVEST_REMARK_BY_KEY,
            HARVESTED_CROPS,
            remarkForQualityGrade,
        } = require('../server/scripts/evaluation-dataset/datasetDefinition.js');
        const { SEED_DATASET_ID, SYNTHETIC_MARKER } = require('../server/scripts/evaluation-dataset/constants.js');
        const { isSeedOwnershipProven } = require('../server/scripts/evaluation-dataset/seedOwnership.js');

        const banned = /AGRITRACK_EVAL|synthetic|seed ownership|seed marker|\bH0[1-9]\b|\bH1[0-4]\b/i;

        for (const crop of HARVESTED_CROPS) {
            const text = harvestRemarks(crop.key);
            assert.equal(text, remarkForQualityGrade(crop.quality_grade));
            assert.equal(text, HARVEST_REMARK_BY_KEY[crop.key]);
            assert.equal(banned.test(text), false, `${crop.key} remark leaked internal token: ${text}`);
            assert.equal(text.includes(SEED_DATASET_ID), false);
            assert.equal(text.includes(SYNTHETIC_MARKER), false);
            assert.equal(text.includes(crop.key), false);

            const grade = String(crop.quality_grade).toLowerCase();
            if (grade === 'a') {
                assert.match(text, /rated high|high quality|acceptable/i);
                assert.equal(/reject|fail|defect/i.test(text), false, `${crop.key} Grade A must not sound rejected`);
            } else if (grade === 'b') {
                assert.match(text, /acceptable/i);
                assert.equal(/reject/i.test(text), false);
            } else if (grade === 'c') {
                assert.match(text, /lower grain quality/i);
                assert.equal(/reject/i.test(text), false);
            } else if (grade === 'rejected') {
                assert.match(text, /rejected/i);
            }
        }

        // Explicit confirmed mismatches
        assert.equal(harvestRemarks('H09'), 'Grain quality rated high after final field inspection.');
        assert.equal(/reject/i.test(harvestRemarks('H09')), false);
        assert.equal(
            harvestRemarks('H12'),
            'Grain quality rejected after final inspection due to visible defects.'
        );
        assert.match(harvestRemarks('H12'), /rejected/i);

        // Ownership remains proven via lifecycle_state_reason alone (clean remarks)
        assert.equal(
            isSeedOwnershipProven(
                `Harvest recorded — ${SYNTHETIC_MARKER} [${SEED_DATASET_ID}:H13]`,
                harvestRemarks('H13')
            ),
            true
        );
        assert.equal(
            isSeedOwnershipProven('normal farm note', harvestRemarks('H13')),
            false
        );
        assert.equal(
            isSeedOwnershipProven(
                '',
                `old ${SYNTHETIC_MARKER} [${SEED_DATASET_ID}:H01]`
            ),
            true
        );
    });
});
