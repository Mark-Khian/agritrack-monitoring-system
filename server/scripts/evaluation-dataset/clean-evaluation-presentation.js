#!/usr/bin/env node
'use strict';

/**
 * AgriTrack Evaluation presentation cleanup (guarded + transactional).
 *
 * Cleans user-facing harvest remarks + synthetic activity-note suffixes only.
 * Does NOT reseed. Does NOT touch Production.
 *
 * Default: DRY RUN (no writes).
 *
 * Dry-run:
 *   node scripts/evaluation-dataset/clean-evaluation-presentation.js --db-name=crop_management_eval
 *
 * Execute (requires BOTH flags):
 *   node scripts/evaluation-dataset/clean-evaluation-presentation.js \
 *     --db-name=crop_management_eval \
 *     --execute-evaluation-cleanup
 */

const path = require('path');
const fs = require('fs');

process.chdir(path.join(__dirname, '..', '..'));

const { EVAL_DB_NAME, SEED_DATASET_ID } = require('./constants');
const { createConnection, getDatabaseName, assertEvaluationDatabase } = require('./dbGuard');
const { readSeedManifest, MANIFEST_DIR, LATEST_MANIFEST_NAME } = require('./manifest');
const { isSeedOwnershipProven } = require('./seedOwnership');
const {
    remarkForHarvestCleanup,
    stripSyntheticActivityNoteSuffix,
    remarksContainForbiddenToken,
    activityNotesContainSynthetic,
    SYNTHETIC_ACTIVITY_NOTE_SUFFIX,
} = require('./presentationCleanup');

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
        execute: flags.has('--execute-evaluation-cleanup'),
        help: flags.has('--help') || flags.has('-h'),
        dbName,
        manifestPath,
    };
};

const printHelp = () => {
    console.log(`
AgriTrack Evaluation presentation cleanup (${SEED_DATASET_ID})

Default: DRY RUN (no writes).

Dry-run:
  node scripts/evaluation-dataset/clean-evaluation-presentation.js --db-name=${EVAL_DB_NAME}

Execute (both flags required):
  ... --db-name=${EVAL_DB_NAME} --execute-evaluation-cleanup

Manifest default:
  ${path.join(MANIFEST_DIR, LATEST_MANIFEST_NAME)}
`);
};

const loadManifestOrThrow = (explicitPath) => {
    const { path: manifestPath, manifest } = readSeedManifest(explicitPath || null);
    if (manifest.seed_dataset_id !== SEED_DATASET_ID) {
        throw new Error(
            `Manifest seed_dataset_id "${manifest.seed_dataset_id}" !== ${SEED_DATASET_ID}`
        );
    }
    return { manifestPath, manifest };
};

const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    if (args.execute) {
        if (args.dbName !== EVAL_DB_NAME) {
            throw new Error(
                `REFUSING WRITE: --execute-evaluation-cleanup requires --db-name=${EVAL_DB_NAME} `
                + `(got "${args.dbName || ''}").`
            );
        }
    }

    const connection = await createConnection(args.dbName || undefined);
    let committed = false;

    try {
        const dbName = await getDatabaseName(connection);
        console.log(`[eval-cleanup] SELECT DATABASE() = ${dbName}`);

        if (args.execute || args.dbName === EVAL_DB_NAME) {
            await assertEvaluationDatabase(connection);
            console.log(`[eval-cleanup] hard-guard OK — DATABASE() is exactly ${EVAL_DB_NAME}`);
        } else if (dbName !== EVAL_DB_NAME) {
            console.log(
                `[eval-cleanup] dry-run connected to "${dbName}" (non-authoritative). `
                + `Re-run with --db-name=${EVAL_DB_NAME} for Evaluation dry-run.`
            );
        }

        const { manifestPath, manifest } = loadManifestOrThrow(args.manifestPath);
        console.log(`[eval-cleanup] manifest=${manifestPath}`);
        console.log(`[eval-cleanup] dataset=${manifest.seed_dataset_id}`);
        console.log(`[eval-cleanup] mode=${args.execute ? 'EXECUTE' : 'DRY_RUN'}`);

        const plantingEntries = manifest.plantings || [];
        const harvestEntries = (manifest.harvests || []).filter((h) => h.harvest_id);
        const plantingIds = plantingEntries.map((p) => p.planting_id);
        const harvestIds = harvestEntries.map((h) => h.harvest_id);
        let activityIds = Array.isArray(manifest.activity_ids)
            ? [...manifest.activity_ids]
            : [];

        if (!plantingIds.length) {
            throw new Error('Manifest contains no planting IDs.');
        }
        if (harvestIds.length !== 14) {
            throw new Error(
                `Expected exactly 14 manifest harvest IDs, found ${harvestIds.length}.`
            );
        }

        // Ownership proof for every planting in the manifest
        const ph = plantingIds.map(() => '?').join(',');
        const [plantingRows] = await connection.query(
            `SELECT id, field_name, lifecycle_state_reason, status, lifecycle_state
             FROM plantings
             WHERE id IN (${ph})`,
            plantingIds
        );
        const plantingById = new Map(plantingRows.map((r) => [r.id, r]));
        for (const entry of plantingEntries) {
            const row = plantingById.get(entry.planting_id);
            if (!row) {
                throw new Error(`Manifest planting #${entry.planting_id} not found — aborting.`);
            }
            if (entry.field_name && row.field_name !== entry.field_name) {
                throw new Error(
                    `Planting #${entry.planting_id} field_name mismatch `
                    + `(db="${row.field_name}" expected="${entry.field_name}") — aborting.`
                );
            }
            if (!isSeedOwnershipProven(row.lifecycle_state_reason, '')) {
                throw new Error(
                    `Planting #${entry.planting_id} failed lifecycle ownership proof — aborting.`
                );
            }
            if (!String(row.lifecycle_state_reason || '').includes(SEED_DATASET_ID)) {
                throw new Error(
                    `Planting #${entry.planting_id} lifecycle_state_reason missing ${SEED_DATASET_ID} — aborting.`
                );
            }
        }
        console.log(`[eval-cleanup] ownership OK for ${plantingEntries.length} plantings`);

        if (!activityIds.length) {
            const [actRows] = await connection.query(
                `SELECT id FROM activities
                 WHERE planting_id IN (${ph}) AND deleted_at IS NULL`,
                plantingIds
            );
            activityIds = actRows.map((r) => r.id);
        }

        // Harvests: exact IDs only
        const hh = harvestIds.map(() => '?').join(',');
        const [harvestRows] = await connection.query(
            `SELECT h.id, h.planting_id, h.harvest_date, h.yield_kg, h.quality_grade,
                    h.financial_value, h.remarks, p.lifecycle_state_reason
             FROM harvests h
             INNER JOIN plantings p ON p.id = h.planting_id
             WHERE h.id IN (${hh}) AND h.deleted_at IS NULL`,
            harvestIds
        );
        if (harvestRows.length !== 14) {
            throw new Error(
                `Expected 14 live harvest rows for manifest IDs, found ${harvestRows.length}.`
            );
        }
        for (const h of harvestRows) {
            if (!isSeedOwnershipProven(h.lifecycle_state_reason, '')) {
                throw new Error(`Harvest #${h.id} planting failed ownership proof — aborting.`);
            }
        }

        const harvestPlans = harvestRows.map((h) => {
            const nextRemarks = remarkForHarvestCleanup(h.quality_grade);
            return {
                id: h.id,
                planting_id: h.planting_id,
                quality_grade: h.quality_grade,
                before: h.remarks,
                after: nextRemarks,
                yield_kg: h.yield_kg,
                financial_value: h.financial_value,
                harvest_date: h.harvest_date,
                will_change: String(h.remarks || '') !== nextRemarks,
            };
        });

        // Activities: strip synthetic suffix only
        let activityRows = [];
        if (activityIds.length) {
            const ah = activityIds.map(() => '?').join(',');
            const [rows] = await connection.query(
                `SELECT a.id, a.planting_id, a.activity_type, a.status, a.planned_date,
                        a.actual_date, a.notes, p.lifecycle_state_reason
                 FROM activities a
                 INNER JOIN plantings p ON p.id = a.planting_id
                 WHERE a.id IN (${ah}) AND a.deleted_at IS NULL`,
                activityIds
            );
            activityRows = rows;
        }

        const activityPlans = [];
        for (const a of activityRows) {
            if (!isSeedOwnershipProven(a.lifecycle_state_reason, '')) {
                throw new Error(`Activity #${a.id} planting failed ownership proof — aborting.`);
            }
            if (!activityNotesContainSynthetic(a.notes)) continue;
            const stripped = stripSyntheticActivityNoteSuffix(a.notes);
            if (!stripped.changed) continue;
            activityPlans.push({
                id: a.id,
                planting_id: a.planting_id,
                activity_type: a.activity_type,
                status: a.status,
                planned_date: a.planned_date,
                actual_date: a.actual_date,
                before: a.notes,
                after: stripped.notes,
            });
        }

        console.log(`[eval-cleanup] harvests to update: ${harvestPlans.filter((p) => p.will_change).length}/${harvestPlans.length}`);
        console.log(`[eval-cleanup] activity notes to clean: ${activityPlans.length}`);
        console.log(`[eval-cleanup] synthetic suffix: "${SYNTHETIC_ACTIVITY_NOTE_SUFFIX}"`);

        if (!args.execute) {
            console.log('[eval-cleanup] DRY RUN — no writes. Sample harvest plans:');
            for (const p of harvestPlans.slice(0, 3)) {
                console.log(JSON.stringify({
                    harvest_id: p.id,
                    grade: p.quality_grade,
                    before: p.before,
                    after: p.after,
                }, null, 2));
            }
            if (activityPlans.length) {
                console.log('[eval-cleanup] Sample activity note clean:');
                console.log(JSON.stringify({
                    activity_id: activityPlans[0].id,
                    before: activityPlans[0].before,
                    after: activityPlans[0].after,
                }, null, 2));
            }
            console.log('[eval-cleanup] Re-run with --execute-evaluation-cleanup to apply.');
            return;
        }

        await connection.beginTransaction();
        try {
            for (const p of harvestPlans) {
                await connection.query(
                    `UPDATE harvests SET remarks = ? WHERE id = ? AND deleted_at IS NULL`,
                    [p.after, p.id]
                );
            }
            for (const a of activityPlans) {
                await connection.query(
                    `UPDATE activities SET notes = ? WHERE id = ? AND deleted_at IS NULL`,
                    [a.after, a.id]
                );
            }

            // Post-write validation inside transaction
            const [harvestAfter] = await connection.query(
                `SELECT h.id, h.remarks, h.yield_kg, h.quality_grade, h.financial_value,
                        h.harvest_date, p.lifecycle_state_reason
                 FROM harvests h
                 INNER JOIN plantings p ON p.id = h.planting_id
                 WHERE h.id IN (${hh}) AND h.deleted_at IS NULL`,
                harvestIds
            );
            if (harvestAfter.length !== 14) {
                throw new Error(`Post-check: expected 14 harvests, found ${harvestAfter.length}`);
            }
            for (const h of harvestAfter) {
                if (remarksContainForbiddenToken(h.remarks)) {
                    throw new Error(`Post-check: harvest #${h.id} remarks still contain forbidden tokens.`);
                }
                if (!String(h.lifecycle_state_reason || '').includes(SEED_DATASET_ID)) {
                    throw new Error(`Post-check: planting ownership marker missing for harvest #${h.id}`);
                }
                const before = harvestPlans.find((p) => p.id === h.id);
                if (!before) throw new Error(`Post-check: missing plan for harvest #${h.id}`);
                if (Number(h.yield_kg) !== Number(before.yield_kg)
                    || String(h.quality_grade) !== String(before.quality_grade)
                    || String(h.financial_value) !== String(before.financial_value)
                    || String(h.harvest_date).slice(0, 10) !== String(before.harvest_date).slice(0, 10)) {
                    throw new Error(`Post-check: harvest #${h.id} non-remarks fields changed — aborting.`);
                }
            }

            if (activityPlans.length) {
                const ids = activityPlans.map((a) => a.id);
                const aph = ids.map(() => '?').join(',');
                const [actAfter] = await connection.query(
                    `SELECT id, notes, status, planned_date, actual_date, activity_type
                     FROM activities WHERE id IN (${aph})`,
                    ids
                );
                for (const a of actAfter) {
                    if (activityNotesContainSynthetic(a.notes)) {
                        throw new Error(`Post-check: activity #${a.id} still has synthetic note text.`);
                    }
                    const before = activityPlans.find((p) => p.id === a.id);
                    if (String(a.status) !== String(before.status)
                        || String(a.activity_type) !== String(before.activity_type)
                        || String(a.planned_date || '').slice(0, 10) !== String(before.planned_date || '').slice(0, 10)
                        || String(a.actual_date || '').slice(0, 10) !== String(before.actual_date || '').slice(0, 10)) {
                        throw new Error(`Post-check: activity #${a.id} non-notes fields changed — aborting.`);
                    }
                }
            }

            // Re-verify all planting ownership markers still present
            const [ownAfter] = await connection.query(
                `SELECT id, lifecycle_state_reason FROM plantings WHERE id IN (${ph})`,
                plantingIds
            );
            for (const p of ownAfter) {
                if (!String(p.lifecycle_state_reason || '').includes(SEED_DATASET_ID)) {
                    throw new Error(`Post-check: planting #${p.id} lost ownership marker.`);
                }
            }

            await connection.commit();
            committed = true;
            console.log('[eval-cleanup] COMMIT OK');
            console.log(JSON.stringify({
                harvests_updated: harvestPlans.length,
                harvest_ids: harvestPlans.map((p) => p.id),
                activities_notes_cleaned: activityPlans.length,
                activity_ids_cleaned: activityPlans.map((a) => a.id),
            }, null, 2));
        } catch (err) {
            try { await connection.rollback(); } catch { /* ignore */ }
            console.error('[eval-cleanup] ROLLED BACK:', err.message);
            throw err;
        }
    } finally {
        await connection.end();
        if (!committed && args.execute) {
            console.log('[eval-cleanup] no commit performed');
        }
    }
};

if (require.main === module) {
    run().catch((err) => {
        console.error('[eval-cleanup] FAILED:', err.message);
        process.exitCode = 1;
    });
}

module.exports = {
    parseArgs,
    loadManifestOrThrow,
    run,
};
