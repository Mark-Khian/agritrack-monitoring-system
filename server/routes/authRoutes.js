const express = require('express');
const router = express.Router();
const { login, logout, getMe, refreshToken, getSessions, logoutAllDevices, changePassword, resolveLocation, updateFarmLocation, removeFarmLocation } = require('../controllers/authController');
const { issueLoginChallenge } = require('../controllers/challengeController');
const { validateLogin, validateChangePassword, validateLoginChallenge } = require('../middleware/validate');
const { loginLimiter, challengeLimiter } = require('../middleware/rateLimiter');
const { protect, protectPasswordChange } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');
const verifyChallenge = require('../middleware/captcha');
const challengeGuard = require('../middleware/captchaGuard');

// Abuse protection is always on outside NODE_ENV=test. The opt-in flag can enable
// the real stack inside the dedicated Phase 7 suite, but cannot disable it in production.
const abuseProtectionEnabled = process.env.NODE_ENV !== 'test'
    || process.env.PHASE7_ABUSE_MIDDLEWARE === '1';

const loginMiddleware = abuseProtectionEnabled
    ? [loginLimiter, validateLogin, challengeGuard, verifyChallenge, login]
    : [validateLogin, login];

const challengeMiddleware = abuseProtectionEnabled
    ? [challengeLimiter, validateLoginChallenge, issueLoginChallenge]
    : [validateLoginChallenge, issueLoginChallenge];

router.post('/login', ...loginMiddleware);
router.post('/challenge', ...challengeMiddleware);

// Logout is idempotent and does not require active session
router.post('/logout', logout);

router.post('/logout-all', protect, authorize(CAPABILITIES.SESSION_REVOKE_OWN), logoutAllDevices);
router.post('/refresh', refreshToken);

// Protected endpoints
router.get('/me', protectPasswordChange, authorize(CAPABILITIES.SESSION_READ_OWN), getMe);
router.post('/change-password', protectPasswordChange, validateChangePassword, changePassword);
router.get('/sessions', protect, authorize(CAPABILITIES.SESSION_READ_OWN), getSessions);
router.post('/resolve-location', protect, authorize(CAPABILITIES.FARM_LOCATION_MANAGE), resolveLocation);
router.put('/farm-location', protect, authorize(CAPABILITIES.FARM_LOCATION_MANAGE), updateFarmLocation);
router.delete('/farm-location', protect, authorize(CAPABILITIES.FARM_LOCATION_MANAGE), removeFarmLocation);

module.exports = router;
