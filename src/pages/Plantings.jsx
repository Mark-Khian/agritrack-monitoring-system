import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Sprout, AlertTriangle, ChevronDown, FileDown, Loader2, Printer, X, Calendar, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import DownwardSelect from '../components/DownwardSelect';
import MonthPicker from '../components/MonthPicker';
import {
    getPlantings, createPlanting, updatePlanting, deletePlanting, getVarieties,
    exportPlantingsCSV, exportPlantingsPDF, exportPlantingPDF
} from '../services/api';
import { SkeletonTable } from '../components/Skeleton';

const RICE_VARIETY_OPTIONS = {
    'Irrigated / Lowland Varieties': [
        'NSIC Rc110', 'Rc118', 'Rc120', 'Rc128', 'Rc130', 'Rc134', 'Rc160', 'Rc172', 'Rc194',
        'NSIC Rc212', 'Rc214', 'Rc216', 'Rc218 SR', 'Rc220 SR', 'Rc222',
        'NSIC Rc224', 'Rc226', 'Rc238', 'Rc240', 'Rc242 SR', 'Rc298', 'Rc300',
        'NSIC Rc396', 'Rc398', 'Rc414', 'Rc482SR', 'Rc484SR', 'Rc508', 'Rc510',
        'PSB RC1', 'RC2', 'RC4', 'RC6', 'RC8', 'RC10', 'RC18'
    ],
    'Rainfed / Dry-Seeded Varieties (DSR)': [
        'NSIC 2020 Rc598', 'Rc596', 'Rc594', 'Rc592',
        'NSIC 2011 Rc278'
    ],
    'Upland Varieties': [
        'NSIC Rc29', 'Rc27', 'Rc25',
        'NSIC Rc286', 'RC9', 'RC11',
        'PSB RC3', 'RC5', 'RC7'
    ]
};

const CATEGORY_HINTS = {
    'Irrigated / Lowland Varieties': 'High yield, irrigated-friendly, best for well-watered paddies.',
    'Rainfed / Dry-Seeded Varieties (DSR)': 'Recommended for rainfed and dry-seeded systems with controlled water use.',
    'Upland Varieties': 'Best for upland or sloped areas with limited standing water.'
};

/** Aligns with server: expected_harvest = planting_date + expected_growth_days + adjustment_days (calendar). */
const computeExpectedHarvestDate = (plantingDate, expectedGrowthDays, adjustmentDays) => {
    if (!plantingDate) return '';
    const span = Number(expectedGrowthDays || 0) + Number(adjustmentDays || 0);
    if (!Number.isFinite(span) || span < 1) return '';
    const d = new Date(`${plantingDate}T12:00:00`);
    d.setDate(d.getDate() + Math.floor(span));
    return d.toISOString().slice(0, 10);
};

const LIFECYCLE_OPTIONS_CREATE = [
    { value: 'ACTIVE', label: 'Active (generate system activities)' },
    { value: 'PLANNED', label: 'Planned (defer system activities until active)' },
];

const LIFECYCLE_OPTIONS_EDIT = [
    { value: 'PLANNED', label: 'Planned (defer system activities)' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'MATURING', label: 'Maturing' },
    { value: 'READY_FOR_HARVEST', label: 'Ready for harvest' },
    { value: 'ABANDONED', label: 'Abandoned' },
];

/** Matches server template indices 0–9 */
const SYSTEM_TEMPLATE_SLOTS = [
    { i: 0, short: 'Seeding' },
    { i: 1, short: 'Transplanting' },
    { i: 2, short: 'Irrigation' },
    { i: 3, short: 'First Fertilizing' },
    { i: 4, short: 'Pest Control' },
    { i: 5, short: 'Second Fertilizing' },
    { i: 6, short: 'Crop Monitoring' },
    { i: 7, short: 'Final Pest Inspection' },
    { i: 8, short: 'Drain Irrigation' },
    { i: 9, short: 'Harvesting' },
];

let plantingsCache = null;

const Plantings = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [cameFromDashboard, setCameFromDashboard] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('from') === 'dashboard';
    });
    const [plantings, setPlantings] = useState(plantingsCache || []);
    const [loading, setLoading] = useState(!plantingsCache);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState({ message: '', type: '' });
    const [validationErrors, setValidationErrors] = useState({});

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [formError, setFormError] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [varietiesCatalog, setVarietiesCatalog] = useState([]);
    const [editVarietyBaseline, setEditVarietyBaseline] = useState(null);
    const [partialTemplateIndices, setPartialTemplateIndices] = useState([]);

    const [formData, setFormData] = useState({
        field_name: '',
        variety_class: '', variety: '', variety_id: '',
        planting_date: '',
        expected_growth_days: '120',
        adjustment_days: '0',
        growth_plan_manual_override: false,
        lifecycle_state: 'ACTIVE',
        season: 'wet', status: 'active'
    });
    const categoryOptions = Object.keys(RICE_VARIETY_OPTIONS);

    const varietiesForClass = useMemo(
        () => varietiesCatalog.filter((v) => v.variety_class === formData.variety_class),
        [varietiesCatalog, formData.variety_class]
    );
    const selectedVarietyOptions = useMemo(() => {
        if (varietiesForClass.length > 0) return varietiesForClass.map((v) => v.name);
        return formData.variety_class ? (RICE_VARIETY_OPTIONS[formData.variety_class] || []) : [];
    }, [varietiesForClass, formData.variety_class]);

    const previewExpectedHarvest = useMemo(
        () => computeExpectedHarvestDate(
            formData.planting_date,
            formData.expected_growth_days,
            formData.adjustment_days
        ),
        [formData.planting_date, formData.expected_growth_days, formData.adjustment_days]
    );

    const varietyFormDirty = useMemo(() => {
        if (!editingItem || !editVarietyBaseline) return false;
        return (
            formData.variety_class !== editVarietyBaseline.variety_class ||
            formData.variety !== editVarietyBaseline.variety ||
            String(formData.variety_id || '') !== String(editVarietyBaseline.variety_id ?? '')
        );
    }, [editingItem, editVarietyBaseline, formData.variety_class, formData.variety, formData.variety_id]);

    const togglePartialTemplate = (idx) => {
        setPartialTemplateIndices((prev) =>
            prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a, b) => a - b)
        );
    };


    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const pRes = await getPlantings();
            const data = pRes.data.data || [];
            setPlantings(data);
            plantingsCache = data;
        } catch (err) {
            if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
            setError('Failed to load plantings. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const poll = async () => {
            try {
                const pRes = await getPlantings();
                if (cancelled) return;
                setError(null);
                const data = pRes.data.data || [];
                setPlantings(data);
                plantingsCache = data;
            } catch (err) {
                if (cancelled || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
                setError('Failed to load plantings. Please try again.');
                console.error(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        poll();
        const timer = setInterval(poll, 5000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await getVarieties();
                if (!cancelled) setVarietiesCatalog(res.data?.data || []);
            } catch {
                if (!cancelled) setVarietiesCatalog([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Deep link removed: field_id no longer exists



    const handleOpenModal = (item = null) => {
        setFormError('');
        setValidationErrors({});
        setPartialTemplateIndices([]);
        if (item) {
            setFormData({
                field_name: item.field_name || '',
                variety_class: item.variety_class || '',
                variety: item.variety,
                variety_id: item.variety_id != null ? String(item.variety_id) : '',
                planting_date: item.planting_date?.slice(0, 10) || '',
                expected_growth_days: item.expected_growth_days != null ? String(item.expected_growth_days) : '120',
                adjustment_days: item.adjustment_days != null ? String(item.adjustment_days) : '0',
                growth_plan_manual_override: !!Number(item.growth_plan_manual_override),
                lifecycle_state: item.lifecycle_state || 'ACTIVE',
                season: item.season,
                status: item.status
            });
            setEditVarietyBaseline({
                variety_class: item.variety_class || '',
                variety: item.variety,
                variety_id: item.variety_id != null ? String(item.variety_id) : '',
            });
            setEditingItem(item);
        } else {
            setFormData({
                field_name: '',
                variety_class: '',
                variety: '',
                variety_id: '',
                planting_date: '',
                expected_growth_days: '120',
                adjustment_days: '0',
                growth_plan_manual_override: false,
                lifecycle_state: 'ACTIVE',
                season: 'wet',
                status: 'active'
            });
            setEditVarietyBaseline(null);
            setEditingItem(null);
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        if (cameFromDashboard) {
            setCameFromDashboard(false);
            navigate('/dashboard?activePlantings=true');
        }
    };

    useEffect(() => {
        const highlightId = searchParams.get('id');
        const fromDashboard = searchParams.get('from') === 'dashboard';
        if (highlightId && plantings.length > 0) {
            const item = plantings.find(p => String(p.id) === String(highlightId));
            if (item) {
                handleOpenModal(item);
                if (fromDashboard) {
                    setCameFromDashboard(true);
                }
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('id');
                newParams.delete('from');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [plantings, searchParams, setSearchParams]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        setValidationErrors({});

        // Custom validation check
        const errors = {};
        const normalizedFieldName = String(formData.field_name || '').trim();
        if (!normalizedFieldName) {
            errors.field_name = 'Field Name is required.';
        }
        if (!formData.variety_class) {
            errors.variety_class = 'Variety Class is required.';
        }
        if (!formData.variety) {
            errors.variety = 'Rice Variety is required.';
        }
        if (!formData.planting_date) {
            errors.planting_date = 'Planting Date is required.';
        }
        if (!formData.expected_growth_days || Number(formData.expected_growth_days) < 1) {
            errors.expected_growth_days = 'Growth days must be at least 1.';
        }

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            setSaving(false);

            // Find first error element, scroll to it, and focus it
            setTimeout(() => {
                const firstErrorKey = Object.keys(errors)[0];
                const element = document.getElementById(`form-field-${firstErrorKey}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Focus if focusable
                    if (element.focus) element.focus();
                }
            }, 50);
            return;
        }

        try {
            const normalizedFieldName = String(formData.field_name || '').trim();
            const partialPayload = partialTemplateIndices.length > 0 ? partialTemplateIndices : undefined;
            if (editingItem) {
                await updatePlanting(editingItem.id, {
                    field_name: normalizedFieldName,
                    variety_class: formData.variety_class,
                    variety: formData.variety,
                    variety_id: formData.variety_id ? Number(formData.variety_id) : undefined,
                    planting_date: formData.planting_date,
                    expected_growth_days: Number(formData.expected_growth_days),
                    adjustment_days: Number(formData.adjustment_days || 0),
                    growth_plan_manual_override: !!formData.growth_plan_manual_override,
                    lifecycle_state: formData.lifecycle_state,
                    status: formData.status,
                    generate_template_indices: partialPayload,
                });
                setToast({ message: 'Planting updated successfully!', type: 'success' });
            } else {
                await createPlanting({
                    field_name: normalizedFieldName,
                    variety_class: formData.variety_class,
                    variety: formData.variety,
                    variety_id: formData.variety_id ? Number(formData.variety_id) : undefined,
                    planting_date: formData.planting_date,
                    season: formData.season,
                    expected_growth_days: formData.expected_growth_days !== ''
                        ? Number(formData.expected_growth_days)
                        : undefined,
                    adjustment_days: Number(formData.adjustment_days || 0),
                    growth_plan_manual_override: !!formData.growth_plan_manual_override,
                    lifecycle_state: formData.lifecycle_state,
                    generate_template_indices: partialPayload,
                });
                setToast({ message: 'Planting created successfully!', type: 'success' });
            }
            handleCloseModal();
            await fetchData();
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to save planting.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (id) => { setDeletingId(id); setIsConfirmOpen(true); };
    const confirmDelete = async () => {
        try {
            await deletePlanting(deletingId);
            await fetchData();
            setToast({ message: 'Planting deleted successfully!', type: 'success' });
        }
        catch (err) { console.error('Delete planting error:', err); }
    };

    const isCompletedPlanting = (p) => {
        const status = String(p?.status || '').toLowerCase();
        const stage = String(p?.growth_stage || '').toLowerCase();
        const lc = String(p?.lifecycle_state || '').toLowerCase();
        return status === 'completed' || stage === 'harvested' || lc === 'harvested';
    };

    const handleVarietyPick = (e) => {
        const name = e.target.value;
        const row = varietiesForClass.find((v) => v.name === name);
        setFormData((prev) => ({
            ...prev,
            variety: name,
            variety_id: row ? String(row.id) : '',
            expected_growth_days: row ? String(row.default_expected_growth_days) : prev.expected_growth_days,
        }));
    };

    const visiblePlantings = useMemo(() => {
        return (plantings || []).filter((p) => {
            if (statusFilter === 'active') {
                return p.status === 'active';
            }
            if (statusFilter === 'completed') {
                return p.status === 'completed';
            }
            return true; // 'all'
        });
    }, [plantings, statusFilter]);

    const hasCompleted = useMemo(() => plantings.some(p => isCompletedPlanting(p)), [plantings]);
    const [downloadingRowId, setDownloadingRowId] = useState(null);

    // Bulk Export state
    const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState('csv'); // csv or pdf
    const [bulkExporting, setBulkExporting] = useState(false);

    const completedPlantings = useMemo(() => (plantings || []).filter(p => isCompletedPlanting(p)), [plantings]);
    const [selectedCompletedId, setSelectedCompletedId] = useState(null);

    // Reset selection when drawer is closed
    useEffect(() => {
        if (!isExportDrawerOpen) {
            setSelectedCompletedId(null);
        }
    }, [isExportDrawerOpen]);

    const handleSingleExportPDF = async (id) => {
        setDownloadingRowId(id);
        try {
            const res = await exportPlantingPDF(id);
            const url = window.URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `planting_report_${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setIsExportDrawerOpen(false);
        } catch (err) {
            console.error('Failed to export single planting report:', err);
            setToast({ message: 'Failed to download report. Please try again.', type: 'error' });
        } finally {
            setDownloadingRowId(null);
        }
    };

    const handleBulkExport = async (e) => {
        e?.preventDefault();
        if (selectedCompletedId && exportFormat === 'pdf') {
            await handleSingleExportPDF(selectedCompletedId);
            return;
        }
        setBulkExporting(true);
        try {
            let res;
            if (exportFormat === 'csv') {
                const params = selectedCompletedId ? { plantingId: selectedCompletedId } : {};
                res = await exportPlantingsCSV(params);
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                const filename = selectedCompletedId
                    ? `planting_report_${selectedCompletedId}.csv`
                    : `completed_plantings_report_${new Date().toISOString().slice(0, 10)}.csv`;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
            } else {
                res = await exportPlantingsPDF({});
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `completed_plantings_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            setIsExportDrawerOpen(false);
            setToast({ message: 'Report exported successfully!', type: 'success' });
        } catch (err) {
            console.error('Export failed:', err);
            setToast({ message: 'Failed to export report. Please try again.', type: 'error' });
        } finally {
            setBulkExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Toast
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ message: '', type: '' })}
            />
            <div className="flex flex-col gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Crop Plantings</h1>
                    <p className="text-sm text-gray-500">Monitor currently growing rice varieties and stages</p>
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4">
                    {/* Status Tabs Segmented Control */}
                    <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-200 w-full sm:w-fit overflow-x-auto">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'active', label: 'Active' },
                            { id: 'completed', label: 'Completed' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setStatusFilter(tab.id)}
                                className={`flex-1 sm:flex-none min-h-10 px-3 py-2 rounded-lg text-xs font-semibold outline-none focus:outline-none whitespace-nowrap ${statusFilter === tab.id
                                    ? 'bg-neutral-50 text-blue-700 shadow-sm dark:bg-slate-700 dark:text-white font-bold'
                                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/40'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <button
                            type="button"
                            onClick={() => handleOpenModal()}
                            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-700 hover:bg-green-600 text-white outline-none focus:outline-none"
                        >
                            <Plus size={16} /> Add Planting
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (!hasCompleted) {
                                    setToast({ message: 'No completed plantings available to export yet.', type: 'info' });
                                    return;
                                }
                                setIsExportDrawerOpen(true);
                            }}
                            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white shadow-sm outline-none focus:outline-none"
                            title={hasCompleted ? 'Export bulk CSV/PDF report' : 'No completed plantings available for export'}
                        >
                            <FileDown size={16} /> Export Report
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={fetchData} className="underline">Retry</button>
                </div>
            )}

            {loading ? (
                <SkeletonTable
                    rows={6}
                    cols={7}
                    columnHeaders={['Variety', 'Field', 'Season', 'Growth Stage', 'Planting Date', 'Expected Harvest', 'Actions']}
                />
            ) : visiblePlantings.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <Sprout size={40} className="text-gray-200" />
                        <p className="text-gray-400 text-sm font-medium">
                            {plantings.length === 0 ? 'No plantings yet.' : `No plantings found in the ${statusFilter} tab.`}
                        </p>
                        <p className="text-gray-300 text-xs">
                            {plantings.length === 0
                                ? 'Active plantings get ten ratio-based system activities; Planned plantings defer until you activate.'
                                : 'Switch status tabs or record a new planting.'}
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Mobile card list */}
                    <div className="md:hidden space-y-3">
                        {visiblePlantings.map((p) => (
                            <div
                                key={p.id}
                                className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 dark:border-slate-700"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="font-bold text-gray-900 break-words">{p.variety}</p>
                                            {!!Number(p.growth_plan_manual_override) && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                                                    Manual plan
                                                </span>
                                            )}
                                            {isCompletedPlanting(p) && (
                                                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                    Archived
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500 break-words">
                                            {p.variety_class || 'Unclassified'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isCompletedPlanting(p) && (
                                            <button
                                                type="button"
                                                onClick={() => handleSingleExportPDF(p.id)}
                                                disabled={downloadingRowId === p.id}
                                                className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600"
                                                title="Download planting performance report (PDF)"
                                            >
                                                {downloadingRowId === p.id ? (
                                                    <Loader2 size={16} className="animate-spin text-green-600" />
                                                ) : (
                                                    <Printer size={16} />
                                                )}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenModal(p)}
                                            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                                            title="Edit planting"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteClick(p.id)}
                                            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                                            title="Delete planting"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3 space-y-2.5 text-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Field</span>
                                        <span className="font-medium text-gray-800 text-right break-words">{p.field_name || '—'}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Season</span>
                                        <span className="capitalize text-gray-700 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-md text-xs font-semibold">
                                            {p.season || '—'}
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Planted</span>
                                        <span className="font-medium text-gray-800">{p.planting_date?.slice(0, 10) || '—'}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Harvest (est)</span>
                                        <span className="font-medium text-gray-800">{p.expected_harvest?.slice(0, 10) || '—'}</span>
                                    </div>
                                    {p.expected_growth_days != null && (
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 shrink-0">Growth days</span>
                                            <span className="text-xs text-gray-600">
                                                {p.expected_growth_days}d{p.adjustment_days ? ` + ${p.adjustment_days}d adj` : ''}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Growth Stage</span>
                                        <Badge status={p.growth_stage} />
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Status</span>
                                        <Badge status={p.status} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop / tablet table */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[1000px]">
                                <thead>
                                    <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        <th className="px-6 py-3">Variety</th>
                                        <th className="px-6 py-3">Field</th>
                                        <th className="px-6 py-3">Season</th>
                                        <th className="px-6 py-3">Dates</th>
                                        <th className="px-6 py-3">Growth Stage</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblePlantings.map((p) => (
                                        <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-bold text-gray-900 flex flex-wrap items-center gap-1.5">
                                                        {p.variety}
                                                        {!!Number(p.growth_plan_manual_override) && (
                                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                                                                Manual plan
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isCompletedPlanting(p) && (
                                                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                            Archived
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">{p.variety_class || 'Unclassified'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">{p.field_name}</td>
                                            <td className="px-6 py-4">
                                                <span className="capitalize text-gray-700 bg-gray-100 px-2 py-1 rounded-md text-xs font-semibold">
                                                    {p.season}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col text-xs space-y-1">
                                                    <span className="text-gray-900 border-l-2 border-green-500 pl-2">
                                                        P: <span className="font-medium">{p.planting_date?.slice(0, 10)}</span>
                                                    </span>
                                                    <span className="text-gray-900 border-l-2 border-amber-500 pl-2">
                                                        H: <span className="font-medium">{p.expected_harvest?.slice(0, 10)}</span>
                                                    </span>
                                                    <span className="text-gray-500 pl-2">
                                                        {p.expected_growth_days != null && (
                                                            <>Growth {p.expected_growth_days}d{p.adjustment_days ? ` + ${p.adjustment_days}d adj` : ''}</>
                                                        )}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4"><Badge status={p.growth_stage} /></td>
                                            <td className="px-6 py-4"><Badge status={p.status} /></td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                {isCompletedPlanting(p) && (
                                                    <button
                                                        onClick={() => handleSingleExportPDF(p.id)}
                                                        disabled={downloadingRowId === p.id}
                                                        className="p-2 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors inline-flex items-center justify-center"
                                                        title="Download planting performance report (PDF)"
                                                    >
                                                        {downloadingRowId === p.id ? (
                                                            <Loader2 size={16} className="animate-spin text-green-600" />
                                                        ) : (
                                                            <Printer size={16} />
                                                        )}
                                                    </button>
                                                )}
                                                <button onClick={() => handleOpenModal(p)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteClick(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingItem ? 'Edit Planting' : 'Log New Planting'}
                maxWidth="max-w-md md:max-w-6xl lg:max-w-7xl"
            >
                <form onSubmit={handleSave} noValidate className="space-y-4">
                    {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
                    )}
                    {varietyFormDirty && editingItem && !isCompletedPlanting(editingItem) && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-lg text-sm flex gap-2 items-start">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            <span>
                                Changing variety or catalog link <strong>recalculates the growth plan</strong> (default expected growth days from the new variety unless manual override is on). Pending system activity dates will reschedule.
                            </span>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Field name (managed within Plantings; no separate Fields module) */}
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Field Name *</label>
                            <input
                                id="form-field-field_name"
                                required
                                type="text"
                                maxLength={120}
                                placeholder="e.g. North Plot, Block A, Barangay..."
                                className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:border-transparent outline-none transition-shadow ${validationErrors.field_name
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 focus:ring-green-500'
                                    }`}
                                value={formData.field_name}
                                onChange={(e) => {
                                    setFormData({ ...formData, field_name: e.target.value });
                                    if (validationErrors.field_name) {
                                        setValidationErrors(prev => ({ ...prev, field_name: null }));
                                    }
                                }}
                            />
                            {validationErrors.field_name && (
                                <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                    <AlertTriangle size={12} className="shrink-0" /> {validationErrors.field_name}
                                </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Field details are tracked per planting record (Fields page removed).
                            </p>
                        </div>
                        <div className="col-span-1 md:col-span-1 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Variety Class *</label>
                            <div className="relative" id="form-field-variety_class">
                                <select
                                    required
                                    className={`w-full border rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:border-transparent outline-none transition-shadow appearance-none bg-white text-gray-800 ${validationErrors.variety_class
                                        ? 'border-red-500 focus:ring-red-500'
                                        : 'border-gray-300 focus:ring-green-500'
                                        }`}
                                    value={formData.variety_class}
                                    onChange={e => {
                                        setFormData({
                                            ...formData,
                                            variety_class: e.target.value,
                                            variety: '',
                                            variety_id: '',
                                        });
                                        if (validationErrors.variety_class) {
                                            setValidationErrors(prev => ({ ...prev, variety_class: null }));
                                        }
                                    }}
                                >
                                    <option value="">Select category</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </select>
                                <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </span>
                            </div>
                            {validationErrors.variety_class && (
                                <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                    <AlertTriangle size={12} className="shrink-0" /> {validationErrors.variety_class}
                                </p>
                            )}
                            {formData.variety_class && (
                                <p className="text-xs text-gray-500 mt-1" title={CATEGORY_HINTS[formData.variety_class]}>
                                    {CATEGORY_HINTS[formData.variety_class]}
                                </p>
                            )}
                        </div>
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Rice Variety *</label>
                            <div id="form-field-variety">
                                <DownwardSelect
                                    id="rice-variety-select"
                                    value={formData.variety}
                                    onChange={(e) => {
                                        handleVarietyPick(e);
                                        if (validationErrors.variety) {
                                            setValidationErrors(prev => ({ ...prev, variety: null }));
                                        }
                                    }}
                                    options={selectedVarietyOptions}
                                    placeholder={formData.variety_class ? 'Select variety' : 'Select category first'}
                                    disabled={!formData.variety_class}
                                    required
                                    maxDropdownH={220}
                                    className={validationErrors.variety ? 'border-red-500 focus:ring-red-500' : ''}
                                />
                            </div>
                            {validationErrors.variety && (
                                <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                    <AlertTriangle size={12} className="shrink-0" /> {validationErrors.variety}
                                </p>
                            )}
                            {formData.variety && varietiesForClass.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Catalog ID: {formData.variety_id || '—'}
                                    {varietiesForClass.find((v) => v.name === formData.variety) && (
                                        <>
                                            {' · '}
                                            Typical window:{' '}
                                            {varietiesForClass.find((v) => v.name === formData.variety)?.min_growth_days}
                                            –
                                            {varietiesForClass.find((v) => v.name === formData.variety)?.max_growth_days}
                                            {' '}days
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                        {/* Planting date */}
                        <div className="col-span-1 md:col-span-1 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Planting Date *</label>
                            <div id="form-field-planting_date">
                                <MonthPicker
                                    id="planting-date-picker"
                                    value={formData.planting_date}
                                    onChange={e => {
                                        setFormData({ ...formData, planting_date: e.target.value });
                                        if (validationErrors.planting_date) {
                                            setValidationErrors(prev => ({ ...prev, planting_date: null }));
                                        }
                                    }}
                                    disabled={!!editingItem && isCompletedPlanting(editingItem)}
                                    required
                                    className={validationErrors.planting_date ? 'border-red-500 focus:ring-red-500' : ''}
                                />
                            </div>
                            {validationErrors.planting_date && (
                                <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                    <AlertTriangle size={12} className="shrink-0" /> {validationErrors.planting_date}
                                </p>
                            )}
                        </div>
                        <div className="col-span-1 lg:col-span-1">
                            <label
                                className="text-sm font-medium text-gray-700 mb-1 block"
                                title="Overriding may shift activity schedule for pending system-generated tasks."
                            >
                                Expected growth (days) *
                            </label>
                            <input
                                id="form-field-expected_growth_days"
                                required
                                type="number"
                                min="1"
                                max="400"
                                title="Overriding may shift activity schedule."
                                className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:border-transparent outline-none transition-shadow ${validationErrors.expected_growth_days
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 focus:ring-green-500'
                                    }`}
                                value={formData.expected_growth_days}
                                onChange={e => {
                                    setFormData({ ...formData, expected_growth_days: e.target.value });
                                    if (validationErrors.expected_growth_days) {
                                        setValidationErrors(prev => ({ ...prev, expected_growth_days: null }));
                                    }
                                }}
                            />
                            {validationErrors.expected_growth_days && (
                                <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                    <AlertTriangle size={12} className="shrink-0" /> {validationErrors.expected_growth_days}
                                </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">Variety default applies when you pick a catalog variety; override anytime.</p>
                        </div>
                        <div className="col-span-1 lg:col-span-1">
                            <label
                                className="text-sm font-medium text-gray-700 mb-1 block"
                                title="Overriding may shift activity schedule for pending system-generated tasks."
                            >
                                Adjustment (days)
                            </label>
                            <input
                                type="number"
                                min="-60"
                                max="120"
                                title="Overriding may shift activity schedule."
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.adjustment_days}
                                onChange={e => setFormData({ ...formData, adjustment_days: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Delays or advances (e.g. weather): shifts expected harvest.</p>
                        </div>
                        <div className="col-span-1 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Expected harvest (computed)</label>
                            <input
                                type="text"
                                readOnly
                                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-800"
                                value={previewExpectedHarvest || '—'}
                            />
                            <p className="text-xs text-gray-500 mt-1">Planting date + growth days + adjustment. Saved by the server on submit.</p>
                        </div>
                        <div className="col-span-1 md:col-span-3 lg:col-span-4 flex items-start gap-2">
                            <input
                                id="growth-manual-override"
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-700"
                                checked={!!formData.growth_plan_manual_override}
                                onChange={(e) => setFormData({ ...formData, growth_plan_manual_override: e.target.checked })}
                                disabled={!!editingItem && isCompletedPlanting(editingItem)}
                            />
                            <label htmlFor="growth-manual-override" className="text-sm text-gray-700 cursor-pointer">
                                <span className="font-medium">Manual growth plan override</span>
                                <span className="block text-xs text-gray-500 mt-0.5" title="Logged for audit. When changing variety, your growth days are kept (clamped to catalog min/max) instead of resetting to the new variety default.">
                                    Marks this planting so variety changes do not reset expected growth days to the catalog default. Audit log records override toggles.
                                </span>
                            </label>
                        </div>
                        {(!editingItem || !isCompletedPlanting(editingItem)) && (
                            <div className="col-span-1 md:col-span-3 lg:col-span-4 border border-dashed border-gray-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Generate selected system activities now (optional)</p>
                                <p className="text-xs text-gray-600 dark:text-slate-300 mb-2">
                                    Inserts only <strong>missing</strong> template slots (idempotent). Useful for Planned plantings or early field work before setting lifecycle to Active.
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                    {SYSTEM_TEMPLATE_SLOTS.map(({ i, short }) => (
                                        <label key={i} className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 text-green-700 bg-white dark:bg-slate-700"
                                                checked={partialTemplateIndices.includes(i)}
                                                onChange={() => togglePartialTemplate(i)}
                                            />
                                            <span title={`Template index ${i}`}>{short}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        {!editingItem ? (
                            <div className="col-span-1 md:col-span-2 lg:col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Lifecycle *</label>
                                <div className="relative">
                                    <select
                                        required
                                        className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow appearance-none bg-white text-gray-800"
                                        value={formData.lifecycle_state}
                                        onChange={(e) => setFormData({ ...formData, lifecycle_state: e.target.value })}
                                    >
                                        {LIFECYCLE_OPTIONS_CREATE.map((o) => (
                                            <option key={o.value} value={o.label}>{o.label}</option>
                                        ))}
                                    </select>
                                    <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                        <ChevronDown size={16} />
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Choose <strong>Planned</strong> to defer the ten system activities until you move this planting to Active (edit later or on first field work).
                                </p>
                            </div>
                        ) : (
                            <div className="col-span-1 md:col-span-2 lg:col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Lifecycle state *</label>
                                <div className="relative">
                                    <select
                                        required
                                        disabled={isCompletedPlanting(editingItem)}
                                        className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow disabled:bg-gray-50 appearance-none bg-white text-gray-800"
                                        value={formData.lifecycle_state}
                                        onChange={(e) => setFormData({ ...formData, lifecycle_state: e.target.value })}
                                    >
                                        {LIFECYCLE_OPTIONS_EDIT.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                    <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                        <ChevronDown size={16} />
                                    </span>
                                </div>
                            </div>
                        )}
                        {/* Season — only on create */}
                        {!editingItem && (
                            <div className="col-span-1 lg:col-span-1">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Season *</label>
                                <div className="relative">
                                    <select
                                        required
                                        className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow appearance-none bg-white text-gray-800"
                                        value={formData.season}
                                        onChange={e => setFormData({ ...formData, season: e.target.value })}
                                    >
                                        <option value="wet">Wet Season</option>
                                        <option value="dry">Dry Season</option>
                                    </select>
                                    <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                        <ChevronDown size={16} />
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Season is a reporting label (wet/dry). System activities use your growth plan when the crop is Active.
                                </p>
                            </div>
                        )}
                        <div className={`col-span-1 ${editingItem ? 'md:col-span-2 lg:col-span-2' : 'lg:col-span-1'}`}>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Status *</label>
                            <div className="relative">
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow appearance-none bg-white text-gray-800"
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                >
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                    <option value="failed">Failed</option>
                                </select>
                                <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </span>
                            </div>
                        </div>
                        {/* Growth stage info — read-only */}
                        {editingItem && (
                            <div className="col-span-1 md:col-span-3 lg:col-span-4">
                                <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                    🌱 <strong>Growth stage</strong> (badge) is a display hint from lifecycle and optional recorded stage — not driven by calendar formulas alone.
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={handleCloseModal} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Planting'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Planting Record"
                message="Are you sure? All related activities and harvest data may be affected."
            />



            {/* Sliding Bulk Export Drawer */}
            <AnimatePresence>
                {isExportDrawerOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsExportDrawerOpen(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                        />

                        {/* Drawer Container */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-gray-100"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Export Report</h2>
                                    <p className="text-xs text-gray-500">Select a completed planting or export all records</p>
                                </div>
                                <button
                                    onClick={() => setIsExportDrawerOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleBulkExport} className="flex-1 overflow-y-auto p-6 space-y-5">
                                {/* Format Selector Toggle */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Export Format</label>
                                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => setExportFormat('csv')}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all outline-none focus:outline-none ${exportFormat === 'csv'
                                                ? 'bg-neutral-50 text-blue-700 shadow-sm dark:bg-slate-700 dark:text-white'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/40'
                                                }`}
                                        >
                                            CSV Spreadsheet
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setExportFormat('pdf')}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all outline-none focus:outline-none ${exportFormat === 'pdf'
                                                ? 'bg-neutral-50 text-blue-700 shadow-sm dark:bg-slate-700 dark:text-white'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/40'
                                                }`}
                                        >
                                            PDF Report
                                        </button>
                                    </div>
                                </div>

                                {/* List of Completed Records for quick export */}
                                <div className="border-t border-gray-100 pt-4 space-y-3">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                                        Select Completed Record ({completedPlantings.length})
                                    </label>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {completedPlantings.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic">No completed records found.</p>
                                        ) : (
                                            completedPlantings.map(p => {
                                                const isSelected = selectedCompletedId === p.id;
                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => setSelectedCompletedId(isSelected ? null : p.id)}
                                                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${isSelected
                                                            ? 'border-green-500 bg-green-50/50 text-green-900 shadow-sm font-semibold dark:border-green-500/80 dark:bg-green-950/20 dark:text-green-200'
                                                            : 'border-gray-200 hover:border-blue-200 bg-slate-50/40 hover:bg-blue-50/20 text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:bg-slate-700/40 dark:text-slate-300'
                                                            }`}
                                                    >
                                                        <div className="min-w-0 pr-2">
                                                            <div className={`font-bold text-xs truncate transition-colors ${isSelected
                                                                ? 'text-green-800 dark:text-green-300'
                                                                : 'text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400'
                                                                }`}>
                                                                {p.variety}
                                                            </div>
                                                            <div className={`text-[10px] truncate mt-0.5 ${isSelected
                                                                ? 'text-green-700/80 dark:text-green-400/80'
                                                                : 'text-slate-500 dark:text-slate-400'
                                                                }`}>
                                                                {p.field_name} • {p.season} Season
                                                            </div>
                                                            <div className={`text-[9px] mt-1 font-medium ${isSelected
                                                                ? 'text-green-600/70 dark:text-green-500/70'
                                                                : 'text-gray-400 dark:text-slate-500'
                                                                }`}>
                                                                Planted: {p.planting_date?.slice(0, 10)}
                                                            </div>
                                                        </div>
                                                        <div className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${isSelected
                                                            ? 'bg-white border-green-300 text-green-600 dark:bg-slate-800 dark:border-green-700 dark:text-green-400'
                                                            : 'bg-white border-gray-200 text-gray-400 group-hover:text-blue-600 group-hover:border-blue-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:group-hover:text-blue-400 dark:group-hover:border-blue-500'
                                                            }`}>
                                                            {isSelected ? (
                                                                <Check size={12} strokeWidth={3} />
                                                            ) : (
                                                                <FileDown size={12} />
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </form>

                            {/* Footer Submit */}
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col gap-2">
                                <button
                                    onClick={handleBulkExport}
                                    disabled={bulkExporting || downloadingRowId !== null}
                                    className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-2"
                                >
                                    {bulkExporting || downloadingRowId !== null ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Generating Export...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileDown size={16} />
                                            <span>
                                                {selectedCompletedId
                                                    ? `Download Selected ${exportFormat.toUpperCase()} Report`
                                                    : `Download ${exportFormat.toUpperCase()} Report`}
                                            </span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsExportDrawerOpen(false); setSelectedCompletedId(null); }}
                                    className="w-full bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Plantings;
