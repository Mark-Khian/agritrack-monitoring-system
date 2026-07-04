import React from 'react';

/**
 * SkeletonBox — base animated block
 * Props: width, height, rounded, className
 */
export const SkeletonBox = ({ width = '100%', height = '1rem', rounded = 'rounded', className = '' }) => (
    <div
        className={`bg-gray-200 animate-pulse ${rounded} ${className}`}
        style={{ width, height }}
    />
);

/**
 * SkeletonText — single line of text
 * Props: width (default '100%'), size ('sm'|'md'|'lg')
 */
export const SkeletonText = ({ width = '100%', size = 'md' }) => {
    const heightMap = { sm: 'h-3', md: 'h-4', lg: 'h-5' };
    return <div className={`bg-gray-200 animate-pulse rounded ${heightMap[size]}`} style={{ width }} />;
};

/**
 * SkeletonAvatar — circle avatar placeholder
 * Props: size (default 40px)
 */
export const SkeletonAvatar = ({ size = 40 }) => (
    <div
        className="bg-gray-200 animate-pulse rounded-full"
        style={{ width: size, height: size }}
    />
);

/**
 * SkeletonCard — white card with inner skeleton rows
 * Props: lines (number of text lines inside)
 */
export const SkeletonCard = ({ lines = 3 }) => (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4 space-y-3">
        <SkeletonText width="80%" size="md" />
        <div className="space-y-2">
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonText key={i} width={i === lines - 1 ? '60%' : '100%'} size="sm" />
            ))}
        </div>
    </div>
);

/**
 * SkeletonTable — full table skeleton with header
 * Props: rows (default 5), cols (default 4), columnHeaders (array of header text)
 */
export const SkeletonTable = ({ rows = 5, cols = 4, columnHeaders = [] }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
            <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    {Array.from({ length: cols }).map((_, i) => (
                        <th key={i} className="px-6 py-3 text-left">
                            {columnHeaders[i] || `Column ${i + 1}`}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {Array.from({ length: rows }).map((_, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
                        {Array.from({ length: cols }).map((_, colIdx) => (
                            <td key={colIdx} className="px-6 py-4">
                                <div className="h-4 bg-gray-200 animate-pulse rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

/**
 * SkeletonStatCard — mimics KPI summary card shape
 * Includes icon box, large number, and label
 */
export const SkeletonStatCard = () => (
    <div className="relative bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4 overflow-hidden">
        <span className="absolute left-0 top-0 h-full w-1 bg-gray-200 rounded-l-2xl animate-pulse" />
        <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="space-y-2">
                <div className="h-7 w-16 bg-gray-200 animate-pulse rounded" />
                <div className="h-3 w-24 bg-gray-200 animate-pulse rounded" />
            </div>
        </div>
    </div>
);

/**
 * SkeletonProgressBar — for progress tracking cards
 */
export const SkeletonProgressBar = ({ width = '30%' }) => (
    <div className="h-2 bg-gray-200 animate-pulse rounded-full" style={{ width }} />
);

/**
 * SkeletonDashboardPlotCard — represents a plot in grid
 */
export const SkeletonDashboardPlotCard = () => (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
        <SkeletonText width="70%" size="md" />
        <div className="flex gap-2">
            <div className="h-6 w-20 bg-gray-200 animate-pulse rounded-full" />
            <div className="h-6 w-20 bg-gray-200 animate-pulse rounded-full" />
        </div>
        <SkeletonProgressBar width="50%" />
    </div>
);

/**
 * SkeletonTaskRow — for task items in dashboard
 */
export const SkeletonTaskRow = () => (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0">
        <div className="h-8 w-8 bg-gray-200 animate-pulse rounded" />
        <div className="flex-1 space-y-2">
            <SkeletonText width="75%" size="sm" />
            <SkeletonText width="50%" size="sm" />
        </div>
        <div className="h-6 w-16 bg-gray-200 animate-pulse rounded-full" />
    </div>
);

export const SkeletonChartBars = ({ count = 12, height = '200px' }) => (
    <div style={{ height }} className="flex items-flex-end justify-around gap-2 p-4">
        {Array.from({ length: count }).map((_, i) => {
            const barHeight = `${30 + ((i * 17) % 60)}%`;
            return (
                <div key={i} className="w-2 bg-gray-300 animate-pulse rounded" style={{ height: barHeight }} />
            );
        })}
    </div>
);

/**
 * SkeletonDonutChart — circle outline with legend
 */
export const SkeletonDonutChart = () => (
    <div className="flex flex-col items-center gap-4">
        <div className="h-40 w-40 bg-gray-200 animate-pulse rounded-full" />
        <div className="space-y-2 w-full">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-gray-200 animate-pulse" />
                    <SkeletonText width="60%" size="sm" />
                </div>
            ))}
        </div>
    </div>
);

/**
 * SkeletonHorizontalBarChart — for horizontal bar charts
 */
export const SkeletonHorizontalBarChart = ({ rows = 6 }) => (
    <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-1">
                <SkeletonText width="40%" size="sm" />
                <div className="h-2 bg-gray-300 animate-pulse rounded-full" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
            </div>
        ))}
    </div>
);

/**
 * SkeletonWeatherCard — dark bg skeleton for weather widget
 */
export const SkeletonWeatherCard = () => (
    <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-6 space-y-4">
        <div className="h-6 w-32 bg-gray-700 animate-pulse rounded" />
        <div className="h-16 w-16 bg-gray-700 animate-pulse rounded-full" />
        <div className="space-y-2">
            <SkeletonText width="80%" size="md" />
            <SkeletonText width="60%" size="sm" />
        </div>
    </div>
);

/**
 * SkeletonAlertRow — for alert items in sidebar
 */
export const SkeletonAlertRow = () => (
    <div className="flex gap-2 py-2">
        <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1">
            <SkeletonText width="70%" size="sm" />
            <SkeletonText width="50%" size="sm" />
        </div>
    </div>
);

/**
 * SkeletonPageHeader — for page title + buttons
 */
export const SkeletonPageHeader = () => (
    <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
            <SkeletonText width="48" size="lg" />
            <SkeletonText width="72" size="sm" />
        </div>
        <div className="flex gap-2">
            <div className="h-9 w-32 bg-gray-200 animate-pulse rounded-lg" />
        </div>
    </div>
);
