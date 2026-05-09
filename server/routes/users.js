const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// GET /api/users — admin only
router.get('/', protect, restrictTo('admin'), async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, name, email, role, is_active, created_at FROM users'
        );
        res.json({ users });
    } catch (err) {
        console.error('[USERS] ❌ Error fetching users:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;