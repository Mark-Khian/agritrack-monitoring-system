const crypto = require('crypto');
const db = require('../config/db');
const { normalizeLoginIdentity } = require('../utils/loginIdentity');

const IP_FAILURE_THRESHOLD = Number(process.env.LOGIN_IP_CHALLENGE_THRESHOLD) || 3;
const IP_FAILURE_WINDOW_MINUTES = Number(process.env.LOGIN_IP_CHALLENGE_WINDOW_MINUTES) || 5;
const IDENTITY_FAILURE_THRESHOLD = Number(process.env.LOGIN_IDENTITY_CHALLENGE_THRESHOLD) || 5;
const IDENTITY_FAILURE_WINDOW_MINUTES = Number(process.env.LOGIN_IDENTITY_CHALLENGE_WINDOW_MINUTES) || 15;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const GENERIC_UNAVAILABLE = 'Login verification is temporarily unavailable.';

const hmacHex = (secret, value) => (
    crypto.createHmac('sha256', secret).update(value).digest('hex')
);

const getChallengeSecret = () => {
    const secret = process.env.LOGIN_CHALLENGE_SECRET;
    if (!secret || typeof secret !== 'string') return null;
    if (secret.length < 32) return null;
    if (secret === process.env.JWT_SECRET) return null;
    return secret;
};

const requireChallengeSecret = () => {
    const secret = getChallengeSecret();
    if (!secret) {
        const error = new Error('LOGIN_CHALLENGE_SECRET is not configured.');
        error.code = 'CHALLENGE_SECRET_MISSING';
        throw error;
    }
    return secret;
};

const identityHashFor = (identity) => (
    hmacHex(requireChallengeSecret(), `identity:${normalizeLoginIdentity(identity)}`)
);

const answerHashFor = (answer) => (
    hmacHex(requireChallengeSecret(), `answer:${String(answer)}`)
);

const hashesEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const generatePrompt = () => {
    const operator = ['+', '-', '*'][crypto.randomInt(0, 3)];
    let left = crypto.randomInt(2, 10);
    let right = crypto.randomInt(1, 10);
    if (operator === '-' && right > left) {
        [left, right] = [right, left];
    }
    const answer = operator === '+'
        ? left + right
        : operator === '-'
            ? left - right
            : left * right;
    return {
        prompt: `What is ${left} ${operator} ${right}?`,
        answer: String(answer)
    };
};

const cleanupChallenges = async () => {
    try {
        await db.query(
            `DELETE FROM login_challenges
             WHERE expires_at < NOW()
                OR (consumed_at IS NOT NULL AND consumed_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))`
        );
    } catch (err) {
        console.error('Cleanup login challenges error:', err.message);
    }
};

setInterval(cleanupChallenges, 60 * 60 * 1000).unref();

const countIpFailures = async (ip) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS count
         FROM login_attempts
         WHERE ip_address = ?
           AND success = 0
           AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [ip, IP_FAILURE_WINDOW_MINUTES]
    );
    return Number(rows[0].count);
};

const countIdentityFailures = async (identity) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS count
         FROM login_attempts
         WHERE username = ?
           AND success = 0
           AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
           AND attempted_at > COALESCE(
             (SELECT MAX(attempted_at)
              FROM login_attempts
              WHERE username = ? AND success = 1),
             '1970-01-01 00:00:00'
           )`,
        [identity, IDENTITY_FAILURE_WINDOW_MINUTES, identity]
    );
    return Number(rows[0].count);
};

const isChallengeRequired = async (ip, identity) => {
    const [ipCount, identityCount] = await Promise.all([
        countIpFailures(ip),
        countIdentityFailures(identity)
    ]);
    return ipCount >= IP_FAILURE_THRESHOLD
        || identityCount >= IDENTITY_FAILURE_THRESHOLD;
};

const recordLoginAttempt = async (ip, identity, success) => {
    await db.query(
        `INSERT INTO login_attempts (ip_address, email, username, success)
         VALUES (?, ?, ?, ?)`,
        [ip, identity || null, identity || null, success ? 1 : 0]
    );
};

const incrementUserFailures = async (userId) => {
    await db.query(
        `UPDATE users
         SET failed_attempts = failed_attempts + 1,
             failed_login_attempts = failed_login_attempts + 1,
             last_failed_login_at = NOW()
         WHERE id = ?`,
        [userId]
    );
};

const resetUserFailures = async (userId) => {
    await db.query(
        `UPDATE users
         SET failed_attempts = 0,
             failed_login_attempts = 0,
             last_failed_login_at = NULL,
             locked_until = NULL,
             captcha_required = 0
         WHERE id = ?`,
        [userId]
    );
};

const issueChallenge = async (ip, identity) => {
    const secretIdentity = identityHashFor(identity);
    const { prompt, answer } = generatePrompt();
    const id = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await db.query(
        `UPDATE login_challenges
         SET consumed_at = NOW()
         WHERE ip_address = ?
           AND identity_hash = ?
           AND consumed_at IS NULL
           AND expires_at > NOW()`,
        [ip, secretIdentity]
    );

    await db.query(
        `INSERT INTO login_challenges
         (id, ip_address, identity_hash, answer_hash, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, ip, secretIdentity, answerHashFor(answer), expiresAt]
    );

    cleanupChallenges().catch(() => {});

    return {
        challengeId: id,
        prompt,
        expiresAt: expiresAt.toISOString()
    };
};

const consumeAndVerifyChallenge = async ({ challengeId, ip, identity, answer }) => {
    const normalizedAnswer = String(answer ?? '').trim();
    if (typeof challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(challengeId)) {
        return { ok: false, reason: 'malformed' };
    }
    if (!normalizedAnswer || normalizedAnswer.length > 16) {
        return { ok: false, reason: 'malformed' };
    }

    const identityHash = identityHashFor(identity);
    const [result] = await db.query(
        `UPDATE login_challenges
         SET consumed_at = NOW()
         WHERE id = ?
           AND ip_address = ?
           AND identity_hash = ?
           AND consumed_at IS NULL
           AND expires_at > NOW()`,
        [challengeId, ip, identityHash]
    );

    if (!result.affectedRows) {
        return { ok: false, reason: 'consume' };
    }

    const [rows] = await db.query(
        'SELECT answer_hash FROM login_challenges WHERE id = ? LIMIT 1',
        [challengeId]
    );
    if (!rows.length) {
        return { ok: false, reason: 'missing' };
    }

    return {
        ok: hashesEqual(rows[0].answer_hash, answerHashFor(normalizedAnswer)),
        reason: 'hash'
    };
};

const countOpenChallenges = async (ip, identity) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS count
         FROM login_challenges
         WHERE ip_address = ?
           AND identity_hash = ?
           AND consumed_at IS NULL
           AND expires_at > NOW()`,
        [ip, identityHashFor(identity)]
    );
    return Number(rows[0].count);
};

module.exports = {
    GENERIC_UNAVAILABLE,
    IP_FAILURE_THRESHOLD,
    IDENTITY_FAILURE_THRESHOLD,
    getChallengeSecret,
    normalizeLoginIdentity,
    isChallengeRequired,
    recordLoginAttempt,
    incrementUserFailures,
    resetUserFailures,
    issueChallenge,
    consumeAndVerifyChallenge,
    countOpenChallenges,
    countIpFailures,
    countIdentityFailures,
    cleanupChallenges
};
