import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const SCROLL_STORAGE_KEY = 'agritrack_main_scroll_v1';
const RESTORE_WINDOW_MS = 1800;

const readScrollMap = () => {
    try {
        const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const writeScrollY = (pathname, y) => {
    try {
        const map = readScrollMap();
        map[pathname] = y;
        sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // sessionStorage can throw in private mode — ignore
    }
};

const Layout = ({ children }) => {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const mainRef = useRef(null);
    const pathnameRef = useRef(location.pathname);

    useEffect(() => {
        pathnameRef.current = location.pathname;
    }, [location.pathname]);

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

    // Persist scroll on scroll (debounced), unmount, and tab hide
    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;

        let timer;
        const persist = () => writeScrollY(pathnameRef.current, el.scrollTop);

        const onScroll = () => {
            clearTimeout(timer);
            timer = setTimeout(persist, 120);
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pagehide', persist);

        return () => {
            clearTimeout(timer);
            persist();
            el.removeEventListener('scroll', onScroll);
            window.removeEventListener('pagehide', persist);
        };
    }, [location.pathname]);

    // Restore after paint; re-apply while async content grows (until user scrolls or window ends)
    useLayoutEffect(() => {
        const el = mainRef.current;
        if (!el) return;

        const target = Number(readScrollMap()[location.pathname]);
        if (!Number.isFinite(target) || target <= 0) {
            return undefined;
        }

        let cancelled = false;
        let userMoved = false;

        const apply = () => {
            if (cancelled || userMoved) return;
            if (el.scrollHeight > el.clientHeight) {
                el.scrollTop = Math.min(target, el.scrollHeight - el.clientHeight);
            }
        };

        const cancelForUser = () => {
            userMoved = true;
        };

        apply();
        const raf1 = requestAnimationFrame(() => {
            apply();
            requestAnimationFrame(apply);
        });

        const delays = [50, 150, 400, 800, 1500].map((ms) => setTimeout(apply, ms));

        const ro = new ResizeObserver(apply);
        ro.observe(el);
        const mo = new MutationObserver(apply);
        mo.observe(el, { childList: true, subtree: true });

        el.addEventListener('wheel', cancelForUser, { passive: true });
        el.addEventListener('touchstart', cancelForUser, { passive: true });
        el.addEventListener('pointerdown', cancelForUser);

        const stopObservers = () => {
            ro.disconnect();
            mo.disconnect();
        };
        const endRestore = setTimeout(stopObservers, RESTORE_WINDOW_MS);

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf1);
            delays.forEach(clearTimeout);
            clearTimeout(endRestore);
            stopObservers();
            el.removeEventListener('wheel', cancelForUser);
            el.removeEventListener('touchstart', cancelForUser);
            el.removeEventListener('pointerdown', cancelForUser);
        };
    }, [location.pathname]);

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
                <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto pt-16">
                    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
