const { body, validationResult } = require('express-validator');

// Middleware to catch validation errors
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed.',
            errors: errors.array().map(e => ({
                field: e.path,
                message: e.msg
            }))
        });
    }
    next();
};

// Login validation rules
const validateLogin = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username or email is required.')
        .isLength({ min: 3, max: 255 })
        .withMessage('Username or email must be 3-255 characters.')
        .matches(/^[a-zA-Z0-9._@-]+$/)
        .withMessage('Username or email can only contain letters, numbers, periods, underscores, hyphens, and @.'),

    body('password')
        .notEmpty().withMessage('Password is required.'),

    handleValidation
];

module.exports = { validateLogin };