import React from 'react';
import {
  getActivityColor,
  getActivityIcon,
  getWeekGrid,
  formatActivityName
} from '../../utils/calendarUtils';
import { Clock, MapPin, Sprout, Plus } from 'lucide-react';

const WeekView = ({
  currentDate,
  activitiesByDate = {},
  onSelectDate,
  onSelectActivity,
  onNewNote,
  backendUnavailable
}) => {
  const weekDays = getWeekGrid(currentDate);

  return (
    <div className="flex flex-col flex-1 bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs transition-colors">

      {/* 7 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-slate-700 flex-1 min-h-[550px]">
        {weekDays.map((day) => {
          const dayActivities = activitiesByDate[day.dateKey] || [];

          return (
            <div
              key={day.dateKey}
              className={`group flex flex-col p-3 transition-colors ${day.isToday ? 'bg-emerald-50/40 dark:bg-slate-900/60' : 'bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/30'
                }`}
            >
              {/* Day Header */}
              <div
                onClick={() => onSelectDate(day.dateKey)}
                className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-slate-700 cursor-pointer group mb-3"
              >
                <div>
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider block">
                    {day.dayName}
                  </span>
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 text-sm font-bold rounded-full mt-0.5 transition-all ${day.isToday
                        ? 'bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-500/30 ring-2 ring-emerald-300 dark:bg-emerald-500 dark:text-slate-950 dark:ring-emerald-400'
                        : 'text-gray-900 dark:text-white group-hover:bg-gray-100 dark:group-hover:bg-slate-800'
                      }`}
                  >
                    {day.dayNumber}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={backendUnavailable}
                    onClick={(e) => {
                      if(e) e.stopPropagation();
                      if (onNewNote && !backendUnavailable) onNewNote(day.dateKey);
                    }}
                    title={backendUnavailable ? "Server unavailable" : "Add Note"}
                    className={`p-1.5 rounded-md transition-colors ${backendUnavailable 
                        ? "text-gray-300 dark:text-slate-600 cursor-not-allowed opacity-50"
                        : "text-emerald-600/70 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-500/70 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/30"
                      }`}
                  >
                    <Plus size={14} />
                  </button>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    {dayActivities.length}
                  </span>
                </div>
              </div>

              {/* Day Activities List */}
              <div className="flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden max-h-[480px] pr-1 calendar-cell-scroll">
                {dayActivities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-28 text-gray-400 dark:text-slate-600 text-xs italic">
                    No activities
                  </div>
                ) : (
                  dayActivities.map((act) => {
                    const style = getActivityColor(act);
                    const icon = getActivityIcon(act.activity_type || act.activity_name, 14);

                    return (
                      <div
                        key={act.id || act.activity_id || Math.random()}
                        onClick={() => onSelectActivity(act)}
                        className={`p-2.5 rounded-xl border transition-all hover:scale-[1.02] cursor-pointer shadow-xs ${style.bg} ${style.border}`}
                      >
                        <div className="flex items-start justify-between gap-1.5 mb-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-xs min-w-0 flex-1">
                            <span className={`shrink-0 ${style.text}`}>{icon}</span>
                            <span className={`truncate ${style.text}`}>
                              {formatActivityName(act.title || act.activity_name || act.activity_type)}
                            </span>
                          </div>
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shrink-0 ${style.badge}`}>
                            {style.label}
                          </span>
                        </div>

                        {/* Scheduled time & planting / field */}
                        <div className="space-y-1 text-[11px] text-gray-600 dark:text-slate-300/80">
                          {act.scheduled_time && (
                            <div className="flex items-center gap-1 min-w-0">
                              <Clock size={11} className="text-gray-400 dark:text-slate-400 shrink-0" />
                              <span className="truncate">{act.scheduled_time}</span>
                            </div>
                          )}
                          {act.field_name && (
                            <div className="flex items-center gap-1 min-w-0">
                              <MapPin size={11} className="text-gray-400 dark:text-slate-400 shrink-0" />
                              <span className="truncate">{act.field_name}</span>
                            </div>
                          )}
                          {act.planting_name && (
                            <div className="flex items-center gap-1 min-w-0">
                              <Sprout size={11} className="text-emerald-600 dark:text-slate-400 shrink-0" />
                              <span className="truncate">{act.planting_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};

export default WeekView;
