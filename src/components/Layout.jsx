import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const Layout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Lock background scrolling when sidebar is open on mobile
    useEffect(() => {
        if (sidebarOpen) {
            const root = document.documentElement;
            const body = document.body;
            const originalHtmlOverflow = root.style.overflow;
            const originalBodyOverflow = body.style.overflow;
            
            root.style.overflow = 'hidden';
            body.style.overflow = 'hidden';
            
            return () => {
                root.style.overflow = originalHtmlOverflow;
                body.style.overflow = originalBodyOverflow;
            };
        }
    }, [sidebarOpen]);

    return (
        <div className="h-screen bg-gray-100 font-sans flex flex-col overflow-hidden">
            <Navbar onOpenSidebar={() => setSidebarOpen(true)} />

            <div className="flex flex-1 overflow-hidden">
                {/* Mobile overlay sidebar */}
                {sidebarOpen && (
                    <div className="fixed inset-0 z-40 flex lg:hidden">
                        <div
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setSidebarOpen(false)}
                        />
                        <aside className="relative z-50 flex w-64 flex-col bg-green-900">
                            <Sidebar onNavClick={() => setSidebarOpen(false)} />
                        </aside>
                    </div>
                )}

                {/* Desktop sidebar */}
                <aside className="relative hidden w-64 flex-none lg:flex lg:flex-col">
                    <Sidebar />
                </aside>

                {/* Main content area */}
                <main className="min-w-0 flex-1 overflow-y-auto pt-16">
                    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
