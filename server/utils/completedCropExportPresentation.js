/**
 * Completed-crop PDF presentation helpers (no DB / Puppeteer side effects).
 * Used by exportController and unit tests.
 */

/** ISO date for CSV / machine-facing export (unchanged contract). */
const formatDate = (d) => {
    if (!d) return 'N/A';
    const match = String(d).match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    return new Date(d).toISOString().slice(0, 10);
};

/** Human-readable date for PDF presentation only (e.g. Jan 20, 2026). */
const formatPdfDate = (d) => {
    if (!d) return '—';
    const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    let year;
    let month;
    let day;
    if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    } else {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return '—';
        year = dt.getFullYear();
        month = dt.getMonth() + 1;
        day = dt.getDate();
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[month - 1]} ${day}, ${year}`;
};

const formatPdfTimestamp = (date = new Date()) => (
    date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
);

const formatCurrency = (val) => {
    if (val === null || val === undefined) return '₱0.00';
    return '₱' + parseFloat(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatQualityGrade = (val) => {
    if (!val) return '';
    const v = String(val).toUpperCase();
    if (v === 'REJECTED') return 'Rejected';
    if (['A', 'B', 'C'].includes(v)) return 'Grade ' + v;
    return val;
};

const formatEnum = (val) => {
    if (!val) return '';
    return String(val)
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

const formatRoleLabel = (role) => {
    const normalized = String(role || '').toUpperCase();
    if (normalized === 'ADMIN') return 'Administrator';
    if (normalized === 'SECRETARY') return 'Secretary';
    if (normalized === 'FARM_WORKER') return 'Farm Worker';
    return formatEnum(role) || 'User';
};

const ACTIVITY_LABELS = Object.freeze({
    seeding: 'Seeding',
    direct_seeding: 'Direct Seeding',
    transplanting: 'Transplanting',
    irrigation: 'Irrigation Monitoring',
    first_fertilizing: 'Fertilizer #1',
    second_fertilizing: 'Fertilizer #2',
    fertilizing: 'Fertilizing',
    pest_control: 'Pest & Disease Monitoring',
    final_pest_inspection: 'Final Pest Inspection',
    crop_monitoring: 'Crop Monitoring',
    drain_irrigation: 'Drain Irrigation',
    harvesting: 'Harvesting',
    land_preparation: 'Land Preparation',
    weeding: 'Weeding',
    other: 'Other',
});

const formatActivityLabel = (activityType) => {
    const key = String(activityType || '').toLowerCase();
    if (ACTIVITY_LABELS[key]) return ACTIVITY_LABELS[key];
    return formatEnum(activityType) || 'Activity';
};

const formatActivityStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (!normalized) return '—';
    return normalized.charAt(0) + normalized.slice(1).toLowerCase();
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

module.exports = {
    formatDate,
    formatPdfDate,
    formatPdfTimestamp,
    formatCurrency,
    formatQualityGrade,
    formatEnum,
    formatRoleLabel,
    formatActivityLabel,
    formatActivityStatus,
    escapeHtml,
    ACTIVITY_LABELS,
};
