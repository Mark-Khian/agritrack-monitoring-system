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

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (harvest_date && harvest_date > todayStr) {
        return res.status(400).json({ message: 'Harvest Date cannot be in the future.' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

﻿        // Check planting exists and is active
        const [planting] = await connection.query(
            `SELECT p.id, p.planting_date, DATEDIFF(?, p.planting_date) AS maturity_days
             FROM plantings p
             WHERE p.id = ?
               AND p.status = 'active'
               AND p.deleted_at IS NULL`,
            [harvest_date, planting_id]
        );
        if (planting.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: 'Active planting not found.'
            });
        }
        if (Number(planting[0].maturity_days) < 60) {
            await connection.rollback();
            return res.status(400).json({
                message: 'Harvest cannot be recorded before 60 days from the planting date.'
            });
        }


        // Check for existing harvest (active or soft-deleted)
        const [existing] = await connection.query(
            `SELECT id, deleted_at FROM harvests
             WHERE planting_id = ?
             FOR UPDATE`,
            [planting_id]
        );

        let harvestRecordId;

        if (existing.length > 0) {
            if (existing[0].deleted_at === null) {
                // Active harvest exists
                await connection.rollback();
                return res.status(409).json({
                    message: 'A harvest record already exists for this planting.'
                });
            } else {
                // Soft-deleted harvest exists -> Reactivate
                await connection.query(
                    `UPDATE harvests
                     SET harvest_date = ?, yield_kg = ?, quality_grade = ?,
                         remarks = ?, financial_value = ?, deleted_at = NULL
                     WHERE id = ?`,
                    [
                        harvest_date, yield_kg, quality_grade || null,
                        remarks || null, financial_value != null ? parseFloat(financial_value) : null,
                        existing[0].id
                    ]
                );
                harvestRecordId = existing[0].id;
            }
        } else {
            // Insert harvest
            const [result] = await connection.query(
                `INSERT INTO harvests
                 (planting_id, harvest_date, yield_kg, quality_grade, remarks, financial_value)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [planting_id, harvest_date, yield_kg,
                    quality_grade || null, remarks || null, financial_value != null ? parseFloat(financial_value) : null]
            );
            harvestRecordId = result.insertId;
        }

        // Terminal lifecycle: harvest is the only automatic closer.
        // NOTE: The write to lifecycle_state = 'HARVESTED' is for one-way legacy
        // backward compatibility only. The true authoritative business state is
        // status = 'completed'. Do not read lifecycle_state as authoritative.
        await connection.query(
            `UPDATE plantings
             SET status = 'completed',
                 lifecycle_state = 'HARVESTED',
                 lifecycle_state_changed_at = NOW(),
                 lifecycle_state_reason = 'Harvest recorded'
             WHERE id = ?`,
            [planting_id]
        );

        // â”€â”€ Reconcile Harvesting Activity â”€â”€â”€â”€â”€â”€â”€â”€â”€
        await connection.query(
            `UPDATE activities
             SET status = 'COMPLETED', actual_date = ?
             WHERE planting_id = ?
               AND activity_type = 'harvesting'
               AND status = 'PENDING'
               AND deleted_at IS NULL`,
            [harvest_date, planting_id]
        );

        // â”€â”€ Cancel remaining operational activities (execution layer) â”€â”€â”€â”€â”€â”€â”€â”€â”€
        await connection.query(
            `UPDATE activities
             SET status = 'CANCELLED'
             WHERE planting_id = ?
               AND status = 'PENDING'
               AND actual_date IS NULL
               AND deleted_at IS NULL`,
            [planting_id]
        );

        // â”€â”€ Clear notifications for cancelled/completed activities â”€â”€â”€â”€â”€â”€â”€â”€â”€
        await connection.query(
            `DELETE FROM notifications 
             WHERE type IN ('activity_due', 'activity_overdue')
               AND related_id IN (
                   SELECT id FROM activities WHERE planting_id = ?
               )`,
            [planting_id]
        );

        await connection.commit();

        await logActivity({
            user_id: req.user.id,
            action: 'CREATE_HARVEST',
            entity: 'harvests',
            entity_id: harvestRecordId,
            ip_address: req.ip
        });

        res.status(201).json({
            message: 'Harvest recorded! Planting marked complete and pending activities archived.',
            harvestId: harvestRecordId
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

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (harvest_date && harvest_date > todayStr) {
        return res.status(400).json({ message: 'Harvest Date cannot be in the future.' });
    }

﻿    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

﻿        // 1. Fetch current Harvest and Planting baseline
        const [harvests] = await connection.query(
            `SELECT h.planting_id, h.harvest_date, p.planting_date, DATEDIFF(?, p.planting_date) AS maturity_days
             FROM harvests h
             JOIN plantings p ON p.id = h.planting_id
             WHERE h.id = ? AND h.deleted_at IS NULL
             FOR UPDATE`,
            [harvest_date, req.params.id]
        );

        
        if (harvests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Harvest not found.' });
        }

        const plantingId = harvests[0].planting_id;
        const oldHarvestDate = harvests[0].harvest_date;

        // 2. Preserve current Harvest Update
        await connection.query(
            `UPDATE harvests
             SET harvest_date = ?, yield_kg = ?,
                 quality_grade = ?, remarks = ?,
                 financial_value = ?
             WHERE id = ?`,
            [harvest_date, yield_kg, quality_grade, remarks, financial_value != null ? parseFloat(financial_value) : null, req.params.id]
        );

        // 3 & 4. Date-Change Detection and Activity Synchronization
        if (harvest_date) {
            const oldD = new Date(oldHarvestDate);
            const oldYMD = `${oldD.getFullYear()}-${String(oldD.getMonth() + 1).padStart(2, '0')}-${String(oldD.getDate()).padStart(2, '0')}`;
            
            if (harvest_date !== oldYMD) {
                await connection.query(
                    `UPDATE activities
                     SET actual_date = ?
                     WHERE planting_id = ?
                       AND activity_type = 'harvesting'
                       AND status = 'COMPLETED'
                       AND DATE(actual_date) = DATE(?)
                       AND deleted_at IS NULL`,
                    [harvest_date, plantingId, oldHarvestDate]
                );
            }
        }

        await connection.commit();

        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_HARVEST',
            entity: 'harvests',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Harvest updated!' });
    } catch (err) {
        await connection.rollback();
        console.error('Update harvest error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    } finally {
        connection.release();
    }

};

const deleteHarvest = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Fetch harvest info before deleting
        const [harvests] = await connection.query(
            `SELECT planting_id, harvest_date FROM harvests WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (harvests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Harvest not found.' });
        }
        const { planting_id, harvest_date } = harvests[0];

        // 2. Soft-delete the harvest record
        await connection.query(
            `UPDATE harvests SET deleted_at = NOW() WHERE id = ?`,
            [req.params.id]
        );

        // 3. Safety Check: Verify no other valid non-deleted harvests exist for this planting
        const [otherHarvests] = await connection.query(
            `SELECT id FROM harvests WHERE planting_id = ? AND deleted_at IS NULL`,
            [planting_id]
        );

        if (otherHarvests.length === 0) {
            // 4. Revert Planting from completed -> active
            // Reset authoritative status and clear legacy lifecycle reason/timestamps safely
            await connection.query(
                `UPDATE plantings
                 SET status = 'active',
                     lifecycle_state = 'ACTIVE',
                     lifecycle_state_changed_at = NULL,
                     lifecycle_state_reason = NULL
                 WHERE id = ?`,
                [planting_id]
            );

            // 5. Safely revert ONLY the uniquely identified harvesting activity affected by this harvest
            await connection.query(
                `UPDATE activities
                 SET status = 'PENDING', actual_date = NULL
                 WHERE planting_id = ?
                   AND activity_type = 'harvesting'
                   AND status = 'COMPLETED'
                   AND DATE(actual_date) = DATE(?)
                   AND deleted_at IS NULL`,
                [planting_id, harvest_date]
            );
        }

        await connection.commit();

        await logActivity({
            user_id: req.user.id,
            action: 'DELETE_HARVEST',
            entity: 'harvests',
            entity_id: parseInt(req.params.id),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Harvest deleted! Planting and harvesting task reverted to active.' });
    } catch (err) {
        await connection.rollback();
        console.error('Delete harvest error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    } finally {
        connection.release();
    }
};

module.exports = {
    getAllHarvests,
    getHarvestById,
    createHarvest,
    updateHarvest,
    deleteHarvest
};
