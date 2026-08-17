const express = require('express');
const router = express.Router();
const { getAllHarvests, getHarvestById,
    createHarvest, updateHarvest,
    deleteHarvest } = require('../controllers/harvestController');
const { protect } = require('../middleware/authMiddleware');
const { exportHarvestsCSV, exportHarvestsPDF } = require('../controllers/exportController');
const { exportLimiter } = require('../middleware/rateLimiter');
const { checkRole } = require('../middleware/authMiddleware');
const { validateHarvest,
    validateId } = require('../middleware/validateData');

router.get('/export/csv', protect, checkRole(['admin', 'manager']), exportLimiter, exportHarvestsCSV);
router.get('/export/pdf', protect, checkRole(['admin', 'manager']), exportLimiter, exportHarvestsPDF);
router.get('/', protect, getAllHarvests);
router.get('/:id', protect, validateId, getHarvestById);
router.post('/', protect, validateHarvest, createHarvest);
router.put('/:id', protect, validateId,
    validateHarvest, updateHarvest);
router.delete('/:id', protect, validateId, deleteHarvest);

module.exports = router;
