const express = require('express');
const router = express.Router();
const { getAllFarms, getFarmById,
    createFarm, updateFarm,
    deleteFarm } = require('../controllers/farmController');
const { protect } = require('../middleware/authMiddleware');
const { validateFarm,
    validateId } = require('../middleware/validateData');

router.get('/', protect, getAllFarms);
router.get('/:id', protect, validateId, getFarmById);
router.post('/', protect, validateFarm, createFarm);
router.put('/:id', protect, validateId,
    validateFarm, updateFarm);
router.delete('/:id', protect, validateId, deleteFarm);

module.exports = router;