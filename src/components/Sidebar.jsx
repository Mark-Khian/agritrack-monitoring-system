import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logoutUser } from '../services/api';
import {
    LogOut,
    LayoutDashboard,
    Home,
    Map,
    Sprout,
    ClipboardList,
    Wheat,
    BarChart2
} from 'lucide-react';

const Sidebar = ({ onNavClick }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [loggedOutName, setLoggedOutName] = useState('');

    const handleLogoutClick = () => setShowConfirm(true);

    const handleConfirmLogout = async () => {
        setIsLoggingOut(true);
        setShowConfirm(false);

        const userName = user?.name || 'User';

        try {
            await logoutUser();
        } catch (err) {
            console.error('Logout error:', err.message);
        }

        setLoggedOutName(userName);
        setShowSuccess(true);
        setIsLoggingOut(false);

        setTimeout(() => {
            logout();
            navigate('/login');
        }, 2000);
    };

    const handleCancelLogout = () => setShowConfirm(false);

    const navLinks = [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Farms', path: '/farms', icon: Home },
        { name: 'Fields', path: '/fields', icon: Map },
        { name: 'Plantings', path: '/plantings', icon: Sprout },
        { name: 'Activities', path: '/activities', icon: ClipboardList },
        { name: 'Harvests', path: '/harvests', icon: Wheat },
        { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    ];

    return (
        <>
            {/* ✅ Success Screen via Portal */}
            {showSuccess && createPortal(
                <div className="fixed inset-0 z-9999 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-br from-green-900 via-green-800 to-green-950"></div>
                    <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-green-500 rounded-full blur-[120px] opacity-30 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-amber-500 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col items-center gap-6 text-center px-4">
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40 animate-bounce">
                            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">
                                Logged Out Successfully! 👋
                            </h2>
                            <p className="text-green-200 text-sm">
                                See you next time,{' '}
                                <span className="font-semibold">{loggedOutName}</span>!
                                <br />
                                Redirecting to login...
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                            <Wheat className="w-6 h-6 text-white" />
                            <span className="text-white font-bold text-lg">AgriTrack</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <div className="flex h-full flex-col bg-green-900 border-r border-green-800">

                {/* Top Logo Section */}
                <div className="flex flex-col justify-center px-6 py-5 border-b border-green-700">
                    <div className="flex items-center gap-2 mb-1">
                        <Wheat className="w-6 h-6 text-green-300" />
                        <span className="text-xl font-bold text-white tracking-tight leading-none">
                            AgriTrack
                        </span>
                    </div>
                    <div className="text-green-300 text-xs tracking-wider uppercase pl-8 font-semibold">
                        Crop Management
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                            <NavLink
                                key={link.name}
                                to={link.path}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 ${isActive
                                        ? 'bg-green-600 text-white shadow-sm'
                                        : 'text-green-200 hover:bg-green-800 hover:text-white'
                                    }`
                                }
                                onClick={onNavClick}
                            >
                                <Icon size={18} />
                                {link.name}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Bottom User Area */}
                <div className="p-4 border-t border-green-700 bg-green-900 mx-4 mb-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold shadow-sm">
                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="font-medium text-sm text-white truncate leading-tight">
                                {user?.name || 'User'}
                            </p>
                            <p className="text-xs text-green-300 truncate capitalize leading-tight mt-0.5">
                                {user?.role || 'Farmer'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogoutClick}
                        disabled={isLoggingOut}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-green-100 bg-green-800 hover:bg-red-600 hover:text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                        <LogOut size={16} />
                        {isLoggingOut ? 'Logging out...' : 'Logout'}
                    </button>
                </div>
            </div>

            {/* ── Confirmation Modal ──────────── */}
            {showConfirm && (
                <div className="fixed inset-0 z-100 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={handleCancelLogout}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
                        <div className="flex justify-center mb-4">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                                <LogOut size={24} className="text-red-600" />
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
                            Log Out
                        </h3>
                        <p className="text-gray-500 text-sm text-center mb-6">
                            Are you sure you want to log out of AgriTrack?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleCancelLogout}
                                disabled={isLoggingOut}
                                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all duration-200 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmLogout}
                                disabled={isLoggingOut}
                                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
                            >
                                {isLoggingOut ? 'Logging out...' : 'Yes, Log Out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Sidebar;