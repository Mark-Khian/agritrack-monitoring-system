const db = require('../config/db');
const logActivity = require('../middleware/logger');
const { syncActivityStatuses } = require('../utils/activityScheduler');

const getAllActivities = async (req, res) => {
    try {
        await syncActivityStatuses(db);
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        // Optional filter by planting_id
        const plantingFilter = req.query.planting_id ? 'AND activities.planting_id = ?' : '';
        const includeSystemGenerated = req.query.include_system_generated !== '0';
        const systemGeneratedFilter = includeSystemGenerated ? '' : 'AND activities.is_system_generated = 0';
        const filterParams = req.query.planting_id ? [req.query.planting_id] : [];

        const [activities] = await db.query(
            `SELECT
                activities.id,
                activities.activity_type,
                activities.activity_date,
                activities.original_scheduled_date,
                activities.reschedule_count,
                activities.schedule_ratio,
                activities.notes,
                activities.status,
                activities.is_system_generated,
                activities.created_at,
                plantings.id      AS planting_id,
                plantings.variety AS planting_variety,
                plantings.field_name AS field_name
             FROM activities
             JOIN plantings ON activities.planting_id = plantings.id
             WHERE activities.deleted_at IS NULL
               AND plantings.deleted_at IS NULL
               ${plantingFilter}
               ${systemGeneratedFilter}
             ORDER BY activities.activity_date ASC, activities.created_at DESC
             LIMIT ? OFFSET ?`,
            [...filterParams, limit, offset]
        );

        const countParams = req.query.planting_id ? [req.query.planting_id] : [];
        const countWhere = req.query.planting_id ? 'AND activities.planting_id = ?' : '';
        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) as total
             FROM activities
             JOIN plantings ON activities.planting_id = plantings.id
             WHERE activities.deleted_at IS NULL
               AND plantings.deleted_at IS NULL
               ${countWhere}
               ${includeSystemGenerated ? '' : 'AND activities.is_system_generated = 0'}`,
            countParams
        );

        res.status(200).json({
            data: activities,
            meta: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Get activities error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const getActivityById = async (req, res) => {
    try {
        await syncActivityStatuses(db);
        const [activities] = await db.query(
            `SELECT
                activities.id,
                activities.activity_type,
                activities.activity_date,
                activities.original_scheduled_date,
                activities.reschedule_count,
                activities.schedule_ratio,
                activities.notes,
                activities.status,
                activities.is_system_generated,
                activities.created_at,
                plantings.id      AS planting_id,
                plantings.variety AS planting_variety,
                plantings.field_name AS field_name
             FROM activities
             JOIN plantings ON activities.planting_id = plantings.id
             WHERE activities.id = ?
               AND activities.deleted_at IS NULL`,
            [req.params.id]
        );
        if (activities.length === 0)
            return res.status(404).json({ message: 'Activity not found.' });

        res.status(200).json(activities[0]);
    } catch (err) {
        console.error('Get activity error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const createActivity = async (req, res) => {
    const {
        planting_id, activity_type,
        activity_date, notes
    } = req.body;

    try {
        // Check if planting exists and is active
        const [planting] = await db.query(
            `SELECT plantings.id
             FROM plantings
             WHERE plantings.id = ?
               AND plantings.status = 'active'
               AND plantings.deleted_at IS NULL`,
            [planting_id]
        );
        if (planting.length === 0)
            return res.status(404).json({
                message: 'Active planting not found.'
            });

        const [result] = await db.query(
            `INSERT INTO activities
             (planting_id, activity_type, activity_date, original_scheduled_date,
              notes, performed_by, is_system_generated, reschedule_count, schedule_ratio, lifecycle_template_index)
             VALUES (?, ?, ?, ?, ?, NULL, 0, 0, NULL, NULL)`,
            [planting_id, activity_type, activity_date, activity_date, notes || null]
        );

        await logActivity({
            user_id: req.user.id,
            action: 'CREATE_ACTIVITY',
            entity: 'activities',
            entity_id: result.insertId,
            ip_address: req.ip
        });

        res.status(201).json({
            message: 'Activity logged!',
            activityId: result.insertId
        });
    } catch (err) {
        console.error('Create activity error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const updateActivity = async (req, res) => {
    const { activity_type, activity_date, notes, status } = req.body;

    try {
        // Enforce the completed activity lock rule
        const [current] = await db.query(
            'SELECT status FROM activities WHERE id = ? AND deleted_at IS NULL',
            [req.params.id]
        );
        if (current.length > 0 && current[0].status === 'completed' && status !== 'completed') {
            return res.status(400).json({
                message: 'Completed activities cannot be changed back to pending or ongoing.'
            });
        }

        const [result] = await db.query(
            `UPDATE activities
             SET activity_type = ?, activity_date = ?,
                 notes = ?, status = ?
             WHERE id = ? AND deleted_at IS NULL`,
            [activity_type, activity_date, notes, status, req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Activity not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_ACTIVITY',
            entity: 'activities',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Activity updated!' });
    } catch (err) {
        console.error('Update activity error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const deleteActivity = async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE activities
             SET deleted_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Activity not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'DELETE_ACTIVITY',
            entity: 'activities',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Activity deleted!' });
    } catch (err) {
        console.error('Delete activity error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = {
    getAllActivities,
    getActivityById,
    createActivity,
    updateActivity,
    deleteActivity
};