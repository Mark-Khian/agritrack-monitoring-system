const db = require('../config/db');
const logActivity = require('../middleware/logger');
const {
    ensureAllSystemTemplates,
    generateTemplateIndices,
    rescheduleFutureSystemActivities,
    TEMPLATE_COUNT,
} = require('../utils/activityScheduler');
const { calendarDaysBetween, expectedHarvestFromPlan } = require('../utils/plantingDates');
const { validateTransition } = require('../services/lifecycleTransitionService');
const {
    loadPresentationContext,
    enrichPlantingRow,
} = require('../services/plantingPresentationService');
const {
    resolveVarietyForPlanting,
    findVarietyByClassAndName,
    countSystemGeneratedActivities,
} = require('../services/varietyService');

const VARIETY_MAP = {
    'Irrigated / Lowland Varieties': [
        'NSIC Rc110', 'Rc118', 'Rc120', 'Rc128', 'Rc130', 'Rc134', 'Rc160', 'Rc172', 'Rc194',
        'NSIC Rc212', 'Rc214', 'Rc216', 'Rc218 SR', 'Rc220 SR', 'Rc222',
        'NSIC Rc224', 'Rc226', 'Rc238', 'Rc240', 'Rc242 SR', 'Rc298', 'Rc300',
        'NSIC Rc396', 'Rc398', 'Rc414', 'Rc482SR', 'Rc484SR', 'Rc508', 'Rc510',
        'PSB RC1', 'RC2', 'RC4', 'RC6', 'RC8', 'RC10', 'RC18'
    ],
    'Rainfed / Dry-Seeded Varieties (DSR)': [
        'NSIC 2020 Rc598', 'Rc596', 'Rc594', 'Rc592',
        'NSIC 2011 Rc278'
    ],
    'Upland Varieties': [
        'NSIC Rc29', 'Rc27', 'Rc25',
        'NSIC Rc286', 'RC9', 'RC11',
        'PSB RC3', 'RC5', 'RC7'
    ]
};

const isValidVarietyCombination = (varietyClass, variety) => {
    const varieties = VARIETY_MAP[varietyClass];
    if (!Array.isArray(varieties)) return false;
    return varieties.includes(variety);
};

const parseManualOverrideFlag = (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    return v === true || v === 'true' || v === 1 || v === '1';
};

const normalizeTemplateIndices = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return [
        ...new Set(
            raw
                .map((x) => Number(x))
                .filter((i) => Number.isInteger(i) && i >= 0 && i < TEMPLATE_COUNT)
        ),
    ].sort((a, b) => a - b);
};

const PLANTING_SELECT = `
    plantings.user_id,
    plantings.field_name,
    plantings.field_location,
    plantings.field_size,
    plantings.field_category,
    plantings.id,
    plantings.variety_class,
    plantings.variety,
    plantings.variety_id,
    plantings.planting_date,
    plantings.expected_harvest,
    plantings.season,
    plantings.lifecycle_state,
    plantings.expected_growth_days,
    plantings.adjustment_days,
    plantings.growth_plan_manual_override,
    plantings.lifecycle_state_changed_at,
    plantings.lifecycle_state_reason,
    plantings.growth_stage_recorded,
    plantings.growth_stage_source,
    plantings.status,
    plantings.created_at,
    v.default_expected_growth_days AS variety_default_expected_growth_days,
    v.min_growth_days AS variety_min_growth_days,
    v.max_growth_days AS variety_max_growth_days
`;

const PLANTING_JOINS = `
    FROM plantings
    LEFT JOIN varieties v ON plantings.variety_id = v.id
`;

/**
 * Growth plan: expected_harvest = planting_date + expected_growth_days + adjustment_days.
 */
const buildGrowthPlan = (input, varietyRow) => {
    const plantingDate = input.planting_date;
    const adj = Number(input.adjustment_days) || 0;

    let expectedGrowthDays;
    if (input._useVarietyDefaultGrowthDays && varietyRow) {
        expectedGrowthDays = varietyRow.default_expected_growth_days;
    } else if (input.expected_growth_days != null && input.expected_growth_days !== '') {
        expectedGrowthDays = Math.max(1, parseInt(input.expected_growth_days, 10));
    } else if (input.expected_harvest) {
        const span = calendarDaysBetween(plantingDate, input.expected_harvest);
        expectedGrowthDays = Math.max(1, span - adj);
    } else if (input._fallback_egd != null && input._fallback_egd !== '') {
        expectedGrowthDays = Math.max(1, parseInt(input._fallback_egd, 10));
    } else if (varietyRow) {
        expectedGrowthDays = varietyRow.default_expected_growth_days;
    } else {
        expectedGrowthDays = 120;
    }

    if (varietyRow) {
        if (
            expectedGrowthDays < varietyRow.min_growth_days ||
            expectedGrowthDays > varietyRow.max_growth_days
        ) {
            return {
                error: `expected_growth_days must be between ${varietyRow.min_growth_days} and ${varietyRow.max_growth_days} for this variety (catalog).`,
            };
        }
    }

    const expectedHarvest = expectedHarvestFromPlan(plantingDate, expectedGrowthDays, adj);
    return { expectedGrowthDays, adjustmentDays: adj, expectedHarvest };
};

const getAllPlantings = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const statusFilter = req.query.status ? 'AND plantings.status = ?' : '';
        const varietyIdFilter = req.query.variety_id ? 'AND plantings.variety_id = ?' : '';
        const varietyClassFilter = req.query.variety_class
            ? 'AND plantings.variety_class = ?'
            : '';
        const varietyNullFilter = req.query.variety_null === '1' || req.query.variety_null === 'true'
            ? 'AND plantings.variety_id IS NULL'
            : '';

        const listParams = [];
        if (req.query.status) listParams.push(req.query.status);
        if (req.query.variety_id) listParams.push(Number(req.query.variety_id));
        if (req.query.variety_class) listParams.push(String(req.query.variety_class).trim());
        listParams.push(limit, offset);

        const [plantings] = await db.query(
            `SELECT
                ${PLANTING_SELECT}
             ${PLANTING_JOINS}
             WHERE plantings.deleted_at IS NULL
               ${statusFilter}
               ${varietyIdFilter}
               ${varietyClassFilter}
               ${varietyNullFilter}
             ORDER BY plantings.created_at DESC
             LIMIT ? OFFSET ?`,
            listParams
        );

        const countParams = [];
        if (req.query.status) countParams.push(req.query.status);
        if (req.query.variety_id) countParams.push(Number(req.query.variety_id));
        if (req.query.variety_class) countParams.push(String(req.query.variety_class).trim());

        const countWhere = `${statusFilter} ${varietyIdFilter} ${varietyClassFilter} ${varietyNullFilter}`;
        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) as total
             FROM plantings
             WHERE plantings.deleted_at IS NULL
               ${countWhere}`,
            countParams
        );

        const ids = plantings.map((p) => p.id);
        const ctx = await loadPresentationContext(db, ids);
        const data = plantings.map((p) => enrichPlantingRow(p, ctx));

        res.status(200).json({
            data,
            meta: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Get plantings error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const getPlantingById = async (req, res) => {
    try {
        const [plantings] = await db.query(
            `SELECT
                ${PLANTING_SELECT}
             ${PLANTING_JOINS}
             WHERE plantings.id = ?
               AND plantings.deleted_at IS NULL`,
            [req.params.id]
        );
        if (plantings.length === 0)
            return res.status(404).json({ message: 'Planting not found.' });

        const ctx = await loadPresentationContext(db, [plantings[0].id]);
        const row = enrichPlantingRow(plantings[0], ctx);

        res.status(200).json(row);
    } catch (err) {
        console.error('Get planting error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const createPlanting = async (req, res) => {
    const {
        field_name, variety_class, variety, planting_date, season
    } = req.body;
    const normalizedFieldName = (field_name || '').trim();
    const normalizedVarietyClass = (variety_class || '').trim();
    const normalizedVariety = (variety || '').trim();

    const lifecycleState =
        req.body.lifecycle_state === 'PLANNED' ? 'PLANNED' : 'ACTIVE';

    const manualOverride = parseManualOverrideFlag(req.body.growth_plan_manual_override) === true;
    const partialIndices = normalizeTemplateIndices(req.body.generate_template_indices || []);

    try {
        if (!normalizedFieldName) {
            return res.status(400).json({ message: 'Field name is required.' });
        }
        if (!normalizedVarietyClass) {
            return res.status(400).json({ message: 'Variety class is required.' });
        }
        if (!normalizedVariety) {
            return res.status(400).json({ message: 'Rice variety is required.' });
        }
        if (!isValidVarietyCombination(normalizedVarietyClass, normalizedVariety)) {
            return res.status(400).json({ message: 'Invalid rice variety for selected class.' });
        }

        const { row: varietyRow, error: vErr } = await resolveVarietyForPlanting({
            variety_id: req.body.variety_id,
            variety_class: normalizedVarietyClass,
            variety: normalizedVariety,
        });
        if (vErr) return res.status(400).json({ message: vErr });

        const plan = buildGrowthPlan(
            {
                planting_date,
                expected_growth_days: req.body.expected_growth_days,
                adjustment_days: req.body.adjustment_days,
                expected_harvest: req.body.expected_harvest,
                _fallback_egd: null,
            },
            varietyRow
        );
        if (plan.error) return res.status(400).json({ message: plan.error });

        const { expectedGrowthDays, adjustmentDays, expectedHarvest } = plan;
        const varietyIdToStore = varietyRow ? varietyRow.id : null;

        const [sameDate] = await db.query(
            `SELECT id FROM plantings
             WHERE field_name = ?
               AND planting_date = ?
               AND deleted_at IS NULL`,
            [normalizedFieldName, planting_date]
        );
        if (sameDate.length > 0) {
            return res.status(409).json({
                message:
                    'A planting for this field name on this planting date already exists. Use a different date or edit the existing record.',
            });
        }

        const [active] = await db.query(
            `SELECT id FROM plantings
             WHERE field_name = ?
               AND status = 'active'
               AND deleted_at IS NULL`,
            [normalizedFieldName]
        );
        if (active.length > 0)
            return res.status(409).json({
                message: 'This field already has an active planting.'
            });

        const [result] = await db.query(
            `INSERT INTO plantings
             (user_id, field_name, variety_class, variety, variety_id, planting_date, expected_harvest, season,
              lifecycle_state, expected_growth_days, adjustment_days, growth_plan_manual_override,
              lifecycle_state_changed_at, lifecycle_state_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
                req.user.id, // admin user_id preserved in DB for data integrity
                normalizedFieldName,
                normalizedVarietyClass,
                normalizedVariety,
                varietyIdToStore,
                planting_date,
                expectedHarvest,
                season,
                lifecycleState,
                expectedGrowthDays,
                adjustmentDays,
                manualOverride ? 1 : 0,
                lifecycleState === 'PLANNED' ? 'Created as planned' : 'Created as active crop',
            ]
        );

        const pid = result.insertId;

        if (lifecycleState === 'ACTIVE') {
            await ensureAllSystemTemplates(pid, planting_date, expectedGrowthDays);
        } else if (partialIndices.length > 0) {
            await generateTemplateIndices(pid, planting_date, expectedGrowthDays, partialIndices);
        }

        await logActivity({
            user_id: req.user.id,
            action: 'CREATE_PLANTING',
            entity: 'plantings',
            entity_id: pid,
            ip_address: req.ip
        });
        if (manualOverride) {
            await logActivity({
                user_id: req.user.id,
                action: 'PLANTING_GROWTH_MANUAL_OVERRIDE',
                entity: 'plantings',
                entity_id: pid,
                ip_address: req.ip
            });
        }
        if (partialIndices.length > 0) {
            await logActivity({
                user_id: req.user.id,
                action: 'PLANTING_PARTIAL_ACTIVITIES',
                entity: 'plantings',
                entity_id: pid,
                ip_address: req.ip
            });
        }

        const msg =
            lifecycleState === 'PLANNED'
                ? (partialIndices.length
                    ? 'Planting created as planned with selected system activities.'
                    : 'Planting created as planned. Activate the crop to generate all system activities.')
                : 'Planting created! System activities have been ensured for this crop.';

        res.status(201).json({
            message: msg,
            plantingId: pid
        });
    } catch (err) {
        console.error('Create planting error:', err.message);
        if (err.code === 'ER_DUP_ENTRY' && String(err.message || '').includes('uq_field_planting')) {
            return res.status(409).json({
                message:
                    'A planting for this field on this planting date already exists. Use a different date or edit the existing record.',
            });
        }
        if (err.code === 'ER_DUP_ENTRY' && String(err.message || '').includes('uq_user_field_planting')) {
            return res.status(409).json({
                message:
                    'A planting for this field name on this planting date already exists. Use a different date or edit the existing record.',
            });
        }
        res.status(500).json({ message: 'Server error.' });
    }
};

const updatePlanting = async (req, res) => {
    const {
        field_name,
        variety_class, variety, status,
        expected_growth_days, adjustment_days, expected_harvest,
        lifecycle_state, lifecycle_state_reason,
        growth_stage_recorded, growth_stage_source,
        planting_date: bodyPlantingDate,
        variety_id: bodyVarietyId,
    } = req.body;
    const normalizedVarietyClass = (variety_class || '').trim();
    const normalizedVariety = (variety || '').trim();

    const partialIndices = normalizeTemplateIndices(req.body.generate_template_indices || []);

    try {
        const [currentRows] = await db.query(
            `SELECT plantings.* FROM plantings
             WHERE plantings.id = ? AND plantings.deleted_at IS NULL`,
            [req.params.id]
        );
        if (currentRows.length === 0) {
            return res.status(404).json({ message: 'Planting not found.' });
        }

        const cur = currentRows[0];

        const nextFieldName =
            field_name != null && String(field_name).trim() !== ''
                ? String(field_name).trim()
                : cur.field_name;
        if (!nextFieldName) {
            return res.status(400).json({ message: 'Field name is required.' });
        }

        if (cur.lifecycle_state === 'HARVESTED' || cur.status === 'completed') {
            return res.status(400).json({
                message: 'Harvested plantings are read-only except for analytics exports.'
            });
        }
        if (cur.lifecycle_state === 'ABANDONED') {
            return res.status(400).json({ message: 'Abandoned plantings cannot be updated.' });
        }

        const finalVarietyClass = normalizedVarietyClass || cur.variety_class;
        const finalVariety = normalizedVariety || cur.variety;

        if (!finalVarietyClass || !finalVariety) {
            return res.status(400).json({ message: 'Variety class and rice variety are required.' });
        }
        if (!isValidVarietyCombination(finalVarietyClass, finalVariety)) {
            return res.status(400).json({ message: 'Invalid rice variety for selected class.' });
        }

        let nextVarietyId = cur.variety_id != null ? Number(cur.variety_id) : null;
        if (bodyVarietyId != null && bodyVarietyId !== '') {
            nextVarietyId = Number(bodyVarietyId);
        } else if (
            finalVarietyClass !== cur.variety_class ||
            finalVariety !== cur.variety
        ) {
            const matched = await findVarietyByClassAndName(finalVarietyClass, finalVariety);
            nextVarietyId = matched ? matched.id : null;
        }

        const varietyChanged =
            finalVarietyClass !== cur.variety_class ||
            finalVariety !== cur.variety ||
            Number(nextVarietyId || 0) !== Number(cur.variety_id || 0);

        const { row: varietyRow, error: vErr } = await resolveVarietyForPlanting({
            variety_id: nextVarietyId || undefined,
            variety_class: finalVarietyClass,
            variety: finalVariety,
        });
        if (vErr) return res.status(400).json({ message: vErr });

        let nextManualOverride = !!Number(cur.growth_plan_manual_override);
        const bodyMo = parseManualOverrideFlag(req.body.growth_plan_manual_override);
        if (bodyMo !== undefined) {
            nextManualOverride = bodyMo;
        }

        let nextLifecycle = cur.lifecycle_state || 'ACTIVE';
        if (lifecycle_state != null && lifecycle_state !== '') {
            const v = validateTransition(cur.lifecycle_state || 'ACTIVE', lifecycle_state);
            if (!v.ok) return res.status(400).json({ message: v.message });
            nextLifecycle = lifecycle_state;
        }

        const plantingDate = bodyPlantingDate || cur.planting_date;
        const adjInput =
            adjustment_days != null && adjustment_days !== ''
                ? Number(adjustment_days)
                : Number(cur.adjustment_days || 0);

        const useVarietyDefault =
            varietyChanged && !Number(cur.growth_plan_manual_override);

        const plan = buildGrowthPlan(
            {
                planting_date: plantingDate,
                expected_growth_days,
                adjustment_days: adjInput,
                expected_harvest,
                _fallback_egd: cur.expected_growth_days,
                _useVarietyDefaultGrowthDays: useVarietyDefault,
            },
            varietyRow
        );
        if (plan.error) return res.status(400).json({ message: plan.error });

        const { expectedGrowthDays: egd, adjustmentDays: adjOut, expectedHarvest: nextExpectedHarvest } = plan;

        const growthPlanChanged =
            plantingDate !== cur.planting_date ||
            egd !== Number(cur.expected_growth_days) ||
            adjOut !== Number(cur.adjustment_days || 0) ||
            varietyChanged;

        let nextStatus = status != null && status !== '' ? status : cur.status;
        if (nextLifecycle === 'ABANDONED') {
            nextStatus = 'failed';
        }

        const lsChanged = nextLifecycle !== cur.lifecycle_state;
        const activatedNow =
            (cur.lifecycle_state === 'PLANNED' && nextLifecycle === 'ACTIVE');

        let gsrVal = cur.growth_stage_recorded;
        if (growth_stage_recorded !== undefined) {
            gsrVal = growth_stage_recorded === '' ? null : growth_stage_recorded;
        }
        const gss =
            growth_stage_source != null && growth_stage_source !== ''
                ? growth_stage_source
                : cur.growth_stage_source || 'system_estimate';

        let lsReason = cur.lifecycle_state_reason;
        if (lifecycle_state_reason !== undefined) {
            lsReason = lifecycle_state_reason === '' ? null : lifecycle_state_reason;
        }

        const [result] = await db.query(
            `UPDATE plantings
             SET field_name = ?,
                 variety_class = ?, variety = ?, variety_id = ?,
                 planting_date = ?,
                 expected_harvest = ?,
                 expected_growth_days = ?, adjustment_days = ?,
                 growth_plan_manual_override = ?,
                 lifecycle_state = ?,
                 lifecycle_state_changed_at = IF(?, NOW(), lifecycle_state_changed_at),
                 lifecycle_state_reason = ?,
                 growth_stage_recorded = ?,
                 growth_stage_source = ?,
                 status = ?
             WHERE id = ? AND deleted_at IS NULL`,
            [
                nextFieldName,
                finalVarietyClass,
                finalVariety,
                nextVarietyId || null,
                plantingDate,
                nextExpectedHarvest,
                egd,
                adjOut,
                nextManualOverride ? 1 : 0,
                nextLifecycle,
                lsChanged ? 1 : 0,
                lsReason,
                gsrVal,
                gss,
                nextStatus,
                req.params.id
            ]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Planting not found.' });

        if (activatedNow) {
            await ensureAllSystemTemplates(req.params.id, plantingDate, egd);
        }

        if (partialIndices.length > 0) {
            await generateTemplateIndices(req.params.id, plantingDate, egd, partialIndices);
            await logActivity({
                user_id: req.user.id,
                action: 'PLANTING_PARTIAL_ACTIVITIES',
                entity: 'plantings',
                entity_id: parseInt(req.params.id, 10),
                ip_address: req.ip
            });
        }

        if (growthPlanChanged && (await countSystemGeneratedActivities(req.params.id)) > 0) {
            await rescheduleFutureSystemActivities(req.params.id, plantingDate, egd);
        }

        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_PLANTING',
            entity: 'plantings',
            entity_id: parseInt(req.params.id, 10),
            ip_address: req.ip
        });

        if (varietyChanged) {
            await logActivity({
                user_id: req.user.id,
                action: 'PLANTING_VARIETY_CHANGED',
                entity: 'plantings',
                entity_id: parseInt(req.params.id, 10),
                ip_address: req.ip
            });
        }
        if (bodyMo !== undefined && bodyMo !== !!Number(cur.growth_plan_manual_override)) {
            await logActivity({
                user_id: req.user.id,
                action: bodyMo ? 'PLANTING_GROWTH_MANUAL_OVERRIDE_ON' : 'PLANTING_GROWTH_MANUAL_OVERRIDE_OFF',
                entity: 'plantings',
                entity_id: parseInt(req.params.id, 10),
                ip_address: req.ip
            });
        }

        res.status(200).json({ message: 'Planting updated!' });
    } catch (err) {
        console.error('Update planting error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const deletePlanting = async (req, res) => {
    try {
        const [result] = await db.query(
            `UPDATE plantings
             SET deleted_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Planting not found.' });

        await logActivity({
            user_id: req.user.id,
            action: 'DELETE_PLANTING',
            entity: 'plantings',
            entity_id: parseInt(req.params.id, 10),
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Planting deleted!' });
    } catch (err) {
        console.error('Delete planting error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = {
    getAllPlantings,
    getPlantingById,
    createPlanting,
    updatePlanting,
    deletePlanting
};
