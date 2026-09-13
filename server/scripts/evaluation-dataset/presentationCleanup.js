'use strict';

/**
 * Pure helpers for Evaluation presentation cleanup (no DB).
 * User-facing harvest remarks + activity notes only.
 * Ownership markers stay on plantings.lifecycle_state_reason.
 */

const { SEED_DATASET_ID } = require('./constants');
const { remarkForQualityGrade } = require('./datasetDefinition');

/** Exact historical suffix appended by older seed completePreHarvestHistory. */
const SYNTHETIC_ACTIVITY_NOTE_SUFFIX =
    'AgriTrack synthetic evaluation record: completed for evaluation demo history.';

const remarkForHarvestCleanup = (qualityGrade) => remarkForQualityGrade(qualityGrade);

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeNotes = (value) => {
    if (value == null) return null;
    const trimmed = String(value).replace(/\r\n/g, '\n').trim();
    return trimmed === '' ? null : trimmed;
};

/**
 * Remove only the synthetic demo suffix; preserve System: / observation text.
 * @returns {{ changed: boolean, notes: string|null }}
 */
const stripSyntheticActivityNoteSuffix = (notes) => {
    const originalNorm = normalizeNotes(notes);
    if (originalNorm == null) {
        return { changed: false, notes: null };
    }
    if (!activityNotesContainSynthetic(originalNorm)) {
        return { changed: false, notes: originalNorm };
    }

    let next = originalNorm
        .replace(
            new RegExp(
                `(?:^|\\n)\\s*${escapeRegExp(SYNTHETIC_ACTIVITY_NOTE_SUFFIX)}\\s*(?=\\n|$)`,
                'gi'
            ),
            '\n'
        )
        .replace(new RegExp(escapeRegExp(SYNTHETIC_ACTIVITY_NOTE_SUFFIX), 'gi'), '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();

    next = next === '' ? null : next;

    if (activityNotesContainSynthetic(next)) {
        throw new Error('Failed to strip synthetic activity note suffix cleanly.');
    }

    return {
        changed: next !== originalNorm,
        notes: next,
    };
};

const remarksContainForbiddenToken = (remarks) => {
    const text = String(remarks || '');
    if (/AGRITRACK_EVAL/i.test(text)) return true;
    if (/synthetic/i.test(text)) return true;
    if (/\bH0[1-9]\b|\bH1[0-4]\b/.test(text)) return true;
    if (text.includes(SEED_DATASET_ID)) return true;
    return false;
};

const activityNotesContainSynthetic = (notes) => {
    const text = String(notes || '');
    return /synthetic evaluation|evaluation demo history/i.test(text);
};

/** True when execute is requested without the required Evaluation db-name flag. */
const refusesExecuteWithoutEvalDbName = (args) => (
    Boolean(args.execute) && args.dbName !== require('./constants').EVAL_DB_NAME
);

module.exports = {
    SYNTHETIC_ACTIVITY_NOTE_SUFFIX,
    remarkForHarvestCleanup,
    stripSyntheticActivityNoteSuffix,
    remarksContainForbiddenToken,
    activityNotesContainSynthetic,
    refusesExecuteWithoutEvalDbName,
    normalizeNotes,
};
