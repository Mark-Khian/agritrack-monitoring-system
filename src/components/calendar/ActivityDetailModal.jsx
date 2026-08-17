import React, { useState } from 'react';
import {
  updateActivity,
  deleteActivity
} from '../../services/api';
import {
  getActivityColor,
  getActivityIcon,
  formatActivityName
} from '../../utils/calendarUtils';
import {
  X, CheckCircle2, XCircle, Edit3, Trash2, Clock,
  MapPin, Sprout, FileText, AlertTriangle, Save, Loader2
} from 'lucide-react';
import Select from '../Select';

const ActivityDetailModal = ({
  activity,
  onClose,
  onActivityUpdated
}) => {
  if (!activity) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

    const statusStr = activity.status ? String(activity.status).toLowerCase() : 'pending';
    const [formData, setFormData] = useState({
      activity_name: activity.activity_name || activity.activity_type || '',
      scheduled_date: activity.planned_date || activity.scheduled_date || activity.activity_date || '',
      scheduled_time: activity.scheduled_time || '',
      status: statusStr,
      notes: activity.notes || ''
    });
  
    const isTerminal = ['completed', 'cancelled', 'skipped'].includes(statusStr);

  const style = getActivityColor({ ...activity, status: formData.status });
  const icon = getActivityIcon(activity.activity_type || activity.activity_name, 20);

  const extractError = (err, defaultMsg) => {
    let msg = err.response?.data?.message || err.message || defaultMsg;
    if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
      const details = err.response.data.errors.map(e => `${e.field || 'Field'}: ${e.message}`).join(' | ');
      if (details) msg += ` (${details})`;
    }
    return msg;
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      const actId = activity.id || activity.activity_id;
      const res = await updateActivity(actId, { status: 'completed' });
      onActivityUpdated(res.data?.data || { ...activity, status: 'completed' });
      onClose();
    } catch (err) {
      setError(extractError(err, 'Failed to complete activity'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelActivity = async () => {
    setLoading(true);
    setError(null);
    try {
      const actId = activity.id || activity.activity_id;
      const res = await updateActivity(actId, { status: 'cancelled' });
      onActivityUpdated(res.data?.data || { ...activity, status: 'cancelled' });
      onClose();
    } catch (err) {
      setError(extractError(err, 'Failed to cancel activity'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const actId = activity.id || activity.activity_id;
      const res = await updateActivity(actId, {
        activity_name: formData.activity_name,
        planned_date: formData.scheduled_date || activity.planned_date || null,
        actual_date: activity.actual_date || null,
        scheduled_time: formData.scheduled_time,
        status: formData.status,
        notes: formData.notes
      });
      onActivityUpdated(res.data?.data || { ...activity, ...formData });
      setIsEditing(false);
    } catch (err) {
      setError(extractError(err, 'Failed to update activity'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      
      <div
        className="relative w-full max-w-lg bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp text-gray-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Banner */}
        <div className={`p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4 ${style.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl bg-white/90 dark:bg-slate-900/80 ${style.text} shadow-sm border ${style.border}`}>
              {icon}
            </div>
            <div>
              <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${style.badge}`}>
                {style.label}
              </span>
              <h3 className="text-xl font-bold tracking-tight mt-1">
                {formatActivityName(activity.title || activity.activity_name || activity.activity_type)}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 dark:bg-rose-500/20 dark:border-rose-500/40 rounded-xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle size={16} className="shrink-0 text-rose-500 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
          
          {isEditing ? (
            <form id="edit-activity-form" onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Activity Name</label>
                <input
                  type="text"
                  value={formData.activity_name}
                  onChange={(e) => setFormData({ ...formData, activity_name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Scheduled Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 08:00 AM"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Status</label>
                <Select
                  id="activity-detail-status-select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'ongoing', label: 'Ongoing' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'cancelled', label: 'Cancelled' },
                    { value: 'skipped', label: 'Skipped' }
                  ]}
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add notes about inputs, equipment, or conditions..."
                  className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-200 dark:bg-slate-950/60 dark:border-slate-800 rounded-2xl text-xs text-gray-700 dark:text-slate-300">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block">Scheduled Date</span>
                  <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
                    <Clock size={14} className="text-emerald-600 dark:text-emerald-400" />
                    <span>{activity.planned_date || activity.scheduled_date || activity.activity_date || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block">Scheduled Time</span>
                  <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
                    <Clock size={14} className="text-blue-600 dark:text-blue-400" />
                    <span>{activity.scheduled_time || 'All Day'}</span>
                  </div>
                </div>

                {activity.planting_name && (
                  <div className="space-y-1 col-span-2 pt-2 border-t border-gray-200 dark:border-slate-800/80">
                    <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block">Planting Plot</span>
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      <Sprout size={14} />
                      <span>{activity.planting_name}</span>
                    </div>
                  </div>
                )}

                {activity.field_name && (
                  <div className="space-y-1 col-span-2 pt-2 border-t border-gray-200 dark:border-slate-800/80">
                    <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block">Field Location</span>
                    <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-slate-200">
                      <MapPin size={14} className="text-rose-500 dark:text-rose-400" />
                      <span>{activity.field_name}</span>
                    </div>
                  </div>
                )}

                {activity.expected_stage && (
                  <div className="space-y-1 col-span-2 pt-2 border-t border-gray-200 dark:border-slate-800/80">
                    <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block">Expected Stage</span>
                    <span className="inline-block px-2.5 py-0.5 bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-slate-300 font-semibold rounded-md text-[11px]">
                      {activity.expected_stage}
                    </span>
                  </div>
                )}
                {activity.observed_stage && (
                  <div className="space-y-1 col-span-2 pt-2 border-t border-gray-200 dark:border-slate-800/80">
                    <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block">Observed Stage</span>
                    <span className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-semibold rounded-md text-[11px]">
                      {activity.observed_stage}
                    </span>
                  </div>
                )}
              </div>

              {activity.notes && (
                <div className="p-4 bg-gray-50 border border-gray-200 dark:bg-slate-950/40 dark:border-slate-800 rounded-2xl text-xs">
                  <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 block mb-1">Notes</span>
                  <p className="text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{activity.notes}</p>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Action Buttons */}
        <div className="p-6 border-t border-gray-200 bg-gray-50/90 dark:border-slate-800 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel Edit
              </button>
              <button
                type="submit"
                form="edit-activity-form"
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Save Changes</span>
              </button>
            </>
          ) : (
            <>
              {!isTerminal && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleComplete}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    <span>Complete</span>
                  </button>
  
                  <button
                    onClick={handleCancelActivity}
                    disabled={loading}
                    className="group flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 dark:bg-slate-800 dark:hover:bg-red-900/30 dark:text-slate-300 dark:hover:text-red-400 text-xs font-semibold rounded-xl border border-gray-300 hover:border-red-200 dark:border-slate-700 dark:hover:border-red-800/50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <XCircle size={14} className="text-gray-500 group-hover:text-red-500 dark:text-slate-400 dark:group-hover:text-red-400 transition-colors" />
                    <span>Cancel Activity</span>
                  </button>
                </div>
              )}
  
              <div className="flex items-center gap-2">
                {!isTerminal && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <Edit3 size={14} />
                    <span>Edit</span>
                  </button>
                )}
  
                <button
                  onClick={onClose}
                  className="px-3.5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>

      </div>

    </div>
  );
};

export default ActivityDetailModal;
