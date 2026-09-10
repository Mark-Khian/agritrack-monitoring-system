import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Clipboard,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  ShieldAlert,
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

const getTemporaryCredentials = (response, fallbackUsername) => {
  const payload = responsePayload(response);
  const user = payload.user || payload.account || response?.data?.user || {};
  const temporaryPassword =
    payload.temporaryPassword
    || payload.temporary_password
    || response?.data?.temporaryPassword
    || response?.data?.temporary_password;

  return temporaryPassword
    ? { username: user.username || fallbackUsername, temporaryPassword }
    : null;
};

const accountName = (account) => (
  account.name || account.display_name || account.full_name || account.username
);

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ name: '', username: '', role: 'SECRETARY' });
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
    setForm({ name: '', username: '', role: 'SECRETARY' });
    setFormError('');
    setCreateOpen(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const response = await createUser(form);
      const oneTimeCredentials = getTemporaryCredentials(response, form.username);
      setCreateOpen(false);
      await fetchAccounts();
      setCredentials(oneTimeCredentials);
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
      let response;
      if (type === 'reset') response = await resetUserPassword(account.id);
      if (type === 'disable') response = await disableUser(account.id);
      if (type === 'reactivate') response = await reactivateUser(account.id);
      if (type === 'revoke') response = await revokeUserSessions(account.id);

      if (type === 'reset' || type === 'reactivate') {
        setCredentials(getTemporaryCredentials(response, account.username));
      }
      await fetchAccounts();
      const messages = {
        reset: 'Password reset and existing sessions revoked.',
        disable: 'Account disabled and existing sessions revoked.',
        reactivate: 'Account reactivated with a new temporary password.',
        revoke: 'All account sessions revoked.',
      };
      toast.success(messages[type]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'The account action could not be completed.');
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  };

  const closeCredentials = () => setCredentials(null);

  const copyCredential = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const confirmContent = {
    reset: {
      title: 'Reset Password',
      message: `Issue a new temporary password for ${pendingAction?.account.username}? All existing sessions will be revoked.`,
      confirmText: 'Reset Password',
      confirmColor: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    disable: {
      title: 'Disable Account',
      message: `Disable ${pendingAction?.account.username}? The user will be signed out and unable to log in.`,
      confirmText: 'Disable',
      confirmColor: 'bg-red-600 hover:bg-red-700 text-white',
    },
    reactivate: {
      title: 'Reactivate Account',
      message: `Reactivate ${pendingAction?.account.username} with a new temporary password? Old sessions will remain revoked.`,
      confirmText: 'Reactivate',
      confirmColor: 'bg-green-700 hover:bg-green-600 text-white',
    },
    revoke: {
      title: 'Revoke Sessions',
      message: `Sign ${pendingAction?.account.username} out of every active session? Their password will not change.`,
      confirmText: 'Revoke Sessions',
      confirmColor: 'bg-amber-600 hover:bg-amber-700 text-white',
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
              onClick={() => setPendingAction({ type: 'reset', account })}
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
          <button
            type="button"
            onClick={() => setPendingAction({ type: 'reactivate', account })}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 hover:bg-green-100 text-sm font-medium text-green-700 disabled:opacity-50"
          >
            <UserCheck size={16} /> Reactivate
          </button>
        )}
      </div>
    );
  };

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
              columnHeaders={['Name', 'Username', 'Role', 'Status', 'Timestamps', 'Actions']}
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
                    <p className="text-xs text-gray-500 break-all">@{account.username}</p>
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
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-500">Last login</span>
                    <span className="text-xs text-gray-700 text-right">{formatTimestamp(account.last_login_at)}</span>
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
                    <th className="px-6 py-3">Timestamps</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{accountName(account)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">@{account.username}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{roleLabel(account.role)}</td>
                      <td className="px-6 py-4">
                        <Badge status={isActiveAccount(account) ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        <div>Created: {formatTimestamp(account.created_at)}</div>
                        <div className="mt-1">Last login: {formatTimestamp(account.last_login_at)}</div>
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
        <form onSubmit={handleCreate} className="space-y-4">
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
          <div>
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
        isOpen={Boolean(credentials)}
        onClose={closeCredentials}
        title="One-Time Credentials"
        maxWidth="max-w-lg"
      >
        {credentials && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Copy and share these credentials securely now. The temporary password is shown only
                once and cannot be retrieved after this window is closed.
              </p>
            </div>
            <div className="space-y-3">
              {[
                ['Username', credentials.username],
                ['Temporary password', credentials.temporaryPassword],
              ].map(([label, value]) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {label}
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 px-3 py-2.5 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-900 break-all">
                      {value}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyCredential(value, label)}
                      className="shrink-0 p-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600"
                      aria-label={`Copy ${label.toLowerCase()}`}
                    >
                      <Clipboard size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={closeCredentials}
              className="w-full py-2.5 px-4 rounded-lg bg-green-700 hover:bg-green-600 text-white font-semibold"
            >
              I have saved these credentials
            </button>
          </div>
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
