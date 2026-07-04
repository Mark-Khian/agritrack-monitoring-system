'use strict';

const db = require('../config/db');

// ── GET /api/v1/notifications ─────────────────────────────────────────────────
const getNotifications = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, type, title, message, related_id, is_read, created_at
             FROM notifications
             ORDER BY created_at DESC
             LIMIT 20`
        );

        const [[{ unread }]] = await db.query(
            `SELECT COUNT(*) AS unread FROM notifications WHERE is_read = 0`
        );

        res.status(200).json({ data: rows, unread: Number(unread) });
    } catch (err) {
        console.error('getNotifications error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── PATCH /api/v1/notifications/:id/read ─────────────────────────────────────
const markAsRead = async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE notifications SET is_read = 1 WHERE id = ?`,
            [req.params.id]
        );

        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Notification not found.' });

        res.status(200).json({ message: 'Notification marked as read.' });
    } catch (err) {
        console.error('markAsRead error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── PATCH /api/v1/notifications/read-all ─────────────────────────────────────
const markAllRead = async (req, res) => {
    try {
        await db.query(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`);
        res.status(200).json({ message: 'All notifications marked as read.' });
    } catch (err) {
        console.error('markAllRead error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { getNotifications, markAsRead, markAllRead };
