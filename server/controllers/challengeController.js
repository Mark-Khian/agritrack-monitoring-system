const { getClientIp } = require('../utils/clientIp');
const { normalizeLoginIdentity } = require('../utils/loginIdentity');
const {
    GENERIC_UNAVAILABLE,
    issueChallenge
} = require('../services/loginChallengeService');

const issueLoginChallenge = async (req, res) => {
    try {
        const challenge = await issueChallenge(
            getClientIp(req),
            normalizeLoginIdentity(req.body?.username)
        );
        res.set('Cache-Control', 'no-store');
        return res.status(200).json({
            challengeId: challenge.challengeId,
            prompt: challenge.prompt,
            expiresAt: challenge.expiresAt
        });
    } catch (err) {
        console.error('Issue login challenge error:', err.message);
        return res.status(503).json({ message: GENERIC_UNAVAILABLE });
    }
};

module.exports = { issueLoginChallenge };
