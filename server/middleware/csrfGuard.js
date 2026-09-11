const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const originOf = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
        return new URL(value).origin;
    } catch (e) {
        return null;
    }
};

const csrfGuard = (req, res, next) => {
    if (SAFE_METHODS.includes(req.method.toUpperCase())) {
        return next();
    }

    const allowedOrigin = originOf(process.env.ALLOWED_ORIGIN) || 'https://localhost:5173';

    // Compare full origins only. Prefix matching would accept http://localhost:51739
    // when the allowed origin is http://localhost:5173.
    const requestOrigin = originOf(req.headers.origin) || originOf(req.headers.referer);

    if (requestOrigin && requestOrigin === allowedOrigin) {
        return next();
    }

    return res.status(403).json({ message: 'CSRF validation failed.' });
};

module.exports = csrfGuard;
