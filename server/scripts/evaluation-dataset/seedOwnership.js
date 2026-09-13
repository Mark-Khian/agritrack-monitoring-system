'use strict';

const { SEED_DATASET_ID, SYNTHETIC_MARKER } = require('./constants');

/**
 * Prove Evaluation seed ownership without relying on user-facing harvests.remarks.
 * Primary signal: plantings.lifecycle_state_reason (not shown in Harvest UI/exports).
 * Legacy fallback: old harvest remarks that still contain markers (pre-cleanup rows).
 */
const isSeedOwnershipProven = (lifecycleStateReason, harvestRemarks = '') => {
    const reason = String(lifecycleStateReason || '');
    if (reason.includes(SEED_DATASET_ID) || reason.includes(SYNTHETIC_MARKER)) {
        return true;
    }
    const remarks = String(harvestRemarks || '');
    return remarks.includes(SEED_DATASET_ID) || remarks.includes(SYNTHETIC_MARKER);
};

module.exports = {
    isSeedOwnershipProven,
};
