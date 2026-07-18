import React from 'react';

/**
 * WeatherBackground
 * Reusable animated background for Philippine weather applications.
 * Uses Tailwind CSS and plain CSS @keyframes injected via inline style.
 * 
 * @param {Object} data - The raw OpenWeatherMap API /weather response.
 */
const WeatherBackground = ({ data }) => {
    // 1. Determine Condition Key
    const getConditionKey = () => {
        if (!data || !data.weather || !data.weather[0]) return 'neutral';
        
        const id = data.weather[0].id;
        const main = data.weather[0].main || '';
        const condition = main.toLowerCase();
        
        // Day/night detection based on location time
        const dt = data.dt || Math.floor(Date.now() / 1000);
        const sunrise = data.sys?.sunrise;
        const sunset = data.sys?.sunset;
        const isDay = (sunrise && sunset) ? (dt >= sunrise && dt < sunset) : (new Date().getHours() >= 6 && new Date().getHours() < 19);

        // Thunderstorm (including squalls & tornadoes)
        if ((id >= 200 && id < 300) || id === 771 || id === 781) {
            return 'thunderstorm';
        }
        
        // Drizzle & Rain & Snow fallback (code 6xx fallback to rain)
        if ((id >= 300 && id < 400) || (id >= 500 && id < 600) || (id >= 600 && id < 700)) {
            return 'rain';
        }
        
        // Hazy / Mist / Fog / Atmosphere
        if (id >= 700 && id < 770) {
            return 'hazy';
        }
        
        // Cloudy
        if (id > 800 && id <= 804) {
            return 'cloudy';
        }
        
        // Clear
        if (id === 800) {
            return isDay ? 'clear-day' : 'clear-night';
        }

        // Safe fallback
        return isDay ? 'clear-day' : 'clear-night';
    };

    const activeKey = getConditionKey();

    // 2. Twinkling Stars positions
    const stars = [
        { top: '12%', left: '15%', delay: '0.1s', size: '2px' },
        { top: '22%', left: '45%', delay: '1.2s', size: '1.5px' },
        { top: '18%', left: '75%', delay: '0.5s', size: '2.5px' },
        { top: '40%', left: '25%', delay: '2.1s', size: '2px' },
        { top: '35%', left: '60%', delay: '0.8s', size: '1.5px' },
        { top: '15%', left: '85%', delay: '1.7s', size: '2px' },
        { top: '55%', left: '10%', delay: '2.5s', size: '2.5px' },
        { top: '65%', left: '80%', delay: '0.3s', size: '1.5px' },
        { top: '50%', left: '50%', delay: '1.5s', size: '2px' },
        { top: '70%', left: '35%', delay: '0.9s', size: '2px' }
    ];

    // 3. Raindrops positions
    const raindrops = Array.from({ length: 25 }, (_, i) => ({
        left: `${(i * 4) + Math.random() * 3}%`,
        delay: `${Math.random() * 1.2}s`,
        duration: `${0.6 + Math.random() * 0.4}s`,
        height: `${15 + Math.random() * 15}px`
    }));

    return (
        <>
            {/* Inject plain CSS Keyframes */}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes ph-sun-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.25; }
                    50% { transform: scale(1.18); opacity: 0.45; }
                }
                @keyframes ph-star-twinkle {
                    0%, 100% { opacity: 0.15; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                @keyframes ph-cloud-drift {
                    0% { transform: translateX(-110%); }
                    100% { transform: translateX(210%); }
                }
                @keyframes ph-rain-fall {
                    0% { transform: translateY(-30px) rotate(8deg); }
                    100% { transform: translateY(105vh) rotate(8deg); }
                }
                @keyframes ph-haze-drift {
                    0%, 100% { transform: translateX(-40%); opacity: 0.12; }
                    50% { transform: translateX(40%); opacity: 0.25; }
                }
                @keyframes ph-lightning-flash {
                    0%, 92%, 96%, 100% { opacity: 0; }
                    93%, 95% { opacity: 0.75; }
                    94% { opacity: 0.15; }
                }
            `}} />

            {/* Background container wrapper */}
            <div className="absolute inset-0 w-full h-full -z-10 overflow-hidden rounded-inherit pointer-events-none">
                
                {/* ── NEUTRAL / DEFAULT STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 transition-opacity duration-1000 ease-in-out ${activeKey === 'neutral' ? 'opacity-100' : 'opacity-0'}`} />

                {/* ── CLEAR DAY STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-sky-400 via-amber-100 to-sky-600 transition-opacity duration-1000 ease-in-out ${activeKey === 'clear-day' ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Glowing pulsing sun */}
                    <div 
                        className="absolute top-8 right-8 w-44 h-44 rounded-full"
                        style={{
                            background: 'radial-gradient(circle, rgba(255,254,220,0.55) 0%, rgba(255,254,220,0.05) 70%, transparent 100%)',
                            animation: 'ph-sun-pulse 8s infinite ease-in-out'
                        }}
                    />
                    <div 
                        className="absolute top-20 right-20 w-20 h-20 rounded-full bg-yellow-50/85 blur-[2px] shadow-[0_0_40px_rgba(253,224,71,0.45)]"
                    />
                </div>

                {/* ── CLEAR NIGHT STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 transition-opacity duration-1000 ease-in-out ${activeKey === 'clear-night' ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Glowing Crescent Moon */}
                    <div 
                        className="absolute top-10 right-10 w-24 h-24 rounded-full blur-[24px]"
                        style={{ background: 'radial-gradient(circle, rgba(224, 231, 255, 0.12) 0%, transparent 70%)' }}
                    />
                    <div className="absolute top-16 right-16 w-12 h-12 rounded-full bg-indigo-50/80 blur-[0.5px] shadow-[0_0_25px_rgba(224,231,255,0.3)]">
                        <div className="absolute top-0 left-2.5 w-12 h-12 rounded-full bg-slate-900" />
                    </div>
                    {/* Twinkling Stars */}
                    {stars.map((s, idx) => (
                        <div 
                            key={idx}
                            className="absolute rounded-full bg-white shadow-[0_0_3px_rgba(255,255,255,0.7)]"
                            style={{
                                top: s.top,
                                left: s.left,
                                width: s.size,
                                height: s.size,
                                animation: `ph-star-twinkle 3s infinite`,
                                animationDelay: s.delay
                            }}
                        />
                    ))}
                </div>

                {/* ── CLOUDY STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-slate-400 via-gray-200 to-slate-500 transition-opacity duration-1000 ease-in-out ${activeKey === 'cloudy' ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Drifting Clouds */}
                    <div 
                        className="absolute rounded-full bg-white/25 blur-[45px] w-96 h-36 top-[5%]"
                        style={{ animation: 'ph-cloud-drift 48s infinite linear', animationDelay: '0s' }}
                    />
                    <div 
                        className="absolute rounded-full bg-white/30 blur-[50px] w-[460px] h-44 top-[22%]"
                        style={{ animation: 'ph-cloud-drift 70s infinite linear', animationDelay: '-25s' }}
                    />
                    <div 
                        className="absolute rounded-full bg-white/20 blur-[40px] w-64 h-24 top-[48%]"
                        style={{ animation: 'ph-cloud-drift 35s infinite linear', animationDelay: '-12s' }}
                    />
                </div>

                {/* ── RAIN / DRIZZLE STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 transition-opacity duration-1000 ease-in-out ${activeKey === 'rain' ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Falling Rain Streaks */}
                    {raindrops.map((r, idx) => (
                        <div 
                            key={idx}
                            className="absolute bg-sky-200/25 rounded-full"
                            style={{
                                width: '1px',
                                height: r.height,
                                left: r.left,
                                top: '-30px',
                                animation: `ph-rain-fall ${r.duration} infinite linear`,
                                animationDelay: r.delay
                            }}
                        />
                    ))}
                </div>

                {/* ── THUNDERSTORM STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-neutral-950 via-zinc-900 to-stone-950 transition-opacity duration-1000 ease-in-out ${activeKey === 'thunderstorm' ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Screen lightning flash overlay */}
                    <div 
                        className="absolute inset-0 bg-white pointer-events-none mix-blend-overlay"
                        style={{ animation: 'ph-lightning-flash 7.5s infinite ease-out' }}
                    />
                    {/* Falling storm rain streaks */}
                    {raindrops.map((r, idx) => (
                        <div 
                            key={idx}
                            className="absolute bg-sky-100/35 rounded-full"
                            style={{
                                width: '1px',
                                height: r.height,
                                left: r.left,
                                top: '-30px',
                                animation: `ph-rain-fall ${parseFloat(r.duration) * 0.85}s infinite linear`,
                                animationDelay: r.delay
                            }}
                        />
                    ))}
                </div>

                {/* ── HAZY / MIST STATE ── */}
                <div className={`absolute inset-0 bg-gradient-to-br from-slate-300 via-amber-50/20 to-slate-500 transition-opacity duration-1000 ease-in-out ${activeKey === 'hazy' ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Drifting Haze Bands */}
                    <div 
                        className="absolute w-[180%] h-14 bg-white/10 blur-xl top-[20%]"
                        style={{ animation: 'ph-haze-drift 20s infinite ease-in-out' }}
                    />
                    <div 
                        className="absolute w-[180%] h-20 bg-white/15 blur-2xl top-[50%]"
                        style={{ animation: 'ph-haze-drift 26s infinite ease-in-out', animationDelay: '-6s' }}
                    />
                </div>

            </div>
        </>
    );
};

export default WeatherBackground;
