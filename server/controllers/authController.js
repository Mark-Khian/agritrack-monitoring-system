const db = require('../config/db');
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
const logActivity = require('../middleware/logger');
const { getClientIp } = require('../utils/clientIp');
const { SESSION_COOKIE_NAME } = require('../middleware/authMiddleware');
const {
    createSession,
    invalidateSession,
    getActiveSessions,
    invalidateAllSessions,
    invalidateAllSessionsExceptToken,
    cleanupSessions
} = require('../utils/sessionHelper');
const { comparePassword, hashPassword } = require('../utils/passwordHelper');
const { normalizeLoginIdentity } = require('../utils/loginIdentity');
const {
    GENERIC_UNAVAILABLE,
    isChallengeRequired,
    recordLoginAttempt,
    incrementUserFailures,
    resetUserFailures
} = require('../services/loginChallengeService');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Host-only cookie: no `domain` attribute is ever set, so the cookie is not shared
// with sibling subdomains. `secure` is driven only by explicit COOKIE_SECURE.
const sessionCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/'
});

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
setInterval(cleanupSessions, 60 * 60 * 1000).unref();
setInterval(cleanupLoginAttempts, 60 * 60 * 1000).unref();

// ── LOGIN ─────────────────────────────────
const login = async (req, res) => {
    const { username, password } = req.body;
    const ip = req.clientIp || getClientIp(req);
    const identity = req.loginIdentity || normalizeLoginIdentity(username);
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
        const user = users.length === 1 ? users[0] : null;
        const isMatch = await comparePassword(
            password,
            user ? user.password : dummyHash
        );

        if (!user || !isMatch || !user.is_active) {
            if (user) {
                await incrementUserFailures(user.id);
                await logActivity({
                    user_id: null,
                    actor_role: null,
                    action: 'LOGIN_FAILED',
                    entity: 'users',
                    entity_id: user.id,
                    ip_address: ip,
                    status: 'failed'
                });
            }

            await recordLoginAttempt(ip, identity, false);

            let challengeRequired = false;
            try {
                challengeRequired = await isChallengeRequired(ip, identity);
            } catch (err) {
                console.error('Login challenge evaluation error:', err.message);
                return res.status(503).json({ message: GENERIC_UNAVAILABLE });
            }

            return res.status(401).json({
                message: 'Invalid credentials.',
                challengeRequired
            });
        }

        await resetUserFailures(user.id);
        await recordLoginAttempt(ip, identity, true);

        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        const opaqueToken = crypto.randomBytes(32).toString('hex');
        await createSession({ userId: user.id, token: opaqueToken, ip, userAgent, expiresAt });

        res.cookie(SESSION_COOKIE_NAME, opaqueToken, {
            ...sessionCookieOptions(),
            maxAge: SESSION_TTL_MS
        });

        await logActivity({
            user_id: user.id,
            actor_role: logActivity.snapshotRole(user.role),
            action: 'LOGIN_SUCCESS',
            entity: 'users',
            entity_id: user.id,
            ip_address: ip
        });

        res.status(200).json({
            message: 'Login successful!',
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
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const ip = getClientIp(req);
    let userId = null;

    try {
        if (cookieToken) {
            const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
            const [sessions] = await db.query(
                'SELECT user_id FROM sessions WHERE token_hash = ? LIMIT 1',
                [tokenHash]
            );
            if (sessions.length) userId = sessions[0].user_id;
            await invalidateSession(cookieToken);
        }

        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());

        if (userId) {
            const [actors] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
            await logActivity({
                user_id: userId,
                actor_role: logActivity.snapshotRole(actors[0]?.role),
                action: 'LOGOUT',
                entity: 'users',
                entity_id: userId,
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

        await logActivity.fromRequest(req, {
            action: 'LOGOUT_ALL_DEVICES',
            entity: 'users',
            entity_id: req.user.id
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
            await logActivity.fromRequest(req, {
                action: 'CHANGE_PASSWORD',
                entity: 'users',
                entity_id: req.user.id,
                status: 'failed'
            });
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
        await logActivity.fromRequest(req, {
            action: 'CHANGE_PASSWORD',
            entity: 'users',
            entity_id: req.user.id,
            connection
        });
        await connection.commit();

        return res.status(200).json({ message: 'Password changed successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Change password error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
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
        await logActivity.fromRequest(req, {
            action: 'UPDATE_FARM_LOCATION',
            entity: 'users',
            entity_id: req.user.id
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

        await logActivity.fromRequest(req, {
            action: 'REMOVE_FARM_LOCATION',
            entity: 'users',
            entity_id: req.user.id
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
    resolveLocation,
    updateFarmLocation,
    removeFarmLocation
};
