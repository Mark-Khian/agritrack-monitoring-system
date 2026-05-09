const express = require('express');
const router  = express.Router();
const { getWeather } = require('../controllers/weatherController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/v1/weather?location=<city>
router.get('/', protect, getWeather);

module.exports = router;
