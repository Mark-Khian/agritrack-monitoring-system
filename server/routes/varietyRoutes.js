const express = require('express');
const router = express.Router();
const { getAllVarieties } = require('../controllers/varietyController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');

router.get('/', protect, authorize(CAPABILITIES.VARIETY_READ), getAllVarieties);

module.exports = router;
