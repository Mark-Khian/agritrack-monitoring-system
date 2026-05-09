const express = require('express');
const router = express.Router();
const { getAllPlantings, getPlantingById,
    createPlanting, updatePlanting,
    deletePlanting } = require('../controllers/plantingController');
const { protect } = require('../middleware/authMiddleware');
const { validatePlanting,
    validatePlantingUpdate,
    validateId } = require('../middleware/validateData');

router.get('/', protect, getAllPlantings);
router.get('/:id', protect, validateId, getPlantingById);
router.post('/', protect, validatePlanting, createPlanting);
router.put('/:id', protect, validateId,
    validatePlantingUpdate, updatePlanting);
router.delete('/:id', protect, validateId, deletePlanting);

module.exports = router;