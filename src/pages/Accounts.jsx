import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import Select from '../components/Select';
import { SkeletonCard, SkeletonTable } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import {
  archiveUser,
  createUser,
  disableUser,
  getUsers,
  reactivateUser,
  resetUserPassword,
  revokeUserSessions,
} from '../services/api';

const ROLE_OPTIONS = [
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'FARM_WORKER', label: 'Farm Worker' },
];

const EMPTY_CREATE_FORM = {
  name: '',
  username: '',
  role: 'SECRETARY',
  password: '',
  confirmPassword: '',
};

const EMPTY_PASSWORD_FORM = { password: '', confirmPassword: '' };

const roleLabel = (role) => (
  role === 'FARM_WORKER' ? 'Farm Worker' : role === 'SECRETARY' ? 'Secretary' : role
);

const isActiveAccount = (account) => {
  if (account.is_active !== undefined && account.is_active !== null) {
    return account.is_active === true || account.is_active === 1 || account.is_active === '1';
  }
  return String(account.status || '').toUpperCase() === 'ACTIVE';
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const responsePayload = (response) => response?.data?.data ?? response?.data ?? {};

const utf8ByteLength = (value) => new TextEncoder().encode(value).length;

const validateChosenPassword = (password, confirmPassword) => {
  if (!password) return 'Password is required.';
  if (utf8ByteLength(password) > 72) return 'Password must not exceed 72 UTF-8 bytes.';
  if (password !== confirmPassword) return 'New password and confirmation do not match.';
  return '';
};

const accountName = (account) => (
  account.name || account.display_name || account.full_name || account.username
);

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [passwordAction, setPasswordAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [form, setForm] = useState(EMPTY_CREATE_FORM);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const toast = useToast();

  const fetchAccounts = useCallback(async () => {
    try {
      setError('');
      const response = await getUsers();
      const payload = responsePayload(response);
      const users = Array.isArray(payload) ? payload : payload.users || payload.accounts || [];
      setAccounts(users);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const openCreate = () => {
    setForm(EMPTY_CREATE_FORM);
    setFormError('');
    setCreateOpen(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const clientError = validateChosenPassword(form.password, form.confirmPassword);
    if (clientError) {
      setFormError(clientError);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createUser({
        name: form.name,
        username: form.username,
        role: form.role,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      setCreateOpen(false);
      await fetchAccounts();
      toast.success('Account created successfully.');
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      setFormError(
        apiErrors?.[0]?.message
        || err.response?.data?.message
        || 'Failed to create account.'
      );
    } finally {
      setSaving(false);
    }
  };

  const runConfirmedAction = async () => {
    if (!pendingAction) return;
    const { type, account } = pendingAction;
    setSaving(true);
    try {
      if (type === 'disable') await disableUser(account.id);
      if (type === 'revoke') await revokeUserSessions(account.id);
      if (type === 'delete') await archiveUser(account.id);
      await fetchAccounts();
      const messages = {
        disable: 'Account disabled and existing sessions revoked.',
        revoke: 'All account sessions revoked.',
        delete: 'Account removed from the Accounts list.',
      };
      toast.success(messages[type]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'The account action could not be completed.');
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  };

  const openPasswordAction = (type, account) => {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordError('');
    setPasswordAction({ type, account });
  };

  const handlePasswordAction = async (event) => {
    event.preventDefault();
    if (!passwordAction) return;
    const clientError = validateChosenPassword(passwordForm.password, passwordForm.confirmPassword);
    if (clientError) {
      setPasswordError(clientError);
      return;
    }
    setSaving(true);
    setPasswordError('');
    try {
      const payload = {
        password: passwordForm.password,
        confirmPassword: passwordForm.confirmPassword,
      };
      if (passwordAction.type === 'reset') {
        await resetUserPassword(passwordAction.account.id, payload);
        toast.success('Password updated and existing sessions revoked.');
      } else {
        await reactivateUser(passwordAction.account.id, payload);
        toast.success('Account reactivated with the new password.');
      }
      setPasswordAction(null);
      await fetchAccounts();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      setPasswordError(
        apiErrors?.[0]?.message
        || err.response?.data?.message
        || 'The account action could not be completed.'
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmContent = {
    disable: {
      title: 'Disable Account',
      message: `Disable ${pendingAction?.account.username}? The user will be signed out and unable to log in.`,
      confirmText: 'Disable',
      confirmColor: 'bg-red-600 hover:bg-red-700 text-white',
    },
    revoke: {
      title: 'Revoke Sessions',
      message: `Sign ${pendingAction?.account.username} out of every active session? Their password will not change.`,
      confirmText: 'Revoke Sessions',
      confirmColor: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    delete: {
      title: 'Delete Account?',
      message: 'This account will be removed from the Accounts list and will no longer be usable. Historical records and audit logs will be retained.',
      confirmText: 'Delete Account',
      confirmColor: 'bg-red-600 hover:bg-red-700 text-white',
    },
  };
  const currentConfirm = pendingAction ? confirmContent[pendingAction.type] : null;

  const Actions = ({ account }) => {
    const active = isActiveAccount(account);
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {active ? (
          <>
            <button
              type="button"
              onClick={() => openPasswordAction('reset', account)}
              disabled={saving}
              className="p-2 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-700 disabled:opacity-50"
              title="Reset password"
              aria-label={`Reset password for ${account.username}`}
            >
              <KeyRound size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPendingAction({ type: 'revoke', account })}
              disabled={saving}
              className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-700 disabled:opacity-50"
              title="Revoke sessions"
              aria-label={`Revoke sessions for ${account.username}`}
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPendingAction({ type: 'disable', account })}
              disabled={saving}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-50"
              title="Disable account"
              aria-label={`Disable ${account.username}`}
            >
              <Ban size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openPasswordAction('reactivate', account)}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 hover:bg-green-100 text-sm font-medium text-green-700 disabled:opacity-50"
            >
              <UserCheck size={16} /> Reactivate
            </button>
            <button
              type="button"
              onClick={() => setPendingAction({ type: 'delete', account })}
              disabled={saving}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-50"
              title="Delete account"
              aria-label={`Delete ${account.username}`}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    );
  };

  const PasswordFields = ({ idPrefix, values, onChange, disabled }) => (
    <>
      <div>
        <label htmlFor={`${idPrefix}-password`} className="text-sm font-medium text-gray-700 mb-1 block">
          Password *
        </label>
        <input
          id={`${idPrefix}-password`}
          type="password"
          value={values.password}
          onChange={(event) => onChange({ ...values, password: event.target.value })}
          disabled={disabled}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-confirm`} className="text-sm font-medium text-gray-700 mb-1 block">
          Confirm Password *
        </label>
        <input
          id={`${idPrefix}-confirm`}
          type="password"
          value={values.confirmPassword}
          onChange={(event) => onChange({ ...values, confirmPassword: event.target.value })}
          disabled={disabled}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          required
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Accounts</h1>
          <p className="text-sm text-gray-500">Manage Secretary and Farm Worker access</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-700 hover:bg-green-600 text-white"
        >
          <Plus size={16} /> Create Account
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button type="button" onClick={fetchAccounts} className="underline font-medium">Retry</button>
        </div>
      )}

      {loading ? (
        <>
          <div className="md:hidden space-y-3">
            {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} lines={4} />)}
          </div>
          <div className="hidden md:block">
            <SkeletonTable
              rows={5}
              cols={6}
              columnHeaders={['Name', 'Username', 'Role', 'Status', 'Created', 'Actions']}
            />
          </div>
        </>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-16 text-center">
          <Users size={40} className="text-gray-200 mx-auto" />
          <p className="text-gray-400 text-sm font-medium mt-3">No subordinate accounts yet.</p>
          <p className="text-gray-300 text-xs mt-1">Create a Secretary or Farm Worker account.</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 wrap-break-word">{accountName(account)}</p>
                    <p className="text-xs text-gray-500 break-all">{account.username}</p>
                  </div>
                  <Badge status={isActiveAccount(account) ? 'active' : 'inactive'} />
                </div>
                <div className="mt-3 border-t border-gray-100 pt-3 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-500">Role</span>
                    <span className="font-medium text-gray-800">{roleLabel(account.role)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-500">Created</span>
                    <span className="text-xs text-gray-700 text-right">{formatTimestamp(account.created_at)}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <Actions account={account} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-225">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Username</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Created</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{accountName(account)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{account.username}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{roleLabel(account.role)}</td>
                      <td className="px-6 py-4">
                        <Badge status={isActiveAccount(account) ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        <div className="font-medium text-gray-600">Created</div>
                        <div className="mt-0.5">{formatTimestamp(account.created_at)}</div>
                      </td>
                      <td className="px-6 py-4"><Actions account={account} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Account">
        <form onSubmit={handleCreate} className="space-y-4 pb-8">
          {formError && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {formError}
            </div>
          )}
          <div>
            <label htmlFor="account-name" className="text-sm font-medium text-gray-700 mb-1 block">
              Display Name *
            </label>
            <input
              id="account-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              disabled={saving}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="account-username" className="text-sm font-medium text-gray-700 mb-1 block">
              Username *
            </label>
            <input
              id="account-username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              disabled={saving}
              autoComplete="off"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div className="pb-6">
            <label htmlFor="account-role" className="text-sm font-medium text-gray-700 mb-1 block">
              Role *
            </label>
            <Select
              id="account-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              options={ROLE_OPTIONS}
              disabled={saving}
              required
            />
          </div>
          <PasswordFields
            idPrefix="account-create"
            values={form}
            onChange={setForm}
            disabled={saving}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(passwordAction)}
        onClose={() => !saving && setPasswordAction(null)}
        title={passwordAction?.type === 'reactivate' ? 'Reactivate Account' : 'Reset Password'}
      >
        {passwordAction && (
          <form onSubmit={handlePasswordAction} className="space-y-4">
            {passwordError && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {passwordError}
              </div>
            )}
            <p className="text-sm text-gray-600">
              {passwordAction.type === 'reactivate'
                ? `Set a new password to reactivate ${passwordAction.account.username}. Old sessions remain revoked.`
                : `Set a new password for ${passwordAction.account.username}. All existing sessions will be revoked.`}
            </p>
            <PasswordFields
              idPrefix="account-set"
              values={passwordForm}
              onChange={setPasswordForm}
              disabled={saving}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPasswordAction(null)}
                disabled={saving}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving
                  ? (passwordAction.type === 'reactivate' ? 'Reactivating...' : 'Saving...')
                  : (passwordAction.type === 'reactivate' ? 'Reactivate' : 'Reset Password')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(currentConfirm)}
        onClose={() => setPendingAction(null)}
        onConfirm={runConfirmedAction}
        title={currentConfirm?.title || ''}
        message={currentConfirm?.message || ''}
        confirmText={currentConfirm?.confirmText}
        confirmColor={currentConfirm?.confirmColor}
      />
    </div>
  );
};

export default Accounts;
