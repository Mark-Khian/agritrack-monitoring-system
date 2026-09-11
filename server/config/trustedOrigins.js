const DEFAULT_DEVELOPMENT_ORIGIN = 'http://localhost:5173';
const MISSING_PRODUCTION_ORIGINS =
    'Trusted origins are not configured. Set ALLOWED_ORIGINS (or legacy ALLOWED_ORIGIN) to one or more exact http(s) frontend origins. Production does not fall back to localhost.';

const originOf = (value) => {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('*')) return null;

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        const origin = parsed.origin;
        if (!origin || origin === 'null' || origin.includes('*')) return null;
        return origin;
    } catch {
        return null;
    }
};

const parseOriginList = (raw) => {
    if (typeof raw !== 'string' || raw.trim() === '') return [];
    const origins = raw
        .split(',')
        .map((entry) => originOf(entry))
        .filter(Boolean);
    return [...new Set(origins)];
};

const getTrustedOrigins = () => {
    const fromList = parseOriginList(process.env.ALLOWED_ORIGINS);
    if (fromList.length > 0) return fromList;

    const fromLegacy = originOf(process.env.ALLOWED_ORIGIN);
    if (fromLegacy) return [fromLegacy];

    if (process.env.NODE_ENV === 'production') {
        throw new Error(MISSING_PRODUCTION_ORIGINS);
    }

    return [DEFAULT_DEVELOPMENT_ORIGIN];
};

const isTrustedOrigin = (value) => {
    const origin = originOf(value);
    return Boolean(origin && getTrustedOrigins().includes(origin));
};

module.exports = {
    originOf,
    parseOriginList,
    getTrustedOrigins,
    isTrustedOrigin,
};
