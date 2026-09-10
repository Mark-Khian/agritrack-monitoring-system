const db = require('../config/db');
const jwt = require('jsonwebtoken');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let psgcData = [];
try {
    const dataPath = path.join(__dirname, '../data/psgc.json');
    if (fs.existsSync(dataPath)) {
        const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        psgcData = parsed.data || [];
        console.log(`Loaded ${psgcData.length} PSGC records.`);
    }
} catch (e) {
    console.error('Failed to load PSGC data:', e);
}
const { privateKey, publicKey } = require('../config/keys');
const logActivity = require('../middleware/logger');
const { extractBearerToken, SESSION_COOKIE_NAME } = require('../middleware/authMiddleware');
const {
    createSession,
    invalidateSession,
    getActiveSessions,
    invalidateAllSessions,
    invalidateAllSessionsExceptToken,
    cleanupSessions
} = require('../utils/sessionHelper');
const { comparePassword, hashPassword } = require('../utils/passwordHelper');

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_TIME = parseInt(process.env.LOCKOUT_TIME_MINUTES) || 15;
const CAPTCHA_THRESHOLD = 3;

// Server-side session lifetime for both the legacy JWT row and the opaque cookie row.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Host-only cookie: no `domain` attribute is ever set, so the cookie is not shared
// with sibling subdomains. `secure` is driven only by explicit COOKIE_SECURE.
const sessionCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/'
});

// ── Helper: Generate JWT Tokens (RS256) ───
const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user.id, jti: crypto.randomBytes(16).toString('hex') },
        privateKey,
        { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    const refreshToken = jwt.sign(
        { id: user.id },
        privateKey,
        { algorithm: 'RS256', expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    return { accessToken, refreshToken };
};

const cleanupBlacklist = async () => {
    try {
        const [result] = await db.query(
            'DELETE FROM token_blacklist WHERE expired_at < NOW()'
        );
        if (result.affectedRows > 0)
            console.log(`🧹 Removed ${result.affectedRows} expired token(s)`);
    } catch (err) {
        console.error('Cleanup blacklist error:', err.message);
    }
};

const cleanupLoginAttempts = async () => {
    try {
        await db.query(
            `DELETE FROM login_attempts
             WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
    } catch (err) {
        console.error('Cleanup login attempts error:', err.message);
    }
};

// Unref'd so these janitors never hold the process open by themselves.
setInterval(cleanupBlacklist, 60 * 60 * 1000).unref();
setInterval(cleanupSessions, 60 * 60 * 1000).unref();
setInterval(cleanupLoginAttempts, 60 * 60 * 1000).unref();

// ── LOGIN ─────────────────────────────────
const login = async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    try {
        // Authentication is account-based; authorization is enforced separately
        // from the current database role on every protected route.
        const [users] = await db.query(
            `SELECT *
             FROM users
             WHERE username = ? OR email = ?
             LIMIT 2`,
            [username, username]
        );

        // Timing attack fix — use a structurally valid dummy hash
        const dummyHash = '$2b$12$lZZgs9Y/TfAIYjZnd643zuE.24O.t.ztKHjW2mHoDBo4F8PfEYrbq';
        const isMatch = await comparePassword(
            password,
            users.length === 1 ? users[0].password : dummyHash
        );

        if (users.length !== 1 || !isMatch) {
            if (users.length === 1) {
                const user = users[0];
                const newAttempts = (user.failed_attempts || 0) + 1;

                // Update legacy database columns silently
                await db.query(
                    `UPDATE users
                     SET failed_attempts = ?
                     WHERE id = ?`,
                    [newAttempts, user.id]
                );

                await logActivity({
                    user_id: user.id,
                    action: 'LOGIN_FAILED',
                    ip_address: ip,
                    status: 'failed'
                });
            }

            // Always record the failure in login_attempts
            await db.query(
                `INSERT INTO login_attempts (ip_address, email, success) VALUES (?, ?, 0)`,
                [ip, username || null]
            );

            // Generic failure without exposing existence or locked status
            return res.status(401).json({
                message: 'Invalid credentials.',
                captchaRequired: req.captchaRequired || false
            });
        }

        const user = users[0];

        if (!user.is_active)
            return res.status(403).json({ message: 'This account has been disabled.' });

        // Reset legacy columns upon successful login
        await db.query(
            `UPDATE users
             SET failed_attempts  = 0,
                 locked_until     = NULL,
                 captcha_required = 0
             WHERE id = ?`,
            [user.id]
        );

        await db.query(
            `INSERT INTO login_attempts (ip_address, email, success) VALUES (?, ?, 1)`,
            [ip, username]
        );

        const { accessToken, refreshToken } = generateTokens(user);
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

        // Two fully independent sessions are created. Revoking either one leaves the
        // other usable; only the DB row's SHA-256 hash is persisted for each.
        // 1. Legacy JWT session row
        await createSession({ userId: user.id, token: accessToken, ip, userAgent, expiresAt });

        // 2. Opaque cookie session row
        const opaqueToken = crypto.randomBytes(32).toString('hex');
        await createSession({ userId: user.id, token: opaqueToken, ip, userAgent, expiresAt });

        res.cookie(SESSION_COOKIE_NAME, opaqueToken, {
            ...sessionCookieOptions(),
            maxAge: SESSION_TTL_MS
        });

        await logActivity({
            user_id: user.id,
            action: 'LOGIN_SUCCESS',
            entity: 'users',
            entity_id: user.id,
            ip_address: ip
        });

        res.status(200).json({
            message: 'Login successful!',
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                username: user.username || user.email
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── GET ME ────────────────────────────────
const getMe = async (req, res) => {
    try {
        const [users] = await db.query(
            `SELECT id, name, username, email, role, must_change_password
             FROM users
             WHERE id = ?`,
            [req.user.id]
        );
        if (users.length === 0) return res.status(404).json({ message: 'User not found.' });
        
        const user = users[0];
        res.status(200).json({
            id: user.id,
            name: user.name,
            username: user.username || user.email,
            role: user.role,
            must_change_password: Boolean(user.must_change_password)
        });
    } catch (err) {
        console.error('getMe error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── LOGOUT ────────────────────────────────
const logout = async (req, res) => {
    const bearerToken = extractBearerToken(req);
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const ip = req.ip;
    let userId = null;

    try {
        // Each credential is revoked independently; presenting one does not affect the other.
        if (bearerToken) {
            const decoded = jwt.decode(bearerToken);
            if (decoded) {
                userId = decoded.id ?? null;
                if (decoded.exp) {
                    await db.query(
                        'INSERT IGNORE INTO token_blacklist (token, expired_at) VALUES (?, ?)',
                        [bearerToken, new Date(decoded.exp * 1000)]
                    );
                }
            }
            await invalidateSession(bearerToken);
        }

        if (cookieToken) {
            await invalidateSession(cookieToken);
        }

        // Always clear the cookie regardless of which credentials were presented.
        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());

        if (userId) {
            await logActivity({
                user_id: userId,
                action: 'LOGOUT',
                ip_address: ip
            });
        }

        res.status(200).json({ message: 'Logged out successfully.' });

    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── GET ACTIVE SESSIONS ───────────────────
const getSessions = async (req, res) => {
    try {
        const sessions = await getActiveSessions(req.user.id);
        res.status(200).json({ sessions });
    } catch (err) {
        console.error('Get sessions error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── LOGOUT ALL DEVICES ────────────────────
const logoutAllDevices = async (req, res) => {
    try {
        await invalidateAllSessions(req.user.id);

        await logActivity({
            user_id: req.user.id,
            action: 'LOGOUT_ALL_DEVICES',
            ip_address: req.ip
        });
        
        // Also clear the current session cookie
        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());

        res.status(200).json({ message: 'Logged out from all devices.' });
    } catch (err) {
        console.error('Logout all error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ── CHANGE PASSWORD ───────────────────────
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [users] = await connection.query(
            `SELECT id, password
             FROM users
             WHERE id = ? AND is_active = 1
             FOR UPDATE`,
            [req.user.id]
        );
        if (users.length !== 1) {
            await connection.rollback();
            return res.status(403).json({ message: 'Account is unavailable.' });
        }

        const currentMatches = await comparePassword(currentPassword, users[0].password);
        if (!currentMatches) {
            await connection.rollback();
            return res.status(400).json({
                message: 'Validation failed.',
                errors: [{ field: 'currentPassword', message: 'Current password is incorrect.' }]
            });
        }

        const newMatchesCurrent = await comparePassword(newPassword, users[0].password);
        if (newMatchesCurrent) {
            await connection.rollback();
            return res.status(400).json({
                message: 'Validation failed.',
                errors: [{ field: 'newPassword', message: 'New password must differ from the current password.' }]
            });
        }

        const passwordHash = await hashPassword(newPassword);
        await connection.query(
            `UPDATE users
             SET password = ?,
                 password_hash = ?,
                 must_change_password = 0,
                 password_changed_at = NOW()
             WHERE id = ?`,
            [passwordHash, passwordHash, req.user.id]
        );
        await invalidateAllSessionsExceptToken(req.user.id, req.token, connection);
        await connection.commit();

        await logActivity({
            user_id: req.user.id,
            action: 'CHANGE_PASSWORD',
            entity: 'users',
            entity_id: req.user.id,
            ip_address: req.ip
        });

        return res.status(200).json({ message: 'Password changed successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Change password error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
    }
};

// ── REFRESH TOKEN ─────────────────────────
const refreshToken = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken)
        return res.status(401).json({ message: 'Refresh token required.' });

    try {
        const decoded = jwt.verify(refreshToken, publicKey, { algorithms: ['RS256'] });

        const [users] = await db.query(
            `SELECT id, is_active, must_change_password
             FROM users
             WHERE id = ?`,
            [decoded.id]
        );

        if (users.length === 0 || !users[0].is_active)
            return res.status(401).json({ message: 'Invalid refresh token.' });

        if (users[0].must_change_password) {
            return res.status(403).json({
                code: 'PASSWORD_CHANGE_REQUIRED',
                message: 'Password change required before refreshing this session.'
            });
        }

        const newAccessToken = jwt.sign(
            { id: users[0].id, jti: crypto.randomBytes(16).toString('hex') },
            privateKey,
            { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        // protect() requires a matching session row, so the refreshed Bearer token needs
        // its own row or it would be rejected on first use.
        await createSession({
            userId: users[0].id,
            token: newAccessToken,
            ip: req.ip,
            userAgent: req.headers['user-agent'] || 'Unknown',
            expiresAt: new Date(Date.now() + SESSION_TTL_MS)
        });

        res.status(200).json({ token: newAccessToken });

    } catch (err) {
        res.status(401).json({ message: 'Invalid or expired refresh token.' });
    }
};

// ── Helper: HTTPS GET ─────────────────────
const httpsGet = (url) =>
    new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Invalid JSON')); }
            });
        }).on('error', reject);
    });

// ── RESOLVE LOCATION (PREVIEW) ────────────
const resolveLocation = async (req, res) => {
    const { location } = req.body;
    if (!location || location.trim().length === 0) {
        return res.status(400).json({ message: 'Location is required.' });
    }

    try {
        const rawQuery = location.trim().replace(/[\s,\/-]+/g, ' ').toLowerCase();

        const queryTokens = rawQuery.split(' ').filter(Boolean);

        const matchTokens = (str, tokens) => {
            if (!str) return false;
            const words = str.toLowerCase().replace(/[\s,\/-]+/g, ' ').split(' ').filter(Boolean);
            return tokens.every(token => words.some(w => w.startsWith(token)));
        };

        const matches = psgcData
            .filter(item => {
                return matchTokens(item.resolvedName, queryTokens);
            })
            .sort((a, b) => {
                const aPrimary = (a.barangay || a.municipalityCity || a.province || '').toLowerCase();
                const bPrimary = (b.barangay || b.municipalityCity || b.province || '').toLowerCase();

                const aExact = aPrimary === rawQuery;
                const bExact = bPrimary === rawQuery;

                if (aExact && !bExact) return -1;
                if (bExact && !aExact) return 1;

                if (aExact && bExact) {
                    const typeScore = (t) => {
                        if (t === 'Province') return 4;
                        if (t === 'City') return 3;
                        if (t === 'Municipality') return 2;
                        if (t === 'Barangay') return 1;
                        return 0;
                    };
                    const aScore = typeScore(a.type);
                    const bScore = typeScore(b.type);
                    if (aScore !== bScore) return bScore - aScore;
                }

                const aHasExactComp = (a.barangay && a.barangay.toLowerCase() === rawQuery) ||
                                      (a.municipalityCity && a.municipalityCity.toLowerCase() === rawQuery) ||
                                      (a.province && a.province.toLowerCase() === rawQuery);
                const bHasExactComp = (b.barangay && b.barangay.toLowerCase() === rawQuery) ||
                                      (b.municipalityCity && b.municipalityCity.toLowerCase() === rawQuery) ||
                                      (b.province && b.province.toLowerCase() === rawQuery);

                if (aHasExactComp && !bHasExactComp) return -1;
                if (bHasExactComp && !aHasExactComp) return 1;

                const aPrimaryPrefix = aPrimary.startsWith(rawQuery);
                const bPrimaryPrefix = bPrimary.startsWith(rawQuery);
                if (aPrimaryPrefix && !bPrimaryPrefix) return -1;
                if (bPrimaryPrefix && !aPrimaryPrefix) return 1;

                const aHasPrefixComp = (a.barangay && a.barangay.toLowerCase().startsWith(rawQuery)) ||
                                       (a.municipalityCity && a.municipalityCity.toLowerCase().startsWith(rawQuery)) ||
                                       (a.province && a.province.toLowerCase().startsWith(rawQuery));
                const bHasPrefixComp = (b.barangay && b.barangay.toLowerCase().startsWith(rawQuery)) ||
                                       (b.municipalityCity && b.municipalityCity.toLowerCase().startsWith(rawQuery)) ||
                                       (b.province && b.province.toLowerCase().startsWith(rawQuery));
                if (aHasPrefixComp && !bHasPrefixComp) return -1;
                if (bHasPrefixComp && !aHasPrefixComp) return 1;

                return a.resolvedName.length - b.resolvedName.length;
            })
            .slice(0, 5);

        if (matches.length === 0) {
            return res.status(404).json({ message: 'Location could not be found. Please enter a more specific farm location.' });
        }

        res.status(200).json({ suggestions: matches });
    } catch (err) {
        console.error('Resolve location error:', err.message);
        res.status(500).json({ message: 'Failed to resolve location.' });
    }
};

const updateFarmLocation = async (req, res) => {
    const { psgcCode } = req.body;

    if (!psgcCode) {
        return res.status(400).json({ message: 'Valid PSGC code is required.' });
    }

    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) {
        return res.status(503).json({ message: 'Server missing OpenWeather API Key.' });
    }

    try {
        const record = psgcData.find(p => p.psgcCode === psgcCode);
        if (!record) {
            return res.status(400).json({ message: 'Unable to verify the selected Philippine farm location.' });
        }

        const barangay = record.barangay;
        const muniCity = record.municipalityCity;
        const province = record.province;
        
        const normalizeMuni = (m) => m ? m.replace(/^City of /i, '').trim() : '';
        const normMuniCity = normalizeMuni(muniCity);

        let queries = [];

        if (barangay && muniCity) {
            if (province) {
                queries.push(`${barangay}, ${muniCity}, ${province}, PH`);
                if (normMuniCity !== muniCity) {
                    queries.push(`${barangay}, ${normMuniCity}, ${province}, PH`);
                }
                queries.push(`${muniCity}, ${province}, PH`);
                if (normMuniCity !== muniCity) {
                    queries.push(`${normMuniCity}, ${province}, PH`);
                }
            }
            queries.push(`${muniCity}, PH`);
            if (normMuniCity !== muniCity) {
                queries.push(`${normMuniCity}, PH`);
            }
        } else if (muniCity) {
            if (province) {
                queries.push(`${muniCity}, ${province}, PH`);
                if (normMuniCity !== muniCity) {
                    queries.push(`${normMuniCity}, ${province}, PH`);
                }
            }
            queries.push(`${muniCity}, PH`);
            if (normMuniCity !== muniCity) {
                queries.push(`${normMuniCity}, PH`);
            }
        }

        const candidateQueries = [...new Set(queries)];

        let bestMatch = null;
        for (const query of candidateQueries) {
            const directUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`;
            try {
                const directData = await httpsGet(directUrl);
                const phResults = directData ? directData.filter(r => r.country === 'PH') : [];
                if (phResults.length > 0) {
                    bestMatch = phResults[0];
                    break;
                }
            } catch (err) {
                console.error(`Error geocoding ${query}:`, err.message);
            }
        }

        if (!bestMatch) {
            return res.status(400).json({ message: 'The Philippine location is valid, but weather coordinates could not be resolved.' });
        }

        const finalLat = bestMatch.lat;
        const finalLon = bestMatch.lon;
        const finalResolvedName = record.resolvedName;

        // req.user.id is the admin since route is protected
        await db.query(
            `UPDATE users
             SET farm_latitude = ?, farm_longitude = ?, farm_location_name = ?
             WHERE id = ?`,
            [finalLat, finalLon, finalResolvedName, req.user.id]
        );

        // Also log the settings change
        await logActivity({
            user_id: req.user.id,
            action: 'UPDATE_FARM_LOCATION',
            entity: 'users',
            entity_id: req.user.id,
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Farm location saved successfully.' });
    } catch (err) {
        console.error('Update farm location error:', err.message);
        res.status(500).json({ message: 'Failed to update farm location.' });
    }
};

const removeFarmLocation = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(
            `UPDATE users
             SET farm_latitude = NULL, farm_longitude = NULL, farm_location_name = NULL
             WHERE id = ?`,
            [req.user.id]
        );

        await connection.query(
            `DELETE FROM notifications
             WHERE type = 'weather_alert' AND user_id = ?`,
            [req.user.id]
        );

        await connection.commit();

        await logActivity({
            user_id: req.user.id,
            action: 'REMOVE_FARM_LOCATION',
            entity: 'users',
            entity_id: req.user.id,
            ip_address: req.ip
        });

        res.status(200).json({ message: 'Farm location removed successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Remove farm location error:', err.message);
        res.status(500).json({ message: 'Failed to remove farm location.' });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    login,
    logout,
    getMe,
    getSessions,
    logoutAllDevices,
    changePassword,
    refreshToken,
    resolveLocation,
    updateFarmLocation,
    removeFarmLocation
};
