#!/usr/bin/env node
'use strict';

/**
 * AgriTrack Evaluation synthetic dataset seeder (guarded + transactional).
 *
 * Default: DRY RUN (no writes).
 *
 * Authoritative Evaluation dry-run:
 *   node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval
 *
 * Execute (Evaluation only, single transaction):
 *   node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval --execute-evaluation-seed
 *
 * Replace proven seed only, then reseed:
 *   ... --execute-evaluation-seed --replace-evaluation-seed
 *
 * Rollback via latest/explicit manifest:
 *   ... --rollback-evaluation-seed
 *   ... --rollback-evaluation-seed --manifest=path/to/manifest.json
 */

const path = require('path');
const fs = require('fs');

process.chdir(path.join(__dirname, '..', '..'));

const {
    EVAL_DB_NAME,
    SEED_DATASET_ID,
    SYNTHETIC_MARKER,
    REFERENCE_DATE,
} = require('./constants');
const {
    ALL_CROPS,
    ACTIVE_CROP,
    FIELD_REGISTRY,
} = require('./datasetDefinition');
const { createConnection, getDatabaseName, assertEvaluationDatabase } = require('./dbGuard');
const { resolveAllCropVarieties } = require('./varietyResolve');
const {
    findFieldCollisions,
    classifyCollisions,
    getOwnerUserId,
    seedOneCrop,
    rollbackFromManifest,
    rollbackProvenSeedByMarker,
    clampGrowthDays,
} = require('./seedOperations');
const { expectedHarvestFromPlan } = require('../../utils/plantingDates');
const { writeSeedManifest, readSeedManifest, MANIFEST_DIR } = require('./manifest');
const {
    validateActiveCropDesign,
    validateActiveCropInDb,
} = require('./activeCropValidation');
const pool = require('../../config/db');

const parseArgs = (argv) => {
    const flags = new Set();
    let dbName = null;
    let manifestPath = null;
    for (const arg of argv) {
        if (arg.startsWith('--db-name=')) {
            dbName = arg.slice('--db-name='.length).trim();
        } else if (arg.startsWith('--manifest=')) {
            manifestPath = arg.slice('--manifest='.length).trim();
        } else if (arg.startsWith('--')) {
            flags.add(arg);
        }
    }
    return {
        execute: flags.has('--execute-evaluation-seed'),
        replace: flags.has('--replace-evaluation-seed'),
        rollback: flags.has('--rollback-evaluation-seed'),
        help: flags.has('--help') || flags.has('-h'),
        dbName,
        manifestPath,
    };
};

const printHelp = () => {
    console.log(`
AgriTrack Evaluation dataset seeder (${SEED_DATASET_ID})

Default: DRY RUN (no writes).

Authoritative Evaluation dry-run:
  node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=${EVAL_DB_NAME}

Execute (single transaction; Evaluation only):
  ... --db-name=${EVAL_DB_NAME} --execute-evaluation-seed

Replace ONLY proven synthetic seed rows, then reseed:
  ... --db-name=${EVAL_DB_NAME} --execute-evaluation-seed --replace-evaluation-seed

Rollback (prefers manifest IDs):
  ... --db-name=${EVAL_DB_NAME} --rollback-evaluation-seed
  ... --db-name=${EVAL_DB_NAME} --rollback-evaluation-seed --manifest=<path>

Manifests: ${MANIFEST_DIR}
Marker: "${SYNTHETIC_MARKER}"
`);
};

const buildDryRunPlan = (varietyMap) => ALL_CROPS.map((crop) => {
    const v = varietyMap.get(crop.key);
    const egd = clampGrowthDays(crop.expected_growth_days, v);
    const expectedHarvest = expectedHarvestFromPlan(crop.planting_date, egd, 0);
    return {
        key: crop.key,
        field_name: crop.field_name,
        status: crop.status === 'active' ? 'active' : 'completed',
        variety_id: v.variety_id,
        variety: v.variety,
        variety_class: v.variety_class,
        substituted: v.substituted,
        planting_date: crop.planting_date,
        expected_harvest: expectedHarvest,
        harvest_date: crop.harvest_date || null,
        yield_kg: crop.yield_kg || null,
        quality_grade: crop.quality_grade || null,
        financial_value: crop.financial_value || null,
        recent_7d: Boolean(crop.recent_7d),
        cropping_season: crop.cropping_season,
        establishment_method: crop.establishment_method,
        field_condition: crop.field_condition,
    };
});

const assertSchemaCompatibility = async (connection) => {
    const required = {
        plantings: [
            'field_name', 'variety_class', 'variety', 'variety_id', 'planting_date',
            'expected_harvest', 'season', 'cropping_season', 'establishment_method',
            'field_condition', 'lifecycle_state', 'expected_growth_days', 'status',
            'lifecycle_state_reason',
        ],
        activities: [
            'planting_id', 'activity_type', 'planned_date', 'actual_date', 'status',
            'notes', 'activity_source', 'lifecycle_template_index',
        ],
        harvests: [
            'planting_id', 'harvest_date', 'yield_kg', 'quality_grade',
            'financial_value', 'remarks',
        ],
        varieties: ['id', 'variety_class', 'name', 'min_growth_days', 'max_growth_days'],
    };
    const missing = [];
    for (const [table, cols] of Object.entries(required)) {
        const [rows] = await connection.query(
            `SELECT COLUMN_NAME AS name
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [table]
        );
        const have = new Set(rows.map((r) => r.name));
        for (const col of cols) {
            if (!have.has(col)) missing.push(`${table}.${col}`);
        }
    }
    if (missing.length) {
        throw new Error(`Schema/enum compatibility failure — missing columns: ${missing.join(', ')}`);
    }
    return { ok: true, checked_tables: Object.keys(required) };
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        process.exit(0);
    }

    if (args.execute && args.rollback) {
        throw new Error('Use either --execute-evaluation-seed or --rollback-evaluation-seed, not both.');
    }
    if (args.replace && !args.execute) {
        throw new Error('--replace-evaluation-seed requires --execute-evaluation-seed.');
    }

    const writeMode = args.execute || args.rollback;
    const connection = await createConnection(args.dbName);
    let exitCode = 0;

    try {
        const connectedDb = await getDatabaseName(connection);
        console.log(`[eval-seed] connected DATABASE()=${connectedDb}`);
        console.log(`[eval-seed] dataset=${SEED_DATASET_ID}`);
        console.log(`[eval-seed] reference_date=${REFERENCE_DATE}`);
        console.log(`[eval-seed] mode=${args.rollback ? 'ROLLBACK' : args.execute ? 'EXECUTE' : 'DRY_RUN'}`);

        // Authoritative Evaluation dry-run / any write: hard-require eval DB.
        if (writeMode || args.dbName === EVAL_DB_NAME || connectedDb === EVAL_DB_NAME) {
            await assertEvaluationDatabase(connection);
            console.log(`[eval-seed] hard-guard OK — DATABASE() is exactly ${EVAL_DB_NAME}`);
            if (!writeMode) {
                console.log('[eval-seed] AUTHORITATIVE Evaluation dry-run');
            }
        } else {
            console.warn(
                `[eval-seed] NON-AUTHORITATIVE dry-run on "${connectedDb}". `
                + `Re-run with --db-name=${EVAL_DB_NAME} before any write.`
            );
        }

        if (args.rollback) {
            await connection.beginTransaction();
            try {
                let result;
                if (args.manifestPath || fs.existsSync(path.join(MANIFEST_DIR, `${SEED_DATASET_ID}.latest.json`))) {
                    const { path: manifestPath, manifest } = readSeedManifest(args.manifestPath || null);
                    console.log(`[eval-seed] using manifest ${manifestPath}`);
                    result = await rollbackFromManifest(connection, manifest);
                } else {
                    console.warn('[eval-seed] no manifest found — falling back to marker-proven registry rows only');
                    result = await rollbackProvenSeedByMarker(connection);
                }
                await connection.commit();
                console.log('[eval-seed] rollback complete:', JSON.stringify(result, null, 2));
            } catch (err) {
                await connection.rollback();
                throw err;
            }
            return;
        }

        const schemaCheck = await assertSchemaCompatibility(connection);
        console.log('\n=== SCHEMA COMPATIBILITY ===');
        console.log(JSON.stringify(schemaCheck, null, 2));

        const designValidation = validateActiveCropDesign();
        console.log('\n=== ACTIVE CROP DESIGN VALIDATION ===');
        console.log(JSON.stringify(designValidation, null, 2));
        if (!designValidation.ok) {
            throw new Error(`ACTIVE crop design invalid: ${designValidation.issues.join('; ')}`);
        }

        const { results: varietyResults, substitutions } = await resolveAllCropVarieties(
            connection,
            ALL_CROPS
        );
        const varietyMap = new Map(varietyResults.map((r) => [r.key, r]));

        const collisionReport = classifyCollisions(await findFieldCollisions(connection));
        const plan = buildDryRunPlan(varietyMap);
        const recent7d = plan.filter((r) => r.recent_7d);
        const fieldsAbsent = FIELD_REGISTRY.filter(
            (name) => !collisionReport.collisions.some((c) => c.field_name === name)
        );

        console.log('\n=== VARIETY RESOLUTION (this DATABASE) ===');
        console.log(JSON.stringify(varietyResults, null, 2));
        console.log('\n=== SUBSTITUTIONS ===');
        console.log(substitutions.length ? JSON.stringify(substitutions, null, 2) : '(none)');

        console.log('\n=== FIELD COLLISION GUARD ===');
        console.log(JSON.stringify({
            target_fields: FIELD_REGISTRY.length,
            absent_fields: fieldsAbsent.length,
            collisions: collisionReport.collisions.length,
            seed_owned_collisions: collisionReport.seedOwned.length,
            foreign_collisions: collisionReport.foreign.length,
            foreign_details: collisionReport.foreign,
            all_target_fields_absent: fieldsAbsent.length === FIELD_REGISTRY.length,
        }, null, 2));

        console.log('\n=== 15 CROP PLAN ===');
        console.log(JSON.stringify(plan, null, 2));
        console.log('\n=== ACTIVE ACTIVITY TIMELINE ===');
        console.log(JSON.stringify(ACTIVE_CROP.activity_plan, null, 2));
        console.log('\n=== RECENT 7d HARVESTS ===');
        console.log(JSON.stringify(recent7d, null, 2));

        if (!args.execute) {
            console.log('\n[eval-seed] DRY RUN complete — no writes performed.');
            if (connectedDb === EVAL_DB_NAME) {
                console.log('[eval-seed] Evaluation dry-run was authoritative for this DATABASE().');
            }
            return;
        }

        // EXECUTE — refuse any field collision unless replace + all seed-owned
        if (collisionReport.hasForeign) {
            throw new Error(
                `REFUSING WRITE: ${collisionReport.foreign.length} target field(s) already exist `
                + 'with non-seed plantings. Will not overwrite foreign Evaluation data.'
            );
        }
        if (collisionReport.hasAny && !args.replace) {
            throw new Error(
                `REFUSING WRITE: ${collisionReport.collisions.length} target field(s) already exist. `
                + 'Use --replace-evaluation-seed only if those rows are proven synthetic seed records, '
                + 'or --rollback-evaluation-seed with a manifest.'
            );
        }

        await connection.beginTransaction();
        try {
            if (collisionReport.hasAny && args.replace) {
                if (!collisionReport.allSeedOwned) {
                    throw new Error('Replace refused — not all colliding rows are seed-owned.');
                }
                let rolled;
                try {
                    const { manifest } = readSeedManifest(args.manifestPath || null);
                    rolled = await rollbackFromManifest(connection, manifest);
                } catch {
                    rolled = await rollbackProvenSeedByMarker(connection);
                }
                console.log('[eval-seed] replaced prior synthetic dataset:', JSON.stringify(rolled));
            }

            const ownerId = await getOwnerUserId(connection);
            console.log(`[eval-seed] owner admin user_id=${ownerId}`);
            console.log('[eval-seed] atomicity: single transaction for all 15 crops '
                + '(ensureAllSystemTemplates uses the same connection)');

            const created = [];
            for (const crop of ALL_CROPS) {
                const variety = varietyMap.get(crop.key);
                const row = await seedOneCrop(connection, {
                    ownerId,
                    crop,
                    variety: {
                        variety_id: variety.variety_id,
                        variety_class: variety.variety_class,
                        variety: variety.variety,
                        min_growth_days: variety.min_growth_days,
                        max_growth_days: variety.max_growth_days,
                        default_expected_growth_days: variety.default_expected_growth_days,
                    },
                });
                created.push(row);
                console.log(`[eval-seed] seeded ${crop.key} planting#${row.plantingId} status=${row.status}`);
            }

            const active = created.find((c) => c.key === 'ACTIVE_01');
            const activeValidation = await validateActiveCropInDb(connection, active.plantingId);
            console.log('\n=== ACTIVE CROP DB VALIDATION ===');
            console.log(JSON.stringify(activeValidation, null, 2));
            if (!activeValidation.ok) {
                throw new Error(`ACTIVE crop validation failed: ${activeValidation.issues.join('; ')}`);
            }

            const executedAt = new Date().toISOString();
            const manifest = {
                database: EVAL_DB_NAME,
                seed_dataset_id: SEED_DATASET_ID,
                synthetic_marker: SYNTHETIC_MARKER,
                reference_date: REFERENCE_DATE,
                executed_at: executedAt,
                owner_user_id: ownerId,
                field_names: FIELD_REGISTRY.slice(),
                plantings: created.map((c) => ({
                    key: c.key,
                    planting_id: c.plantingId,
                    field_name: c.field_name,
                    status: c.status,
                    variety_id: c.variety_id,
                    variety: c.variety,
                    harvest_id: c.harvestId,
                    activity_ids: c.activityIds,
                })),
                harvests: created
                    .filter((c) => c.harvestId)
                    .map((c) => ({
                        key: c.key,
                        harvest_id: c.harvestId,
                        planting_id: c.plantingId,
                        harvest_date: c.harvest_date,
                    })),
                activity_ids: created.flatMap((c) => c.activityIds),
                planting_ids: created.map((c) => c.plantingId),
                active_validation: activeValidation,
            };

            // Commit DB first; then persist manifest. If manifest write fails, still
            // report IDs so operator can save them — DB seed remains valid.
            await connection.commit();

            const { filePath, latestPath } = writeSeedManifest(manifest);
            console.log(`\n[eval-seed] manifest written: ${filePath}`);
            console.log(`[eval-seed] latest pointer: ${latestPath}`);
            console.log('\n[eval-seed] EXECUTE complete:', JSON.stringify({
                created_count: created.length,
                harvested: created.filter((c) => c.status === 'completed').length,
                active: created.filter((c) => c.status === 'active').length,
                transaction: 'committed',
                atomicity: 'single_transaction',
            }, null, 2));
        } catch (err) {
            await connection.rollback();
            console.error('[eval-seed] transaction ROLLED BACK — no partial synthetic dataset retained');
            throw err;
        }
    } catch (err) {
        exitCode = 1;
        console.error('[eval-seed] FAILED:', err.message);
    } finally {
        try { await connection.end(); } catch { /* ignore */ }
        try {
            if (pool && typeof pool.end === 'function') await pool.end();
        } catch { /* ignore */ }
    }

    process.exit(exitCode);
};

main();
