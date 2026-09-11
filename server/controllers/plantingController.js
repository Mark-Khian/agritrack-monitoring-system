const db = require('../config/db');
const logActivity = require('../middleware/logger');
const {
    ensureAllSystemTemplates,
    generateTemplateIndices,
    rescheduleFutureSystemActivities,
    TEMPLATE_COUNT,
} = require('../utils/activityScheduler');
const { calendarDaysBetween, expectedHarvestFromPlan } = require('../utils/plantingDates');
const { ROLES } = require('../security/rbac');

const {
    loadPresentationContext,
    enrichPlantingRow,
} = require('../services/plantingPresentationService');
const {
    resolveVarietyForPlanting,
    findVarietyByClassAndName,
    countSystemGeneratedActivities,
} = require('../services/varietyService');
const {
    addClient,
    removeClient,
    broadcastPlantingsChanged,
} = require('../utils/plantingHub');

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
    plantings.cropping_season,
    plantings.establishment_method,
    plantings.field_condition,
    plantings.expected_stage,
    plantings.observed_stage,
    plantings.observed_stage_date,
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

/** Worker-visible current plantings only (operational + lifecycle). */
const WORKER_VISIBLE_LIFECYCLE_STATES = Object.freeze([
    'ACTIVE',
    'MATURING',
    'READY_FOR_HARVEST',
]);

const isWorkerVisiblePlanting = (planting) => (
    String(planting?.status || '').toLowerCase() === 'active'
    && WORKER_VISIBLE_LIFECYCLE_STATES.includes(planting?.lifecycle_state)
);

const toWorkerPlanting = (planting) => ({
    id: planting.id,
    field_name: planting.field_name,
    field_location: planting.field_location,
    field_size: planting.field_size,
    field_category: planting.field_category,
    variety: planting.variety,
    variety_class: planting.variety_class,
    variety_id: planting.variety_id,
    planting_date: planting.planting_date,
    expected_harvest: planting.expected_harvest,
    season: planting.season,
    cropping_season: planting.cropping_season,
    establishment_method: planting.establishment_method,
    field_condition: planting.field_condition,
    expected_stage: planting.expected_stage,
    observed_stage: planting.observed_stage,
    observed_stage_date: planting.observed_stage_date,
    growth_stage: planting.growth_stage,
    lifecycle_state: planting.lifecycle_state,
    expected_growth_days: planting.expected_growth_days,
    status: planting.status,
});

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

        const workerRead = req.user.role === ROLES.FARM_WORKER;
        // Workers: forced current-planting scope. Query status/lifecycle params cannot expand access.
        const effectiveStatus = workerRead ? 'active' : req.query.status;
        const statusFilter = effectiveStatus ? 'AND plantings.status = ?' : '';
        const workerLifecycleFilter = workerRead
            ? `AND plantings.lifecycle_state IN (${WORKER_VISIBLE_LIFECYCLE_STATES.map(() => '?').join(', ')})`
            : '';
        const varietyIdFilter = req.query.variety_id ? 'AND plantings.variety_id = ?' : '';
        const varietyClassFilter = req.query.variety_class
            ? 'AND plantings.variety_class = ?'
            : '';
        const varietyNullFilter = req.query.variety_null === '1' || req.query.variety_null === 'true'
            ? 'AND plantings.variety_id IS NULL'
            : '';

        const listParams = [];
        if (effectiveStatus) listParams.push(effectiveStatus);
        if (workerRead) listParams.push(...WORKER_VISIBLE_LIFECYCLE_STATES);
        if (req.query.variety_id) listParams.push(Number(req.query.variety_id));
        if (req.query.variety_class) listParams.push(String(req.query.variety_class).trim());
        listParams.push(limit, offset);

        const [plantings] = await db.query(
            `SELECT
                ${PLANTING_SELECT}
             ${PLANTING_JOINS}
             WHERE plantings.deleted_at IS NULL
               ${statusFilter}
               ${workerLifecycleFilter}
               ${varietyIdFilter}
               ${varietyClassFilter}
               ${varietyNullFilter}
             ORDER BY plantings.created_at DESC
             LIMIT ? OFFSET ?`,
            listParams
        );

        const countParams = [];
        if (effectiveStatus) countParams.push(effectiveStatus);
        if (workerRead) countParams.push(...WORKER_VISIBLE_LIFECYCLE_STATES);
        if (req.query.variety_id) countParams.push(Number(req.query.variety_id));
        if (req.query.variety_class) countParams.push(String(req.query.variety_class).trim());

        const countWhere = `${statusFilter} ${workerLifecycleFilter} ${varietyIdFilter} ${varietyClassFilter} ${varietyNullFilter}`;
        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) as total
             FROM plantings
             WHERE plantings.deleted_at IS NULL
               ${countWhere}`,
            countParams
        );

        const ids = plantings.map((p) => p.id);
        const ctx = await loadPresentationContext(db, ids);
        const enriched = plantings.map((p) => enrichPlantingRow(p, ctx));
        const data = workerRead ? enriched.map(toWorkerPlanting) : enriched;

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
        const workerRead = req.user.role === ROLES.FARM_WORKER;
        const [plantings] = await db.query(
            `SELECT
                ${PLANTING_SELECT}
             ${PLANTING_JOINS}
             WHERE plantings.id = ?
               AND plantings.deleted_at IS NULL`,
            [req.params.id]
        );
        if (
            plantings.length === 0
            || (workerRead && !isWorkerVisiblePlanting(plantings[0]))
        )
            return res.status(404).json({ message: 'Planting not found.' });

        const ctx = await loadPresentationContext(db, [plantings[0].id]);
        const enriched = enrichPlantingRow(plantings[0], ctx);
        const row = workerRead ? toWorkerPlanting(enriched) : enriched;

        res.status(200).json(row);
    } catch (err) {
        console.error('Get planting error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

const createPlanting = async (req, res) => {
    const {
        field_name, variety_class, variety, planting_date,
        cropping_season, establishment_method, field_condition
    } = req.body;
    const normalizedFieldName = (field_name || '').trim();
    const normalizedVarietyClass = (variety_class || '').trim();
    const normalizedVariety = (variety || '').trim();

    const lifecycleState = 'ACTIVE';

    const manualOverride = parseManualOverrideFlag(req.body.growth_plan_manual_override) === true;

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

        let pid;
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.query(
                `INSERT INTO plantings
             (user_id, field_name, variety_class, variety, variety_id, planting_date, expected_harvest, season,
              cropping_season, establishment_method, field_condition,
              lifecycle_state, expected_growth_days, adjustment_days, growth_plan_manual_override,
              lifecycle_state_changed_at, lifecycle_state_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
                req.user.id, // admin user_id preserved in DB for data integrity
                normalizedFieldName,
                normalizedVarietyClass,
                normalizedVariety,
                varietyIdToStore,
                planting_date,
                expectedHarvest,
                cropping_season === 'WET_SEASON' ? 'wet' : cropping_season === 'DRY_SEASON' ? 'dry' : null,
                cropping_season || null,
                establishment_method || null,
                field_condition || null,
                lifecycleState,
                expectedGrowthDays,
                adjustmentDays,
                manualOverride ? 1 : 0,
                'Created as active crop',
            ]
        );

            pid = result.insertId;

            await ensureAllSystemTemplates(pid, planting_date, expectedGrowthDays, connection);

            await connection.commit();
        } catch (txnErr) {
            await connection.rollback();
            throw txnErr;
        } finally {
            connection.release();
        }

        try {
            await logActivity.fromRequest(req, {
                action: 'CREATE_PLANTING',
                entity: 'plantings',
                entity_id: pid,
            });
            if (manualOverride) {
                await logActivity.fromRequest(req, {
                    action: 'PLANTING_GROWTH_MANUAL_OVERRIDE',
                    entity: 'plantings',
                    entity_id: pid,
                });
            }
        } catch (auditErr) {
            console.error('Audit log failed:', auditErr.message);
        }

        const msg = 'Planting created! System activities have been generated for this crop.';

        broadcastPlantingsChanged();
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
        cropping_season, establishment_method, field_condition,
        expected_stage, observed_stage, observed_stage_date
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
        // validateTransition is removed as lifecycle_state is now just a legacy compatibility column.
        if (lifecycle_state != null && lifecycle_state !== '') {
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

        // Ignore arbitrary status changes from generic update endpoint
        let nextStatus = cur.status;

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

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const effCroppingSeason = cropping_season !== undefined ? cropping_season : cur.cropping_season;
            const legacySeason = effCroppingSeason === 'WET_SEASON' ? 'wet' : effCroppingSeason === 'DRY_SEASON' ? 'dry' : null;

            const [result] = await connection.query(
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
                 status = ?,
                 season = ?,
                 cropping_season = ?, establishment_method = ?, field_condition = ?,
                 expected_stage = ?, observed_stage = ?, observed_stage_date = ?
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
                legacySeason,
                effCroppingSeason,
                establishment_method !== undefined ? establishment_method : cur.establishment_method,
                field_condition !== undefined ? field_condition : cur.field_condition,
                expected_stage !== undefined ? expected_stage : cur.expected_stage,
                observed_stage !== undefined ? observed_stage : cur.observed_stage,
                observed_stage_date !== undefined ? observed_stage_date : cur.observed_stage_date,
                req.params.id
            ]
        );
        if (result.affectedRows === 0) {
            await connection.rollback();
            // Do not release here, let finally handle it
            return res.status(404).json({ message: 'Planting not found.' });
        }

        if (activatedNow) {
            await ensureAllSystemTemplates(req.params.id, plantingDate, egd, connection);
        }

        if (partialIndices.length > 0) {
            await generateTemplateIndices(req.params.id, plantingDate, egd, partialIndices, undefined, undefined, connection);
        }

        if (growthPlanChanged && (await countSystemGeneratedActivities(req.params.id)) > 0) {
            await rescheduleFutureSystemActivities(req.params.id, plantingDate, egd, connection);
        }

        await connection.commit();
        } catch (txnErr) {
            await connection.rollback();
            throw txnErr;
        } finally {
            connection.release();
        }

        try {
            if (partialIndices.length > 0) {
                await logActivity.fromRequest(req, {
                    action: 'PLANTING_PARTIAL_ACTIVITIES',
                    entity: 'plantings',
                    entity_id: parseInt(req.params.id, 10),
                });
            }

            await logActivity.fromRequest(req, {
                action: 'UPDATE_PLANTING',
                entity: 'plantings',
                entity_id: parseInt(req.params.id, 10),
            });

            if (varietyChanged) {
                await logActivity.fromRequest(req, {
                    action: 'PLANTING_VARIETY_CHANGED',
                    entity: 'plantings',
                    entity_id: parseInt(req.params.id, 10),
                });
            }
            if (bodyMo !== undefined && bodyMo !== !!Number(cur.growth_plan_manual_override)) {
                await logActivity.fromRequest(req, {
                    action: bodyMo ? 'PLANTING_GROWTH_MANUAL_OVERRIDE_ON' : 'PLANTING_GROWTH_MANUAL_OVERRIDE_OFF',
                    entity: 'plantings',
                    entity_id: parseInt(req.params.id, 10),
                });
            }
        } catch (auditErr) {
            console.error('Audit log failed:', auditErr.message);
        }

        broadcastPlantingsChanged();
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

        await logActivity.fromRequest(req, {
            action: 'DELETE_PLANTING',
            entity: 'plantings',
            entity_id: parseInt(req.params.id, 10),
        });

        broadcastPlantingsChanged();
        res.status(200).json({ message: 'Planting deleted!' });
    } catch (err) {
        console.error('Delete planting error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

/**
 * GET /api/v1/plantings/events — SSE invalidation stream (Plantings only).
 */
const streamPlantingEvents = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    try {
        res.write(': connected\n\n');
    } catch {
        return;
    }

    addClient(res);

    const heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch {
            clearInterval(heartbeat);
            removeClient(res);
        }
    }, 25_000);

    const cleanup = () => {
        clearInterval(heartbeat);
        removeClient(res);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
};

module.exports = {
    getAllPlantings,
    getPlantingById,
    createPlanting,
    updatePlanting,
    deletePlanting,
    streamPlantingEvents,
};
