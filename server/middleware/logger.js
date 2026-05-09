const db = require('../config/db');

const logActivity = async ({
    user_id = null,
    action,
    entity = null,
    entity_id = null,
    ip_address = null,
    status = 'success'
}) => {
    try {
        await db.query(
            `INSERT INTO activity_logs 
       (user_id, action, entity, entity_id, ip_address, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, action, entity, entity_id, ip_address, status]
        );
    } catch (err) {
        console.error('Logging error:', err.message);
    }
};

module.exports = logActivity;