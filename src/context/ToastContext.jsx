import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ToastContainer from '../components/ToastContainer';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const toastIdCounter = useRef(0);

    const addToast = useCallback((message, type, duration = 3000) => {
        setToasts(prev => {
            // Prevent duplicate identical toasts within a very short interval
            const isDuplicate = prev.some(t => t.message === message && t.type === type);
            if (isDuplicate) return prev;

            const id = ++toastIdCounter.current;
            return [...prev, { id, message, type, duration }];
        });
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const success = useCallback((msg, duration = 3500) => addToast(msg, 'success', duration), [addToast]);
    const error = useCallback((msg, duration = 5000) => addToast(msg, 'error', duration), [addToast]);
    const warning = useCallback((msg, duration = 5000) => addToast(msg, 'warning', duration), [addToast]);
    const info = useCallback((msg, duration = 3500) => addToast(msg, 'info', duration), [addToast]);

    const value = {
        toasts,
        removeToast,
        success,
        error,
        warning,
        info
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
