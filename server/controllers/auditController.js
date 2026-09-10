const db = require('../config/db');

const IDENTIFIER = /^[A-Za-z0-9_]{1,100}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parsePage = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const parseLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return 25;
    return Math.min(parsed, 100);
};

const listAuditLogs = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    try {
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const offset = (page - 1) * limit;
        const filters = [];
        const params = [];

        if (req.query.action) {
            const action = String(req.query.action).trim();
            if (!IDENTIFIER.test(action)) {
                return res.status(400).json({ message: 'Invalid action filter.' });
            }
            filters.push('l.action = ?');
            params.push(action);
        }

        if (req.query.entity) {
            const entity = String(req.query.entity).trim();
            if (!IDENTIFIER.test(entity) || entity.length > 50) {
                return res.status(400).json({ message: 'Invalid entity filter.' });
            }
            filters.push('l.entity = ?');
            params.push(entity);
        }

        if (req.query.status) {
            const status = String(req.query.status).trim().toLowerCase();
            if (status !== 'success' && status !== 'failed') {
                return res.status(400).json({ message: 'Invalid status filter.' });
            }
            filters.push('l.status = ?');
            params.push(status);
        }

        if (req.query.from) {
            const from = String(req.query.from).trim();
            if (!DATE_ONLY.test(from)) {
                return res.status(400).json({ message: 'Invalid from date.' });
            }
            filters.push('l.created_at >= ?');
            params.push(`${from} 00:00:00`);
        }

        if (req.query.to) {
            const to = String(req.query.to).trim();
            if (!DATE_ONLY.test(to)) {
                return res.status(400).json({ message: 'Invalid to date.' });
            }
            filters.push('l.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
            params.push(to);
        }

        const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        const [[countRow]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM activity_logs l
             ${whereSql}`,
            params
        );

        const [rows] = await db.query(
            `SELECT
                l.id,
                l.created_at,
                l.user_id AS actor_id,
                COALESCE(u.username, u.email, u.name) AS actor,
                l.actor_role,
                l.action,
                l.entity,
                l.entity_id,
                l.ip_address,
                l.status
             FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             ${whereSql}
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.status(200).json({
            page,
            limit,
            total: Number(countRow.total) || 0,
            logs: rows.map((row) => ({
                id: row.id,
                created_at: row.created_at,
                actor_id: row.actor_id,
                actor: row.actor,
                actor_role: row.actor_role,
                action: row.action,
                entity: row.entity,
                entity_id: row.entity_id,
                ip_address: row.ip_address,
                status: row.status,
            })),
        });
    } catch (err) {
        console.error('List audit logs error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { listAuditLogs };
