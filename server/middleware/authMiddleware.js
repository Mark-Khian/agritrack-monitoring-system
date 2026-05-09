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

        // Check user still exists and is active
        const [users] = await db.query(
            'SELECT id, role, is_active FROM users WHERE id = ?', [decoded.id]
        );
        if (users.length === 0)
            return res.status(401).json({ message: 'User no longer exists.' });
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

const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role))
            return res.status(403).json({
                message: 'Access denied. You do not have permission.'
            });
        next();
    };
};

module.exports = { protect, restrictTo };