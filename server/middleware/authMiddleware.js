const crypto = require('crypto');
const db = require('../config/db');
const csrfGuard = require('./csrfGuard');

const SESSION_COOKIE_NAME = 'agritrack_session';

const authenticate = ({ allowPasswordChangeRequired = false } = {}) => async (req, res, next) => {
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!cookieToken) {
        return res.status(401).json({ message: 'Access denied. No authentication provided.' });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');

        const [session] = await db.query(
            `SELECT user_id, (expires_at > NOW()) AS not_expired
             FROM sessions
             WHERE token_hash = ? AND is_active = 1
             LIMIT 1`,
            [tokenHash]
        );

        if (session.length === 0) {
            return res.status(401).json({ message: 'Session invalidated.' });
        }

        if (!session[0].not_expired) {
            return res.status(401).json({ message: 'Session expired. Please login again.' });
        }

        const userId = session[0].user_id;

        const [users] = await db.query(
            `SELECT id, is_active, role, must_change_password
             FROM users
             WHERE id = ?`,
            [userId]
        );
        if (users.length === 0) {
            return res.status(401).json({ message: 'Account no longer exists.' });
        }
        if (!users[0].is_active) {
            return res.status(403).json({ message: 'Your account has been disabled.' });
        }

        req.user = {
            id: userId,
            role: users[0].role,
            must_change_password: Boolean(users[0].must_change_password)
        };
        req.token = cookieToken;

        if (req.user.must_change_password && !allowPasswordChangeRequired) {
            return res.status(403).json({
                code: 'PASSWORD_CHANGE_REQUIRED',
                message: 'Password change required before accessing this resource.'
            });
        }

        return csrfGuard(req, res, next);
    } catch (err) {
        console.error('Auth error:', err);
        res.status(401).json({ message: 'Invalid authentication credential.' });
    }
};

const protect = authenticate();
const protectPasswordChange = authenticate({ allowPasswordChangeRequired: true });

module.exports = {
    protect,
    protectPasswordChange,
    SESSION_COOKIE_NAME
};
