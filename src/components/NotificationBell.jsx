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
    Clock,
    Sprout,
    Cpu,
    X,
} from 'lucide-react';
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} from '../services/api';

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
        iconClass: 'text-red-600',
        bgClass: 'bg-red-50',
        borderClass: 'border-red-500',
        label: 'Overdue',
    },
    weather_alert: {
        icon: CloudRain,
        iconClass: 'text-blue-600',
        bgClass: 'bg-blue-50',
        borderClass: 'border-blue-400',
        label: 'Weather',
    },
    lifecycle_update: {
        icon: Sprout,
        iconClass: 'text-emerald-600',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-500',
        label: 'Lifecycle',
    },
    system_guidance: {
        icon: Cpu,
        iconClass: 'text-purple-600',
        bgClass: 'bg-purple-50',
        borderClass: 'border-purple-400',
        label: 'Guidance',
    },
};

const DEFAULT_META = {
    icon: Bell,
    iconClass: 'text-gray-500',
    bgClass: 'bg-gray-50',
    borderClass: 'border-gray-300',
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

const NotificationBell = () => {
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread]               = useState(0);
    const [open, setOpen]                   = useState(false);
    const [loading, setLoading]             = useState(false);
    const [markingAll, setMarkingAll]       = useState(false);

    const containerRef = useRef(null);
    const intervalRef  = useRef(null);

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

    // Close on outside click
    useEffect(() => {
        const handle = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleMarkRead = async (id) => {
        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
        );
        setUnread((prev) => Math.max(0, prev - 1));
        try {
            await markNotificationRead(id);
        } catch {
            // revert on failure
            fetchNotifications();
        }
    };

    const handleMarkAllRead = async () => {
        if (markingAll || unread === 0) return;
        setMarkingAll(true);
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        setUnread(0);
        try {
            await markAllNotificationsRead();
        } catch {
            fetchNotifications();
        } finally {
            setMarkingAll(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div ref={containerRef} className="relative" id="notification-bell-container">
            {/* Bell button */}
            <button
                id="notification-bell-btn"
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors
                    ${open ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                aria-label="Notifications"
            >
                <Bell size={20} className={loading ? 'animate-pulse' : ''} />

                {/* Unread badge */}
                {unread > 0 && (
                    <span
                        className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center
                                   rounded-full bg-red-500 px-1 text-[10px] font-bold text-white
                                   ring-2 ring-white animate-bounce"
                        style={{ animationIterationCount: 1 }}
                    >
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div
                    id="notification-dropdown"
                    className="absolute right-0 top-12 z-50 w-96 max-w-[calc(100vw-1rem)]
                               rounded-2xl border border-gray-100 bg-white shadow-2xl
                               overflow-hidden flex flex-col"
                    style={{ maxHeight: '520px' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                        <div className="flex items-center gap-2">
                            <Bell size={16} className="text-emerald-700" />
                            <span className="text-sm font-bold text-gray-900">Notifications</span>
                            {unread > 0 && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                    {unread} unread
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {unread > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAllRead}
                                    disabled={markingAll}
                                    className="flex items-center gap-1 text-xs text-emerald-700 font-semibold
                                               hover:text-emerald-900 transition-colors disabled:opacity-50"
                                    title="Mark all as read"
                                >
                                    <CheckCheck size={13} />
                                    Mark all read
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg p-1 hover:bg-gray-100 transition-colors text-gray-400"
                                aria-label="Close"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto flex-1">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                                <Bell size={32} className="text-gray-200" />
                                <p className="text-sm">No notifications yet.</p>
                                <p className="text-xs text-gray-400 text-center px-6">
                                    Notifications are generated automatically from your farm activities and lifecycle data.
                                </p>
                            </div>
                        ) : (
                            notifications.map((notif) => {
                                const meta  = TYPE_META[notif.type] || DEFAULT_META;
                                const Icon  = meta.icon;
                                const isUnread = !notif.is_read;

                                return (
                                    <button
                                        key={notif.id}
                                        type="button"
                                        onClick={() => isUnread && handleMarkRead(notif.id)}
                                        className={`w-full text-left flex items-start gap-3 px-4 py-3
                                                   border-b border-gray-50 last:border-0
                                                   transition-colors group
                                                   ${isUnread
                                                        ? `${meta.bgClass} hover:opacity-90 cursor-pointer border-l-[3px] ${meta.borderClass}`
                                                        : 'bg-white hover:bg-gray-50/60 cursor-default border-l-[3px] border-transparent'
                                                   }`}
                                    >
                                        {/* Icon */}
                                        <span className={`mt-0.5 shrink-0 rounded-lg p-1.5
                                            ${isUnread ? 'bg-white/70' : 'bg-gray-100'}`}>
                                            <Icon size={15} className={meta.iconClass} />
                                        </span>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-[13px] font-semibold leading-tight truncate
                                                    ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>
                                                    {notif.title}
                                                </p>
                                                <span className="shrink-0 text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                                                    {relativeTime(notif.created_at)}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[12px] text-gray-500 leading-snug line-clamp-2">
                                                {notif.message}
                                            </p>
                                            <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5
                                                text-[10px] font-semibold
                                                ${isUnread ? 'bg-white/60 text-gray-600' : 'bg-gray-100 text-gray-500'}`}>
                                                {meta.label}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
                        <p className="text-[11px] text-gray-400 text-center">
                            Notifications refresh automatically every 60 seconds
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
