/**
 * notificationService.js
 *
 * Lifecycle-driven notification generator.
 * Farm-level notifications (weather, activity due/overdue, lifecycle) fan out
 * one row per eligible active non-archived Admin/Secretary/Farm Worker.
 * Weather dedupe uses per-user/day existence checks (related_id is NULL).
 * Activity/lifecycle rely on uq_notification_daily
 * (user_id, type, related_id, notif_date).
 *
 * Types:
 *   activity_due      — scheduled today, still pending
 *   activity_overdue  — past due, still pending
 *   lifecycle_update  — crop entered a new growth stage
 *   weather_alert     — rain expected at farm location (per eligible user)
 *   system_guidance   — general advisory (unused by scheduler; reserved)
 */

'use strict';

const db = require('../config/db');
const https = require('https');
const { getActiveAdmin, getActiveAdminId } = require('./activeAdmin');
const { broadcastNotificationsChanged } = require('./notificationHub');

// ── Internal weather helper (mirrors weatherController but headless) ──────────

const API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (scheduler runs every 12h)
const _weatherCache = new Map();

/** Test-only override for rain status (null = use live/cached OpenWeather). */
let _rainStatusOverride = null;

const setRainStatusOverrideForTests = (fnOrNull) => {
    _rainStatusOverride = typeof fnOrNull === 'function' ? fnOrNull : null;
};

const httpsGet = (url) =>
    new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Invalid JSON from weather API')); }
            });
        }).on('error', reject);
    });

/**
 * Fetch rain status for latitude and longitude.
 * Returns { rainExpected: bool } or null on error.
 */
const fetchRainStatus = async (lat, lon) => {
    if (_rainStatusOverride) {
        return _rainStatusOverride(lat, lon);
    }

    if (!API_KEY) return null;

    const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
    const cached = _weatherCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < WEATHER_CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=6`;
        const forecastRes = await httpsGet(forecastUrl);

        const next6 = (forecastRes.list || []).slice(0, 6);
        const rainExpected = next6.some(f => f.weather[0]?.id >= 500 && f.weather[0]?.id < 600);

        const data = { rainExpected };
        _weatherCache.set(cacheKey, { data, cachedAt: Date.now() });
        return data;
    } catch (err) {
        console.error(`[NotifService] Weather fetch error for coords ${lat}, ${lon}:`, err.message);
        return null;
    }
};

// Active admin lookup — farm weather location / legacy helpers (not recipient policy).
const getAdminId = async () => {
    try {
        return await getActiveAdminId();
    } catch (err) {
        console.error('[NotifService] Failed to query admin ID:', err.message);
        return null;
    }
};

/**
 * Eligible recipients for farm-level notifications (weather + activity/lifecycle):
 * active, non-archived ADMIN / SECRETARY / FARM_WORKER accounts.
 */
const getFarmNotificationRecipientIds = async () => {
    const [rows] = await db.query(
        `SELECT id
         FROM users
         WHERE is_active = 1
           AND status = 'ACTIVE'
           AND archived_at IS NULL
           AND role IN ('admin', 'ADMIN', 'SECRETARY', 'FARM_WORKER')
         ORDER BY id ASC`
    );
    return rows.map((row) => row.id);
};

/** @deprecated alias — same eligibility set as getFarmNotificationRecipientIds */
const getWeatherAlertRecipientIds = getFarmNotificationRecipientIds;

// ── Safe insert ───────────────────────────────────────────────────────────────

/**
 * Insert one notification for a specific user.
 * @returns {Promise<boolean>} true when a new row was inserted
 */
const insertNotificationForUser = async (userId, type, title, message, relatedId = null) => {
    if (!userId) return false;
    try {
        const [result] = await db.query(
            `INSERT IGNORE INTO notifications (user_id, type, title, message, related_id, notif_date)
             VALUES (?, ?, ?, ?, ?, CURDATE())`,
            [userId, type, title, message, relatedId]
        );
        return (result.affectedRows || 0) > 0;
    } catch (err) {
        console.error('[NotifService] Insert error:', err.message);
        return false;
    }
};

/**
 * Weather alerts use related_id NULL; enforce one active copy per user/day explicitly.
 * @returns {Promise<boolean>} true when a new row was inserted
 */
const insertWeatherAlertForUser = async (userId, title, message) => {
    if (!userId) return false;
    try {
        const [result] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, related_id, notif_date)
             SELECT ?, 'weather_alert', ?, ?, NULL, CURDATE()
             FROM DUAL
             WHERE NOT EXISTS (
                SELECT 1
                FROM notifications
                WHERE user_id = ?
                  AND type = 'weather_alert'
                  AND notif_date = CURDATE()
             )`,
            [userId, title, message, userId]
        );
        return (result.affectedRows || 0) > 0;
    } catch (err) {
        console.error('[NotifService] Weather insert error:', err.message);
        return false;
    }
};

/**
 * Fan-out one logical activity/lifecycle event to every eligible recipient.
 * Dedup is per (user_id, type, related_id, notif_date) via INSERT IGNORE.
 * @returns {Promise<number>} number of new rows inserted
 */
const insertNotification = async (type, title, message, relatedId = null) => {
    const recipientIds = await getFarmNotificationRecipientIds();
    if (recipientIds.length === 0) {
        console.log(`[NotifService] Generation skipped — no eligible recipients for notification type: ${type}`);
        return 0;
    }
    let inserted = 0;
    for (const userId of recipientIds) {
        const ok = await insertNotificationForUser(userId, type, title, message, relatedId);
        if (ok) inserted += 1;
    }
    return inserted;
};

// ── Growth stage computation ──────────────────────────────────────────────────

/**
 * Derive the canonical growth stage name from the days elapsed.
 * Thresholds are ratio-based against expected_growth_days.
 */
const computeGrowthStage = (daysSincePlanting, expectedGrowthDays) => {
    const egd = Math.max(1, Number(expectedGrowthDays) || 120);
    const ratio = daysSincePlanting / egd;

    if (ratio < 0)       return 'pre_planting';
    if (ratio < 0.08)    return 'seedling';
    if (ratio < 0.30)    return 'tillering';
    if (ratio < 0.50)    return 'booting';
    if (ratio < 0.70)    return 'heading';
    if (ratio < 0.90)    return 'ripening';
    return 'ready_for_harvest';
};

const STAGE_LABELS = {
    seedling:           'Seedling Stage',
    tillering:          'Tillering Stage',
    booting:            'Booting Stage',
    heading:            'Heading / Flowering Stage',
    ripening:           'Grain Ripening Stage',
    ready_for_harvest:  'Ready for Harvest',
};

const STAGE_MESSAGES = {
    seedling:
        'Your crop has entered the Seedling stage. Ensure proper water management and monitor for early pest pressure.',
    tillering:
        'Tillering has begun. This is a critical period — apply basal fertilizer and maintain adequate water levels.',
    booting:
        'The crop is in the Booting stage. Protect against blast disease and maintain irrigation.',
    heading:
        'Heading / Flowering stage detected. Avoid water stress and monitor for neck blast and stem borers.',
    ripening:
        'Grain Ripening stage reached. Begin preparing harvest equipment and plan logistics.',
    ready_for_harvest:
        'The crop is ready for harvest based on your growth timeline. Coordinate mechanical or manual harvest operations.',
};

// ── 1. Activity Due (today) ───────────────────────────────────────────────────

const generateActivityNotifications = async () => {
    let inserted = 0;
    try {
        const [rows] = await db.query(
            `SELECT
                a.id            AS activity_id,
                a.activity_type,
                a.planned_date,
                a.notes,
                pl.user_id      AS user_id,
                pl.variety,
                pl.field_name   AS field_name
             FROM activities a
             JOIN plantings pl ON a.planting_id = pl.id
             WHERE a.deleted_at IS NULL
               AND pl.deleted_at IS NULL
               AND a.status = 'PENDING'
               AND DATE(a.planned_date) = CURDATE()`
        );

        for (const row of rows) {
            const actLabel = String(row.activity_type).replaceAll('_', ' ');
            const plotLabel = [row.variety, row.field_name].filter(Boolean).join(' · ');
            const n = await insertNotification(
                'activity_due',
                `${actLabel.charAt(0).toUpperCase() + actLabel.slice(1)} Due Today${plotLabel ? ` — ${plotLabel}` : ''}`,
                `Your ${actLabel} activity is scheduled for today${plotLabel ? ` on ${plotLabel}` : ''}. Complete it to stay on track with your crop lifecycle.`,
                row.activity_id
            );
            inserted += n;
        }

        if (inserted > 0) {
            console.log(`[NotifService] activity_due: generated ${inserted} notification(s)`);
        }
    } catch (err) {
        console.error('[NotifService] generateActivityNotifications error:', err.message);
    }
    return inserted > 0;
};

// ── 2. Overdue Activities ─────────────────────────────────────────────────────

const generateOverdueNotifications = async () => {
    let inserted = 0;
    try {
        const [rows] = await db.query(
            `SELECT
                a.id            AS activity_id,
                a.activity_type,
                a.planned_date,
                pl.user_id      AS user_id,
                pl.variety,
                pl.field_name   AS field_name,
                DATEDIFF(CURDATE(), DATE(a.planned_date)) AS days_overdue
             FROM activities a
             JOIN plantings pl ON a.planting_id = pl.id
             WHERE a.deleted_at IS NULL
               AND pl.deleted_at IS NULL
               AND a.status = 'PENDING'
               AND DATE(a.planned_date) < CURDATE()`
        );

        for (const row of rows) {
            const actLabel = String(row.activity_type).replaceAll('_', ' ');
            const plotLabel = [row.variety, row.field_name].filter(Boolean).join(' · ');
            const daysLabel = row.days_overdue === 1 ? '1 day' : `${row.days_overdue} days`;
            const n = await insertNotification(
                'activity_overdue',
                `Overdue: ${actLabel.charAt(0).toUpperCase() + actLabel.slice(1)}${plotLabel ? ` — ${plotLabel}` : ''}`,
                `Your ${actLabel} activity${plotLabel ? ` on ${plotLabel}` : ''} is ${daysLabel} overdue. Take action immediately to protect crop health.`,
                row.activity_id
            );
            inserted += n;
        }

        if (inserted > 0) {
            console.log(`[NotifService] activity_overdue: generated ${inserted} notification(s)`);
        }
    } catch (err) {
        console.error('[NotifService] generateOverdueNotifications error:', err.message);
    }
    return inserted > 0;
};

// ── 3. Lifecycle Stage Transitions ────────────────────────────────────────────

const generateLifecycleNotifications = async () => {
    let inserted = 0;
    try {
        const [rows] = await db.query(
            `SELECT
                pl.id                       AS planting_id,
                pl.planting_date,
                pl.expected_growth_days,
                pl.variety,
                pl.field_name               AS field_name,
                pl.user_id                  AS user_id,
                DATEDIFF(CURDATE(), DATE(pl.planting_date)) AS days_elapsed
             FROM plantings pl
             WHERE pl.deleted_at IS NULL
               AND pl.status = 'active'`
        );

        for (const row of rows) {
            const stage = computeGrowthStage(row.days_elapsed, row.expected_growth_days);
            if (stage === 'pre_planting') continue;

            const label = STAGE_LABELS[stage];
            const message = STAGE_MESSAGES[stage];
            if (!label) continue;

            const plotLabel = [row.variety, row.field_name].filter(Boolean).join(' · ');
            const title = `Lifecycle Update: ${label}${plotLabel ? ` — ${plotLabel}` : ''}`;

            const n = await insertNotification(
                'lifecycle_update',
                title,
                message,
                row.planting_id
            );
            inserted += n;
        }

        if (inserted > 0) {
            console.log(`[NotifService] lifecycle_update: generated ${inserted} notification(s)`);
        }
    } catch (err) {
        console.error('[NotifService] generateLifecycleNotifications error:', err.message);
    }
    return inserted > 0;
};

// ── 4. Weather Alerts ─────────────────────────────────────────────────────────

const generateWeatherNotifications = async () => {
    if (!_rainStatusOverride && !API_KEY) {
        console.log('[NotifService] Weather alerts skipped — no OPENWEATHER_API_KEY configured.');
        return false;
    }

    try {
        const admin = await getActiveAdmin();
        if (!admin || admin.farm_latitude == null || admin.farm_longitude == null) {
            console.log('[NotifService] Weather alerts skipped — farm location not configured.');
            return false;
        }

        const { farm_latitude: lat, farm_longitude: lon, farm_location_name: locationName } = admin;

        const [activePlantings] = await db.query(`SELECT COUNT(*) as count FROM plantings WHERE status = 'active' AND deleted_at IS NULL`);
        if (activePlantings[0].count === 0) {
            console.log('[NotifService] Weather alerts skipped — no active plantings found.');
            return false;
        }

        const weather = await fetchRainStatus(lat, lon);
        if (!weather || !weather.rainExpected) return false;

        const recipientIds = await getFarmNotificationRecipientIds();
        if (recipientIds.length === 0) {
            console.log('[NotifService] Weather alerts skipped — no eligible active recipients.');
            return false;
        }

        const title = `Rain Expected at ${locationName || 'Farm'}`;
        const message = `Rain is forecast in the next 18 hours near ${locationName || 'your farm'}. Consider postponing pesticide applications, and check drainage in low-lying fields.`;

        let inserted = 0;
        for (const userId of recipientIds) {
            const ok = await insertWeatherAlertForUser(userId, title, message);
            if (ok) inserted += 1;
        }

        if (inserted > 0) {
            console.log(`[NotifService] weather_alert: generated ${inserted} notification(s) for farm location`);
        }
        return inserted > 0;
    } catch (err) {
        console.error('[NotifService] generateWeatherNotifications error:', err.message);
        return false;
    }
};

// ── Batch runner ──────────────────────────────────────────────────────────────

/**
 * Auto-delete notifications older than 24 hours / obsolete activity+lifecycle rows.
 * @returns {Promise<number>} rows pruned
 */
const pruneNotifications = async () => {
    try {
        console.log('[NotifService] Pruning weather alerts older than 24 hours...');
        const [weatherRes] = await db.query(
            "DELETE FROM notifications WHERE type = 'weather_alert' AND created_at < NOW() - INTERVAL 24 HOUR"
        );

        console.log('[NotifService] Pruning inactive activity notifications...');
        const [activityRes] = await db.query(`
            DELETE n FROM notifications n
            LEFT JOIN activities a ON n.related_id = a.id
            LEFT JOIN plantings pl ON a.planting_id = pl.id
            WHERE n.type IN ('activity_due', 'activity_overdue')
              AND (
                  a.id IS NULL
                  OR a.status != 'PENDING'
                  OR a.deleted_at IS NOT NULL
                  OR pl.id IS NULL
                  OR pl.status != 'active'
                  OR pl.deleted_at IS NOT NULL
              )
        `);

        console.log('[NotifService] Pruning inactive lifecycle notifications...');
        const [lifecycleRes] = await db.query(`
            DELETE n FROM notifications n
            LEFT JOIN plantings pl ON n.related_id = pl.id
            WHERE n.type = 'lifecycle_update'
              AND (
                  pl.id IS NULL
                  OR pl.status != 'active'
                  OR pl.deleted_at IS NOT NULL
              )
        `);

        const totalPruned = (weatherRes.affectedRows || 0) + (activityRes.affectedRows || 0) + (lifecycleRes.affectedRows || 0);
        if (totalPruned > 0) {
            console.log(`[NotifService] Pruned ${totalPruned} obsolete/old notification(s).`);
        }
        return totalPruned;
    } catch (err) {
        console.error('[NotifService] pruneNotifications error:', err.message);
        return 0;
    }
};

/**
 * Run all activity + lifecycle generators (called every 6 hours).
 * One broadcast after the batch when any DB notification state changed.
 */
const runActivityCycle = async () => {
    console.log('[NotifService] Running activity/lifecycle notification cycle...');
    const due = await generateActivityNotifications();
    const overdue = await generateOverdueNotifications();
    const lifecycle = await generateLifecycleNotifications();
    const pruned = await pruneNotifications();
    if (due || overdue || lifecycle || pruned > 0) {
        broadcastNotificationsChanged();
    }
    console.log('[NotifService] Activity/lifecycle cycle complete.');
};

/**
 * Run weather generator (called every 12 hours).
 * One broadcast after the batch when any DB notification state changed.
 */
const runWeatherCycle = async () => {
    console.log('[NotifService] Running weather notification cycle...');
    const weather = await generateWeatherNotifications();
    const pruned = await pruneNotifications();
    if (weather || pruned > 0) {
        broadcastNotificationsChanged();
    }
    console.log('[NotifService] Weather cycle complete.');
};

module.exports = {
    generateActivityNotifications,
    generateOverdueNotifications,
    generateLifecycleNotifications,
    generateWeatherNotifications,
    runActivityCycle,
    runWeatherCycle,
    pruneNotifications,
    getAdminId,
    getFarmNotificationRecipientIds,
    getWeatherAlertRecipientIds,
    insertNotification,
    insertNotificationForUser,
    insertWeatherAlertForUser,
    setRainStatusOverrideForTests,
};
