const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getLifecycleMonitoring } = require('../controllers/dashboardController');

// GET /api/v1/dashboard/lifecycle-monitoring
router.get('/lifecycle-monitoring', protect, getLifecycleMonitoring);

module.exports = router;
