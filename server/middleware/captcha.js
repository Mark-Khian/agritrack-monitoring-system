const axios = require('axios');

const verifyCaptcha = async (req, res, next) => {
    // Skip if CAPTCHA not required for this request
    if (!req.captchaRequired) {
        return next();
    }

    const captchaToken = req.body.captchaToken;

    if (!captchaToken) {
        return res.status(400).json({
            message: 'CAPTCHA verification required.',
            captchaRequired: true
        });
    }

    // Skip verification in development
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    try {
        const response = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            null,
            {
                params: {
                    secret: process.env.RECAPTCHA_SECRET_KEY,
                    response: captchaToken
                }
            }
        );

        const { success } = response.data;

        if (!success) {
            return res.status(400).json({
                message: 'CAPTCHA verification failed. Please try again.',
                captchaRequired: true
            });
        }

        next();
    } catch (err) {
        console.error('CAPTCHA error:', err.message);
        next();
    }
};

module.exports = verifyCaptcha;