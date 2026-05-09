const db = require('../config/db');
const logActivity = require('../middleware/logger');

// ── GET ALL FARMS ─────────────────────────
const getAllFarms = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const [farms] = await db.query(
            `SELECT
                farms.id,
                farms.name,
                farms.location,
                farms.created_at,
                users.id   AS owner_id,
                users.name AS owner_name,
                (
                  SELECT COUNT(*)
                  FROM fields
                  WHERE fields.farm_id = farms.id
                    AND fields.deleted_at IS NULL
                ) AS fields_count
             FROM farms
             JOIN users ON farms.owner_id = users.id
             WHERE farms.deleted_at IS NULL
               AND farms.owner_id = ?
             ORDER BY farms.created_at DESC
             LIMIT ? OFFSET ?`,
            [req.user.id, limit, offset]
        );

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) as total
             FROM farms
             WHERE deleted_at IS NULL
               AND owner_id = ?`,
            [req.user.id]
        );

        res.status(200).json({
            data: farms,
            meta: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Get farms error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── GET SINGLE FARM ───────────────────────
const getFarmById = async (req, res) => {
    try {
        const [farms] = await db.query(
            `SELECT
                farms.id,
                farms.name,
                farms.location,
                farms.created_at,
                users.id   AS owner_id,
                users.name AS owner_name,
                (
                  SELECT COUNT(*)
                  FROM fields
                  WHERE fields.farm_id = farms.id
                    AND fields.deleted_at IS NULL
                ) AS fields_count
             FROM farms
             JOIN users ON farms.owner_id = users.id
             WHERE farms.id = ?
               AND farms.deleted_at IS NULL`,
            [req.params.id]
        );
        if (farms.length === 0)
            return res.status(404).json({ message: 'Farm not found.' });

        res.status(200).json(farms[0]);
    } catch (err) {
        console.error('Get farm error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── CREATE FARM ───────────────────────────
const createFarm = async (req, res) => {
    const { name, location, owner_id } = req.body;

    try {
        // Check if owner exists
        const [owner] = await db.query(
            'SELECT id FROM users WHERE id = ? AND is_active = 1',
            [owner_id]
        );
        if (owner.length === 0)
            return res.status(404).json({ message: 'Owner not found.' });

        const [result] = await db.query(
            'INSERT INTO farms (name, location, owner_id) VALUES (?, ?, ?)',
            [name, location, owner_id]
        );

        await logActivity({
            user_id: req.user.id,
            action: 'CREATE_FARM',
            entity: 'farms',
            entity_id: result.insertId,
            ip_address: req.ip
        });

        res.status(201).json({
            message: 'Farm created!',
            farmId: result.insertId
        });
    } catch (err) {
        console.error('Create farm error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── UPDATE FARM ───────────────────────────
const updateFarm = async (req, res) => {
    const { name, location } = req.body;

    try {
        const [result] = await db.query(
            `UPDATE farms
             SET name = ?, location = ?
             WHERE id = ? AND deleted_at IS NULL`,
            [name, location, req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Farm not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_FARM',
            entity: 'farms',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Farm updated!' });
    } catch (err) {
        console.error('Update farm error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── SOFT DELETE FARM ──────────────────────
const deleteFarm = async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE farms
             SET deleted_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Farm not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'DELETE_FARM',
            entity: 'farms',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Farm deleted!' });
    } catch (err) {
        console.error('Delete farm error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = {
    getAllFarms,
    getFarmById,
    createFarm,
    updateFarm,
    deleteFarm
};