const db = require('../config/db');
const logActivity = require('../middleware/logger');

const getAllHarvests = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const [harvests] = await db.query(
            `SELECT
                harvests.id,
                harvests.harvest_date,
                harvests.yield_kg,
                harvests.quality_grade,
                harvests.financial_value,
                harvests.remarks,
                harvests.created_at,
                plantings.id      AS planting_id,
                plantings.variety AS planting_variety,
                plantings.season,
                plantings.field_name AS field_name
             FROM harvests
             JOIN plantings ON harvests.planting_id = plantings.id
             WHERE harvests.deleted_at IS NULL
               AND plantings.deleted_at IS NULL
               AND harvests.harvest_date IS NOT NULL
               AND harvests.yield_kg IS NOT NULL
             ORDER BY harvests.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) as total
             FROM harvests
             JOIN plantings ON harvests.planting_id = plantings.id
             WHERE harvests.deleted_at IS NULL
               AND plantings.deleted_at IS NULL
               AND harvests.harvest_date IS NOT NULL
               AND harvests.yield_kg IS NOT NULL`
        );

        res.status(200).json({
            data: harvests,
            meta: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Get harvests error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const getHarvestById = async (req, res) => {
    try {
        const [harvests] = await db.query(
            `SELECT
                harvests.id,
                harvests.harvest_date,
                harvests.yield_kg,
                harvests.quality_grade,
                harvests.financial_value,
                harvests.remarks,
                harvests.created_at,
                plantings.id      AS planting_id,
                plantings.variety AS planting_variety,
                plantings.season
             FROM harvests
             JOIN plantings ON harvests.planting_id = plantings.id
             WHERE harvests.id = ?
               AND harvests.deleted_at IS NULL`,
            [req.params.id]
        );
        if (harvests.length === 0)
            return res.status(404).json({ message: 'Harvest not found.' });

        res.status(200).json(harvests[0]);
    } catch (err) {
        console.error('Get harvest error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const createHarvest = async (req, res) => {
    const {
        planting_id, harvest_date,
        yield_kg, quality_grade, remarks,
        financial_value
    } = req.body;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check planting exists and is active
        const [planting] = await connection.query(
            `SELECT p.id FROM plantings p
             WHERE p.id = ?
               AND p.status = 'active'
               AND p.deleted_at IS NULL`,
            [planting_id]
        );
        if (planting.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: 'Active planting not found.'
            });
        }

        // Check no duplicate harvest
        const [existing] = await connection.query(
            `SELECT id FROM harvests
             WHERE planting_id = ?
               AND deleted_at IS NULL`,
            [planting_id]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                message: 'A harvest record already exists for this planting.'
            });
        }

        // Insert harvest
        const [result] = await connection.query(
            `INSERT INTO harvests
             (planting_id, harvest_date, yield_kg, quality_grade, remarks, financial_value)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [planting_id, harvest_date, yield_kg,
                quality_grade || null, remarks || null, financial_value != null ? parseFloat(financial_value) : null]
        );

        // Terminal lifecycle: harvest is the only automatic closer
        await connection.query(
            `UPDATE plantings
             SET status = 'completed',
                 lifecycle_state = 'HARVESTED',
                 lifecycle_state_changed_at = NOW(),
                 lifecycle_state_reason = 'Harvest recorded'
             WHERE id = ?`,
            [planting_id]
        );

        // ── Cancel remaining operational activities (execution layer) ─────────
        await connection.query(
            `UPDATE activities
             SET status = 'cancelled'
             WHERE planting_id = ?
               AND status IN ('pending','ongoing')
               AND deleted_at IS NULL`,
            [planting_id]
        );

        await connection.commit();

        await logActivity({
            user_id: req.user.id,
            action: 'CREATE_HARVEST',
            entity: 'harvests',
            entity_id: result.insertId,
            ip_address: req.ip
        });

        res.status(201).json({
            message: 'Harvest recorded! Planting marked complete and pending activities archived.',
            harvestId: result.insertId
        });
    } catch (err) {
        await connection.rollback();
        console.error('Create harvest error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    } finally {
        connection.release();
    }
};

const updateHarvest = async (req, res) => {
    const { harvest_date, yield_kg, quality_grade, remarks, financial_value } = req.body;

    try {
        const [result] = await db.query(
            `UPDATE harvests
             SET harvest_date = ?, yield_kg = ?,
                 quality_grade = ?, remarks = ?,
                 financial_value = ?
             WHERE id = ? AND deleted_at IS NULL`,
            [harvest_date, yield_kg, quality_grade, remarks, financial_value != null ? parseFloat(financial_value) : null, req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Harvest not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_HARVEST',
            entity: 'harvests',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Harvest updated!' });
    } catch (err) {
        console.error('Update harvest error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const deleteHarvest = async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE harvests
             SET deleted_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Harvest not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'DELETE_HARVEST',
            entity: 'harvests',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Harvest deleted!' });
    } catch (err) {
        console.error('Delete harvest error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = {
    getAllHarvests,
    getHarvestById,
    createHarvest,
    updateHarvest,
    deleteHarvest
};