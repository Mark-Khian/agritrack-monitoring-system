import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
    Wheat, TrendingUp, Sprout, Award,
    BarChart2, Home, Map as MapIcon, Tractor,
    Shovel, Droplets, Bug, Scissors,
    FlaskConical, Package, ChevronRight
} from 'lucide-react';

const API = 'http://localhost:5000/api/v1';
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

const PLANTING_VARIETY_CLASS_FILTERS = [
    { value: '', label: 'All classes' },
    { value: 'Irrigated / Lowland Varieties', label: 'Irrigated / Lowland' },
    { value: 'Rainfed / Dry-Seeded Varieties (DSR)', label: 'Rainfed / DSR' },
    { value: 'Upland Varieties', label: 'Upland' },
];

const harvestByMonth = (items) => {
    const months = {};
    items.forEach((h) => {
        const d = h?.harvest_date ? new Date(h.harvest_date) : null;
        if (!d || Number.isNaN(d.getTime())) return;
        const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        months[key] = (months[key] || 0) + Number(h.yield_kg || 0);
    });

    // Sort by actual date (not by string).
    const entries = Object.entries(months).map(([month, yield_kg]) => {
        const [mon, yr] = month.split(' ');
        const year = `20${yr}`; // matches "Jan 24"
        // Use first day of month as sort anchor.
        const dt = new Date(`${mon} 1, ${year}`);
        return { month, yield_kg, _dt: dt };
    });

    return entries
        .sort((a, b) => a._dt - b._dt)
        .map(({ month, yield_kg }) => ({ month, yield_kg: Number(yield_kg.toFixed(0)) }));
};

const getSuccessRate = (harvests) => {
    if (!harvests || harvests.length === 0) return 0;
    const total = harvests.length;
    const ok = harvests.filter((h) => {
        const q = String(h?.quality_grade || '').toLowerCase();
        return q === 'a' || q === 'b';
    }).length;
    return (ok / total) * 100;
};

const filterByDateRange = (items, dateKey, range) => {
    if (range === 'all') return items;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (range === '7d') start.setDate(start.getDate() - 7);
    if (range === '30d') start.setDate(start.getDate() - 30);
    if (range === '3m') start.setMonth(start.getMonth() - 3);

    return (items || []).filter((item) => {
        const d = item?.[dateKey] ? new Date(item[dateKey]) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        // Include today and future dates relative to start boundary.
        return d >= start;
    });
};

const formatActivityType = (t) => String(t || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const formatVariant = (v) => String(v || '—');

const formatNumber = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString();
};

const safeDate = (value) => (value ? new Date(String(value).slice(0, 10)) : null);

const getMaturityDays = (planting) => {
    if (Number.isFinite(Number(planting?.maturity_days)) && Number(planting.maturity_days) > 0) {
        return Number(planting.maturity_days);
    }
    if (Number.isFinite(Number(planting?.expected_growth_days)) && Number(planting.expected_growth_days) > 0) {
        return Math.max(
            1,
            Number(planting.expected_growth_days) + Number(planting?.adjustment_days || 0)
        );
    }
    const planted = safeDate(planting?.planting_date);
    const expected = safeDate(planting?.expected_harvest);
    if (planted && expected) {
        const diff = Math.round((expected - planted) / (1000 * 60 * 60 * 24));
        if (diff > 0) return diff;
    }
    return 120;
};

const getLifecycleProgressPercent = (planting) => {
    const pe = planting?.progress_estimate;
    if (pe != null && Number.isFinite(Number(pe))) {
        return Math.max(0, Math.min(100, Math.round(Number(pe) * 100)));
    }
    const planted = safeDate(planting?.planting_date);
    if (!planted) return 0;
    const maturityDays = getMaturityDays(planting);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.max(0, Math.round((today - planted) / (1000 * 60 * 60 * 24)));
    const percent = (elapsed / Math.max(1, maturityDays)) * 100;
    return Math.max(0, Math.min(100, Math.round(percent)));
};

const getYieldClass = (valueKg) => {
    const value = Number(valueKg);
    if (!Number.isFinite(value) || value <= 0) {
        return { label: 'No yield data', className: 'bg-gray-100 text-gray-600 border-gray-200' };
    }
    if (value < 3000) {
        return { label: 'Low Yield', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    }
    if (value < 6000) {
        return { label: 'Mid Yield', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    return { label: 'High Yield', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
};

const QualityBadge = ({ grade }) => {
    const g = String(grade || '').toLowerCase();
    const map = {
        a: { bg: '#22c55e', fg: '#052e16' },
        b: { bg: '#3b82f6', fg: '#0b1d3a' },
        c: { bg: '#f59e0b', fg: '#3a2000' },
        rejected: { bg: '#ef4444', fg: '#450a0a' }
    };
    const entry = map[g] || { bg: '#e5e7eb', fg: '#111827' };
    return (
        <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: entry.bg, color: entry.fg }}
        >
            {grade || '—'}
        </span>
    );
};

const EmptyChart = ({ message }) => (
    <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
        <BarChart2 size={34} className="text-gray-300 mb-2" />
        <p>{message || 'No data available yet.'}</p>
    </div>
);

const Analytics = () => {
    const { token } = useAuth();

    const [dateRange, setDateRange] = useState('7d');
    const [plantingFilters, setPlantingFilters] = useState({
        variety_class: '',
        variety_id: '',
        variety_null: false,
    });
    const [loading, setLoading] = useState(true);
    const [farms, setFarms] = useState([]);
    const [fields, setFields] = useState([]);
    const [plantings, setPlantings] = useState([]);
    const [harvests, setHarvests] = useState([]);
    const [activities, setActivities] = useState([]);

    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const fetchAll = async () => {
            setLoading(true);
            try {
                const plantingQs = new URLSearchParams({ limit: '100' });
                if (plantingFilters.variety_class) {
                    plantingQs.set('variety_class', plantingFilters.variety_class);
                }
                if (plantingFilters.variety_id && !plantingFilters.variety_null) {
                    plantingQs.set('variety_id', String(Number(plantingFilters.variety_id)));
                }
                if (plantingFilters.variety_null) {
                    plantingQs.set('variety_null', '1');
                }

                const [farmsRes, fieldsRes, plantingsRes, harvestsRes, activitiesRes] = await Promise.all([
                    axios.get(`${API}/farms?limit=100`, { headers }),
                    axios.get(`${API}/fields?limit=100`, { headers }),
                    axios.get(`${API}/plantings?${plantingQs.toString()}`, { headers }),
                    axios.get(`${API}/harvests?limit=100`, { headers }),
                    axios.get(`${API}/activities?limit=100`, { headers })
                ]);

                setFarms(farmsRes.data.data || []);
                setFields(fieldsRes.data.data || []);
                setPlantings(plantingsRes.data.data || []);
                setHarvests(harvestsRes.data.data || []);
                setActivities(activitiesRes.data.data || []);
            } catch (err) {
                console.error('Analytics fetch error:', err.message);
                setFarms([]);
                setFields([]);
                setPlantings([]);
                setHarvests([]);
                setActivities([]);
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [token, dateRange, plantingFilters]);

    const filteredHarvests = useMemo(
        () => filterByDateRange(harvests, 'harvest_date', dateRange),
        [harvests, dateRange]
    );
    const filteredActivities = useMemo(
        () => filterByDateRange(activities, 'activity_date', dateRange),
        [activities, dateRange]
    );
    const filteredPlantings = useMemo(
        () => filterByDateRange(plantings, 'planting_date', dateRange),
        [plantings, dateRange]
    );

    const totals = useMemo(() => {
        const totalYield = filteredHarvests.reduce((sum, h) => sum + Number(h?.yield_kg || 0), 0);
        const harvestCount = filteredHarvests.length;
        const avgYield = harvestCount === 0
            ? 0
            : totalYield / harvestCount;

        const activeCount = filteredPlantings.filter((p) => String(p?.status || '').toLowerCase() === 'active').length;
        const successRate = getSuccessRate(filteredHarvests);

        return {
            totalYield,
            avgYield,
            activeCount,
            successRate,
            harvestCount
        };
    }, [filteredHarvests, filteredPlantings]);

    const harvestYieldOverTime = useMemo(
        () => harvestByMonth(filteredHarvests),
        [filteredHarvests]
    );

    const harvestQualityDistribution = useMemo(() => {
        const map = {};
        filteredHarvests.forEach((h) => {
            const qRaw = String(h?.quality_grade || '');
            const q = qRaw.toLowerCase();
            const key = q === 'rejected' ? 'rejected' : (q === 'a' || q === 'b' || q === 'c' ? q : 'rejected');
            map[key] = (map[key] || 0) + 1;
        });

        const order = ['a', 'b', 'c', 'rejected'];
        const labels = { a: 'A', b: 'B', c: 'C', rejected: 'rejected' };
        return order
            .filter((k) => map[k] > 0)
            .map((k) => ({ grade: labels[k], count: map[k] }));
    }, [filteredHarvests]);

    const activityBreakdown = useMemo(() => {
        const counts = {};
        filteredActivities.forEach((a) => {
            const type = formatActivityType(a?.activity_type);
            counts[type] = (counts[type] || 0) + 1;
        });
        const entries = Object.entries(counts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        return entries.map((e, idx) => ({ ...e, color: COLORS[idx % COLORS.length] }));
    }, [filteredActivities]);

    const varietyPerformance = useMemo(() => {
        const plantingById = new Map((plantings || []).map((p) => [p.id, p]));
        const yieldByVariety = {};

        filteredHarvests.forEach((h) => {
            const p = plantingById.get(h?.planting_id);
            const variety = p?.variety || p?.rice_variety || p?.variety_name;
            const key = String(variety || 'Unknown');
            yieldByVariety[key] = (yieldByVariety[key] || 0) + Number(h?.yield_kg || 0);
        });

        const entries = Object.entries(yieldByVariety)
            .map(([variety, yield_kg]) => ({ variety, yield_kg }))
            .sort((a, b) => b.yield_kg - a.yield_kg)
            .slice(0, 5);

        return entries.map((e) => ({ variety: e.variety, yield_kg: Number(e.yield_kg.toFixed(0)) }));
    }, [filteredHarvests, plantings]);

    const growthStageDistribution = useMemo(() => {
        const activePlantings = filteredPlantings.filter((p) => String(p?.status || '').toLowerCase() === 'active');
        const counts = {};
        activePlantings.forEach((p) => {
            const stage = String(p?.growth_stage || 'Unknown');
            counts[stage] = (counts[stage] || 0) + 1;
        });
        const entries = Object.entries(counts)
            .map(([stage, count]) => ({ stage, count }))
            .sort((a, b) => b.count - a.count);
        return entries.map((e, idx) => ({
            stage: e.stage,
            count: e.count,
            color: COLORS[idx % COLORS.length]
        }));
    }, [filteredPlantings]);

    const seasonComparison = useMemo(() => {
        const plantingById = new Map((plantings || []).map((p) => [p.id, p]));
        const yieldBySeason = {};
        filteredHarvests.forEach((h) => {
            const p = plantingById.get(h?.planting_id);
            const season = p?.season || 'Unknown';
            yieldBySeason[season] = (yieldBySeason[season] || 0) + Number(h?.yield_kg || 0);
        });

        const entries = Object.entries(yieldBySeason)
            .map(([season, yield_kg]) => ({ season, yield_kg }))
            .sort((a, b) => b.yield_kg - a.yield_kg);

        // Normalize to Wet/Dry if possible; otherwise take top 2.
        const wetKey = entries.find((e) => String(e.season).toLowerCase().includes('wet')) || null;
        const dryKey = entries.find((e) => String(e.season).toLowerCase().includes('dry')) || null;

        let normalized = [];
        if (wetKey || dryKey) {
            normalized = [
                { season: wetKey ? 'Wet' : 'Wet', yield_kg: wetKey ? wetKey.yield_kg : 0, _wet: true },
                { season: dryKey ? 'Dry' : 'Dry', yield_kg: dryKey ? dryKey.yield_kg : 0, _dry: true }
            ];
        } else {
            normalized = entries.slice(0, 2).map((e) => ({ season: e.season, yield_kg: e.yield_kg }));
        }

        const data = normalized.map((e) => ({
            season: e.season,
            yield_kg: Number(e.yield_kg.toFixed(0))
        }));

        return data;
    }, [filteredHarvests, plantings]);

    const joinFarmData = (farmsInput, fieldsInput, plantingsInput, harvestsInput) => {
        const fieldById = new Map((fieldsInput || []).map((f) => [f.id, f]));
        const plantingsById = new Map((plantingsInput || []).map((p) => [p.id, p]));

        const fieldCountByFarm = {};
        (fieldsInput || []).forEach((f) => {
            const farmId = f?.farm_id;
            if (!farmId) return;
            fieldCountByFarm[farmId] = (fieldCountByFarm[farmId] || 0) + 1;
        });

        const getFarmIdForPlanting = (p) => {
            const farmIdDirect = p?.farm_id;
            if (farmIdDirect) return farmIdDirect;
            const fieldId = p?.field_id;
            if (!fieldId) return null;
            const field = fieldById.get(fieldId);
            return field?.farm_id || null;
        };

        const plantingsCountByFarm = {};
        const activePlantingsCountByFarm = {};
        const varietyCountByFarm = {};
        (plantingsInput || []).forEach((p) => {
            const farmId = getFarmIdForPlanting(p);
            if (!farmId) return;
            plantingsCountByFarm[farmId] = (plantingsCountByFarm[farmId] || 0) + 1;

            const status = String(p?.status || '').toLowerCase();
            if (status === 'active') {
                activePlantingsCountByFarm[farmId] = (activePlantingsCountByFarm[farmId] || 0) + 1;
            }

            const variety = p?.variety || 'Unknown';
            varietyCountByFarm[farmId] = varietyCountByFarm[farmId] || {};
            varietyCountByFarm[farmId][variety] = (varietyCountByFarm[farmId][variety] || 0) + 1;
        });

        const harvestsCountByFarm = {};
        const yieldByFarm = {};
        (harvestsInput || []).forEach((h) => {
            const planting = plantingsById.get(h?.planting_id);
            const farmId = planting ? getFarmIdForPlanting(planting) : null;
            if (!farmId) return;
            harvestsCountByFarm[farmId] = (harvestsCountByFarm[farmId] || 0) + 1;
            yieldByFarm[farmId] = (yieldByFarm[farmId] || 0) + Number(h?.yield_kg || 0);
        });

        const rows = (farmsInput || []).map((farm) => {
            const farmId = farm.id;
            const fieldsCount = fieldCountByFarm[farmId] || 0;
            const plantingsCount = plantingsCountByFarm[farmId] || 0;
            const harvestCount = harvestsCountByFarm[farmId] || 0;
            const totalYield = yieldByFarm[farmId] || 0;
            const avgYield = harvestCount === 0 ? 0 : totalYield / harvestCount;

            const varietyMap = varietyCountByFarm[farmId] || {};
            const topVariety = Object.entries(varietyMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

            const hasActive = (activePlantingsCountByFarm[farmId] || 0) > 0;
            return {
                farmId,
                farmName: farm.name || `Farm ${farmId}`,
                fieldsCount,
                plantingsCount,
                harvestCount,
                totalYield: Number(totalYield.toFixed(0)),
                avgYield: Number(avgYield.toFixed(1)),
                topVariety,
                status: hasActive ? 'Active' : 'Idle'
            };
        });

        return rows.sort((a, b) => b.totalYield - a.totalYield);
    };

    const farmRows = useMemo(() => {
        // Use ALL plantings for harvest -> farm mapping (harvests may fall in a window
        // while the originating planting_date is outside the window).
        const rows = joinFarmData(farms, fields, plantings, filteredHarvests);

        const fieldById = new Map((fields || []).map((f) => [f.id, f]));
        const getFarmIdForPlanting = (p) => {
            const farmIdDirect = p?.farm_id;
            if (farmIdDirect) return farmIdDirect;
            const fieldId = p?.field_id;
            if (!fieldId) return null;
            const field = fieldById.get(fieldId);
            return field?.farm_id || null;
        };

        const plantingsCountByFarm = {};
        const activePlantingsCountByFarm = {};
        const varietyCountByFarm = {};

        (filteredPlantings || []).forEach((p) => {
            const farmId = getFarmIdForPlanting(p);
            if (!farmId) return;

            plantingsCountByFarm[farmId] = (plantingsCountByFarm[farmId] || 0) + 1;
            const status = String(p?.status || '').toLowerCase();
            if (status === 'active') {
                activePlantingsCountByFarm[farmId] = (activePlantingsCountByFarm[farmId] || 0) + 1;
            }

            const variety = p?.variety || 'Unknown';
            varietyCountByFarm[farmId] = varietyCountByFarm[farmId] || {};
            varietyCountByFarm[farmId][variety] = (varietyCountByFarm[farmId][variety] || 0) + 1;
        });

        return rows.map((row) => {
            const farmId = row.farmId;
            const plantingsCount = plantingsCountByFarm[farmId] || 0;
            const hasActive = (activePlantingsCountByFarm[farmId] || 0) > 0;
            const varietyMap = varietyCountByFarm[farmId] || {};
            const topVariety = Object.entries(varietyMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
            return {
                ...row,
                plantingsCount,
                topVariety,
                status: hasActive ? 'Active' : 'Idle'
            };
        });
    }, [farms, fields, plantings, filteredPlantings, filteredHarvests]);

    const recentHarvests = useMemo(() => {
        return (filteredHarvests || [])
            .slice()
            .sort((a, b) => new Date(b.harvest_date || 0) - new Date(a.harvest_date || 0))
            .slice(0, 5);
    }, [filteredHarvests]);

    const areaTooltip = ({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0]?.payload;
        return (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm">
                <p className="text-gray-500 text-xs">{item?.month}</p>
                <p className="font-semibold text-gray-900">
                    {item?.yield_kg ?? 0} kg
                </p>
            </div>
        );
    };

    const activityTooltip = ({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0]?.payload;
        return (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm">
                <p className="text-gray-500 text-xs">{item?.type}</p>
                <p className="font-semibold text-gray-900">{item?.count ?? 0} activities</p>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-[#166534] border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Loading analytics...</p>
                </div>
            </div>
        );
    }

    const successRateValue = Number(totals.successRate).toFixed(1);

    const plantingById = new Map((plantings || []).map((p) => [p.id, p]));

    return (
        <div className="bg-[#f8fafc] min-h-screen p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Crop Analytics</h1>
                    <p className="mt-1 text-sm text-gray-500 flex items-center gap-2">
                        <MapIcon size={14} className="text-gray-400" />
                        Track and analyze your rice crop performance
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <span className="text-gray-500 mr-1">Yield Class:</span>
                        <span className="inline-flex items-center rounded-full border border-yellow-200 bg-yellow-100 px-2.5 py-1 text-yellow-800">
                            Low (&lt; 3000 kg)
                        </span>
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-blue-800">
                            Mid (3000-5999 kg)
                        </span>
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-emerald-800">
                            High (&gt;= 6000 kg)
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {[
                        { id: '7d', label: '7 Days' },
                        { id: '30d', label: '30 Days' },
                        { id: '3m', label: '3 Months' },
                        { id: 'all', label: 'All Time' }
                    ].map((btn) => {
                        const isActive = dateRange === btn.id;
                        return (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => setDateRange(btn.id)}
                                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors border ${
                                    isActive
                                        ? 'bg-[#166534] text-white border-[#166534]'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {btn.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="font-medium text-gray-500">Plantings filter (API):</span>
                <select
                    value={plantingFilters.variety_class}
                    onChange={(e) => setPlantingFilters((f) => ({ ...f, variety_class: e.target.value }))}
                    className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white max-w-[200px]"
                >
                    {PLANTING_VARIETY_CLASS_FILTERS.map((o) => (
                        <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <input
                    type="number"
                    min="1"
                    placeholder="variety_id"
                    disabled={plantingFilters.variety_null}
                    value={plantingFilters.variety_id}
                    onChange={(e) => setPlantingFilters((f) => ({ ...f, variety_id: e.target.value }))}
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 bg-white disabled:opacity-50"
                />
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={plantingFilters.variety_null}
                        onChange={(e) => setPlantingFilters((f) => ({
                            ...f,
                            variety_null: e.target.checked,
                            variety_id: e.target.checked ? '' : f.variety_id,
                        }))}
                        className="rounded border-gray-300 text-emerald-700"
                    />
                    Catalog unlinked only
                </label>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    {
                        label: 'Total Yield',
                        value: formatNumber(totals.totalYield),
                        unit: 'kg',
                        icon: Wheat,
                        accent: '#d97706',
                        iconBg: '#fffbeb'
                    },
                    {
                        label: 'Average Yield per Harvest',
                        value: Number(totals.avgYield || 0).toFixed(1),
                        unit: 'kg/harvest',
                        icon: TrendingUp,
                        accent: '#16a34a',
                        iconBg: '#f0fdf4'
                    },
                    {
                        label: 'Active Plantings',
                        value: formatNumber(totals.activeCount),
                        unit: 'in progress',
                        icon: Sprout,
                        accent: '#0d9488',
                        iconBg: '#e0fef9'
                    },
                    {
                        label: 'Success Rate',
                        value: `${successRateValue}%`,
                        unit: 'grade A & B',
                        icon: Award,
                        accent: '#2563eb',
                        iconBg: '#eff6ff'
                    }
                ].map((card) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.label}
                            className="group relative text-left bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden transition-transform hover:-translate-y-1"
                        >
                            <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: card.accent }} />
                            <div className="p-5 pl-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div
                                        className="rounded-xl p-3 border border-gray-100"
                                        style={{ backgroundColor: card.iconBg }}
                                    >
                                        <Icon size={20} style={{ color: card.accent }} />
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-bold text-gray-900">{card.value}</div>
                                        <div className="text-xs text-gray-500 mt-1">{card.unit}</div>
                                    </div>
                                </div>
                                <div className="mt-3 text-sm font-semibold text-gray-800">{card.label}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Section 2: Harvest yield over time */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Harvest Yield Over Time</h2>
                    <p className="text-xs text-gray-400 mt-1">Monthly yield in kilograms</p>
                </div>

                {harvestYieldOverTime.length === 0 ? (
                    <EmptyChart message="No harvest data in this date range." />
                ) : (
                    <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={harvestYieldOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(v) => `${v}kg`} />
                                <Tooltip content={areaTooltip} />
                                <Area
                                    type="monotone"
                                    dataKey="yield_kg"
                                    stroke="#16a34a"
                                    strokeWidth={2.2}
                                    fill="url(#yieldGradient)"
                                    name="Yield"
                                    dot={{ r: 3.5, fill: '#16a34a', strokeWidth: 1, stroke: '#fff' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </section>

            {/* Section 3: Two-column row */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Harvest Quality Distribution */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Harvest Quality</h2>
                        <p className="text-xs text-gray-400 mt-1">Distribution by quality grade</p>
                    </div>

                    {harvestQualityDistribution.length === 0 ? (
                        <EmptyChart message="No quality data in this date range." />
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <defs>
                                    {/* keeps aria/gradients stable; actual colors come from slices */}
                                </defs>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload;
                                        return (
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm">
                                                <p className="text-gray-500 text-xs">{item?.grade}</p>
                                                <p className="font-semibold text-gray-900">{item?.count ?? 0} harvest(s)</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Pie
                                    data={harvestQualityDistribution}
                                    dataKey="count"
                                    nameKey="grade"
                                    innerRadius={35}
                                    outerRadius={75}
                                    paddingAngle={3}
                                    cornerRadius={8}
                                >
                                    {harvestQualityDistribution.map((entry) => {
                                        const gradeKey = String(entry.grade).toLowerCase();
                                        const fill =
                                            gradeKey === 'a' ? '#22c55e'
                                                : gradeKey === 'b' ? '#3b82f6'
                                                    : gradeKey === 'c' ? '#f59e0b'
                                                        : '#ef4444';
                                        return <Cell key={entry.grade} fill={fill} />;
                                    })}
                                </Pie>
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    formatter={(value, entry) => {
                                        const item = entry?.payload;
                                        const count = item?.count;
                                        return `${value} (${count})`;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </section>

                {/* Activity Breakdown */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Activity Breakdown</h2>
                        <p className="text-xs text-gray-400 mt-1">Activities by type</p>
                    </div>

                    {activityBreakdown.length === 0 ? (
                        <EmptyChart message="No activities found in this date range." />
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart
                                data={activityBreakdown}
                                layout="vertical"
                                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={true} />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                <YAxis
                                    dataKey="type"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#111827' }}
                                    width={150}
                                />
                                <Tooltip content={activityTooltip} />
                                <Bar dataKey="count" radius={[10, 10, 10, 10]}>
                                    {activityBreakdown.map((entry, idx) => (
                                        <Cell key={`cell-${idx}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </section>
            </div>

            {/* Section 4: Three-column row */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Variety Performance */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 lg:col-span-1">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Variety Performance</h2>
                        <p className="text-xs text-gray-400 mt-1">Yield by crop variety</p>
                    </div>

                    {varietyPerformance.length === 0 ? (
                        <EmptyChart message="No variety yield found in this date range." />
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={varietyPerformance} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="variety" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} interval={0} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(v) => `${v}kg`} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload;
                                        return (
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm">
                                                <p className="text-gray-500 text-xs">{item?.variety}</p>
                                                <p className="font-semibold text-gray-900">{item?.yield_kg ?? 0} kg</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="yield_kg" fill="#16a34a" radius={[10, 10, 10, 10]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </section>

                {/* Growth Stage Distribution */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 lg:col-span-1">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Growth Stages</h2>
                        <p className="text-xs text-gray-400 mt-1">Current plantings by stage</p>
                    </div>

                    {growthStageDistribution.length === 0 ? (
                        <EmptyChart message="No active plantings in this date range." />
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload;
                                        return (
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm">
                                                <p className="text-gray-500 text-xs">{item?.stage}</p>
                                                <p className="font-semibold text-gray-900">{item?.count ?? 0} plantings</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Pie
                                    data={growthStageDistribution}
                                    dataKey="count"
                                    nameKey="stage"
                                    innerRadius={35}
                                    outerRadius={75}
                                    paddingAngle={3}
                                    cornerRadius={8}
                                >
                                    {growthStageDistribution.map((entry) => (
                                        <Cell key={entry.stage} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    formatter={(value, entry) => {
                                        const item = entry?.payload;
                                        const count = item?.count;
                                        return `${value} (${count})`;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </section>

                {/* Season Comparison */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 lg:col-span-1">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Season Comparison</h2>
                        <p className="text-xs text-gray-400 mt-1">Wet vs Dry season yield</p>
                    </div>

                    {seasonComparison.length === 0 ? (
                        <EmptyChart message="No season yield data found." />
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={seasonComparison} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="season" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(v) => `${v}kg`} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload;
                                        return (
                                            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm">
                                                <p className="text-gray-500 text-xs">{item?.season}</p>
                                                <p className="font-semibold text-gray-900">{item?.yield_kg ?? 0} kg</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar
                                    dataKey="yield_kg"
                                    radius={[10, 10, 10, 10]}
                                >
                                    {seasonComparison.map((entry) => {
                                        const fill = entry.season === 'Dry' ? '#f59e0b' : '#3b82f6';
                                        return <Cell key={entry.season} fill={fill} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </section>
            </div>

            {/* Section 5: Farm performance table */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Farm Performance Summary</h2>
                    <p className="text-xs text-gray-400 mt-1">Detailed breakdown by farm</p>
                </div>

                {farmRows.length === 0 || farms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
                        <BarChart2 size={34} className="text-gray-300 mb-2" />
                        <p>No farm data yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white">
                                    <th className="px-5 py-3">FARM NAME</th>
                                    <th className="px-5 py-3">FIELDS</th>
                                    <th className="px-5 py-3">PLANTINGS</th>
                                    <th className="px-5 py-3">HARVESTS</th>
                                    <th className="px-5 py-3">TOTAL YIELD</th>
                                    <th className="px-5 py-3">AVG YIELD</th>
                                    <th className="px-5 py-3">TOP VARIETY</th>
                                    <th className="px-5 py-3">STATUS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {farmRows.map((row) => (
                                    <tr
                                        key={row.farmId}
                                        className="hover:bg-emerald-50/40 transition-colors"
                                    >
                                        <td className="px-5 py-3 font-semibold text-gray-900">{row.farmName}</td>
                                        <td className="px-5 py-3 text-gray-700">{row.fieldsCount}</td>
                                        <td className="px-5 py-3 text-gray-700">{row.plantingsCount}</td>
                                        <td className="px-5 py-3 text-gray-700">{row.harvestCount}</td>
                                        <td className="px-5 py-3 text-gray-700 font-semibold">
                                            {row.totalYield.toLocaleString()} <span className="text-gray-500 font-normal">kg</span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">
                                            {row.avgYield.toLocaleString()} <span className="text-gray-500 font-normal">kg</span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">{formatVariant(row.topVariety)}</td>
                                        <td className="px-5 py-3">
                                            <span
                                                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                                style={{
                                                    backgroundColor: row.status === 'Active' ? '#dcfce7' : '#f3f4f6',
                                                    color: row.status === 'Active' ? '#166534' : '#374151'
                                                }}
                                            >
                                                {row.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Section 6: Recent harvests table */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Recent Harvests</h2>
                    <p className="text-xs text-gray-400 mt-1">Last 5 harvest records</p>
                </div>

                {recentHarvests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
                        <Wheat size={34} className="text-gray-300 mb-2" />
                        <p>No harvest records found.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white">
                                    <th className="px-5 py-3">VARIETY</th>
                                    <th className="px-5 py-3">FIELD</th>
                                    <th className="px-5 py-3">HARVEST DATE</th>
                                    <th className="px-5 py-3">YIELD (kg)</th>
                                    <th className="px-5 py-3">YIELD CLASS</th>
                                    <th className="px-5 py-3">LIFECYCLE</th>
                                    <th className="px-5 py-3">QUALITY GRADE</th>
                                    <th className="px-5 py-3">REMARKS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentHarvests.map((h) => {
                                    const p = plantingById.get(h?.planting_id);
                                    const variety = h.planting_variety || p?.variety || p?.variety_name || '—';
                                    const fieldName = h.field_name || p?.field_name || '—';
                                    const yieldClass = getYieldClass(h?.yield_kg);
                                    const lifecyclePct = getLifecycleProgressPercent(p);
                                    return (
                                    <tr key={h.id} className="hover:bg-emerald-50/40 transition-colors">
                                        <td className="px-5 py-3 font-semibold text-gray-900">{variety}</td>
                                        <td className="px-5 py-3 text-gray-700">{fieldName}</td>
                                        <td className="px-5 py-3 text-gray-700">{h.harvest_date?.slice(0, 10) || '—'}</td>
                                        <td className="px-5 py-3 text-gray-700 font-semibold">{Number(h.yield_kg || 0).toLocaleString()}</td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${yieldClass.className}`}>
                                                {yieldClass.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700 font-semibold">
                                            {lifecyclePct}%
                                        </td>
                                        <td className="px-5 py-3">
                                            <QualityBadge grade={h.quality_grade} />
                                        </td>
                                        <td className="px-5 py-3 text-gray-600 text-xs max-w-[260px] truncate" title={h.remarks}>
                                            {h.remarks || '—'}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Analytics;

