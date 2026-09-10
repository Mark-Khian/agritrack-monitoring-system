const express = require('express');
const router = express.Router();
const { getAllPlantings, getPlantingById,
    createPlanting, updatePlanting,
    deletePlanting } = require('../controllers/plantingController');
const { exportPlantingsCSV, exportPlantingsPDF, exportPlantingPDF } = require('../controllers/exportController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');
const { exportLimiter } = require('../middleware/rateLimiter');
const { validatePlanting,
    validatePlantingUpdate,
    validateId } = require('../middleware/validateData');

router.get('/', protect, authorize(CAPABILITIES.PLANTING_READ), getAllPlantings);
router.get('/export/csv', protect, authorize(CAPABILITIES.PLANTING_EXPORT), exportLimiter, exportPlantingsCSV);
router.get('/export/pdf', protect, authorize(CAPABILITIES.PLANTING_EXPORT), exportLimiter, exportPlantingsPDF);
router.get('/:id/export/pdf', protect, authorize(CAPABILITIES.PLANTING_EXPORT), validateId, exportLimiter, exportPlantingPDF);
router.get('/:id', protect, authorize(CAPABILITIES.PLANTING_READ), validateId, getPlantingById);
router.post('/', protect, authorize(CAPABILITIES.PLANTING_CREATE), validatePlanting, createPlanting);
router.put('/:id', protect, authorize(CAPABILITIES.PLANTING_UPDATE), validateId,
    validatePlantingUpdate, updatePlanting);
router.delete('/:id', protect, authorize(CAPABILITIES.PLANTING_DELETE), validateId, deletePlanting);

module.exports = router;
