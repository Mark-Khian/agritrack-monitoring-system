import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { getCurrentUser, loginUser, requestLoginChallenge } from '../services/api';
import { Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, X } from 'lucide-react';
import heroRice from '../assets/hero-rice.png';
import crmLogo from '../assets/CRM-logo.png';
import FlipOverlay from '../components/FlipOverlay';

const Landing = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeError, setChallengeError] = useState('');
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [authPhase, setAuthPhase] = useState('idle');
  const challengeRef = useRef(null);
  const challengeAnswerRef = useRef('');
  const challengeRequiredRef = useRef(false);
  const usernameRef = useRef('');
  const passwordRef = useRef('');
  // Snapshot of credentials captured at initial login; survives challenge modal remounts.
  const pendingCredentialsRef = useRef({ username: '', password: '' });
  const { login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (notice) {
      setErrorMsg(notice);
    }
  }, [notice]);

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

  const clearPendingCredentials = () => {
    pendingCredentialsRef.current = { username: '', password: '' };
  };

  const capturePendingCredentials = () => {
    const nextUsername = (usernameRef.current || username || '').trim();
    const nextPassword = passwordRef.current || password || '';
    if (nextUsername && nextPassword) {
      pendingCredentialsRef.current = {
        username: nextUsername,
        password: nextPassword,
      };
    }
    return pendingCredentialsRef.current;
  };

  const resolveCredentials = () => {
    const pending = pendingCredentialsRef.current;
    const nextUsername = (
      pending.username
      || usernameRef.current
      || username
      || ''
    ).trim();
    const nextPassword = pending.password || passwordRef.current || password || '';
    return { username: nextUsername, password: nextPassword };
  };

  const loadChallenge = async (identityUsername) => {
    const challengeUsername = (
      identityUsername
      || pendingCredentialsRef.current.username
      || usernameRef.current
      || username
      || ''
    ).trim();

    if (!challengeUsername) {
      setChallengeError('Enter your username before requesting a verification challenge.');
      setShowChallengeModal(true);
      return null;
    }
    setChallengeLoading(true);
    setChallengeError('');
    try {
      const response = await requestLoginChallenge(challengeUsername);
      const nextChallenge = {
        id: response.data.challengeId,
        prompt: response.data.prompt,
        expiresAt: response.data.expiresAt,
      };
      challengeRef.current = nextChallenge;
      challengeAnswerRef.current = '';
      setChallenge(nextChallenge);
      setChallengeAnswer('');
      setShowChallengeModal(true);
      return nextChallenge;
    } catch (error) {
      setChallengeError(error?.response?.data?.message || 'Verification is unavailable. Please try again.');
      setShowChallengeModal(true);
      return null;
    } finally {
      setChallengeLoading(false);
    }
  };

  const completeLogin = async ({ username: loginUsername, password: loginPassword, challengeId, challengeAnswer: answer }) => {
    setErrorMsg('');
    setChallengeError('');
    setAuthPhase('loading');
    setIsLoading(true);

    const payload = {
      username: loginUsername,
      password: loginPassword,
      ...(challengeId && answer != null && String(answer).length
        ? { challengeId, challengeAnswer: String(answer) }
        : {}),
    };

    try {
      const delay = new Promise((resolve) => setTimeout(resolve, 800));
      const authenticate = async () => {
        await loginUser(payload);
        return getCurrentUser();
      };
      const [meResponse] = await Promise.all([authenticate(), delay]);
      clearPendingCredentials();
      passwordRef.current = '';
      setPassword('');
      login(meResponse.data);

      setAuthPhase('success');
      const requiresPasswordChange =
        meResponse.data?.must_change_password === true
        || meResponse.data?.must_change_password === 1
        || meResponse.data?.must_change_password === '1'
        || meResponse.data?.mustChangePassword === true;
      setTimeout(
        () => navigate(requiresPasswordChange ? '/change-password' : '/dashboard'),
        2000
      );
    } catch (error) {
      setAuthPhase('idle');
      setIsLoading(false);
      const data = error?.response?.data;

      if (data?.challengeRequired) {
        challengeRequiredRef.current = true;
        setChallengeRequired(true);
        setShowChallengeModal(true);
        // Keep pending credentials; only refresh the challenge prompt.
        await loadChallenge(loginUsername);
      }

      const msg = data?.message || error.message || 'Login failed.';
      setErrorMsg(msg);
      if (challengeRequiredRef.current) {
        setShowChallengeModal(true);
        setChallengeError(msg);
      }
    }
  };

  const handleInitialLogin = async (e) => {
    e.preventDefault();
    clearNotice?.();
    const captured = capturePendingCredentials();
    if (!captured.username || !captured.password) {
      setErrorMsg('Username and password are required.');
      return;
    }

    if (challengeRequiredRef.current && !challengeAnswerRef.current.trim()) {
      setChallengeError('Complete the verification before continuing.');
      setShowChallengeModal(true);
      if (!challengeRef.current) {
        await loadChallenge(captured.username);
      }
      return;
    }

    const currentChallenge = challengeRef.current;
    await completeLogin({
      username: captured.username,
      password: captured.password,
      ...(challengeRequiredRef.current && currentChallenge
        ? {
            challengeId: currentChallenge.id,
            challengeAnswer: challengeAnswerRef.current,
          }
        : {}),
    });
  };

  const handleChallengeSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setChallengeError('');

    const credentials = resolveCredentials();
    if (!credentials.username || !credentials.password) {
      setChallengeError('Your login session expired. Close this dialog and sign in again.');
      setShowChallengeModal(true);
      return;
    }

    if (!challengeAnswerRef.current.trim()) {
      setChallengeError('Complete the verification before continuing.');
      setShowChallengeModal(true);
      if (!challengeRef.current) {
        await loadChallenge(credentials.username);
      }
      return;
    }

    const currentChallenge = challengeRef.current;
    if (!currentChallenge?.id) {
      setChallengeError('Verification expired. Get a new challenge and try again.');
      await loadChallenge(credentials.username);
      return;
    }

    await completeLogin({
      username: credentials.username,
      password: credentials.password,
      challengeId: currentChallenge.id,
      challengeAnswer: challengeAnswerRef.current,
    });
  };

  const handleCloseChallenge = () => {
    setShowChallengeModal(false);
    setChallengeError('');
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden">
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

      {/* Error Toast */}
      {errorMsg && (
        <div 
          role="alert"
          className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-40 p-4 rounded-lg bg-red-50 border border-red-200 shadow-lg flex gap-3 animate-in slide-in-from-top-2"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Local login-challenge overlay */}
      {challengeRequired && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${showChallengeModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full flex flex-col items-center relative transform transition-all duration-300 scale-100">

            <button
              type="button"
              onClick={handleCloseChallenge}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close verification"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Security Verification</h3>
            <p className="text-sm text-gray-600 text-center mb-6">Complete the verification before continuing.</p>

            <div className="flex justify-center w-full">
              {challengeLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-green-600" />
              ) : (
                <form onSubmit={handleChallengeSubmit} className="w-full">
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-center" aria-live="polite">
                    <p className="text-lg font-semibold text-gray-900 tracking-wide select-none">
                      {challenge?.prompt || 'Verification is required.'}
                    </p>
                  </div>
                  <input
                    id="challenge-answer"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="Verification answer"
                    value={challengeAnswer}
                    onChange={(e) => {
                      challengeAnswerRef.current = e.target.value;
                      setChallengeAnswer(e.target.value);
                    }}
                    disabled={isLoading}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-4 py-3 px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadChallenge()}
                    disabled={isLoading}
                    className="mt-3 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Get a new challenge
                  </button>
                </form>
              )}
            </div>

            {challengeError && (
              <p className="mt-4 text-sm text-red-600 text-center w-full bg-red-50 p-2 rounded">{challengeError}</p>
            )}

          </div>
        </div>
      )}

      {/* Admin Login Container */}
      <div className="relative z-10 min-h-[100dvh] w-full flex flex-col overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-[clamp(24px,4vh,56px)]">
        <div className="my-auto w-full flex flex-col items-center">

          {/* Logo and Title */}
          <div className="flex flex-col items-center text-center w-full mb-5 sm:mb-[clamp(20px,3vh,36px)]">
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
          <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6 sm:p-10 border border-white/20">

            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Account Login</h2>
            <p className="text-gray-600 text-sm mb-5 sm:mb-8">Enter your credentials to access the system</p>

            {/* Login Form */}
            <form onSubmit={handleInitialLogin} className="space-y-4 sm:space-y-5">

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
                  onChange={(e) => {
                    usernameRef.current = e.target.value;
                    setUsername(e.target.value);
                  }}
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
                    onChange={(e) => {
                      passwordRef.current = e.target.value;
                      setPassword(e.target.value);
                    }}
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
            <div className="mt-5 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                This is a secure portal. Unauthorized access attempts are logged.
              </p>
            </div>

          </div>

        </div>{/* End my-auto wrapper */}
      </div>
    </div>
  );
};

export default Landing;
