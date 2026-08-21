import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { loginUser } from '../services/api';
import { Eye, EyeOff, AlertCircle, Wheat, CheckCircle2, Loader2 } from 'lucide-react';
import heroRice from '../assets/hero-rice.png';
import crmLogo from '../assets/CRM-logo.png';
import FlipOverlay from '../components/FlipOverlay';

const Landing = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [authPhase, setAuthPhase] = useState('idle');
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

    setAuthPhase('loading');
    setIsLoading(true);
    try {
      const delay = new Promise(resolve => setTimeout(resolve, 800));
      const [res] = await Promise.all([
        loginUser({
          username,
          password,
          captchaToken: captchaRequired ? captchaToken : undefined
        }),
        delay
      ]);
      login(res.data.user, res.data.token, res.data.refreshToken);

      // Show success screen then redirect
      setAuthPhase('success');
      setTimeout(() => navigate('/dashboard'), 2000);

    } catch (error) {
      setAuthPhase('idle');
      const data = error?.response?.data;
      if (data?.captchaRequired) setCaptchaRequired(true);
      const msg = data?.message || error.message || 'Login failed.';
      setErrorMsg(msg);
      if (window.grecaptcha && captchaRendered.current) window.grecaptcha.reset();
      setCaptchaToken('');
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
      {authPhase !== 'idle' && (
        <FlipOverlay 
          isPending={authPhase === 'loading'} 
          isSuccess={authPhase === 'success'} 
          title="Login successful" 
          subtitle="Redirecting to dashboard..." 
        />
      )}

      {/* Admin Login Container */}
      <div className="relative z-10 min-h-[100dvh] w-full flex flex-col overflow-y-auto px-4 sm:px-6 lg:px-8 py-[clamp(24px,4vh,56px)]">
        <div className="my-auto w-full flex flex-col items-center">

        {/* Logo and Title */}
          <div className="flex flex-col items-center text-center w-full mb-[clamp(20px,3vh,36px)]">
            <img 
              src={crmLogo} 
              alt="AgriTrack CRM Logo" 
              className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] lg:w-[96px] lg:h-[96px] object-contain mb-1 drop-shadow-xl"
            />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight text-center max-w-[260px] sm:max-w-[300px] lg:max-w-[340px] mx-auto leading-tight">
              Rice Crop Record Management
            </h1>
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

        </div>{/* End my-auto wrapper */}
      </div>
    </div>
  );
};

export default Landing;
