const express = require('express');
const router = express.Router();

router.use('/auth',       require('../authRoutes'));
router.use('/farms',      require('../farmRoutes'));
router.use('/fields',     require('../fieldRoutes'));
router.use('/plantings',  require('../plantingRoutes'));
router.use('/varieties',  require('../varietyRoutes'));
router.use('/activities', require('../activityRoutes'));
router.use('/harvests',   require('../harvestRoutes'));
router.use('/weather',    require('../weatherRoutes'));
router.use('/api-keys',   require('../apiKeyRoutes'));
router.use('/external',   require('../externalRoutes'));
router.use('/backups',       require('../backupRoutes'));
router.use('/notifications', require('../notificationRoutes'));

module.exports = router;