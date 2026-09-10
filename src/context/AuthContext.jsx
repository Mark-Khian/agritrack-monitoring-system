import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, setUnauthorizedHandler } from '../services/api';

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

    return {
        id: data.id,
        name: data.name,
        username: data.username,
        role: data.role,
    };
};

export const AuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState({
        user: null,
        status: 'checking',
    });
    const sessionCheckId = useRef(0);

    const checkSession = useCallback(async () => {
        const checkId = ++sessionCheckId.current;
        setAuthState((current) => ({ ...current, status: 'checking' }));

        try {
            const response = await getCurrentUser();
            if (checkId !== sessionCheckId.current) return;

            setAuthState({
                user: normalizeUser(response.data),
                status: 'authenticated',
            });
        } catch (error) {
            if (checkId !== sessionCheckId.current) return;

            if (error.response?.status === 401) {
                setAuthState({ user: null, status: 'unauthenticated' });
            } else {
                setAuthState((current) => ({
                    user: current.user,
                    status: 'unavailable',
                }));
            }
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
        setAuthState({ user: null, status: 'unauthenticated' });
    }), []);

    const login = useCallback((userData) => {
        setAuthState({
            user: normalizeUser(userData),
            status: 'authenticated',
        });
    }, []);

    const logout = useCallback(() => {
        sessionCheckId.current += 1;
        setAuthState({ user: null, status: 'unauthenticated' });
    }, []);

    const value = useMemo(() => ({
        user: authState.user,
        status: authState.status,
        isAuthenticated: authState.status === 'authenticated',
        isInitializing: authState.status === 'checking',
        login,
        logout,
        retrySessionCheck: checkSession,
    }), [authState, checkSession, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

