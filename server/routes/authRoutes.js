const express = require('express');
const router = express.Router();
const { register, login,
    logout, refreshToken,
    verifyEmail, resendVerification,
    forgotPassword, resetPassword,
    getSessions, logoutAllDevices } = require('../controllers/authController');
const { validateRegister,
    validateLogin } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/authMiddleware');
const verifyCaptcha = require('../middleware/captcha');
const captchaGuard = require('../middleware/captchaGuard');

router.post('/register',
    verifyCaptcha,
    validateRegister,
    register
);
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
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/sessions', protect, getSessions);

module.exports = router;