/**
 * Resolve the current active Farm Owner / Admin.
 * Never falls back to inactive historical admin rows.
 * Always reads from the database (no in-process cache) so disable/reactivate
 * takes effect immediately.
 */
'use strict';

const db = require('../config/db');

const ACTIVE_ADMIN_SELECT = `
    SELECT id, farm_latitude, farm_longitude, farm_location_name
    FROM users
    WHERE role = 'admin'
      AND is_active = 1
      AND status = 'ACTIVE'
    ORDER BY id ASC
    LIMIT 1
`;

/**
 * @returns {Promise<object|null>} Active admin row, or null if none.
 */
const getActiveAdmin = async () => {
    const [rows] = await db.query(ACTIVE_ADMIN_SELECT);
    return rows[0] || null;
};

/**
 * @returns {Promise<number|null>}
 */
const getActiveAdminId = async () => {
    const admin = await getActiveAdmin();
    return admin ? admin.id : null;
};

module.exports = {
    getActiveAdmin,
    getActiveAdminId,
};
