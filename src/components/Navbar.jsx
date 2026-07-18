import React, { useState, useEffect } from 'react';
import { Menu, Sun, Moon } from 'lucide-react';
import NotificationBell from './NotificationBell';

const Navbar = ({ onOpenSidebar }) => {
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('theme') === 'dark' ||
               (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

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
                        <Menu size={20} />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <NotificationBell mode="weather" />
                    <NotificationBell mode="activity" />

                    <button
                        id="theme-toggle-btn"
                        type="button"
                        onClick={() => setDarkMode(!darkMode)}
                        className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500 transition-colors shadow-sm cursor-pointer"
                        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {darkMode ? <Sun size={18} className="text-amber-500 animate-spin-slow" /> : <Moon size={18} className="text-blue-600" />}
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Navbar;
