const express = require('express');
const router = express.Router();
const { getWeather, streamWeatherLocationEvents } = require('../controllers/weatherController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');

// SSE must be registered before any parameterized routes.
router.get('/events', protect, authorize(CAPABILITIES.WEATHER_READ), streamWeatherLocationEvents);
router.get('/', protect, authorize(CAPABILITIES.WEATHER_READ), getWeather);

module.exports = router;
