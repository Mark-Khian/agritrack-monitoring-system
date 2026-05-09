const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ── Generate API Key (admin only) ─────────
router.post('/generate', protect, restrictTo('admin'), async (req, res) => {
    const { name, expires_in_days, permissions } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'API key name is required.' });
    }

    try {
        // Generate unique key
        const apiKey = `agri_${crypto.randomBytes(32).toString('hex')}`;
        const expiresAt = expires_in_days
            ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
            : null;

        const [result] = await db.query(
            `INSERT INTO api_keys
             (name, api_key, user_id, permissions, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                name,
                apiKey,
                req.user.id,
                permissions ? JSON.stringify(permissions) : null,
                expiresAt
            ]
        );

        res.status(201).json({
            message: 'API key generated successfully!',
            id: result.insertId,
            name,
            apiKey,     // ← show only once!
            expiresAt: expiresAt || 'Never',
            warning: 'Save this key now! It will not be shown again.'
        });

    } catch (err) {
        console.error('Generate API key error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ── List All API Keys (admin only) ────────
router.get('/', protect, restrictTo('admin'), async (req, res) => {
    try {
        const [keys] = await db.query(
            `SELECT
                id, name, is_active,
                last_used, expires_at, created_at,
                CONCAT(LEFT(api_key, 12), '...') AS api_key_preview
             FROM api_keys
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        res.status(200).json({ keys });
    } catch (err) {
        console.error('List API keys error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ── Revoke API Key (admin only) ───────────
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE api_keys
             SET is_active = 0
             WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'API key not found.' });
        }

        res.status(200).json({ message: 'API key revoked successfully!' });
    } catch (err) {
        console.error('Revoke API key error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ── Renew API Key (admin only) ────────────
router.put('/:id/renew', protect, restrictTo('admin'), async (req, res) => {
    const { expires_in_days } = req.body;

    try {
        const expiresAt = expires_in_days
            ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
            : null;

        const [result] = await db.query(
            `UPDATE api_keys
             SET is_active = 1, expires_at = ?
             WHERE id = ? AND user_id = ?`,
            [expiresAt, req.params.id, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'API key not found.' });
        }

        res.status(200).json({
            message: 'API key renewed!',
            expiresAt: expiresAt || 'Never'
        });
    } catch (err) {
        console.error('Renew API key error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;