const { getClientIp } = require('../utils/clientIp');
const { normalizeLoginIdentity } = require('../utils/loginIdentity');
const {
    GENERIC_UNAVAILABLE,
    isChallengeRequired
} = require('../services/loginChallengeService');

const challengeGuard = async (req, res, next) => {
    try {
        const ip = getClientIp(req);
        const identity = normalizeLoginIdentity(req.body?.username);
        req.clientIp = ip;
        req.loginIdentity = identity;
        req.challengeRequired = await isChallengeRequired(ip, identity);
        return next();
    } catch (err) {
        console.error('challengeGuard error:', err.message);
        return res.status(503).json({ message: GENERIC_UNAVAILABLE });
    }
};

module.exports = challengeGuard;
