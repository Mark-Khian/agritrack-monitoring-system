const { originOf, isTrustedOrigin } = require('../config/trustedOrigins');

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const csrfGuard = (req, res, next) => {
    if (SAFE_METHODS.includes(req.method.toUpperCase())) {
        return next();
    }

    const requestOrigin = originOf(req.headers.origin) || originOf(req.headers.referer);
    if (requestOrigin && isTrustedOrigin(requestOrigin)) {
        return next();
    }

    return res.status(403).json({ message: 'CSRF validation failed.' });
};

module.exports = csrfGuard;
