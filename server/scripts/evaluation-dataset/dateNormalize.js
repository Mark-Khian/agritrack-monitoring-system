'use strict';

/**
 * Canonical calendar-date normalization for Evaluation seeder validation.
 *
 * mysql2 returns MySQL DATE columns as JavaScript Date objects by default.
 * Never use String(date).slice(0, 10) — that yields "Tue Sep 08", not "2026-09-08".
 *
 * Output is always YYYY-MM-DD (or null for empty input).
 */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * @param {unknown} value
 * @returns {string|null}
 */
const toYmd = (value) => {
    if (value == null || value === '') return null;

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new Error('Cannot normalize invalid Date');
        }
        // mysql2 DATE values are calendar dates. Use local Y/M/D so we do not
        // shift a day via toISOString() / UTC conversion in UTC+ offsets.
        const y = value.getFullYear();
        const m = value.getMonth() + 1;
        const d = value.getDate();
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
        if (!match) {
            throw new Error(
                `Cannot normalize date string (expected YYYY-MM-DD): ${trimmed.slice(0, 40)}`
            );
        }
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // mysql2 may surface DECIMAL-like objects rarely; reject unknowns explicitly.
    throw new Error(`Cannot normalize date value of type ${typeof value}`);
};

/**
 * Compare two calendar dates after normalization.
 * @returns {number} negative if a<b, 0 if equal, positive if a>b
 */
const compareYmd = (a, b) => {
    const left = toYmd(a);
    const right = toYmd(b);
    if (left == null || right == null) {
        throw new Error('compareYmd requires defined dates');
    }
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
};

const isBeforeYmd = (a, b) => compareYmd(a, b) < 0;
const isAfterYmd = (a, b) => compareYmd(a, b) > 0;
const isSameYmd = (a, b) => compareYmd(a, b) === 0;

module.exports = {
    toYmd,
    compareYmd,
    isBeforeYmd,
    isAfterYmd,
    isSameYmd,
};
