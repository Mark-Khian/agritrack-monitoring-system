const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { getClientIp } = require('../utils/clientIp');

const ipKey = (req) => ipKeyGenerator(getClientIp(req), false);

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,                 // max 100 requests per 1 min
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many requests. Please try again after 1 minute.'
    }
});

// Strict limiter for login route only
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,                  // max 5 login attempts per 1 min
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: {
        message: 'Too many login attempts. Please try again after 1 minute.'
    }
});

const challengeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: {
        message: 'Too many verification requests. Please try again after 1 minute.'
    }
});

// Limiter for export routes (PDF generation is resource intensive)
const exportLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10,                 // max 10 export requests per 5 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many export requests. Please try again after 5 minutes.'
    }
});

module.exports = { apiLimiter, loginLimiter, challengeLimiter, exportLimiter };