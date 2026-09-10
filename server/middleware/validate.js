const { body, param, validationResult } = require('express-validator');
const { validateStrongPassword } = require('../utils/passwordHelper');

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
        .toLowerCase()
        .notEmpty().withMessage('Username or email is required.')
        .isLength({ min: 3, max: 255 })
        .withMessage('Username or email must be 3-255 characters.')
        .matches(/^[a-zA-Z0-9._@-]+$/)
        .withMessage('Username or email can only contain letters, numbers, periods, underscores, hyphens, and @.'),

    body('password')
        .custom((value) => typeof value === 'string' && value.length > 0)
        .withMessage('Password is required.')
        .bail()
        .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
        .withMessage('Password must not exceed 72 UTF-8 bytes.'),

    handleValidation
];

const rejectUnknownBodyFields = (allowedFields) => (req, res, next) => {
    const unknownFields = Object.keys(req.body || {})
        .filter((field) => !allowedFields.includes(field));

    if (unknownFields.length > 0) {
        return res.status(400).json({
            message: 'Validation failed.',
            errors: unknownFields.map((field) => ({
                field,
                message: 'Field is not allowed.'
            }))
        });
    }
    return next();
};

const validateCreateUser = [
    rejectUnknownBodyFields(['name', 'username', 'role']),
    body('name')
        .isString().withMessage('Name is required.')
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters.'),
    body('username')
        .isString().withMessage('Username is required.')
        .trim()
        .toLowerCase()
        .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters.')
        .matches(/^[a-zA-Z0-9._-]+$/)
        .withMessage('Username can only contain letters, numbers, periods, underscores, and hyphens.'),
    body('role')
        .isIn(['SECRETARY', 'FARM_WORKER'])
        .withMessage('Role must be exactly SECRETARY or FARM_WORKER.'),
    handleValidation
];

const validateUserId = [
    param('id')
        .isInt({ min: 1 }).withMessage('User ID must be a positive integer.')
        .toInt(),
    handleValidation
];

const validateEmptyBody = [
    rejectUnknownBodyFields([]),
    handleValidation
];

const validateChangePassword = [
    rejectUnknownBodyFields(['currentPassword', 'newPassword']),
    body('currentPassword')
        .custom((value) => typeof value === 'string' && value.length > 0)
        .withMessage('Current password is required.')
        .bail()
        .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
        .withMessage('Current password must not exceed 72 UTF-8 bytes.'),
    body('newPassword')
        .custom((value) => {
            const error = validateStrongPassword(value);
            if (error) throw new Error(error);
            return true;
        }),
    body('newPassword')
        .custom((value, { req }) => value !== req.body.currentPassword)
        .withMessage('New password must differ from the current password.'),
    handleValidation
];

module.exports = {
    validateLogin,
    validateCreateUser,
    validateUserId,
    validateEmptyBody,
    validateChangePassword
};