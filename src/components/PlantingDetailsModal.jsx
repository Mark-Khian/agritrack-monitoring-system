import React from 'react';
import Modal from './Modal';
import { formatDisplayDate } from '../utils/dateFormatter';

const formatLabelValue = (value) => {
    if (value == null || value === '') return '—';
    return String(value)
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatSeason = (planting) => {
    const season = planting?.cropping_season || planting?.season;
    if (!season) return '—';
    const normalized = String(season).toUpperCase();
    if (normalized === 'WET_SEASON' || normalized === 'WET') return 'Wet Season';
    if (normalized === 'DRY_SEASON' || normalized === 'DRY') return 'Dry Season';
    return formatLabelValue(season);
};

const formatGrowthDays = (planting) => {
    if (planting?.expected_growth_days == null || planting?.expected_growth_days === '') return '—';
    const days = Number(planting.expected_growth_days);
    if (Number.isNaN(days)) return '—';
    const adjustment = Number(planting.adjustment_days) || 0;
    if (adjustment !== 0) {
        const signed = adjustment > 0 ? `+${adjustment}` : String(adjustment);
        return `${days} days (${signed} adjustment)`;
    }
    return `${days} days`;
};

const statusBadgeClass = (status) => {
    const normalized = String(status || 'active').toLowerCase();
    if (normalized === 'completed') {
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
    if (normalized === 'failed') {
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
    }
    return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800';
};

const DetailItem = ({ label, children }) => (
    <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
        </p>
        <div className="mt-1 text-sm text-gray-900 dark:text-slate-100">
            {children}
        </div>
    </div>
);

/**
 * Read-only planting summary for Farm Worker (Plot Overview details pattern, richer fields).
 * No editable controls — Admin/Secretary continue to use Edit Planting.
 */
const PlantingDetailsModal = ({ isOpen, onClose, planting, overlayClassName = 'z-50' }) => {
    if (!isOpen || !planting) return null;

    const growthStage = planting.expected_stage || planting.observed_stage || planting.growth_stage;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Planting Details"
            maxWidth="max-w-2xl"
            overlayClassName={overlayClassName}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailItem label="Field Name">
                        {planting.field_name || '—'}
                    </DetailItem>
                    <DetailItem label="Rice Variety">
                        {planting.variety || '—'}
                    </DetailItem>
                    <DetailItem label="Variety Class">
                        {planting.variety_class || '—'}
                    </DetailItem>
                    <DetailItem label="Planting Date">
                        {planting.planting_date ? formatDisplayDate(planting.planting_date) : '—'}
                    </DetailItem>
                    <DetailItem label="Status">
                        <span
                            className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap capitalize ${statusBadgeClass(planting.status)}`}
                        >
                            {planting.status || 'Active'}
                        </span>
                    </DetailItem>
                    <DetailItem label="Growth Stage">
                        <span className="capitalize">
                            {growthStage ? String(growthStage).replaceAll('_', ' ') : '—'}
                        </span>
                    </DetailItem>
                    <DetailItem label="Expected Growth Days">
                        {formatGrowthDays(planting)}
                    </DetailItem>
                    <DetailItem label="Expected Harvest">
                        {planting.expected_harvest ? formatDisplayDate(planting.expected_harvest) : '—'}
                    </DetailItem>
                    <DetailItem label="Establishment Method">
                        {formatLabelValue(planting.establishment_method)}
                    </DetailItem>
                    <DetailItem label="Field Condition">
                        {formatLabelValue(planting.field_condition)}
                    </DetailItem>
                    <DetailItem label="Season">
                        {formatSeason(planting)}
                    </DetailItem>
                </div>
            </div>
        </Modal>
    );
};

export default PlantingDetailsModal;
