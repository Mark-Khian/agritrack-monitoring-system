const db = require('../config/db');
const { normalizeRole } = require('../security/rbac');
const { getClientIp } = require('../utils/clientIp');

const snapshotRole = (role) => normalizeRole(role);

const logActivity = async ({
    user_id = null,
    actor_role = null,
    action,
    entity = null,
    entity_id = null,
    ip_address = null,
    status = 'success',
    connection = null,
}) => {
    const executor = connection || db;
    const run = () => executor.query(
        `INSERT INTO activity_logs
         (user_id, actor_role, action, entity, entity_id, ip_address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            user_id ?? null,
            actor_role ?? null,
            action,
            entity ?? null,
            entity_id ?? null,
            ip_address ?? null,
            status || 'success',
        ]
    );

    if (connection) {
        await run();
        return;
    }

    try {
        await run();
    } catch (err) {
        console.error('Logging error:', err.message);
    }
};

logActivity.snapshotRole = snapshotRole;

logActivity.fromRequest = (req, fields = {}) => {
    const { action, entity = null, entity_id = null, status = 'success', connection = null } = fields;
    return logActivity({
        user_id: req.user?.id ?? null,
        actor_role: snapshotRole(req.user?.role),
        action,
        entity,
        entity_id,
        ip_address: getClientIp(req),
        status,
        connection,
    });
};

module.exports = logActivity;
