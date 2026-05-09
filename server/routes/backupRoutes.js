const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/authMiddleware');
const { runBackup, listBackups } = require('../utils/backup');

// ✅ Block all backup routes in development
if (process.env.NODE_ENV !== 'production') {
    router.use((req, res) => {
        return res.status(503).json({
            message: '🚧 Backup features are disabled during development.'
        });
    });
} else {
    // ── List all backups ─────────────────────
    router.get('/', protect, (req, res) => {
        const backups = listBackups();
        res.status(200).json({
            message: `${backups.length} backup(s) found.`,
            backups
        });
    });

    // ── Trigger manual backup ────────────────
    router.post('/run', protect, (req, res) => {
        try {
            runBackup();
            res.status(200).json({
                message: '✅ Backup started! Check server logs for status.'
            });
        } catch (err) {
            res.status(500).json({ message: 'Backup failed.', error: err.message });
        }
    });

    // ── Download a backup file ───────────────
    router.get('/download/:filename', protect, (req, res) => {
        const filename = req.params.filename;

        if (filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }

        const filepath = path.join(__dirname, '..', 'backups', filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ message: 'Backup file not found.' });
        }

        res.download(filepath, filename);
    });
}

module.exports = router;