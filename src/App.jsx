import { Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './context/useAuth';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Plantings from './pages/Plantings';
import Activities from './pages/Activities';
import Harvests from './pages/Harvests';
import Analytics from './pages/Analytics';
import Calendar from './pages/Calendar';
import Accounts from './pages/Accounts';
import ChangePassword from './pages/ChangePassword';
import NotFound from './pages/NotFound';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { CAPABILITIES } from './security/permissions';

const ProtectedRoute = ({ capability, children }) => {
  const { status, can, mustChangePassword } = useAuth();
  if (status !== 'authenticated') return <Navigate to="/" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  return can(capability) ? children : <Navigate to="/dashboard" replace />;
};

const ChangePasswordRoute = () => {
  const { status, mustChangePassword } = useAuth();
  if (status !== 'authenticated') return <Navigate to="/" replace />;
  if (!mustChangePassword) return <Navigate to="/dashboard" replace />;
  return <ChangePassword />;
};

const SessionUnavailable = ({ onRetry }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div
      role="alert"
      className="max-w-sm w-full p-4 rounded-lg bg-red-50 border border-red-200 shadow-lg flex gap-3"
    >
      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-red-700">
          The server is temporarily unavailable. Your session has not been cleared.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  </div>
);

function App() {
  const { status, mustChangePassword, retrySessionCheck } = useAuth();

  if (status === 'checking') return null;
  if (status === 'unavailable') {
    return <SessionUnavailable onRetry={retrySessionCheck} />;
  }

  return (
    <Routes>
      {/* Admin Login Landing Page */}
      <Route
        path="/"
        element={
          status === 'authenticated'
            ? <Navigate to={mustChangePassword ? '/change-password' : '/dashboard'} replace />
            : <Landing />
        }
      />
      <Route path="/change-password" element={<ChangePasswordRoute />} />

      {/* Protected Routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute capability={CAPABILITIES.DASHBOARD_READ}>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/plantings" element={
        <ProtectedRoute capability={CAPABILITIES.PLANTING_READ}>
          <Layout>
            <Plantings />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/activities" element={
        <ProtectedRoute capability={CAPABILITIES.ACTIVITY_READ}>
          <Layout>
            <Activities />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/harvests" element={
        <ProtectedRoute capability={CAPABILITIES.HARVEST_READ}>
          <Layout>
            <Harvests />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute capability={CAPABILITIES.ANALYTICS_READ}>
          <Layout>
            <Analytics />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/calendar" element={
        <ProtectedRoute capability={CAPABILITIES.CALENDAR_READ}>
          <Layout>
            <Calendar />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/accounts" element={
        <ProtectedRoute capability={CAPABILITIES.ACCOUNT_MANAGE}>
          <Layout>
            <Accounts />
          </Layout>
        </ProtectedRoute>
      } />

      {/* Fallback - redirect unknown routes to home */}
      <Route
        path="*"
        element={
          status === 'authenticated' && mustChangePassword
            ? <Navigate to="/change-password" replace />
            : <NotFound />
        }
      />
    </Routes>
  );
}

export default App;