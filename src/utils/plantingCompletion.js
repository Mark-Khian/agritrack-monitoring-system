/**
 * Authoritative planting completion checks for UI actions / filters.
 * Do NOT use presentation growth_stage text (e.g. "Ready for Harvest") here.
 */

/**
 * True when the planting is in a completed/harvested record state.
 * Presentation labels must never drive this.
 *
 * @param {object|null|undefined} planting
 * @returns {boolean}
 */
export function isCompletedPlanting(planting) {
    const status = String(planting?.status || '').toLowerCase();
    if (status === 'completed') return true;

    const lifecycle = String(planting?.lifecycle_state || '')
        .toUpperCase()
        .replace(/-/g, '_')
        .trim();
    return lifecycle === 'HARVESTED';
}

/**
 * Active overview lists: exclude completed/harvested and failed plantings.
 * @param {object|null|undefined} planting
 * @returns {boolean}
 */
export function isCurrentActivePlanting(planting) {
    const status = String(planting?.status || '').toLowerCase();
    if (status === 'failed') return false;
    return !isCompletedPlanting(planting);
}

/**
 * Row action flags for Plantings list (capabilities already decided by RBAC).
 * @param {object} planting
 * @param {{ canUpdate: boolean, canDelete: boolean, canExport: boolean, canUpdateHarvested?: boolean }} caps
 */
export function getPlantingRowActionFlags(planting, caps = {}) {
    const completed = isCompletedPlanting(planting);
    const canUpdate = Boolean(caps.canUpdate);
    const canDelete = Boolean(caps.canDelete);
    const canExport = Boolean(caps.canExport);
    const canUpdateHarvested = Boolean(caps.canUpdateHarvested);

    if (completed) {
        return {
            showEdit: canUpdateHarvested,
            showDelete: false,
            showPrint: canExport,
            showView: !canUpdateHarvested,
            mode: 'completed',
        };
    }

    return {
        showEdit: canUpdate,
        showDelete: canDelete,
        showPrint: false,
        showView: false,
        mode: 'active',
    };
}
