const db = require('../config/db');

const CAPTCHA_THRESHOLD = 3;  // show after 3 FAILED attempts
const RAPID_REQUEST_WINDOW = 60; // seconds
const RAPID_REQUEST_LIMIT = 10; // max FAILED requests per window

const captchaGuard = async (req, res, next) => {
    const ip = req.ip;
    const loginIdentifier = req.body.username;

    try {
        // ── Check 1: Rapid FAILED requests from same IP ──
        const [rapidFailed] = await db.query(
            `SELECT COUNT(*) as count
             FROM login_attempts
             WHERE ip_address  = ?
             AND   success     = 0
             AND   attempted_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
            [ip, RAPID_REQUEST_WINDOW]
        );

        if (rapidFailed[0].count >= RAPID_REQUEST_LIMIT) {
            return res.status(429).json({
                message: 'Too many failed requests. Please try again later.',
                captchaRequired: true,
                reason: 'rapid_failed_requests'
            });
        }

        // ── Check 2: Failed attempts for this specific login identifier ──
        if (loginIdentifier) {
            const [user] = await db.query(
                `SELECT failed_attempts, captcha_required
                 FROM users WHERE email = ?`,
                [loginIdentifier]
            );

            if (user.length > 0) {
                const failedAttempts = user[0].failed_attempts || 0;
                const captchaRequired = user[0].captcha_required;

                // Only require CAPTCHA if failed attempts >= threshold
                // OR already flagged in database
                if (captchaRequired || failedAttempts >= CAPTCHA_THRESHOLD) {
                    req.captchaRequired = true;
                }
            }
        }

        // ── Check 3: Multiple FAILED attempts from same IP ──
        const [failedFromIp] = await db.query(
            `SELECT COUNT(*) as count
             FROM login_attempts
             WHERE ip_address  = ?
             AND   success     = 0
             AND   attempted_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
            [ip]
        );

        if (failedFromIp[0].count >= CAPTCHA_THRESHOLD) {
            req.captchaRequired = true;
        }

        next();

    } catch (err) {
        console.error('captchaGuard error:', err.message);
        next(); // Don't block on error
    }
};

module.exports = captchaGuard;