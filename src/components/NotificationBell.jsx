/**
 * NotificationBell.jsx
 *
 * Self-contained notification bell for the Navbar.
 * - Polls GET /api/v1/notifications every 60 seconds (no WebSockets).
 * - Shows an animated unread badge.
 * - Dropdown lists up to 20 notifications with type icons, title, message, time.
 * - Clicking a notification marks it as read.
 * - "Mark all as read" button at top of dropdown.
 * - Click-outside closes the dropdown.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Bell,
    CheckCheck,
    AlertTriangle,
    CloudRain,
    CloudSun,
    Clock,
    Sprout,
    Cpu,
    X,
    Trash2,
} from 'lucide-react';
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
} from '../services/api';
import ConfirmDialog from './ConfirmDialog';

// ── Type → icon + accent colours ─────────────────────────────────────────────

const TYPE_META = {
    activity_due: {
        icon: Clock,
        iconClass: 'text-amber-600',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-400',
        label: 'Due Today',
    },
    activity_overdue: {
        icon: AlertTriangle,
        iconClass: 'text-red-600 dark:text-red-400',
        bgClass: 'bg-red-50 dark:bg-red-950/20',
        borderClass: 'border-red-500 dark:border-red-600',
        label: 'Overdue',
    },
    weather_alert: {
        icon: CloudRain,
        iconClass: 'text-blue-600 dark:text-blue-400',
        bgClass: 'bg-blue-50 dark:bg-blue-950/20',
        borderClass: 'border-blue-400 dark:border-blue-500',
        label: 'Weather',
    },
    lifecycle_update: {
        icon: Sprout,
        iconClass: 'text-emerald-600 dark:text-emerald-400',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/20',
        borderClass: 'border-emerald-500 dark:border-emerald-600',
        label: 'Lifecycle',
    },
    system_guidance: {
        icon: Cpu,
        iconClass: 'text-purple-600 dark:text-purple-400',
        bgClass: 'bg-purple-50 dark:bg-purple-950/20',
        borderClass: 'border-purple-400 dark:border-purple-500',
        label: 'Guidance',
    },
};

const DEFAULT_META = {
    icon: Bell,
    iconClass: 'text-gray-500 dark:text-slate-400',
    bgClass: 'bg-gray-50 dark:bg-slate-800/40',
    borderClass: 'border-gray-300 dark:border-slate-700',
    label: 'Notification',
};

// ── Relative time helper ──────────────────────────────────────────────────────

const relativeTime = (dateString) => {
    if (!dateString) return '';
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
};

// ── Component ─────────────────────────────────────────────────────────────────

const NotificationBell = ({ mode = 'activity' }) => {
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread]               = useState(0);
    const [open, setOpen]                   = useState(false);
    const [loading, setLoading]             = useState(false);
    const [markingAll, setMarkingAll]       = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    const containerRef = useRef(null);
    const intervalRef  = useRef(null);

    // Filter notifications and calculate unread count based on mode
    const filteredNotifications = notifications.filter((n) => {
        if (mode === 'weather') {
            return n.type === 'weather_alert';
        } else {
            return n.type !== 'weather_alert';
        }
    });

    const filteredUnread = filteredNotifications.filter(n => !n.is_read).length;

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await getNotifications();
            setNotifications(res.data.data   || []);
            setUnread(Number(res.data.unread) || 0);
        } catch {
            // silently fail — non-critical
        }
    }, []);

    // Initial load + polling every 60 s
    useEffect(() => {
        setLoading(true);
        fetchNotifications().finally(() => setLoading(false));

        intervalRef.current = setInterval(fetchNotifications, 60_000);
        return () => clearInterval(intervalRef.current);
    }, [fetchNotifications]);

    // Refresh notifications listener
    useEffect(() => {
        const handleRefresh = () => {
            fetchNotifications();
        };
        window.addEventListener('refresh-notifications', handleRefresh);
        return () => window.removeEventListener('refresh-notifications', handleRefresh);
    }, [fetchNotifications]);

    // Close on outside click (disabled when confirmation dialog is active)
    useEffect(() => {
        const handle = (e) => {
            if (deleteTargetId !== null) return;
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [deleteTargetId]);

    // Lock body scrolling when notifications panel is open
    useEffect(() => {
        if (open) {
            const root = document.documentElement;
            const body = document.body;
            const originalHtmlOverflow = root.style.overflow;
            const originalBodyOverflow = body.style.overflow;
            
            root.style.overflow = 'hidden';
            body.style.overflow = 'hidden';
            
            return () => {
                root.style.overflow = originalHtmlOverflow;
                body.style.overflow = originalBodyOverflow;
            };
        }
    }, [open]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleMarkRead = async (id) => {
        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
        );
        try {
            await markNotificationRead(id);
            // Refresh to sync unread counts correctly
            fetchNotifications();
        } catch {
            // revert on failure
            fetchNotifications();
        }
    };

    const handleDeleteNotif = async (id) => {
        // Optimistic update
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        try {
            await deleteNotification(id);
            fetchNotifications();
        } catch (err) {
            console.error('[NotificationBell] delete failed:', err.message);
            fetchNotifications();
        }
    };

    const handleMarkAllRead = async () => {
        if (markingAll || filteredUnread === 0) return;
        setMarkingAll(true);
        setNotifications((prev) =>
            prev.map((n) => {
                const matchesMode = mode === 'weather' ? n.type === 'weather_alert' : n.type !== 'weather_alert';
                return matchesMode ? { ...n, is_read: 1 } : n;
            })
        );
        try {
            await markAllNotificationsRead(mode === 'weather' ? 'weather' : 'activity');
            fetchNotifications();
        } catch {
            fetchNotifications();
        } finally {
            setMarkingAll(false);
        }
    };

    const primaryTextClass = mode === 'weather'
        ? 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
        : 'text-emerald-700 dark:text-emerald-500 hover:text-emerald-900 dark:hover:text-emerald-400';

    return (
        <div ref={containerRef} className="relative font-sans" id={`notification-${mode}-container`}>
            {/* Bell button */}
            <button
                id={`notification-${mode}-btn`}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all shadow-xs cursor-pointer
                    ${open 
                        ? mode === 'weather'
                            ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30'
                        : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                aria-label={mode === 'weather' ? 'Weather Alerts' : 'Activity Notifications'}
                title={mode === 'weather' ? 'Weather Alerts' : 'Activity Notifications'}
            >
                {mode === 'weather' ? (
                    <CloudSun size={19} className={loading ? 'animate-pulse' : ''} />
                ) : (
                    <Bell size={18} className={loading ? 'animate-pulse' : ''} />
                )}

                {/* Unread badge */}
                {filteredUnread > 0 && (
                    <span
                        className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center
                                   rounded-full bg-red-500 px-1 text-[10px] font-bold text-white
                                   ring-2 ring-white dark:ring-0 animate-bounce"
                        style={{ animationIterationCount: 1 }}
                    >
                        {filteredUnread > 99 ? '99+' : filteredUnread}
                    </span>
                )}
            </button>

            {/* Backdrop Overlay with frosted glass blur */}
            {open && (
                <div
                    className="fixed inset-0 z-40 bg-black/15 dark:bg-black/40 backdrop-blur-xs sm:backdrop-blur-[2px]"
                    onClick={() => setOpen(false)}
                />
            )}

            {/* Dropdown */}
            {open && (
                <div
                    id={`notification-${mode}-dropdown`}
                    className="fixed right-2 left-2 sm:absolute sm:right-0 sm:left-auto top-14 sm:top-12 z-50 w-auto sm:w-96 max-w-[calc(100vw-1rem)]
                               rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl
                               overflow-hidden flex flex-col scrollbar-none"
                    style={{ maxHeight: '520px' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
                        <div className="flex items-center gap-2">
                            {mode === 'weather' ? (
                                <CloudSun size={16} className="text-blue-600 dark:text-blue-400" />
                            ) : (
                                <Bell size={16} className="text-emerald-700 dark:text-emerald-500" />
                            )}
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">
                                {mode === 'weather' ? 'Weather Alerts' : 'Activities & Tasks'}
                            </span>
                            {filteredUnread > 0 && (
                                <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                                    {filteredUnread} new
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {filteredUnread > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAllRead}
                                    disabled={markingAll}
                                    className={`flex items-center gap-1 text-xs font-semibold transition-colors disabled:opacity-50 ${primaryTextClass}`}
                                    title="Mark all as read"
                                >
                                    <CheckCheck size={13} />
                                    Mark all read
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-gray-400 dark:text-slate-500 cursor-pointer"
                                aria-label="Close"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto flex-1 scrollbar-none">
                        {filteredNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                                {mode === 'weather' ? (
                                    <>
                                        <CloudSun size={32} className="text-gray-200 dark:text-slate-700" />
                                        <p className="text-sm">No weather alerts.</p>
                                        <p className="text-xs text-gray-400 text-center px-6">
                                            Weather alerts and local forecast warnings will appear here.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <Bell size={32} className="text-gray-200 dark:text-slate-700" />
                                        <p className="text-sm">No task notifications.</p>
                                        <p className="text-xs text-gray-400 text-center px-6">
                                            Notifications from your scheduled field tasks and growth updates will show here.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            filteredNotifications.map((notif) => {
                                const meta  = TYPE_META[notif.type] || DEFAULT_META;
                                const Icon  = meta.icon;
                                const isUnread = !notif.is_read;

                                return (
                                    <div
                                        key={notif.id}
                                        className={`relative flex items-start gap-3 px-4 py-3
                                                   border-b border-gray-50 dark:border-slate-800 last:border-0
                                                   transition-colors group
                                                   ${isUnread
                                                        ? `${meta.bgClass} border-l-[3px] ${meta.borderClass}`
                                                        : 'bg-white dark:bg-slate-900 border-l-[3px] border-transparent hover:bg-gray-50/50 dark:hover:bg-slate-800/20'
                                                   }`}
                                    >
                                        {/* Clickable Area to mark as read */}
                                        <div
                                            onClick={() => isUnread && handleMarkRead(notif.id)}
                                            className={`flex-1 flex items-start gap-3 min-w-0 ${isUnread ? 'cursor-pointer' : 'cursor-default'}`}
                                        >
                                            {/* Icon */}
                                            <span className={`mt-0.5 shrink-0 rounded-lg p-1.5
                                                ${isUnread ? 'bg-white/70 dark:bg-slate-800/50' : 'bg-gray-100 dark:bg-slate-800/30'}`}>
                                                <Icon size={15} className={meta.iconClass} />
                                            </span>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 pr-6">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className={`text-[13px] font-semibold leading-tight truncate
                                                        ${isUnread ? 'text-gray-900 dark:text-slate-100' : 'text-gray-600 dark:text-slate-400'}`}>
                                                        {notif.title}
                                                    </p>
                                                    <span className="shrink-0 text-[10px] text-gray-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
                                                        {relativeTime(notif.created_at)}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[12px] text-gray-500 dark:text-slate-400 leading-snug line-clamp-2">
                                                    {notif.message}
                                                </p>
                                                <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5
                                                    text-[10px] font-semibold
                                                    ${isUnread ? 'bg-white/60 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300' : 'bg-gray-100 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400'}`}>
                                                    {meta.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Manual Delete / Dismiss Button */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteTargetId(notif.id);
                                            }}
                                            className="absolute right-4 top-3.5 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-800 opacity-60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150 cursor-pointer"
                                            title="Dismiss notification"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 px-4 py-2 border-t border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/50">
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 text-center">
                            Refreshes automatically every 60 seconds
                        </p>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={deleteTargetId !== null}
                onClose={() => setDeleteTargetId(null)}
                onConfirm={() => {
                    if (deleteTargetId !== null) {
                        handleDeleteNotif(deleteTargetId);
                    }
                }}
                title="Dismiss Notification"
                message="Are you sure you want to dismiss this notification? This action cannot be undone."
                confirmText="Dismiss"
            />
        </div>
    );
};

export default NotificationBell;
