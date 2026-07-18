/**
 * notificationRoutes.js
 *
 * Routes for the in-app notification system.
 * Order matters: /read-all must come before /:id/read to avoid route collision.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getNotifications,
    markAsRead,
    markAllRead,
    deleteNotification,
} = require('../controllers/notificationController');

// All routes require authentication
router.use(protect);

// GET  /api/v1/notifications          — list latest 20 + unread count
router.get('/', getNotifications);

// PATCH /api/v1/notifications/read-all — mark all as read (must be before :id route)
router.patch('/read-all', markAllRead);

// PATCH /api/v1/notifications/:id/read — mark one as read
router.patch('/:id/read', markAsRead);

// DELETE /api/v1/notifications/:id — delete a notification
router.delete('/:id', deleteNotification);

module.exports = router;
