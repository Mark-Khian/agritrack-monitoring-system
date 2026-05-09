import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../services/api';
import { ArrowLeft, Eye, EyeOff, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const PASSWORD_RULES = [
    { label: 'At least 8 characters', test: (p) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
    { label: 'One number', test: (p) => /[0-9]/.test(p) },
    { label: 'One special character', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

const FieldError = ({ message }) => {
    if (!message) return null;
    return (
        <p className="text-xs text-red-500 ml-1 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {message}
        </p>
    );
};

const Register = () => {
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaError, setCaptchaError] = useState('');
    const [showSuccess, setShowSuccess] = useState(false); // ← NEW
    const [registeredName, setRegisteredName] = useState('');   // ← NEW
    const captchaRef = useRef(null);
    const navigate = useNavigate();

    const isFormReady =
        form.name.trim() !== '' &&
        form.email.trim() !== '' &&
        form.password.trim() !== '' &&
        form.confirmPassword.trim() !== '';

    useEffect(() => {
        const renderCaptcha = () => {
            if (
                window.grecaptcha &&
                window.grecaptcha.render &&
                captchaRef.current &&
                !captchaRef.current.hasChildNodes()
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
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: '' }));
        if (errorMsg) setErrorMsg('');
        if (captchaToken) {
            if (window.grecaptcha) window.grecaptcha.reset();
            setCaptchaToken('');
        }
    };

    const validateName = (name) => {
        if (!name.trim()) return 'Full name is required.';
        if (name.trim().length < 2) return 'Name must be at least 2 characters.';
        if (name.trim().length > 100) return 'Name cannot exceed 100 characters.';
        if (!/^[a-zA-Z\s\-'.]+$/.test(name)) return 'Name can only contain letters, spaces, hyphens, and apostrophes.';
        if (/[^aeiou\s]{6,}/i.test(name)) return 'Please enter a valid full name.';
        if (/(.)\1{4,}/.test(name)) return 'Name contains invalid repeated characters.';
        if ((name.match(/[a-zA-Z]/g) || []).length < 2) return 'Name must contain at least 2 letters.';
        return '';
    };

    const validateEmail = (email) => {
        if (!email.trim()) return 'Email address is required.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
        return '';
    };

    const validatePassword = (password) => {
        if (!password) return 'Password is required.';
        const failedRule = PASSWORD_RULES.find((r) => !r.test(password));
        if (failedRule) return `Password must have: ${failedRule.label.toLowerCase()}.`;
        return '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setCaptchaError('');

        const errors = {};
        const nameError = validateName(form.name);
        const emailError = validateEmail(form.email);
        const passwordError = validatePassword(form.password);

        if (nameError) errors.name = nameError;
        if (emailError) errors.email = emailError;
        if (passwordError) errors.password = passwordError;

        if (!form.confirmPassword) {
            errors.confirmPassword = 'Please confirm your password.';
        } else if (form.password !== form.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match.';
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            setErrorMsg('Please fix the errors below before submitting.');
            return;
        }

        if (!captchaToken) {
            setCaptchaError('Please complete the CAPTCHA verification.');
            return;
        }

        setIsLoading(true);
        try {
            await registerUser({
                name: form.name,
                email: form.email,
                password: form.password,
                captchaToken
            });

            // ✅ Show success screen then redirect
            setRegisteredName(form.name);
            setShowSuccess(true);
            setTimeout(() => navigate('/login'), 3000);

        } catch (error) {
            if (window.grecaptcha) window.grecaptcha.reset();
            setCaptchaToken('');

            if (error?.response?.data?.errors) {
                const backendErrors = {};
                error.response.data.errors.forEach(err => {
                    backendErrors[err.field] = err.message;
                });
                setFieldErrors(backendErrors);
                setErrorMsg('Please fix the errors below before submitting.');
            } else {
                setFieldErrors({});
                setErrorMsg(
                    error?.response?.data?.message ||
                    error.message ||
                    'Registration failed. Please try again.'
                );
            }
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = (field) =>
        `w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 outline-none transition-all placeholder-gray-400 text-gray-900 ${fieldErrors[field]
            ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
            : 'border-gray-200 focus:ring-green-600 focus:border-green-600'
        }`;

    // ✅ Success Screen
    if (showSuccess) {
        return (
            <div className="min-h-screen relative flex items-center justify-center overflow-hidden font-sans">
                <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-green-800 to-green-950 z-0" />
                <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-green-500 rounded-full blur-[120px] opacity-30 z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-amber-500 rounded-full blur-[100px] opacity-20 z-0 pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center gap-6 text-center px-4 max-w-md">
                    {/* Animated checkmark */}
                    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40 animate-bounce">
                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    {/* Message */}
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">
                            Account Created! 🎉
                        </h2>
                        <p className="text-green-100 text-sm leading-relaxed">
                            Welcome, <span className="font-semibold">{registeredName}</span>!
                            <br />
                            Please check your email to verify your account.
                        </p>
                    </div>

                    {/* Email reminder */}
                    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 w-full">
                        <p className="text-white text-xs flex items-center gap-2 justify-center">
                            📧 A verification email has been sent to your inbox
                        </p>
                    </div>

                    {/* Bouncing dots */}
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>

                    <p className="text-green-300 text-xs">
                        Redirecting to login in 3 seconds...
                    </p>

                    {/* Branding */}
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-2xl">🌾</span>
                        <span className="text-white font-bold text-lg">AgriTrack</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative flex items-center justify-center bg-gray-50 overflow-hidden font-sans py-12">
            <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-green-800 to-green-950 z-0" />
            <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-green-500 rounded-full blur-[120px] opacity-30 z-0 pointer-events-none" />
            <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-amber-500 rounded-full blur-[100px] opacity-20 z-0 pointer-events-none" />

            <div className="w-full max-w-md px-4 relative z-10">
                <div className="bg-white rounded-3xl shadow-2xl p-8 border border-white/20">

                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-green-700 transition-colors mb-6 group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Back to Home
                    </button>

                    <div className="flex flex-col items-center mb-7">
                        <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-green-100">
                            <span className="text-3xl">🌾</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create Account</h1>
                        <p className="text-gray-500 text-sm mt-1">Join AgriTrack — manage your crops smarter</p>
                    </div>

                    {errorMsg && (
                        <div className="mb-5 p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Full Name */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 ml-1">Full Name</label>
                            <input
                                type="text"
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                className={inputClass('name')}
                                placeholder="Juan dela Cruz"
                                maxLength={100}
                            />
                            <FieldError message={fieldErrors.name} />
                        </div>

                        {/* Email */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 ml-1">Email Address</label>
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                className={inputClass('email')}
                                placeholder="farmer@agritrack.com"
                            />
                            <FieldError message={fieldErrors.email} />
                        </div>

                        {/* Password */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 ml-1">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={form.password}
                                    onChange={handleChange}
                                    className={`${inputClass('password')} pr-10`}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <FieldError message={fieldErrors.password} />

                            {form.password.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {PASSWORD_RULES.map((rule) => (
                                        <li
                                            key={rule.label}
                                            className={`text-xs flex items-center gap-1.5 transition-colors ${rule.test(form.password) ? 'text-green-600' : 'text-gray-400'
                                                }`}
                                        >
                                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                                            {rule.label}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 ml-1">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    name="confirmPassword"
                                    value={form.confirmPassword}
                                    onChange={handleChange}
                                    className={`${inputClass('confirmPassword')} pr-10`}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <FieldError message={fieldErrors.confirmPassword} />
                        </div>

                        {/* reCAPTCHA */}
                        <div className="flex flex-col items-center py-2">
                            <div className="relative">
                                {!isFormReady && (
                                    <div
                                        className="absolute inset-0 z-10 cursor-not-allowed rounded"
                                        title="Please fill in all fields first"
                                    />
                                )}
                                <div
                                    ref={captchaRef}
                                    className={!isFormReady ? 'opacity-40 pointer-events-none select-none' : ''}
                                ></div>
                            </div>
                            {!isFormReady && (
                                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                                    🔒 Fill in all fields above to unlock CAPTCHA
                                </p>
                            )}
                            {captchaError && (
                                <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    {captchaError}
                                </p>
                            )}
                        </div>

                        {/* Submit */}
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center py-3.5 px-4 bg-green-700 hover:bg-green-800 text-white text-sm font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-green-700/20 transition-all"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Creating account…
                                    </>
                                ) : (
                                    'Create Account'
                                )}
                            </button>
                        </div>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-500">
                        Already have an account?{' '}
                        <Link to="/login" className="font-medium text-green-700 hover:text-green-800 transition-colors">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;