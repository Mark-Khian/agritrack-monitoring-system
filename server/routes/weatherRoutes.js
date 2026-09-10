const express = require('express');
const router  = express.Router();
const { getWeather } = require('../controllers/weatherController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');

// GET /api/v1/weather?location=<city>
router.get('/', protect, authorize(CAPABILITIES.WEATHER_READ), getWeather);

module.exports = router;
