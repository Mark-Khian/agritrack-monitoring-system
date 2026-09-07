const db = require('../config/db');

const CAPTCHA_THRESHOLD = 3;  // show after 3 FAILED attempts
const RAPID_REQUEST_WINDOW = 60; // seconds
const RAPID_REQUEST_LIMIT = 10; // max FAILED requests per window

const captchaGuard = async (req, res, next) => {
    const ip = req.ip;

    try {
        // Find most recent successful login from this IP
        const [latestSuccess] = await db.query(
            `SELECT MAX(attempted_at) as last_success FROM login_attempts WHERE ip_address = ? AND success = 1`, [ip]
        );
        const lastSuccessTime = latestSuccess[0].last_success;

        // Prepare condition to ignore failures before the last success
        const sinceSuccessCondition = lastSuccessTime ? `AND attempted_at > ?` : '';
        const paramsBase = lastSuccessTime ? [ip, lastSuccessTime] : [ip];

        // ── Check 1: Rapid FAILED requests from same IP ──
        const rapidParams = [...paramsBase, RAPID_REQUEST_WINDOW];
        const [rapidFailed] = await db.query(
            `SELECT COUNT(*) as count
             FROM login_attempts
             WHERE ip_address  = ?
             ${sinceSuccessCondition}
             AND   success     = 0
             AND   attempted_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
            rapidParams
        );

        if (rapidFailed[0].count >= RAPID_REQUEST_LIMIT) {
            return res.status(429).json({
                message: 'Too many failed requests. Please try again later.',
                captchaRequired: true,
                reason: 'rapid_failed_requests'
            });
        }

        // ── Check 3: Multiple FAILED attempts from same IP ──
        // (Note: Check 2 was removed to prevent account enumeration)
        const [failedFromIp] = await db.query(
            `SELECT COUNT(*) as count
             FROM login_attempts
             WHERE ip_address  = ?
             ${sinceSuccessCondition}
             AND   success     = 0
             AND   attempted_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
            paramsBase
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