const db = require('../config/db');
const logActivity = require('../middleware/logger');

const getAllFields = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;
        const farmFilter = req.query.farm_id ? 'AND farms.id = ?' : '';
        const params = req.query.farm_id
            ? [req.user.id, req.query.farm_id, limit, offset]
            : [req.user.id, limit, offset];

        const [fields] = await db.query(
            `SELECT
                fields.id,
                fields.name,
                fields.size,
                fields.created_at,
                farms.id   AS farm_id,
                farms.name AS farm_name
             FROM fields
             JOIN farms ON fields.farm_id = farms.id
             WHERE fields.deleted_at IS NULL
               AND farms.deleted_at IS NULL
               AND farms.owner_id = ?
               ${farmFilter}
             ORDER BY fields.created_at DESC
             LIMIT ? OFFSET ?`,
            params
        );

        const countParams = req.query.farm_id
            ? [req.user.id, req.query.farm_id]
            : [req.user.id];
        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) as total
             FROM fields
             JOIN farms ON fields.farm_id = farms.id
             WHERE fields.deleted_at IS NULL
               AND farms.deleted_at IS NULL
               AND farms.owner_id = ?
               ${farmFilter}`,
            countParams
        );

        res.status(200).json({
            data: fields,
            meta: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Get fields error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const getFieldById = async (req, res) => {
    try {
        const [fields] = await db.query(
            `SELECT
                fields.id,
                fields.name,
                fields.size,
                fields.created_at,
                farms.id   AS farm_id,
                farms.name AS farm_name
             FROM fields
             JOIN farms ON fields.farm_id = farms.id
             WHERE fields.id = ?
             AND fields.deleted_at IS NULL`,
            [req.params.id]
        );
        if (fields.length === 0)
            return res.status(404).json({ message: 'Field not found.' });

        res.status(200).json(fields[0]);
    } catch (err) {
        console.error('Get field error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const createField = async (req, res) => {
    const { farm_id, name, size } = req.body;
    const normalizedName = (name || '').trim();

    try {
        if (!normalizedName) {
            return res.status(400).json({ message: 'Field name is required.' });
        }

        // Check if farm exists and belongs to authenticated user
        const [farm] = await db.query(
            `SELECT id
             FROM farms
             WHERE id = ?
               AND deleted_at IS NULL
               AND owner_id = ?`,
            [farm_id, req.user.id]
        );
        if (farm.length === 0)
            return res.status(404).json({ message: 'Farm not found.' });

        // Prevent duplicates within the same farm (case-insensitive)
        const [existing] = await db.query(
            `SELECT id
             FROM fields
             WHERE farm_id = ?
               AND deleted_at IS NULL
               AND LOWER(TRIM(name)) = LOWER(TRIM(?))`,
            [farm_id, normalizedName]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Field name already exists in this farm.' });
        }

        const [result] = await db.query(
            'INSERT INTO fields (farm_id, name, size) VALUES (?, ?, ?)',
            [farm_id, normalizedName, size]
        );

        await logActivity({
            user_id: req.user.id,
            action: 'CREATE_FIELD',
            entity: 'fields',
            entity_id: result.insertId,
            ip_address: req.ip
        });

        res.status(201).json({
            message: 'Field created!',
            fieldId: result.insertId
        });
    } catch (err) {
        console.error('Create field error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const updateField = async (req, res) => {
    const { name, size } = req.body;
    const normalizedName = (name || '').trim();

    try {
        if (!normalizedName) {
            return res.status(400).json({ message: 'Field name is required.' });
        }

        // Resolve field + farm ownership first
        const [currentField] = await db.query(
            `SELECT fields.id, fields.farm_id
             FROM fields
             JOIN farms ON fields.farm_id = farms.id
             WHERE fields.id = ?
               AND fields.deleted_at IS NULL
               AND farms.deleted_at IS NULL
               AND farms.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (currentField.length === 0) {
            return res.status(404).json({ message: 'Field not found.' });
        }

        // Prevent duplicates within the same farm (excluding current record)
        const [existing] = await db.query(
            `SELECT id
             FROM fields
             WHERE farm_id = ?
               AND deleted_at IS NULL
               AND id <> ?
               AND LOWER(TRIM(name)) = LOWER(TRIM(?))`,
            [currentField[0].farm_id, req.params.id, normalizedName]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Field name already exists in this farm.' });
        }

        const [result] = await db.query(
            `UPDATE fields
             SET name = ?, size = ?
             WHERE id = ? AND deleted_at IS NULL`,
            [normalizedName, size, req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Field not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_FIELD',
            entity: 'fields',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Field updated!' });
    } catch (err) {
        console.error('Update field error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const deleteField = async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE fields
             SET deleted_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Field not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'DELETE_FIELD',
            entity: 'fields',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Field deleted!' });
    } catch (err) {
        console.error('Delete field error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = {
    getAllFields,
    getFieldById,
    createField,
    updateField,
    deleteField
};