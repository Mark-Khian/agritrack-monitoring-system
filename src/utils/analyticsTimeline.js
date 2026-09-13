/**
 * Analytics harvest timeline helpers — period-aware chart domains.
 * KPIs and chart must share the same range semantics as filterByDateRange.
 */

const pad2 = (n) => String(n).padStart(2, '0');

export const toLocalYmd = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const formatDayLabel = (date) =>
    date.toLocaleString('default', { month: 'short', day: 'numeric' });

export const formatMonthLabel = (date) =>
    date.toLocaleString('default', { month: 'short', year: '2-digit' });

/**
 * Same window as Analytics filterByDateRange.
 * @returns {{ start: Date|null, end: Date, bucket: 'day'|'month' }}
 */
export const getAnalyticsRangeBounds = (range, now = new Date()) => {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    if (range === 'all') {
        return { start: null, end, bucket: 'month' };
    }

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (range === '7d') start.setDate(start.getDate() - 7);
    else if (range === '30d') start.setDate(start.getDate() - 30);
    else if (range === '3m') start.setMonth(start.getMonth() - 3);

    const bucket = range === '7d' || range === '30d' ? 'day' : 'month';
    return { start, end, bucket };
};

const bucketKeyForDate = (date, bucket) => {
    if (bucket === 'day') return toLocalYmd(date);
    return formatMonthLabel(date);
};

const labelForKey = (key, bucket) => {
    if (bucket === 'day') {
        const [y, m, d] = key.split('-').map(Number);
        return formatDayLabel(new Date(y, m - 1, d));
    }
    return key;
};

/**
 * Aggregate filtered harvests into day or month buckets.
 */
export const harvestByPeriod = (items, plantings, range, now = new Date()) => {
    const { bucket } = getAnalyticsRangeBounds(range, now);
    const plantingById = new Map((plantings || []).map((p) => [p.id, p]));
    const buckets = {};

    (items || []).forEach((h) => {
        const d = h?.harvest_date ? new Date(h.harvest_date) : null;
        if (!d || Number.isNaN(d.getTime())) return;
        const key = bucketKeyForDate(d, bucket);
        if (!buckets[key]) {
            buckets[key] = { yield_kg: 0, harvestsList: [], _dt: d };
        }
        buckets[key].yield_kg += Number(h.yield_kg || 0);
        const p = plantingById.get(h?.planting_id);
        buckets[key].harvestsList.push({
            ...h,
            variety: p?.variety || p?.rice_variety || p?.variety_name || 'Unknown Variety',
            field_name: p?.field_name || 'No Field',
        });
    });

    return Object.entries(buckets)
        .map(([key, data]) => ({
            month: labelForKey(key, bucket),
            key,
            yield_kg: Number(data.yield_kg.toFixed(0)),
            harvestsList: data.harvestsList,
            _dt: data._dt,
        }))
        .sort((a, b) => a._dt - b._dt)
        .map(({ month, key, yield_kg, harvestsList }) => ({ month, key, yield_kg, harvestsList }));
};

const buildDayPlaceholders = (start, end) => {
    const data = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cursor <= last) {
        const key = toLocalYmd(cursor);
        data.push({
            month: formatDayLabel(cursor),
            key,
            yield_kg: 0,
            harvestsList: [],
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return data;
};

const buildMonthPlaceholders = (start, end) => {
    const data = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
        const key = formatMonthLabel(cursor);
        data.push({
            month: key,
            key,
            yield_kg: 0,
            harvestsList: [],
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return data;
};

/**
 * Fill chart domain for the selected range. No fake months outside the window.
 */
export const fillTimelineForRange = (aggregated, range, now = new Date()) => {
    const { start, end, bucket } = getAnalyticsRangeBounds(range, now);
    let timeline;

    if (bucket === 'day') {
        timeline = buildDayPlaceholders(start, end);
    } else if (range === 'all') {
        // Prefer observed span; fall back to last 6 months only when empty.
        if (!aggregated || aggregated.length === 0) {
            const fallbackStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            timeline = buildMonthPlaceholders(fallbackStart, end);
        } else {
            const parseMonthKey = (k) => {
                if (/^\d{4}-\d{2}/.test(String(k))) {
                    const [y, m] = String(k).split('-').map(Number);
                    return new Date(y, m - 1, 1);
                }
                const [mon, yr] = String(k).split(' ');
                return new Date(`${mon} 1, 20${yr}`);
            };
            const dts = aggregated
                .map((a) => parseMonthKey(a.key || a.month))
                .filter((d) => !Number.isNaN(d.getTime()));
            const min = new Date(Math.min(...dts.map((d) => d.getTime())));
            const max = new Date(Math.max(...dts.map((d) => d.getTime()), end.getTime()));
            timeline = buildMonthPlaceholders(min, max);
        }
    } else {
        // 3m
        timeline = buildMonthPlaceholders(start, end);
    }

    const yieldMap = {};
    (aggregated || []).forEach((item) => {
        const mapKey = item.key || item.month;
        yieldMap[mapKey] = {
            yield_kg: item.yield_kg,
            harvestsList: item.harvestsList || [],
        };
        // Also map by display label for legacy month keys
        yieldMap[item.month] = yieldMap[mapKey];
    });

    return timeline.map((slot) => {
        const hit = yieldMap[slot.key] || yieldMap[slot.month];
        if (!hit) return slot;
        return {
            ...slot,
            yield_kg: hit.yield_kg,
            harvestsList: hit.harvestsList,
        };
    });
};

export const timelineSubtitleForRange = (range) => {
    if (range === '7d' || range === '30d') return 'Daily yield in kilograms';
    return 'Monthly yield in kilograms';
};
