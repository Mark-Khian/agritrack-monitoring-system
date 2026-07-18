'use strict';

const db = require('../config/db');
const { pruneNotifications } = require('../utils/notificationService');

// ── GET /api/v1/notifications ─────────────────────────────────────────────────
const getNotifications = async (req, res) => {
    try {
        // Run pruning to ensure outdated/obsolete notifications are cleared before retrieval
        await pruneNotifications();

        const [rows] = await db.query(
            `(SELECT id, type, title, message, related_id, is_read, created_at
              FROM notifications
              WHERE type = 'weather_alert'
              ORDER BY created_at DESC
              LIMIT 40)
             UNION ALL
             (SELECT id, type, title, message, related_id, is_read, created_at
              FROM notifications
              WHERE type != 'weather_alert'
              ORDER BY created_at DESC
              LIMIT 40)
             ORDER BY created_at DESC`
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
        const { group } = req.query;
        let sql = `UPDATE notifications SET is_read = 1 WHERE is_read = 0`;
        const params = [];
        
        if (group === 'weather') {
            sql += ` AND type = 'weather_alert'`;
        } else if (group === 'activity') {
            sql += ` AND type != 'weather_alert'`;
        }

        await db.query(sql, params);
        res.status(200).json({ message: 'Notifications marked as read.' });
    } catch (err) {
        console.error('markAllRead error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── DELETE /api/v1/notifications/:id ─────────────────────────────────────────
const deleteNotification = async (req, res) => {
    try {
        const [result] = await db.query(
            `DELETE FROM notifications WHERE id = ?`,
            [req.params.id]
        );

        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Notification not found.' });

        res.status(200).json({ message: 'Notification deleted successfully.' });
    } catch (err) {
        console.error('deleteNotification error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { getNotifications, markAsRead, markAllRead, deleteNotification };
