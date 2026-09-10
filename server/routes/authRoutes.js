const express = require('express');
const router = express.Router();
const { login, logout, getMe, refreshToken, getSessions, logoutAllDevices, resolveLocation, updateFarmLocation, removeFarmLocation } = require('../controllers/authController');
const { validateLogin } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/authMiddleware');
const verifyCaptcha = require('../middleware/captcha');
const captchaGuard = require('../middleware/captchaGuard');

const loginMiddleware = process.env.NODE_ENV === 'test'
    ? [validateLogin, login]
    : [loginLimiter, captchaGuard, verifyCaptcha, validateLogin, login];

router.post('/login', ...loginMiddleware);

// Logout is idempotent and does not require active session
router.post('/logout', logout);

router.post('/logout-all', protect, logoutAllDevices);
router.post('/refresh', refreshToken);

// Protected endpoints
router.get('/me', protect, getMe);
router.get('/sessions', protect, getSessions);
router.post('/resolve-location', protect, resolveLocation);
router.put('/farm-location', protect, updateFarmLocation);
router.delete('/farm-location', protect, removeFarmLocation);

module.exports = router;