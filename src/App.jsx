import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Farms from './pages/Farms';
import Fields from './pages/Fields';
import Plantings from './pages/Plantings';
import Activities from './pages/Activities';
import Harvests from './pages/Harvests';
import Analytics from './pages/Analytics';

const ProtectedRoute = ({ children }) => {
  const { token, isInitializing } = useAuth();
  if (isInitializing) return null;
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected Routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout title="Dashboard">
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/farms" element={
        <ProtectedRoute>
          <Layout title="Farms Management">
            <Farms />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/fields" element={
        <ProtectedRoute>
          <Layout title="Fields Management">
            <Fields />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/plantings" element={
        <ProtectedRoute>
          <Layout title="Crop Plantings">
            <Plantings />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/activities" element={
        <ProtectedRoute>
          <Layout title="Farm Activities">
            <Activities />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/harvests" element={
        <ProtectedRoute>
          <Layout title="Harvest Records">
            <Harvests />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute>
          <Layout title="Analytics">
            <Analytics />
          </Layout>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;