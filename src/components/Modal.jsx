import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) => {
    // Close on escape key and lock body scrolling
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            
            const root = document.documentElement;
            const body = document.body;
            const originalHtmlOverflow = root.style.overflow;
            const originalBodyOverflow = body.style.overflow;
            
            root.style.overflow = 'hidden';
            body.style.overflow = 'hidden';
            
            return () => {
                window.removeEventListener('keydown', handleEsc);
                root.style.overflow = originalHtmlOverflow;
                body.style.overflow = originalBodyOverflow;
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center overflow-hidden p-4">
            <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full ${maxWidth} p-5 md:p-6 mx-auto relative animate-zoom-in max-h-[90vh] overflow-y-auto scrollbar-none`}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 tracking-tight">{title}</h2>
                    <button 
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
