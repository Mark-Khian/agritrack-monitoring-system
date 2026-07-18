import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Shovel, Sprout, FlaskConical,
    Droplets, Bug, Scissors,
    Wheat, Package, Tractor, AlertTriangle, Cpu, ChevronRight, Eye, CheckCircle,
    ChevronDown
} from 'lucide-react';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { getActivities, createActivity, updateActivity, getPlantings } from '../services/api';
import { SkeletonTable } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import MonthPicker from '../components/MonthPicker';
import Toast from '../components/Toast';

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
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formError, setFormError] = useState('');
    const [statusUpdatingId, setStatusUpdatingId] = useState(null);
    const [expandedPlantingId, setExpandedPlantingId] = useState(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [activityToComplete, setActivityToComplete] = useState(null);
    const [toast, setToast] = useState({ message: '', type: '' });

    const [formData, setFormData] = useState({
        planting_id: '',
        activity_type: 'land preparation',
        activity_date: '',
        notes: '',
        status: 'pending'
    });

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [aRes, pRes] = await Promise.all([
                getActivities(),
                getPlantings({ status: 'active' }),
            ]);
            setActivities(aRes.data.data || []);
            setPlantings(pRes.data.data || []);
        } catch (err) {
            setError('Failed to load activities. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const timer = setInterval(fetchData, 5000);
        return () => clearInterval(timer);
    }, [fetchData]);


    const handleOpenModal = (item = null) => {
        setFormError('');
        if (item) {
            setFormData({
                planting_id: item.planting_id,
                activity_type: item.activity_type,
                activity_date: item.activity_date?.slice(0, 10) || '',
                notes: item.notes || '',
                status: item.status
            });
            setEditingItem(item);
        } else {
            setFormData({
                planting_id: '',
                activity_type: 'land preparation',
                activity_date: '',
                notes: '',
                status: 'pending'
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
                    activity_date: formData.activity_date,
                    notes: formData.notes,
                    status: formData.status
                });
            } else {
                await createActivity({
                    planting_id: formData.planting_id,
                    activity_type: toApiActivityType(formData.activity_type),
                    activity_date: formData.activity_date,
                    notes: formData.notes
                });
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
        const nextStatus = 'completed';
        try {
            setStatusUpdatingId(activityToComplete.id);
            await updateActivity(activityToComplete.id, {
                planting_id: activityToComplete.planting_id,
                activity_type: toApiActivityType(activityToComplete.activity_type),
                activity_date: activityToComplete.activity_date?.slice(0, 10) || activityToComplete.activity_date,
                notes: activityToComplete.notes,
                status: nextStatus
            });
            await fetchData();
            setToast({ message: 'Activity marked as completed successfully!', type: 'success' });
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
            <Toast
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ message: '', type: '' })}
            />
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Farm Activities</h1>
                    <p className="text-sm text-gray-500">System-scheduled and manual field operations</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    disabled={plantings.length === 0}
                    className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} /> Log Activity
                </button>
            </div>

            {/* Dependency guard */}
            {!loading && plantings.length === 0 && (
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

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={fetchData} className="underline">Retry</button>
                </div>
            )}

            {loading ? (
                <SkeletonTable 
                    rows={6} 
                    cols={7}
                    columnHeaders={['Activity Type', 'Planting', 'Activity Date', 'Performed By', 'Notes', 'Status', 'Actions']}
                />
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
                                                activities: []
                                            };
                                        }
                                        acc[key].activities.push(act);
                                        return acc;
                                    }, {})
                                ).map((group) => {
                                    const isExpanded = expandedPlantingId === group.plantingId;
                                    const headerLabel = group.plantingVariety;
                                    const isArchivedGroup = group.activities.length > 0 && group.activities.every(isCompletedActivity);
                                    const subLabel = group.activities[0]?.field_name || 'Unassigned Field';

                                    return (
                                        <div
                                            key={group.plantingId || headerLabel}
                                            className="rounded-xl border border-gray-100 bg-white overflow-hidden h-fit self-start"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedPlantingId((prev) =>
                                                        prev === group.plantingId ? null : group.plantingId
                                                    )
                                                }
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
                                                        className={`h-5 w-5 text-gray-400 transition-transform ${
                                                            isExpanded ? 'rotate-90' : ''
                                                        }`}
                                                    />
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="px-4 pb-3">
                                                    <div className="flex gap-3 overflow-x-auto pb-2 pr-1 overscroll-x-contain">
                                                        {group.activities.map((act) => {
                                                            const isSystem = !!act.is_system_generated;
                                                            const isCompleted = String(act.status || '').toLowerCase() === 'completed';
                                                            const rowBg = isSystem
                                                                ? 'bg-gray-50 dark:bg-slate-900/60'
                                                                : 'bg-emerald-50/70 dark:bg-emerald-950/20';
                                                            const textColor = isSystem
                                                                ? 'text-gray-700 dark:text-slate-100'
                                                                : 'text-emerald-900 dark:text-emerald-300';
                                                            return (
                                                                <div
                                                                    key={act.id}
                                                                    className={`flex-shrink-0 w-64 rounded-xl border border-gray-100 dark:border-slate-700 px-3 py-2.5 flex flex-col ${rowBg}`}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="flex items-start gap-2 min-w-0">
                                                                            {getActivityIcon(act.activity_type)}
                                                                            <p className={`text-sm font-semibold capitalize truncate ${textColor}`}>
                                                                                {act.activity_type?.replace('_', ' ')}
                                                                            </p>
                                                                        </div>
                                                                        <Badge status={act.status} />
                                                                    </div>

                                                                    <p className="mt-2 text-xs text-gray-700 dark:text-slate-300 leading-relaxed line-clamp-3" title={act.notes || ''}>
                                                                        {act.notes || '—'}
                                                                    </p>

                                                                    <div className="mt-auto pt-3 flex flex-col gap-2">
                                                                        <p className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                                                            {act.activity_date?.slice(0, 10) || '—'}
                                                                        </p>
                                                                        {!isCompleted && (
                                                                            <label className="inline-flex items-center gap-2 text-[11px] text-gray-600 dark:text-slate-400 cursor-pointer">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isCompleted}
                                                                                    disabled={statusUpdatingId === act.id}
                                                                                    onChange={(e) =>
                                                                                        handleToggleStatus(act, e.target.checked)
                                                                                    }
                                                                                    className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700"
                                                                                />
                                                                                <span>Mark as completed</span>
                                                                            </label>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

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
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow appearance-none bg-white text-gray-800"
                                    value={formData.planting_id}
                                    onChange={e => setFormData({ ...formData, planting_id: e.target.value })}
                                >
                                    <option value="">Select Active Planting</option>
                                    {plantings.map(p => (
                                        <option key={p.id} value={p.id}>{p.variety} ({p.field_name})</option>
                                    ))}
                                </select>
                                <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Activity Type *</label>
                            <div className="relative">
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow appearance-none bg-white text-gray-800"
                                    value={formData.activity_type}
                                    onChange={e => setFormData({ ...formData, activity_type: e.target.value })}
                                >
                                    {Object.keys(ACTIVITY_ICONS).map(type => (
                                        <option key={type} value={type}>
                                            {type.charAt(0).toUpperCase() + type.slice(1)}
                                        </option>
                                    ))}
                                </select>
                                <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </span>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Activity Date *</label>
                            <MonthPicker
                                required
                                placeholder="Select activity date"
                                value={formData.activity_date}
                                onChange={e => setFormData({ ...formData, activity_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Status *</label>
                            <div className="relative">
                                <select
                                    required
                                    disabled={editingItem && editingItem.status === 'completed'}
                                    className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow disabled:bg-gray-50 disabled:text-gray-500 appearance-none bg-white text-gray-800"
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="ongoing">Ongoing</option>
                                    <option value="completed">Completed</option>
                                </select>
                                <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                    <ChevronDown size={16} />
                                </span>
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