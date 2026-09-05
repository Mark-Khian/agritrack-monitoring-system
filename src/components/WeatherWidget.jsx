import { useEffect, useState, useCallback, useRef } from 'react';
import {
    Wind, Droplets, Thermometer, CloudRain, MapPin, Sunset, Sun,
    Clock, CalendarDays, CloudSun, CloudLightning, CloudDrizzle,
    CloudSnow, CloudFog, Moon, Sunrise, RefreshCw, X, Search, Loader2, Check, ChevronRight
} from 'lucide-react';

import { getWeather, resolveLocation, updateFarmLocation } from '../services/api';
import { deleteFarmLocation } from '../services/api';
import ConfirmDialog from './ConfirmDialog';


let weatherCache = {
    weather: null,
    forecast: null,
    dailyForecast: null,
    uvIndex: null,
    locationName: null,
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
    const isDawn = hour >= 6 && hour < 9;           // 6 AM – 8:59 AM
    const isDusk = hour >= 17 && hour < 19;          // 5 PM – 6:59 PM

    if (isNight) return <Moon size={size} />;         // night   → moon
    if (isDawn) return <Sunrise size={size} />;      // dawn    → sunrise
    if (isDusk) return <Sunset size={size} />;       // dusk    → sunset

    // Daytime
    if (code === 800) return <Sun size={size} />;     // clear sky
    if (code > 800) return <CloudSun size={size} />; // partly cloudy
    return <CloudSun size={size} />;
};


const getWeatherGradient = (code, hour, isDark) => {
    const isNight = hour >= 19 || hour < 6;

    const isRainy = (code >= 200 && code < 700);
    const isClear = (code === 800);
    const isCloudy = (code > 800 || (code >= 700 && code < 800));

    if (isDark) {
        if (isNight) {
            if (isRainy) {
                return 'linear-gradient(135deg, #090d16 0%, #1e1b4b 100%)';
            }
            if (isCloudy) {
                return 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
            }
            return 'linear-gradient(135deg, #020617 0%, #0f172a 100%)';
        } else {
            if (isRainy) {
                return 'linear-gradient(135deg, #334155 0%, #1e293b 100%)';
            }
            if (isClear) {
                return 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
            }
            return 'linear-gradient(135deg, #475569 0%, #334155 100%)';
        }
    } else {
        if (isNight) {
            if (isRainy) {
                return 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
            }
            if (isCloudy) {
                return 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)';
            }
            return 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)';
        } else {
            if (isRainy) {
                return 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)';
            }
            if (isClear) {
                return 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)';
            }
            return 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)';
        }
    }
};

const getTextColor = (isDark) => isDark ? '#ffffff' : '#0f172a';

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

const formatLocationDisplay = (name) => {
    if (!name) return '';
    return name.replace(/\s\/\s/g, ', ').replace(/,\sPH$/, ', Philippines');
};

/**
 * WeatherWidget
 * @param {string|null} location  - Farm location string (e.g. "Nueva Ecija").
 *   If provided, fetches weather via backend proxy (cached 30 min).
 *   If null/undefined, falls back to direct OpenWeatherMap call with default lat/lon.
 */
const WeatherWidget = ({ variant = 'default', rainExpected = null }) => {
    const [weather, setWeather] = useState(weatherCache.weather);
    const [forecast, setForecast] = useState(weatherCache.forecast || []);
    const [dailyForecast, setDailyForecast] = useState(weatherCache.dailyForecast || []);
    const [uvIndex, setUvIndex] = useState(weatherCache.uvIndex);
    const [locationName, setLocationName] = useState(weatherCache.locationName || 'Farm Location');
    const [loading, setLoading] = useState(!weatherCache.weather);

    const [isConfigured, setIsConfigured] = useState(true);

    const [showConfigModal, setShowConfigModal] = useState(false);
    const [searchLocation, setSearchLocation] = useState('');
    const [resolvedLocation, setResolvedLocation] = useState(null);
    const [configLoading, setConfigLoading] = useState(false);
    const [configError, setConfigError] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const dropdownRef = useRef(null);
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

    const [isDarkMode, setIsDarkMode] = useState(() =>
        document.documentElement.classList.contains('dark')
    );

    useEffect(() => {
        setIsDarkMode(document.documentElement.classList.contains('dark'));
        const observer = new MutationObserver(() => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });
        return () => observer.disconnect();
    }, []);

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
            const res = await getWeather();
            const data = res.data;
            const current = data.current;
            let forecastList = data.forecast || [];
            const uviValue = data.uvIndex ?? null;
            const daily = groupForecastByDay(forecastList);
            forecastList = forecastList.slice(0, 6);
            const locName = data.location?.name || 'Farm Location';

            weatherCache = {
                weather: current,
                forecast: forecastList,
                dailyForecast: daily,
                uvIndex: uviValue,
                locationName: locName,
                lastFetched: Date.now(),
            };

            setWeather(current);
            setForecast(forecastList);
            setDailyForecast(daily);
            setUvIndex(uviValue);
            setLocationName(locName);
            setIsConfigured(true);
            setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            if (err.response?.data?.farmNotConfigured) {
                setIsConfigured(false);
            } else {
                setError('Unable to load weather data.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

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
    }, [fetchWeather]);

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
        background: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)',
        border: isDarkMode ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.6)',
        borderRadius: '12px',
        padding: '0.6rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '72px',
        cursor: 'pointer',
        transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
    };

    const activeHoverStyle = {
        background: isDarkMode ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.65)',
        transform: 'translateY(-3px)',
        boxShadow: isDarkMode ? '0 6px 18px rgba(0,0,0,0.2)' : '0 6px 18px rgba(0,0,0,0.08)',
    };


    const handleSearch = async () => {
        if (!searchLocation.trim() || searchLocation.trim().length < 3) return;
        setConfigLoading(true);
        setConfigError('');

        try {
            const res = await resolveLocation(searchLocation);
            setSuggestions(res.data.suggestions || []);
            setShowSuggestions(true);
        } catch (err) {
            if (err.response?.status === 404) {
                setSuggestions([]);
                setShowSuggestions(true);
            } else {
                setConfigError(err.response?.data?.message || 'Unable to search locations. Please try again.');
                setSuggestions([]);
                setShowSuggestions(false);
            }
        } finally {
            setConfigLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setSearchLocation(val);
        if (resolvedLocation && val !== formatLocationDisplay(resolvedLocation.resolvedName)) {
            setResolvedLocation(null);
        }
    };

    useEffect(() => {
        let isCancelled = false;

        if (searchLocation.trim().length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        if (resolvedLocation && formatLocationDisplay(resolvedLocation.resolvedName) === searchLocation) {
            return;
        }

        const timer = setTimeout(async () => {
            setConfigLoading(true);
            setConfigError('');
            try {
                const res = await resolveLocation(searchLocation);
                if (!isCancelled) {
                    setSuggestions(res.data.suggestions || []);
                    setShowSuggestions(true);
                    setConfigLoading(false);
                }
            } catch (err) {
                if (!isCancelled) {
                    if (err.response?.status === 404) {
                        setSuggestions([]);
                        setShowSuggestions(true);
                    } else {
                        setConfigError('Unable to search locations. Please try again.');
                        setSuggestions([]);
                        setShowSuggestions(false);
                    }
                    setConfigLoading(false);
                }
            }
        }, 400);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [searchLocation, resolvedLocation]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCloseModal = () => {
        setShowConfigModal(false);
        setSearchLocation('');
        setResolvedLocation(null);
        setSuggestions([]);
        setConfigError('');
        setShowSuggestions(false);
    };

    const handleSave = async () => {
        if (!resolvedLocation) return;
        setConfigLoading(true);
        setConfigError('');

        try {
            await updateFarmLocation({ psgcCode: resolvedLocation.psgcCode });
            setSearchLocation('');
            setShowConfigModal(false);
            setResolvedLocation(null);
            setSuggestions([]);
            setShowSuggestions(false);

            weatherCache.lastFetched = null;
            await fetchWeather(true);
        } catch (err) {
            setConfigError(err.response?.data?.message || 'Failed to save location.');
        } finally {
            setConfigLoading(false);
        }
    };

    const handleRemoveLocation = () => {
        setShowRemoveConfirm(true);
    };

    const confirmRemoveLocation = async () => {
        try {
            await deleteFarmLocation();
            weatherCache = {
                weather: null,
                forecast: null,
                dailyForecast: null,
                uvIndex: null,
                locationName: null,
                lastFetched: null,
            };
            setLocationName('Farm Location');
            setIsConfigured(false);
            setWeather(null);
            setForecast([]);
            setDailyForecast([]);
            setSearchLocation('');
            setShowRemoveConfirm(false);
            setShowConfigModal(false);
        } catch (err) {
            setConfigError(err.response?.data?.message || 'Failed to remove location.');
            setShowRemoveConfirm(false);
        }
    };

    const renderModal = () => {
        if (!showConfigModal) return null;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div
                    className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">Farm Weather Location</h2>
                        <button onClick={handleCloseModal} className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                            <X size={20} />
                        </button>
                    </div>

                    <p className={`text-sm mb-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Set the location of your farm to receive accurate weather forecasts and alerts.
                    </p>

                    <div className="flex flex-col gap-2 mb-4 relative" ref={dropdownRef}>
                        <div className="flex gap-2 w-full">
                            <input
                                type="text"
                                value={searchLocation}
                                onChange={handleInputChange}
                                placeholder="Search a city, municipality, or barangay"
                                className={`flex-1 px-4 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500/50 ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSearch();
                                    if (e.key === 'Escape') setShowSuggestions(false);
                                }}
                            />
                        </div>

                        {showSuggestions && (
                            <div className={`absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border shadow-xl overflow-hidden max-h-60 overflow-y-auto ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                                {suggestions.length > 0 ? (
                                    suggestions.map((sug, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setResolvedLocation(sug);
                                                setSearchLocation(formatLocationDisplay(sug.resolvedName));
                                                setShowSuggestions(false);
                                            }}
                                            className={`p-3 flex items-start gap-3 cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-700 border-b border-slate-700 last:border-0' : 'hover:bg-slate-50 border-b border-slate-100 last:border-0'}`}
                                        >
                                            <MapPin className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                            <div>
                                                <p className="font-medium text-sm leading-tight">{formatLocationDisplay(sug.resolvedName)}</p>
                                                {(sug.province || sug.municipalityCity) && (
                                                    <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {[sug.barangay, sug.municipalityCity, sug.province].filter(Boolean).join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-sm text-slate-500">
                                        {configLoading ? 'Searching...' : (
                                            <>
                                                <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">No Philippine location found.</p>
                                                <p className="text-xs">Try searching for a valid city, municipality, or barangay.</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {configError && (
                        <p className="text-sm text-red-500 mb-4">{configError}</p>
                    )}

                    {isConfigured && (
                        <div className="mb-4">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                Active Farm Location
                            </p>
                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-900/50 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                                <div className="flex items-start gap-3">
                                    <MapPin className="text-emerald-500 mt-1 shrink-0" size={18} />
                                    <div>
                                        <p className="font-semibold text-sm">{formatLocationDisplay(locationName)}</p>
                                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            Currently used for weather forecasts and alerts.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {resolvedLocation && (
                        <div className="mb-4">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                Selected Location Preview
                            </p>
                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-900/50 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                                <div className="flex items-start gap-3">
                                    <MapPin className="text-emerald-500 mt-1 shrink-0" size={18} />
                                    <div>
                                        <p className="font-semibold text-sm">{formatLocationDisplay(resolvedLocation.resolvedName)}</p>
                                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            PSGC: {resolvedLocation.psgcCode}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}



                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            onClick={handleCloseModal}
                            className={`px-4 py-2 rounded-xl font-medium ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200'}`}
                            type="button"
                        >
                            Cancel
                        </button>
                        {isConfigured && (
                            <button
                                onClick={handleRemoveLocation}
                                className="px-4 py-2 rounded-xl font-medium transition-colors bg-red-600 hover:bg-red-700 text-white"
                                type="button"
                            >
                                Remove
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={!resolvedLocation || configLoading}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                            type="button"
                        >
                            {configLoading && resolvedLocation && <Loader2 size={16} className="animate-spin" />}
                            Save
                        </button>
                    </div>
                </div>

                <ConfirmDialog
                    isOpen={showRemoveConfirm}
                    onClose={() => setShowRemoveConfirm(false)}
                    onConfirm={confirmRemoveLocation}
                    title="Remove farm weather location?"
                    message="Weather forecasts and location-based alerts will be unavailable until a new location is configured."
                    confirmText="Remove Location"
                />
            </div>
        );
    };

    if (!isConfigured) {
        return (
            <>
                <div
                    onClick={() => setShowConfigModal(true)}
                    className="hover:scale-[1.01] transition-transform cursor-pointer"
                    style={{
                        borderRadius: '20px', padding: '1.5rem',
                        background: isDarkMode
                            ? 'linear-gradient(135deg, #0b0f19 0%, #1e293b 100%)'
                            : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                        minHeight: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'
                    }}
                >
                    <MapPin size={28} className={isDarkMode ? 'text-emerald-400 mb-3' : 'text-emerald-600 mb-3'} />
                    <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Farm Location Not Set</h3>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Click to configure your farm location for accurate weather tracking.</p>
                </div>
                {renderModal()}
            </>
        );
    }

    if (loading) return (
        <div style={{
            borderRadius: '20px', padding: '1.5rem 1.75rem',
            background: isDarkMode
                ? 'linear-gradient(135deg, #0b0f19 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <p style={{ color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)', fontSize: '14px' }}>Loading weather...</p>
        </div>
    );

    if (error) return (
        <div style={{
            borderRadius: '20px', padding: '1.5rem',
            background: isDarkMode
                ? 'linear-gradient(135deg, #0b0f19 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
            <p style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.6)', fontSize: '14px' }}>{error}</p>
            <button onClick={() => fetchWeather(true)} style={{
                background: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)', border: isDarkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.15)',
                color: isDarkMode ? '#fff' : '#0f172a', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
            }}>Retry</button>
        </div>
    );

    const code = weather.weather[0].id;
    const hour = now.getHours();
    const bgGradient = getWeatherGradient(code, hour, isDarkMode);
    const textColor = getTextColor(isDarkMode);

    // Dashboard decision-support card — 3-level visual hierarchy.
    if (variant === 'dashboard') {
        const tempC = weather?.main?.temp ? Math.round(weather.main.temp) : '--';
        const feelsLike = weather?.main?.feels_like ? Math.round(weather.main.feels_like) : null;
        const description = weather?.weather?.[0]?.description || '';
        const humidity = weather?.main?.humidity ?? '--';
        const windKmh = weather?.wind?.speed != null ? Math.round(weather.wind.speed * 3.6) : null;
        const rainProb = rainChance ?? 0;
        const locationLabel = locationName;

        // ── Smart recommendation — highest-priority condition wins ────────────
        const rainIsHigh = typeof rainExpected === 'boolean' ? rainExpected : rainProb > 60;
        const heatHigh = typeof tempC === 'number' && tempC > 34;
        const humidHigh = typeof humidity === 'number' && humidity > 80;
        const windHigh = windKmh != null && windKmh > 25;
        const isClear = (code === 800 || code === 801 || code === 802) && !rainIsHigh;

        let rec, recAccent;
        if (rainIsHigh) {
            rec = 'Possible rainfall — postpone irrigation and prepare drainage channels.';
            recAccent = isDarkMode ? 'text-blue-200' : 'text-blue-700';
        } else if (heatHigh) {
            rec = 'High heat detected — irrigate early morning or late afternoon to reduce crop stress.';
            recAccent = isDarkMode ? 'text-orange-200' : 'text-orange-700';
        } else if (humidHigh) {
            rec = 'High humidity — monitor crops closely for fungal disease and leaf blight risk.';
            recAccent = isDarkMode ? 'text-yellow-200' : 'text-amber-700';
        } else if (windHigh) {
            rec = 'Strong winds expected — secure lightweight materials and delay aerial spraying.';
            recAccent = isDarkMode ? 'text-purple-200' : 'text-purple-700';
        } else if (isClear) {
            rec = 'Good conditions — proceed with scheduled field activities and soil preparation.';
            recAccent = isDarkMode ? 'text-emerald-200' : 'text-emerald-700';
        } else {
            rec = 'Stable conditions — proceed with routine field work and monitor for changes.';
            recAccent = isDarkMode ? 'text-emerald-200' : 'text-emerald-700';
        }

        const textPrimary = isDarkMode ? 'text-white' : 'text-slate-900';
        const textSecondary = isDarkMode ? 'text-white/80' : 'text-slate-700';
        const textMuted = isDarkMode ? 'text-white/50' : 'text-slate-500';
        const textGhost = isDarkMode ? 'text-white/40' : 'text-slate-400';
        const cardBg = isDarkMode
            ? 'bg-white/8 border-white/10 hover:bg-white/12 hover:border-white/20'
            : 'bg-white/40 border-white/60 hover:bg-white/60 hover:border-white/80';
        const cardShadow = isDarkMode ? 'hover:shadow-lg' : 'hover:shadow-md';

        return (
            <>
            <div
                className={`rounded-2xl overflow-hidden shadow-md flex flex-col lg:flex-row lg:items-stretch p-5 lg:p-6 gap-4 lg:gap-6 relative transition-all duration-500 ${textPrimary}`}
                style={{
                    backgroundImage: bgGradient,
                }}
            >
                {/* ── SECTION 1: Primary weather summary card ── */}
                <div className={`rounded-xl border p-5 flex items-center justify-between gap-4 lg:w-80 lg:shrink-0 relative z-10 transition-all duration-300 hover:scale-[1.02] cursor-default ${cardBg} ${cardShadow}`}>
                    <div className="min-w-0">
                        <p className={`text-[10px] lg:text-[11px] font-bold uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-emerald-300/70' : 'text-emerald-700/80'}`}>
                            Local Weather
                        </p>
                        {/* Dominant temperature */}
                        <div className="flex items-end gap-2 leading-none">
                            <span className="text-[2.5rem] lg:text-[3rem] font-bold tracking-tight leading-none">
                                {tempC}{typeof tempC === 'number' ? '°C' : ''}
                            </span>
                            {feelsLike !== null && (
                                <span className={`text-xs lg:text-sm pb-1 ${textMuted}`}>
                                    Feels {feelsLike}°
                                </span>
                            )}
                        </div>
                        {/* Condition + location */}
                        <p className={`mt-2 text-sm lg:text-base capitalize font-medium ${textSecondary}`}>{description}</p>
                        <div
                            onClick={() => setShowConfigModal(true)}
                            className={`mt-1 -ml-1.5 max-w-full inline-flex items-center gap-1.5 text-xs lg:text-sm cursor-pointer rounded-md px-1.5 py-1 transition-colors ${textGhost} ${isDarkMode ? 'hover:bg-white/10 hover:text-white/70' : 'hover:bg-slate-900/5 hover:text-slate-600'}`}
                            title={formatLocationDisplay(locationLabel)}
                        >
                            <MapPin size={10} className="lg:size-[12px] shrink-0" />
                            <span className="truncate">{formatLocationDisplay(locationLabel)}</span>
                            <ChevronRight size={12} className="shrink-0 opacity-50" />
                        </div>
                    </div>

                    {/* Weather icon — time-of-day aware */}
                    <div className={`shrink-0 rounded-2xl p-3 lg:p-4 ${isDarkMode ? 'bg-white/10' : 'bg-slate-900/5'}`}>
                        {getWeatherIcon(code, 44, hour)}
                    </div>
                </div>

                {/* Right side container for Desktop horizontal flow */}
                <div className="flex-1 flex flex-col justify-between gap-3 lg:gap-4 relative z-10">
                    {/* ── SECTION 2: Key metrics grid (3-column) ── */}
                    <div className="grid grid-cols-3 gap-2 lg:gap-3">
                        {/* Humidity */}
                        <div className={`rounded-xl border px-3 py-2.5 lg:px-4 lg:py-3.5 transition-all duration-300 hover:scale-[1.03] cursor-default ${cardBg} ${cardShadow}`}>
                            <div className={`flex items-center gap-1.5 mb-1 ${isDarkMode ? 'text-emerald-200/70' : 'text-emerald-700/80'}`}>
                                <Droplets size={13} className="lg:size-[15px]" />
                                <span className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-wider">Humidity</span>
                            </div>
                            <p className="text-lg lg:text-xl font-bold leading-none">{humidity}{typeof humidity === 'number' ? '%' : ''}</p>
                        </div>

                        {/* Rain probability */}
                        <div className={`rounded-xl border px-3 py-2.5 lg:px-4 lg:py-3.5 transition-all duration-300 hover:scale-[1.03] cursor-default ${cardBg} ${cardShadow}`}>
                            <div className={`flex items-center gap-1.5 mb-1 ${isDarkMode ? 'text-blue-200/70' : 'text-blue-700/80'}`}>
                                <CloudRain size={13} className="lg:size-[15px]" />
                                <span className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-wider">Rain</span>
                            </div>
                            <p className="text-lg lg:text-xl font-bold leading-none">{rainProb}%</p>
                        </div>

                        {/* Wind speed */}
                        <div className={`rounded-xl border px-3 py-2.5 lg:px-4 lg:py-3.5 transition-all duration-300 hover:scale-[1.03] cursor-default ${cardBg} ${cardShadow}`}>
                            <div className={`flex items-center gap-1.5 mb-1 ${isDarkMode ? 'text-white/50' : 'text-slate-500/80'}`}>
                                <Wind size={13} className="lg:size-[15px]" />
                                <span className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-wider">Wind</span>
                            </div>
                            <p className="text-lg lg:text-xl font-bold leading-none">
                                {windKmh !== null ? `${windKmh}` : '--'}
                                <span className={`text-xs lg:text-sm font-normal ml-0.5 ${textMuted}`}>km/h</span>
                            </p>
                        </div>
                    </div>

                    {/* ── SECTION 3: Smart recommendation banner ── */}
                    <div className={`rounded-xl border px-4 py-3 lg:px-5 lg:py-4 flex items-start gap-3 transition-all duration-300 hover:scale-[1.01] cursor-default ${cardBg} ${cardShadow}`}>
                        {/* Icon */}
                        <div className={`shrink-0 mt-0.5 rounded-lg p-1.5 lg:p-2 ${isDarkMode ? 'bg-white/10' : 'bg-slate-900/5'}`}>
                            <Thermometer size={14} className={`${isDarkMode ? 'text-emerald-300' : 'text-emerald-600'} lg:size-[16px]`} />
                        </div>
                        <div>
                            <p className={`text-[11px] lg:text-xs font-bold uppercase tracking-widest mb-0.5 ${textMuted}`}>
                                Recommended Action
                            </p>
                            <p className={`text-[13px] lg:text-[15px] font-medium leading-snug ${recAccent}`}>
                                {rec}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            {renderModal()}
            </>
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
        <>
        <div style={{
            borderRadius: '20px', padding: '1.5rem 1.75rem',
            backgroundImage: bgGradient,
            transition: 'background 1.5s ease',
            color: textColor, position: 'relative', overflow: 'hidden', fontFamily: 'inherit'
        }}>
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none', zIndex: 1 }} />
            <div style={{ position: 'absolute', bottom: '-60px', left: '30%', width: '240px', height: '240px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none', zIndex: 1 }} />

            {/* Top Row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ lineHeight: 1 }}>{getWeatherIcon(code, 56)}</div>
                    <div>
                        <div style={{ fontSize: '52px', fontWeight: 600, letterSpacing: '-2px', lineHeight: 1 }}>
                            {Math.round(weather.main.temp)}°C
                        </div>
                        <div style={{ fontSize: '14px', opacity: 0.85, marginTop: '4px', textTransform: 'capitalize' }}>
                            {weather.weather[0].description}
                        </div>
                        <div
                            onClick={() => setShowConfigModal(true)}
                            className={`mt-1 -ml-1.5 inline-flex items-center gap-1.5 cursor-pointer rounded-md px-1.5 py-1 transition-colors ${isDarkMode ? 'text-white/60 hover:bg-white/10 hover:text-white/80' : 'text-slate-900/60 hover:bg-slate-900/5 hover:text-slate-900/80'}`}
                            style={{ fontSize: '12px' }}
                            title={formatLocationDisplay(locationName || weather?.name || 'Nueva Ecija')}
                        >
                            <MapPin size={10} className="shrink-0" />
                            <span className="truncate max-w-[200px]">{formatLocationDisplay(locationName || weather?.name || 'Nueva Ecija')}</span>
                            <ChevronRight size={12} className="shrink-0 opacity-50" />
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
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem', position: 'relative', zIndex: 10 }}>
                {statPills.map((s, i) => (
                    <div
                        key={i}
                        style={{
                            ...baseCardStyle,
                            ...(hoveredPill === i ? activeHoverStyle : {}),
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
            <div style={{ borderTop: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.1)', margin: '1.25rem 0 1rem', position: 'relative', zIndex: 10 }} />

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem', position: 'relative', zIndex: 10 }}>
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        onMouseEnter={() => setHoveredTab(tab.key)}
                        onMouseLeave={() => setHoveredTab(null)}
                        style={{
                            background: activeTab === tab.key
                                ? (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.65)')
                                : hoveredTab === tab.key
                                    ? (isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.5)')
                                    : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)'),
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.5)',
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
                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '2px', position: 'relative', zIndex: 10 }}>
                    {forecast.map((f, i) => (
                        <div
                            key={i}
                            onMouseEnter={() => setHoveredHour(i)}
                            onMouseLeave={() => setHoveredHour(null)}
                            style={{
                                flex: 1, minWidth: '64px',
                                background: hoveredHour === i
                                    ? (isDarkMode ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.65)')
                                    : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)'),
                                border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.4)',
                                borderRadius: '12px', padding: '0.6rem 0.5rem', textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
                                transform: hoveredHour === i ? 'translateY(-3px)' : 'none',
                                boxShadow: hoveredHour === i ? (isDarkMode ? '0 6px 18px rgba(0,0,0,0.2)' : '0 6px 18px rgba(0,0,0,0.08)') : 'none',
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', zIndex: 10 }}>
                    {dailyForecast.map((d, i) => (
                        <div
                            key={i}
                            onMouseEnter={() => setHoveredDay(i)}
                            onMouseLeave={() => setHoveredDay(null)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: hoveredDay === i
                                    ? (isDarkMode ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.65)')
                                    : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)'),
                                border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.4)',
                                borderRadius: '12px', padding: '0.6rem 1rem',
                                cursor: 'pointer',
                                transition: 'background 0.2s, transform 0.2s, box-shadow 0.2s',
                                transform: hoveredDay === i ? 'translateY(-2px)' : 'none',
                                boxShadow: hoveredDay === i ? (isDarkMode ? '0 6px 18px rgba(0,0,0,0.2)' : '0 6px 18px rgba(0,0,0,0.08)') : 'none',
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
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
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
        {renderModal()}
        </>
    );
};

export default WeatherWidget;