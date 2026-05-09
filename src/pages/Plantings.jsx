import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Sprout, AlertTriangle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import DownwardSelect from '../components/DownwardSelect';
import {
    getPlantings, createPlanting, updatePlanting, deletePlanting, getFields, getFarms, getVarieties
} from '../services/api';

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

/** Matches server template indices 0–6 */
const SYSTEM_TEMPLATE_SLOTS = [
    { i: 0, short: 'Seeding check' },
    { i: 1, short: '1st fertilizer (basal)' },
    { i: 2, short: 'Transplanting' },
    { i: 3, short: 'Early pest monitoring' },
    { i: 4, short: '2nd fertilizer' },
    { i: 5, short: 'Pre-harvest pest' },
    { i: 6, short: 'Final irrigation' },
];

const Plantings = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [plantings, setPlantings] = useState([]);
    const [fields, setFields] = useState([]);
    const [farms, setFarms] = useState([]);
    const [farmFields, setFarmFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [formError, setFormError] = useState('');
    const [showCompletedPlantings, setShowCompletedPlantings] = useState(false);
    const [varietiesCatalog, setVarietiesCatalog] = useState([]);
    const [editVarietyBaseline, setEditVarietyBaseline] = useState(null);
    const [partialTemplateIndices, setPartialTemplateIndices] = useState([]);

    const [formData, setFormData] = useState({
        farm_id: '', field_id: '', variety_class: '', variety: '', variety_id: '',
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
    const fieldsForSelectedFarm = formData.farm_id
        ? farmFields
        : fields.filter((f) => String(f.farm_id) === String(formData.farm_id));

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [pRes, fRes, farmsRes] = await Promise.all([
                getPlantings(),
                getFields(),
                getFarms(),
            ]);
            setPlantings(pRes.data.data || []);
            setFields(fRes.data.data || []);
            setFarms(farmsRes.data.data || []);
        } catch (err) {
            setError('Failed to load plantings. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

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

    // Deep link from Fields: /plantings?farm_id=…&field_id=… — open Add Planting with plot prefilled
    useEffect(() => {
        if (loading) return;
        const fieldIdParam = searchParams.get('field_id');
        const farmIdParam = searchParams.get('farm_id');
        if (!fieldIdParam && !farmIdParam) return;

        const clearDeepLinkParams = () => {
            const next = new URLSearchParams(searchParams);
            next.delete('field_id');
            next.delete('farm_id');
            setSearchParams(next, { replace: true });
        };

        if (fieldIdParam) {
            const fid = String(fieldIdParam);
            const fieldRow = fields.find((f) => String(f.id) === fid);
            if (!fieldRow) {
                if (fields.length === 0) return;
                clearDeepLinkParams();
                return;
            }
            setFormError('');
            setEditingItem(null);
            setFormData({
                farm_id: String(fieldRow.farm_id),
                field_id: fid,
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
            setPartialTemplateIndices([]);
            setIsModalOpen(true);
            clearDeepLinkParams();
            return;
        }

        const resolvedFarm = farmIdParam ? String(farmIdParam) : String(farms[0]?.id || '');
        if (!resolvedFarm) return;
        setFormError('');
        setEditingItem(null);
        setFormData({
            farm_id: resolvedFarm,
            field_id: '',
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
        setPartialTemplateIndices([]);
        setIsModalOpen(true);
        clearDeepLinkParams();
    }, [loading, fields, farms, searchParams, setSearchParams]);

    useEffect(() => {
        const fetchFarmFields = async () => {
            if (!isModalOpen || editingItem || !formData.farm_id) {
                setFarmFields([]);
                return;
            }
            try {
                const res = await getFields({ farm_id: formData.farm_id });
                setFarmFields(res.data.data || []);
            } catch {
                setFarmFields([]);
            }
        };
        fetchFarmFields();
    }, [formData.farm_id, isModalOpen, editingItem]);

    const handleOpenModal = (item = null) => {
        setFormError('');
        setPartialTemplateIndices([]);
        if (item) {
            setFormData({
                farm_id: item.farm_id || '',
                field_id: item.field_id,
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
                farm_id: farms[0]?.id || '',
                field_id: '',
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

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            const partialPayload = partialTemplateIndices.length > 0 ? partialTemplateIndices : undefined;
            if (editingItem) {
                await updatePlanting(editingItem.id, {
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
            } else {
                await createPlanting({
                    field_id: formData.field_id,
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
            }
            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to save planting.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (id) => { setDeletingId(id); setIsConfirmOpen(true); };
    const confirmDelete = async () => {
        try { await deletePlanting(deletingId); await fetchData(); }
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

    const visiblePlantings = (plantings || []).filter((p) => {
        if (showCompletedPlantings) return true;
        return !isCompletedPlanting(p);
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Crop Plantings</h1>
                    <p className="text-sm text-gray-500">Monitor currently growing rice varieties and stages</p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                        <input
                            type="checkbox"
                            checked={showCompletedPlantings}
                            onChange={(e) => setShowCompletedPlantings(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                        />
                        Show completed plantings
                    </label>
                    <button
                        onClick={() => handleOpenModal()}
                        disabled={fields.length === 0}
                        className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus size={16} /> Add Planting
                    </button>
                </div>
            </div>

            {/* Dependency guard */}
            {!loading && fields.length === 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                    <span>You need to <strong>add Fields first</strong> before creating plantings.</span>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={fetchData} className="underline">Retry</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-400 text-sm">Loading plantings...</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                                {visiblePlantings.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <Sprout size={40} className="text-gray-200" />
                                                <p className="text-gray-400 text-sm font-medium">
                                                    {plantings.length === 0 ? 'No plantings yet.' : 'All visible plantings are completed.'}
                                                </p>
                                                <p className="text-gray-300 text-xs">
                                                    {plantings.length === 0
                                                        ? 'Active plantings get seven ratio-based system activities; Planned plantings defer until you activate.'
                                                        : 'Enable "Show completed plantings" to view archived records.'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    visiblePlantings.map((p) => (
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
                                                    {showCompletedPlantings && isCompletedPlanting(p) && (
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
                                            {/* growth_stage is computed by backend — read-only badge */}
                                            <td className="px-6 py-4"><Badge status={p.growth_stage} /></td>
                                            <td className="px-6 py-4"><Badge status={p.status} /></td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => handleOpenModal(p)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteClick(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Planting' : 'Log New Planting'}>
                <form onSubmit={handleSave} className="space-y-4">
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
                    <div className="grid grid-cols-2 gap-4">
                        {/* Field selector — only shown when creating */}
                        {!editingItem && (
                            <div className="col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Farm *</label>
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                    value={formData.farm_id}
                                    onChange={e => setFormData({ ...formData, farm_id: e.target.value, field_id: '' })}
                                >
                                    <option value="">Select Farm</option>
                                    {farms.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {!editingItem && (
                            <div className="col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Field *</label>
                                <div className="space-y-2">
                                    <select
                                        required
                                        disabled={!formData.farm_id}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow disabled:bg-gray-50 disabled:text-gray-400"
                                        value={formData.field_id}
                                        onChange={e => setFormData({ ...formData, field_id: e.target.value })}
                                    >
                                        <option value="">{formData.farm_id ? 'Select Field' : 'Select Farm first'}</option>
                                        {fieldsForSelectedFarm.map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500">
                                        You can reuse the same plot for a new crop cycle, even if it was used in a completed (archived) planting.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/fields')}
                                        className="text-xs text-green-700 hover:text-green-800 font-medium hover:underline"
                                    >
                                        + Add New Field
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Variety Class *</label>
                            <select
                                required
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.variety_class}
                                onChange={e => setFormData({
                                    ...formData,
                                    variety_class: e.target.value,
                                    variety: '',
                                    variety_id: '',
                                })}
                            >
                                <option value="">Select category</option>
                                {categoryOptions.map((category) => (
                                    <option key={category} value={category}>{category}</option>
                                ))}
                            </select>
                            {formData.variety_class && (
                                <p className="text-xs text-gray-500 mt-1" title={CATEGORY_HINTS[formData.variety_class]}>
                                    {CATEGORY_HINTS[formData.variety_class]}
                                </p>
                            )}
                        </div>
                        <div className="col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Rice Variety *</label>
                            {/* DownwardSelect always opens below — scoped fix for Irrigated/Lowland flipping */}
                            <DownwardSelect
                                id="rice-variety-select"
                                value={formData.variety}
                                onChange={handleVarietyPick}
                                options={selectedVarietyOptions}
                                placeholder={formData.variety_class ? 'Select variety' : 'Select category first'}
                                disabled={!formData.variety_class}
                                required
                                maxDropdownH={220}
                            />
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
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Planting Date *</label>
                            <input
                                required
                                type="date"
                                disabled={!!editingItem && isCompletedPlanting(editingItem)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow disabled:bg-gray-50"
                                value={formData.planting_date}
                                onChange={e => setFormData({ ...formData, planting_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label
                                className="text-sm font-medium text-gray-700 mb-1 block"
                                title="Overriding may shift activity schedule for pending system-generated tasks."
                            >
                                Expected growth (days) *
                            </label>
                            <input
                                required
                                type="number"
                                min="1"
                                max="400"
                                title="Overriding may shift activity schedule."
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.expected_growth_days}
                                onChange={e => setFormData({ ...formData, expected_growth_days: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Variety default applies when you pick a catalog variety; override anytime.</p>
                        </div>
                        <div>
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
                        <div className="col-span-2 flex items-start gap-2">
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
                        <div className="col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Expected harvest (computed)</label>
                            <input
                                type="text"
                                readOnly
                                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-800"
                                value={previewExpectedHarvest || '—'}
                            />
                            <p className="text-xs text-gray-500 mt-1">Planting date + growth days + adjustment. Saved by the server on submit.</p>
                        </div>
                        {(!editingItem || !isCompletedPlanting(editingItem)) && (
                            <div className="col-span-2 border border-dashed border-gray-200 rounded-lg p-3 bg-slate-50/80">
                                <p className="text-sm font-medium text-gray-800 mb-1">Generate selected system activities now (optional)</p>
                                <p className="text-xs text-gray-600 mb-2">
                                    Inserts only <strong>missing</strong> template slots (idempotent). Useful for Planned plantings or early field work before setting lifecycle to Active.
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {SYSTEM_TEMPLATE_SLOTS.map(({ i, short }) => (
                                        <label key={i} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="h-3.5 w-3.5 rounded border-gray-300 text-green-700"
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
                            <div className="col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Lifecycle *</label>
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                    value={formData.lifecycle_state}
                                    onChange={(e) => setFormData({ ...formData, lifecycle_state: e.target.value })}
                                >
                                    {LIFECYCLE_OPTIONS_CREATE.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    Choose <strong>Planned</strong> to defer the seven system activities until you move this planting to Active (edit later or on first field work).
                                </p>
                            </div>
                        ) : (
                            <div className="col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Lifecycle state *</label>
                                <select
                                    required
                                    disabled={isCompletedPlanting(editingItem)}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow disabled:bg-gray-50"
                                    value={formData.lifecycle_state}
                                    onChange={(e) => setFormData({ ...formData, lifecycle_state: e.target.value })}
                                >
                                    {LIFECYCLE_OPTIONS_EDIT.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {/* Season — only on create */}
                        {!editingItem && (
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Season *</label>
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                    value={formData.season}
                                    onChange={e => setFormData({ ...formData, season: e.target.value })}
                                >
                                    <option value="wet">Wet Season</option>
                                    <option value="dry">Dry Season</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-2">
                                    Season is a reporting label (wet/dry). System activities use your growth plan when the crop is Active.
                                </p>
                            </div>
                        )}
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Status *</label>
                            <select
                                required
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>
                        {/* Growth stage info — read-only */}
                        {editingItem && (
                            <div className="col-span-2">
                                <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                    🌱 <strong>Growth stage</strong> (badge) is a display hint from lifecycle and optional recorded stage — not driven by calendar formulas alone.
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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
        </div>
    );
};

export default Plantings;
