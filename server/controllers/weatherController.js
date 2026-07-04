/**
 * weatherController.js
 * Backend proxy for OpenWeatherMap — fetches by farm.location (city name).
 * Server-side cache: 30 minutes per location.
 */

const https = require('https');

const API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_LOCATION = (process.env.DEFAULT_WEATHER_LOCATION || 'Cabanatuan').trim();

// In-memory cache: { [locationKey]: { data, cachedAt } }
const weatherCache = new Map();

/**
 * Generic HTTPS GET returning parsed JSON.
 */
const httpsGet = (url) =>
    new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Invalid JSON from weather API')); }
            });
        }).on('error', reject);
    });

/**
 * GET /api/v1/weather?location=<city name>
 * Returns: { current, forecast, rainExpected, cachedAt }
 */
const getWeather = async (req, res) => {
    if (!API_KEY) {
        return res.status(503).json({
            message: 'Weather service not configured. Add OPENWEATHER_API_KEY to server/.env'
        });
    }

    const requestedLocation = (req.query.location || '').trim();
    const location = requestedLocation;
    if (!location) {
        return res.status(400).json({ message: 'location query param is required.' });
    }

    const cacheKey = location.toLowerCase();
    const cached   = weatherCache.get(cacheKey);

    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return res.status(200).json({ ...cached.data, fromCache: true });
    }

    try {
        // Step 1 — Geocode city name to lat/lon
        const geocode = async (q) => {
            const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${API_KEY}`;
            const geoData = await httpsGet(geoUrl);
            if (!geoData || geoData.length === 0) return null;
            const { lat, lon, name, country } = geoData[0];
            return { lat, lon, name, country };
        };

        let resolved = await geocode(location);
        let usedFallback = false;
        if (!resolved) {
            if (DEFAULT_LOCATION && DEFAULT_LOCATION.toLowerCase() !== location.toLowerCase()) {
                resolved = await geocode(DEFAULT_LOCATION);
                usedFallback = !!resolved;
            }
        }
        if (!resolved) {
            return res.status(404).json({
                message: `Location "${requestedLocation}" not found.`,
                requestedLocation,
                fallbackTried: DEFAULT_LOCATION || null,
            });
        }

        const { lat, lon, name, country } = resolved;

        // Step 2 — Parallel: current weather + 5-day forecast + UV index
        const currentUrl  = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`;
        const uviUrl      = `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${API_KEY}`;

        const [current, forecastRes, uviRes] = await Promise.all([
            httpsGet(currentUrl),
            httpsGet(forecastUrl),
            httpsGet(uviUrl).catch(() => null), // UV is non-critical
        ]);

        // Determine if rain is expected in next 6 forecast slots (~18 hours)
        const next6 = (forecastRes.list || []).slice(0, 6);
        const rainExpected = next6.some(f => f.weather[0]?.id >= 500 && f.weather[0]?.id < 600);

        const payload = {
            requestedLocation,
            usedFallback,
            location: { name, country, lat, lon },
            current,
            forecast: forecastRes.list || [],
            uvIndex: uviRes?.value ?? null,
            rainExpected,
            cachedAt: Date.now(),
        };

        weatherCache.set(cacheKey, { data: payload, cachedAt: Date.now() });

        return res.status(200).json({ ...payload, fromCache: false });
    } catch (err) {
        console.error('Weather proxy error:', err.message);
        res.status(502).json({ message: 'Failed to fetch weather data.' });
    }
};

module.exports = { getWeather };
