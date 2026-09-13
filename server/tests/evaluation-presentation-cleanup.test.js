'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    remarkForHarvestCleanup,
    stripSyntheticActivityNoteSuffix,
    remarksContainForbiddenToken,
    activityNotesContainSynthetic,
    SYNTHETIC_ACTIVITY_NOTE_SUFFIX,
    refusesExecuteWithoutEvalDbName,
} = require('../scripts/evaluation-dataset/presentationCleanup');
const { isSeedOwnershipProven } = require('../scripts/evaluation-dataset/seedOwnership');
const { SEED_DATASET_ID, SYNTHETIC_MARKER, EVAL_DB_NAME } = require('../scripts/evaluation-dataset/constants');

const parseArgs = (argv) => {
    const flags = new Set();
    let dbName = null;
    for (const arg of argv) {
        if (arg.startsWith('--db-name=')) dbName = arg.slice('--db-name='.length).trim();
        else if (arg.startsWith('--')) flags.add(arg);
    }
    return {
        execute: flags.has('--execute-evaluation-cleanup'),
        dbName,
    };
};

describe('evaluation presentation cleanup helpers', () => {
    it('Grade A/B/C/Rejected remark mapping', () => {
        assert.equal(
            remarkForHarvestCleanup('A'),
            'Grain quality rated high after final field inspection.'
        );
        assert.equal(
            remarkForHarvestCleanup('B'),
            'Grain quality acceptable after final field inspection.'
        );
        assert.equal(
            remarkForHarvestCleanup('C'),
            'Lower grain quality observed after final field inspection.'
        );
        assert.equal(
            remarkForHarvestCleanup('rejected'),
            'Grain quality rejected after final inspection due to visible defects.'
        );
        assert.equal(remarksContainForbiddenToken(remarkForHarvestCleanup('A')), false);
        assert.equal(remarksContainForbiddenToken(remarkForHarvestCleanup('rejected')), false);
    });

    it('synthetic activity suffix removed; System note preserved', () => {
        const system = 'System: Transfer seedlings into the assigned plot/field.';
        const dirty = `${system}\n${SYNTHETIC_ACTIVITY_NOTE_SUFFIX}`;
        const { changed, notes } = stripSyntheticActivityNoteSuffix(dirty);
        assert.equal(changed, true);
        assert.equal(notes, system);
        assert.equal(activityNotesContainSynthetic(notes), false);
        assert.match(notes, /^System:/);
    });

    it('unrelated activity note untouched', () => {
        const clean = 'System: Begin continuous water management and irrigation checks.';
        const { changed, notes } = stripSyntheticActivityNoteSuffix(clean);
        assert.equal(changed, false);
        assert.equal(notes, clean);
    });

    it('suffix-only note becomes null', () => {
        const { changed, notes } = stripSyntheticActivityNoteSuffix(SYNTHETIC_ACTIVITY_NOTE_SUFFIX);
        assert.equal(changed, true);
        assert.equal(notes, null);
    });

    it('ownership proof still succeeds without harvest remarks', () => {
        assert.equal(
            isSeedOwnershipProven(
                `Harvest recorded — ${SYNTHETIC_MARKER} [${SEED_DATASET_ID}:H09]`,
                remarkForHarvestCleanup('A')
            ),
            true
        );
        assert.equal(
            isSeedOwnershipProven('no marker', remarkForHarvestCleanup('A')),
            false
        );
    });

    it('default mode is dry-run (no execute flag)', () => {
        const args = parseArgs(['--db-name=crop_management_eval']);
        assert.equal(args.execute, false);
        assert.equal(args.dbName, EVAL_DB_NAME);
    });

    it('wrong DB name rejected for execute', () => {
        const args = parseArgs([
            '--db-name=crop_management_dev',
            '--execute-evaluation-cleanup',
        ]);
        assert.equal(args.execute, true);
        assert.equal(refusesExecuteWithoutEvalDbName(args), true);
        assert.equal(
            refusesExecuteWithoutEvalDbName({
                execute: true,
                dbName: EVAL_DB_NAME,
            }),
            false
        );
    });

    it('seeder no longer appends synthetic activity-note suffix', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../scripts/evaluation-dataset/seedOperations.js'),
            'utf8'
        );
        assert.equal(src.includes('completed for evaluation demo history'), false);
        assert.equal(
            /notes = CONCAT[\s\S]*SYNTHETIC_MARKER/.test(src),
            false
        );
        // Ownership marker must remain on lifecycle_state_reason
        assert.match(src, /lifecycle_state_reason = \?/);
        assert.match(src, /SYNTHETIC_MARKER.*SEED_DATASET_ID/);
    });
});
