import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import Select from '../components/Select';
import { SkeletonCard, SkeletonTable } from '../components/Skeleton';
import { getAuditLogs } from '../services/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
];

const actorRoleLabel = (role) => {
  if (!role) return 'Not Recorded';
  if (role === 'ADMIN') return 'Admin';
  if (role === 'SECRETARY') return 'Secretary';
  if (role === 'FARM_WORKER') return 'Farm Worker';
  return String(role);
};

const actionLabel = (action) => {
  if (!action) return '—';

  const normalized = String(action).toUpperCase();

  if (normalized === 'LOGIN_SUCCESS' || normalized === 'LOGIN_FAILED') {
    return 'Login';
  }

  return normalized
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [status, setStatus] = useState('');
  const [action, setAction] = useState('');
  const [actionDraft, setActionDraft] = useState('');
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [pendingRemoveId, setPendingRemoveId] = useState(null);

  const pageCount = Math.max(1, Math.ceil(total / limit) || 1);
  const visibleLogs = useMemo(
    () => logs.filter((log) => !hiddenIds.has(log.id)),
    [logs, hiddenIds]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAuditLogs({
        page,
        limit,
        ...(status ? { status } : {}),
        ...(action ? { action } : {}),
      });
      const payload = response.data || {};
      setLogs(Array.isArray(payload.logs) ? payload.logs : []);
      setTotal(Number(payload.total) || 0);
      setLimit(Number(payload.limit) || 25);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load audit logs.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, action]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const applyActionFilter = (event) => {
    event.preventDefault();
    setPage(1);
    setAction(actionDraft.trim().replace(/\s+/g, '_').toUpperCase());
  };

  const hidePendingLog = () => {
    if (pendingRemoveId == null) return;
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(pendingRemoveId);
      return next;
    });
  };

  const columns = [
    { key: 'timestamp', label: 'Timestamp', headerClass: 'w-[16%]', cellClass: 'text-xs text-gray-600 whitespace-nowrap' },
    { key: 'role', label: 'Role', headerClass: 'w-[11%]', cellClass: 'text-sm text-gray-700' },
    { key: 'action', label: 'Action', headerClass: 'w-[18%]', cellClass: 'text-sm font-medium text-gray-900 break-all' },
    { key: 'entity', label: 'Entity', headerClass: 'w-[12%]', cellClass: 'text-sm text-gray-700' },
    { key: 'entityId', label: 'Entity ID', headerClass: 'w-[9%]', cellClass: 'text-sm text-gray-700' },
    { key: 'ip', label: 'IP', headerClass: 'w-[12%]', cellClass: 'text-xs text-gray-600' },
    { key: 'status', label: 'Status', headerClass: 'w-[10%]', cellClass: '' },
    { key: 'actions', label: '', headerClass: 'w-[12%]', cellClass: 'text-right' },
  ];

  const RemoveButton = ({ log }) => (
    <button
      type="button"
      onClick={() => setPendingRemoveId(log.id)}
      className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-600 hover:!text-white dark:hover:bg-red-600 transition-colors"
    >
      Remove
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Audit Log</h1>
          <p className="text-sm text-gray-500">Read-only record of authenticated actions and security events</p>
        </div>
      </div>

      <form onSubmit={applyActionFilter} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-gray-600">
          Action
          <input
            type="text"
            value={actionDraft}
            onChange={(event) => setActionDraft(event.target.value)}
            placeholder="Search action"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
          />
        </label>
        <div className="sm:w-48">
          <span className="text-sm text-gray-600">Status</span>
          <div className="mt-1">
            <Select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>
        <button
          type="submit"
          className="min-h-11 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-700 hover:bg-green-600 text-white"
        >
          Filter
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button type="button" onClick={fetchLogs} className="underline font-medium">Retry</button>
        </div>
      )}

      {loading ? (
        <>
          <div className="md:hidden space-y-3">
            {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} lines={4} />)}
          </div>
          <div className="hidden md:block">
            <SkeletonTable rows={6} cols={8} columnHeaders={columns.map((column) => column.label)} />
          </div>
        </>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-16 text-center">
          <ScrollText size={40} className="text-gray-200 mx-auto" />
          <p className="text-gray-400 text-sm font-medium mt-3">No audit events match these filters.</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {visibleLogs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 break-all">{actionLabel(log.action)}</p>
                    <p className="text-xs text-gray-500">{formatTimestamp(log.created_at)}</p>
                  </div>
                  <Badge status={log.status} />
                </div>
                <div className="mt-3 border-t border-gray-100 pt-3 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-500">Role</span>
                    <span className="font-medium text-gray-800">{actorRoleLabel(log.actor_role)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-500">Entity</span>
                    <span className="text-gray-800">{log.entity || '—'}{log.entity_id != null ? ` #${log.entity_id}` : ''}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-500">IP</span>
                    <span className="text-xs text-gray-700">{log.ip_address || '—'}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <RemoveButton log={log} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse min-w-210">
                <thead>
                  <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {columns.map((column) => (
                      <th key={column.key} className={`px-6 py-3 ${column.key === 'actions' ? 'text-right' : ''} ${column.headerClass}`}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className={`px-6 py-4 ${columns[0].cellClass}`}>{formatTimestamp(log.created_at)}</td>
                      <td className={`px-6 py-4 ${columns[1].cellClass}`}>{actorRoleLabel(log.actor_role)}</td>
                      <td className={`px-6 py-4 ${columns[2].cellClass}`}>{actionLabel(log.action)}</td>
                      <td className={`px-6 py-4 ${columns[3].cellClass}`}>{log.entity || '—'}</td>
                      <td className={`px-6 py-4 ${columns[4].cellClass}`}>{log.entity_id ?? '—'}</td>
                      <td className={`px-6 py-4 ${columns[5].cellClass}`}>{log.ip_address || '—'}</td>
                      <td className={`px-6 py-4 ${columns[6].cellClass}`}><Badge status={log.status} /></td>
                      <td className={`px-6 py-4 ${columns[7].cellClass}`}>
                        <RemoveButton log={log} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Page {page} of {pageCount} · {total} event{total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 disabled:opacity-40"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={pendingRemoveId != null}
        onClose={() => setPendingRemoveId(null)}
        onConfirm={hidePendingLog}
        title="Remove"
        message="Remove this log from the current view?"
        confirmText="Remove"
        confirmColor="bg-red-600 hover:bg-red-700 text-white"
      />
    </div>
  );
};

export default AuditLog;
