import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../services/api';
import { ArrowLeft, Eye, EyeOff, AlertCircle } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaError, setCaptchaError] = useState('');
    const [captchaRequired, setCaptchaRequired] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false); // ← NEW
    const captchaRef = useRef(null);
    const captchaRendered = useRef(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isVerified = searchParams.get('verified');

    useEffect(() => {
        if (!captchaRequired) return;

        const renderCaptcha = () => {
            if (
                window.grecaptcha &&
                window.grecaptcha.render &&
                captchaRef.current &&
                !captchaRendered.current
            ) {
                try {
                    window.grecaptcha.render(captchaRef.current, {
                        sitekey: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
                        callback: (token) => {
                            setCaptchaToken(token);
                            setCaptchaError('');
                        },
                        'expired-callback': () => setCaptchaToken(''),
                        'error-callback': () => {
                            setCaptchaToken('');
                            setCaptchaError('CAPTCHA error. Please try again.');
                        }
                    });
                    captchaRendered.current = true;
                } catch (err) {
                    console.error('reCAPTCHA render error:', err);
                }
            }
        };

        if (window.grecaptcha && window.grecaptcha.render) {
            renderCaptcha();
        } else {
            const interval = setInterval(() => {
                if (window.grecaptcha && window.grecaptcha.render) {
                    clearInterval(interval);
                    renderCaptcha();
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, [captchaRequired]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setCaptchaError('');

        if (captchaRequired && !captchaToken) {
            setCaptchaError('Please complete the CAPTCHA verification.');
            return;
        }

        setIsLoading(true);
        try {
            const res = await loginUser({
                email,
                password,
                captchaToken: captchaRequired ? captchaToken : undefined
            });
            login(res.data.user, res.data.token, res.data.refreshToken);

            // ✅ Show success screen then redirect
            setShowSuccess(true);
            setTimeout(() => navigate('/dashboard'), 2000);

        } catch (error) {
            const data = error?.response?.data;
            if (data?.captchaRequired) setCaptchaRequired(true);
            const msg = data?.message || error.message || 'Login failed.';
            setErrorMsg(msg);
            if (window.grecaptcha && captchaRendered.current) window.grecaptcha.reset();
            setCaptchaToken('');
        } finally {
            setIsLoading(false);
        }
    };

    // ✅ Success Screen
    if (showSuccess) {
        return (
            <div className="min-h-screen relative flex items-center justify-center overflow-hidden font-sans">
                <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-green-800 to-green-950 z-0"></div>
                <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-green-500 rounded-full blur-[120px] opacity-30 z-0 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-amber-500 rounded-full blur-[100px] opacity-20 z-0 pointer-events-none"></div>

                <div className="relative z-10 flex flex-col items-center gap-6 text-center px-4">
                    {/* Animated checkmark */}
                    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40 animate-bounce">
                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    {/* Message */}
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">
                            Welcome back! 👋
                        </h2>
                        <p className="text-green-200 text-sm">
                            Login successful. Redirecting to dashboard...
                        </p>
                    </div>

                    {/* Bouncing dots */}
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>

                    {/* Branding */}
                    <div className="flex items-center gap-2 mt-4">
                        <span className="text-2xl">🌾</span>
                        <span className="text-white font-bold text-lg">AgriTrack</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative flex items-center justify-center bg-gray-50 overflow-hidden font-sans">
            <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-green-800 to-green-950 z-0"></div>
            <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-green-500 rounded-full blur-[120px] opacity-30 z-0 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-amber-500 rounded-full blur-[100px] opacity-20 z-0 pointer-events-none"></div>

            <div className="w-full max-w-md p-8 relative z-10">
                <div className="bg-white rounded-3xl shadow-2xl p-8 border border-white/20">

                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-green-700 transition-colors mb-6 group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Back to Home
                    </button>

                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-green-100">
                            <span className="text-3xl">🌾</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AgriTrack</h1>
                        <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
                    </div>

                    {isVerified && (
                        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl text-sm border border-green-200 flex items-center gap-2">
                            ✅ Email verified successfully! You can now log in.
                        </div>
                    )}

                    {errorMsg && (
                        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 ml-1">Email Address</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 outline-none transition-all placeholder-gray-400"
                                placeholder="farmer@agritrack.com"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 ml-1">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 outline-none transition-all placeholder-gray-400 pr-12"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* CAPTCHA — only after 3 failed attempts */}
                        {captchaRequired && (
                            <div className="space-y-3">
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                    <p className="text-xs text-amber-700 flex items-center gap-2">
                                        ⚠️ Suspicious activity detected. Please verify you are human to continue.
                                    </p>
                                </div>
                                <div className="flex flex-col items-center">
                                    <div ref={captchaRef}></div>
                                    {captchaError && (
                                        <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3 shrink-0" />
                                            {captchaError}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="pt-2 space-y-3">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 rounded-xl transition duration-200 disabled:opacity-50"
                            >
                                {isLoading ? 'Signing in...' : 'Sign In'}
                            </button>
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => navigate('/forgot-password')}
                                    className="text-sm text-green-700 hover:underline font-medium"
                                >
                                    Forgot Password?
                                </button>
                            </div>
                        </div>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-500">
                        Don't have an account?{' '}
                        <Link to="/register" className="font-medium text-green-700 hover:text-green-800 transition-colors">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;