const express = require('express');
const router = express.Router();
const { getAllHarvests, getHarvestById,
    createHarvest, updateHarvest,
    deleteHarvest } = require('../controllers/harvestController');
const { protect } = require('../middleware/authMiddleware');
const { validateHarvest,
    validateId } = require('../middleware/validateData');

router.get('/', protect, getAllHarvests);
router.get('/:id', protect, validateId, getHarvestById);
router.post('/', protect, validateHarvest, createHarvest);
router.put('/:id', protect, validateId,
    validateHarvest, updateHarvest);
router.delete('/:id', protect, validateId, deleteHarvest);

module.exports = router;
