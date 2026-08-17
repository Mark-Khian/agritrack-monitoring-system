import React from 'react';
import {
  getActivityColor,
  getActivityIcon,
  formatActivityName
} from '../../utils/calendarUtils';
import {
  X, Calendar as CalendarIcon, Clock, MapPin, Sprout,
  FileText, ChevronRight, CheckCircle2, AlertCircle
} from 'lucide-react';

const DateDetailPanel = ({
  selectedDateKey,
  activities = [],
  onClose,
  onSelectActivity
}) => {
  if (!selectedDateKey) return null;

  const [year, month, day] = selectedDateKey.split('-');
  const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  const formattedDate = isNaN(dateObj.getTime())
    ? selectedDateKey
    : dateObj.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      
      {/* Backdrop overlay click to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Side Panel Drawer */}
      <div className="relative w-full max-w-md bg-white border-l border-gray-200 dark:bg-slate-900 dark:border-slate-800 shadow-2xl h-full flex flex-col z-10 animate-slideLeft">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/90 dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 flex items-center justify-center">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                Scheduled Activities
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {formattedDate}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-3.5 calendar-cell-scroll">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400 dark:text-slate-500 space-y-2">
              <CalendarIcon size={40} className="text-gray-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-gray-600 dark:text-slate-400">No activities scheduled for this date</p>
              <p className="text-xs text-gray-400 dark:text-slate-600">Select another date or add a new farming activity.</p>
            </div>
          ) : (
            activities.map((act) => {
              const style = getActivityColor(act);
              const icon = getActivityIcon(act.activity_type || act.activity_name, 16);

              return (
                <div
                  key={act.id || act.activity_id || Math.random()}
                  onClick={() => onSelectActivity(act)}
                  className={`group relative p-4 rounded-2xl border transition-all duration-200 hover:scale-[1.02] cursor-pointer shadow-md ${style.bg} ${style.border}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl bg-white/80 dark:bg-slate-900/60 ${style.text}`}>
                        {icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm tracking-tight group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                          {formatActivityName(act.title || act.activity_name || act.activity_type)}
                        </h4>
                        <span className="text-[11px] text-gray-500 dark:text-slate-400 capitalize">
                          {formatActivityName(act.activity_type || 'General')}
                        </span>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full shadow-xs shrink-0 ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-slate-300 pt-2 border-t border-gray-200/80 dark:border-slate-800/60">
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock size={13} className="text-gray-400 dark:text-slate-400 shrink-0" />
                      <span>{act.scheduled_time || 'All Day'}</span>
                    </div>

                    {act.field_name && (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin size={13} className="text-gray-400 dark:text-slate-400 shrink-0" />
                        <span className="truncate">{act.field_name}</span>
                      </div>
                    )}

                    {act.planting_name && (
                      <div className="flex items-center gap-1.5 truncate col-span-2">
                        <Sprout size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">{act.planting_name}</span>
                      </div>
                    )}

                    {act.notes && (
                      <div className="flex items-start gap-1.5 col-span-2 text-gray-600 dark:text-slate-400 text-[11px] italic bg-white/60 dark:bg-slate-950/40 p-2 rounded-lg border border-gray-100 dark:border-slate-800">
                        <FileText size={13} className="shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{act.notes}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1 mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>View & Manage</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
};

export default DateDetailPanel;
