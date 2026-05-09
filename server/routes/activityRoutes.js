const express = require('express');
const router = express.Router();
const { getAllActivities, getActivityById,
    createActivity, updateActivity,
    deleteActivity } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');
const { validateActivity,
    validateId } = require('../middleware/validateData');

router.get('/', protect, getAllActivities);
router.get('/:id', protect, validateId, getActivityById);
router.post('/', protect, validateActivity, createActivity);
router.put('/:id', protect, validateId,
    validateActivity, updateActivity);
router.delete('/:id', protect, validateId, deleteActivity);

module.exports = router;