const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { publicKey } = require('../config/keys');

const protect = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token)
        return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        // Check blacklist
        const [blacklisted] = await db.query(
            'SELECT id FROM token_blacklist WHERE token = ?', [token]
        );
        if (blacklisted.length > 0)
            return res.status(401).json({
                message: 'Token is no longer valid. Please login again.'
            });

        // Verify with RS256 public key
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

        // Check admin still exists and is active
        const [users] = await db.query(
            'SELECT id, is_active FROM users WHERE id = ?', [decoded.id]
        );
        if (users.length === 0)
            return res.status(401).json({ message: 'Account no longer exists.' });
        if (!users[0].is_active)
            return res.status(403).json({ message: 'Your account has been disabled.' });

        req.user = decoded;
        req.token = token;
        next();

    } catch (err) {
        if (err.name === 'TokenExpiredError')
            return res.status(401).json({ message: 'Token has expired. Please login again.' });
        res.status(401).json({ message: 'Invalid token.' });
    }
};

const checkRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.id) {
                return res.status(401).json({ message: 'Access denied. User not authenticated.' });
            }
            const [users] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (users.length === 0) {
                return res.status(401).json({ message: 'User not found.' });
            }
            const userRole = users[0].role;
            if (!allowedRoles.includes(userRole)) {
                return res.status(403).json({ message: 'Access denied. Unauthorized role.' });
            }
            req.user.role = userRole;
            next();
        } catch (err) {
            console.error('Role check middleware error:', err);
            res.status(500).json({ message: 'Server error during authorization.' });
        }
    };
};

module.exports = { protect, checkRole };
