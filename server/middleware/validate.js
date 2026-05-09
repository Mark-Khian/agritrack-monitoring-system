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

// Register validation rules
const validateRegister = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required.')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be 2-100 characters.')
        .matches(/^[a-zA-Z\s\-'.]+$/)
        .withMessage('Name can only contain letters, spaces, hyphens, apostrophes, and periods.')
        .custom((value) => {
            // No repeated characters like "aaaaaaa"
            if (/(.)\1{4,}/.test(value)) {
                throw new Error('Name contains invalid repeated characters.');
            }
            // Must have at least 2 letters (not just spaces/symbols)
            if ((value.match(/[a-zA-Z]/g) || []).length < 2) {
                throw new Error('Name must contain at least 2 letters.');
            }
            // No random keyboard smashing (consonant clusters > 5)
            if (/[^aeiou\s]{6,}/i.test(value)) {
                throw new Error('Please enter a valid name.');
            }
            return true;
        })
        .escape(),

    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required.')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters.')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter.')
        .matches(/[a-z]/)
        .withMessage('Password must contain at least one lowercase letter.')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number.')
        .matches(/[!@#$%^&*(),.?":{}|<>]/)
        .withMessage('Password must contain at least one special character.'),

    body('role')
        .optional()
        .isIn(['admin', 'manager', 'farmer'])
        .withMessage('Invalid role.'),

    handleValidation
];

// Login validation rules
const validateLogin = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required.'),

    handleValidation
];

module.exports = { validateRegister, validateLogin };