-- Migration 006: Notifications Table
-- Run manually in MySQL / MariaDB 10.4+
-- Paste this entire block into your MySQL client (phpMyAdmin, HeidiSQL, CLI, etc.)

CREATE TABLE IF NOT EXISTS notifications (
    id          INT             NOT NULL AUTO_INCREMENT,
    user_id     INT             NOT NULL,
    type        ENUM(
                    'activity_due',
                    'activity_overdue',
                    'weather_alert',
                    'lifecycle_update',
                    'system_guidance'
                )               NOT NULL,
    title       VARCHAR(150)    NOT NULL,
    message     TEXT            NOT NULL,
    related_id  INT             NULL DEFAULT NULL,
    is_read     TINYINT(1)      NOT NULL DEFAULT 0,
    notif_date  DATE            NOT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    INDEX idx_notifications_user_read (user_id, is_read),

    UNIQUE KEY uq_notification_daily (user_id, type, related_id, notif_date)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
