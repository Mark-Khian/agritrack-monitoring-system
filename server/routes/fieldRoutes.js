const express = require('express');
const router = express.Router();
const { getAllFields, getFieldById,
    createField, updateField,
    deleteField } = require('../controllers/fieldController');
const { protect } = require('../middleware/authMiddleware');
const { validateField,
    validateId } = require('../middleware/validateData');

router.get('/', protect, getAllFields);
router.get('/:id', protect, validateId, getFieldById);
router.post('/', protect, validateField, createField);
router.put('/:id', protect, validateId,
    validateField, updateField);
router.delete('/:id', protect, validateId, deleteField);

module.exports = router;