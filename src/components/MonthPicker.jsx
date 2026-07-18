import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MonthPicker = ({
    value, // Format: YYYY-MM-DD
    onChange, // Callback with synthetic change event: { target: { value: YYYY-MM-DD } }
    disabled = false,
    required = false,
    className = '',
    id,
    placeholder = 'Select planting date',
}) => {
    const [open, setOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState({});
    const triggerRef = useRef(null);
    const panelRef = useRef(null);

    // Parse selected date or fallback to today
    const today = new Date();
    const currentVal = value ? new Date(value) : today;
    
    // View state for the calendar (currently displayed month and year)
    const [viewYear, setViewYear] = useState(currentVal.getFullYear());
    const [viewMonth, setViewMonth] = useState(currentVal.getMonth()); // 0-indexed

    // Selected state metrics
    const selectedYear = value ? new Date(value).getFullYear() : null;
    const selectedMonth = value ? new Date(value).getMonth() : null;
    const selectedDay = value ? new Date(value).getDate() : null;

    // Formatted value display: "Month DD, YYYY" (e.g. "July 6, 2026")
    const displayValue = value && selectedYear !== null && selectedMonth !== null && selectedDay !== null
        ? `${MONTH_NAMES[selectedMonth]} ${selectedDay}, ${selectedYear}`
        : '';

    const computePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const viewportW = window.innerWidth;
        const dropdownHeight = 310; // Estimated height of Full Calendar panel
        const dropdownWidth = 280; // minWidth is 280px

        const spaceBelow = viewportH - rect.bottom - 16;
        const spaceAbove = rect.top - 16;

        // Fold upwards if limited bottom space and more space exists above
        const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

        // Ensure left position doesn't push the dropdown off the right edge of the screen
        let left = rect.left;
        if (left + dropdownWidth > viewportW) {
            left = Math.max(8, viewportW - dropdownWidth - 8);
        }

        if (openUpward) {
            setPanelStyle({
                position: 'fixed',
                bottom: viewportH - rect.top + 4,
                left: left,
                width: Math.min(rect.width, viewportW - 16),
                zIndex: 9999,
                maxHeight: Math.min(spaceAbove, dropdownHeight),
            });
        } else {
            setPanelStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: left,
                width: Math.min(rect.width, viewportW - 16),
                zIndex: 9999,
                maxHeight: Math.min(spaceBelow, dropdownHeight),
            });
        }
    }, []);

    const openPanel = () => {
        if (disabled) return;
        // Synchronise picker view with current selection
        if (value) {
            const d = new Date(value);
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
        } else {
            setViewYear(new Date().getFullYear());
            setViewMonth(new Date().getMonth());
        }
        computePosition();
        setOpen(true);
    };

    const closePanel = () => setOpen(false);

    const handleSelectDay = (day) => {
        if (!day) return;
        
        // Format date string as YYYY-MM-DD
        const paddedMonth = String(viewMonth + 1).padStart(2, '0');
        const paddedDay = String(day).padStart(2, '0');
        const dateStr = `${viewYear}-${paddedMonth}-${paddedDay}`;
        
        onChange({ target: { value: dateStr } });
        closePanel();
    };

    const adjustMonth = (amount) => {
        setViewMonth((prev) => {
            let nextMonth = prev + amount;
            
            if (nextMonth > 11) {
                nextMonth = 0;
                setViewYear(y => y + 1);
            } else if (nextMonth < 0) {
                nextMonth = 11;
                setViewYear(y => y - 1);
            }
            
            return nextMonth;
        });
    };

    const adjustYear = (amount) => {
        setViewYear(prev => prev + amount);
    };

    // Calendar grid calculations
    const calendarCells = useMemo(() => {
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // Day of week (0-6)
        
        const cells = [];
        // Empty cells for alignment before first day of month
        for (let i = 0; i < firstDayIndex; i++) {
            cells.push(null);
        }
        // Day numbers
        for (let day = 1; day <= daysInMonth; day++) {
            cells.push(day);
        }
        return cells;
    }, [viewYear, viewMonth]);

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (e) => {
            if (
                panelRef.current && !panelRef.current.contains(e.target) &&
                triggerRef.current && !triggerRef.current.contains(e.target)
            ) {
                closePanel();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    // Track trigger position on scroll/resize
    useEffect(() => {
        if (!open) return;
        const reposition = () => computePosition();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [open, computePosition]);

    // Close on Escape key
    useEffect(() => {
        if (!open) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') closePanel();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open]);

    const hasError = className.includes('border-red-500');
    const baseClass = [
        'w-full border rounded-lg px-4 py-2.5 text-sm',
        hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500',
        'focus:border-transparent outline-none transition-shadow',
        'flex items-center justify-between text-left cursor-pointer select-none',
        disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-800',
        className.replace('border-red-500', '').replace('focus:ring-red-500', ''),
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <>
            {/* Trigger Button */}
            <button
                id={id}
                ref={triggerRef}
                type="button"
                disabled={disabled}
                className={baseClass}
                onClick={open ? closePanel : openPanel}
            >
                <span className={value ? '' : 'text-gray-400'}>
                    {value ? displayValue : placeholder}
                </span>
                <CalendarIcon size={16} className="text-gray-400 shrink-0" />
            </button>

            {/* Portal-based Full Calendar dropdown */}
            {open &&
                createPortal(
                    <div
                        ref={panelRef}
                        style={{
                            ...panelStyle,
                            minWidth: '280px',
                        }}
                        className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 text-gray-800 dark:text-slate-200"
                    >
                        {/* Header: Independent Month and Year selectors */}
                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-700 pb-2">
                            {/* Month Selector */}
                            <div className="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => adjustMonth(-1)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="font-semibold text-xs w-[76px] text-center text-gray-900 dark:text-slate-100 truncate">
                                    {MONTH_NAMES[viewMonth]}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => adjustMonth(1)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            {/* Year Selector */}
                            <div className="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => adjustYear(-1)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="font-semibold text-xs w-[40px] text-center text-gray-900 dark:text-slate-100">
                                    {viewYear}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => adjustYear(1)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Weekdays Row */}
                        <div className="grid grid-cols-7 text-center">
                            {WEEKDAYS.map(day => (
                                <span key={day} className="text-xs font-semibold text-gray-400 dark:text-slate-500 py-1">
                                    {day}
                                </span>
                            ))}
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7 gap-y-1 text-center">
                            {calendarCells.map((day, idx) => {
                                if (day === null) {
                                    return <div key={`empty-${idx}`} />;
                                }
                                
                                const isSelected = selectedYear === viewYear && selectedMonth === viewMonth && selectedDay === day;
                                return (
                                    <button
                                        key={`day-${day}`}
                                        type="button"
                                        onClick={() => handleSelectDay(day)}
                                        className={[
                                            'w-8 h-8 mx-auto flex items-center justify-center text-sm font-medium rounded-full transition-all duration-150',
                                            isSelected
                                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-md'
                                                : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 active:bg-gray-200 dark:active:bg-slate-600',
                                        ].join(' ')}
                                    >
                                        {day}
                                    </button>
                                );
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
};

export default MonthPicker;
