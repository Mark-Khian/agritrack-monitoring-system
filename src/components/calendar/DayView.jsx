import React from 'react';
import {
  getActivityColor,
  getActivityIcon,
  formatDateKey,
  isToday,
  formatActivityName
} from '../../utils/calendarUtils';
import { Clock, MapPin, Sprout, ClipboardCheck, AlertCircle, FileText, Plus } from 'lucide-react';

const DayView = ({
  currentDate,
  activitiesByDate = {},
  onSelectActivity,
  onNewNote,
  backendUnavailable
}) => {
  const dateKey = formatDateKey(currentDate);
  const dayActivities = activitiesByDate[dateKey] || [];
  const isCurrentDayToday = isToday(currentDate);

  // Time slots from 06:00 AM to 08:00 PM
  const timeSlots = [
    '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
    '06:00 PM', '07:00 PM', '08:00 PM'
  ];

  // Helper to match activity to time slot or general list
  const getActivitiesForSlot = (slotTime) => {
    return dayActivities.filter((act) => {
      if (!act.scheduled_time) return false;
      const t = String(act.scheduled_time).toLowerCase();
      const slotHour = slotTime.split(':')[0];
      const slotAmpm = slotTime.split(' ')[1].toLowerCase();
      return t.includes(slotHour) && t.includes(slotAmpm);
    });
  };

  const unscheduledActivities = dayActivities.filter((act) => !act.scheduled_time);

  return (
    <div className="flex flex-col flex-1 bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs transition-colors">
      
      {/* Day Overview Banner */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200 dark:bg-slate-900/90 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold shadow-md ${
              isCurrentDayToday
                ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-emerald-500/30'
                : 'bg-gray-200 text-gray-800 dark:bg-slate-800 dark:text-white border border-gray-300 dark:border-slate-700'
            }`}
          >
            <span className="text-[10px] uppercase tracking-wider leading-none">
              {currentDate.toLocaleDateString('default', { weekday: 'short' })}
            </span>
            <span className="text-lg leading-tight">
              {currentDate.getDate()}
            </span>
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              {currentDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {dayActivities.length} {dayActivities.length === 1 ? 'activity' : 'activities'} scheduled for this day
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isCurrentDayToday && (
            <span className="hidden sm:inline-block px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40 rounded-full text-xs font-semibold tracking-wide">
              Today
            </span>
          )}
          <button
            disabled={backendUnavailable}
            onClick={(e) => {
              e.stopPropagation();
              if (onNewNote && !backendUnavailable) onNewNote(dateKey);
            }}
            title={backendUnavailable ? "Server unavailable" : "Add Note"}
            className={`flex items-center justify-center p-2 sm:px-3 sm:py-1.5 text-xs font-semibold rounded-xl shadow-md transition-all shrink-0 ${
              backendUnavailable
                ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-50 dark:bg-slate-700 dark:text-slate-500"
                : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            }`}
          >
            <Plus size={16} className="sm:mr-1" />
            <span className="hidden sm:inline">Add Note</span>
          </button>
        </div>
      </div>

      {/* Unscheduled / All Day Activities Section */}
      {unscheduledActivities.length > 0 && (
        <div className="p-4 bg-gray-50/50 border-b border-gray-200 dark:bg-slate-900/50 dark:border-slate-700">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            All-Day / Flexible Schedule Activities ({unscheduledActivities.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unscheduledActivities.map((act) => {
              const style = getActivityColor(act);
              const icon = getActivityIcon(act.activity_type || act.activity_name, 16);

              return (
                <div
                  key={act.id || act.activity_id}
                  onClick={() => onSelectActivity(act)}
                  className={`p-3 rounded-xl border transition-all hover:scale-[1.01] cursor-pointer shadow-xs ${style.bg} ${style.border}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 font-bold text-sm text-gray-900 dark:text-white">
                      <span className={style.text}>{icon}</span>
                      <span>{formatActivityName(act.title || act.activity_name || act.activity_type)}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 dark:text-slate-300 space-y-1">
                    {act.planting_name && (
                      <div className="flex items-center gap-1.5">
                        <Sprout size={12} className="text-emerald-600 dark:text-emerald-400" />
                        <span>{act.planting_name}</span>
                      </div>
                    )}
                    {act.field_name && (
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-gray-400 dark:text-slate-400" />
                        <span>{act.field_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly Schedule Timeline */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-gray-200 dark:divide-slate-700 p-2 sm:p-4 max-h-[550px] calendar-cell-scroll">
        {timeSlots.map((slot) => {
          const slotActs = getActivitiesForSlot(slot);

          return (
            <div key={slot} className="flex items-start gap-4 py-3 group">
              <div className="w-20 text-xs font-semibold text-gray-500 dark:text-slate-400 pt-1 shrink-0 font-mono">
                {slot}
              </div>

              <div className="flex-1 min-h-[36px] border-l-2 border-gray-200 dark:border-slate-700 pl-4 space-y-2">
                {slotActs.length === 0 ? (
                  <div className="h-6 flex items-center text-xs text-gray-400 dark:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    No scheduled activity
                  </div>
                ) : (
                  slotActs.map((act) => {
                    const style = getActivityColor(act);
                    const icon = getActivityIcon(act.activity_type || act.activity_name, 16);

                    return (
                      <div
                        key={act.id || act.activity_id}
                        onClick={() => onSelectActivity(act)}
                        className={`p-3 rounded-xl border transition-all hover:scale-[1.01] cursor-pointer shadow-xs ${style.bg} ${style.border}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 font-bold text-sm text-gray-900 dark:text-white">
                            <span className={style.text}>{icon}</span>
                            <span>{formatActivityName(act.title || act.activity_name || act.activity_type)}</span>
                          </div>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${style.badge}`}>
                            {style.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-300">
                          {act.planting_name && (
                            <div className="flex items-center gap-1.5">
                              <Sprout size={12} className="text-emerald-600 dark:text-emerald-400" />
                              <span>{act.planting_name}</span>
                            </div>
                          )}
                          {act.field_name && (
                            <div className="flex items-center gap-1.5">
                              <MapPin size={12} className="text-gray-400 dark:text-slate-400" />
                              <span>{act.field_name}</span>
                            </div>
                          )}
                          {act.notes && (
                            <div className="flex items-center gap-1.5 col-span-full text-gray-500 dark:text-slate-400 italic">
                              <FileText size={12} className="shrink-0" />
                              <span className="truncate">{act.notes}</span>
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

export default DayView;
