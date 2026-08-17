import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import useAuth from '../context/useAuth';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import {
    Loader2, AlertTriangle,
    Wheat, TrendingUp, Sprout, Award, Activity,
    BarChart2, Home, Tractor, Map as MapIcon,
    Shovel, Droplets, Bug, Scissors,
    FlaskConical, Package, ChevronRight, ChevronDown
} from 'lucide-react';
import {
    SkeletonPageHeader,
    SkeletonStatCard,
    SkeletonBox,
    SkeletonTable,
    SkeletonChartBars,
    SkeletonDonutChart,
    SkeletonHorizontalBarChart,
    SkeletonText
} from '../components/Skeleton';
import { QualityGradeBadge } from '../components/QualityGradeBadge';
import { formatDisplayDate } from '../utils/dateFormatter';

const API_HOST = window.location.hostname;
const API = `http://${API_HOST}:5000/api/v1`;
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

const PLANTING_VARIETY_CLASS_FILTERS = [
    { value: '', label: 'All classes' },
    { value: 'Irrigated / Lowland Varieties', label: 'Irrigated / Lowland' },
    { value: 'Rainfed / Dry-Seeded Varieties (DSR)', label: 'Rainfed / DSR' },
    { value: 'Upland Varieties', label: 'Upland' },
];

const harvestByMonth = (items, plantings) => {
    const months = {};
    const plantingById = new Map((plantings || []).map((p) => [p.id, p]));

    items.forEach((h) => {
        const d = h?.harvest_date ? new Date(h.harvest_date) : null;
        if (!d || Number.isNaN(d.getTime())) return;
        const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        if (!months[key]) {
            months[key] = {
                yield_kg: 0,
                harvestsList: []
            };
        }
        months[key].yield_kg += Number(h.yield_kg || 0);

        const p = plantingById.get(h?.planting_id);
        const variety = p?.variety || p?.rice_variety || p?.variety_name || 'Unknown Variety';
        const field_name = p?.field_name || 'No Field';

        months[key].harvestsList.push({
            ...h,
            variety,
            field_name
        });
    });

    // Sort by actual date (not by string).
    const entries = Object.entries(months).map(([month, data]) => {
        const [mon, yr] = month.split(' ');
        const year = `20${yr}`;
        const dt = new Date(`${mon} 1, ${year}`);
        return {
            month,
            yield_kg: Number(data.yield_kg.toFixed(0)),
            harvestsList: data.harvestsList,
            _dt: dt
        };
    });

    return entries
        .sort((a, b) => a._dt - b._dt)
        .map(({ month, yield_kg, harvestsList }) => ({ month, yield_kg, harvestsList }));
};

const getPlaceholderMonths = () => {
    const data = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        data.push({
            month: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
            yield_kg: 0,
            harvestsList: []
        });
    }
    return data;
};

const fillTimelineData = (data) => {
    if (!data || data.length === 0) return getPlaceholderMonths();
    const timeline = getPlaceholderMonths();
    const yieldMap = {};
    data.forEach(item => {
        yieldMap[item.month] = {
            yield_kg: item.yield_kg,
            harvestsList: item.harvestsList
        };
    });

    let merged = timeline.map(t => {
        if (yieldMap[t.month] !== undefined) {
            const entry = yieldMap[t.month];
            delete yieldMap[t.month];
            return { ...t, yield_kg: entry.yield_kg, harvestsList: entry.harvestsList };
        }
        return { ...t, harvestsList: [] };
    });

    const extraEntries = Object.entries(yieldMap).map(([month, entry]) => {
        return { month, yield_kg: entry.yield_kg, harvestsList: entry.harvestsList };
    });

    if (extraEntries.length > 0) {
        merged = [...merged, ...extraEntries];
    }

    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    merged.sort((a, b) => {
        const [monA, yrA] = a.month.split(' ');
        const [monB, yrB] = b.month.split(' ');
        const dateA = new Date(`20${yrA}`, monthsShort.indexOf(monA), 1);
        const dateB = new Date(`20${yrB}`, monthsShort.indexOf(monB), 1);
        return dateA - dateB;
    });

    return merged;
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
    const now = new Date();

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    if (range === 'all') {
        return (items || []).filter((item) => {
            const val = item?.[dateKey];
            // If legacy record has no date, include it in 'All Time' historical counts
            if (!val) return true;

            const d = new Date(val);
            if (Number.isNaN(d.getTime())) return false;

            // Still exclude future-dated legacy records even in All Time
            return d <= end;
        });
    }

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (range === '7d') start.setDate(start.getDate() - 7);
    if (range === '30d') start.setDate(start.getDate() - 30);
    if (range === '3m') start.setMonth(start.getMonth() - 3);

    return (items || []).filter((item) => {
        const val = item?.[dateKey];
        const d = val ? new Date(val) : null;
        if (!val || !d || Number.isNaN(d.getTime())) return false;
        // Restrict to explicitly past/current dates within the range boundary.
        return d >= start && d <= end;
    });
};

const formatActivityType = (t) => String(t || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const formatVariant = (v) => String(v || '—');

const formatNumber = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString();
};

const safeDate = (value) => {
    if (!value) return null;
    const s = String(value).slice(0, 10);
    const parts = s.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(value);
};

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

// QualityBadge logic was replaced by QualityGradeBadge


const ErrorChart = ({ message }) => (
    <div className="flex flex-col items-center justify-center h-[220px] text-sm text-red-600 dark:text-red-300">
        <AlertTriangle size={34} className="text-red-500 dark:text-red-400 mb-2" />
        <p>{message}</p>
    </div>
);

const EmptyChart = ({ message }) => (
    <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
        <BarChart2 size={34} className="text-gray-300 mb-2" />
        <p>{message || 'No data available yet.'}</p>
    </div>
);

const Analytics = () => {
    const { token } = useAuth();

    const [dateRange, setDateRange] = useState('7d');
    const [plantingFilters] = useState({
        variety_class: '',
        variety_id: '',
        variety_null: false,
    });
        const [loading, setLoading] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    
    const [plantings, setPlantings] = useState([]);
    const [harvests, setHarvests] = useState([]);
    const [activities, setActivities] = useState([]);
    
    const [plantingsError, setPlantingsError] = useState(false);
    const [harvestsError, setHarvestsError] = useState(false);
    const [activitiesError, setActivitiesError] = useState(false);

    const fetchAllData = React.useCallback(async (isRetry = false) => {
        if (isRetry) setIsRetrying(true);
        else setLoading(true);

        const plantingQs = new URLSearchParams({ limit: '100' });
        if (plantingFilters.variety_class) plantingQs.set('variety_class', plantingFilters.variety_class);
        if (plantingFilters.variety_id && !plantingFilters.variety_null) plantingQs.set('variety_id', String(Number(plantingFilters.variety_id)));
        if (plantingFilters.variety_null) plantingQs.set('variety_null', '1');

        const headers = { Authorization: `Bearer ${token}` };
        
        try {
            const promises = [];
            if (!isRetry || plantingsError) {
                promises.push(
                    axios.get(`${API}/plantings?${plantingQs.toString()}`, { headers })
                        .then(res => { setPlantings(res.data.data || []); setPlantingsError(false); })
                        .catch(err => { console.error('Plantings fetch error:', err.message); setPlantings([]); setPlantingsError(true); })
                );
            }
            if (!isRetry || harvestsError) {
                promises.push(
                    axios.get(`${API}/harvests?limit=100`, { headers })
                        .then(res => { setHarvests(res.data.data || []); setHarvestsError(false); })
                        .catch(err => { console.error('Harvests fetch error:', err.message); setHarvests([]); setHarvestsError(true); })
                );
            }
            if (!isRetry || activitiesError) {
                promises.push(
                    axios.get(`${API}/activities?limit=100`, { headers })
                        .then(res => { setActivities(res.data.data || []); setActivitiesError(false); })
                        .catch(err => { console.error('Activities fetch error:', err.message); setActivities([]); setActivitiesError(true); })
                );
            }

            await Promise.all(promises);
        } finally {
            if (isRetry) setIsRetrying(false);
            else setLoading(false);
        }
    }, [token, plantingFilters, plantingsError, harvestsError, activitiesError]);

    useEffect(() => {
        if (!token) return;
        fetchAllData(false);
    }, [token, plantingFilters]); // Only depend on token and filters for initial load

    const handleRetry = () => {
        fetchAllData(true);
    };

    const showPlantingSkeleton = loading || (isRetrying && plantingsError);
    const showHarvestSkeleton = loading || (isRetrying && harvestsError);
    const showActivitySkeleton = loading || (isRetrying && activitiesError);
    const showMixedSkeleton = loading || (isRetrying && (plantingsError || harvestsError));

    const filteredHarvests = useMemo(
        () => filterByDateRange(harvests, 'harvest_date', dateRange),
        [harvests, dateRange]
    );
    const filteredActivities = useMemo(
        () => filterByDateRange(activities, 'actual_date', dateRange),
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

        const activeCount = plantings.filter((p) => String(p?.status || '').toLowerCase() === 'active').length;
        const successRate = getSuccessRate(filteredHarvests);

        return {
            totalYield,
            avgYield,
            activeCount,
            successRate,
            harvestCount
        };
    }, [filteredHarvests, plantings]);

    const harvestYieldOverTime = useMemo(
        () => harvestByMonth(filteredHarvests, plantings),
        [filteredHarvests, plantings]
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
        filteredActivities
            .filter((a) => String(a?.status || '').toLowerCase() === 'completed')
            .forEach((a) => {
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
        const activePlantings = plantings.filter((p) => String(p?.status || '').toLowerCase() === 'active');
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
    }, [plantings]);

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

    const fieldRows = useMemo(() => {
        const plantingsById = new Map((plantings || []).map((p) => [p.id, p]));

        const byField = new Map();

        const getKey = (p) => String(p?.field_name || '').trim() || 'Unknown';

        (plantings || []).forEach((p) => {
            const key = getKey(p);
            if (!byField.has(key)) {
                byField.set(key, {
                    fieldId: key,
                    fieldName: key,
                    size: Number(p?.field_size || 0),
                    plantingsCount: 0,
                    harvestCount: 0,
                    totalYield: 0,
                    avgYield: 0,
                    topVariety: '—',
                    status: 'Idle',
                    _varietyCounts: {},
                    _hasActive: false,
                });
            }
            const row = byField.get(key);
            row.plantingsCount += 1;
            if (Number(p?.field_size || 0) > 0) row.size = Math.max(row.size || 0, Number(p.field_size));
            const status = String(p?.status || '').toLowerCase();
            if (status === 'active') row._hasActive = true;
            const variety = p?.variety || 'Unknown';
            row._varietyCounts[variety] = (row._varietyCounts[variety] || 0) + 1;
        });

        (filteredHarvests || []).forEach((h) => {
            const planting = plantingsById.get(h?.planting_id);
            const key = getKey(planting || { field_name: h?.field_name });
            if (!byField.has(key)) {
                byField.set(key, {
                    fieldId: key,
                    fieldName: key,
                    size: 0,
                    plantingsCount: 0,
                    harvestCount: 0,
                    totalYield: 0,
                    avgYield: 0,
                    topVariety: '—',
                    status: 'Idle',
                    _varietyCounts: {},
                    _hasActive: false,
                });
            }
            const row = byField.get(key);
            row.harvestCount += 1;
            row.totalYield += Number(h?.yield_kg || 0);
        });

        const rows = Array.from(byField.values()).map((row) => {
            const varietyEntries = Object.entries(row._varietyCounts || {});
            const topVariety = varietyEntries.sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
            const avgYield = row.harvestCount === 0 ? 0 : row.totalYield / row.harvestCount;
            return {
                fieldId: row.fieldId,
                fieldName: row.fieldName,
                size: row.size > 0 ? Number(row.size.toFixed(2)) : '—',
                plantingsCount: row.plantingsCount,
                harvestCount: row.harvestCount,
                totalYield: Number(row.totalYield.toFixed(0)),
                avgYield: Number(avgYield.toFixed(1)),
                topVariety,
                status: row._hasActive ? 'Active' : 'Idle'
            };
        });

        return rows.sort((a, b) => b.totalYield - a.totalYield);
    }, [plantings, filteredHarvests]);

    const recentHarvests = useMemo(() => {
        return (filteredHarvests || [])
            .slice()
            .sort((a, b) => new Date(b.harvest_date || 0) - new Date(a.harvest_date || 0))
            .slice(0, 5);
    }, [filteredHarvests]);

    const ActivityCursor = (props) => {
        const { x, y, width, height, payload } = props;
        if (!payload || !payload[0]) return null;
        const activeObject = payload[0]?.payload;
        const color = activeObject?.color || '#22c55e';
        return (
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={color}
                fillOpacity={0.07}
                rx={6}
            />
        );
    };

    const SeasonCursor = (props) => {
        const { x, y, width, height, payload } = props;
        if (!payload || !payload[0]) return null;
        const item = payload[0]?.payload;
        const color = item?.season === 'Dry' ? '#f59e0b' : '#3b82f6';
        return (
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={color}
                fillOpacity={0.07}
                rx={6}
            />
        );
    };

    const areaTooltip = ({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const dataPoint = payload[0]?.payload;
        if (!dataPoint) return null;
        const harvestsList = dataPoint.harvestsList || [];

        return (
            <div className="bg-slate-900/95 dark:bg-slate-950/95 border border-slate-800 text-white rounded-xl p-3.5 shadow-2xl backdrop-blur-sm max-w-xs md:max-w-md">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                    <span className="text-xs font-semibold text-slate-400">{dataPoint.month}</span>
                    <span className="text-sm font-bold text-emerald-400 ml-3">
                        Total: {dataPoint.yield_kg.toLocaleString()} kg
                    </span>
                </div>
                {harvestsList.length > 0 ? (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {harvestsList.map((h, idx) => {
                            const hDate = h.harvest_date
                                ? new Date(h.harvest_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                : '—';
                            return (
                                <div key={h.id || idx} className="text-xs flex flex-col border-b border-slate-800/40 last:border-0 pb-1.5 last:pb-0">
                                    <div className="flex justify-between items-start gap-3">
                                        <span className="font-semibold text-slate-200">
                                            {h.variety || 'Unknown Variety'}
                                        </span>
                                        <span className="font-bold text-emerald-400 shrink-0">
                                            {Number(h.yield_kg || 0).toLocaleString()} kg
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                                        <span>{h.field_name || 'No Field'}</span>
                                        <span>{hDate}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-500 italic">No detailed harvests recorded</p>
                )}
            </div>
        );
    };

    const activityTooltip = ({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0]?.payload;
        return (
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.type}</p>
                <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">{item?.count ?? 0} <span className="text-xs font-normal text-gray-500">activities</span></p>
            </div>
        );
    }; const successRateValue = Number(totals.successRate).toFixed(1);

    const plantingById = new Map((plantings || []).map((p) => [p.id, p]));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-gray-800">Crop Analytics</h1>
                        {isRetrying && (
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                                <Loader2 size={14} className="animate-spin text-slate-500 dark:text-slate-400" />
                                Retrying...
                            </div>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 flex items-center gap-2">
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
                                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors border ${isActive
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



            
            {(plantingsError || harvestsError || activitiesError) && !loading && (
                <div className="bg-red-50 dark:bg-slate-800/80 rounded-xl shadow-sm border border-red-100 dark:border-red-900/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-red-800 dark:text-red-400">
                        <AlertTriangle size={24} className="text-red-500 shrink-0" />
                        <div>
                            <h3 className="text-sm font-bold">Some analytics data could not be loaded.</h3>
                            <p className="text-xs text-red-600 dark:text-red-300/80 mt-0.5">
                                {(()=>{
                                    const failed = [];
                                    if(plantingsError) failed.push('Planting');
                                    if(harvestsError) failed.push('Harvest');
                                    if(activitiesError) failed.push('Activity');
                                    return failed.join(', ') + ' data unavailable';
                                })()}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-1.5 md:grid-cols-2 xl:grid-cols-4 md:gap-4 lg:gap-6">
                {[
                    {
                        label: 'Total Yield',
                        value: harvestsError ? '—' : formatNumber(totals.totalYield),
                        unit: harvestsError ? 'Unavailable' : 'kg',
                        icon: Wheat,
                        accent: '#d97706',
                        iconBg: '#fffbeb',
                        isLoading: showHarvestSkeleton
                    },
                    {
                        label: 'Average Yield per Harvest',
                        value: harvestsError ? '—' : Number(totals.avgYield || 0).toFixed(1),
                        unit: harvestsError ? 'Unavailable' : 'kg/harvest',
                        icon: TrendingUp,
                        accent: '#16a34a',
                        iconBg: '#f0fdf4',
                        isLoading: showHarvestSkeleton
                    },
                    {
                        label: 'Active Plantings',
                        value: plantingsError ? '—' : formatNumber(totals.activeCount),
                        unit: plantingsError ? 'Unavailable' : 'in progress',
                        icon: Sprout,
                        accent: '#0d9488',
                        iconBg: '#e0fef9',
                        isLoading: showPlantingSkeleton
                    },
                    {
                        label: 'High-Quality Harvest Rate',
                        value: harvestsError ? '—' : `${successRateValue}%`,
                        unit: harvestsError ? 'Unavailable' : 'grade A & B',
                        icon: Award,
                        accent: '#2563eb',
                        iconBg: '#eff6ff',
                        tooltip: 'Percentage of Harvests achieving Quality Grade A or B',
                        isLoading: showHarvestSkeleton
                    }
                ].map((card) => {
                    if (card.isLoading) return <SkeletonStatCard key={card.label} />;
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.label}
                            className="group relative text-center bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col items-center justify-center p-2.5 transition-transform hover:-translate-y-1 md:text-left md:items-start md:p-5 md:pl-6"
                        >
                            <span
                                className="absolute left-0 top-0 w-full h-[3px] md:bottom-0 md:h-full md:w-[4px]"
                                style={{ backgroundColor: card.accent }}
                            />
                            <div className="flex flex-col items-center justify-center gap-1.5 md:flex-row md:items-start md:justify-between md:gap-4 md:w-full">
                                <div
                                    className="rounded-xl p-1.5 border border-gray-100 md:p-3"
                                    style={{ backgroundColor: card.iconBg }}
                                >
                                    <Icon size={16} className="md:size-[20px]" style={{ color: card.accent }} />
                                </div>
                                <div className="text-center md:text-right">
                                    <div className="text-base font-bold text-gray-900 leading-none md:text-3xl">{card.value}</div>
                                    <div className="text-[9px] text-gray-500 mt-0.5 md:text-xs md:mt-1">{card.unit}</div>
                                </div>
                            </div>
                            <div className="mt-1.5 text-[9px] font-semibold text-gray-800 leading-tight md:mt-3 md:text-sm" title={card.tooltip}>{card.label}</div>
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

                {showHarvestSkeleton ? <SkeletonChartBars /> : harvestsError ? <ErrorChart message="Unable to load harvest data." /> : (() => {
                    const isPlaceholder = harvestYieldOverTime.length === 0;
                    const chartData = isPlaceholder ? getPlaceholderMonths() : fillTimelineData(harvestYieldOverTime);
                    return (
                        <div className="h-[220px] relative">
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.28} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" vertical={false} />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10.5 }} />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10.5 }}
                                        tickFormatter={(v) => `${v}kg`}
                                        domain={isPlaceholder ? [0, 10000] : undefined}
                                    />
                                    {!isPlaceholder && <Tooltip content={areaTooltip} />}
                                    <Area
                                        type="monotone"
                                        dataKey="yield_kg"
                                        stroke={isPlaceholder ? "#94a3b8" : "#22c55e"}
                                        strokeWidth={isPlaceholder ? 1.5 : 2.5}
                                        strokeDasharray={isPlaceholder ? "4 4" : undefined}
                                        fill={isPlaceholder ? "none" : "url(#yieldGradient)"}
                                        name="Yield"
                                        dot={isPlaceholder ? false : { r: 4, fill: '#22c55e', strokeWidth: 1.5, stroke: '#fff' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>

                            {isPlaceholder && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-50/10 dark:bg-slate-900/10 backdrop-blur-[0.5px] pointer-events-none">
                                    <div className="bg-slate-50/90 dark:bg-slate-800/90 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                                        <Wheat size={16} className="text-emerald-600 animate-pulse" />
                                        <span className="text-xs font-semibold text-gray-500 dark:text-slate-300">No harvest yield data in this range</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </section>

            {/* Section 3: Two-column row */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Harvest Quality Distribution */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Harvest Quality</h2>
                        <p className="text-xs text-gray-400 mt-1">Distribution by quality grade</p>
                    </div>

                    {showHarvestSkeleton ? <SkeletonDonutChart /> : harvestsError ? <ErrorChart message="Unable to load harvest data." /> : (() => {
                        if (harvestQualityDistribution.length === 0) {
                            return (
                                <div className="h-[220px] relative flex items-center justify-center">
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/10 dark:bg-slate-900/10 backdrop-blur-[0.5px]">
                                        <div className="bg-slate-50/90 dark:bg-slate-800/90 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                                            <Award size={16} className="text-emerald-600 animate-pulse" />
                                            <span className="text-xs font-semibold text-gray-500 dark:text-slate-300">No quality distribution data</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        const isSingle = harvestQualityDistribution.length === 1;
                        const chartData = harvestQualityDistribution;

                        return (
                            <div className="h-[220px] relative flex items-center justify-center">
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const item = payload[0]?.payload;
                                                return (
                                                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                                        <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">Grade {item?.grade}</p>
                                                        <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                            {item?.count ?? 0} <span className="text-xs font-normal text-gray-500">harvest{item?.count !== 1 ? 's' : ''}</span>
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Pie
                                            data={chartData}
                                            dataKey="count"
                                            nameKey="grade"
                                            innerRadius={isSingle ? 55 : 35}
                                            outerRadius={75}
                                            paddingAngle={isSingle ? 0 : 3}
                                            cornerRadius={isSingle ? 0 : 8}
                                        >
                                            {chartData.map((entry) => {
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
                                                const count = entry?.payload?.count;
                                                if (isSingle) {
                                                    return `Grade ${value} · ${count} harvest${count !== 1 ? 's' : ''}`;
                                                }
                                                return `${value} (${count})`;
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>

                                {isSingle && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-[20px]">
                                        <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">{chartData[0].grade}</span>
                                        <span className="text-[10px] font-bold text-gray-400 mt-0.5">100%</span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </section>

                {/* Activity Breakdown */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Activity Breakdown</h2>
                        <p className="text-xs text-gray-400 mt-1">Activities by type</p>
                    </div>

                    {showActivitySkeleton ? <SkeletonHorizontalBarChart /> : activitiesError ? <ErrorChart message="Unable to load activity data." /> : (() => {
                        if (activityBreakdown.length === 0) {
                            return (
                                <div className="h-[220px] relative flex items-center justify-center">
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/10 dark:bg-slate-900/10 backdrop-blur-[0.5px]">
                                        <div className="bg-slate-50/90 dark:bg-slate-800/90 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                                            <Activity size={16} className="text-emerald-600 animate-pulse" />
                                            <span className="text-xs font-semibold text-gray-500 dark:text-slate-300">No activity logs in this range</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        const chartData = activityBreakdown;

                        return (
                            <div className="h-[220px] relative">
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart
                                        data={chartData}
                                        layout="vertical"
                                        margin={{ top: 10, right: 35, left: 0, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" horizontal={true} vertical={false} />
                                        <XAxis
                                            type="number"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#9ca3af', fontSize: 10.5 }}
                                            domain={[0, dataMax => Math.max(5, Math.ceil(dataMax * 1.2))]}
                                            allowDecimals={false}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="type"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#9ca3af', fontSize: 10.5 }}
                                            width={110}
                                        />
                                        <Tooltip content={activityTooltip} cursor={<ActivityCursor />} />
                                        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={48}>
                                            {chartData.map((entry, idx) => (
                                                <Cell key={`cell-${idx}`} fill={entry.color} />
                                            ))}
                                            <LabelList
                                                dataKey="count"
                                                position="right"
                                                fill="#9ca3af"
                                                fontSize={10.5}
                                                offset={8}
                                                formatter={(v) => `${v}`}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        );
                    })()}
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

                    {showHarvestSkeleton ? <SkeletonChartBars /> : harvestsError ? <ErrorChart message="Unable to load harvest data." /> : (() => {
                        if (varietyPerformance.length === 0) {
                            return (
                                <div className="h-[220px] relative flex items-center justify-center">
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/10 dark:bg-slate-900/10 backdrop-blur-[0.5px]">
                                        <div className="bg-slate-50/90 dark:bg-slate-800/90 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                                            <Wheat size={16} className="text-emerald-600 animate-pulse" />
                                            <span className="text-xs font-semibold text-gray-500 dark:text-slate-300">No variety yield found in this range</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        const chartData = varietyPerformance;

                        return (
                            <div className="h-[220px] relative">
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={chartData} margin={{ top: 25, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" vertical={false} />
                                        <XAxis dataKey="variety" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10.5 }} interval={0} />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#9ca3af', fontSize: 10.5 }}
                                            tickFormatter={(v) => `${v.toLocaleString()}`}
                                            domain={[0, dataMax => Math.max(10, Math.ceil(dataMax * 1.15))]}
                                        />
                                        <Tooltip
                                            cursor={{ fill: '#22c55e', fillOpacity: 0.06, rx: 6 }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const item = payload[0]?.payload;
                                                return (
                                                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                                        <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.variety}</p>
                                                        <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                            {Number(item?.yield_kg || 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">kg</span>
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="yield_kg" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={60}>
                                            <LabelList
                                                dataKey="yield_kg"
                                                position="top"
                                                fill="#9ca3af"
                                                fontSize={10.5}
                                                formatter={(v) => `${Number(v).toLocaleString()} kg`}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        );
                    })()}
                </section>

                {/* Growth Stage Distribution */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 lg:col-span-1">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Growth Stages</h2>
                        <p className="text-xs text-gray-400 mt-1">Current plantings by stage</p>
                    </div>

                    {showPlantingSkeleton ? <SkeletonDonutChart /> : plantingsError ? <ErrorChart message="Unable to load planting data." /> : growthStageDistribution.length === 0 ? (
                        <EmptyChart message="No active plantings" />
                    ) : growthStageDistribution.length === 1 ? (
                        <div className="flex flex-col items-center justify-center h-[220px] text-center px-4 w-full">
                            <div className="flex flex-col items-center mb-4">
                                <span className="text-5xl font-extrabold text-gray-900 leading-none">
                                    {growthStageDistribution[0].count}
                                </span>
                                <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mt-1">
                                    Active Plantings
                                </span>
                            </div>

                            <div
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold mb-3 shadow-sm border border-white/50"
                                style={{ backgroundColor: `${growthStageDistribution[0].color}15`, color: growthStageDistribution[0].color }}
                            >
                                <Sprout size={14} />
                                {growthStageDistribution[0].stage}
                            </div>

                            <div className="w-full max-w-[200px] mb-3">
                                <div className="flex items-center justify-between text-[11px] font-bold mb-1.5" style={{ color: growthStageDistribution[0].color }}>
                                    <span>Distribution</span>
                                    <span>{Math.round((growthStageDistribution[0].count / totals.activeCount) * 100)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${(growthStageDistribution[0].count / totals.activeCount) * 100}%`,
                                            backgroundColor: growthStageDistribution[0].color
                                        }}
                                    />
                                </div>
                            </div>

                            <p className="text-[11px] font-medium text-gray-500 leading-tight max-w-[220px]">
                                {growthStageDistribution[0].count === totals.activeCount ? 'All ' : ''}{growthStageDistribution[0].count} active planting{growthStageDistribution[0].count !== 1 ? 's' : ''} {growthStageDistribution[0].count === 1 ? 'is' : 'are'} currently in the <span className="font-semibold text-gray-700">{growthStageDistribution[0].stage}</span>.
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload;
                                        return (
                                            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                                <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.stage}</p>
                                                <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">{item?.count ?? 0} <span className="text-xs font-normal text-gray-500">plantings</span></p>
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

                    {showHarvestSkeleton ? <SkeletonChartBars /> : harvestsError ? <ErrorChart message="Unable to load harvest data." /> : (() => {
                        if (seasonComparison.length === 0) {
                            return (
                                <div className="h-[220px] relative flex items-center justify-center">
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/10 dark:bg-slate-900/10 backdrop-blur-[0.5px]">
                                        <div className="bg-slate-50/90 dark:bg-slate-800/90 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                                            <Wheat size={16} className="text-emerald-600 animate-pulse" />
                                            <span className="text-xs font-semibold text-gray-500 dark:text-slate-300">No season yield data found</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Ensure both Wet and Dry seasons always appear in the chart
                        const wetRecord = seasonComparison.find(s => String(s.season).toLowerCase().includes('wet')) || { season: 'Wet', yield_kg: 0 };
                        const dryRecord = seasonComparison.find(s => String(s.season).toLowerCase().includes('dry')) || { season: 'Dry', yield_kg: 0 };

                        const chartData = [wetRecord, dryRecord];

                        return (
                            <div className="h-[220px] relative">
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={chartData} margin={{ top: 25, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" vertical={false} />
                                        <XAxis dataKey="season" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10.5 }} />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#9ca3af', fontSize: 10.5 }}
                                            tickFormatter={(v) => `${v.toLocaleString()}`}
                                            domain={[0, dataMax => Math.max(10, Math.ceil(dataMax * 1.15))]}
                                        />
                                        <Tooltip
                                            cursor={<SeasonCursor />}
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const item = payload[0]?.payload;
                                                return (
                                                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                                        <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.season} Season</p>
                                                        <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                            {Number(item?.yield_kg || 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">kg</span>
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="yield_kg" radius={[6, 6, 0, 0]} maxBarSize={60}>
                                            {chartData.map((entry) => {
                                                const seasonKey = String(entry.season).toLowerCase();
                                                const fill = seasonKey.includes('wet') ? '#3b82f6' : '#f59e0b';
                                                return <Cell key={entry.season} fill={fill} />;
                                            })}
                                            <LabelList
                                                dataKey="yield_kg"
                                                position="top"
                                                fill="#9ca3af"
                                                fontSize={10.5}
                                                formatter={(v) => `${Number(v).toLocaleString()} kg`}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        );
                    })()}
                </section>
            </div>

            {/* Section 5: Field performance table */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Field Performance Summary</h2>
                    <p className="text-xs text-gray-400 mt-1">Detailed breakdown by field</p>
                </div>

                {showMixedSkeleton ? <SkeletonTable rows={4} cols={5} /> : (plantingsError || harvestsError) ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-red-600 dark:text-red-300">
                        <AlertTriangle size={34} className="text-red-500 dark:text-red-400 mb-2" />
                        <p>Unable to load field performance data.</p>
                    </div>
                ) : fieldRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
                        <BarChart2 size={34} className="text-gray-300 mb-2" />
                        <p>No field data yet.</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile card list */}
                        <div className="md:hidden space-y-3">
                            {fieldRows.map((row) => (
                                <div
                                    key={row.fieldId}
                                    className="rounded-2xl border border-gray-100 bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-900 dark:text-slate-100 break-words">{row.fieldName}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.status === 'Active'
                                                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                                                    : 'bg-gray-100 dark:bg-slate-800/60 text-gray-700 dark:text-slate-300'
                                                    }`}
                                            >
                                                {row.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3 space-y-2.5 text-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Plantings</span>
                                            <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">{row.plantingsCount}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Harvests</span>
                                            <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">{row.harvestCount}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Total Yield</span>
                                            <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">
                                                {row.totalYield.toLocaleString()} <span className="text-gray-500 dark:text-slate-500 font-normal">kg</span>
                                            </span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Avg Yield</span>
                                            <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">
                                                {row.avgYield.toLocaleString()} <span className="text-gray-500 dark:text-slate-500 font-normal">kg</span>
                                            </span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Top Variety</span>
                                            <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">{formatVariant(row.topVariety)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop / tablet table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white dark:bg-slate-800">
                                        <th className="px-5 py-3">FIELD NAME</th>
                                        <th className="px-5 py-3">PLANTINGS</th>
                                        <th className="px-5 py-3">HARVESTS</th>
                                        <th className="px-5 py-3">TOTAL YIELD</th>
                                        <th className="px-5 py-3">AVG YIELD</th>
                                        <th className="px-5 py-3">TOP VARIETY</th>
                                        <th className="px-5 py-3">STATUS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                    {fieldRows.map((row) => (
                                        <tr
                                            key={row.fieldId}
                                            className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 transition-colors"
                                        >
                                            <td className="px-5 py-3 font-semibold text-gray-900 dark:text-slate-100">{row.fieldName}</td>
                                            <td className="px-5 py-3 text-gray-700 dark:text-slate-200">{row.plantingsCount}</td>
                                            <td className="px-5 py-3 text-gray-700 dark:text-slate-200">{row.harvestCount}</td>
                                            <td className="px-5 py-3 text-gray-700 dark:text-slate-200 font-semibold">
                                                {row.totalYield.toLocaleString()} <span className="text-gray-500 dark:text-slate-500 font-normal">kg</span>
                                            </td>
                                            <td className="px-5 py-3 text-gray-700 dark:text-slate-200">
                                                {row.avgYield.toLocaleString()} <span className="text-gray-500 dark:text-slate-500 font-normal">kg</span>
                                            </td>
                                            <td className="px-5 py-3 text-gray-700 dark:text-slate-200">{formatVariant(row.topVariety)}</td>
                                            <td className="px-5 py-3">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.status === 'Active'
                                                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                                                        : 'bg-gray-100 dark:bg-slate-800/60 text-gray-700 dark:text-slate-300'
                                                        }`}
                                                >
                                                    {row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            {/* Section 6: Recent harvests table */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Recent Harvests</h2>
                    <p className="text-xs text-gray-400 mt-1">Last 5 harvest records</p>
                </div>

                {showHarvestSkeleton ? <SkeletonTable rows={4} cols={5} /> : harvestsError ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-red-600 dark:text-red-300">
                        <AlertTriangle size={34} className="text-red-500 dark:text-red-400 mb-2" />
                        <p>Unable to load harvest records.</p>
                    </div>
                ) : recentHarvests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
                        <Wheat size={34} className="text-gray-300 mb-2" />
                        <p>No harvest records found.</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile card list */}
                        <div className="md:hidden space-y-3">
                            {recentHarvests.map((h) => {
                                const p = plantingById.get(h?.planting_id);
                                const variety = h.planting_variety || p?.variety || p?.variety_name || '—';
                                const fieldName = h.field_name || p?.field_name || '—';
                                const yieldClass = getYieldClass(h?.yield_kg);
                                const lifecyclePct = getLifecycleProgressPercent(p);
                                return (
                                    <div
                                        key={h.id}
                                        className="rounded-2xl border border-gray-100 bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 dark:text-slate-100 break-words">{variety}</p>
                                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{fieldName}</p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${yieldClass.className}`}>
                                                    {yieldClass.label}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3 space-y-2.5 text-sm">
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Harvest Date</span>
                                                <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">{h.harvest_date ? formatDisplayDate(h.harvest_date) : '—'}</span>
                                            </div>
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Yield</span>
                                                <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">
                                                    {Number(h.yield_kg || 0).toLocaleString()} <span className="text-gray-500 dark:text-slate-500 font-normal">kg</span>
                                                </span>
                                            </div>
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Lifecycle</span>
                                                <span className="font-semibold text-gray-700 dark:text-slate-200 text-right">{lifecyclePct}%</span>
                                            </div>
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Quality Grade</span>
                                                <span className="text-right">
                                                    <QualityGradeBadge grade={h.quality_grade} />
                                                </span>
                                            </div>
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Remarks</span>
                                                <span className="font-medium text-gray-600 dark:text-slate-300 text-right text-xs max-w-[200px] break-words">{h.remarks || '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop / tablet table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white dark:bg-slate-800">
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
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                    {recentHarvests.map((h) => {
                                        const p = plantingById.get(h?.planting_id);
                                        const variety = h.planting_variety || p?.variety || p?.variety_name || '—';
                                        const fieldName = h.field_name || p?.field_name || '—';
                                        const yieldClass = getYieldClass(h?.yield_kg);
                                        const lifecyclePct = getLifecycleProgressPercent(p);
                                        return (
                                            <tr key={h.id} className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-5 py-3 font-semibold text-gray-900 dark:text-slate-100">{variety}</td>
                                                <td className="px-5 py-3 text-gray-700 dark:text-slate-200">{fieldName}</td>
                                                <td className="px-5 py-3 text-gray-700 dark:text-slate-200">{h.harvest_date ? formatDisplayDate(h.harvest_date) : '—'}</td>
                                                <td className="px-5 py-3 text-gray-700 dark:text-slate-200 font-semibold">{Number(h.yield_kg || 0).toLocaleString()}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${yieldClass.className}`}>
                                                        {yieldClass.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-gray-700 dark:text-slate-200 font-semibold">
                                                    {lifecyclePct}%
                                                </td>
                                                <td className="px-5 py-3">
                                                    <QualityGradeBadge grade={h.quality_grade} />
                                                </td>
                                                <td className="px-5 py-3 text-gray-600 dark:text-slate-300 text-xs max-w-[260px] truncate" title={h.remarks}>
                                                    {h.remarks || '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};

export default Analytics;

