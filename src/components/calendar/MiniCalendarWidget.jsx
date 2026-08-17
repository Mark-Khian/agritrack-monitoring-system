import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMonthGrid,
  formatDateKey,
  isToday,
  groupActivitiesByDate
} from '../../utils/calendarUtils';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  ArrowRight, ExternalLink
} from 'lucide-react';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MiniCalendarWidget = ({ activities = [] }) => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const gridDays = getMonthGrid(year, month);
  const activitiesByDate = groupActivitiesByDate(activities);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (dateKey, e) => {
    e.stopPropagation();
    navigate(`/calendar?date=${dateKey}`);
  };

  const handleOpenCalendar = (e) => {
    e?.stopPropagation();
    navigate('/calendar');
  };

  const todayStr = new Date().toLocaleDateString('default', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div
      onClick={handleOpenCalendar}
      className="group relative flex flex-col justify-between bg-white border border-gray-100 dark:bg-slate-900/90 dark:border-slate-800 rounded-3xl p-4 shadow-sm hover:shadow-xl transition-all duration-300 hover:border-emerald-500/30 cursor-pointer overflow-hidden text-gray-900 dark:text-white"
    >
      
      {/* Ambient background glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />

      <div>
        {/* Header Title & Month Prev/Next */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800/80 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 shadow-xs">
              <CalendarIcon size={18} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm tracking-tight flex items-center gap-1.5">
                <span>{currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                Today: <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{todayStr}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNextMonth}
              title="Next Month"
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* 7-Column Mini Grid */}
        <div className="grid grid-cols-7 text-center mb-1 font-bold text-[10px] text-gray-400 dark:text-slate-400 uppercase tracking-wider">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {gridDays.map((cell) => {
            const hasActivities = (activitiesByDate[cell.dateKey] || []).length > 0;

            return (
              <div
                key={cell.dateKey}
                onClick={(e) => handleDateClick(cell.dateKey, e)}
                className={`relative flex flex-col items-center justify-center py-1 rounded-lg text-xs font-semibold transition-all ${
                  cell.isToday
                    ? 'bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-500/30 ring-1 ring-emerald-300 dark:bg-emerald-500 dark:text-slate-950'
                    : cell.isCurrentMonth
                    ? 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white'
                    : 'text-gray-300 hover:bg-gray-50 dark:text-slate-600 dark:hover:bg-slate-800/40'
                }`}
              >
                <span>{cell.dayNumber}</span>

                {/* Activity Dot Indicator */}
                {hasActivities && (
                  <span
                    className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                      cell.isToday ? 'bg-white dark:bg-slate-950' : 'bg-emerald-500 dark:bg-emerald-400 shadow-xs'
                    }`}
                  />
                )}
              </div>
            );
          })}
          {/* Reserve space for 6 weeks (42 days) to prevent height jumping */}
          {Array.from({ length: Math.max(0, 42 - gridDays.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="py-1 text-xs invisible pointer-events-none">&nbsp;</div>
          ))}
        </div>
      </div>

      {/* Card Footer: Open Calendar CTA */}
      <div className="pt-3 border-t border-gray-100 dark:border-slate-800/80 mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-slate-400 font-medium group-hover:text-gray-700 dark:group-hover:text-slate-300 transition-colors">
          Click preview to expand
        </span>
        <button
          onClick={handleOpenCalendar}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all group-hover:scale-105"
        >
          <span>Open Calendar</span>
          <ArrowRight size={14} />
        </button>
      </div>

    </div>
  );
};

export default MiniCalendarWidget;
