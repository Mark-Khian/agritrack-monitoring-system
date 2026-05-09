/**
 * notificationService.js
 *
 * Lifecycle-driven notification generator.
 * All functions operate globally across ALL users by joining through the
 * farms ownership chain. Duplicate prevention is handled by the UNIQUE
 * constraint uq_notification_daily (user_id, type, related_id, DATE(created_at)).
 *
 * Types:
 *   activity_due      — scheduled today, still pending
 *   activity_overdue  — past due, still pending
 *   lifecycle_update  — crop entered a new growth stage
 *   weather_alert     — rain expected at farm location
 *   system_guidance   — general advisory (unused by scheduler; reserved)
 */

'use strict';

const db = require('../config/db');
const https = require('https');

// ── Internal weather helper (mirrors weatherController but headless) ──────────

const API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (scheduler runs every 12h)
const _weatherCache = new Map();

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
 * Fetch rain status for a location (city name string).
 * Returns { rainExpected: bool } or null on error.
 */
const fetchRainStatus = async (location) => {
    if (!API_KEY) return null;

    const cacheKey = location.toLowerCase().trim();
    const cached = _weatherCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < WEATHER_CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`;
        const geoData = await httpsGet(geoUrl);
        if (!geoData || geoData.length === 0) return null;

        const { lat, lon } = geoData[0];
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=6`;
        const forecastRes = await httpsGet(forecastUrl);

        const next6 = (forecastRes.list || []).slice(0, 6);
        const rainExpected = next6.some(f => f.weather[0]?.id >= 500 && f.weather[0]?.id < 600);

        const data = { rainExpected, location };
        _weatherCache.set(cacheKey, { data, cachedAt: Date.now() });
        return data;
    } catch (err) {
        console.error(`[NotifService] Weather fetch error for "${location}":`, err.message);
        return null;
    }
};

// ── Safe insert (uses INSERT IGNORE so the UNIQUE constraint silently deduplicates) ─

const insertNotification = async (userId, type, title, message, relatedId = null) => {
    try {
        await db.query(
            `INSERT IGNORE INTO notifications (user_id, type, title, message, related_id, notif_date)
             VALUES (?, ?, ?, ?, ?, CURDATE())`,
            [userId, type, title, message, relatedId]
        );
    } catch (err) {
        // Log but don't crash the scheduler
        console.error('[NotifService] Insert error:', err.message);
    }
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
    try {
        // Fetch all pending activities scheduled for today, joined to user via farms
        const [rows] = await db.query(
            `SELECT
                a.id            AS activity_id,
                a.activity_type,
                a.activity_date,
                a.notes,
                fm.owner_id     AS user_id,
                pl.variety,
                fi.name         AS field_name
             FROM activities a
             JOIN plantings pl ON a.planting_id = pl.id
             JOIN fields    fi ON pl.field_id   = fi.id
             JOIN farms     fm ON fi.farm_id    = fm.id
             WHERE a.deleted_at IS NULL
               AND pl.deleted_at IS NULL
               AND fi.deleted_at IS NULL
               AND fm.deleted_at IS NULL
               AND a.status = 'pending'
               AND DATE(a.activity_date) = CURDATE()`
        );

        for (const row of rows) {
            const actLabel = String(row.activity_type).replaceAll('_', ' ');
            const plotLabel = [row.variety, row.field_name].filter(Boolean).join(' · ');
            await insertNotification(
                row.user_id,
                'activity_due',
                `${actLabel.charAt(0).toUpperCase() + actLabel.slice(1)} Due Today`,
                `Your ${actLabel} activity is scheduled for today${plotLabel ? ` on ${plotLabel}` : ''}. Complete it to stay on track with your crop lifecycle.`,
                row.activity_id
            );
        }

        if (rows.length > 0) {
            console.log(`[NotifService] activity_due: generated up to ${rows.length} notification(s)`);
        }
    } catch (err) {
        console.error('[NotifService] generateActivityNotifications error:', err.message);
    }
};

// ── 2. Overdue Activities ─────────────────────────────────────────────────────

const generateOverdueNotifications = async () => {
    try {
        const [rows] = await db.query(
            `SELECT
                a.id            AS activity_id,
                a.activity_type,
                a.activity_date,
                fm.owner_id     AS user_id,
                pl.variety,
                fi.name         AS field_name,
                DATEDIFF(CURDATE(), DATE(a.activity_date)) AS days_overdue
             FROM activities a
             JOIN plantings pl ON a.planting_id = pl.id
             JOIN fields    fi ON pl.field_id   = fi.id
             JOIN farms     fm ON fi.farm_id    = fm.id
             WHERE a.deleted_at IS NULL
               AND pl.deleted_at IS NULL
               AND fi.deleted_at IS NULL
               AND fm.deleted_at IS NULL
               AND a.status = 'pending'
               AND DATE(a.activity_date) < CURDATE()`
        );

        for (const row of rows) {
            const actLabel = String(row.activity_type).replaceAll('_', ' ');
            const plotLabel = [row.variety, row.field_name].filter(Boolean).join(' · ');
            const daysLabel = row.days_overdue === 1 ? '1 day' : `${row.days_overdue} days`;
            await insertNotification(
                row.user_id,
                'activity_overdue',
                `Overdue: ${actLabel.charAt(0).toUpperCase() + actLabel.slice(1)}`,
                `Your ${actLabel} activity${plotLabel ? ` on ${plotLabel}` : ''} is ${daysLabel} overdue. Take action immediately to protect crop health.`,
                row.activity_id
            );
        }

        if (rows.length > 0) {
            console.log(`[NotifService] activity_overdue: generated up to ${rows.length} notification(s)`);
        }
    } catch (err) {
        console.error('[NotifService] generateOverdueNotifications error:', err.message);
    }
};

// ── 3. Lifecycle Stage Transitions ────────────────────────────────────────────

const generateLifecycleNotifications = async () => {
    try {
        // Only active plantings that haven't been harvested/abandoned
        const [rows] = await db.query(
            `SELECT
                pl.id                       AS planting_id,
                pl.planting_date,
                pl.expected_growth_days,
                pl.variety,
                fi.name                     AS field_name,
                fm.owner_id                 AS user_id,
                DATEDIFF(CURDATE(), DATE(pl.planting_date)) AS days_elapsed
             FROM plantings pl
             JOIN fields fi ON pl.field_id  = fi.id
             JOIN farms  fm ON fi.farm_id   = fm.id
             WHERE pl.deleted_at IS NULL
               AND fi.deleted_at IS NULL
               AND fm.deleted_at IS NULL
               AND pl.status = 'active'
               AND pl.lifecycle_state NOT IN ('HARVESTED', 'ABANDONED')`
        );

        for (const row of rows) {
            const stage = computeGrowthStage(row.days_elapsed, row.expected_growth_days);
            if (stage === 'pre_planting') continue;

            const label = STAGE_LABELS[stage];
            const message = STAGE_MESSAGES[stage];
            if (!label) continue;

            const plotLabel = [row.variety, row.field_name].filter(Boolean).join(' · ');
            const title = `Lifecycle Update: ${label}${plotLabel ? ` — ${plotLabel}` : ''}`;

            await insertNotification(
                row.user_id,
                'lifecycle_update',
                title,
                message,
                row.planting_id
            );
        }

        if (rows.length > 0) {
            console.log(`[NotifService] lifecycle_update: processed ${rows.length} active planting(s)`);
        }
    } catch (err) {
        console.error('[NotifService] generateLifecycleNotifications error:', err.message);
    }
};

// ── 4. Weather Alerts ─────────────────────────────────────────────────────────

const generateWeatherNotifications = async () => {
    if (!API_KEY) {
        console.log('[NotifService] Weather alerts skipped — no OPENWEATHER_API_KEY configured.');
        return;
    }

    try {
        // Get distinct farm locations per user
        const [farms] = await db.query(
            `SELECT DISTINCT
                fm.owner_id  AS user_id,
                fm.location,
                fm.name      AS farm_name
             FROM farms fm
             WHERE fm.deleted_at IS NULL
               AND fm.location IS NOT NULL
               AND fm.location != ''`
        );

        for (const farm of farms) {
            const weather = await fetchRainStatus(farm.location);
            if (!weather || !weather.rainExpected) continue;

            await insertNotification(
                farm.user_id,
                'weather_alert',
                `Rain Expected at ${farm.farm_name || farm.location}`,
                `Rain is forecast in the next 18 hours near ${farm.location}. Consider postponing pesticide applications, and check drainage in low-lying fields.`,
                null  // weather alerts have no single related_id; null groups them per day
            );
        }

        console.log(`[NotifService] weather_alert: checked ${farms.length} farm location(s)`);
    } catch (err) {
        console.error('[NotifService] generateWeatherNotifications error:', err.message);
    }
};

// ── Batch runner ──────────────────────────────────────────────────────────────

/**
 * Run all activity + lifecycle generators (called every 6 hours).
 */
const runActivityCycle = async () => {
    console.log('[NotifService] Running activity/lifecycle notification cycle...');
    await generateActivityNotifications();
    await generateOverdueNotifications();
    await generateLifecycleNotifications();
    console.log('[NotifService] Activity/lifecycle cycle complete.');
};

/**
 * Run weather generator (called every 12 hours).
 */
const runWeatherCycle = async () => {
    console.log('[NotifService] Running weather notification cycle...');
    await generateWeatherNotifications();
    console.log('[NotifService] Weather cycle complete.');
};

module.exports = {
    generateActivityNotifications,
    generateOverdueNotifications,
    generateLifecycleNotifications,
    generateWeatherNotifications,
    runActivityCycle,
    runWeatherCycle,
};
