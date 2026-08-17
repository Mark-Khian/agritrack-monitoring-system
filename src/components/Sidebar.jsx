import React, { useState } from 'react';
import FlipOverlay from './FlipOverlay';
import crmLogo from '../assets/CRM-logo.png';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { logoutUser } from '../services/api';
import {
    LogOut,
    LayoutDashboard,
    Sprout,
    ClipboardList,
    Wheat,
    BarChart2,
    CheckCircle2,
    User,
    Calendar
} from 'lucide-react';

const Sidebar = ({ onNavClick }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [logoutPhase, setLogoutPhase] = useState('idle');
    const [loggedOutName, setLoggedOutName] = useState('');

    const handleLogoutClick = () => setShowConfirm(true);

    const handleConfirmLogout = async () => {
        setLogoutPhase('loading');
        setIsLoggingOut(true);
        setShowConfirm(false);

        try {
            const delay = new Promise(resolve => setTimeout(resolve, 800));
            await Promise.all([
                logoutUser(),
                delay
            ]);
            setLogoutPhase('success');
            setIsLoggingOut(false);
            setTimeout(() => {
                logout();
                navigate('/');
            }, 2000);
        } catch (err) {
            console.error('Logout error:', err.message);
            setLogoutPhase('idle');
            setIsLoggingOut(false);
            logout();
            navigate('/');
        }
    };

    const handleCancelLogout = () => setShowConfirm(false);

    const navLinks = [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Plantings', path: '/plantings', icon: Sprout },
        { name: 'Activities', path: '/activities', icon: ClipboardList },
        { name: 'Harvests', path: '/harvests', icon: Wheat },
        { name: 'Calendar', path: '/calendar', icon: Calendar },
        { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    ];

    return (
        <>
            {/* Success screen via portal */}
            {logoutPhase !== 'idle' && (
                <FlipOverlay
                    isPending={logoutPhase === 'loading'}
                    isSuccess={logoutPhase === 'success'}
                    title="Logged out successfully"
                    subtitle="Redirecting to login..."
                />
            )}

            <div className="flex h-full flex-col bg-green-900 border-r border-green-800">

                {/* Top Logo Section */}
                <div className="flex flex-col justify-center px-6 py-5 border-b border-green-700">
                    <div className="flex items-center gap-2">
                        <img src={crmLogo} alt="CRM Logo" className="w-12 h-12 object-contain shrink-0 scale-125 origin-center ml-1" />
                        <span className="text-xl font-bold text-white tracking-tight leading-none">
                            AgriTrack
                        </span>
                    </div>
                    <div className="text-green-300 text-[10px] sm:text-[11px] tracking-widest uppercase pl-[60px] font-semibold leading-tight -mt-1">
                        Rice Crop Record<br className="sm:hidden" /> Management
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
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shadow-sm shrink-0">
                            <User className="w-[22px] h-[22px] text-slate-500" />
                        </div>
                        <div className="overflow-hidden flex flex-col justify-center">
                            <p className="font-medium text-sm text-white truncate">
                                {user?.name || 'User'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogoutClick}
                        disabled={isLoggingOut}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors duration-200 disabled:opacity-50"
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