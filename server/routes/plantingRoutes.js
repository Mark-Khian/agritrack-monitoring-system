const express = require('express');
const router = express.Router();
const { getAllPlantings, getPlantingById,
    createPlanting, updatePlanting,
    deletePlanting } = require('../controllers/plantingController');
const { exportPlantingsCSV, exportPlantingsPDF, exportPlantingPDF } = require('../controllers/exportController');
const { protect, checkRole } = require('../middleware/authMiddleware');
const { exportLimiter } = require('../middleware/rateLimiter');
const { validatePlanting,
    validatePlantingUpdate,
    validateId } = require('../middleware/validateData');

router.get('/', protect, getAllPlantings);
router.get('/export/csv', protect, checkRole(['admin', 'manager']), exportLimiter, exportPlantingsCSV);
router.get('/export/pdf', protect, checkRole(['admin', 'manager']), exportLimiter, exportPlantingsPDF);
router.get('/:id/export/pdf', protect, validateId, exportLimiter, exportPlantingPDF);
router.get('/:id', protect, validateId, getPlantingById);
router.post('/', protect, validatePlanting, createPlanting);
router.put('/:id', protect, validateId,
    validatePlantingUpdate, updatePlanting);
router.delete('/:id', protect, validateId, deletePlanting);

module.exports = router;