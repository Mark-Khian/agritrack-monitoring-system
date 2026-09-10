const { comparePassword } = require('../utils/passwordHelper');
const { getClientIp } = require('../utils/clientIp');
const { normalizeLoginIdentity } = require('../utils/loginIdentity');
const {
    GENERIC_UNAVAILABLE,
    recordLoginAttempt,
    consumeAndVerifyChallenge
} = require('../services/loginChallengeService');

const DUMMY_HASH = '$2b$12$lZZgs9Y/TfAIYjZnd643zuE.24O.t.ztKHjW2mHoDBo4F8PfEYrbq';

const rejectChallenge = async (req, res) => {
    try {
        await comparePassword('phase7-challenge-gate', DUMMY_HASH);
        await recordLoginAttempt(
            req.clientIp || getClientIp(req),
            req.loginIdentity || normalizeLoginIdentity(req.body?.username),
            false
        );
    } catch (err) {
        console.error('Challenge rejection accounting error:', err.message);
        return res.status(503).json({ message: GENERIC_UNAVAILABLE });
    }

    return res.status(401).json({
        message: 'Invalid credentials.',
        challengeRequired: true
    });
};

const verifyChallenge = async (req, res, next) => {
    if (!req.challengeRequired) {
        return next();
    }

    try {
        const verified = await consumeAndVerifyChallenge({
            challengeId: req.body?.challengeId,
            ip: req.clientIp || getClientIp(req),
            identity: req.loginIdentity || normalizeLoginIdentity(req.body?.username),
            answer: req.body?.challengeAnswer == null ? '' : String(req.body.challengeAnswer)
        });
        if (!verified.ok) {
            return rejectChallenge(req, res);
        }
        return next();
    } catch (err) {
        console.error('Challenge verification error:', err.message);
        return res.status(503).json({ message: GENERIC_UNAVAILABLE });
    }
};

module.exports = verifyChallenge;
