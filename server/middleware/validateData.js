const { body, param, validationResult } = require('express-validator');

// ── Handle Validation Errors ──────────────
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

// ── Planting Validation ───────────────────
const validatePlanting = [
    body('field_name')
        .trim()
        .notEmpty().withMessage('Field name is required.')
        .isLength({ min: 1, max: 120 })
        .withMessage('Field name must be 1-120 characters.'),

    body('variety_class')
        .trim()
        .notEmpty().withMessage('Variety class is required.')
        .isLength({ min: 2, max: 100 })
        .withMessage('Variety class must be 2-100 characters.'),

    body('variety')
        .trim()
        .notEmpty().withMessage('Rice variety is required.')
        .isLength({ min: 2, max: 100 })
        .withMessage('Variety must be 2-100 characters.'),

    body('planting_date')
        .notEmpty().withMessage('Planting date is required.')
        .isDate().withMessage('Planting date must be a valid date.'),

    body('expected_harvest')
        .optional()
        .isDate().withMessage('Expected harvest must be a valid date.')
        .custom((val, { req }) => {
            if (!val) return true;
            if (new Date(val) <= new Date(req.body.planting_date)) {
                throw new Error('Expected harvest must be after planting date.');
            }
            return true;
        }),

    body('expected_growth_days')
        .optional()
        .isInt({ min: 1, max: 400 })
        .withMessage('expected_growth_days must be between 1 and 400.'),

    body('adjustment_days')
        .optional()
        .isInt({ min: -60, max: 120 })
        .withMessage('adjustment_days must be between -60 and 120.'),

    body('lifecycle_state')
        .optional()
        .isIn(['PLANNED', 'ACTIVE'])
        .withMessage('Initial lifecycle_state must be PLANNED or ACTIVE.'),

    body('variety_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('variety_id must be a positive integer.'),

    body('growth_plan_manual_override')
        .optional()
        .isBoolean()
        .withMessage('growth_plan_manual_override must be boolean.'),

    body('generate_template_indices')
        .optional()
        .isArray({ max: 10 })
        .withMessage('generate_template_indices must be an array (max 10).')
        .custom((arr) => {
            if (!Array.isArray(arr) || arr.length === 0) return true;
            return arr.every((x) => Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) <= 9);
        }),

    body('season')
        .notEmpty().withMessage('Season is required.')
        .isIn(['wet', 'dry']).withMessage('Season must be wet or dry.'),

    body('status')
        .optional()
        .isIn(['active', 'completed', 'failed'])
        .withMessage('Status must be active, completed, or failed.'),

    handleValidation
];

const validatePlantingUpdate = [
    body('field_name')
        .optional()
        .trim()
        .notEmpty().withMessage('Field name cannot be empty.')
        .isLength({ min: 1, max: 120 })
        .withMessage('Field name must be 1-120 characters.'),

    body('variety_class')
        .optional()
        .trim()
        .notEmpty().withMessage('Variety class cannot be empty.')
        .isLength({ min: 2, max: 100 })
        .withMessage('Variety class must be 2-100 characters.'),

    body('variety')
        .optional()
        .trim()
        .notEmpty().withMessage('Rice variety cannot be empty.')
        .isLength({ min: 2, max: 100 })
        .withMessage('Variety must be 2-100 characters.'),

    body('planting_date')
        .optional()
        .isDate().withMessage('Planting date must be a valid date.'),

    body('expected_harvest')
        .optional()
        .isDate().withMessage('Expected harvest must be a valid date.')
        .custom((val, { req }) => {
            if (!val) return true;
            const pd = req.body.planting_date;
            if (pd && new Date(val) <= new Date(pd)) {
                throw new Error('Expected harvest must be after planting date.');
            }
            return true;
        }),

    body('expected_growth_days')
        .optional()
        .isInt({ min: 1, max: 400 })
        .withMessage('expected_growth_days must be between 1 and 400.'),

    body('adjustment_days')
        .optional()
        .isInt({ min: -60, max: 120 })
        .withMessage('adjustment_days must be between -60 and 120.'),

    body('lifecycle_state')
        .optional()
        .isIn(['PLANNED', 'ACTIVE', 'MATURING', 'READY_FOR_HARVEST', 'ABANDONED'])
        .withMessage('Invalid lifecycle_state (record a harvest to reach HARVESTED).'),

    body('lifecycle_state_reason')
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('lifecycle_state_reason is too long.'),

    body('growth_stage_recorded')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('growth_stage_recorded must be at most 100 characters.'),

    body('growth_stage_source')
        .optional()
        .isIn(['user', 'system_estimate'])
        .withMessage('growth_stage_source must be user or system_estimate.'),

    body('variety_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('variety_id must be a positive integer.'),

    body('growth_plan_manual_override')
        .optional()
        .isBoolean()
        .withMessage('growth_plan_manual_override must be boolean.'),

    body('generate_template_indices')
        .optional()
        .isArray({ max: 10 })
        .withMessage('generate_template_indices must be an array (max 10).')
        .custom((arr) => {
            if (!Array.isArray(arr) || arr.length === 0) return true;
            return arr.every((x) => Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) <= 9);
        }),

    body('status')
        .optional()
        .isIn(['active', 'completed', 'failed'])
        .withMessage('Status must be active, completed, or failed.'),

    handleValidation
];

// ── Activity Validation ───────────────────
const validateActivity = [
    body('planting_id')
        .notEmpty().withMessage('Planting ID is required.')
        .isInt({ min: 1 }).withMessage('Planting ID must be a valid positive number.'),

    body('activity_type')
        .notEmpty().withMessage('Activity type is required.')
        .isIn([
            'land_preparation', 'seeding', 'transplanting',
            'fertilizing', 'first_fertilizing', 'second_fertilizing',
            'irrigation', 'drain_irrigation', 'pest_control',
            'final_pest_inspection', 'crop_monitoring',
            'weeding', 'harvesting', 'other'
        ]).withMessage('Invalid activity type.'),

    body('activity_date')
        .notEmpty().withMessage('Activity date is required.')
        .isDate().withMessage('Activity date must be a valid date.'),

    body('notes')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters.')
        .escape(),

    body('status')
        .optional()
        .isIn(['pending', 'ongoing', 'completed', 'cancelled'])
        .withMessage('Status must be pending, ongoing, completed, or cancelled.'),

    handleValidation
];

// ── Harvest Validation ────────────────────
const validateHarvest = [
    body('planting_id')
        .notEmpty().withMessage('Planting ID is required.')
        .isInt({ min: 1 }).withMessage('Planting ID must be a valid positive number.'),

    body('harvest_date')
        .notEmpty().withMessage('Harvest date is required.')
        .isDate().withMessage('Harvest date must be a valid date.'),

    body('yield_kg')
        .notEmpty().withMessage('Yield is required.')
        .isFloat({ min: 0.01 }).withMessage('Yield must be greater than 0.')
        .custom(val => val <= 999999.99)
        .withMessage('Yield value is too large.'),

    body('quality_grade')
        .optional()
        .isIn(['A', 'B', 'C', 'rejected'])
        .withMessage('Quality grade must be A, B, C, or rejected.'),

    body('remarks')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('Remarks cannot exceed 1000 characters.')
        .escape(),

    body('financial_value')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0.00 }).withMessage('Financial value must be 0 or greater.')
        .custom(val => val <= 99999999.99)
        .withMessage('Financial value is too large.'),

    handleValidation
];

// ── ID Param Validation ───────────────────
const validateId = [
    param('id')
        .isInt({ min: 1 }).withMessage('ID must be a valid positive number.'),
    handleValidation
];

module.exports = {
    validatePlanting,
    validatePlantingUpdate,
    validateActivity,
    validateHarvest,
    validateId
};
