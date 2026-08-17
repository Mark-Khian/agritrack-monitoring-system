import React from 'react';
import {
  getActivityColor,
  getActivityIcon,
  getMonthGrid,
  formatActivityName
} from '../../utils/calendarUtils';
import { Clock, Plus } from 'lucide-react';

const WEEKDAYS = [
  { short: 'S', full: 'Sun' },
  { short: 'M', full: 'Mon' },
  { short: 'T', full: 'Tue' },
  { short: 'W', full: 'Wed' },
  { short: 'T', full: 'Thu' },
  { short: 'F', full: 'Fri' },
  { short: 'S', full: 'Sat' },
];

const MonthView = ({
  currentDate,
  activitiesByDate = {},
  onSelectDate,
  onSelectActivity,
  onNewNote,
  backendUnavailable
}) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const gridDays = getMonthGrid(year, month);

  return (
    <div className="flex flex-col flex-1 bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs transition-colors w-full max-w-full">

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900/90 text-center py-2.5 font-semibold text-xs text-gray-500 dark:text-slate-400 tracking-wider uppercase">
        {WEEKDAYS.map((day, idx) => (
          <div key={idx} className={idx === 0 || idx === 6 ? 'text-emerald-600 dark:text-emerald-500/80 font-bold' : ''}>
            <span className="sm:hidden">{day.short}</span>
            <span className="hidden sm:inline">{day.full}</span>
          </div>
        ))}
      </div>

      {/* 7-Column Days Grid */}
      <div className="grid grid-cols-7 flex-1 min-h-[480px] sm:min-h-[580px] divide-x divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-950 w-full overflow-hidden">
        {gridDays.map((cell) => {
          const dayActivities = activitiesByDate[cell.dateKey] || [];
          const maxDisplay = 3;
          const visibleActivities = dayActivities.slice(0, maxDisplay);
          const hiddenCount = dayActivities.length - maxDisplay;

          return (
            <div
              key={cell.dateKey}
              onClick={() => onSelectDate(cell.dateKey)}
              className={`group relative flex flex-col p-1 sm:p-2 min-h-[75px] sm:min-h-[95px] md:min-h-[110px] transition-all cursor-pointer overflow-hidden ${cell.isCurrentMonth
                  ? 'bg-white hover:bg-slate-50 text-gray-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/60 dark:text-slate-200'
                  : 'bg-gray-50/70 text-gray-400 hover:bg-gray-100 dark:bg-slate-950/70 dark:text-slate-600 dark:hover:bg-slate-900/40'
                }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 text-[11px] sm:text-xs font-bold rounded-full transition-all ${cell.isToday
                      ? 'bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-500/30 ring-1 sm:ring-2 ring-emerald-300 dark:bg-emerald-500 dark:text-slate-950 dark:ring-emerald-400'
                      : cell.isCurrentMonth
                        ? 'text-gray-700 group-hover:text-gray-900 dark:text-slate-300 dark:group-hover:text-white'
                        : 'text-gray-400 dark:text-slate-600'
                    }`}
                >
                  {cell.dayNumber}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    disabled={backendUnavailable}
                    onClick={(e) => {
                      if(e) e.stopPropagation();
                      if (onNewNote && !backendUnavailable) onNewNote(cell.dateKey);
                    }}
                    title={backendUnavailable ? "Server unavailable" : "Add Note"}
                    className={`p-1 rounded-md transition-colors ${backendUnavailable 
                        ? "text-gray-300 dark:text-slate-600 cursor-not-allowed opacity-50"
                        : "text-emerald-600/70 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-500/70 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/30"
                      }`}
                  >
                    <Plus size={14} />
                  </button>

                  {dayActivities.length > 0 && (
                    <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/60">
                      {dayActivities.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Activity Badges Container */}
              <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden max-h-[60px] sm:max-h-[75px] md:max-h-[85px] calendar-cell-scroll pr-0.5">

                {/* Mobile View: Compact Indicators */}
                <div className="flex sm:hidden flex-wrap gap-1 items-center pt-0.5">
                  {visibleActivities.map((act) => {
                    const style = getActivityColor(act);
                    return (
                      <span
                        key={act.id || act.activity_id || Math.random()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectActivity(act);
                        }}
                        className={`w-2.5 h-2.5 rounded-full border shadow-xs ${style.dot} ${style.border}`}
                        title={`${act.activity_name || 'Activity'}`}
                      />
                    );
                  })}
                  {hiddenCount > 0 && (
                    <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400">
                      +{hiddenCount}
                    </span>
                  )}
                </div>

                {/* Desktop / Tablet View: Text Badges */}
                <div className="hidden sm:block space-y-1">
                  {visibleActivities.map((act) => {
                    const style = getActivityColor(act);
                    const icon = getActivityIcon(act.activity_type || act.activity_name, 12);

                    return (
                      <div
                        key={act.id || act.activity_id || Math.random()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectActivity(act);
                        }}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium border shadow-xs transition-all hover:scale-[1.02] cursor-pointer min-w-0 ${style.bg} ${style.border} ${style.text}`}
                        title={`${act.activity_name || 'Activity'} (${act.status || 'Pending'}) - ${act.field_name || ''}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className="shrink-0">{icon}</span>
                        <span className="truncate font-semibold tracking-tight">
                          {formatActivityName(act.title || act.activity_name || act.activity_type)}
                        </span>
                      </div>
                    );
                  })}

                  {/* Overflow Badge */}
                  {hiddenCount > 0 && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDate(cell.dateKey);
                      }}
                      className="px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:border-emerald-800/60 rounded-md transition-all text-center tracking-tight"
                    >
                      +{hiddenCount} more
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default MonthView;
