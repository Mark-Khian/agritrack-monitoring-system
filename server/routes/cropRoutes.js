const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');

// GET /api/crops — protected example route (requires valid JWT)
router.get('/', protect, (req, res) => {
    console.log('[CROPS] ✅ Access granted to user ID:', req.user.id);
    res.json({
        message: '🌾 Crops route is protected and working!',
        accessedBy: {
            id: req.user.id,
            role: req.user.role
        },
        crops: [
            { id: 1, name: 'Rice', season: 'Wet', status: 'Growing' },
            { id: 2, name: 'Corn', season: 'Dry', status: 'Harvested' },
            { id: 3, name: 'Tomato', season: 'Dry', status: 'Planted' }
        ]
    });
});

// GET /api/crops/admin — admin-only example
router.get('/admin', protect, restrictTo('admin'), (req, res) => {
    console.log('[CROPS] ✅ Admin access by user ID:', req.user.id);
    res.json({ message: '🔒 Admin-only crop management data.' });
});

module.exports = router;
