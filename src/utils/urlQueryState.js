/**
 * Shared helpers for filter/tab state in the URL (replace, not push).
 * Scroll position is NOT stored here — that lives in Layout sessionStorage.
 */

export function patchSearchParams(setSearchParams, searchParams, patch) {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
            if (next.has(key)) {
                next.delete(key);
                changed = true;
            }
            return;
        }
        const str = String(value);
        if (next.get(key) !== str) {
            next.set(key, str);
            changed = true;
        }
    });

    if (changed) {
        setSearchParams(next, { replace: true });
    }
}

export function pickAllowed(raw, allowed, fallback) {
    return allowed.includes(raw) ? raw : fallback;
}

export function parsePositiveInt(raw, fallback) {
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}
