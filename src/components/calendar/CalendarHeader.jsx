import React from 'react';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Plus, RefreshCw, Filter, Layers
} from 'lucide-react';
import Select from '../Select';

const CalendarHeader = ({
  currentDate,
  viewMode,
  setViewMode,
  onPrev,
  onNext,
  onToday,
  onRefresh,
  isRefreshing,
  onNewActivity,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter
}) => {

  const formatHeaderTitle = () => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      const sunday = new Date(d);
      sunday.setDate(d.getDate() - dayOfWeek);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);

      const startMonth = sunday.toLocaleDateString('default', { month: 'short' });
      const endMonth = saturday.toLocaleDateString('default', { month: 'short' });
      const year = saturday.getFullYear();

      if (startMonth === endMonth) {
        return `${startMonth} ${sunday.getDate()} – ${saturday.getDate()}, ${year}`;
      }
      return `${startMonth} ${sunday.getDate()} – ${endMonth} ${saturday.getDate()}, ${year}`;
    }
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return '';
  };

  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3.5 sm:p-5 bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-xs transition-colors w-full overflow-hidden">

      {/* Left: Date Navigation & Title */}
      <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 w-full lg:w-auto">
        <div className="flex items-center bg-gray-100 border border-gray-200 dark:bg-slate-800/80 dark:border-slate-700/80 rounded-xl p-1 shadow-inner shrink-0">
          <button
            onClick={onPrev}
            title="Previous"
            className="p-1.5 sm:p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/80 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onToday}
            className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold text-emerald-700 hover:bg-gray-200/80 dark:text-emerald-400 dark:hover:bg-slate-700/80 rounded-lg transition-colors tracking-wide cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={onNext}
            title="Next"
            className="p-1.5 sm:p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/80 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tracking-tight truncate">
          {formatHeaderTitle()}
        </h2>


      </div>

      {/* Right Controls: Search, Filters, View Toggle & Add Action */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">

        {/* Status Filter */}
        <div className="relative flex-1 sm:flex-none min-w-[120px]">
          <Select
            id="calendar-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Activities' },
              { value: 'pending', label: 'Pending' },
              { value: 'ongoing', label: 'Ongoing' },
              { value: 'completed', label: 'Completed' },
              { value: 'overdue', label: 'Overdue' }
            ]}
          />
        </div>



        {/* View Switcher (Month | Week | Day) */}
        <div className="flex bg-gray-100 border border-gray-200 dark:bg-slate-800/90 dark:border-slate-700/80 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setViewMode('month')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${viewMode === 'month'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
              }`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${viewMode === 'week'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
              }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${viewMode === 'day'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
              }`}
          >
            Day
          </button>
        </div>


      </div>

    </div>
  );
};

export default CalendarHeader;
