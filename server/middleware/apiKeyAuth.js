const db = require('../config/db');

const apiKeyAuth = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            message: 'API key required. Include X-API-Key in headers.'
        });
    }

    try {
        const [keys] = await db.query(
            `SELECT * FROM api_keys
             WHERE api_key  = ?
             AND   is_active = 1
             AND   (expires_at IS NULL OR expires_at > NOW())`,
            [apiKey]
        );

        if (keys.length === 0) {
            return res.status(401).json({
                message: 'Invalid or expired API key.'
            });
        }

        // Update last used timestamp
        await db.query(
            'UPDATE api_keys SET last_used = NOW() WHERE id = ?',
            [keys[0].id]
        );

        // Attach key info to request
        req.apiKey = keys[0];
        next();

    } catch (err) {
        console.error('API key auth error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = apiKeyAuth;