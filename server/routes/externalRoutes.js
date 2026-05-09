const express = require('express');
const router = express.Router();
const db = require('../config/db');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { legacyGrowthStageForApi } = require('../services/plantingPresentationService');

// All external routes require API key
router.use(apiKeyAuth);

// ── GET Farms (external) ──────────────────
router.get('/farms', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const [farms] = await db.query(
            `SELECT
                farms.id,
                farms.name,
                farms.location,
                farms.created_at
             FROM farms
             WHERE farms.deleted_at IS NULL
             ORDER BY farms.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [[{ total }]] = await db.query(
            'SELECT COUNT(*) as total FROM farms WHERE deleted_at IS NULL'
        );

        res.status(200).json({
            data: farms,
            meta: { page, limit, total, pages: Math.ceil(total / limit) },
            source: 'AgriTrack API v1'
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

// ── GET Harvests Summary (external) ───────
router.get('/harvests/summary', async (req, res) => {
    try {
        const [summary] = await db.query(
            `SELECT
                COUNT(*)                    AS total_harvests,
                SUM(yield_kg)               AS total_yield_kg,
                AVG(yield_kg)               AS average_yield_kg,
                MAX(yield_kg)               AS highest_yield_kg,
                MIN(yield_kg)               AS lowest_yield_kg
             FROM harvests
             WHERE deleted_at IS NULL`
        );

        const [byGrade] = await db.query(
            `SELECT
                quality_grade,
                COUNT(*) AS count,
                SUM(yield_kg) AS total_kg
             FROM harvests
             WHERE deleted_at IS NULL
             GROUP BY quality_grade`
        );

        res.status(200).json({
            summary: summary[0],
            by_grade: byGrade,
            source: 'AgriTrack API v1'
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

// ── GET Plantings (external) ──────────────
router.get('/plantings', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const [plantings] = await db.query(
            `SELECT
                plantings.id,
                plantings.variety,
                plantings.variety_id,
                plantings.planting_date,
                plantings.expected_harvest,
                plantings.season,
                plantings.lifecycle_state,
                plantings.expected_growth_days,
                plantings.adjustment_days,
                plantings.growth_stage_recorded,
                plantings.status,
                fields.name AS field_name
             FROM plantings
             JOIN fields ON plantings.field_id = fields.id
             WHERE plantings.deleted_at IS NULL
             ORDER BY plantings.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [[{ total }]] = await db.query(
            'SELECT COUNT(*) as total FROM plantings WHERE deleted_at IS NULL'
        );

        const data = plantings.map((p) => ({
            ...p,
            growth_stage: legacyGrowthStageForApi(p),
        }));

        res.status(200).json({
            data,
            meta: { page, limit, total, pages: Math.ceil(total / limit) },
            source: 'AgriTrack API v1'
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;