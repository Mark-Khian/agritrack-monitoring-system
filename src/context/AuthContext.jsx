import { createContext, useState } from 'react';

const AuthContext = createContext();
export default AuthContext;

export const AuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState(() => {
        const isTokenValid = (rawToken) => {
            try {
                const payloadBase64 = rawToken.split('.')[1];
                if (!payloadBase64) return false;

                const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
                const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
                const payload = JSON.parse(atob(padded));

                if (!payload.exp) return true;
                return payload.exp * 1000 > Date.now();
            } catch {
                return false;
            }
        };

        const savedToken = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');

        if (savedToken && isTokenValid(savedToken)) {
            let parsedUser = null;
            if (savedUser) {
                try {
                    parsedUser = JSON.parse(savedUser);
                } catch {
                    parsedUser = null;
                }
            }
            return { user: parsedUser, token: savedToken };
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            return { user: null, token: null };
        }
    });

    const login = (userData, tokenData, refreshTokenData) => {
        setAuthState({ user: userData, token: tokenData });
        localStorage.setItem('token', tokenData);
        if (refreshTokenData) localStorage.setItem('refreshToken', refreshTokenData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = () => {
        setAuthState({ user: null, token: null });
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider value={{ user: authState.user, token: authState.token, login, logout, isInitializing: false }}>
            {children}
        </AuthContext.Provider>
    );
};

