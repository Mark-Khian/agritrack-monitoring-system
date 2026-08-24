const express = require('express');
const router = express.Router();
const { login, logout, refreshToken, getSessions, logoutAllDevices, resolveLocation, updateFarmLocation, removeFarmLocation } = require('../controllers/authController');
const { validateLogin } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/authMiddleware');
const verifyCaptcha = require('../middleware/captcha');
const captchaGuard = require('../middleware/captchaGuard');

router.post('/login',
    loginLimiter,
    captchaGuard,
    verifyCaptcha,
    validateLogin,
    login
);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAllDevices);
router.post('/refresh', refreshToken);
router.get('/sessions', protect, getSessions);
router.post('/resolve-location', protect, resolveLocation);
router.put('/farm-location', protect, updateFarmLocation);
router.delete('/farm-location', protect, removeFarmLocation);

module.exports = router;