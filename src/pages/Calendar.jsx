import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getActivities, getNotes } from '../services/api';
import { groupActivitiesByDate, formatDateKey } from '../utils/calendarUtils';

import CalendarHeader from '../components/calendar/CalendarHeader';
import MonthView from '../components/calendar/MonthView';
import WeekView from '../components/calendar/WeekView';
import DayView from '../components/calendar/DayView';
import DateDetailPanel from '../components/calendar/DateDetailPanel';
import ActivityDetailModal from '../components/calendar/ActivityDetailModal';
import NoteModal from '../components/calendar/NoteModal';
import { useToast } from '../context/ToastContext';
import { Calendar as CalendarIcon, Loader2, AlertCircle } from 'lucide-react';

const Calendar = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const [year, month, day] = dateParam.split('-');
      const parsed = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day'
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [calendarFetchError, setCalendarFetchError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Interactivity state
  const [selectedDateKey, setSelectedDateKey] = useState(() => searchParams.get('date') || null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const toast = useToast();

  // Initial load
  const fetchCalendarData = useCallback(async (isSilent = false, isRetry = false) => {
    if (isRetry) setIsRetrying(true);
    else if (!isSilent) setLoading(true);
    else setIsRefreshing(true);
    
    setCalendarFetchError(false);

    try {
      const [actRes, notesRes] = await Promise.all([
        getActivities({ limit: 500, include_system_generated: 1 }),
        getNotes()
      ]);
      const list = actRes.data?.data || [];
      const notesList = (notesRes.data?.data || []).map(n => ({ ...n, is_note: true }));

      setActivities([...list, ...notesList]);
    } catch (err) {
      console.error('Calendar fetch error:', err);
      setCalendarFetchError(true);
    } finally {
      if (isRetry) setIsRetrying(false);
      else if (!isSilent) setLoading(false);
      else setIsRefreshing(false);
    }
  }, []);

  const handleRetry = () => {
    fetchCalendarData(false, true);
  };

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Sync date param from URL if changed
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      setSelectedDateKey(dateParam);
    } else {
      setSelectedDateKey(null);
    }
  }, [searchParams]);

  // Navigation actions
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else if (viewMode === 'day') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else if (viewMode === 'day') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateKey(formatDateKey(today));
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger when user typing in input fields
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'Escape') {
        setSelectedDateKey(null);
        setSelectedActivity(null);
      } else if (e.key === 't' || e.key === 'T') {
        handleToday();
      } else if (e.key === 'm' || e.key === 'M') {
        setViewMode('month');
      } else if (e.key === 'w' || e.key === 'W') {
        setViewMode('week');
      } else if (e.key === 'd' || e.key === 'D') {
        setViewMode('day');
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDate, viewMode]);

  // Filter activities based on query & status
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // Status filter
      if (statusFilter !== 'all') {
        const s = String(act.status || '').toLowerCase();
        if (statusFilter === 'overdue') {
          const d = act.planned_date || act.activity_date || act.scheduled_date;
          if (!d) return false;
          const actDate = new Date(d);
          actDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (s === 'completed' || s === 'cancelled' || s === 'skipped' || actDate >= today) return false;
        } else if (s !== statusFilter) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = String(act.activity_name || act.activity_type || '').toLowerCase();
        const planting = String(act.planting_name || '').toLowerCase();
        const field = String(act.field_name || '').toLowerCase();
        return name.includes(q) || planting.includes(q) || field.includes(q);
      }

      return true;
    });
  }, [activities, statusFilter, searchQuery]);

  const activitiesByDate = useMemo(() => {
    return groupActivitiesByDate(filteredActivities);
  }, [filteredActivities]);

  const handleSelectDate = (dateKey) => {
    setSelectedDateKey(dateKey);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('date', dateKey);
    setSearchParams(newParams, { replace: true });
  };

  const handleCloseDatePanel = () => {
    setSelectedDateKey(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('date');
    setSearchParams(newParams, { replace: true });
  };

  const handleActivityUpdated = (updatedAct) => {
    setActivities((prev) =>
      prev.map((a) =>
        ((a.id === updatedAct.id && a.is_note === updatedAct.is_note) || a.activity_id === updatedAct.activity_id) ? updatedAct : a
      )
    );
  };

  const handleNoteSaved = (savedNote) => {
    setActivities((prev) => {
      const exists = prev.find(a => a.id === savedNote.id && a.is_note);
      if (exists) {
        return prev.map(a => (a.id === savedNote.id && a.is_note) ? savedNote : a);
      }
      return [...prev, savedNote];
    });
    setSelectedActivity(null);
  };

  const handleNoteDeleted = (noteId) => {
    setActivities((prev) => prev.filter(a => !(a.id === noteId && a.is_note)));
    setSelectedActivity(null);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">


      {/* Upper Left Page Header (Matches Activities, Plantings, Analytics, Harvests) */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Crop Activity Calendar
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Central schedule for crop lifecycle events, irrigation, fertilizing, and harvests
          </p>
        </div>
        {isRetrying && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm self-start mt-1">
            <Loader2 size={14} className="animate-spin text-slate-500 dark:text-slate-400" />
            Retrying...
          </div>
        )}
      </div>

      {calendarFetchError && (
        <div className="bg-red-50 dark:bg-slate-800/80 rounded-xl shadow-sm border border-red-100 dark:border-red-900/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-red-800 dark:text-red-400">
            <AlertCircle size={24} className="text-red-500 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">Unable to load calendar activities</h3>
              <p className="text-xs text-red-600 dark:text-red-300/80 mt-0.5">
                Activity and schedule data could not be retrieved. Check the server connection and try again.
              </p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {/* Toolbar (Positioned directly below header, outside any wrapping container) */}
      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onRefresh={() => fetchCalendarData(true)}
        isRefreshing={isRefreshing}
        onNewActivity={() => navigate('/activities')}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      {/* Calendar Grid Container (Placed directly below toolbar) */}
      <div className="flex-1 flex flex-col relative">
        {(loading || isRetrying) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-[1px] rounded-2xl">
            <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-full shadow-lg border border-gray-100 dark:border-slate-700 flex items-center gap-2">
               <Loader2 size={16} className="animate-spin text-emerald-600 dark:text-emerald-400" />
               <span className="text-xs font-medium text-gray-600 dark:text-slate-300">Loading activities...</span>
            </div>
          </div>
        )}
          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              activitiesByDate={activitiesByDate}
              onSelectDate={handleSelectDate}
              onSelectActivity={setSelectedActivity}
              onNewNote={(dateKey) => {
                handleSelectDate(dateKey);
                setIsNoteModalOpen(true);
              }}
              backendUnavailable={calendarFetchError}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              currentDate={currentDate}
              activitiesByDate={activitiesByDate}
              onSelectDate={handleSelectDate}
              onSelectActivity={setSelectedActivity}
              onNewNote={(dateKey) => {
                handleSelectDate(dateKey);
                setIsNoteModalOpen(true);
              }}
              backendUnavailable={calendarFetchError}
            />
          )}
          {viewMode === 'day' && (
            <DayView
              currentDate={currentDate}
              activitiesByDate={activitiesByDate}
              onSelectActivity={setSelectedActivity}
              onNewNote={(dateKey) => {
                handleSelectDate(dateKey);
                setIsNoteModalOpen(true);
              }}
              backendUnavailable={calendarFetchError}
            />
          )}
        </div>

      {/* Date Activities Side Panel */}
      {selectedDateKey && (
        <DateDetailPanel
          selectedDateKey={selectedDateKey}
          activities={activitiesByDate[selectedDateKey] || []}
          onClose={handleCloseDatePanel}
          onSelectActivity={setSelectedActivity}
        />
      )}

      {/* Activity Details & Edit Modal */}
      {selectedActivity && !selectedActivity.is_note && (
        <ActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onActivityUpdated={handleActivityUpdated}
        />
      )}

      {/* Note Modal (Create & Edit) */}
      {(isNoteModalOpen || (selectedActivity && selectedActivity.is_note)) && (
        <NoteModal
          note={selectedActivity?.is_note ? selectedActivity : null}
          selectedDate={selectedDateKey}
          onClose={() => {
            setIsNoteModalOpen(false);
            if (selectedActivity?.is_note) setSelectedActivity(null);
          }}
          onNoteSaved={handleNoteSaved}
          onNoteDeleted={handleNoteDeleted}
          onSuccess={toast.success}
          onError={toast.error}
        />
      )}

    </div>
  );
};

export default Calendar;
