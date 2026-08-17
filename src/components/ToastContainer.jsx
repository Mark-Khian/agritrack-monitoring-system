import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useToast } from '../context/ToastContext';
import Toast from './Toast';

const ToastContainer = () => {
    const { toasts, removeToast } = useToast();

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div 
            className="fixed z-[9999] pointer-events-none flex flex-col gap-3
                       top-[env(safe-area-inset-top,16px)] left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-sm
                       md:top-[max(env(safe-area-inset-top,16px),16px)] md:left-auto md:right-4 md:translate-x-0"
            aria-live="polite"
        >
            <AnimatePresence>
                {toasts.map(toast => (
                    <Toast 
                        key={toast.id}
                        id={toast.id}
                        message={toast.message}
                        type={toast.type}
                        duration={toast.duration}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
};

export default ToastContainer;
