import { useEffect, useState, useCallback } from 'react';
import {
    Wind, Droplets, Thermometer, CloudRain, MapPin, Sunset, Sun,
    Clock, CalendarDays, CloudSun, CloudLightning, CloudDrizzle,
    CloudSnow, CloudFog, Moon, Sunrise, RefreshCw
} from 'lucide-react';

import { getWeather } from '../services/api';


let weatherCache = {
    weather: null,
    forecast: null,
    dailyForecast: null,
    uvIndex: null,
    lastFetched: null,
};

const CACHE_DURATION = 15 * 60 * 1000;

/**
 * Returns a context-aware weather icon based on the OWM condition code AND
 * the current hour (0-23).  Priority order:
 *   1. Thunder / drizzle / rain / snow / fog  → always shows precipitation icon
 *   2. Night   (19:00 – 05:59)                → Moon
 *   3. Dawn    (06:00 – 08:59)                → Sunrise
 *   4. Dusk    (17:00 – 18:59)                → Sunset
 *   5. Daytime clear sky (code 800)           → Sun
 *   6. Daytime partly cloudy (code > 800)     → CloudSun
 */
const getWeatherIcon = (code, size = 28, hour = new Date().getHours()) => {
    // ── Precipitation & atmospheric — always highest priority ────────────
    if (code >= 200 && code < 300) return <CloudLightning size={size} />;
    if (code >= 300 && code < 400) return <CloudDrizzle size={size} />;
    if (code >= 500 && code < 600) return <CloudRain size={size} />;
    if (code >= 600 && code < 700) return <CloudSnow size={size} />;
    if (code >= 700 && code < 800) return <CloudFog size={size} />;

    // ── Clear / cloudy — time-of-day aware ───────────────────────────────
    const isNight = hour >= 19 || hour < 6;          // 7 PM – 5:59 AM
    const isDawn  = hour >= 6  && hour < 9;           // 6 AM – 8:59 AM
    const isDusk  = hour >= 17 && hour < 19;          // 5 PM – 6:59 PM

    if (isNight) return <Moon size={size} />;         // night   → moon
    if (isDawn)  return <Sunrise size={size} />;      // dawn    → sunrise
    if (isDusk)  return <Sunset size={size} />;       // dusk    → sunset

    // Daytime
    if (code === 800) return <Sun size={size} />;     // clear sky
    if (code > 800)   return <CloudSun size={size} />; // partly cloudy
    return <CloudSun size={size} />;
};

const getWeatherBg = (code, hour) => {
    const isNight = hour >= 19 || hour < 6;
    if (isNight) return 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)';
    if (code >= 200 && code < 300) return 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';
    if (code >= 300 && code < 400) return 'linear-gradient(135deg, #2c3e50 0%, #3d5a6e 50%, #4a708b 100%)';
    if (code >= 500 && code < 600) return 'linear-gradient(135deg, #1f2937 0%, #374151 50%, #4b5563 100%)';
    if (code >= 600 && code < 700) return 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 50%, #e2e8f0 100%)';
    if (code >= 700 && code < 800) return 'linear-gradient(135deg, #4b5563 0%, #6b7280 50%, #9ca3af 100%)';
    if (code === 800) return 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 50%, #38bdf8 100%)';
    if (code === 801 || code === 802) return 'linear-gradient(135deg, #0f4c2a 0%, #1a7a46 50%, #22a05a 100%)';
    if (code === 803 || code === 804) return 'linear-gradient(135deg, #374151 0%, #4b5563 50%, #6b7280 100%)';
    return 'linear-gradient(135deg, #0f4c2a 0%, #1a7a46 50%, #22a05a 100%)';
};

const getWeatherBgImage = (code, hour) => {
    const isNight = hour >= 19 || hour < 6;
    
    // Night skies (100% pure sky/stars, no buildings/ground/trees)
    if (isNight) {
        // Rain/Thunderstorm/Drizzle at night (pure stormy dark night sky)
        if (code >= 200 && code < 600) {
            return 'https://images.unsplash.com/photo-1485594050903-8e8ee7b071a8?q=80&w=600&auto=format&fit=crop';
        }
        // Snow at night (falling snow on pure dark sky)
        if (code >= 600 && code < 700) {
            return 'https://images.unsplash.com/photo-1418985991508-e47386d96a71?q=80&w=600&auto=format&fit=crop';
        }
        // Fog/Mist at night (pure foggy night texture)
        if (code >= 700 && code < 800) {
            return 'https://images.unsplash.com/photo-1585506942812-e72b29cef712?q=80&w=600&auto=format&fit=crop';
        }
        // Clouds at night (pure dark night clouds)
        if (code > 800) {
            return 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?q=80&w=600&auto=format&fit=crop';
        }
        // Clear night (pure starry sky, no trees)
        return 'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?q=80&w=600&auto=format&fit=crop';
    }

    // Day skies (100% pure sky/clouds, no buildings/ground/trees)
    // Rain/Thunderstorm/Drizzle (pure grey rainy sky/clouds)
    if (code >= 200 && code < 600) {
        return 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=600&auto=format&fit=crop';
    }
    // Snow (falling snow on pure winter sky)
    if (code >= 600 && code < 700) {
        return 'https://images.unsplash.com/photo-1418985991508-e47386d96a71?q=80&w=600&auto=format&fit=crop';
    }
    // Fog/Mist/Atmospheric (pure fog/mist)
    if (code >= 700 && code < 800) {
        return 'https://images.unsplash.com/photo-1585506942812-e72b29cef712?q=80&w=600&auto=format&fit=crop';
    }
    // Clear Day (pure blue sky and sun)
    if (code === 800) {
        return 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?q=80&w=600&auto=format&fit=crop';
    }
    // Cloudy Day (pure clouds looking up, no ground/trees)
    return 'https://images.unsplash.com/photo-1517999144091-3d9dca6d1e43?q=80&w=600&auto=format&fit=crop';
};

const getTextColor = (code, hour) => {
    const isNight = hour >= 19 || hour < 6;
    if (!isNight && code >= 600 && code < 700) return '#1e293b';
    return '#ffffff';
};

const formatHour = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const h = date.getHours();
    if (h === 0) return '12AM';
    if (h === 12) return '12PM';
    return h > 12 ? `${h - 12}PM` : `${h}AM`;
};

const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-PH', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });
};

const getDayLabel = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getUVLabel = (uvi) => {
    if (uvi <= 2) return 'Low';
    if (uvi <= 5) return 'Moderate';
    if (uvi <= 7) return 'High';
    if (uvi <= 10) return 'Very High';
    return 'Extreme';
};

const groupForecastByDay = (list) => {
    const days = {};
    list.forEach(item => {
        const day = new Date(item.dt * 1000).toDateString();
        if (!days[day]) days[day] = [];
        days[day].push(item);
    });
    return Object.values(days).map(dayItems => {
        const temps = dayItems.map(d => d.main.temp);
        const maxPop = Math.max(...dayItems.map(d => d.pop || 0));
        const totalRain = dayItems.reduce((sum, d) => sum + (d.rain?.['3h'] || 0), 0);
        const midItem = dayItems[Math.floor(dayItems.length / 2)];
        return {
            dt: midItem.dt,
            tempMax: Math.round(Math.max(...temps)),
            tempMin: Math.round(Math.min(...temps)),
            icon: midItem.weather[0].id,
            pop: Math.round(maxPop * 100),
            rain: totalRain.toFixed(1),
            description: midItem.weather[0].description,
        };
    }).slice(0, 5);
};

const hoverStyle = {
    background: 'rgba(255,255,255,0.22)',
    transform: 'translateY(-3px)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
};

/**
 * WeatherWidget
 * @param {string|null} location  - Farm location string (e.g. "Nueva Ecija").
 *   If provided, fetches weather via backend proxy (cached 30 min).
 *   If null/undefined, falls back to direct OpenWeatherMap call with default lat/lon.
 */
const WeatherWidget = ({ location = null, variant = 'default', rainExpected = null }) => {
    const [weather, setWeather] = useState(weatherCache.weather);
    const [forecast, setForecast] = useState(weatherCache.forecast || []);
    const [dailyForecast, setDailyForecast] = useState(weatherCache.dailyForecast || []);
    const [uvIndex, setUvIndex] = useState(weatherCache.uvIndex);
    const [loading, setLoading] = useState(!weatherCache.weather);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(
        weatherCache.lastFetched
            ? new Date(weatherCache.lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null
    );
    const [now, setNow] = useState(new Date());
    const [activeTab, setActiveTab] = useState('hourly');
    const [hoveredPill, setHoveredPill] = useState(null);
    const [hoveredHour, setHoveredHour] = useState(null);
    const [hoveredDay, setHoveredDay] = useState(null);
    const [hoveredTab, setHoveredTab] = useState(null);

    useEffect(() => {
        const clock = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(clock);
    }, []);

    const fetchWeather = useCallback(async (force = false) => {
        const isCacheFresh = weatherCache.lastFetched &&
            (Date.now() - weatherCache.lastFetched < CACHE_DURATION);
        if (isCacheFresh && !force) return;

        setLoading(true);
        setError(null);
        try {
            let current, forecastList, uviValue, daily;

            if (location) {
                // ── Backend proxy route (farm location) ──────────────────────
                const res = await getWeather(location);
                const data = res.data;
                current      = data.current;
                forecastList = data.forecast || [];
                uviValue     = data.uvIndex ?? null;
                daily        = groupForecastByDay(forecastList);
                forecastList = forecastList.slice(0, 6);
            } else {
                throw new Error('No location provided for weather widget.');
            }

            weatherCache = {
                weather: current,
                forecast: forecastList,
                dailyForecast: daily,
                uvIndex: uviValue,
                lastFetched: Date.now(),
            };

            setWeather(current);
            setForecast(forecastList);
            setDailyForecast(daily);
            setUvIndex(uviValue);
            setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch {
            setError('Unable to load weather data.');
        } finally {
            setLoading(false);
        }
    }, [location]);

    useEffect(() => {
        fetchWeather();
        const interval = setInterval(() => fetchWeather(true), CACHE_DURATION);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchWeather();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchWeather]); // re-fetch if farm location changes

    const formattedTime = now.toLocaleTimeString('en-PH', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const formattedDate = now.toLocaleDateString('en-PH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const rainChance = forecast.length > 0
        ? Math.round((forecast.filter(f => f.weather[0].id >= 500 && f.weather[0].id < 600).length / forecast.length) * 100)
        : 0;

    const precipitation = forecast.reduce((sum, f) => sum + (f.rain?.['3h'] || 0), 0).toFixed(1);
    const sunsetTime = weather ? formatTime(weather.sys.sunset) : '--';

    const baseCardStyle = {
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '12px',
        padding: '0.6rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '72px',
        cursor: 'pointer',
        transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
    };

    if (loading) return (
        <div style={{
            borderRadius: '20px', padding: '1.5rem 1.75rem',
            background: 'linear-gradient(135deg, #0b0f19 0%, #1e293b 100%)',
            minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Loading weather...</p>
        </div>
    );

    if (error) return (
        <div style={{
            borderRadius: '20px', padding: '1.5rem',
            background: 'linear-gradient(135deg, #0b0f19 0%, #1e293b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{error}</p>
            <button onClick={() => fetchWeather(true)} style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
            }}>Retry</button>
        </div>
    );

    const code = weather.weather[0].id;
    const hour = now.getHours();
    const bg = getWeatherBg(code, hour);
    const bgImage = getWeatherBgImage(code, hour);
    const textColor = getTextColor(code, hour);

    // Dashboard decision-support card — 3-level visual hierarchy.
    if (variant === 'dashboard') {
        const tempC       = weather?.main?.temp       ? Math.round(weather.main.temp)       : '--';
        const feelsLike   = weather?.main?.feels_like ? Math.round(weather.main.feels_like) : null;
        const description = weather?.weather?.[0]?.description || '';
        const humidity    = weather?.main?.humidity   ?? '--';
        const windKmh     = weather?.wind?.speed      != null ? Math.round(weather.wind.speed * 3.6) : null;
        const rainProb    = rainChance ?? 0;
        const locationLabel = location || weather?.name || 'Farm Location';

        // ── Smart recommendation — highest-priority condition wins ────────────
        const rainIsHigh = typeof rainExpected === 'boolean' ? rainExpected : rainProb > 60;
        const heatHigh   = typeof tempC === 'number' && tempC > 34;
        const humidHigh  = typeof humidity === 'number' && humidity > 80;
        const windHigh   = windKmh != null && windKmh > 25;
        const isClear    = (code === 800 || code === 801 || code === 802) && !rainIsHigh;

        let rec, recAccent;
        if (rainIsHigh) {
            rec = 'Possible rainfall — postpone irrigation and prepare drainage channels.';
            recAccent = 'text-blue-200';
        } else if (heatHigh) {
            rec = 'High heat detected — irrigate early morning or late afternoon to reduce crop stress.';
            recAccent = 'text-orange-200';
        } else if (humidHigh) {
            rec = 'High humidity — monitor crops closely for fungal disease and leaf blight risk.';
            recAccent = 'text-yellow-200';
        } else if (windHigh) {
            rec = 'Strong winds expected — secure lightweight materials and delay aerial spraying.';
            recAccent = 'text-purple-200';
        } else if (isClear) {
            rec = 'Good conditions — proceed with scheduled field activities and soil preparation.';
            recAccent = 'text-emerald-200';
        } else {
            rec = 'Stable conditions — proceed with routine field work and monitor for changes.';
            recAccent = 'text-emerald-200';
        }

        return (
            <div 
                className="rounded-2xl text-white overflow-hidden shadow-md"
                style={{
                    background: `linear-gradient(135deg, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%), url(${bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                }}
            >

                {/* ── SECTION 1: Primary weather summary ── */}
                <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/70 mb-1">
                            Local Weather
                        </p>
                        {/* Dominant temperature */}
                        <div className="flex items-end gap-2 leading-none">
                            <span className="text-[2.75rem] font-bold tracking-tight leading-none">
                                {tempC}{typeof tempC === 'number' ? '°C' : ''}
                            </span>
                            {feelsLike !== null && (
                                <span className="text-xs text-white/50 pb-1.5">
                                    Feels {feelsLike}°
                                </span>
                            )}
                        </div>
                        {/* Condition + location */}
                        <p className="mt-1 text-sm text-white/80 capitalize font-medium">{description}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-white/40">
                            <MapPin size={10} />
                            <span className="truncate">{locationLabel}</span>
                        </div>
                    </div>

                    {/* Weather icon — time-of-day aware */}
                    <div className="shrink-0 rounded-2xl bg-white/10 p-3 mt-1">
                        {getWeatherIcon(code, 36, hour)}
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-white/10 mx-5" />

                {/* ── SECTION 2: Key metrics grid (3-column) ── */}
                <div className="px-5 py-3 grid grid-cols-3 gap-2">
                    {/* Humidity */}
                    <div className="rounded-xl bg-white/8 border border-white/10 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-emerald-200/70 mb-1">
                            <Droplets size={13} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider">Humidity</span>
                        </div>
                        <p className="text-lg font-bold leading-none">{humidity}{typeof humidity === 'number' ? '%' : ''}</p>
                    </div>

                    {/* Rain probability */}
                    <div className="rounded-xl bg-white/8 border border-white/10 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-blue-200/70 mb-1">
                            <CloudRain size={13} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider">Rain</span>
                        </div>
                        <p className="text-lg font-bold leading-none">{rainProb}%</p>
                    </div>

                    {/* Wind speed */}
                    <div className="rounded-xl bg-white/8 border border-white/10 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-white/50 mb-1">
                            <Wind size={13} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider">Wind</span>
                        </div>
                        <p className="text-lg font-bold leading-none">
                            {windKmh !== null ? `${windKmh}` : '--'}
                            <span className="text-xs font-normal ml-0.5 text-white/50">km/h</span>
                        </p>
                    </div>
                </div>

                {/* ── SECTION 3: Smart recommendation banner ── */}
                <div className="mx-5 mb-4 rounded-xl bg-white/8 border border-white/10 px-4 py-3 flex items-start gap-3">
                    {/* Icon */}
                    <div className="shrink-0 mt-0.5 rounded-lg bg-white/10 p-1.5">
                        <Thermometer size={14} className="text-emerald-300" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                            Recommended Action
                        </p>
                        <p className={`text-[13px] font-medium leading-snug ${recAccent}`}>
                            {rec}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const statPills = [
        { icon: <Droplets size={14} />, val: `${weather.main.humidity}%`, lbl: 'Humidity' },
        { icon: <Wind size={14} />, val: `${Math.round(weather.wind.speed * 3.6)} km/h`, lbl: 'Wind' },
        { icon: <Thermometer size={14} />, val: `${Math.round(weather.main.feels_like)}°C`, lbl: 'Feels like' },
        { icon: <CloudRain size={14} />, val: `${rainChance}%`, lbl: 'Rain chance' },
        { icon: <CloudRain size={14} />, val: `${precipitation} mm`, lbl: 'Precipitation' },
        { icon: <Sunset size={14} />, val: sunsetTime, lbl: 'Sunset' },
        {
            icon: <Sun size={14} />,
            val: uvIndex !== null ? `${uvIndex.toFixed(1)} ${getUVLabel(uvIndex)}` : '--',
            lbl: 'UV Index'
        },
    ];

    const tabs = [
        { key: 'hourly', label: 'Hourly', icon: <Clock size={13} /> },
        { key: 'daily', label: '5-Day', icon: <CalendarDays size={13} /> },
    ];

    return (
        <div style={{
            borderRadius: '20px', padding: '1.5rem 1.75rem',
            background: `linear-gradient(135deg, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%), url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            transition: 'background 1.5s ease',
            color: textColor, position: 'relative', overflow: 'hidden', fontFamily: 'inherit'
        }}>
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-60px', left: '30%', width: '240px', height: '240px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

            {/* Top Row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ lineHeight: 1 }}>{getWeatherIcon(code, 56)}</div>
                    <div>
                        <div style={{ fontSize: '52px', fontWeight: 600, letterSpacing: '-2px', lineHeight: 1 }}>
                            {Math.round(weather.main.temp)}°C
                        </div>
                        <div style={{ fontSize: '14px', opacity: 0.85, marginTop: '4px', textTransform: 'capitalize' }}>
                            {weather.weather[0].description}
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={10} />
                            {location || weather?.name || 'Nueva Ecija'}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {formattedTime}
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '6px' }}>
                        {formattedDate}
                    </div>
                </div>
            </div>

            {/* Stat Pills */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem', position: 'relative' }}>
                {statPills.map((s, i) => (
                    <div
                        key={i}
                        style={{
                            ...baseCardStyle,
                            ...(hoveredPill === i ? hoverStyle : {}),
                        }}
                        onMouseEnter={() => setHoveredPill(i)}
                        onMouseLeave={() => setHoveredPill(null)}
                    >
                        <div style={{ opacity: 0.75 }}>{s.icon}</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '4px' }}>{s.val}</div>
                        <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.lbl}</div>
                    </div>
                ))}
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '1.25rem 0 1rem' }} />

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        onMouseEnter={() => setHoveredTab(tab.key)}
                        onMouseLeave={() => setHoveredTab(null)}
                        style={{
                            background: activeTab === tab.key
                                ? 'rgba(255,255,255,0.25)'
                                : hoveredTab === tab.key
                                    ? 'rgba(255,255,255,0.18)'
                                    : 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.18)',
                            color: textColor,
                            borderRadius: '8px',
                            padding: '5px 14px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab.key ? 600 : 400,
                            display: 'flex', alignItems: 'center', gap: '5px',
                            transition: 'background 0.2s, transform 0.15s',
                            transform: hoveredTab === tab.key ? 'translateY(-2px)' : 'none',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Hourly Forecast */}
            {activeTab === 'hourly' && (
                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '2px', position: 'relative' }}>
                    {forecast.map((f, i) => (
                        <div
                            key={i}
                            onMouseEnter={() => setHoveredHour(i)}
                            onMouseLeave={() => setHoveredHour(null)}
                            style={{
                                flex: 1, minWidth: '64px',
                                background: hoveredHour === i ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '12px', padding: '0.6rem 0.5rem', textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
                                transform: hoveredHour === i ? 'translateY(-3px)' : 'none',
                                boxShadow: hoveredHour === i ? '0 6px 18px rgba(0,0,0,0.2)' : 'none',
                            }}
                        >
                            <div style={{ fontSize: '11px', opacity: 0.6 }}>{i === 0 ? 'Now' : formatHour(f.dt)}</div>
                            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                                {getWeatherIcon(f.weather[0].id, 20)}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{Math.round(f.main.temp)}°</div>
                            <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '2px' }}>
                                {Math.round((f.pop || 0) * 100)}%
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 5-Day Forecast */}
            {activeTab === 'daily' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
                    {dailyForecast.map((d, i) => (
                        <div
                            key={i}
                            onMouseEnter={() => setHoveredDay(i)}
                            onMouseLeave={() => setHoveredDay(null)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: hoveredDay === i ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '12px', padding: '0.6rem 1rem',
                                cursor: 'pointer',
                                transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
                                transform: hoveredDay === i ? 'translateY(-2px)' : 'none',
                                boxShadow: hoveredDay === i ? '0 6px 18px rgba(0,0,0,0.2)' : 'none',
                            }}
                        >
                            <div style={{ fontSize: '13px', fontWeight: 600, minWidth: '90px' }}>{getDayLabel(d.dt)}</div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                {getWeatherIcon(d.icon, 20)}
                            </div>
                            <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'capitalize', flex: 1, textAlign: 'center' }}>{d.description}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', opacity: 0.65 }}>
                                <CloudRain size={12} /> {d.pop}%
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', opacity: 0.65, marginLeft: '0.75rem' }}>
                                <Droplets size={12} /> {d.rain}mm
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 600, marginLeft: '0.75rem', minWidth: '70px', textAlign: 'right' }}>
                                {d.tempMax}° / <span style={{ opacity: 0.6 }}>{d.tempMin}°</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Bottom: last updated */}
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <span style={{ fontSize: '11px', opacity: 0.45 }}>Weather updated {lastUpdated}</span>
                <button
                    onClick={() => fetchWeather(true)}
                    title="Refresh"
                    style={{
                        background: 'transparent', border: 'none', color: textColor,
                        opacity: 0.45, cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center',
                        transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.45}
                >
                    <RefreshCw size={13} />
                </button>
            </div>
        </div>
    );
};

export default WeatherWidget;