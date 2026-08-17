// Utilities for AgriTrack Enterprise Calendar Module

import React from 'react';
import {
  Shovel, Sprout, FlaskConical, Droplets, Bug,
  Scissors, Wheat, Package, Eye, Clock, CheckCircle2,
  AlertCircle, HelpCircle, StickyNote
} from 'lucide-react';

/**
 * Format a Date or date string to 'YYYY-MM-DD'
 */
export const formatDateKey = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Check if a given date string or Date is today
 */
export const isToday = (dateInput) => {
  const todayKey = formatDateKey(new Date());
  const dateKey = formatDateKey(dateInput);
  return todayKey === dateKey && todayKey !== '';
};

/**
 * Check if an activity is overdue (pending/ongoing and scheduled before today)
 */
export const isOverdueActivity = (activity) => {
  const d = activity?.planned_date || activity?.activity_date;
  if (!activity || !d) return false;
  const status = String(activity.status || '').toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'skipped') return false;

  const actDate = new Date(d);
  actDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return actDate < today;
};

/**
 * Check if an activity is due today
 */
export const isDueTodayActivity = (activity) => {
  const d = activity?.planned_date || activity?.activity_date;
  if (!activity || !d) return false;
  const status = String(activity.status || '').toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'skipped') return false;
  return isToday(d);
};

/**
 * Resolves color palette styling for activity badges based on status and activity type.
 * Supports dual Light Mode & Dark Mode aesthetics seamlessly.
 */
export const getActivityColor = (activity) => {
  // If it's a Note
  if (activity.is_note) {
    return {
      bg: 'bg-slate-50 hover:bg-slate-100/90 text-slate-900 border-slate-200 dark:bg-slate-900/70 dark:hover:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/60',
      border: 'border-slate-300 dark:border-slate-700/60',
      text: 'text-slate-800 dark:text-slate-300',
      dot: 'bg-slate-500 dark:bg-slate-400',
      badge: 'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      label: 'Note'
    };
  }

  const status = String(activity?.status || '').toLowerCase();
  const type = String(activity?.activity_type || activity?.activity_name || '').toLowerCase();

  if (status === 'completed') {
    return {
      bg: 'bg-emerald-50 hover:bg-emerald-100/90 text-emerald-900 border-emerald-200 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/80 dark:text-emerald-300 dark:border-emerald-700/60',
      border: 'border-emerald-300 dark:border-emerald-700/60',
      text: 'text-emerald-800 dark:text-emerald-300',
      dot: 'bg-emerald-500 dark:bg-emerald-400',
      badge: 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/90 dark:text-emerald-200 dark:border-emerald-700',
      label: 'Completed'
    };
  }

  if (status === 'cancelled') {
    return {
      bg: 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 border-slate-300 dark:bg-slate-900/70 dark:hover:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/60',
      border: 'border-slate-300 dark:border-slate-700/60',
      text: 'text-slate-500 line-through dark:text-slate-400',
      dot: 'bg-slate-400 dark:bg-slate-500',
      badge: 'bg-slate-200 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      label: 'Cancelled'
    };
  }

  if (isOverdueActivity(activity)) {
    return {
      bg: 'bg-rose-50 hover:bg-rose-100/90 text-rose-900 border-rose-200 dark:bg-rose-950/70 dark:hover:bg-rose-900/80 dark:text-rose-300 dark:border-rose-700/60',
      border: 'border-rose-300 dark:border-rose-700/60',
      text: 'text-rose-800 dark:text-rose-300',
      dot: 'bg-rose-500',
      badge: 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900/90 dark:text-rose-200 dark:border-rose-700',
      label: 'Overdue'
    };
  }

  if (isDueTodayActivity(activity)) {
    return {
      bg: 'bg-amber-50 hover:bg-amber-100/90 text-amber-900 border-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 dark:text-amber-300 dark:border-amber-700/60',
      border: 'border-amber-300 dark:border-amber-700/60',
      text: 'text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500 dark:bg-amber-400',
      badge: 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/90 dark:text-amber-200 dark:border-amber-700',
      label: 'Due Today'
    };
  }

  // Type-based colors for upcoming activities
  if (type.includes('harvest')) {
    return {
      bg: 'bg-purple-50 hover:bg-purple-100/90 text-purple-900 border-purple-200 dark:bg-purple-950/70 dark:hover:bg-purple-900/80 dark:text-purple-300 dark:border-purple-700/60',
      border: 'border-purple-300 dark:border-purple-700/60',
      text: 'text-purple-800 dark:text-purple-300',
      dot: 'bg-purple-500 dark:bg-purple-400',
      badge: 'bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-900/90 dark:text-purple-200 dark:border-purple-700',
      label: 'Upcoming Harvest'
    };
  }

  if (type.includes('irrigat') || type.includes('water')) {
    return {
      bg: 'bg-orange-50 hover:bg-orange-100/90 text-orange-900 border-orange-200 dark:bg-orange-950/70 dark:hover:bg-orange-900/80 dark:text-orange-300 dark:border-orange-700/60',
      border: 'border-orange-300 dark:border-orange-700/60',
      text: 'text-orange-800 dark:text-orange-300',
      dot: 'bg-orange-500 dark:bg-orange-400',
      badge: 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/90 dark:text-orange-200 dark:border-orange-700',
      label: 'Irrigation'
    };
  }

  if (type.includes('fertiliz')) {
    return {
      bg: 'bg-teal-50 hover:bg-teal-100/90 text-teal-900 border-teal-200 dark:bg-teal-950/70 dark:hover:bg-teal-900/80 dark:text-teal-300 dark:border-teal-700/60',
      border: 'border-teal-300 dark:border-teal-700/60',
      text: 'text-teal-800 dark:text-teal-300',
      dot: 'bg-teal-500 dark:bg-teal-400',
      badge: 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-900/90 dark:text-teal-200 dark:border-teal-700',
      label: 'Fertilizer'
    };
  }

  // Default Upcoming -> Blue
  return {
    bg: 'bg-blue-50 hover:bg-blue-100/90 text-blue-900 border-blue-200 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 dark:text-blue-300 dark:border-blue-700/60',
    border: 'border-blue-300 dark:border-blue-700/60',
    text: 'text-blue-800 dark:text-blue-300',
    dot: 'bg-blue-500 dark:bg-blue-400',
    badge: 'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/90 dark:text-blue-200 dark:border-blue-700',
    label: 'Upcoming'
  };
};

/**
 * Returns appropriate icon element for activity type
 */
export const getActivityIcon = (activityType, size = 14, isNote = false) => {
  if (isNote) return <StickyNote size={size} />;
  const type = String(activityType || '').toLowerCase();
  if (type.includes('land prep') || type.includes('plow')) return <Shovel size={size} />;
  if (type.includes('seed') || type.includes('transplant')) return <Sprout size={size} />;
  if (type.includes('fertiliz')) return <FlaskConical size={size} />;
  if (type.includes('irrigat') || type.includes('water')) return <Droplets size={size} />;
  if (type.includes('pest') || type.includes('spray')) return <Bug size={size} />;
  if (type.includes('weed')) return <Scissors size={size} />;
  if (type.includes('harvest')) return <Wheat size={size} />;
  if (type.includes('inspect') || type.includes('monitor')) return <Eye size={size} />;
  return <Package size={size} />;
};

/**
 * Generates the array of day objects for a given month view (including padding days from prev/next month)
 */
export const getMonthGrid = (year, month) => {
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun, 6 = Sat
  const totalDays = lastDayOfMonth.getDate();

  const grid = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    grid.push({
      date: d,
      dateKey: formatDateKey(d),
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: isToday(d)
    });
  }

  // Current month days
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    grid.push({
      date: d,
      dateKey: formatDateKey(d),
      dayNumber: i,
      isCurrentMonth: true,
      isToday: isToday(d)
    });
  }

  // Next month padding to complete 35 or 42 grid cells
  const targetCells = grid.length <= 35 ? 35 : 42;
  const totalNeeded = targetCells - grid.length;

  for (let i = 1; i <= totalNeeded; i++) {
    const d = new Date(year, month + 1, i);
    grid.push({
      date: d,
      dateKey: formatDateKey(d),
      dayNumber: i,
      isCurrentMonth: false,
      isToday: isToday(d)
    });
  }

  return grid;
};

/**
 * Generates array of 7 day objects for a 7-day week containing targetDate
 */
export const getWeekGrid = (targetDate) => {
  const d = new Date(targetDate);
  const dayOfWeek = d.getDay(); // 0 = Sun
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);

  const grid = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(sunday);
    current.setDate(sunday.getDate() + i);
    grid.push({
      date: current,
      dateKey: formatDateKey(current),
      dayNumber: current.getDate(),
      dayName: current.toLocaleDateString('default', { weekday: 'short' }),
      isToday: isToday(current)
    });
  }
  return grid;
};

/**
 * Groups a list of activities by dateKey ('YYYY-MM-DD')
 */
export const groupActivitiesByDate = (activitiesList = []) => {
  const map = {};
  activitiesList.forEach((act) => {
    const key = formatDateKey(act.note_date || act.planned_date || act.activity_date || act.scheduled_date);
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(act);
  });
  return map;
};

/**
 * Format activity names for user-facing display.
 * Converts 'first_fertilizing' -> 'First Fertilizing'
 */
export const formatActivityName = (name) => {
  if (!name) return 'Unknown';
  return String(name)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
};
