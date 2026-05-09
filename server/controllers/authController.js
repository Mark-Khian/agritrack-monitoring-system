const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { privateKey, publicKey } = require('../config/keys');
const logActivity = require('../middleware/logger');
const sendVerificationEmail = require('../utils/sendVerificationEmail');
const sendLockoutAlertEmail = require('../utils/sendLockoutAlertEmail');
const sendPasswordResetEmail = require('../utils/sendPasswordResetEmail');
const { createSession,
    invalidateSession,
    getActiveSessions,
    invalidateAllSessions,
    cleanupSessions } = require('../utils/sessionHelper');
const { savePasswordHistory,
    isPasswordReused } = require('../utils/passwordHistory');

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_TIME = parseInt(process.env.LOCKOUT_TIME_MINUTES) || 15;
const CAPTCHA_THRESHOLD = 3; // show CAPTCHA after 3 failed attempts

// ── Helper: Hash Token ────────────────────
const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

// ── Helper: Generate JWT Tokens (RS256) ───
const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user.id, role: user.role },
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

// ── Cleanup Jobs ──────────────────────────
const cleanupUnverified = async () => {
    try {
        const [result] = await db.query(
            `DELETE FROM users
             WHERE is_verified = 0
             AND token_expires_at < NOW()`
        );
        if (result.affectedRows > 0)
            console.log(`🧹 Removed ${result.affectedRows} unverified account(s)`);
    } catch (err) {
        console.error('Cleanup unverified error:', err.message);
    }
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

// Cleanup old login attempts (keep last 24 hours only)
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

setInterval(cleanupUnverified, 24 * 60 * 60 * 1000);
setInterval(cleanupBlacklist, 60 * 60 * 1000);
setInterval(cleanupSessions, 60 * 60 * 1000);
setInterval(cleanupLoginAttempts, 60 * 60 * 1000);

// ── REGISTER ─────────────────────────────
const register = async (req, res) => {
    const { name, email, password, role } = req.body;
    const ip = req.ip;

    try {
        const [existing] = await db.query(
            'SELECT id FROM users WHERE email = ?', [email]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Email is already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = hashToken(rawToken);
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const [result] = await db.query(
            `INSERT INTO users
             (name, email, password, role, is_verified,
              verification_token, token_expires_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)`,
            [name, email, hashedPassword,
                role || 'farmer', hashedToken, tokenExpiresAt]
        );

        await savePasswordHistory(result.insertId, hashedPassword);
        await sendVerificationEmail({ name, email }, rawToken);

        await logActivity({
            user_id: result.insertId,
            action: 'REGISTER_SUCCESS',
            entity: 'users',
            entity_id: result.insertId,
            ip_address: ip
        });

        res.status(201).json({
            message: 'Registration successful! Please check your email to verify your account.',
            userId: result.insertId
        });

    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── VERIFY EMAIL ──────────────────────────
const verifyEmail = async (req, res) => {
    const { token, email } = req.query;

    if (!token || !email) {
        return res.status(400).json({ message: 'Invalid verification link.' });
    }

    try {
        const hashedToken = hashToken(token);
        const [users] = await db.query(
            `SELECT * FROM users
             WHERE email = ? AND verification_token = ?`,
            [email, hashedToken]
        );

        if (users.length === 0)
            return res.status(400).json({ message: 'Invalid or expired verification link.' });

        const user = users[0];

        if (user.is_verified)
            return res.status(400).json({ message: 'Email is already verified.' });

        if (new Date() > new Date(user.token_expires_at))
            return res.status(400).json({ message: 'Verification link has expired.' });

        await db.query(
            `UPDATE users
             SET is_verified        = 1,
                 verification_token = NULL,
                 token_expires_at   = NULL
             WHERE id = ?`,
            [user.id]
        );

        await logActivity({
            user_id: user.id,
            action: 'EMAIL_VERIFIED',
            entity: 'users',
            entity_id: user.id
        });

        res.redirect(`${process.env.ALLOWED_ORIGIN}/login?verified=true`);

    } catch (err) {
        console.error('Verify email error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── RESEND VERIFICATION ───────────────────
const resendVerification = async (req, res) => {
    const { email } = req.body;

    if (!email)
        return res.status(400).json({ message: 'Email is required.' });

    try {
        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ?', [email]
        );

        if (users.length === 0)
            return res.status(404).json({ message: 'Email not found.' });

        const user = users[0];

        if (user.is_verified)
            return res.status(400).json({ message: 'Email is already verified.' });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = hashToken(rawToken);
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.query(
            `UPDATE users SET verification_token = ?,
             token_expires_at = ? WHERE id = ?`,
            [hashedToken, tokenExpiresAt, user.id]
        );

        await sendVerificationEmail(
            { name: user.name, email: user.email }, rawToken
        );

        res.status(200).json({
            message: 'Verification email resent! Please check your inbox.'
        });

    } catch (err) {
        console.error('Resend verification error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── LOGIN ─────────────────────────────────
const login = async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    try {
        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ?', [email]
        );

        // ✅ Timing attack fix
        const dummyHash = '$2b$12$dummyhashusedtopreventimaginarytimingattack0000';
        const isMatch = await bcrypt.compare(
            password,
            users.length > 0 ? users[0].password : dummyHash
        );

        if (users.length === 0 || !isMatch) {
            if (users.length > 0) {
                const user = users[0];
                const newAttempts = (user.failed_attempts || 0) + 1;

                // ✅ Determine if CAPTCHA should be required
                const captchaRequired = newAttempts >= CAPTCHA_THRESHOLD;

                if (newAttempts >= MAX_ATTEMPTS) {
                    const lockedUntil = new Date(
                        Date.now() + LOCKOUT_TIME * 60 * 1000
                    );

                    await db.query(
                        `UPDATE users
                         SET failed_attempts  = ?,
                             locked_until     = ?,
                             captcha_required = 1
                         WHERE id = ?`,
                        [newAttempts, lockedUntil, user.id]
                    );

                    // Log failed attempt
                    await db.query(
                        `INSERT INTO login_attempts
                         (ip_address, email, success)
                         VALUES (?, ?, 0)`,
                        [ip, email]
                    );

                    try {
                        await sendLockoutAlertEmail({
                            name: user.name, email: user.email,
                            ip, userAgent,
                            time: new Date().toLocaleString(
                                'en-PH', { timeZone: 'Asia/Manila' }
                            )
                        });
                    } catch (emailErr) {
                        console.error('Lockout email error:', emailErr.message);
                    }

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

                // Log failed attempt
                await db.query(
                    `INSERT INTO login_attempts
                     (ip_address, email, success)
                     VALUES (?, ?, 0)`,
                    [ip, email]
                );

                await logActivity({
                    user_id: user.id,
                    action: 'LOGIN_FAILED',
                    ip_address: ip,
                    status: 'failed'
                });

                const remaining = MAX_ATTEMPTS - newAttempts;
                return res.status(401).json({
                    message: `Invalid email or password. ${remaining} attempt(s) remaining.`,
                    captchaRequired  // ✅ tell frontend if CAPTCHA needed
                });
            }

            // Log failed attempt for unknown email
            await db.query(
                `INSERT INTO login_attempts
                 (ip_address, email, success)
                 VALUES (?, ?, 0)`,
                [ip, email || null]
            );

            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = users[0];

        if (!user.is_active)
            return res.status(403).json({
                message: 'Your account has been disabled. Contact admin.'
            });

        if (!user.is_verified)
            return res.status(403).json({
                message: 'Please verify your email before logging in.',
                resend: true
            });

        if (user.locked_until && new Date() < new Date(user.locked_until)) {
            const minutesLeft = Math.ceil(
                (new Date(user.locked_until) - new Date()) / 60000
            );
            return res.status(423).json({
                message: `Account locked. Try again in ${minutesLeft} minute(s).`,
                captchaRequired: true
            });
        }

        // ✅ Reset failed attempts + captcha on success
        await db.query(
            `UPDATE users
             SET failed_attempts  = 0,
                 locked_until     = NULL,
                 captcha_required = 0
             WHERE id = ?`,
            [user.id]
        );

        // Log successful attempt
        await db.query(
            `INSERT INTO login_attempts
             (ip_address, email, success)
             VALUES (?, ?, 1)`,
            [ip, email]
        );

        const { accessToken, refreshToken } = generateTokens(user);
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

        await createSession({
            userId: user.id,
            token: accessToken,
            ip,
            userAgent,
            expiresAt
        });

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
                email: user.email,
                role: user.role
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
        const decoded = jwt.verify(
            refreshToken, publicKey, { algorithms: ['RS256'] }
        );

        const [users] = await db.query(
            'SELECT id, role, is_active FROM users WHERE id = ?', [decoded.id]
        );

        if (users.length === 0 || !users[0].is_active)
            return res.status(401).json({ message: 'Invalid refresh token.' });

        const newAccessToken = jwt.sign(
            { id: users[0].id, role: users[0].role },
            privateKey,
            { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        res.status(200).json({ token: newAccessToken });

    } catch (err) {
        res.status(401).json({ message: 'Invalid or expired refresh token.' });
    }
};

// ── FORGOT PASSWORD ───────────────────────
const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email)
        return res.status(400).json({ message: 'Email is required.' });

    try {
        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ?', [email]
        );

        if (users.length === 0) {
            return res.status(200).json({
                message: 'If that email exists, a reset link has been sent.'
            });
        }

        const user = users[0];
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = hashToken(rawToken);
        const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.query(
            'UPDATE users SET verification_token=?, token_expires_at=? WHERE id=?',
            [hashedToken, tokenExpiresAt, user.id]
        );

        await sendPasswordResetEmail(
            { name: user.name, email: user.email }, rawToken
        );

        await logActivity({
            user_id: user.id,
            action: 'PASSWORD_RESET_REQUESTED',
            ip_address: req.ip
        });

        res.status(200).json({
            message: 'If that email exists, a reset link has been sent.'
        });

    } catch (err) {
        console.error('Forgot password error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── RESET PASSWORD ────────────────────────
const resetPassword = async (req, res) => {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword)
        return res.status(400).json({ message: 'All fields are required.' });

    try {
        const hashedToken = hashToken(token);
        const [users] = await db.query(
            `SELECT * FROM users
             WHERE email = ? AND verification_token = ?`,
            [email, hashedToken]
        );

        if (users.length === 0)
            return res.status(400).json({ message: 'Invalid or expired reset link.' });

        const user = users[0];

        if (new Date() > new Date(user.token_expires_at))
            return res.status(400).json({ message: 'Reset link has expired.' });

        const reused = await isPasswordReused(user.id, newPassword);
        if (reused) {
            return res.status(400).json({
                message: 'You cannot reuse your last 3 passwords. Please choose a different password.'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await db.query(
            `UPDATE users
             SET password           = ?,
                 verification_token = NULL,
                 token_expires_at   = NULL,
                 failed_attempts    = 0,
                 locked_until       = NULL,
                 captcha_required   = 0
             WHERE id = ?`,
            [hashedPassword, user.id]
        );

        await savePasswordHistory(user.id, hashedPassword);
        await invalidateAllSessions(user.id);

        await logActivity({
            user_id: user.id,
            action: 'PASSWORD_RESET_SUCCESS',
            ip_address: req.ip
        });

        res.status(200).json({
            message: 'Password reset successfully! All devices have been logged out.'
        });

    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = {
    register,
    verifyEmail,
    resendVerification,
    login,
    logout,
    getSessions,
    logoutAllDevices,
    refreshToken,
    forgotPassword,
    resetPassword
};