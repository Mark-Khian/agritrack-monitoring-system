const express = require('express');
const router = express.Router();
const { getAllActivities, getActivityById,
    createActivity, updateActivity,
    updateActivityProgress, deleteActivity } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');
const { validateActivity, validateActivityUpdate,
    validateActivityProgress, validateId } = require('../middleware/validateData');
const { authorize, CAPABILITIES } = require('../security/rbac');

router.get('/', protect, authorize(CAPABILITIES.ACTIVITY_READ), getAllActivities);
router.get('/:id', protect, authorize(CAPABILITIES.ACTIVITY_READ), validateId, getActivityById);
router.post('/', protect, authorize(CAPABILITIES.ACTIVITY_CREATE), validateActivity, createActivity);
router.patch('/:id/progress', protect, authorize(CAPABILITIES.ACTIVITY_UPDATE_LIMITED),
    validateId, validateActivityProgress, updateActivityProgress);
router.put('/:id', protect, authorize(CAPABILITIES.ACTIVITY_UPDATE), validateId,
    validateActivityUpdate, updateActivity);
router.delete('/:id', protect, authorize(CAPABILITIES.ACTIVITY_DELETE), validateId, deleteActivity);

module.exports = router;