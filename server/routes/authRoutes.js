const express = require('express');
const router = express.Router();
const { login, logout, refreshToken, getSessions, logoutAllDevices } = require('../controllers/authController');
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

module.exports = router;