import { Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './context/useAuth';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Plantings from './pages/Plantings';
import Activities from './pages/Activities';
import Harvests from './pages/Harvests';
import Analytics from './pages/Analytics';

const ProtectedRoute = ({ children }) => {
  const { token, isInitializing } = useAuth();
  if (isInitializing) return null;
  return token ? children : <Navigate to="/" />;
};

function App() {
  return (
    <Routes>
      {/* Admin Login Landing Page */}
      <Route path="/" element={<Landing />} />

      {/* Protected Routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/plantings" element={
        <ProtectedRoute>
          <Layout>
            <Plantings />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/activities" element={
        <ProtectedRoute>
          <Layout>
            <Activities />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/harvests" element={
        <ProtectedRoute>
          <Layout>
            <Harvests />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute>
          <Layout>
            <Analytics />
          </Layout>
        </ProtectedRoute>
      } />

      {/* Fallback - redirect unknown routes to home */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;