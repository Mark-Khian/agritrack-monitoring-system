import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
    CartesianGrid, Area, AreaChart
} from 'recharts';
import {
    Home, Map, Sprout, Wheat, Tractor,
    Shovel, Droplets, Bug, Scissors,
    FlaskConical, Package, LayoutDashboard,
    Cpu, CloudRain, PlusCircle,
    ChevronRight, AlertTriangle, Info, Layers, Clock
} from 'lucide-react';
import WeatherWidget from '../components/WeatherWidget';
import {
    getFarms,
    getFields,
    getPlantings,
    getHarvests,
    getActivities,
    getWeather
} from '../services/api';

const API = 'http://localhost:5000/api/v1';
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

const PLANTING_VARIETY_CLASS_FILTERS = [
    { value: '', label: 'All variety classes' },
    { value: 'Irrigated / Lowland Varieties', label: 'Irrigated / Lowland' },
    { value: 'Rainfed / Dry-Seeded Varieties (DSR)', label: 'Rainfed / DSR' },
    { value: 'Upland Varieties', label: 'Upland' },
];

// ── Activity Type Icons ───────────────────
const getIconForType = (type) => {
    const icons = {
        'land preparation': <Shovel size={16} className="text-amber-600" />,
        'seeding': <Sprout size={16} className="text-green-600" />,
        'transplanting': <Sprout size={16} className="text-teal-600" />,
        'fertilizing': <FlaskConical size={16} className="text-blue-600" />,
        'irrigation': <Droplets size={16} className="text-cyan-600" />,
        'pest control': <Bug size={16} className="text-red-600" />,
        'weeding': <Scissors size={16} className="text-purple-600" />,
        'harvesting': <Wheat size={16} className="text-yellow-600" />,
        'other': <Package size={16} className="text-gray-500" />,
    };
    return icons[type?.toLowerCase()] || <Package size={16} className="text-gray-500" />;
};

const groupByMonth = (items, dateKey) => {
    const months = {};
    items.forEach(item => {
        const month = new Date(item[dateKey]).toLocaleString('default', {
            month: 'short', year: '2-digit'
        });
        months[month] = (months[month] || 0) + 1;
    });
    return Object.entries(months).map(([month, count]) => ({ month, count }));
};

const groupByField = (items, fieldKey) => {
    const groups = {};
    items.forEach(item => {
        const key = item[fieldKey] || 'Unknown';
        groups[key] = (groups[key] || 0) + 1;
    });
    return Object.entries(groups).map(([name, value]) => ({ name, value }));
};

const harvestByMonth = (items) => {
    const months = {};
    items.forEach(item => {
        const month = new Date(item.harvest_date).toLocaleString('default', {
            month: 'short', year: '2-digit'
        });
        months[month] = (months[month] || 0) + parseFloat(item.yield_kg || 0);
    });
    return Object.entries(months).map(([month, yield_kg]) => ({
        month, yield_kg: parseFloat(yield_kg.toFixed(2))
    }));
};

// ── Summary Cards ─────────────────────────
const SUMMARY_CARDS = (stats) => [
    { label: 'Total Farms', value: stats.farms, icon: Home, color: '#2563eb', accent: '#2563eb', iconBg: '#eff6ff', path: '/farms' },
    { label: 'Total Fields', value: stats.fields, icon: Map, color: '#0d9488', accent: '#0d9488', iconBg: '#f0fdfa', path: '/fields' },
    { label: 'Total Plantings', value: stats.plantings, icon: Sprout, color: '#16a34a', accent: '#16a34a', iconBg: '#f0fdf4', path: '/plantings' },
    { label: 'Total Harvests', value: stats.harvests, icon: Wheat, color: '#d97706', accent: '#d97706', iconBg: '#fffbeb', path: '/harvests' },
    { label: 'Total Activities', value: stats.activities, icon: Tractor, color: '#7c3aed', accent: '#7c3aed', iconBg: '#f5f3ff', path: '/activities' },
];

const toNonNegativeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

// ── Custom Tooltip ────────────────────────
const CustomTooltip = ({ active, payload, label, unit = '' }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2.5 text-sm">
                {label && <p className="text-gray-500 text-xs mb-1">{label}</p>}
                {payload.map((p, i) => (
                    <p key={i} className="font-semibold" style={{ color: p.color || p.fill }}>
                        {p.name}: {p.value}{unit}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// ── Empty State ───────────────────────────
const EmptyChart = ({ message = 'No data available yet.' }) => (
    <div className="flex flex-col items-center justify-center h-55 text-gray-400 gap-2">
        <LayoutDashboard size={32} className="text-gray-300" />
        <p className="text-sm">{message}</p>
    </div>
);

const Dashboard = () => {
    const { token } = useAuth();
    const navigate = useNavigate();

    const [stats, setStats] = useState({ farms: 0, fields: 0, plantings: 0, harvests: 0, activities: 0 });
    const [recentActivities, setRecentActivities] = useState([]);
    const [activitiesList, setActivitiesList] = useState([]);
    const [_plantingStatusData, setPlantingStatusData] = useState([]);
    const [plantingsList, setPlantingsList] = useState([]);
    const [harvestsList, setHarvestsList] = useState([]);
    const [activitiesPerMonth, setActivitiesPerMonth] = useState([]);
    const [_harvestYield, setHarvestYield] = useState([]);
    const [_cropDistribution, setCropDistribution] = useState([]);
    const [loading, setLoading] = useState(true);

    // Plot activity explorer state 
    const [expandedPlantingId, setExpandedPlantingId] = useState(null);
    const [plotActivitiesByPlantingId, setPlotActivitiesByPlantingId] = useState({});
    const [plotActivitiesLoadingByPlantingId, setPlotActivitiesLoadingByPlantingId] = useState({});
    const [plotOverviewTab, setPlotOverviewTab] = useState('active');
    const [expandedHarvestId, setExpandedHarvestId] = useState(null);
    const [plotSearch, setPlotSearch] = useState('');
    const [activityStatusFilter, setActivityStatusFilter] = useState('all');
    const [plantingFilters, setPlantingFilters] = useState({
        variety_class: '',
        variety_id: '',
        variety_null: false,
    });

    // Weather / rain alert state
    const [rainExpected, setRainExpected] = useState(false);
    const [weatherLocation, setWeatherLocation] = useState('Nueva Ecija');

    useEffect(() => {
        if (!token) return;

        const fetchAll = async () => {
            try {
                const plantingParams = { limit: 100 };
                if (plantingFilters.variety_class) {
                    plantingParams.variety_class = plantingFilters.variety_class;
                }
                if (plantingFilters.variety_id && !plantingFilters.variety_null) {
                    plantingParams.variety_id = Number(plantingFilters.variety_id);
                }
                if (plantingFilters.variety_null) {
                    plantingParams.variety_null = '1';
                }

                const [farmsRes, fieldsRes, plantingsRes, harvestsRes, activitiesRes] = await Promise.all([
                    getFarms({ limit: 100 }),
                    getFields({ limit: 100 }),
                    getPlantings(plantingParams),
                    getHarvests({ limit: 100 }),
                    getActivities({ limit: 100, include_system_generated: 0 })
                ]);

                const farms = farmsRes.data.data || [];
                const plantings = plantingsRes.data.data || [];
                const harvests = harvestsRes.data.data || [];
                const activities = activitiesRes.data.data || [];

                setStats({
                    farms: toNonNegativeNumber(farmsRes.data.meta?.total),
                    fields: toNonNegativeNumber(fieldsRes.data.meta?.total),
                    plantings: toNonNegativeNumber(plantingsRes.data.meta?.total),
                    harvests: toNonNegativeNumber(harvestsRes.data.meta?.total),
                    activities: toNonNegativeNumber(activitiesRes.data.meta?.total),
                });

                // Sort by activity date to keep "upcoming" dashboard rows consistent.
                const sortedActivities = activities
                    .slice()
                    .sort((a, b) => new Date(a.activity_date || 0) - new Date(b.activity_date || 0));

                setRecentActivities(sortedActivities.slice(0, 5));
                setActivitiesList(activities);
                setPlantingStatusData(groupByField(plantings, 'status'));
                setPlantingsList(plantings);
                setHarvestsList(harvests);
                setActivitiesPerMonth(groupByMonth(activities, 'activity_date'));
                setHarvestYield(harvestByMonth(harvests));
                setCropDistribution(groupByField(plantings, 'variety'));

                // Use first farm's location for weather widget; fall back to default
                const farmLocation = (farms.length > 0 && farms[0].location)
                    ? farms[0].location
                    : 'Nueva Ecija';
                setWeatherLocation(farmLocation);
                // Fetch rain alert from backend weather proxy
                try {
                    const wRes = await getWeather(farmLocation);
                    setRainExpected(wRes.data.rainExpected || false);
                } catch { /* weather is non-critical */ }
            } catch (err) {
                console.error('Dashboard fetch error:', err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [token, plantingFilters]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalize = (value) => String(value || '').toLowerCase();
    const safeDate = (value) => (value ? new Date(String(value).slice(0, 10)) : null);

    const isOverdue = (activity) => {
        const status = normalize(activity?.status);
        const d = safeDate(activity?.activity_date);
        if (!d) return false;
        return (status === 'pending' || status === 'ongoing') && d < today;
    };

    const getPriorityBadge = (activityType) => {
        const t = normalize(activityType);
        const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold';

        if (t === 'seeding' || t === 'fertilizing') {
            return <span className={`${base} bg-green-100 text-green-700`}>PRIORITY</span>;
        }
        if (t === 'irrigation' || t === 'pest control') {
            return <span className={`${base} bg-red-100 text-red-700`}>CRITICAL</span>;
        }
        if (t === 'transplanting') {
            return <span className={`${base} bg-gray-100 text-gray-700`}>TOMORROW</span>;
        }
        return <span className={`${base} bg-gray-100 text-gray-700`}>NEXT</span>;
    };

    const getTaskIconBox = (activityType) => {
        const t = normalize(activityType);
        const baseBox = 'h-10 w-10 rounded-xl flex items-center justify-center shrink-0';

        if (t === 'seeding') return <div className={`${baseBox} bg-green-50`}><Sprout size={18} className="text-[#166534]" /></div>;
        if (t === 'fertilizing') return <div className={`${baseBox} bg-blue-50`}><FlaskConical size={18} className="text-blue-700" /></div>;
        if (t === 'transplanting') return <div className={`${baseBox} bg-teal-50`}><Sprout size={18} className="text-teal-700" /></div>;
        if (t === 'irrigation') return <div className={`${baseBox} bg-cyan-50`}><Droplets size={18} className="text-cyan-700" /></div>;
        if (t === 'pest control') return <div className={`${baseBox} bg-red-50`}><Bug size={18} className="text-red-700" /></div>;

        return (
            <div className={`${baseBox} bg-gray-50`}>
                {getIconForType(activityType)}
            </div>
        );
    };

    const getTableStatus = (activity) => {
        const status = normalize(activity?.status);
        const overdue = isOverdue(activity);

        if (overdue) {
            return { dot: 'bg-red-500', text: 'Overdue' };
        }
        if (status === 'pending') {
            return { dot: 'bg-orange-500', text: 'Pending' };
        }
        if (status === 'completed') {
            return { dot: 'bg-emerald-600', text: 'Completed' };
        }
        return { dot: 'bg-emerald-600', text: 'Scheduled' };
    };

    const getLifecycleStageIndex = (growthStage, lifecycleState) => {
        const ls = normalize(lifecycleState).replace(/_/g, ' ');
        if (ls === 'harvested' || ls === 'abandoned') return 3;
        if (ls === 'ready for harvest') return 2;
        if (ls === 'maturing') return 1;
        if (ls === 'active' || ls === 'planned') return 0;
        const s = normalize(growthStage);
        if (s === 'land preparation' || s === 'seeding' || s === 'transplanting') return 0; // PLANTING
        if (s === 'tillering' || s === 'booting') return 1; // VEGETATIVE
        if (s === 'heading') return 2; // REPROD.
        if (s === 'ripening' || s === 'harvested') return 3; // HARVEST
        return 0;
    };

    const activeTasksCount = activitiesList.filter((a) => {
        const s = normalize(a?.status);
        return s === 'pending' || s === 'ongoing';
    }).length;

    const topPendingTasks = activitiesList
        .filter((a) => {
            const s = normalize(a?.status);
            return s === 'pending' || s === 'ongoing';
        })
        .slice()
        .sort((a, b) => new Date(a.activity_date || 0) - new Date(b.activity_date || 0))
        .slice(0, 3);

    const lifecyclePlantingCandidates = plantingsList.filter((p) => normalize(p?.status) === 'active');
    const lifecyclePlantingSource = lifecyclePlantingCandidates.length > 0 ? lifecyclePlantingCandidates : plantingsList;
    const mostRecentPlanting = lifecyclePlantingSource
        .slice()
        .sort((a, b) => new Date(b.planting_date || 0) - new Date(a.planting_date || 0))[0] || null;

    const lifecycleStageIndex = mostRecentPlanting
        ? getLifecycleStageIndex(mostRecentPlanting.growth_stage, mostRecentPlanting.lifecycle_state)
        : 0;
    const lifecycleStageLabels = ['PLANTING', 'VEGETATIVE', 'REPROD.', 'HARVEST'];
    const plantingDate = mostRecentPlanting ? safeDate(mostRecentPlanting.planting_date) : null;
    const expectedHarvestDate = mostRecentPlanting ? safeDate(mostRecentPlanting.expected_harvest) : null;
    const totalLifecycleDays = plantingDate && expectedHarvestDate
        ? Math.max(1, Math.round((expectedHarvestDate - plantingDate) / (1000 * 60 * 60 * 24)))
        : 120;
    const currentLifecycleDay = plantingDate
        ? Math.max(0, Math.round((today - plantingDate) / (1000 * 60 * 60 * 24)))
        : 0;

    const overdueHarvestCount = plantingsList.filter((p) => {
        const exp = safeDate(p?.expected_harvest);
        if (!exp) return false;
        if (exp >= today) return false;
        const ls = normalize(p?.lifecycle_state);
        if (ls === 'harvested' || ls === 'abandoned') return false;
        const gs = normalize(p?.growth_stage);
        return gs !== 'harvested';
    }).length;

    const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: '2-digit' });
    const activitiesThisMonthCount = activitiesPerMonth?.find((m) => m.month === currentMonthKey)?.count || 0;
    const pendingActivitiesThisMonthCount = activitiesList.filter((a) => {
        const d = safeDate(a?.activity_date);
        if (!d) return false;
        const isThisMonth = d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        const s = normalize(a?.status);
        return isThisMonth && (s === 'pending' || s === 'ongoing');
    }).length;

    const togglePlotActivities = async (plantingId) => {
        if (!plantingId) return;

        // Collapse if clicking the same card.
        if (expandedPlantingId === plantingId) {
            setExpandedPlantingId(null);
            return;
        }

        setExpandedPlantingId(plantingId);

        // Lazy-load activities only when the plot is expanded for the first time.
        if (plotActivitiesByPlantingId[plantingId]) return;

        setPlotActivitiesLoadingByPlantingId((prev) => ({ ...prev, [plantingId]: true }));
        try {
            const res = await getActivities({
                planting_id: plantingId,
                include_system_generated: 1,
                limit: 100
            });
            const list = res?.data?.data || [];
            setPlotActivitiesByPlantingId((prev) => ({ ...prev, [plantingId]: list }));
        } catch (err) {
            console.error('Plot activities fetch error:', err?.message || err);
            setPlotActivitiesByPlantingId((prev) => ({ ...prev, [plantingId]: [] }));
        } finally {
            setPlotActivitiesLoadingByPlantingId((prev) => ({ ...prev, [plantingId]: false }));
        }
    };

    const getActivityStatusBadge = (activity) => {
        const status = normalize(activity?.status);
        const overdue = isOverdue(activity);

        if (status === 'completed') {
            return { label: 'Completed', className: 'bg-green-100 text-green-700' };
        }
        if (overdue) {
            return { label: 'Overdue', className: 'bg-red-100 text-red-700' };
        }
        if (status === 'ongoing') {
            return { label: 'Ongoing', className: 'bg-amber-100 text-amber-800' };
        }
        return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    };

    const getMaturityDays = (plot) => {
        if (Number.isFinite(Number(plot?.maturity_days)) && Number(plot.maturity_days) > 0) {
            return Number(plot.maturity_days);
        }
        if (Number.isFinite(Number(plot?.expected_growth_days)) && Number(plot.expected_growth_days) > 0) {
            return Math.max(
                1,
                Number(plot.expected_growth_days) + Number(plot?.adjustment_days || 0)
            );
        }
        const planted = safeDate(plot?.planting_date);
        const expected = safeDate(plot?.expected_harvest);
        if (planted && expected) {
            const diff = Math.round((expected - planted) / (1000 * 60 * 60 * 24));
            if (diff > 0) return diff;
        }
        return 120;
    };

    const getLifecycleProgressPercent = (plot) => {
        const pe = plot?.progress_estimate;
        if (pe != null && Number.isFinite(Number(pe))) {
            return Math.max(0, Math.min(100, Math.round(Number(pe) * 100)));
        }
        const planted = safeDate(plot?.planting_date);
        if (!planted) return 0;
        const maturityDays = getMaturityDays(plot);
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

    const hasPendingOrOngoing = (activity) => {
        const status = normalize(activity?.status);
        return status === 'pending' || status === 'ongoing';
    };

    const activePlots = plantingsList
        .filter((plot) => {
            const hasActivePlantingStatus = normalize(plot?.status) === 'active';
            const hasOpenActivities = activitiesList.some((a) => a.planting_id === plot.id && hasPendingOrOngoing(a));
            return hasActivePlantingStatus || hasOpenActivities;
        })
        .filter((plot) => {
            if (!plotSearch.trim()) return true;
            const label = `${plot.variety || 'Plot'} ${plot.field_name || ''}`.toLowerCase();
            return label.includes(plotSearch.trim().toLowerCase());
        })
        .slice()
        .sort((a, b) => new Date(b.planting_date || 0) - new Date(a.planting_date || 0));

    const completedHarvests = harvestsList
        .filter((h) => {
            if (!plotSearch.trim()) return true;
            const planting = plantingsList.find((p) => p.id === h.planting_id);
            const label = `${h.planting_variety || planting?.variety || ''} ${h.field_name || planting?.field_name || ''}`.toLowerCase();
            return label.includes(plotSearch.trim().toLowerCase());
        })
        .slice()
        .sort((a, b) => new Date(b.harvest_date || 0) - new Date(a.harvest_date || 0));

    const downloadHarvestCsv = (harvest) => {
        const rows = [
            ['Plot', 'Crop Type', 'Yield (kg)', 'Harvest Date', 'Performed By', 'Notes'],
            [
                `${harvest.field_name || '—'} (${harvest.planting_variety || '—'})`,
                harvest.planting_variety || '—',
                harvest.yield_kg || '0',
                harvest.harvest_date ? String(harvest.harvest_date).slice(0, 10) : '—',
                harvest.performed_by_name || '—',
                (harvest.notes || '').replaceAll('"', '""')
            ]
        ];
        const csv = rows.map((r) => r.map((v) => `"${String(v)}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `harvest-${harvest.id || 'record'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 bg-[#f5f5f0] min-h-full text-gray-900">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Real-time agronomic insights for AgriTrack
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                        Insights are computed from your planting lifecycle records (supports historical + future planning).
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/activities')}
                        className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 transition-colors"
                    >
                        + Log Activity
                    </button>
                    <button
                        onClick={() => navigate('/harvests')}
                        className="inline-flex items-center justify-center rounded-xl bg-[#166534] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12532c] transition-colors"
                    >
                        + Record Harvest
                    </button>
                </div>
            </div>

            {/* No plantings onboarding (avoid "system error" confusion) */}
            {(!plantingsList || plantingsList.length === 0) && (
                <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-gray-900">No plantings yet</p>
                            <p className="mt-1 text-sm text-gray-500">
                                Create your first planting to unlock lifecycle tasks, activities, and harvest planning.
                            </p>
                            <p className="mt-2 text-xs text-gray-400">
                                Season is a reporting label for your planting record, not a system availability requirement.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => navigate('/plantings')}
                                className="inline-flex items-center justify-center rounded-xl bg-[#166534] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12532c] transition-colors"
                            >
                                + Create Planting
                            </button>
                            <button
                                onClick={() => navigate('/fields')}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Add Fields
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: 'Total Farms', value: stats.farms, icon: Home, accent: '#166534', iconBg: '#ecfdf3', path: '/farms', iconColor: '#166534' },
                    { label: 'Total Fields', value: stats.fields, icon: Map, accent: '#0d9488', iconBg: '#e0fef9', path: '/fields', iconColor: '#0d9488' },
                    { label: 'Total Plantings', value: stats.plantings, icon: Sprout, accent: '#16a34a', iconBg: '#f0fdf4', path: '/plantings', iconColor: '#16a34a' },
                    { label: 'Total Harvests', value: stats.harvests, icon: Wheat, accent: '#d97706', iconBg: '#fffbeb', path: '/harvests', iconColor: '#d97706' },
                ].map((card) => {
                    const Icon = card.icon;
                    return (
                        <button
                            key={card.label}
                            type="button"
                            onClick={() => navigate(card.path)}
                            className="group relative flex items-start gap-4 rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-4 text-left transition-colors hover:bg-gray-50"
                        >
                            <span
                                className="absolute left-0 top-0 h-full w-[4px] rounded-l-2xl"
                                style={{ backgroundColor: card.accent }}
                            />
                            <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: card.iconBg }}>
                                <Icon size={20} style={{ color: card.iconColor }} />
                            </span>
                            <span className="relative z-10">
                                <span className="block text-2xl font-bold text-gray-900 leading-none">{card.value}</span>
                                <span className="mt-2 block text-xs font-medium text-gray-600">{card.label}</span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Today's Tasks */}
                    <div className="rounded-2xl bg-white border border-gray-100 p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-bold">Today's Tasks</h2>
                                <span className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700">
                                    {activeTasksCount} Active Tasks
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3">
                            {topPendingTasks.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
                                    <Tractor size={28} className="mb-2 text-gray-300" />
                                    No pending activities right now.
                                </div>
                            ) : (
                                topPendingTasks.map((act) => {
                                    const activityName = normalize(act?.activity_type)?.replaceAll('_', ' ') || 'Activity';
                                    return (
                                        <div
                                            key={act.id}
                                            className="group flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                {getTaskIconBox(act.activity_type)}
                                                <div>
                                                    <p className="text-sm font-bold capitalize">{activityName}</p>
                                                    <p className="mt-1 text-xs text-gray-600">
                                                        {act.planting_variety || '—'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {getPriorityBadge(act.activity_type)}
                                                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Upcoming Activities Table */}
                    <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-bold">Upcoming Activities</h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white">
                                    <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        <th className="px-5 py-3">ACTIVITY</th>
                                        <th className="px-5 py-3">FIELD</th>
                                        <th className="px-5 py-3">DATE</th>
                                        <th className="px-5 py-3">STATUS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {recentActivities.slice(0, 5).map((act) => {
                                        const { dot, text } = getTableStatus(act);
                                        return (
                                            <tr key={act.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <span className="font-semibold text-gray-900 capitalize">
                                                        {normalize(act?.activity_type).replaceAll('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-gray-700">
                                                    {act.planting_variety || '—'}
                                                </td>
                                                <td className="px-5 py-3 text-gray-700">
                                                    {act.activity_date?.slice(0, 10) || '—'}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`h-2 w-2 rounded-full ${dot}`} />
                                                        <span className="text-gray-700 font-medium">{text}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {recentActivities.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                                                No upcoming activities yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* Right sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Weather */}
                    <WeatherWidget
                        location={weatherLocation}
                        variant="dashboard"
                        rainExpected={rainExpected}
                    />

                    {/* Crop Lifecycle */}
                    <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold">Active Planting</h2>
                                <p className="mt-1 text-sm text-gray-600">
                                    {mostRecentPlanting
                                        ? `${mostRecentPlanting.variety || 'Variety'}${mostRecentPlanting.field_name ? ` • ${mostRecentPlanting.field_name}` : ''}`
                                        : 'No active planting found'}
                                </p>
                            </div>
                            <Layers className="h-6 w-6 text-emerald-700" />
                        </div>

                        <div className="mt-4">
                            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                {lifecycleStageLabels.map((label, idx) => (
                                    <span
                                        key={label}
                                        className={idx === lifecycleStageIndex ? 'text-emerald-700' : 'text-gray-400'}
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                                <div
                                    className="h-full bg-emerald-600"
                                    style={{ width: `${((lifecycleStageIndex + 1) / 4) * 100}%` }}
                                />
                            </div>

                            <div className="mt-3 text-xs text-gray-600">
                                Current: <span className="font-bold text-gray-900">{Math.min(totalLifecycleDays, currentLifecycleDay)}</span> of{' '}
                                <span className="font-bold text-gray-900">{totalLifecycleDays}</span> days
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            {/* Plot Overview + Critical Alerts — flex row so both panels align to the same top edge */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
                {plantingsList.length > 0 && (
                    <div className="min-w-0 w-full lg:flex-[2_2_0%]">
                        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-bold">Plot Overview</h2>
                                    <p className="mt-1 text-xs text-gray-400">
                                        View active plot activities separately from completed harvest records.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPlotOverviewTab('active')}
                                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors ${plotOverviewTab === 'active'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        Active Plots
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPlotOverviewTab('completed')}
                                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors ${plotOverviewTab === 'completed'
                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        Completed Harvests
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    type="text"
                                    value={plotSearch}
                                    onChange={(e) => setPlotSearch(e.target.value)}
                                    placeholder="Search by plot or variety..."
                                    className="w-full sm:w-72 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                                />
                                {plotOverviewTab === 'active' && (
                                    <select
                                        value={activityStatusFilter}
                                        onChange={(e) => setActivityStatusFilter(e.target.value)}
                                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                                    >
                                        <option value="all">All statuses</option>
                                        <option value="pending">Pending</option>
                                        <option value="ongoing">Ongoing</option>
                                    </select>
                                )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                                <span className="font-medium text-gray-500 mr-1">Plantings API filter:</span>
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

                            {plotOverviewTab === 'active' && (
                                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {activePlots.map((plot) => {
                                        const pid = plot.id;
                                        const isExpanded = expandedPlantingId === pid;
                                        const activitiesForPlot = plotActivitiesByPlantingId[pid];
                                        const isLoadingPlot = !!plotActivitiesLoadingByPlantingId[pid];
                                        const pendingCount = activitiesList.filter((a) => a.planting_id === pid && hasPendingOrOngoing(a)).length;
                                        const criticalCount = activitiesList.filter((a) => {
                                            if (a.planting_id !== pid || !hasPendingOrOngoing(a)) return false;
                                            const t = normalize(a.activity_type);
                                            return t === 'irrigation' || t === 'pest control';
                                        }).length;

                                        const plotTitle = `${plot.variety || 'Plot'}${plot.field_name ? ` • ${plot.field_name}` : ''}`;
                                        const plotStage = plot.growth_stage ? String(plot.growth_stage).replaceAll('_', ' ') : null;
                                        const progressPercent = getLifecycleProgressPercent(plot);
                                        const matchingHarvest = harvestsList
                                            .filter((h) => h.planting_id === pid)
                                            .slice()
                                            .sort((a, b) => new Date(b.harvest_date || 0) - new Date(a.harvest_date || 0))[0];
                                        const yieldClass = getYieldClass(matchingHarvest?.yield_kg);
                                        const filteredExpandedActivities = (activitiesForPlot || []).filter((a) => {
                                            if (!hasPendingOrOngoing(a) && normalize(a?.status) !== 'completed') return true;
                                            if (activityStatusFilter === 'all') return true;
                                            return normalize(a?.status) === activityStatusFilter;
                                        });

                                        return (
                                            <div key={pid} className="rounded-xl border border-gray-100 overflow-hidden bg-white h-88 flex flex-col">
                                                <button
                                                    type="button"
                                                    onClick={() => togglePlotActivities(pid)}
                                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-gray-900 truncate">{plotTitle}</p>
                                                            <p className="mt-1 text-xs text-gray-500 truncate">
                                                                {plot.planting_date ? `Planted: ${plot.planting_date.slice(0, 10)}` : 'Planted: —'}
                                                            </p>
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800">
                                                                    {pendingCount} pending
                                                                </span>
                                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${yieldClass.className}`}>
                                                                    {yieldClass.label}
                                                                </span>
                                                                {criticalCount > 0 && (
                                                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-700">
                                                                        {criticalCount} critical
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <ChevronRight
                                                            className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                        />
                                                    </div>
                                                    <div className="mt-3">
                                                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                                                            <span>Lifecycle Progress</span>
                                                            <span className="font-semibold text-gray-700">{progressPercent}%</span>
                                                        </div>
                                                        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-emerald-600"
                                                                style={{ width: `${progressPercent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </button>

                                                <div className="px-4 pb-4 flex-1 min-h-0">
                                                    {isExpanded && (
                                                        <>
                                                            {isLoadingPlot && (
                                                                <div className="flex items-center gap-2 text-sm text-gray-500 pt-2">
                                                                    <span className="w-3 h-3 rounded-full bg-emerald-600 animate-pulse" />
                                                                    Loading activities...
                                                                </div>
                                                            )}

                                                            {!isLoadingPlot && (
                                                                <>
                                                                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                                                        <span className="inline-flex items-center gap-2">
                                                                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                                            Manual
                                                                        </span>
                                                                        <span className="inline-flex items-center gap-2">
                                                                            <span className="h-2 w-2 rounded-full bg-gray-400" />
                                                                            System
                                                                        </span>
                                                                    </div>

                                                                    <div className="mt-3 space-y-2 h-full overflow-y-auto overscroll-contain pr-1">
                                                                        {filteredExpandedActivities.length === 0 ? (
                                                                            <div className="text-sm text-gray-400 py-2">
                                                                                No activities found for this plot.
                                                                            </div>
                                                                        ) : (
                                                                            filteredExpandedActivities.map((act) => {
                                                                                const statusBadge = getActivityStatusBadge(act);
                                                                                const isSystem = !!act.is_system_generated;
                                                                                const rowClass = isSystem
                                                                                    ? 'bg-gray-50'
                                                                                    : 'bg-emerald-50/60';
                                                                                const textClass = isSystem ? 'text-gray-700' : 'text-emerald-900';

                                                                                const activityLabel = normalize(act?.activity_type)
                                                                                    ? normalize(act.activity_type).replaceAll('_', ' ')
                                                                                    : '—';

                                                                                return (
                                                                                    <div
                                                                                        key={act.id}
                                                                                        className={`rounded-lg border border-gray-100 px-3 py-2 ${rowClass}`}
                                                                                    >
                                                                                        <div className="flex items-start justify-between gap-3">
                                                                                            <p className={`text-sm font-semibold truncate ${textClass}`}>
                                                                                                {activityLabel}
                                                                                            </p>
                                                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge.className}`}>
                                                                                                {statusBadge.label}
                                                                                            </span>
                                                                                        </div>

                                                                                        <div className="mt-2 flex items-center justify-between gap-3">
                                                                                            <p className="text-xs text-gray-600 truncate" title={act.notes}>
                                                                                                Notes: {act.notes || '—'}
                                                                                            </p>
                                                                                            <p className="text-xs text-gray-500 whitespace-nowrap">
                                                                                                {act.activity_date ? act.activity_date.slice(0, 10) : '—'}
                                                                                            </p>
                                                                                        </div>

                                                                                        {plotStage && isSystem && (
                                                                                            <p className="mt-2 text-[11px] text-gray-500">
                                                                                                System activity for lifecycle stage: {plotStage}
                                                                                            </p>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {activePlots.length === 0 && (
                                        <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                                            No active plots found with pending/ongoing activities.
                                        </div>
                                    )}
                                </div>
                            )}

                            {plotOverviewTab === 'completed' && (
                                <div className="mt-4 grid grid-cols-1 gap-3 items-start sm:grid-cols-2">
                                    {completedHarvests.map((harvest) => {
                                        const planting = plantingsList.find((p) => p.id === harvest.planting_id);
                                        const cardTitle = `${harvest.planting_variety || planting?.variety || 'Harvest'}${harvest.field_name ? ` • ${harvest.field_name}` : (planting?.field_name ? ` • ${planting.field_name}` : '')}`;
                                        const isExpanded = expandedHarvestId === harvest.id;
                                        return (
                                            <div key={harvest.id} className="self-start rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedHarvestId((prev) => (prev === harvest.id ? null : harvest.id))}
                                                    className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-amber-900 truncate">{cardTitle}</p>
                                                            <p className="mt-1 text-xs text-amber-800/80">
                                                                Yield: {harvest.yield_kg || '0'} kg • {harvest.harvest_date ? String(harvest.harvest_date).slice(0, 10) : '—'}
                                                            </p>
                                                        </div>
                                                        <ChevronRight className={`h-5 w-5 text-amber-700 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="px-4 pb-4 border-t border-amber-200/60">
                                                        <div className="mt-3 space-y-1 text-sm">
                                                            <p><span className="font-semibold text-amber-900">Crop type:</span> <span className="text-amber-800">{harvest.planting_variety || planting?.variety || '—'}</span></p>
                                                            <p><span className="font-semibold text-amber-900">Yield:</span> <span className="text-amber-800">{harvest.yield_kg || '0'} kg</span></p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => downloadHarvestCsv(harvest)}
                                                            className="mt-3 inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                                                        >
                                                            Export CSV
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {completedHarvests.length === 0 && (
                                        <div className="sm:col-span-2 rounded-xl border border-dashed border-amber-200 p-6 text-center text-sm text-amber-700/70">
                                            No completed harvest records found.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="min-w-0 w-full lg:flex-[1_1_0%]">
                    <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                        <h2 className="text-lg font-bold">Critical Alerts</h2>

                        <div className="mt-4 space-y-3">
                            <div className={`flex items-start gap-3 rounded-xl p-4 ${overdueHarvestCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                                <AlertTriangle className={`mt-0.5 h-5 w-5 ${overdueHarvestCount > 0 ? 'text-red-600' : 'text-gray-500'}`} />
                                <div>
                                    <p className="font-bold text-gray-900">Overdue Harvest</p>
                                    <p className={`mt-1 text-xs ${overdueHarvestCount > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                                        {overdueHarvestCount > 0
                                            ? `${overdueHarvestCount} planting(s) are past their expected harvest date. Review field conditions and harvest plans.`
                                            : 'No plantings are past expected harvest date.'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 rounded-xl p-4 bg-gray-50">
                                <Clock className="mt-0.5 h-5 w-5 text-gray-600" />
                                <div>
                                    <p className="font-bold text-gray-900">Pending Activities</p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        {pendingActivitiesThisMonthCount} pending/ongoing activity(ies) scheduled for this month.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 rounded-xl p-4 bg-yellow-50">
                                <Info className="mt-0.5 h-5 w-5 text-yellow-700" />
                                <div>
                                    <p className="font-bold text-gray-900">
                                        {activitiesThisMonthCount === 0 ? 'Low Activity' : 'Monthly Activity'}
                                    </p>
                                    <p className="mt-1 text-xs text-yellow-900/80">
                                        {activitiesThisMonthCount === 0
                                            ? 'No activities logged this month. Schedule key field operations to stay on track.'
                                            : `${activitiesThisMonthCount} activity(ies) logged this month. Keep planning future tasks.`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;