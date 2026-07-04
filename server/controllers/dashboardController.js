/**
 * dashboardController.js
 *
 * GET /api/v1/dashboard/lifecycle-monitoring
 * Returns all active plantings enriched with lifecycle stage, progress,
 * upcoming/overdue activity counts, days remaining, and recent activities.
 */

'use strict';

const db = require('../config/db');
const { utcTodayYmd, calendarDaysBetween } = require('../utils/plantingDates');
const { loadPresentationContext, enrichPlantingRow } = require('../services/plantingPresentationService');
const { LIFECYCLE_ACTIVITY_TEMPLATES, syncActivityStatuses } = require('../utils/activityScheduler');

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_ORDER = [
    'Seedling Stage',
    'Vegetative Stage',
    'Reproductive Stage',
    'Ripening Stage',
    'Harvest Stage',
];

const activitySummary = (activities) => {
    const today = utcTodayYmd();
    let pending = 0, ongoing = 0, overdue = 0, completed = 0;

    for (const a of activities) {
        const status = String(a.status || '').toLowerCase();
        const date   = String(a.activity_date || '').slice(0, 10);
        const isPast = date < today;

        if (status === 'completed' || status === 'cancelled') {
            completed++;
        } else if ((status === 'pending' || status === 'ongoing') && isPast) {
            overdue++;
        } else if (status === 'ongoing') {
            ongoing++;
        } else {
            pending++;
        }
    }

    // Next upcoming activity (earliest non-completed, non-cancelled, non-overdue)
    const upcoming = activities
        .filter((a) => {
            const s = String(a.status || '').toLowerCase();
            const d = String(a.activity_date || '').slice(0, 10);
            return (s === 'pending' || s === 'ongoing') && d >= today;
        })
        .sort((a, b) => a.activity_date.localeCompare(b.activity_date))[0] || null;

    return { pending, ongoing, overdue, completed, next_activity: upcoming };
};

const daysRemaining = (expectedHarvest) => {
    if (!expectedHarvest) return null;
    const today = utcTodayYmd();
    const diff  = calendarDaysBetween(today, String(expectedHarvest).slice(0, 10));
    return diff; // negative = overdue
};

// ── Controller ────────────────────────────────────────────────────────────────

const getLifecycleMonitoring = async (req, res) => {
    try {
        await syncActivityStatuses(db);
        const today = utcTodayYmd();

        // 1. Fetch all non-deleted, non-completed, non-abandoned plantings
        const [plantings] = await db.query(
            `SELECT
                p.id,
                p.field_name,
                p.field_location,
                p.field_size,
                p.field_category,
                p.variety_class,
                p.variety,
                p.variety_id,
                p.planting_date,
                p.expected_harvest,
                p.season,
                p.lifecycle_state,
                p.expected_growth_days,
                p.adjustment_days,
                p.growth_plan_manual_override,
                p.lifecycle_state_changed_at,
                p.lifecycle_state_reason,
                p.growth_stage_recorded,
                p.growth_stage_source,
                p.status,
                p.created_at,
                v.default_expected_growth_days AS variety_default_expected_growth_days,
                v.min_growth_days              AS variety_min_growth_days,
                v.max_growth_days              AS variety_max_growth_days
             FROM plantings p
             LEFT JOIN varieties v ON p.variety_id = v.id
             WHERE p.deleted_at IS NULL
               AND p.status NOT IN ('completed', 'failed')
               AND p.lifecycle_state NOT IN ('HARVESTED', 'ABANDONED')
             ORDER BY p.planting_date ASC`
        );

        if (plantings.length === 0) {
            return res.status(200).json({
                data: [],
                summary: { total: 0, by_stage: {}, attention_needed: 0 },
                today
            });
        }

        const ids = plantings.map((p) => p.id);

        // 2. Load harvest + overdue context (used by enrichPlantingRow)
        const ctx = await loadPresentationContext(db, ids);

        // 3. Load all activities for these plantings in one query
        const ph = ids.map(() => '?').join(',');
        const [allActivities] = await db.query(
            `SELECT
                id, planting_id, activity_type, activity_date,
                status, notes, is_system_generated, lifecycle_template_index
             FROM activities
             WHERE planting_id IN (${ph})
               AND deleted_at IS NULL
             ORDER BY activity_date ASC`,
            ids
        );

        // Group activities by planting_id
        const activitiesByPlanting = {};
        for (const a of allActivities) {
            if (!activitiesByPlanting[a.planting_id]) {
                activitiesByPlanting[a.planting_id] = [];
            }
            activitiesByPlanting[a.planting_id].push(a);
        }

        // 4. Enrich each planting
        const data = plantings.map((p) => {
            const enriched  = enrichPlantingRow(p, ctx, today);
            const activities = activitiesByPlanting[p.id] || [];
            const summary   = activitySummary(activities);
            const days_left = daysRemaining(p.expected_harvest);

            // Elapsed days since planting
            const days_since_planting = Math.max(
                0,
                calendarDaysBetween(String(p.planting_date).slice(0, 10), today)
            );

            // Total lifecycle duration
            const total_days =
                Math.max(1, Number(p.expected_growth_days || 0) + Number(p.adjustment_days || 0));

            // Progress percent (0–100)
            const progress_pct = Math.round(
                Math.max(0, Math.min(1, enriched.progress_estimate || 0)) * 100
            );

            // Lifecycle template completeness
            const completedTemplateIndices = new Set(
                activities
                    .filter((a) => a.is_system_generated && a.lifecycle_template_index != null && a.status === 'completed')
                    .map((a) => a.lifecycle_template_index)
            );
            const lifecycle_tasks_completed = completedTemplateIndices.size;
            const lifecycle_tasks_total     = LIFECYCLE_ACTIVITY_TEMPLATES.length;

            return {
                id:               p.id,
                field_name:       p.field_name,
                field_location:   p.field_location   || null,
                field_size:       p.field_size        || null,
                field_category:   p.field_category   || null,
                variety:          p.variety,
                variety_class:    p.variety_class,
                variety_id:       p.variety_id        || null,
                season:           p.season,
                planting_date:    String(p.planting_date).slice(0, 10),
                expected_harvest: p.expected_harvest
                    ? String(p.expected_harvest).slice(0, 10)
                    : null,

                // Lifecycle
                lifecycle_state:          enriched.lifecycle_state,
                lifecycle_state_reason:   p.lifecycle_state_reason   || null,
                lifecycle_state_changed_at: p.lifecycle_state_changed_at || null,
                growth_stage:             enriched.growth_stage,
                growth_stage_recorded:    p.growth_stage_recorded    || null,

                // Progress
                progress_pct,
                progress_estimate:    enriched.progress_estimate,
                progress_is_estimate: enriched.progress_is_estimate,
                days_since_planting,
                total_days,
                days_left,

                // Lifecycle task completeness
                lifecycle_tasks_completed,
                lifecycle_tasks_total,

                // Operational activities
                activities: summary,

                // Alerts
                attention_needed:       enriched.attention_needed,
                overdue_activity_count: enriched.overdue_activity_count,
                alerts:                 enriched.alerts,

                status: p.status,
            };
        });

        // 5. Dashboard-level summary
        const byStage = {};
        let attentionCount = 0;
        for (const row of data) {
            const stage = row.growth_stage || 'Unknown';
            byStage[stage] = (byStage[stage] || 0) + 1;
            if (row.attention_needed) attentionCount++;
        }

        // Sort by lifecycle stage order
        const sorted = [...data].sort((a, b) => {
            const ai = STAGE_ORDER.indexOf(a.growth_stage);
            const bi = STAGE_ORDER.indexOf(b.growth_stage);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        res.status(200).json({
            data: sorted,
            summary: {
                total:            data.length,
                by_stage:         byStage,
                attention_needed: attentionCount,
            },
            today,
        });

    } catch (err) {
        console.error('getLifecycleMonitoring error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { getLifecycleMonitoring };
