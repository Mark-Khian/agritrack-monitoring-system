import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Shovel, Sprout, FlaskConical,
    Droplets, Bug, Scissors,
    Wheat, Package, Tractor, AlertTriangle, Cpu, ChevronRight, Eye, CheckCircle,
    ChevronDown, Loader2
} from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import Badge from '../components/Badge';
import { formatActivityName } from '../utils/calendarUtils';
import { getActivities, createActivity, updateActivity, getPlantings } from '../services/api';
import { formatDisplayDate } from '../utils/dateFormatter';
import { SkeletonTable } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import MonthPicker from '../components/MonthPicker';
import { useToast } from '../context/ToastContext';

// ── Activity Type Icon + Color Map ────────
const ACTIVITY_ICONS = {
    'land preparation': { icon: Shovel,       color: '#d97706', bg: '#fffbeb' },
    'seeding':          { icon: Sprout,        color: '#16a34a', bg: '#f0fdf4' },
    'transplanting':    { icon: Sprout,        color: '#0d9488', bg: '#f0f9ff' },
    'fertilizing':      { icon: FlaskConical,  color: '#2563eb', bg: '#eff6ff' },
    'first fertilizing': { icon: FlaskConical, color: '#2563eb', bg: '#eff6ff' },
    'second fertilizing': { icon: FlaskConical, color: '#1d4ed8', bg: '#eff6ff' },
    'irrigation':       { icon: Droplets,      color: '#0891b2', bg: '#ecfeff' },
    'drain irrigation': { icon: Droplets,      color: '#0284c7', bg: '#f0f9ff' },
    'pest control':     { icon: Bug,           color: '#dc2626', bg: '#fef2f2' },
    'final pest inspection': { icon: Bug,      color: '#b91c1c', bg: '#fef2f2' },
    'crop monitoring':  { icon: Eye,           color: '#7c3aed', bg: '#f5f3ff' },
    'weeding':          { icon: Scissors,      color: '#7c3aed', bg: '#f5f3ff' },
    'harvesting':       { icon: Wheat,         color: '#ca8a04', bg: '#fefce8' },
    'other':            { icon: Package,       color: '#6b7280', bg: '#f9fafb' },
};

// Backend validator expects underscore activity_type values (e.g. pest_control).
const toApiActivityType = (value) =>
    String(value || 'other').trim().toLowerCase().replaceAll(' ', '_');

// UI/icon mapping uses space-separated keys (e.g. pest control).
const toUiActivityTypeKey = (value) =>
    String(value || 'other').trim().toLowerCase().replaceAll('_', ' ');

const getActivityIcon = (type) => {
    const entry = ACTIVITY_ICONS[toUiActivityTypeKey(type)] || ACTIVITY_ICONS['other'];
    const Icon = entry.icon;
    return (
        <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: entry.bg, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
            <Icon size={16} style={{ color: entry.color }} />
        </div>
    );
};

const Activities = () => {
    const navigate = useNavigate();
    const [activities, setActivities] = useState([]);
    const [plantings, setPlantings] = useState([]);  // active plantings for dropdown
    const [loading, setLoading] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    const [activitiesError, setActivitiesError] = useState(null);
    const [plantingsError, setPlantingsError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formError, setFormError] = useState('');
    const [statusUpdatingId, setStatusUpdatingId] = useState(null);
    const [selectedPlotActivities, setSelectedPlotActivities] = useState(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [activityToComplete, setActivityToComplete] = useState(null);
    const toast = useToast();

    const [formData, setFormData] = useState({
        planting_id: '',
        activity_type: 'land preparation',
        planned_date: '',
        actual_date: '',
        notes: '',
        status: 'PENDING'
    });

    const fetchData = useCallback(async () => {
        try {
            const aRes = await getActivities();
            setActivities(aRes.data.data || []);
            setActivitiesError(null);
        } catch (err) {
            setActivitiesError('Failed to load activities. Please try again.');
            console.error('Activities fetch error:', err);
        }

        try {
            const pRes = await getPlantings({ status: 'active' });
            setPlantings(pRes.data.data || []);
            setPlantingsError(null);
        } catch (err) {
            setPlantingsError('Failed to verify active plantings.');
            console.error('Plantings fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const timer = setInterval(fetchData, 5000);
        return () => clearInterval(timer);
    }, [fetchData]);

    const handleRetry = async () => {
        setIsRetrying(true);
        await fetchData();
        setIsRetrying(false);
    };


    const handleOpenModal = (item = null) => {
        setFormError('');
        if (item) {
            setFormData({
                planting_id: item.planting_id,
                activity_type: item.activity_type,
                planned_date: item.planned_date?.slice(0, 10) || '',
                actual_date: item.actual_date?.slice(0, 10) || '',
                notes: item.notes || '',
                status: item.status || 'PENDING'
            });
            setEditingItem(item);
        } else {
            setFormData({
                planting_id: '',
                activity_type: 'land preparation',
                planned_date: '',
                actual_date: '',
                notes: '',
                status: 'PENDING'
            });
            setEditingItem(null);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            if (editingItem) {
                await updateActivity(editingItem.id, {
                    planting_id: editingItem.planting_id,
                    activity_type: toApiActivityType(formData.activity_type),
                    planned_date: formData.planned_date,
                    actual_date: formData.actual_date,
                    notes: formData.notes,
                    status: formData.status
                });
                toast.success('Activity updated successfully!');
            } else {
                await createActivity({
                    planting_id: formData.planting_id,
                    activity_type: toApiActivityType(formData.activity_type),
                    planned_date: formData.planned_date,
                    actual_date: formData.actual_date,
                    notes: formData.notes
                });
                toast.success('Activity created successfully!');
            }
            setIsModalOpen(false);
            await fetchData();
            window.dispatchEvent(new CustomEvent('refresh-notifications'));
        } catch (err) {
            const apiMessage = err.response?.data?.message;
            const normalized = String(apiMessage || '').toLowerCase();
            if (normalized.includes('active planting not found')) {
                setFormError('No active planting was found. Create a planting and set its status to Active to enable activity logging.');
            } else {
                setFormError(apiMessage || 'Failed to save activity.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async (act, checked) => {
        const currentStatus = String(act?.status || '').toLowerCase();
        // One-way completion from checkbox UI: completed activities cannot be unchecked back.
        if (!checked || currentStatus === 'completed') return;
        
        setActivityToComplete(act);
        setIsConfirmOpen(true);
    };

    const confirmCompleteActivity = async () => {
        if (!activityToComplete) return;
        const nextStatus = 'COMPLETED';
        try {
            setStatusUpdatingId(activityToComplete.id);
            await updateActivity(activityToComplete.id, {
                planting_id: activityToComplete.planting_id,
                activity_type: toApiActivityType(activityToComplete.activity_type),
                planned_date: activityToComplete.planned_date?.slice(0, 10) || null,
                actual_date: new Date().toISOString().slice(0, 10),
                notes: activityToComplete.notes,
                status: nextStatus
            });
            await fetchData();
            toast.success('Activity marked as completed successfully!');
            window.dispatchEvent(new CustomEvent('refresh-notifications'));
        } catch (err) {
            console.error('Update activity status error:', err);
            setError(err.response?.data?.message || err.response?.data || 'Failed to update activity status. Please try again.');
        } finally {
            setStatusUpdatingId(null);
            setActivityToComplete(null);
        }
    };

    const isCompletedActivity = (act) => String(act?.status || '').toLowerCase() === 'completed';
    const visibleActivities = activities;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Farm Activities</h1>
                    <p className="text-sm text-gray-500">System-scheduled and manual field operations</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    disabled={plantings.length === 0 || plantingsError}
                    className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} /> Log Activity
                </button>
            </div>

            {/* Dependency guard */}
            {!loading && plantingsError && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">Unable to verify active plantings</p>
                            <p className="text-red-700/80 dark:text-red-400/80 text-xs mt-1">
                                Connection unavailable. Logging activities is temporarily disabled.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {!loading && !plantingsError && plantings.length === 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">No active planting yet</p>
                            <p className="text-amber-700/80 text-xs mt-1">
                                Activities can only be logged against an <strong>active</strong> planting record. Create one in <strong>Plantings</strong>, then try again.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/plantings')}
                        className="inline-flex items-center justify-center rounded-xl bg-[#166534] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12532c] transition-colors"
                    >
                        + Create Planting
                    </button>
                </div>
            )}

            {loading || isRetrying ? (
                <div className="space-y-4">
                    {isRetrying && (
                        <div className="flex justify-start">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                                <Loader2 size={14} className="animate-spin text-slate-500 dark:text-slate-400" />
                                Retrying...
                            </div>
                        </div>
                    )}
                    <SkeletonTable 
                        rows={6} 
                        cols={7}
                        columnHeaders={['Activity Type', 'Planting', 'Activity Date', 'Performed By', 'Notes', 'Status', 'Actions']}
                    />
                </div>
            ) : activitiesError ? (
                <div className="bg-red-50 dark:bg-slate-800/80 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/50 px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <AlertTriangle size={40} className="text-red-400 dark:text-red-500" />
                        <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Unable to load activities</h3>
                        <p className="text-red-600 dark:text-red-300/80 text-sm font-medium max-w-md">
                            Activity records could not be retrieved. Check the server connection and try again.
                        </p>
                        <button
                            onClick={handleRetry}
                            className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    {visibleActivities.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10">
                            <Tractor size={40} className="text-gray-200" />
                            <p className="text-gray-400 text-sm font-medium">
                                No activities recorded yet.
                            </p>
                            <p className="text-gray-300 text-xs">
                                System activities are auto-generated when you create a planting.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">Plot Activities</p>
                                    <p className="text-xs text-gray-500">
                                        Click a plot card to expand and see its activity list.
                                    </p>
                                </div>
                                <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        Manual
                                    </span>
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                                        System
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 items-start">
                                {Object.values(
                                    visibleActivities.reduce((acc, act) => {
                                        const key = act.planting_id || 'unassigned';
                                        if (!acc[key]) {
                                            acc[key] = {
                                                plantingId: act.planting_id,
                                                plantingVariety: act.planting_variety || 'Unassigned Plot',
                                                fieldName: act.field_name || 'Unassigned Field',
                                                activities: []
                                            };
                                        }
                                        acc[key].activities.push(act);
                                        return acc;
                                    }, {})
                                ).map((group) => {
                                    const headerLabel = group.plantingVariety;
                                    const isArchivedGroup = group.activities.length > 0 && group.activities.every(isCompletedActivity);
                                    const subLabel = group.fieldName;

                                    return (
                                        <div
                                            key={group.plantingId || headerLabel}
                                            className="rounded-xl border border-gray-100 bg-white overflow-hidden h-fit self-start hover:shadow-md transition-shadow"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPlotActivities(group)}
                                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-semibold text-gray-900 truncate">
                                                                {headerLabel}
                                                            </p>
                                                            {isArchivedGroup && (
                                                                <span className="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                                                                    Completed
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs text-gray-500 truncate">
                                                            {subLabel}
                                                        </p>
                                                    </div>
                                                    <ChevronRight
                                                        className="h-5 w-5 text-gray-400"
                                                    />
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            <Modal 
                isOpen={!!selectedPlotActivities} 
                onClose={() => setSelectedPlotActivities(null)} 
                title={selectedPlotActivities ? `Activities for ${selectedPlotActivities.plantingVariety}` : 'Plot Activities'}
                maxWidth="max-w-2xl"
            >
                {selectedPlotActivities && (
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedPlotActivities.activities.map((act) => {
                            const isSystem = !!act.is_system_generated;
                            const statusStr = String(act.status || '').toLowerCase();
                            const isTerminal = ['completed', 'cancelled', 'skipped'].includes(statusStr);
                            const rowBg = isSystem
                                ? 'bg-gray-50 dark:bg-slate-900/60'
                                : 'bg-emerald-50/70 dark:bg-emerald-950/20';
                            const textColor = isSystem
                                ? 'text-gray-700 dark:text-slate-100'
                                : 'text-emerald-900 dark:text-emerald-300';
                            return (
                                <div
                                    key={act.id}
                                    className={`rounded-xl border border-gray-100 dark:border-slate-700 p-4 flex flex-col sm:flex-row sm:items-start gap-4 ${rowBg}`}
                                >
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        {getActivityIcon(act.activity_type)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-sm font-semibold truncate ${textColor}`}>
                                                    {formatActivityName(act.activity_type)}
                                                </p>
                                                <Badge status={act.status} />
                                            </div>
                                            
                                            <p className="mt-2 text-xs text-gray-700 dark:text-slate-300 leading-relaxed" title={act.notes || ''}>
                                                {act.notes || 'No notes provided.'}
                                            </p>

                                            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                                                <span>Plan: {act.planned_date ? formatDisplayDate(act.planned_date) : '—'}</span>
                                                {act.actual_date && <span>Act: {formatDisplayDate(act.actual_date)}</span>}
                                                
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span className={`h-1.5 w-1.5 rounded-full ${isSystem ? 'bg-gray-400' : 'bg-emerald-500'}`} />
                                                    {isSystem ? 'System' : 'Manual'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-3 sm:mt-0 sm:pl-4 sm:border-l border-gray-200 dark:border-slate-600 flex items-center sm:items-start shrink-0">
                                        {!isTerminal ? (
                                            <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400 cursor-pointer hover:text-emerald-700 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={statusStr === 'completed'}
                                                    disabled={statusUpdatingId === act.id}
                                                    onChange={(e) =>
                                                        handleToggleStatus(act, e.target.checked)
                                                    }
                                                    className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700"
                                                />
                                                <span className="font-medium">Complete</span>
                                            </label>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-slate-500 italic py-1">
                                                No actions
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Modal>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Activity' : 'Log Activity'}>
                <form onSubmit={handleSave} className="space-y-4">
                    {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
                    )}
                    {/* Only show planting selector on create */}
                    {!editingItem && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Target Planting *</label>
                            <div className="relative">
                                <Select
                                    id="activity-planting-select"
                                    required
                                    value={formData.planting_id}
                                    onChange={e => setFormData({ ...formData, planting_id: e.target.value })}
                                    options={plantings.map(p => ({ value: String(p.id), label: `${p.variety} (${p.field_name})` }))}
                                    placeholder="Select Active Planting"
                                />
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Activity Type *</label>
                            <div className="relative">
                                <Select
                                    id="activity-type-select"
                                    required
                                    value={formData.activity_type}
                                    onChange={e => setFormData({ ...formData, activity_type: e.target.value })}
                                    options={Object.keys(ACTIVITY_ICONS).map(type => ({ value: type, label: type.charAt(0).toUpperCase() + type.slice(1) }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Planned Date *</label>
                            <MonthPicker
                                required
                                placeholder="Select planned date"
                                value={formData.planned_date}
                                onChange={e => setFormData({ ...formData, planned_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Actual Date (Optional)</label>
                            <MonthPicker
                                placeholder="Select actual completion date"
                                value={formData.actual_date}
                                onChange={e => setFormData({ ...formData, actual_date: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Status *</label>
                            <div className="relative">
                                <Select
                                    id="activity-status-select"
                                    required
                                    disabled={editingItem && editingItem.status === 'COMPLETED'}
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    options={[
                                        { value: 'PENDING', label: 'Pending' },
                                        { value: 'COMPLETED', label: 'Completed' },
                                        { value: 'CANCELLED', label: 'Cancelled' },
                                        { value: 'SKIPPED', label: 'Skipped' }
                                    ]}
                                />
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Notes / Remarks</label>
                            <textarea
                                rows="3"
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow resize-none"
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Describe the activity details..."
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Submit'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => {
                    setIsConfirmOpen(false);
                    setActivityToComplete(null);
                }}
                onConfirm={confirmCompleteActivity}
                title="Complete Activity"
                message={`Are you sure you want to mark "${activityToComplete?.activity_type?.replaceAll('_', ' ')}" as completed? This action is locked and cannot be undone.`}
                confirmText="Confirm"
                confirmColor="bg-green-700 hover:bg-green-600 shadow-green-700/30 text-white"
                iconBg="bg-green-100 text-green-700"
                icon={<CheckCircle size={32} />}
            />
        </div>
    );
};

export default Activities;