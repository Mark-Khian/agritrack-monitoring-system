import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import crmLogo from '../assets/CRM-logo.png';
import useAuth from '../context/useAuth';
import {
  changePassword,
  getCurrentUser,
  logoutUser,
} from '../services/api';

const PasswordInput = ({ id, label, value, onChange, visible, onToggle, disabled }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-gray-900 mb-2">
      {label}
    </label>
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete={id === 'current-password' ? 'current-password' : 'new-password'}
        className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all disabled:opacity-50"
        required
      />
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
        aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      >
        {visible ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  </div>
);

const ChangePassword = () => {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [visible, setVisible] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setError('Your new password must be different from the temporary password.');
      return;
    }

    setSaving(true);
    try {
      await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      const response = await getCurrentUser();
      login(response.data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/', { replace: true });
        return;
      }
      const validationErrors = err.response?.data?.errors;
      setError(
        validationErrors?.[0]?.message
        || err.response?.data?.message
        || 'Unable to change your password. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setError('');
    setLoggingOut(true);
    try {
      await logoutUser();
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/', { replace: true });
      } else {
        setError('Unable to log out right now. Please try again.');
      }
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gray-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={crmLogo} alt="AgriTrack CRM Logo" className="w-20 h-20 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Secure your account</h1>
          <p className="text-sm text-gray-500 mt-1">
            Change the temporary password before continuing to AgriTrack.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Your access is limited to this page until your password is changed.
            </p>
          </div>

          {error && (
            <div role="alert" className="flex gap-3 rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              id="current-password"
              label="Current temporary password"
              value={form.currentPassword}
              onChange={updateField('currentPassword')}
              visible={visible.current}
              onToggle={() => setVisible((state) => ({ ...state, current: !state.current }))}
              disabled={saving || loggingOut}
            />
            <PasswordInput
              id="new-password"
              label="New password"
              value={form.newPassword}
              onChange={updateField('newPassword')}
              visible={visible.new}
              onToggle={() => setVisible((state) => ({ ...state, new: !state.new }))}
              disabled={saving || loggingOut}
            />
            <PasswordInput
              id="confirm-password"
              label="Confirm new password"
              value={form.confirmPassword}
              onChange={updateField('confirmPassword')}
              visible={visible.confirm}
              onToggle={() => setVisible((state) => ({ ...state, confirm: !state.confirm }))}
              disabled={saving || loggingOut}
            />

            <p className="text-xs text-gray-500">
              Use uppercase and lowercase letters, a number, and a symbol.
            </p>

            <button
              type="submit"
              disabled={saving || loggingOut}
              className="w-full py-3 px-4 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={18} className="animate-spin" />}
              {saving ? 'Changing password...' : 'Change password'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleLogout}
            disabled={saving || loggingOut}
            className="w-full mt-3 py-2.5 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loggingOut ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />}
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
