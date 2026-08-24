import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

const NotFound = () => {
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleGoBack = () => {
    if (token) {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 px-4">
      <div className="flex flex-col items-center max-w-md w-full text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-black/50 border border-gray-100 dark:border-gray-700">
        <div className="w-20 h-20 mb-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <h1 className="text-6xl font-extrabold text-gray-900 dark:text-gray-100 mb-2">404</h1>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Page Not Found</h2>

        <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
          The page you're looking for doesn't exist or is no longer available.
        </p>

        <button
          onClick={handleGoBack}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium rounded-lg transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5" />
          {token ? 'Back to Dashboard' : 'Back to Login'}
        </button>
      </div>
    </div>
  );
};

export default NotFound;
