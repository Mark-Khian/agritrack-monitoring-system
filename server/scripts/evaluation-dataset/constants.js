'use strict';

/** Deterministic Evaluation synthetic dataset identity (v1). */
const EVAL_DB_NAME = 'crop_management_eval';
const FORBIDDEN_DB_NAMES = Object.freeze([
    'crop_management',
    'crop_management_dev',
    'crop_management_rearch_test',
]);

const SEED_DATASET_ID = 'AGRITRACK_EVAL_DATASET_v1';
const SYNTHETIC_MARKER = 'AgriTrack synthetic evaluation record';
/** Fixed demo “today” for due-today / overdue activity design. */
const REFERENCE_DATE = '2026-09-13';

module.exports = {
    EVAL_DB_NAME,
    FORBIDDEN_DB_NAMES,
    SEED_DATASET_ID,
    SYNTHETIC_MARKER,
    REFERENCE_DATE,
};
