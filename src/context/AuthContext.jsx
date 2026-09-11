import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, logoutUser, setUnauthorizedHandler } from '../services/api';
import { hasCapability, normalizeRole } from '../security/permissions';

const AuthContext = createContext();
export default AuthContext;

const LEGACY_AUTH_KEYS = ['token', 'refreshToken', 'user'];

const removeLegacyAuthStorage = () => {
    for (const storage of [localStorage, sessionStorage]) {
        for (const key of LEGACY_AUTH_KEYS) {
            storage.removeItem(key);
        }
    }
};

const normalizeUser = (data) => {
    if (
        !data
        || data.id === undefined
        || typeof data.name !== 'string'
        || typeof data.username !== 'string'
        || typeof data.role !== 'string'
    ) {
        throw new Error('Invalid /auth/me response.');
    }

    const role = normalizeRole(data.role);
    if (!role) {
        throw new Error('Invalid /auth/me role.');
    }

    return {
        id: data.id,
        name: data.name,
        username: data.username,
        role,
        mustChangePassword:
            data.must_change_password === true
            || data.must_change_password === 1
            || data.must_change_password === '1'
            || data.mustChangePassword === true,
    };
};

const isPasswordChangeRequired = (error) => (
    error?.response?.status === 403
    && error?.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED'
);

const isAccountForbidden = (error) => (
    error?.response?.status === 403
    && !isPasswordChangeRequired(error)
);

const clearBrowserSession = async () => {
    try {
        await logoutUser();
    } catch {
        // Cookie clear is best-effort; local auth state still resets below.
    }
};

export const AuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState({
        user: null,
        status: 'checking',
        notice: null,
    });
    const sessionCheckId = useRef(0);

    const checkSession = useCallback(async () => {
        const checkId = ++sessionCheckId.current;
        setAuthState((current) => ({
            ...current,
            status: 'checking',
            notice: null,
        }));

        try {
            const response = await getCurrentUser();
            if (checkId !== sessionCheckId.current) return;

            setAuthState({
                user: normalizeUser(response.data),
                status: 'authenticated',
                notice: null,
            });
        } catch (error) {
            if (checkId !== sessionCheckId.current) return;

            const status = error.response?.status;

            if (status === 401) {
                setAuthState({ user: null, status: 'unauthenticated', notice: null });
                return;
            }

            // /auth/me uses protectPasswordChange, so this is rare here.
            // Do not treat it as server unavailability or wipe a usable session.
            if (isPasswordChangeRequired(error)) {
                setAuthState((current) => {
                    if (current.user) {
                        return {
                            user: {
                                ...current.user,
                                mustChangePassword: true,
                            },
                            status: 'authenticated',
                            notice: null,
                        };
                    }
                    return { user: null, status: 'unauthenticated', notice: null };
                });
                return;
            }

            if (isAccountForbidden(error)) {
                await clearBrowserSession();
                if (checkId !== sessionCheckId.current) return;
                setAuthState({
                    user: null,
                    status: 'unauthenticated',
                    notice: error.response?.data?.message || 'Your account is no longer authorized. Please sign in again.',
                });
                return;
            }

            // Network failure, timeout, or 5xx — keep any known user and avoid destroying the cookie.
            setAuthState((current) => ({
                user: current.user,
                status: 'unavailable',
                notice: null,
            }));
        }
    }, []);

    useEffect(() => {
        removeLegacyAuthStorage();
        const timer = window.setTimeout(checkSession, 0);
        return () => {
            window.clearTimeout(timer);
            sessionCheckId.current += 1;
        };
    }, [checkSession]);

    useEffect(() => setUnauthorizedHandler(() => {
        sessionCheckId.current += 1;
        setAuthState({ user: null, status: 'unauthenticated', notice: null });
    }), []);

    const login = useCallback((userData) => {
        setAuthState({
            user: normalizeUser(userData),
            status: 'authenticated',
            notice: null,
        });
    }, []);

    const logout = useCallback(() => {
        sessionCheckId.current += 1;
        setAuthState({ user: null, status: 'unauthenticated', notice: null });
    }, []);

    const clearNotice = useCallback(() => {
        setAuthState((current) => (
            current.notice == null ? current : { ...current, notice: null }
        ));
    }, []);

    const can = useCallback(
        (capability) => hasCapability(authState.user?.role, capability),
        [authState.user?.role]
    );

    const value = useMemo(() => ({
        user: authState.user,
        status: authState.status,
        notice: authState.notice,
        isAuthenticated: authState.status === 'authenticated',
        isInitializing: authState.status === 'checking',
        mustChangePassword: Boolean(authState.user?.mustChangePassword),
        login,
        logout,
        clearNotice,
        can,
        retrySessionCheck: checkSession,
    }), [authState, can, checkSession, clearNotice, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
