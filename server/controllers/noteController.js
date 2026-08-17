const db = require('../config/db');

// @desc    Get all notes for a user
// @route   GET /api/v1/notes
// @access  Private
const getNotes = async (req, res) => {
    try {
        const userId = req.user.id;
        const [notes] = await db.query(
            'SELECT * FROM notes WHERE user_id = ? ORDER BY note_date DESC',
            [userId]
        );
        res.status(200).json({ success: true, count: notes.length, data: notes });
    } catch (err) {
        console.error('getNotes error:', err);
        res.status(500).json({ success: false, message: 'Server Error fetching notes' });
    }
};

// @desc    Create a new note
// @route   POST /api/v1/notes
// @access  Private
const createNote = async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, note_date, color } = req.body;

        if (!title || !note_date) {
            return res.status(400).json({ success: false, message: 'Title and note_date are required' });
        }

        const [result] = await db.query(
            `INSERT INTO notes (user_id, title, description, note_date, color) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, title, description || null, note_date, color || 'slate']
        );

        const [newNote] = await db.query('SELECT * FROM notes WHERE id = ?', [result.insertId]);

        res.status(201).json({ success: true, data: newNote[0] });
    } catch (err) {
        console.error('createNote error:', err);
        res.status(500).json({ success: false, message: 'Server Error creating note' });
    }
};

// @desc    Update a note
// @route   PUT /api/v1/notes/:id
// @access  Private
const updateNote = async (req, res) => {
    try {
        const userId = req.user.id;
        const noteId = req.params.id;
        const { title, description, note_date, color } = req.body;

        // Check ownership
        const [existing] = await db.query('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Note not found or unauthorized' });
        }

        if (!title || !note_date) {
            return res.status(400).json({ success: false, message: 'Title and note_date are required' });
        }

        await db.query(
            `UPDATE notes SET title = ?, description = ?, note_date = ?, color = ? WHERE id = ?`,
            [title, description || null, note_date, color || 'slate', noteId]
        );

        const [updatedNote] = await db.query('SELECT * FROM notes WHERE id = ?', [noteId]);

        res.status(200).json({ success: true, data: updatedNote[0] });
    } catch (err) {
        console.error('updateNote error:', err);
        res.status(500).json({ success: false, message: 'Server Error updating note' });
    }
};

// @desc    Delete a note
// @route   DELETE /api/v1/notes/:id
// @access  Private
const deleteNote = async (req, res) => {
    try {
        const userId = req.user.id;
        const noteId = req.params.id;

        // Check ownership
        const [existing] = await db.query('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Note not found or unauthorized' });
        }

        await db.query('DELETE FROM notes WHERE id = ?', [noteId]);

        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        console.error('deleteNote error:', err);
        res.status(500).json({ success: false, message: 'Server Error deleting note' });
    }
};

module.exports = {
    getNotes,
    createNote,
    updateNote,
    deleteNote
};
