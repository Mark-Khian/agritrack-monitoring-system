import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getWeather } from '../services/api'; // reuses existing backend proxy
import WeatherBackground from './WeatherBackground';
import { RefreshCw, MapPin } from 'lucide-react';

/**
 * WeatherPageExample
 * Demonstrates live fetching, polling, tab visibility triggers,
 * and overlaying a glassmorphism card on top of the WeatherBackground.
 */
const WeatherPageExample = () => {
    const [city, setCity] = useState('Manila');
    const [weatherData, setWeatherData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchIntervalRef = useRef(null);

    const fetchWeather = useCallback(async (targetCity) => {
        setLoading(true);
        setError(null);
        try {
            // Note: PH-climate focus, query Philippine location
            const res = await getWeather(`${targetCity},PH`);
            if (res.data && res.data.current) {
                setWeatherData(res.data.current);
                setLastUpdated(new Date().toLocaleTimeString('en-PH', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                }));
            } else {
                throw new Error("No current weather data in response");
            }
        } catch (err) {
            console.error("Failed to fetch Philippine weather:", err);
            setError("Failed to retrieve current weather data. Ensure local API server is running.");
        } finally {
            setLoading(false);
        }
    }, []);

    // Setup polling interval and visibility triggers
    useEffect(() => {
        // Initial fetch on mount or when city changes
        fetchWeather(city);

        // Polling interval of 10 minutes (10 * 60 * 1000)
        const intervalId = setInterval(() => {
            fetchWeather(city);
        }, 10 * 60 * 1000);
        fetchIntervalRef.current = intervalId;

        // Fetch immediately when tab regains visibility
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchWeather(city);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup both event listener and interval on unmount
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [city, fetchWeather]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        const searchInput = e.target.elements.cityInput.value.trim();
        if (searchInput) {
            setCity(searchInput);
        }
    };

    return (
        <div className="relative w-full min-h-[550px] flex items-center justify-center p-6 rounded-3xl overflow-hidden shadow-2xl bg-slate-950">
            {/* Live Animated Weather Background (CSS keyframe-based) */}
            <WeatherBackground data={weatherData} />

            {/* Foreground Forecast Card UI layered on top (z-10) */}
            <div className="relative z-10 w-full max-w-md p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white shadow-lg">
                
                {/* Search Form */}
                <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        name="cityInput"
                        defaultValue={city}
                        placeholder="Enter PH City (e.g. Cebu)"
                        className="flex-1 px-4 py-2 text-sm bg-black/25 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-gray-300 text-white"
                    />
                    <button 
                        type="submit"
                        className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 border border-emerald-500/20 rounded-xl transition-all flex items-center gap-1.5"
                    >
                        Search
                    </button>
                </form>

                {loading && !weatherData && (
                    <div className="flex flex-col items-center justify-center py-10">
                        <RefreshCw className="animate-spin mb-2" size={24} />
                        <p className="text-sm opacity-80">Loading Philippine Live Forecast...</p>
                    </div>
                )}

                {error && (
                    <div className="text-center py-6 text-red-200">
                        <p className="text-sm font-medium">{error}</p>
                        <button 
                            onClick={() => fetchWeather(city)}
                            className="mt-3 px-3 py-1.5 text-xs bg-white/15 border border-white/10 rounded-lg hover:bg-white/25 transition-colors"
                        >
                            Retry Fetch
                        </button>
                    </div>
                )}

                {weatherData && (
                    <div className="flex flex-col">
                        {/* City Details */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-1.5 text-amber-200">
                                <MapPin size={16} />
                                <span className="font-bold text-lg">{weatherData.name || city}</span>
                            </div>
                            <button 
                                onClick={() => fetchWeather(city)}
                                title="Refresh data"
                                className="p-1.5 bg-white/10 hover:bg-white/20 active:scale-90 rounded-lg transition-all"
                            >
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        {/* Temp and Main Condition */}
                        <div className="flex items-baseline gap-2 mb-1.5">
                            <span className="text-5xl font-extrabold tracking-tight">
                                {Math.round(weatherData.main.temp)}°C
                            </span>
                            <span className="text-sm opacity-70">
                                Feels like {Math.round(weatherData.main.feels_like)}°C
                            </span>
                        </div>

                        <p className="text-base font-semibold capitalize tracking-wide text-white/95 mb-6">
                            {weatherData.weather[0].description}
                        </p>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-6 bg-black/15 p-4 rounded-xl border border-white/5">
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-white/50">Humidity</span>
                                <span className="text-sm font-bold">{weatherData.main.humidity}%</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-white/50">Wind</span>
                                <span className="text-sm font-bold">{Math.round(weatherData.wind.speed * 3.6)} km/h</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-white/50">Sunrise</span>
                                <span className="text-sm font-bold">
                                    {new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-white/50">Sunset</span>
                                <span className="text-sm font-bold">
                                    {new Date(weatherData.sys.sunset * 1000).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>

                        {/* Last Updated Timestamp */}
                        <div className="text-center text-[11px] text-white/40">
                            Last updated: {lastUpdated || '--:--:--'} (auto-polls every 10 min)
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WeatherPageExample;
