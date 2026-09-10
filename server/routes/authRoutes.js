const express = require('express');
const router = express.Router();
const { login, logout, getMe, refreshToken, getSessions, logoutAllDevices, resolveLocation, updateFarmLocation, removeFarmLocation } = require('../controllers/authController');
const { validateLogin } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');
const verifyCaptcha = require('../middleware/captcha');
const captchaGuard = require('../middleware/captchaGuard');

const loginMiddleware = process.env.NODE_ENV === 'test'
    ? [validateLogin, login]
    : [loginLimiter, captchaGuard, verifyCaptcha, validateLogin, login];

router.post('/login', ...loginMiddleware);

// Logout is idempotent and does not require active session
router.post('/logout', logout);

router.post('/logout-all', protect, authorize(CAPABILITIES.SESSION_REVOKE_OWN), logoutAllDevices);
router.post('/refresh', refreshToken);

// Protected endpoints
router.get('/me', protect, authorize(CAPABILITIES.SESSION_READ_OWN), getMe);
router.get('/sessions', protect, authorize(CAPABILITIES.SESSION_READ_OWN), getSessions);
router.post('/resolve-location', protect, authorize(CAPABILITIES.FARM_LOCATION_MANAGE), resolveLocation);
router.put('/farm-location', protect, authorize(CAPABILITIES.FARM_LOCATION_MANAGE), updateFarmLocation);
router.delete('/farm-location', protect, authorize(CAPABILITIES.FARM_LOCATION_MANAGE), removeFarmLocation);

module.exports = router;