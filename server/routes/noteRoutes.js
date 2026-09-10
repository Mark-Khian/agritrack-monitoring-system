const express = require('express');
const router = express.Router();
const { getNotes, createNote, updateNote, deleteNote } = require('../controllers/noteController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');

router.use(protect);

router.route('/')
    .get(authorize(CAPABILITIES.NOTE_READ), getNotes)
    .post(authorize(CAPABILITIES.NOTE_MANAGE), createNote);

router.route('/:id')
    .put(authorize(CAPABILITIES.NOTE_MANAGE), updateNote)
    .delete(authorize(CAPABILITIES.NOTE_MANAGE), deleteNote);

module.exports = router;
