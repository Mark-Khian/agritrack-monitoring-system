import React from 'react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const Navbar = ({ title, onOpenSidebar }) => {
    const { user } = useAuth();

    return (
        <header className="fixed top-0 left-0 right-0 lg:left-64 h-16 bg-white border-b border-gray-200 shadow-sm z-30 px-4 sm:px-6 lg:px-8 transition-all">
            <div className="flex h-full items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="inline-flex items-center rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
                        onClick={onOpenSidebar}
                    >
                        <span className="sr-only">Open sidebar</span>
                        <svg
                            className="h-6 w-6"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            fill="none"
                        >
                            <path d="M4 6h16M4 12h16M4 18h16" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                    </button>

                    <h1 className="text-lg sm:text-xl font-semibold text-gray-700 tracking-tight">
                        {title}
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    {/* Notification Bell */}
                    <NotificationBell />

                    {/* User Avatar */}
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold shadow-sm text-sm">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Navbar;
