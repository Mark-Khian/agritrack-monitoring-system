const db = require('../config/db');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');

// Hash token for storage
const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

// Parse device type from user agent
const getDeviceType = (userAgent) => {
    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const os = parser.getOS();
    const browser = parser.getBrowser();

    const deviceType = device.type || 'desktop';
    return `${deviceType} — ${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
};

// Create a new session
const createSession = async ({ userId, token, ip, userAgent, expiresAt }) => {
    const tokenHash = hashToken(token);
    const deviceType = getDeviceType(userAgent);

    await db.query(
        `INSERT INTO sessions
     (user_id, token_hash, ip_address, user_agent, device_type, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, tokenHash, ip, userAgent, deviceType, expiresAt]
    );
};

// Invalidate a session (logout)
const invalidateSession = async (token) => {
    const tokenHash = hashToken(token);
    await db.query(
        'UPDATE sessions SET is_active = 0 WHERE token_hash = ?',
        [tokenHash]
    );
};

// Get all active sessions for a user
const getActiveSessions = async (userId) => {
    const [sessions] = await db.query(
        `SELECT id, ip_address, device_type, created_at, expires_at
     FROM sessions
     WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
        [userId]
    );
    return sessions;
};

// Invalidate all sessions for a user (force logout everywhere)
const invalidateAllSessions = async (userId) => {
    await db.query(
        'UPDATE sessions SET is_active = 0 WHERE user_id = ?',
        [userId]
    );
};

// Cleanup expired sessions
const cleanupSessions = async () => {
    try {
        const [result] = await db.query(
            'DELETE FROM sessions WHERE expires_at < NOW()'
        );
        if (result.affectedRows > 0) {
            console.log(`🧹 Removed ${result.affectedRows} expired session(s)`);
        }
    } catch (err) {
        console.error('Cleanup sessions error:', err.message);
    }
};

module.exports = {
    createSession,
    invalidateSession,
    getActiveSessions,
    invalidateAllSessions,
    cleanupSessions
};