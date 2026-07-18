import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

const DownwardSelect = ({
    value,
    onChange,
    options = [],
    placeholder = 'Select…',
    disabled = false,
    required = false,
    className = '',
    id,
    maxDropdownH = 220,
}) => {
    const [open, setOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState({});
    const triggerRef = useRef(null);
    const panelRef = useRef(null);

    // Normalise options to { value, label } shape
    const normalised = options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
    );

    const selectedLabel =
        normalised.find((o) => String(o.value) === String(value))?.label ?? '';

    const computePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;

        const spaceBelow = viewportH - rect.bottom - 16; // 16px safety margin
        const spaceAbove = rect.top - 16;

        // Open upward if space below is limited AND space above is greater
        const openUpward = spaceBelow < 150 && spaceAbove > spaceBelow;

        if (openUpward) {
            setPanelStyle({
                position: 'fixed',
                bottom: viewportH - rect.top + 4, // 4px gap above trigger
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
                maxHeight: Math.min(spaceAbove, maxDropdownH),
            });
        } else {
            setPanelStyle({
                position: 'fixed',
                top: rect.bottom + 4,             // 4px gap below trigger
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
                maxHeight: Math.min(spaceBelow, maxDropdownH),
            });
        }
    }, [maxDropdownH]);

    const openPanel = () => {
        if (disabled) return;
        computePosition();
        setOpen(true);
    };

    const closePanel = () => setOpen(false);

    const handleSelect = (optValue) => {
        // Synthesise a change event so callers can use e.target.value
        onChange({ target: { value: optValue } });
        closePanel();
    };

    // Close when clicking outside
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

    // Recompute position on scroll / resize so the panel tracks the trigger
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

    // Keyboard: Escape closes
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
        'w-full border rounded-lg pl-4 pr-10 py-2.5 text-sm',
        hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500',
        'focus:border-transparent outline-none transition-shadow',
        'flex items-center text-left cursor-pointer select-none relative',
        disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-800',
        className.replace('border-red-500', '').replace('focus:ring-red-500', ''),
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <>
            {/* Trigger */}
            <button
                id={id}
                ref={triggerRef}
                type="button"
                disabled={disabled}
                className={baseClass}
                onClick={open ? closePanel : openPanel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-required={required}
            >
                <span className={value ? '' : 'text-gray-400'}>
                    {value ? selectedLabel : placeholder}
                </span>
                <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                    <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    />
                </span>
            </button>

            {/* Dropdown panel — rendered in a portal so overflow never clips it */}
            {open &&
                createPortal(
                    <ul
                        ref={panelRef}
                        role="listbox"
                        style={panelStyle}
                        className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto py-1 text-sm"
                    >
                        {normalised.length === 0 ? (
                            <li className="px-4 py-2 text-gray-400 text-xs">No options</li>
                        ) : (
                            normalised.map((opt) => (
                                <li
                                    key={opt.value}
                                    role="option"
                                    aria-selected={String(opt.value) === String(value)}
                                    onClick={() => handleSelect(opt.value)}
                                    className={[
                                        'px-4 py-2 cursor-pointer transition-colors duration-100',
                                        String(opt.value) === String(value)
                                            ? 'bg-green-50 text-green-700 font-semibold'
                                            : 'text-gray-700 hover:bg-gray-50',
                                    ].join(' ')}
                                >
                                    {opt.label}
                                </li>
                            ))
                        )}
                    </ul>,
                    document.body
                )}
        </>
    );
};

export default DownwardSelect;
