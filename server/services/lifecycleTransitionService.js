/**
 * Validates manual lifecycle_state transitions.
 * HARVESTED is terminal and is set only via harvest creation (not this API path).
 */

const ALLOWED = {
    PLANNED: ['ACTIVE', 'ABANDONED'],
    ACTIVE: ['MATURING', 'ABANDONED'],
    MATURING: ['READY_FOR_HARVEST', 'ABANDONED'],
    READY_FOR_HARVEST: ['ABANDONED'],
    HARVESTED: [],
    ABANDONED: [],
};

const validateTransition = (fromState, toState) => {
    if (!fromState || !toState) {
        return { ok: false, message: 'Lifecycle state is required.' };
    }
    if (fromState === toState) {
        return { ok: true };
    }
    if (fromState === 'HARVESTED') {
        return { ok: false, message: 'Harvested plantings cannot change lifecycle state.' };
    }
    if (toState === 'HARVESTED') {
        return {
            ok: false,
            message: 'Use harvest recording to close a planting (lifecycle HARVESTED).',
        };
    }
    const allowed = ALLOWED[fromState];
    if (!allowed || !allowed.includes(toState)) {
        return {
            ok: false,
            message: `Invalid lifecycle transition: ${fromState} → ${toState}.`,
        };
    }
    return { ok: true };
};

module.exports = {
    ALLOWED,
    validateTransition,
};
