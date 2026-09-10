const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');
const { getLifecycleMonitoring } = require('../controllers/dashboardController');

// GET /api/v1/dashboard/lifecycle-monitoring
router.get('/lifecycle-monitoring', protect, authorize(CAPABILITIES.DASHBOARD_READ), getLifecycleMonitoring);

module.exports = router;
