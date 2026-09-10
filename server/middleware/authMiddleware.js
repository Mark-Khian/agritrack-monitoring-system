const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { publicKey } = require('../config/keys');
const csrfGuard = require('./csrfGuard');

const SESSION_COOKIE_NAME = 'agritrack_session';

// A request "presents a Bearer credential" as soon as the scheme is used, even if the
// token itself is empty or malformed. Callers rely on this to enforce Bearer-first
// precedence without silently falling back to the cookie.
const hasBearerScheme = (req) => {
    const authHeader = req.headers['authorization'];
    return typeof authHeader === 'string' && /^Bearer(\s|$)/i.test(authHeader);
};

const extractBearerToken = (req) => {
    if (!hasBearerScheme(req)) return null;
    const token = req.headers['authorization'].replace(/^Bearer\s*/i, '').trim();
    return token || null;
};

const protect = async (req, res, next) => {
    const bearerPresented = hasBearerScheme(req);
    const bearerToken = extractBearerToken(req);
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];

    let tokenToVerify = null;
    let authMethod = null;
    let userId = null;
    let decodedToken = null;

    if (bearerPresented) {
        if (!bearerToken) {
            return res.status(401).json({ message: 'Access denied. Invalid Bearer token.' });
        }
        tokenToVerify = bearerToken;
        authMethod = 'bearer';
    } else if (cookieToken) {
        tokenToVerify = cookieToken;
        authMethod = 'cookie';
    } else {
        return res.status(401).json({ message: 'Access denied. No authentication provided.' });
    }

    try {
        if (authMethod === 'bearer') {
            // Check blacklist
            const [blacklisted] = await db.query(
                'SELECT id FROM token_blacklist WHERE token = ?', [tokenToVerify]
            );
            if (blacklisted.length > 0) {
                return res.status(401).json({ message: 'Token is no longer valid. Please login again.' });
            }

            // Verify with RS256 public key
            decodedToken = jwt.verify(tokenToVerify, publicKey, { algorithms: ['RS256'] });
            userId = decodedToken.id;
        }

        const tokenHash = crypto.createHash('sha256').update(tokenToVerify).digest('hex');

        // Check active session in DB (handles both legacy JWT and opaque cookie hashes).
        // Expiry is evaluated by MySQL so the DB clock stays authoritative.
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

        if (authMethod === 'cookie') {
            userId = session[0].user_id;
        } else if (session[0].user_id !== userId) {
            return res.status(401).json({ message: 'Session invalidated.' });
        }

        // Check user still exists and is active (using transitional rules: is_active)
        const [users] = await db.query(
            'SELECT id, is_active FROM users WHERE id = ?', [userId]
        );
        if (users.length === 0) {
            return res.status(401).json({ message: 'Account no longer exists.' });
        }
        if (!users[0].is_active) {
            return res.status(403).json({ message: 'Your account has been disabled.' });
        }

        req.user = decodedToken || { id: userId };
        req.token = tokenToVerify; // Store token to allow logout to invalidate it
        req.authMethod = authMethod;
        
        return csrfGuard(req, res, next);

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired. Please login again.' });
        }
        console.error('Auth error:', err);
        res.status(401).json({ message: 'Invalid authentication credential.' });
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

module.exports = { protect, checkRole, extractBearerToken, SESSION_COOKIE_NAME };
