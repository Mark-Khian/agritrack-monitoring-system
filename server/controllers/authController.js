const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { privateKey, publicKey } = require('../config/keys');
const logActivity = require('../middleware/logger');
const {
    createSession,
    invalidateSession,
    getActiveSessions,
    invalidateAllSessions,
    cleanupSessions
} = require('../utils/sessionHelper');

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_TIME = parseInt(process.env.LOCKOUT_TIME_MINUTES) || 15;
const CAPTCHA_THRESHOLD = 3;

// ── Helper: Generate JWT Tokens (RS256) ───
const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user.id },
        privateKey,
        { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    const refreshToken = jwt.sign(
        { id: user.id },
        privateKey,
        { algorithm: 'RS256', expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    return { accessToken, refreshToken };
};

const cleanupBlacklist = async () => {
    try {
        const [result] = await db.query(
            'DELETE FROM token_blacklist WHERE expired_at < NOW()'
        );
        if (result.affectedRows > 0)
            console.log(`🧹 Removed ${result.affectedRows} expired token(s)`);
    } catch (err) {
        console.error('Cleanup blacklist error:', err.message);
    }
};

const cleanupLoginAttempts = async () => {
    try {
        await db.query(
            `DELETE FROM login_attempts
             WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
    } catch (err) {
        console.error('Cleanup login attempts error:', err.message);
    }
};

setInterval(cleanupBlacklist, 60 * 60 * 1000);
setInterval(cleanupSessions, 60 * 60 * 1000);
setInterval(cleanupLoginAttempts, 60 * 60 * 1000);

// ── LOGIN ─────────────────────────────────
const login = async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    try {
        // Only allow the single admin account
        const [users] = await db.query(
            `SELECT * FROM users WHERE email = ? AND role = 'admin'`, [username]
        );

        // Timing attack fix — always run bcrypt
        const dummyHash = '$2b$12$dummyhashusedtopreventimaginarytimingattack0000';
        const isMatch = await bcrypt.compare(
            password,
            users.length > 0 ? users[0].password : dummyHash
        );

        if (users.length === 0 || !isMatch) {
            if (users.length > 0) {
                const user = users[0];
                const newAttempts = (user.failed_attempts || 0) + 1;
                const captchaRequired = newAttempts >= CAPTCHA_THRESHOLD;

                if (newAttempts >= MAX_ATTEMPTS) {
                    const lockedUntil = new Date(Date.now() + LOCKOUT_TIME * 60 * 1000);

                    await db.query(
                        `UPDATE users
                         SET failed_attempts  = ?,
                             locked_until     = ?,
                             captcha_required = 1
                         WHERE id = ?`,
                        [newAttempts, lockedUntil, user.id]
                    );

                    await db.query(
                        `INSERT INTO login_attempts (ip_address, email, success) VALUES (?, ?, 0)`,
                        [ip, username]
                    );

                    await logActivity({
                        user_id: user.id,
                        action: 'ACCOUNT_LOCKED',
                        ip_address: ip,
                        status: 'failed'
                    });

                    return res.status(423).json({
                        message: `Too many failed attempts. Account locked for ${LOCKOUT_TIME} minutes.`,
                        captchaRequired: true
                    });
                }

                await db.query(
                    `UPDATE users
                     SET failed_attempts  = ?,
                         captcha_required = ?
                     WHERE id = ?`,
                    [newAttempts, captchaRequired ? 1 : 0, user.id]
                );

                await db.query(
                    `INSERT INTO login_attempts (ip_address, email, success) VALUES (?, ?, 0)`,
                    [ip, username]
                );

                await logActivity({
                    user_id: user.id,
                    action: 'LOGIN_FAILED',
                    ip_address: ip,
                    status: 'failed'
                });

                const remaining = MAX_ATTEMPTS - newAttempts;
                return res.status(401).json({
                    message: `Invalid credentials. ${remaining} attempt(s) remaining.`,
                    captchaRequired
                });
            }

            await db.query(
                `INSERT INTO login_attempts (ip_address, email, success) VALUES (?, ?, 0)`,
                [ip, username || null]
            );

            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = users[0];

        if (!user.is_active)
            return res.status(403).json({ message: 'This account has been disabled.' });

        if (user.locked_until && new Date() < new Date(user.locked_until)) {
            const minutesLeft = Math.ceil(
                (new Date(user.locked_until) - new Date()) / 60000
            );
            return res.status(423).json({
                message: `Account locked. Try again in ${minutesLeft} minute(s).`,
                captchaRequired: true
            });
        }

        await db.query(
            `UPDATE users
             SET failed_attempts  = 0,
                 locked_until     = NULL,
                 captcha_required = 0
             WHERE id = ?`,
            [user.id]
        );

        await db.query(
            `INSERT INTO login_attempts (ip_address, email, success) VALUES (?, ?, 1)`,
            [ip, username]
        );

        const { accessToken, refreshToken } = generateTokens(user);
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

        await createSession({ userId: user.id, token: accessToken, ip, userAgent, expiresAt });

        await logActivity({
            user_id: user.id,
            action: 'LOGIN_SUCCESS',
            entity: 'users',
            entity_id: user.id,
            ip_address: ip
        });

        res.status(200).json({
            message: 'Login successful!',
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                username: user.username || user.email
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── LOGOUT ────────────────────────────────
const logout = async (req, res) => {
    const token = req.token;
    const ip = req.ip;

    try {
        const decoded = jwt.decode(token);
        const expiredAt = new Date(decoded.exp * 1000);

        await db.query(
            'INSERT INTO token_blacklist (token, expired_at) VALUES (?, ?)',
            [token, expiredAt]
        );

        await invalidateSession(token);

        await logActivity({
            user_id: req.user.id,
            action: 'LOGOUT',
            ip_address: ip
        });

        res.status(200).json({ message: 'Logged out successfully.' });

    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── GET ACTIVE SESSIONS ───────────────────
const getSessions = async (req, res) => {
    try {
        const sessions = await getActiveSessions(req.user.id);
        res.status(200).json({ sessions });
    } catch (err) {
        console.error('Get sessions error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── LOGOUT ALL DEVICES ────────────────────
const logoutAllDevices = async (req, res) => {
    try {
        await invalidateAllSessions(req.user.id);

        await logActivity({
            user_id: req.user.id,
            action: 'LOGOUT_ALL_DEVICES',
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Logged out from all devices.' });
    } catch (err) {
        console.error('Logout all error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── REFRESH TOKEN ─────────────────────────
const refreshToken = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken)
        return res.status(401).json({ message: 'Refresh token required.' });

    try {
        const decoded = jwt.verify(refreshToken, publicKey, { algorithms: ['RS256'] });

        const [users] = await db.query(
            `SELECT id, is_active FROM users WHERE id = ? AND role = 'admin'`, [decoded.id]
        );

        if (users.length === 0 || !users[0].is_active)
            return res.status(401).json({ message: 'Invalid refresh token.' });

        const newAccessToken = jwt.sign(
            { id: users[0].id },
            privateKey,
            { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        res.status(200).json({ token: newAccessToken });

    } catch (err) {
        res.status(401).json({ message: 'Invalid or expired refresh token.' });
    }
};

module.exports = { login, logout, getSessions, logoutAllDevices, refreshToken };
