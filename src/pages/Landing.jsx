import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { loginUser } from '../services/api';
import { Eye, EyeOff, AlertCircle, Wheat, CheckCircle2, Loader2 } from 'lucide-react';
import heroRice from '../assets/hero-rice.png';

const Landing = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const captchaRef = useRef(null);
  const captchaRendered = useRef(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Temporarily disable dark mode and hide scrollbars while viewing the login page
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const hadDark = root.classList.contains('dark');
    if (hadDark) {
      root.classList.remove('dark');
    }

    const originalHtmlOverflow = root.style.overflow;
    const originalBodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      root.style.overflow = originalHtmlOverflow;
      body.style.overflow = originalBodyOverflow;
      // Restore dark mode when redirecting to main application if user preferred it
      if (localStorage.getItem('theme') === 'dark') {
        root.classList.add('dark');
      }
    };
  }, []);

  // Render reCAPTCHA when required
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
        username,
        password,
        captchaToken: captchaRequired ? captchaToken : undefined
      });
      login(res.data.user, res.data.token, res.data.refreshToken);

      // Show success screen then redirect
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

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Full-screen background image */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 blur-[8px]"
        style={{ backgroundImage: `url(${heroRice})` }}
        aria-hidden="true"
      />

      {/* Dark overlay for readability and glassmorphic blur */}
      <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/40 to-black/50 backdrop-blur-[4px]" />

      {/* Success Screen Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40 animate-bounce">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Login successful</h2>
              <p className="text-green-200 text-sm">Redirecting to dashboard...</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Login Container */}
      <div className="relative z-10 min-h-screen w-full flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16">

        {/* Logo and Title */}
        <div className="mb-8 sm:mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Wheat className="w-8 h-8 sm:w-10 sm:h-10 text-green-300" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
              Rice Crop Monitoring
            </h1>
          </div>
          <p className="text-green-100 text-xs sm:text-sm md:text-base mt-2">Admin Portal</p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 sm:p-10 border border-white/20">

          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Admin Login</h2>
          <p className="text-gray-600 text-sm mb-8">Enter your credentials to access the system</p>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Username Input */}
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-gray-900 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                required
              />
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-900 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* CAPTCHA */}
            {captchaRequired && (
              <div>
                <div ref={captchaRef} className="flex justify-center" />
                {captchaError && (
                  <p className="mt-2 text-sm text-red-600">{captchaError}</p>
                )}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>


          </form>

          {/* Footer note */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-600 text-center">
              This is a secure admin-only portal. Unauthorized access attempts are logged.
            </p>
          </div>

        </div>

        {/* System Info */}
        <p className="mt-8 sm:mt-12 text-green-100 text-xs sm:text-sm text-center max-w-md">
          Rice Crop Monitoring System Single-Beneficiary Farm Management
        </p>

      </div>
    </div>
  );
};

export default Landing;
