const db = require('../config/db');
const logActivity = require('../middleware/logger');
const { utcTodayYmd } = require('../utils/plantingDates');

const deriveActivityStatus = (activity) => {
    let s = (activity.status || 'PENDING').toUpperCase();
    if (s !== 'PENDING') {
        return { ...activity, derived_status: s, status: s.toLowerCase() };
    }
    if (!activity.planned_date) return { ...activity, derived_status: 'PENDING', status: 'pending' };
    
    const today = utcTodayYmd();
    let planned;
    if (activity.planned_date instanceof Date) {
        // Adjust for timezone offset to get local YYYY-MM-DD safely
        const d = new Date(activity.planned_date.getTime() - (activity.planned_date.getTimezoneOffset() * 60000));
        planned = d.toISOString().split('T')[0];
    } else {
        planned = String(activity.planned_date).split('T')[0];
    }
    
    let derived = 'PENDING';
    if (planned > today) derived = 'PLANNED';
    else if (planned === today) derived = 'DUE';
    else derived = 'OVERDUE';
    
    // For UI compatibility before Phase 7, keep 'status' lowercased but include 'derived_status'
    return { ...activity, derived_status: derived, status: derived === 'PLANNED' ? 'pending' : derived.toLowerCase() };
};

const getAllActivities = async (req, res) => {
    try {
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
                activities.category,
                activities.planned_date,
                activities.actual_date,
                activities.original_scheduled_date,
                activities.reschedule_count,
                activities.schedule_ratio,
                activities.notes,
                activities.details,
                activities.status,
                activities.activity_source,
                activities.created_at,
                plantings.id      AS planting_id,
                plantings.variety AS planting_variety,
                plantings.field_name AS field_name,
                plantings.expected_stage AS expected_stage,
                plantings.observed_stage AS observed_stage
             FROM activities
             JOIN plantings ON activities.planting_id = plantings.id
             WHERE activities.deleted_at IS NULL
               AND plantings.deleted_at IS NULL
               ${plantingFilter}
               ${systemGeneratedFilter}
             ORDER BY activities.planned_date ASC, activities.created_at DESC
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
        const [activities] = await db.query(
            `SELECT
                activities.id,
                activities.activity_type,
                activities.category,
                activities.planned_date,
                activities.actual_date,
                activities.original_scheduled_date,
                activities.reschedule_count,
                activities.schedule_ratio,
                activities.notes,
                activities.details,
                activities.status,
                activities.activity_source,
                activities.created_at,
                plantings.id      AS planting_id,
                plantings.variety AS planting_variety,
                plantings.field_name AS field_name,
                plantings.expected_stage AS expected_stage,
                plantings.observed_stage AS observed_stage
             FROM activities
             JOIN plantings ON activities.planting_id = plantings.id
             WHERE activities.id = ?
               AND activities.deleted_at IS NULL`,
            [req.params.id]
        );
        if (activities.length === 0)
            return res.status(404).json({ message: 'Activity not found.' });

        res.status(200).json(deriveActivityStatus(activities[0]));
    } catch (err) {
        console.error('Get activity error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const createActivity = async (req, res) => {
    const {
        planting_id, activity_type,
        planned_date, actual_date, category, notes, details, activity_source
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
            
        const source = activity_source || 'FARMER_MANUAL';
        let status = 'PENDING';
        if (actual_date) {
            status = 'COMPLETED'; // If they provide an actual date on creation, it's considered completed immediately.
        }

        const [result] = await db.query(
            `INSERT INTO activities
             (planting_id, activity_type, category, planned_date, actual_date, original_scheduled_date,
              notes, details, performed_by, activity_source, status, reschedule_count, schedule_ratio, lifecycle_template_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, NULL, NULL)`,
            [
                planting_id, 
                activity_type, 
                category || null, 
                planned_date || null, 
                actual_date || null, 
                planned_date || actual_date || null, 
                notes || null, 
                details ? JSON.stringify(details) : null,
                source,
                status
            ]
        );

        if (activity_type === 'CROP_STAGE_OBSERVATION') {
            const stage = details && details.stage ? details.stage : null;
            if (stage && actual_date) {
                await db.query(
                    `UPDATE plantings SET observed_stage = ?, observed_stage_date = ? WHERE id = ? AND deleted_at IS NULL`,
                    [stage, actual_date, planting_id]
                );
            }
        }

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
    const { activity_type, planned_date, actual_date, notes, status, category, details } = req.body;

    try {
        // Enforce the completed activity lock rule
        const [current] = await db.query(
            'SELECT * FROM activities WHERE id = ? AND deleted_at IS NULL',
            [req.params.id]
        );
        
        let finalStatus = (status || '').toUpperCase();
        if (current.length > 0 && finalStatus) {
            const oldStatus = current[0].status;
            if (['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(oldStatus) && finalStatus !== oldStatus) {
                return res.status(400).json({
                    message: `Cannot change status of a ${oldStatus} activity.`
                });
            }
        }
        
        if (!finalStatus) finalStatus = current[0].status; // fallback

        const nextPlanned = planned_date !== undefined ? (planned_date || null) : current[0].planned_date;
        const nextActual = actual_date !== undefined ? (actual_date || null) : current[0].actual_date;
        const nextType = activity_type !== undefined ? activity_type : current[0].activity_type;
        const nextNotes = notes !== undefined ? notes : current[0].notes;
        const nextCategory = category !== undefined ? (category || null) : current[0].category;

        const [result] = await db.query(
            `UPDATE activities
             SET activity_type = ?, planned_date = ?, actual_date = ?,
                 notes = ?, status = ?, category = ?, details = ?
             WHERE id = ? AND deleted_at IS NULL`,
            [
                nextType, 
                nextPlanned, 
                nextActual, 
                nextNotes, 
                finalStatus, 
                nextCategory, 
                details !== undefined ? (details ? JSON.stringify(details) : null) : current[0].details,
                req.params.id
            ]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Activity not found.' });

        if (activity_type === 'CROP_STAGE_OBSERVATION') {
            const stage = details && details.stage ? details.stage : null;
            if (stage && actual_date) {
                await db.query(
                    `UPDATE plantings SET observed_stage = ?, observed_stage_date = ? WHERE id = (SELECT planting_id FROM activities WHERE id = ?) AND deleted_at IS NULL`,
                    [stage, actual_date, req.params.id]
                );
            }
        }

        if (['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(finalStatus)) {
            await db.query(
                `DELETE FROM notifications 
                 WHERE type IN ('activity_due', 'activity_overdue') AND related_id = ?`,
                [req.params.id]
            );
        }

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

        await db.query(
            `DELETE FROM notifications 
             WHERE type IN ('activity_due', 'activity_overdue') AND related_id = ?`,
            [req.params.id]
        );

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