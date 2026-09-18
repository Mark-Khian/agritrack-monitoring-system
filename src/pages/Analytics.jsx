import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, ReferenceArea, Sector
} from 'recharts';
import {
    Loader2, AlertTriangle,
    Wheat, TrendingUp, Sprout, Award, Activity,
    BarChart2, Home, Tractor, Map as MapIcon,
    Shovel, Droplets, Bug, Scissors,
    FlaskConical, Package, ChevronRight, ChevronDown, Inbox
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
import { getActivities, getHarvests, getPlantings } from '../services/api';
import {
    harvestByPeriod,
    fillTimelineForRange,
    timelineSubtitleForRange,
} from '../utils/analyticsTimeline';
import useTheme from '../hooks/useTheme';
import { patchSearchParams, pickAllowed } from '../utils/urlQueryState';

const ANALYTICS_RANGES = ['7d', '30d', '3m', 'all'];

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

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

const EmptyChart = ({ icon: Icon = Inbox, message }) => (
    <div className="h-[220px] flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-3">
            <Icon size={22} className="text-gray-400 dark:text-slate-500" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-slate-400 max-w-[240px] leading-snug">
            {message || 'No data available yet.'}
        </p>
    </div>
);

/** Sit the tooltip above and slightly beside the active point instead of covering it. */
const ChartTooltipFrame = ({ children }) => (
    <div
        className="pointer-events-none"
        style={{ transform: 'translate(12px, calc(-100% - 10px))' }}
    >
        {children}
    </div>
);

const CHART_TOOLTIP_PROPS = {
    offset: 18,
    allowEscapeViewBox: { x: true, y: true },
    wrapperStyle: { outline: 'none', zIndex: 20, pointerEvents: 'none' },
};

/** Same RGB as Harvest Yield Wet/Dry ReferenceArea (rgba(59,130,246) / rgba(245,158,11)). */
const SEASON_WET_HEX = '#3b82f6';
const SEASON_DRY_HEX = '#f59e0b';

const seasonBarFill = (season) => {
    const s = String(season || '').toLowerCase();
    return s.includes('dry') ? SEASON_DRY_HEX : SEASON_WET_HEX;
};

const roundedTopBarPath = (x, y, width, height, radius = 8) => {
    const h = Math.max(height, 0);
    const r = Math.min(radius, width / 2, h);
    if (r <= 0) {
        return `M${x},${y + h}H${x + width}V${y}H${x}Z`;
    }
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + h}Z`;
};

const SeasonZeroAwareBar = (props) => {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props;
    const isZero = !Number(payload?.yield_kg);
    const barWidth = Math.max(width, 22);
    const barX = x + (width - barWidth) / 2;
    if (isZero) {
        const placeholderH = 10;
        return (
            <rect
                className="recharts-bar-rectangle"
                x={barX}
                y={y - placeholderH}
                width={barWidth}
                height={placeholderH}
                fill="none"
                stroke={fill}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                rx={8}
                opacity={0.75}
            />
        );
    }
    return (
        <path
            className="recharts-bar-rectangle"
            d={roundedTopBarPath(x, y, width, Math.max(height, 0), 8)}
            fill={fill}
        />
    );
};

const FieldStatusBadge = ({ status }) => {
    const isActive = status === 'Active';
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                isActive
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'
            }`}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    isActive ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-slate-400 dark:bg-slate-500'
                }`}
            />
            {status}
        </span>
    );
};

/** No harvest rows in range → placeholder. Harvests present at 0 kg → measured zero. */
const FieldYieldDisplay = ({ harvestCount, value, fractionDigits = 0 }) => {
    if (Number(harvestCount) === 0) {
        return <span className="text-slate-400 dark:text-slate-500">—</span>;
    }
    const n = Number(value) || 0;
    const shown = fractionDigits > 0
        ? n.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
        : n.toLocaleString();
    return (
        <>
            {shown}{' '}
            <span className="text-slate-400 dark:text-slate-500 font-normal">kg</span>
        </>
    );
};

/** Same wet/dry test as Season Comparison (planting.season string includes 'wet' / 'dry'). */
const classifyWetDrySeason = (season) => {
    const s = String(season || '').toLowerCase();
    if (s.includes('wet')) return 'Wet';
    if (s.includes('dry')) return 'Dry';
    return null;
};

const seasonBandsFromYieldTimeline = (chartData, plantingById) => {
    const perSlot = (chartData || []).map((slot) => {
        let wet = 0;
        let dry = 0;
        (slot.harvestsList || []).forEach((h) => {
            const planting = plantingById.get(h?.planting_id);
            const kind = classifyWetDrySeason(planting?.season || h?.season || h?.cropping_season);
            if (kind === 'Wet') wet += 1;
            if (kind === 'Dry') dry += 1;
        });
        if (wet === 0 && dry === 0) return null;
        return wet >= dry ? 'Wet' : 'Dry';
    });

    const bands = [];
    let i = 0;
    while (i < perSlot.length) {
        if (!perSlot[i]) {
            i += 1;
            continue;
        }
        const season = perSlot[i];
        let j = i;
        while (j + 1 < perSlot.length && perSlot[j + 1] === season) j += 1;
        bands.push({
            season,
            x1: chartData[i].month,
            x2: chartData[j].month,
        });
        i = j + 1;
    }
    return bands;
};

const peakAndLowIndexes = (chartData) => {
    const scored = (chartData || [])
        .map((row, index) => ({ index, yield_kg: Number(row.yield_kg) || 0 }))
        .filter((d) => d.yield_kg > 0);
    if (scored.length < 3) return { peakIdx: null, lowIdx: null };

    let peak = scored[0];
    let low = scored[0];
    scored.forEach((d) => {
        if (d.yield_kg > peak.yield_kg) peak = d;
        if (d.yield_kg < low.yield_kg) low = d;
    });
    if (peak.index === low.index || peak.yield_kg === low.yield_kg) {
        return { peakIdx: null, lowIdx: null };
    }
    return { peakIdx: peak.index, lowIdx: low.index };
};

const riceGreenByRank = (rank, rankCount, isDark) => {
    const steps = Math.max(rankCount - 1, 1);
    const t = 1 - rank / steps;
    const opacity = 0.38 + t * 0.62;
    return isDark
        ? `rgba(74, 222, 128, ${opacity.toFixed(3)})`
        : `rgba(22, 101, 52, ${opacity.toFixed(3)})`;
};

/** Rank 0 = highest value. Ties share a rank (same unique value). */
const rankFillsForValues = (values, isDark) => {
    const uniqueDesc = [...new Set((values || []).map((v) => Number(v) || 0))].sort((a, b) => b - a);
    return (values || []).map((v) => {
        const rank = uniqueDesc.indexOf(Number(v) || 0);
        return riceGreenByRank(rank, uniqueDesc.length, isDark);
    });
};

const barHoverClassName = (isDark) =>
    `[&_.recharts-bar-rectangle]:transition-[filter] [&_.recharts-bar-rectangle]:duration-150 ${
        isDark
            ? '[&_.recharts-bar-rectangle:hover]:[filter:brightness(1.22)]'
            : '[&_.recharts-bar-rectangle:hover]:[filter:brightness(1.1)]'
    }`;

const activityAxisMax = (dataMax) => {
    const n = Math.max(0, Number(dataMax) || 0);
    const padded = n * 1.2;
    if (padded <= 1) return 1;
    if (padded <= 20) return Math.ceil(padded);
    const exp = Math.floor(Math.log10(padded));
    const mag = 10 ** exp;
    const mantissa = padded / mag;
    const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 2.5 ? 2.5 : mantissa <= 5 ? 5 : 10;
    return nice * mag;
};

/** 20% headroom, then round up to a 2-significant-digit clean number (5210 → 6300, not 5992). */
const niceAxisMax = (dataMax) => {
    const n = Math.max(0, Number(dataMax) || 0);
    const padded = n * 1.2;
    if (padded <= 1) return 1;
    if (padded <= 20) return Math.ceil(padded);
    const exp = Math.floor(Math.log10(padded));
    const mag = 10 ** Math.max(0, exp - 1);
    return Math.ceil(padded / mag) * mag;
};

const QUALITY_GRADE_ORDER = ['A', 'B', 'C', 'rejected'];
const QUALITY_FILL = {
    a: '#22c55e',
    b: '#3b82f6',
    c: '#f59e0b',
    rejected: '#ef4444',
};

const orderQualityGrades = (rows) => {
    const byGrade = new Map((rows || []).map((row) => [String(row.grade), row]));
    return QUALITY_GRADE_ORDER.map((grade) => byGrade.get(grade)).filter(Boolean);
};

const HarvestQualityDonut = ({ data, isDark }) => {
    const chartData = orderQualityGrades(data);
    const total = chartData.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const countA = Number(chartData.find((row) => row.grade === 'A')?.count || 0);
    const countB = Number(chartData.find((row) => row.grade === 'B')?.count || 0);
    const countRejected = Number(
        chartData.find((row) => String(row.grade).toLowerCase() === 'rejected')?.count || 0
    );
    const gradedTotal = total - countRejected;
    const highQualityPct = gradedTotal > 0
        ? Math.round(((countA + countB) / gradedTotal) * 100)
        : 0;

    const renderActiveShape = (props) => (
        <Sector
            {...props}
            outerRadius={(props.outerRadius || 0) + 5}
            stroke="none"
            style={{
                filter: isDark ? 'brightness(1.2)' : 'brightness(1.08)',
            }}
        />
    );

    return (
        <div className="h-[220px] flex flex-col">
            <div className="relative flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Tooltip
                            {...CHART_TOOLTIP_PROPS}
                            content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const item = payload[0]?.payload;
                                return (
                                    <ChartTooltipFrame>
                                        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                            <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">Grade {item?.grade}</p>
                                            <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                {item?.count ?? 0} <span className="text-xs font-normal text-gray-500">harvest{item?.count !== 1 ? 's' : ''}</span>
                                            </p>
                                        </div>
                                    </ChartTooltipFrame>
                                );
                            }}
                        />
                        <Pie
                            data={chartData}
                            dataKey="count"
                            nameKey="grade"
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={76}
                            startAngle={90}
                            endAngle={-270}
                            paddingAngle={0}
                            cornerRadius={0}
                            stroke="none"
                            isAnimationActive={false}
                            activeShape={renderActiveShape}
                        >
                            {chartData.map((entry) => {
                                const gradeKey = String(entry.grade).toLowerCase();
                                return (
                                    <Cell
                                        key={entry.grade}
                                        fill={QUALITY_FILL[gradeKey] || QUALITY_FILL.rejected}
                                        stroke="none"
                                        strokeWidth={0}
                                    />
                                );
                            })}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-gray-900 dark:text-white leading-none tabular-nums">
                        {highQualityPct}%
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 mt-1 tracking-wide">
                        High Quality
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                        {total} harvest{total !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-1 pb-0.5">
                {chartData.map((entry) => {
                    const count = Number(entry.count || 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const isRejected = String(entry.grade).toLowerCase() === 'rejected';
                    const gradeKey = String(entry.grade).toLowerCase();
                    return (
                        <span
                            key={entry.grade}
                            className={`inline-flex items-center gap-1.5 text-[11px] ${
                                isRejected && count > 0
                                    ? 'font-bold text-amber-800 dark:text-amber-300'
                                    : 'font-medium text-gray-600 dark:text-slate-300'
                            }`}
                        >
                            <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: QUALITY_FILL[gradeKey] || QUALITY_FILL.rejected }}
                            />
                            {entry.grade} · {count} ({pct}%)
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const GROWTH_STAGE_ORDER = [
    'Seedling Stage',
    'Vegetative Stage',
    'Reproductive Stage',
    'Ripening Stage',
    'Ready for Harvest',
];

const GROWTH_STAGE_FILL = {
    'Seedling Stage': '#4ade80',
    'Vegetative Stage': '#22c55e',
    'Reproductive Stage': '#166534',
    'Ripening Stage': '#ca8a04',
    'Ready for Harvest': '#d97706',
};

const GROWTH_STAGE_OTHER_FILL = '#94a3b8';

const growthStageFill = (stage) => GROWTH_STAGE_FILL[stage] || GROWTH_STAGE_OTHER_FILL;

const growthStageLegendLabel = (stage) => {
    if (stage === 'Ready for Harvest') return 'Ready';
    return String(stage || '').replace(/ Stage$/i, '') || stage;
};

const orderGrowthStages = (rows) => {
    const byStage = new Map((rows || []).map((row) => [String(row.stage), row]));
    const canonical = GROWTH_STAGE_ORDER.map((stage) => byStage.get(stage)).filter(Boolean);
    const extras = [...byStage.keys()]
        .filter((stage) => !GROWTH_STAGE_ORDER.includes(stage))
        .sort((a, b) => a.localeCompare(b))
        .map((stage) => byStage.get(stage));
    return [...canonical, ...extras];
};

const GrowthStagesDonut = ({ data, isDark }) => {
    const chartData = orderGrowthStages(data);
    const total = chartData.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const dominant = chartData.reduce((best, row) => {
        const count = Number(row.count || 0);
        if (!best || count > best.count) return { stage: row.stage, count };
        return best;
    }, null);
    const dominantPct = total > 0 && dominant ? (dominant.count / total) * 100 : 0;
    const showDominant = dominantPct > 60 && chartData.length > 0;

    const renderActiveShape = (props) => (
        <Sector
            {...props}
            outerRadius={(props.outerRadius || 0) + 5}
            stroke="none"
            style={{
                filter: isDark ? 'brightness(1.2)' : 'brightness(1.08)',
            }}
        />
    );

    return (
        <div className="h-[220px] flex flex-col">
            <div className="relative flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Tooltip
                            {...CHART_TOOLTIP_PROPS}
                            content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const item = payload[0]?.payload;
                                const count = Number(item?.count || 0);
                                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                return (
                                    <ChartTooltipFrame>
                                        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                            <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.stage}</p>
                                            <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                {count}{' '}
                                                <span className="text-xs font-normal text-gray-500">
                                                    planting{count !== 1 ? 's' : ''} ({pct}%)
                                                </span>
                                            </p>
                                        </div>
                                    </ChartTooltipFrame>
                                );
                            }}
                        />
                        <Pie
                            data={chartData}
                            dataKey="count"
                            nameKey="stage"
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={76}
                            startAngle={90}
                            endAngle={-270}
                            paddingAngle={0}
                            cornerRadius={0}
                            stroke="none"
                            isAnimationActive={false}
                            activeShape={renderActiveShape}
                        >
                            {chartData.map((entry) => (
                                <Cell
                                    key={entry.stage}
                                    fill={growthStageFill(entry.stage)}
                                    stroke="none"
                                    strokeWidth={0}
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-gray-900 dark:text-white leading-none tabular-nums">
                        {total}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 mt-1 tracking-wide">
                        Active Plantings
                    </span>
                    {showDominant && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 max-w-[120px] truncate text-center">
                            {growthStageLegendLabel(dominant.stage)}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-1 pb-0.5">
                {chartData.map((entry) => {
                    const count = Number(entry.count || 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                        <span
                            key={entry.stage}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-slate-300"
                        >
                            <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: growthStageFill(entry.stage) }}
                            />
                            {growthStageLegendLabel(entry.stage)} · {count} ({pct}%)
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const Analytics = () => {
    const { isDark } = useTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const gridStroke = isDark ? '#334155' : '#e2e8f0';
    const tickFill = isDark ? '#cbd5e1' : '#9ca3af';
    const tickStyle = { fill: tickFill, fontSize: 10.5 };
    const areaDotStroke = isDark ? '#1e293b' : '#fff';

    const dateRange = pickAllowed(searchParams.get('range'), ANALYTICS_RANGES, '7d');
    const setDateRange = (range) => {
        patchSearchParams(setSearchParams, searchParams, { range });
    };
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

        const plantingParams = { limit: 100 };
        if (plantingFilters.variety_class) plantingParams.variety_class = plantingFilters.variety_class;
        if (plantingFilters.variety_id && !plantingFilters.variety_null) {
            plantingParams.variety_id = String(Number(plantingFilters.variety_id));
        }
        if (plantingFilters.variety_null) plantingParams.variety_null = '1';
        
        try {
            const promises = [];
            if (!isRetry || plantingsError) {
                promises.push(
                    getPlantings(plantingParams)
                        .then(res => { setPlantings(res.data.data || []); setPlantingsError(false); })
                        .catch(err => { console.error('Plantings fetch error:', err.message); setPlantings([]); setPlantingsError(true); })
                );
            }
            if (!isRetry || harvestsError) {
                promises.push(
                    getHarvests({ limit: 100 })
                        .then(res => { setHarvests(res.data.data || []); setHarvestsError(false); })
                        .catch(err => { console.error('Harvests fetch error:', err.message); setHarvests([]); setHarvestsError(true); })
                );
            }
            if (!isRetry || activitiesError) {
                promises.push(
                    getActivities({ limit: 100 })
                        .then(res => { setActivities(res.data.data || []); setActivitiesError(false); })
                        .catch(err => { console.error('Activities fetch error:', err.message); setActivities([]); setActivitiesError(true); })
                );
            }

            await Promise.all(promises);
        } finally {
            if (isRetry) setIsRetrying(false);
            else setLoading(false);
        }
    }, [plantingFilters, plantingsError, harvestsError, activitiesError]);

    useEffect(() => {
        fetchAllData(false);
    }, [plantingFilters]); // Only depend on filters for initial load

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
        () => harvestByPeriod(filteredHarvests, plantings, dateRange),
        [filteredHarvests, plantings, dateRange]
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
        const entries = Object.entries(counts).map(([stage, count]) => ({ stage, count }));
        return orderGrowthStages(entries);
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
        const color = isDark ? '#4ade80' : '#14532d';
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
        const color = seasonBarFill(item?.season);
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
            <ChartTooltipFrame>
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xl backdrop-blur-sm max-w-xs md:max-w-md">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">{dataPoint.month}</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 ml-3">
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
                                <div key={h.id || idx} className="text-xs flex flex-col border-b border-gray-100 dark:border-slate-800/40 last:border-0 pb-1.5 last:pb-0">
                                    <div className="flex justify-between items-start gap-3">
                                        <span className="font-semibold text-gray-900 dark:text-slate-200">
                                            {h.variety || 'Unknown Variety'}
                                        </span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                            {Number(h.yield_kg || 0).toLocaleString()} kg
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">
                                        <span>{h.field_name || 'No Field'}</span>
                                        <span>{hDate}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 italic">No detailed harvests recorded</p>
                )}
            </div>
            </ChartTooltipFrame>
        );
    };

    const activityTooltip = ({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0]?.payload;
        return (
            <ChartTooltipFrame>
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.type}</p>
                <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">{item?.count ?? 0} <span className="text-xs font-normal text-gray-500">activities</span></p>
            </div>
            </ChartTooltipFrame>
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
                        accent: isDark ? '#fbbf24' : '#d97706',
                        iconBg: isDark ? 'rgba(217, 119, 6, 0.18)' : '#fffbeb',
                        isLoading: showHarvestSkeleton
                    },
                    {
                        label: 'Average Yield per Harvest',
                        value: harvestsError ? '—' : Number(totals.avgYield || 0).toFixed(1),
                        unit: harvestsError ? 'Unavailable' : 'kg/harvest',
                        icon: TrendingUp,
                        accent: isDark ? '#4ade80' : '#16a34a',
                        iconBg: isDark ? 'rgba(22, 163, 74, 0.18)' : '#f0fdf4',
                        isLoading: showHarvestSkeleton
                    },
                    {
                        label: 'Active Plantings',
                        value: plantingsError ? '—' : formatNumber(totals.activeCount),
                        unit: plantingsError ? 'Unavailable' : 'in progress',
                        icon: Sprout,
                        accent: isDark ? '#2dd4bf' : '#0d9488',
                        iconBg: isDark ? 'rgba(13, 148, 136, 0.18)' : '#e0fef9',
                        isLoading: showPlantingSkeleton
                    },
                    {
                        label: 'High-Quality Harvest Rate',
                        value: harvestsError ? '—' : `${successRateValue}%`,
                        unit: harvestsError ? 'Unavailable' : 'grade A & B',
                        icon: Award,
                        accent: isDark ? '#60a5fa' : '#2563eb',
                        iconBg: isDark ? 'rgba(37, 99, 235, 0.18)' : '#eff6ff',
                        tooltip: 'Percentage of Harvests achieving Quality Grade A or B',
                        isLoading: showHarvestSkeleton
                    }
                ].map((card) => {
                    if (card.isLoading) return <SkeletonStatCard key={card.label} />;
                    const Icon = card.icon;
                    const isHero = card.label === 'Total Yield';
                    return (
                        <div
                            key={card.label}
                            className={`group relative text-center border rounded-2xl overflow-hidden flex flex-col items-center justify-center transition-transform hover:-translate-y-1 md:text-left md:items-start ${
                                isHero
                                    ? 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800 border-amber-200/80 dark:border-amber-800/40 shadow-md p-3 md:p-6 md:pl-7'
                                    : 'bg-white border-gray-100 shadow-sm p-2.5 md:p-5 md:pl-6'
                            }`}
                        >
                            <span
                                className={`absolute left-0 top-0 w-full md:bottom-0 md:h-full ${
                                    isHero ? 'h-[4px] md:w-[6px]' : 'h-[3px] md:w-[4px]'
                                }`}
                                style={{ backgroundColor: card.accent }}
                            />
                            <div className="flex flex-col items-center justify-center gap-1.5 md:flex-row md:items-start md:justify-between md:gap-4 md:w-full">
                                <div
                                    className={`rounded-xl border border-gray-100 ${isHero ? 'p-2 md:p-3.5' : 'p-1.5 md:p-3'}`}
                                    style={{ backgroundColor: card.iconBg }}
                                >
                                    <Icon size={isHero ? 18 : 16} className={isHero ? 'md:size-[22px]' : 'md:size-[20px]'} style={{ color: card.accent }} />
                                </div>
                                <div className="text-center md:text-right">
                                    <div className={`text-gray-900 leading-none ${isHero ? 'text-2xl font-black md:text-4xl' : 'text-base font-bold md:text-2xl'}`}>{card.value}</div>
                                    <div className={`text-gray-500 mt-0.5 ${isHero ? 'text-[10px] md:text-sm md:mt-1.5' : 'text-[9px] md:text-xs md:mt-1'}`}>{card.unit}</div>
                                </div>
                            </div>
                            <div className={`mt-1.5 font-semibold text-gray-800 leading-tight md:mt-3 ${isHero ? 'text-[10px] md:text-base' : 'text-[9px] md:text-sm'}`} title={card.tooltip}>{card.label}</div>
                        </div>
                    );
                })}
            </div>

            {/* Section 2: Harvest yield over time */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">Harvest Yield Over Time</h2>
                        <p className="text-xs text-gray-400 mt-1">{timelineSubtitleForRange(dateRange)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-3.5 rounded-sm bg-blue-500/20 dark:bg-blue-400/25 border border-blue-400/30" />
                            Wet
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-3.5 rounded-sm bg-amber-500/20 dark:bg-amber-400/25 border border-amber-400/30" />
                            Dry
                        </span>
                    </div>
                </div>

                {showHarvestSkeleton ? <SkeletonChartBars /> : harvestsError ? <ErrorChart message="Unable to load harvest data." /> : (() => {
                    const chartData = fillTimelineForRange(harvestYieldOverTime, dateRange);
                    const isPlaceholder = !chartData.some((row) => Number(row.yield_kg) > 0);
                    if (isPlaceholder) {
                        return <EmptyChart icon={Wheat} message="No harvest yield data in this range" />;
                    }

                    const { peakIdx, lowIdx } = peakAndLowIndexes(chartData);
                    const seasonBands = seasonBandsFromYieldTimeline(chartData, plantingById);
                    const wetFill = isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.07)';
                    const dryFill = isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.07)';
                    const gold = isDark ? '#fbbf24' : '#f59e0b';
                    const riceGreen = isDark ? '#166534' : '#14532d';
                    const lineColor = isDark ? '#f59e0b' : '#b45309';
                    const axisTick = {
                        fill: isDark ? '#e2e8f0' : '#4b5563',
                        fontSize: 11,
                        fontWeight: 600,
                    };
                    const calloutFill = isDark ? '#e2e8f0' : '#374151';

                    const yieldDot = (props) => {
                        const { cx, cy, index } = props;
                        if (cx == null || cy == null) return null;
                        if (index !== peakIdx && index !== lowIdx) return null;
                        const isPeak = index === peakIdx;
                        return (
                            <circle
                                cx={cx}
                                cy={cy}
                                r={5}
                                fill={isPeak ? gold : riceGreen}
                                stroke={areaDotStroke}
                                strokeWidth={1.75}
                            />
                        );
                    };

                    const yieldCallout = (props) => {
                        const { x, y, index } = props;
                        if (index !== peakIdx && index !== lowIdx) return null;
                        if (x == null || y == null) return null;
                        const isPeak = index === peakIdx;
                        const nearRight = index >= chartData.length - 2;
                        return (
                            <text
                                x={x}
                                y={y - 10}
                                textAnchor={nearRight ? 'end' : 'middle'}
                                fill={calloutFill}
                                fontSize={10}
                                fontWeight={700}
                            >
                                {chartData[index].month} · {isPeak ? 'Peak' : 'Low'}
                            </text>
                        );
                    };

                    return (
                        <div
                            className="h-[220px] relative [&_.recharts-area-area]:[mask-image:linear-gradient(to_right,black_0%,black_88%,transparent_100%)] [&_.recharts-area-area]:[-webkit-mask-image:linear-gradient(to_right,black_0%,black_88%,transparent_100%)]"
                        >
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={chartData} margin={{ top: 28, right: 16, left: 4, bottom: 4 }}>
                                    <defs>
                                        <linearGradient id="yieldHarvestGradient" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                                            <stop offset="0%" stopColor={gold} stopOpacity={isDark ? 0.38 : 0.42} />
                                            <stop offset="52%" stopColor={isDark ? '#22c55e' : '#166534'} stopOpacity={isDark ? 0.22 : 0.28} />
                                            <stop offset="100%" stopColor={riceGreen} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    {seasonBands.map((band, idx) => (
                                        <ReferenceArea
                                            key={`${band.season}-${band.x1}-${idx}`}
                                            x1={band.x1}
                                            x2={band.x2}
                                            fill={band.season === 'Wet' ? wetFill : dryFill}
                                            fillOpacity={1}
                                            ifOverflow="visible"
                                            strokeOpacity={0}
                                        />
                                    ))}
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={axisTick}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={axisTick}
                                        tickFormatter={(v) => `${v}kg`}
                                    />
                                    <Tooltip
                                        {...CHART_TOOLTIP_PROPS}
                                        content={areaTooltip}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="yield_kg"
                                        stroke={lineColor}
                                        strokeWidth={2.5}
                                        fill="url(#yieldHarvestGradient)"
                                        name="Yield"
                                        dot={yieldDot}
                                        activeDot={{ r: 6, fill: gold, stroke: areaDotStroke, strokeWidth: 1.5 }}
                                    >
                                        {(peakIdx != null && lowIdx != null) && (
                                            <LabelList dataKey="yield_kg" content={yieldCallout} />
                                        )}
                                    </Area>
                                </AreaChart>
                            </ResponsiveContainer>
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

                    {showHarvestSkeleton ? <SkeletonDonutChart /> : harvestsError ? <ErrorChart message="Unable to load harvest data." /> : harvestQualityDistribution.length === 0 ? (
                        <EmptyChart icon={Award} message="No quality distribution data in this range" />
                    ) : (
                        <HarvestQualityDonut data={harvestQualityDistribution} isDark={isDark} />
                    )}
                </section>

                {/* Activity Breakdown */}
                <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Activity Breakdown</h2>
                        <p className="text-xs text-gray-400 mt-1">Activities by type</p>
                    </div>

                    {showActivitySkeleton ? <SkeletonHorizontalBarChart /> : activitiesError ? <ErrorChart message="Unable to load activity data." /> : (() => {
                        if (activityBreakdown.length === 0) {
                            return <EmptyChart icon={Activity} message="No activity logs in this range" />;
                        }

                        const chartData = [...activityBreakdown].sort((a, b) => b.count - a.count);
                        const fills = rankFillsForValues(chartData.map((row) => row.count), isDark);
                        const labelFill = isDark ? '#e2e8f0' : '#374151';
                        const categoryTick = {
                            fill: isDark ? '#e2e8f0' : '#4b5563',
                            fontSize: 11,
                            fontWeight: 600,
                        };

                        return (
                            <div className={`h-[220px] relative ${barHoverClassName(isDark)}`}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart
                                        data={chartData}
                                        layout="vertical"
                                        margin={{ top: 8, right: 36, left: 0, bottom: 0 }}
                                    >
                                        <XAxis
                                            type="number"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={categoryTick}
                                            domain={[0, (dataMax) => activityAxisMax(dataMax)]}
                                            allowDecimals={false}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="type"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={categoryTick}
                                            width={110}
                                            reversed
                                        />
                                        <Tooltip {...CHART_TOOLTIP_PROPS} content={activityTooltip} cursor={<ActivityCursor />} />
                                        <Bar dataKey="count" radius={[0, 8, 8, 0]} maxBarSize={48} isAnimationActive={false}>
                                            {chartData.map((entry, idx) => (
                                                <Cell key={entry.type} fill={fills[idx]} />
                                            ))}
                                            <LabelList
                                                dataKey="count"
                                                position="right"
                                                fill={labelFill}
                                                fontSize={11}
                                                fontWeight={700}
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
                            return <EmptyChart icon={Wheat} message="No variety yield found in this range" />;
                        }

                        const chartData = [...varietyPerformance].sort(
                            (a, b) => Number(b.yield_kg || 0) - Number(a.yield_kg || 0)
                        );
                        const fills = rankFillsForValues(chartData.map((row) => row.yield_kg), isDark);
                        const axisTick = {
                            fill: isDark ? '#e2e8f0' : '#4b5563',
                            fontSize: 11,
                            fontWeight: 600,
                        };

                        return (
                            <div className={`h-[220px] relative ${barHoverClassName(isDark)}`}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <XAxis dataKey="variety" axisLine={false} tickLine={false} tick={axisTick} interval={0} />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={axisTick}
                                            tickFormatter={(v) => `${v.toLocaleString()}`}
                                            domain={[0, (dataMax) => niceAxisMax(dataMax)]}
                                        />
                                        <Tooltip
                                            {...CHART_TOOLTIP_PROPS}
                                            cursor={{ fill: isDark ? '#4ade80' : '#14532d', fillOpacity: 0.06, rx: 6 }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const item = payload[0]?.payload;
                                                return (
                                                    <ChartTooltipFrame>
                                                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                                        <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.variety}</p>
                                                        <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                            {Number(item?.yield_kg || 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">kg</span>
                                                        </p>
                                                    </div>
                                                    </ChartTooltipFrame>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="yield_kg" radius={[8, 8, 0, 0]} maxBarSize={60} isAnimationActive={false}>
                                            {chartData.map((entry, idx) => (
                                                <Cell key={entry.variety} fill={fills[idx]} />
                                            ))}
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
                        <EmptyChart icon={Sprout} message="No active plantings" />
                    ) : (
                        <GrowthStagesDonut data={growthStageDistribution} isDark={isDark} />
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
                            return <EmptyChart icon={Wheat} message="No season yield data found" />;
                        }

                        // Ensure both Wet and Dry seasons always appear in the chart
                        const wetRecord = seasonComparison.find(s => String(s.season).toLowerCase().includes('wet')) || { season: 'Wet', yield_kg: 0 };
                        const dryRecord = seasonComparison.find(s => String(s.season).toLowerCase().includes('dry')) || { season: 'Dry', yield_kg: 0 };

                        const chartData = [wetRecord, dryRecord];
                        const axisTick = {
                            fill: isDark ? '#e2e8f0' : '#4b5563',
                            fontSize: 11,
                            fontWeight: 600,
                        };

                        return (
                            <div className={`h-[220px] relative ${barHoverClassName(isDark)}`}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <XAxis dataKey="season" axisLine={false} tickLine={false} tick={axisTick} />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={axisTick}
                                            tickFormatter={(v) => `${v.toLocaleString()}`}
                                            domain={[0, (dataMax) => niceAxisMax(dataMax)]}
                                        />
                                        <Tooltip
                                            {...CHART_TOOLTIP_PROPS}
                                            cursor={<SeasonCursor />}
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const item = payload[0]?.payload;
                                                return (
                                                    <ChartTooltipFrame>
                                                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl px-4 py-2.5 text-sm">
                                                        <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{item?.season} Season</p>
                                                        <p className="font-bold text-gray-900 dark:text-slate-100 mt-0.5">
                                                            {Number(item?.yield_kg || 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">kg</span>
                                                        </p>
                                                    </div>
                                                    </ChartTooltipFrame>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="yield_kg" radius={[8, 8, 0, 0]} maxBarSize={60} shape={SeasonZeroAwareBar} isAnimationActive={false}>
                                            {chartData.map((entry) => (
                                                <Cell key={entry.season} fill={seasonBarFill(entry.season)} />
                                            ))}
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
                                            <FieldStatusBadge status={row.status} />
                                        </div>
                                    </div>
                                    <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3 space-y-2.5 text-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Plantings</span>
                                            <span className="font-medium text-slate-600 dark:text-slate-300 text-right tabular-nums">{row.plantingsCount}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Harvests</span>
                                            <span className="font-medium text-slate-600 dark:text-slate-300 text-right tabular-nums">{row.harvestCount}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Total Yield</span>
                                            <span className="font-medium text-slate-600 dark:text-slate-300 text-right tabular-nums">
                                                <FieldYieldDisplay harvestCount={row.harvestCount} value={row.totalYield} />
                                            </span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Avg Yield</span>
                                            <span className="font-medium text-slate-600 dark:text-slate-300 text-right tabular-nums">
                                                <FieldYieldDisplay harvestCount={row.harvestCount} value={row.avgYield} fractionDigits={1} />
                                            </span>
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Top Variety</span>
                                            <span className="font-medium text-slate-600 dark:text-slate-300 text-right">{formatVariant(row.topVariety)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop / tablet table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-white dark:bg-slate-800">
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
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{row.plantingsCount}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{row.harvestCount}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                                                <FieldYieldDisplay harvestCount={row.harvestCount} value={row.totalYield} />
                                            </td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                                                <FieldYieldDisplay harvestCount={row.harvestCount} value={row.avgYield} fractionDigits={1} />
                                            </td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatVariant(row.topVariety)}</td>
                                            <td className="px-5 py-3">
                                                <FieldStatusBadge status={row.status} />
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

