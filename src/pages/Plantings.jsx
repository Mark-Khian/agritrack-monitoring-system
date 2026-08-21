import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Sprout, AlertTriangle, ChevronDown, FileDown, Loader2, Printer, X, Calendar, Check, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import Select from '../components/Select';
import MonthPicker from '../components/MonthPicker';
import {
    getPlantings, createPlanting, updatePlanting, deletePlanting, getVarieties,
    exportPlantingsCSV, exportPlantingsPDF, exportPlantingPDF
} from '../services/api';
import { SkeletonTable } from '../components/Skeleton';
import { formatDisplayDate } from '../utils/dateFormatter';

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


const getTabClass = (tabId, isActive) => {
    const base = 'flex-1 sm:flex-none min-h-10 px-3 py-2 rounded-lg text-xs font-semibold outline-none focus:outline-none whitespace-nowrap transition-colors duration-150 border';
    if (!isActive) {
        return `${base} border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/40`;
    }
    switch (tabId) {
        case 'active':
            return `${base} bg-green-50 text-green-700 border-green-200 shadow-sm dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50`;
        case 'completed':
            return `${base} bg-blue-50 text-blue-700 border-blue-200 shadow-sm dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50`;
        case 'all':
        default:
            return `${base} bg-white text-slate-700 border-slate-200 shadow-sm dark:bg-slate-700 dark:text-white dark:border-slate-600`;
    }
};

const Plantings = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [cameFromDashboard, setCameFromDashboard] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('from') === 'dashboard';
    });
    const [plantings, setPlantings] = useState(plantingsCache || []);
    const [loading, setLoading] = useState(!plantingsCache);
    const [isRetrying, setIsRetrying] = useState(false);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const globalToast = useToast();
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
        cropping_season: '', status: 'active'
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

    const handleRetry = async () => {
        setIsRetrying(true);
        setError(null);
        await fetchData();
        setIsRetrying(false);
    };


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
                cropping_season: item.cropping_season || '',
                establishment_method: item.establishment_method || '',
                field_condition: item.field_condition || '',
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
                cropping_season: '',
                establishment_method: '',
                field_condition: '',
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
        if (!formData.cropping_season) {
            errors.cropping_season = 'Season is required.';
        }
        if (!formData.variety_class) {
            errors.variety_class = 'Variety Class is required.';
        }
        if (!formData.variety) {
            errors.variety = 'Rice Variety is required.';
        }
        if (!formData.planting_date) {
            errors.planting_date = 'Planting Date is required.';
        } else {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (formData.planting_date > todayStr) {
                errors.planting_date = 'Planting date cannot be in the future.';
            }
        }
        if (!formData.expected_growth_days || Number(formData.expected_growth_days) < 1) {
            errors.expected_growth_days = 'Growth days must be at least 1.';
        }
        
        const adj = Number(formData.adjustment_days || 0);
        if (isNaN(adj) || adj < -60 || adj > 120) {
            errors.adjustment_days = 'Adjustment must be between -60 and 120 days.';
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
                    cropping_season: formData.cropping_season,
                    establishment_method: formData.establishment_method,
                    field_condition: formData.field_condition,
                    lifecycle_state: formData.lifecycle_state,
                    status: formData.status,
                    generate_template_indices: partialPayload,
                });
                globalToast.success('Planting updated successfully!');
            } else {
                await createPlanting({
                    field_name: normalizedFieldName,
                    variety_class: formData.variety_class,
                    variety: formData.variety,
                    variety_id: formData.variety_id ? Number(formData.variety_id) : undefined,
                    planting_date: formData.planting_date,
                    cropping_season: formData.cropping_season,
                    expected_growth_days: formData.expected_growth_days !== ''
                        ? Number(formData.expected_growth_days)
                        : undefined,
                    adjustment_days: Number(formData.adjustment_days || 0),
                    growth_plan_manual_override: !!formData.growth_plan_manual_override,
                    cropping_season: formData.cropping_season,
                    establishment_method: formData.establishment_method,
                    field_condition: formData.field_condition,
                    lifecycle_state: formData.lifecycle_state,
                    generate_template_indices: partialPayload,
                });
                globalToast.success('Planting created successfully!');
            }
            handleCloseModal();
            await fetchData();
        } catch (err) {
            if (err.response?.status === 400 && err.response?.data?.errors) {
                const errs = {};
                err.response.data.errors.forEach(e => { errs[e.field] = e.message; });
                setValidationErrors(errs);
            } else {
                setFormError(err.response?.data?.message || 'Failed to save planting.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (id) => { setDeletingId(id); setIsConfirmOpen(true); };
    const confirmDelete = async () => {
        try {
            await deletePlanting(deletingId);
            await fetchData();
            globalToast.success('Planting deleted successfully!');
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
    const [selectedPlantingIds, setSelectedPlantingIds] = useState([]);

    // Reset selection when drawer is closed
    useEffect(() => {
        if (!isExportDrawerOpen) {
            setSelectedPlantingIds([]);
        }
    }, [isExportDrawerOpen]);

    const handleSingleExportPDF = async (id) => {
        setDownloadingRowId(id);
        try {
            const res = await exportPlantingPDF(id);
            const url = window.URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `planting_report_${id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setIsExportDrawerOpen(false);
            globalToast.success('Completed Crop Records PDF exported successfully.');
        } catch (err) {
            console.error('Failed to export single planting report:', err);
            globalToast.error('Failed to download report. Please try again.');
        } finally {
            setDownloadingRowId(null);
        }
    };

    const handleBulkExport = async (e) => {
        e?.preventDefault();
        
        if (selectedPlantingIds.length === 0) {
            return;
        }

        setBulkExporting(true);
        try {
            let res;
            const dateStr = new Date().toISOString().slice(0, 10);
            const params = { plantingIds: selectedPlantingIds.join(',') };
            
            if (exportFormat === 'csv') {
                res = await exportPlantingsCSV(params);
                
                if (res.data.type === 'application/json') {
                    const text = await res.data.text();
                    throw { response: { data: res.data, isParsed: true, parsedData: JSON.parse(text) } };
                }
                
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                link.download = `completed-crop-records-${dateStr}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } else {
                res = await exportPlantingsPDF(params);
                
                if (res.data.type === 'application/json') {
                    const text = await res.data.text();
                    throw { response: { data: res.data, isParsed: true, parsedData: JSON.parse(text) } };
                }
                
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                link.download = `completed-crop-records-${dateStr}.pdf`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            }
            setIsExportDrawerOpen(false);
            globalToast.success(exportFormat === 'csv' ? 'Completed Crop Records CSV exported successfully.' : 'Completed Crop Records PDF exported successfully.');
        } catch (err) {
            console.error('Export failed:', err);
            let msg = exportFormat === 'csv' ? 'Failed to export Completed Crop Records CSV. Please try again.' : 'Failed to export Completed Crop Records PDF. Please try again.';
            if (err.response?.isParsed) {
                msg = err.response.parsedData?.message || msg;
            } else if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const json = JSON.parse(text);
                    msg = json.message || msg;
                } catch (e) {
                    // Ignore JSON parse error
                }
            }
            globalToast.error(msg);
        } finally {
            setBulkExporting(false);
        }
    };

    return (
        <div className="space-y-6">

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
                                className={getTabClass(tab.id, statusFilter === tab.id)}
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
                                    globalToast.info('No completed plantings available to export yet.');
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

            {loading || isRetrying ? (
                <div className="space-y-4">
                    {isRetrying && (
                        <div className="flex justify-start">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                                <Loader2 size={14} className="animate-spin text-slate-500 dark:text-slate-400" />
                                Retrying...
                            </div>
                        </div>
                    )}
                    <SkeletonTable
                        rows={6}
                        cols={7}
                        columnHeaders={['Variety', 'Field', 'Season', 'Growth Stage', 'Planting Date', 'Expected Harvest', 'Actions']}
                    />
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={handleRetry} disabled={isRetrying} className="underline disabled:opacity-50 disabled:cursor-not-allowed">Retry</button>
                </div>
            ) : visiblePlantings.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-16 text-center dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex flex-col items-center gap-3">
                        <Sprout size={40} className="text-gray-200 dark:text-slate-600" />
                        <p className="text-gray-400 dark:text-slate-400 text-sm font-medium">
                            {plantings.length === 0 ? 'No plantings yet.' : `No plantings found in the ${statusFilter} tab.`}
                        </p>
                        <p className="text-gray-300 dark:text-slate-500 text-xs">
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
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500 break-words">
                                            {p.variety_class || 'Unclassified'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isCompletedPlanting(p) && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedPlantingIds([p.id]);
                                                        setIsExportDrawerOpen(true);
                                                    }}
                                                    className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600"
                                                    title="Export planting report"
                                                >
                                                    <Printer size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenModal(p)}
                                                    className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                                                    title="View planting details"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </>
                                        )}
                                        {!isCompletedPlanting(p) && (
                                            <>
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
                                            </>
                                        )}
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
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Planted:</span>
                                        <span className="font-medium text-gray-800">{p.planting_date ? formatDisplayDate(p.planting_date) : '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Exp. Harvest:</span>
                                        <span className="font-medium text-gray-800">{p.expected_harvest ? formatDisplayDate(p.expected_harvest) : '—'}</span>
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
                    <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[1000px]">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-slate-800/50 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
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
                                        <tr key={p.id} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors duration-200">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-bold text-gray-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                                                        {p.variety}
                                                        {!!Number(p.growth_plan_manual_override) && (
                                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                                                                Manual plan
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{p.variety_class || 'Unclassified'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 font-medium">{p.field_name}</td>
                                            <td className="px-6 py-4">
                                                <span className="capitalize text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-md text-xs font-semibold">
                                                    {p.season}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col text-xs space-y-1">
                                                    <div className="text-gray-600 dark:text-slate-400">
                                                        P: <span className="font-medium">{p.planting_date ? formatDisplayDate(p.planting_date) : '—'}</span>
                                                    </div>
                                                    <div className="text-gray-600 dark:text-slate-400">
                                                        H: <span className="font-medium">{p.expected_harvest ? formatDisplayDate(p.expected_harvest) : '—'}</span>
                                                    </div>
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
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedPlantingIds([p.id]);
                                                                setIsExportDrawerOpen(true);
                                                            }}
                                                            className="p-2 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors inline-flex items-center justify-center"
                                                            title="Export planting report"
                                                        >
                                                            <Printer size={16} />
                                                        </button>
                                                        <button onClick={() => handleOpenModal(p)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="View planting details">
                                                            <Eye size={16} />
                                                        </button>
                                                    </>
                                                )}
                                                {!isCompletedPlanting(p) && (
                                                    <>
                                                        <button onClick={() => handleOpenModal(p)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button onClick={() => handleDeleteClick(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
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
                title={editingItem ? (isCompletedPlanting(editingItem) ? 'View Planting Details' : 'Edit Planting') : 'Log New Planting'}
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
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Field Name {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.field_name}
                                </div>
                            ) : (
                                <>
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
                                </>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Field details are tracked per planting record (Fields page removed).
                            </p>
                        </div>
                        <div className="col-span-1 md:col-span-1 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Variety Class {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {categoryOptions.find(o => o.value === formData.variety_class)?.label || formData.variety_class}
                                </div>
                            ) : (
                                <>
                                    <div id="form-field-variety_class">
                                        <Select
                                            id="variety-class-select"
                                            value={formData.variety_class}
                                            onChange={(e) => {
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
                                            options={categoryOptions}
                                            placeholder="Select category"
                                            required
                                            className={validationErrors.variety_class ? 'border-red-500 focus:ring-red-500' : ''}
                                        />
                                    </div>
                                    {validationErrors.variety_class && (
                                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} className="shrink-0" /> {validationErrors.variety_class}
                                        </p>
                                    )}
                                </>
                            )}
                            {formData.variety_class && (
                                <p className="text-xs text-gray-500 mt-1" title={CATEGORY_HINTS[formData.variety_class]}>
                                    {CATEGORY_HINTS[formData.variety_class]}
                                </p>
                            )}
                        </div>
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Rice Variety {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.variety}
                                </div>
                            ) : (
                                <>
                                    <div id="form-field-variety">
                                        <Select
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
                                </>
                            )}
                            {formData.variety && varietiesForClass.find((v) => v.name === formData.variety) && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Typical growth window:{' '}
                                    {varietiesForClass.find((v) => v.name === formData.variety)?.min_growth_days}
                                    –
                                    {varietiesForClass.find((v) => v.name === formData.variety)?.max_growth_days}
                                    {' '}days
                                </p>
                            )}
                        </div>
                        {/* Planting date */}
                        <div className="col-span-1 md:col-span-1 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Planting Date {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.planting_date ? formatDisplayDate(formData.planting_date) : '—'}
                                </div>
                            ) : (
                                <>
                                    <div id="form-field-planting_date">
                                        <MonthPicker
                                            id="planting-date-picker"
                                            value={formData.planting_date}
                                            maxDate={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`}
                                            onChange={e => {
                                                setFormData({ ...formData, planting_date: e.target.value });
                                                if (validationErrors.planting_date) {
                                                    setValidationErrors(prev => ({ ...prev, planting_date: null }));
                                                }
                                            }}
                                            required
                                            className={validationErrors.planting_date ? 'border-red-500 focus:ring-red-500' : ''}
                                        />
                                    </div>
                                    {validationErrors.planting_date && (
                                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} className="shrink-0" /> {validationErrors.planting_date}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="col-span-1 lg:col-span-1">
                            <label
                                className="text-sm font-medium text-gray-700 mb-1 block"
                                title="Overriding may shift activity schedule for pending system-generated tasks."
                            >
                                Expected growth (days) {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}
                            </label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.expected_growth_days}
                                </div>
                            ) : (
                                <>
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
                                </>
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
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.adjustment_days}
                                </div>
                            ) : (
                                <>
                                    <input
                                        id="form-field-adjustment_days"
                                        type="number"
                                        min="-60"
                                        max="120"
                                        title="Overriding may shift activity schedule."
                                        className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:border-transparent outline-none transition-shadow ${validationErrors.adjustment_days
                                            ? 'border-red-500 focus:ring-red-500'
                                            : 'border-gray-300 focus:ring-green-500'
                                            }`}
                                        value={formData.adjustment_days}
                                        onChange={e => {
                                            setFormData({ ...formData, adjustment_days: e.target.value });
                                            if (validationErrors.adjustment_days) {
                                                setValidationErrors(prev => ({ ...prev, adjustment_days: null }));
                                            }
                                        }}
                                    />
                                    {validationErrors.adjustment_days && (
                                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} className="shrink-0" /> {validationErrors.adjustment_days}
                                        </p>
                                    )}
                                </>
                            )}
                            <p className="text-xs text-gray-500 mt-1">Delays or advances (e.g. weather): shifts expected harvest.</p>
                        </div>
                        <div className="col-span-1 lg:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Expected Harvest</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {previewExpectedHarvest
                                        ? formatDisplayDate(previewExpectedHarvest)
                                        : '—'}
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    readOnly
                                    className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-800"
                                    value={
                                        previewExpectedHarvest
                                            ? formatDisplayDate(previewExpectedHarvest)
                                            : '—'
                                    }
                                />
                            )}
                            <p className="text-xs text-gray-500 mt-1">Computed automatically from planting date + growth days + adjustment. Saved by the server on submit.</p>
                        </div>



                        {/* Establishment Method */}
                        <div className="col-span-1 lg:col-span-1">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Establishment Method {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.establishment_method === 'TRANSPLANTED' ? 'Transplanted' : formData.establishment_method === 'DIRECT_SEEDED' ? 'Direct Seeded' : formData.establishment_method || '—'}
                                </div>
                            ) : (
                                <>
                                    <div id="form-field-establishment_method">
                                        <Select
                                            id="establishment-method-select"
                                            value={formData.establishment_method}
                                            onChange={e => {
                                                setFormData({ ...formData, establishment_method: e.target.value });
                                                if (validationErrors.establishment_method) {
                                                    setValidationErrors(prev => ({ ...prev, establishment_method: null }));
                                                }
                                            }}
                                            options={[
                                                { value: 'TRANSPLANTED', label: 'Transplanted' },
                                                { value: 'DIRECT_SEEDED', label: 'Direct Seeded' }
                                            ]}
                                            placeholder="Select method"
                                            required
                                            className={validationErrors.establishment_method ? 'border-red-500 focus:ring-red-500' : ''}
                                        />
                                    </div>
                                    {validationErrors.establishment_method && (
                                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} className="shrink-0" /> {validationErrors.establishment_method}
                                        </p>
                                    )}
                                </>
                            )}
                            <p className="text-xs text-gray-500 mt-2">
                                How the rice crop is established in the field (transplanted or direct seeded).
                            </p>
                        </div>

                        {/* Field Condition */}
                        <div className="col-span-1 lg:col-span-1">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Field Condition {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.field_condition === 'IRRIGATED' ? 'Irrigated' : formData.field_condition === 'RAINFED' ? 'Rainfed' : formData.field_condition || '—'}
                                </div>
                            ) : (
                                <>
                                    <div id="form-field-field_condition">
                                        <Select
                                            id="field-condition-select"
                                            value={formData.field_condition}
                                            onChange={e => {
                                                setFormData({ ...formData, field_condition: e.target.value });
                                                if (validationErrors.field_condition) {
                                                    setValidationErrors(prev => ({ ...prev, field_condition: null }));
                                                }
                                            }}
                                            options={[
                                                { value: 'IRRIGATED', label: 'Irrigated' },
                                                { value: 'RAINFED', label: 'Rainfed' }
                                            ]}
                                            placeholder="Select condition"
                                            required
                                            className={validationErrors.field_condition ? 'border-red-500 focus:ring-red-500' : ''}
                                        />
                                    </div>
                                    {validationErrors.field_condition && (
                                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} className="shrink-0" /> {validationErrors.field_condition}
                                        </p>
                                    )}
                                </>
                            )}
                            <p className="text-xs text-gray-500 mt-2">
                                Indicates whether the field is irrigated or primarily rainfed.
                            </p>
                        </div>

                        {/* Season */}
                        <div className="col-span-1 lg:col-span-1">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Season {(!editingItem || !isCompletedPlanting(editingItem)) && '*'}</label>
                            {!!editingItem && isCompletedPlanting(editingItem) ? (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                                    {formData.cropping_season === 'WET_SEASON' ? 'Wet Season' : formData.cropping_season === 'DRY_SEASON' ? 'Dry Season' : formData.cropping_season}
                                </div>
                            ) : (
                                <>
                                    <div id="form-field-cropping_season">
                                        <Select
                                            id="cropping-season-select"
                                            value={formData.cropping_season}
                                            onChange={e => {
                                                setFormData({ ...formData, cropping_season: e.target.value });
                                                if (validationErrors.cropping_season) {
                                                    setValidationErrors(prev => ({ ...prev, cropping_season: null }));
                                                }
                                            }}
                                            options={[
                                                { value: 'WET_SEASON', label: 'Wet Season' },
                                                { value: 'DRY_SEASON', label: 'Dry Season' }
                                            ]}
                                            placeholder="Select season"
                                            required
                                            className={validationErrors.cropping_season ? 'border-red-500 focus:ring-red-500' : ''}
                                        />
                                    </div>
                                    {validationErrors.cropping_season && (
                                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} className="shrink-0" /> {validationErrors.cropping_season}
                                        </p>
                                    )}
                                </>
                            )}
                            <p className="text-xs text-gray-500 mt-2">
                                Season is a reporting label (wet/dry). System activities use your growth plan when the crop is Active.
                            </p>
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
                        <button type="button" onClick={handleCloseModal} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">
                            {editingItem && isCompletedPlanting(editingItem) ? 'Close' : 'Cancel'}
                        </button>
                        {(!editingItem || !isCompletedPlanting(editingItem)) && (
                            <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Planting'}
                            </button>
                        )}
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
                            exit={{ opacity: 0, pointerEvents: 'none' }}
                            onClick={() => setIsExportDrawerOpen(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                        />

                        {/* Drawer Container */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%', pointerEvents: 'none' }}
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
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                                            Select Completed Record ({completedPlantings.length})
                                        </label>
                                        {completedPlantings.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (selectedPlantingIds.length === completedPlantings.length) {
                                                        setSelectedPlantingIds([]);
                                                    } else {
                                                        setSelectedPlantingIds(completedPlantings.map(p => p.id));
                                                    }
                                                }}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                            >
                                                {selectedPlantingIds.length === completedPlantings.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {completedPlantings.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic">No completed records found.</p>
                                        ) : (
                                            completedPlantings.map(p => {
                                                const isSelected = selectedPlantingIds.includes(p.id);
                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => setSelectedPlantingIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
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
                                                                Planted: {p.planting_date ? formatDisplayDate(p.planting_date) : '—'}
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
                                    disabled={bulkExporting || downloadingRowId !== null || selectedPlantingIds.length === 0}
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
                                                {selectedPlantingIds.length > 0 ? `Download Selected ${exportFormat.toUpperCase()} Report` : `Download ${exportFormat.toUpperCase()} Report`}
                                            </span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsExportDrawerOpen(false); setSelectedPlantingIds([]); }}
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
