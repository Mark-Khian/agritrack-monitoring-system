/**
 * Planting row action classification — authoritative status/lifecycle only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isCompletedPlanting,
    isCurrentActivePlanting,
    getPlantingRowActionFlags,
} from '../src/utils/plantingCompletion.js';
import { CAPABILITIES, hasCapability, ROLES } from '../src/security/permissions.js';

const capsFor = (role) => ({
    canUpdate: hasCapability(role, CAPABILITIES.PLANTING_UPDATE),
    canDelete: hasCapability(role, CAPABILITIES.PLANTING_DELETE),
    canExport: hasCapability(role, CAPABILITIES.PLANTING_EXPORT),
    canUpdateHarvested: hasCapability(role, CAPABILITIES.PLANTING_UPDATE_HARVESTED),
});

describe('planting action classification (authoritative)', () => {
    const immatureActive = {
        status: 'active',
        lifecycle_state: 'ACTIVE',
        growth_stage: 'Vegetative Stage',
    };
    const readyForHarvest = {
        status: 'active',
        lifecycle_state: 'ACTIVE',
        growth_stage: 'Ready for Harvest',
    };
    const completedHarvested = {
        status: 'completed',
        lifecycle_state: 'HARVESTED',
        growth_stage: 'Harvested',
    };
    const spoofedByPresentation = {
        status: 'active',
        lifecycle_state: 'ACTIVE',
        growth_stage: 'Harvested', // presentation must NOT control actions
    };

    it('1. active immature → Active actions (Admin)', () => {
        assert.equal(isCompletedPlanting(immatureActive), false);
        const flags = getPlantingRowActionFlags(immatureActive, capsFor(ROLES.ADMIN));
        assert.deepEqual(flags, {
            showEdit: true,
            showDelete: true,
            showPrint: false,
            showView: false,
            mode: 'active',
        });
    });

    it('2. active Ready for Harvest → SAME Active actions (Admin)', () => {
        assert.equal(isCompletedPlanting(readyForHarvest), false);
        assert.equal(isCurrentActivePlanting(readyForHarvest), true);
        const flags = getPlantingRowActionFlags(readyForHarvest, capsFor(ROLES.ADMIN));
        assert.deepEqual(flags, {
            showEdit: true,
            showDelete: true,
            showPrint: false,
            showView: false,
            mode: 'active',
        });
        assert.deepEqual(
            getPlantingRowActionFlags(readyForHarvest, capsFor(ROLES.ADMIN)),
            getPlantingRowActionFlags(immatureActive, capsFor(ROLES.ADMIN))
        );
    });

    it('3. completed harvested → completed/history actions', () => {
        assert.equal(isCompletedPlanting(completedHarvested), true);
        const flags = getPlantingRowActionFlags(completedHarvested, capsFor(ROLES.ADMIN));
        assert.deepEqual(flags, {
            showEdit: true,
            showDelete: false,
            showPrint: true,
            showView: false,
            mode: 'completed',
        });
    });

    it('4. Worker Ready for Harvest → still read-only (no edit/delete)', () => {
        const flags = getPlantingRowActionFlags(readyForHarvest, capsFor(ROLES.FARM_WORKER));
        assert.equal(flags.mode, 'active');
        assert.equal(flags.showEdit, false);
        assert.equal(flags.showDelete, false);
        assert.equal(flags.showPrint, false);
        assert.equal(flags.showView, false);
    });

    it('5. Secretary behavior unchanged (update yes, delete no; export on completed)', () => {
        const activeFlags = getPlantingRowActionFlags(readyForHarvest, capsFor(ROLES.SECRETARY));
        assert.deepEqual(activeFlags, {
            showEdit: true,
            showDelete: false,
            showPrint: false,
            showView: false,
            mode: 'active',
        });
        const completedFlags = getPlantingRowActionFlags(completedHarvested, capsFor(ROLES.SECRETARY));
        assert.deepEqual(completedFlags, {
            showEdit: false,
            showDelete: false,
            showPrint: true,
            showView: true,
            mode: 'completed',
        });
    });

    it('growth_stage text never forces completed actions', () => {
        assert.equal(isCompletedPlanting(spoofedByPresentation), false);
        const flags = getPlantingRowActionFlags(spoofedByPresentation, capsFor(ROLES.ADMIN));
        assert.equal(flags.mode, 'active');
        assert.equal(flags.showEdit, true);
        assert.equal(flags.showDelete, true);
    });
});
