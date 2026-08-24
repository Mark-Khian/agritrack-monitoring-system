/**
 * weatherController.js
 * Backend proxy for OpenWeatherMap — fetches by farm.location (city name).
 * Server-side cache: 30 minutes per location.
 */

const https = require('https');
const db = require('../config/db'); // Import DB connection

const API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

    try {
        // Fetch farm location from users table (single admin)
        const [users] = await db.query(`SELECT farm_latitude, farm_longitude, farm_location_name FROM users WHERE role = 'admin' LIMIT 1`);
        if (users.length === 0) {
            return res.status(500).json({ message: 'Admin user not found.' });
        }

        const admin = users[0];
        if (admin.farm_latitude == null || admin.farm_longitude == null) {
            return res.status(400).json({
                message: 'Farm weather location has not been configured.',
                farmNotConfigured: true
            });
        }

        const lat = parseFloat(admin.farm_latitude);
        const lon = parseFloat(admin.farm_longitude);
        const name = admin.farm_location_name || 'Farm Location';
        const country = '';

        // Deterministic cache key based on coordinates
        const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        const cached = weatherCache.get(cacheKey);

        if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
            return res.status(200).json({ ...cached.data, fromCache: true });
        }

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
            requestedLocation: name,
            usedFallback: false,
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
