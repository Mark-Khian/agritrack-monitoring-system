import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, X, Info, AlertTriangle } from 'lucide-react';

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(() => {
            if (onClose) onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [message, duration, onClose]);

    const typeConfig = {
        success: {
            style: {
                backgroundColor: 'rgba(240, 253, 244, 0.95)',
                borderColor: 'rgba(16, 185, 129, 0.25)',
                color: '#065f46'
            },
            icon: <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />,
        },
        error: {
            style: {
                backgroundColor: 'rgba(254, 242, 242, 0.95)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
                color: '#991b1b'
            },
            icon: <AlertCircle className="text-red-600 shrink-0" size={20} />,
        },
        warning: {
            style: {
                backgroundColor: 'rgba(255, 251, 235, 0.95)',
                borderColor: 'rgba(245, 158, 11, 0.25)',
                color: '#92400e'
            },
            icon: <AlertTriangle className="text-amber-600 shrink-0" size={20} />,
        },
        info: {
            style: {
                backgroundColor: 'rgba(239, 246, 255, 0.95)',
                borderColor: 'rgba(59, 130, 246, 0.25)',
                color: '#1e40af'
            },
            icon: <Info className="text-blue-600 shrink-0" size={20} />,
        }
    };

    const config = typeConfig[type] || typeConfig.success;

    return (
        <AnimatePresence>
            {message && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-sm px-4 pointer-events-none">
                    <motion.div
                        initial={{ opacity: 0, y: -40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                        style={config.style}
                        className="pointer-events-auto flex items-center justify-between gap-3 border backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl shadow-black/5"
                    >
                        <div className="flex items-center gap-3">
                            {config.icon}
                            <span className="text-sm font-semibold">{message}</span>
                        </div>
                        <button
                            onClick={onClose}
                            style={{ color: 'inherit' }}
                            className="opacity-60 hover:opacity-100 transition-opacity p-1.5 rounded-xl hover:bg-black/5 cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default Toast;
