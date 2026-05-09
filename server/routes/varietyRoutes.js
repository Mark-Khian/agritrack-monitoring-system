const express = require('express');
const router = express.Router();
const { getAllVarieties } = require('../controllers/varietyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getAllVarieties);

module.exports = router;
