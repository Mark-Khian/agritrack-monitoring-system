const express = require('express');
const router = express.Router();
const { getAllHarvests, getHarvestById,
    createHarvest, updateHarvest,
    deleteHarvest } = require('../controllers/harvestController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');
const { exportHarvestsCSV, exportHarvestsPDF } = require('../controllers/exportController');
const { exportLimiter } = require('../middleware/rateLimiter');
const { validateHarvest,
    validateId } = require('../middleware/validateData');

router.get('/export/csv', protect, authorize(CAPABILITIES.HARVEST_EXPORT), exportLimiter, exportHarvestsCSV);
router.get('/export/pdf', protect, authorize(CAPABILITIES.HARVEST_EXPORT), exportLimiter, exportHarvestsPDF);
router.get('/', protect, authorize(CAPABILITIES.HARVEST_READ), getAllHarvests);
router.get('/:id', protect, authorize(CAPABILITIES.HARVEST_READ), validateId, getHarvestById);
router.post('/', protect, authorize(CAPABILITIES.HARVEST_CREATE), validateHarvest, createHarvest);
router.put('/:id', protect, authorize(CAPABILITIES.HARVEST_UPDATE), validateId,
    validateHarvest, updateHarvest);
router.delete('/:id', protect, authorize(CAPABILITIES.HARVEST_DELETE), validateId, deleteHarvest);

module.exports = router;
