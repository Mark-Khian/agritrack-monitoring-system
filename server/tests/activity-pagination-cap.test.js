'use strict';

/**
 * Activity list pagination soft-cap (Issues 1–3 shared root cause).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('activity pagination soft-cap', () => {
    it('server clamps limit to 1000 (not 100)', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../controllers/activityController.js'),
            'utf8'
        );
        assert.match(src, /Math\.min\(1000/);
        assert.doesNotMatch(
            src,
            /const limit = Math\.min\(100, parseInt\(req\.query\.limit\)/
        );
    });

    it('client exposes getAllActivities page walker', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../../src/services/api.js'),
            'utf8'
        );
        assert.match(src, /export const getAllActivities/);
        assert.match(src, /fetched_pages/);
    });
});
