const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // max 100 requests per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many requests. Please try again after 15 minutes.'
    }
});

// Strict limiter for login route only
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // max 10 login attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many login attempts. Please try again after 15 minutes.'
    }
});

module.exports = { apiLimiter, loginLimiter };