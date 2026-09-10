/**
 * Phase 3 — Independent legacy JWT + opaque HttpOnly cookie sessions.
 *
 * Isolation: these env vars are assigned BEFORE any module is required. config/db.js
 * loads dotenv, and dotenv never overrides already-set process.env keys, so DB_NAME
 * stays pinned to the test database even though .env names the production one.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.PORT = '5100';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 3 tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const csrfGuard = require('../middleware/csrfGuard');

const TEST_PORT = 5100;
const TEST_USER = { username: 'superadmin', password: 'admin1234' };
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const COOKIE = 'agritrack_session';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const cookieLine = (setCookieHeader) => {
    if (!setCookieHeader) return null;
    const lines = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    return lines.find((c) => c.startsWith(`${COOKIE}=`)) || null;
};

const parseSessionCookie = (setCookieHeader) => {
    const line = cookieLine(setCookieHeader);
    return line ? line.split(';')[0].slice(`${COOKIE}=`.length) : null;
};

describe('Phase 3 auth', () => {
    let server;
    let agent;
    let adminId;
    let initialUserCount;

    // Every case starts from a clean slate so revocation/expiry edits cannot leak.
    const loginFresh = async () => {
        await db.query('DELETE FROM sessions WHERE user_id = ?', [adminId]);
        await db.query('DELETE FROM token_blacklist');

        const res = await agent.post('/api/v1/auth/login').send(TEST_USER).expect(200);

        const bearerToken = res.body.token;
        const cookieToken = parseSessionCookie(res.headers['set-cookie']);
        assert.ok(bearerToken, 'login should return a JWT bearer token');
        assert.ok(cookieToken, `login should set the ${COOKIE} cookie`);
        assert.equal(res.body.agritrack_session, undefined, 'raw cookie must not appear in JSON');

        return { bearerToken, cookieToken, setCookie: res.headers['set-cookie'] };
    };

    before(async () => {
        // Bind the isolated Phase 3 port explicitly rather than an ephemeral one.
        server = http.createServer(app);
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(TEST_PORT, '127.0.0.1', resolve);
        });
        assert.equal(server.address().port, TEST_PORT);
        agent = request(`http://127.0.0.1:${TEST_PORT}`);

        const [dbRows] = await db.query('SELECT DATABASE() AS db');
        assert.equal(dbRows[0].db, 'crop_management_rearch_test', 'must target the test DB only');

        const [users] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [TEST_USER.username]
        );
        assert.ok(users.length, 'test admin must exist — run: npm run test:setup-db');
        adminId = users[0].id;

        await db.query(
            'UPDATE users SET is_active = 1, failed_attempts = 0, locked_until = NULL, captcha_required = 0 WHERE id = ?',
            [adminId]
        );

        const [counts] = await db.query('SELECT COUNT(*) AS c FROM users');
        initialUserCount = counts[0].c;
    });

    // ── Session issuance & storage ────────────────────────────────────────────
    it('login creates a JWT session and an independent cookie session', async () => {
        const { bearerToken, cookieToken } = await loginFresh();
        assert.notEqual(bearerToken, cookieToken);
        assert.match(cookieToken, /^[a-f0-9]{64}$/, 'cookie token should be a 32-byte opaque value');

        const [sessions] = await db.query(
            'SELECT token_hash FROM sessions WHERE user_id = ? AND is_active = 1',
            [adminId]
        );
        const hashes = sessions.map((s) => s.token_hash);
        assert.equal(hashes.length, 2, 'exactly two independent sessions per login');
        assert.ok(hashes.includes(sha256(bearerToken)), 'JWT session hash stored');
        assert.ok(hashes.includes(sha256(cookieToken)), 'opaque cookie session hash stored');
    });

    it('DB stores SHA-256 hashes only — raw tokens absent', async () => {
        const { bearerToken, cookieToken } = await loginFresh();

        const [rawRows] = await db.query(
            'SELECT id FROM sessions WHERE token_hash IN (?, ?)',
            [bearerToken, cookieToken]
        );
        assert.equal(rawRows.length, 0, 'raw tokens must never be stored');

        const [rows] = await db.query(
            'SELECT token_hash FROM sessions WHERE user_id = ?',
            [adminId]
        );
        for (const row of rows) {
            assert.match(row.token_hash, /^[a-f0-9]{64}$/, 'token_hash must be SHA-256 hex');
            assert.notEqual(row.token_hash, cookieToken);
            assert.notEqual(row.token_hash, bearerToken);
        }
    });

    it('jti is independently random and never carries the opaque cookie token', async () => {
        const { bearerToken, cookieToken, setCookie } = await loginFresh();
        const [headerB64, payloadB64] = bearerToken.split('.');
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));

        assert.equal(header.alg, 'RS256');
        assert.match(payload.jti, /^[a-f0-9]{32}$/, 'jti is 16 random bytes, hex-encoded');
        assert.notEqual(payload.jti, cookieToken);
        assert.notEqual(payload.jti, sha256(cookieToken));
        assert.deepEqual(
            Object.keys(payload).sort(),
            ['exp', 'iat', 'id', 'jti'],
            'JWT payload carries no session/cookie material'
        );

        // The raw cookie must not appear anywhere in the token or the JSON body.
        const wire = JSON.stringify({ bearerToken, payload, header });
        assert.ok(!wire.includes(cookieToken), 'raw cookie token absent from JWT');
        assert.ok(!wire.includes(sha256(cookieToken)), 'cookie hash absent from JWT');

        // ...and the cookie value appears only in Set-Cookie, never in the body.
        const body = await agent.post('/api/v1/auth/login').send(TEST_USER).expect(200);
        const bodyCookie = parseSessionCookie(body.headers['set-cookie']);
        assert.ok(!JSON.stringify(body.body).includes(bodyCookie), 'cookie absent from login JSON');
        assert.ok(cookieLine(setCookie).includes(cookieToken), 'cookie delivered via Set-Cookie only');
    });

    it('Bearer session lookup hashes the FULL JWT, not the jti', async () => {
        const { bearerToken } = await loginFresh();
        const payload = JSON.parse(
            Buffer.from(bearerToken.split('.')[1], 'base64url').toString('utf8')
        );

        const [rows] = await db.query(
            'SELECT token_hash FROM sessions WHERE user_id = ? AND is_active = 1',
            [adminId]
        );
        const hashes = rows.map((r) => r.token_hash);

        assert.ok(hashes.includes(sha256(bearerToken)), 'row keyed by SHA-256 of the whole JWT');
        assert.ok(!hashes.includes(sha256(payload.jti)), 'no row keyed by hash of jti');
        assert.ok(!hashes.includes(payload.jti), 'jti itself is not a session key');

        // Revoking the full-JWT hash must actually revoke the credential, which only
        // holds if protect() looks the session up by that same value.
        await db.query('UPDATE sessions SET is_active = 0 WHERE token_hash = ?', [sha256(bearerToken)]);
        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(401);
    });

    it('session expiry is 8h server-side', async () => {
        const { cookieToken } = await loginFresh();
        const [rows] = await db.query(
            'SELECT TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS mins FROM sessions WHERE token_hash = ?',
            [sha256(cookieToken)]
        );
        assert.ok(rows[0].mins >= 475 && rows[0].mins <= 480, `expected ~480m, got ${rows[0].mins}`);
    });

    // ── Cookie attributes ─────────────────────────────────────────────────────
    it('cookie is HttpOnly, SameSite=Lax, Path=/, host-only, and honours COOKIE_SECURE', async () => {
        const { setCookie } = await loginFresh();
        const line = cookieLine(setCookie);

        assert.match(line, /HttpOnly/i);
        assert.match(line, /SameSite=Lax/i);
        assert.match(line, /Path=\//i);
        assert.ok(!/Domain=/i.test(line), 'must be host-only (no Domain attribute)');
        assert.ok(!/Secure/i.test(line), 'COOKIE_SECURE=false must not emit Secure');
        assert.match(line, /Max-Age=28800/i, '8h browser expiry');
    });

    it('COOKIE_SECURE=true emits the Secure attribute', async () => {
        process.env.COOKIE_SECURE = 'true';
        try {
            const { setCookie } = await loginFresh();
            assert.match(cookieLine(setCookie), /Secure/i);
        } finally {
            process.env.COOKIE_SECURE = 'false';
        }
    });

    // ── Credential precedence ─────────────────────────────────────────────────
    it('Bearer-only succeeds on /auth/me', async () => {
        const { bearerToken } = await loginFresh();
        const res = await agent
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${bearerToken}`)
            .expect(200);
        assert.equal(res.body.id, adminId);
        assert.ok(res.body.username);
        assert.equal(res.body.role, 'admin');
    });

    it('Cookie-only succeeds on /auth/me', async () => {
        const { cookieToken } = await loginFresh();
        const res = await agent
            .get('/api/v1/auth/me')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);
        assert.equal(res.body.id, adminId);
    });

    it('no credentials returns 401', async () => {
        await agent.get('/api/v1/auth/me').expect(401);
    });

    it('valid Bearer + valid Cookie: Bearer wins (no CSRF required on unsafe method)', async () => {
        const { bearerToken, cookieToken } = await loginFresh();
        await agent
            .post('/api/v1/auth/resolve-location')
            .set('Authorization', `Bearer ${bearerToken}`)
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .send({ location: 'Manila' })
            .expect(200);
    });

    it('invalid Bearer + valid Cookie returns 401 with no cookie fallback', async () => {
        const { cookieToken } = await loginFresh();

        for (const header of ['Bearer not.a.valid.jwt', 'Bearer ', 'Bearer']) {
            await agent
                .get('/api/v1/auth/me')
                .set('Authorization', header)
                .set('Cookie', `${COOKIE}=${cookieToken}`)
                .expect(401);
        }

        // The cookie itself must still be usable — the Bearer failure did not revoke it.
        await agent
            .get('/api/v1/auth/me')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);
    });

    it('valid Bearer + invalid Cookie: Bearer succeeds', async () => {
        const { bearerToken } = await loginFresh();
        await agent
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${bearerToken}`)
            .set('Cookie', `${COOKIE}=${crypto.randomBytes(32).toString('hex')}`)
            .expect(200);
    });

    // ── Invalid / expired / revoked ───────────────────────────────────────────
    it('fabricated cookie returns 401', async () => {
        await agent
            .get('/api/v1/auth/me')
            .set('Cookie', `${COOKIE}=${crypto.randomBytes(32).toString('hex')}`)
            .expect(401);
    });

    it('expired cookie session returns 401', async () => {
        const { cookieToken } = await loginFresh();
        await db.query(
            'UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE token_hash = ?',
            [sha256(cookieToken)]
        );
        await agent
            .get('/api/v1/auth/me')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(401);
    });

    it('expired Bearer session returns 401', async () => {
        const { bearerToken } = await loginFresh();
        await db.query(
            'UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE token_hash = ?',
            [sha256(bearerToken)]
        );
        await agent
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${bearerToken}`)
            .expect(401);
    });

    it('revoking one credential leaves the other working', async () => {
        const { bearerToken, cookieToken } = await loginFresh();

        await db.query('UPDATE sessions SET is_active = 0 WHERE token_hash = ?', [sha256(cookieToken)]);
        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(401);
        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(200);

        await db.query('UPDATE sessions SET is_active = 0 WHERE token_hash = ?', [sha256(bearerToken)]);
        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(401);
    });

    it('users.is_active remains authoritative for both credentials', async () => {
        const { bearerToken, cookieToken } = await loginFresh();
        await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [adminId]);
        try {
            await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(403);
            await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(403);
            await agent.get('/api/v1/plantings').set('Cookie', `${COOKIE}=${cookieToken}`).expect(403);
            await agent.post('/api/v1/auth/login').send(TEST_USER).expect(401);
        } finally {
            await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [adminId]);
        }

        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(200);
    });

    // ── CSRF ──────────────────────────────────────────────────────────────────
    it('cookie unsafe request with valid Origin is allowed', async () => {
        const { cookieToken } = await loginFresh();
        await agent
            .post('/api/v1/auth/resolve-location')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .set('Origin', ALLOWED_ORIGIN)
            .send({ location: 'Manila' })
            .expect(200);
    });

    it('cookie unsafe request with valid Referer is allowed', async () => {
        const { cookieToken } = await loginFresh();
        await agent
            .post('/api/v1/auth/resolve-location')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .set('Referer', `${ALLOWED_ORIGIN}/dashboard`)
            .send({ location: 'Manila' })
            .expect(200);
    });

    it('cookie unsafe request with hostile/missing Origin is rejected', async () => {
        const { cookieToken } = await loginFresh();
        const hostile = [
            { Origin: 'http://evil.example' },
            { Referer: 'http://evil.example/x' },
            // Prefix-confusion: a different port that shares the allowed origin's prefix.
            { Origin: 'http://localhost:51739' },
            { Referer: 'http://localhost:51739/x' },
            {}
        ];
        for (const headers of hostile) {
            const req = agent
                .post('/api/v1/auth/resolve-location')
                .set('Cookie', `${COOKIE}=${cookieToken}`);
            for (const [k, v] of Object.entries(headers)) req.set(k, v);
            await req.send({ location: 'Manila' }).expect(403);
        }
    });

    it('cookie CSRF applies to PUT and DELETE too', async () => {
        const { cookieToken } = await loginFresh();
        await agent
            .put('/api/v1/auth/farm-location')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .send({ psgcCode: '000000000' })
            .expect(403);

        await agent
            .delete('/api/v1/auth/farm-location')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(403);
    });

    it('csrfGuard unit: safe methods pass, PATCH is guarded, Bearer is exempt', () => {
        const run = ({ method, authMethod, headers = {} }) => {
            let status = null;
            let passed = false;
            const req = { method, authMethod, headers };
            const res = { status: (s) => { status = s; return { json: () => {} }; } };
            csrfGuard(req, res, () => { passed = true; });
            return { status, passed };
        };

        assert.equal(run({ method: 'GET', authMethod: 'cookie' }).passed, true);
        assert.equal(run({ method: 'HEAD', authMethod: 'cookie' }).passed, true);
        assert.equal(run({ method: 'OPTIONS', authMethod: 'cookie' }).passed, true);
        assert.equal(run({ method: 'PATCH', authMethod: 'bearer' }).passed, true);
        assert.equal(run({ method: 'PATCH', authMethod: 'cookie' }).status, 403);
        assert.equal(
            run({ method: 'PATCH', authMethod: 'cookie', headers: { origin: ALLOWED_ORIGIN } }).passed,
            true
        );
    });

    it('Bearer unsafe requests need no CSRF header (JWT compatibility)', async () => {
        const { bearerToken } = await loginFresh();
        await agent
            .post('/api/v1/auth/resolve-location')
            .set('Authorization', `Bearer ${bearerToken}`)
            .send({ location: 'Manila' })
            .expect(200);
    });

    // ── Logout ────────────────────────────────────────────────────────────────
    it('logout revokes both credentials and clears the cookie', async () => {
        const { bearerToken, cookieToken } = await loginFresh();

        const res = await agent
            .post('/api/v1/auth/logout')
            .set('Authorization', `Bearer ${bearerToken}`)
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);

        assert.match(cookieLine(res.headers['set-cookie']) || '', /Expires=/i, 'cookie cleared');

        const [rows] = await db.query(
            'SELECT token_hash, is_active FROM sessions WHERE token_hash IN (?, ?)',
            [sha256(bearerToken), sha256(cookieToken)]
        );
        assert.equal(rows.length, 2);
        for (const row of rows) assert.equal(row.is_active, 0);

        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(401);
        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(401);
    });

    it('Bearer-only logout does not revoke the cookie session', async () => {
        const { bearerToken, cookieToken } = await loginFresh();

        const res = await agent
            .post('/api/v1/auth/logout')
            .set('Authorization', `Bearer ${bearerToken}`)
            .expect(200);
        assert.match(cookieLine(res.headers['set-cookie']) || '', /Expires=/i, 'cookie always cleared');

        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(401);
        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(200);
    });

    it('cookie-only logout does not revoke the Bearer session', async () => {
        const { bearerToken, cookieToken } = await loginFresh();

        await agent
            .post('/api/v1/auth/logout')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);

        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(401);
        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(200);
    });

    it('logout is idempotent and clears the cookie with no credentials', async () => {
        const { bearerToken, cookieToken } = await loginFresh();
        const creds = { Authorization: `Bearer ${bearerToken}`, Cookie: `${COOKIE}=${cookieToken}` };

        for (let i = 0; i < 2; i += 1) {
            await agent
                .post('/api/v1/auth/logout')
                .set('Authorization', creds.Authorization)
                .set('Cookie', creds.Cookie)
                .expect(200);
        }

        const bare = await agent.post('/api/v1/auth/logout').expect(200);
        assert.match(cookieLine(bare.headers['set-cookie']) || '', /Expires=/i);

        await agent
            .post('/api/v1/auth/logout')
            .set('Cookie', `${COOKIE}=${crypto.randomBytes(32).toString('hex')}`)
            .expect(200);
    });

    it('logout-all revokes every session for the user', async () => {
        const { bearerToken, cookieToken } = await loginFresh();
        await agent
            .post('/api/v1/auth/logout-all')
            .set('Authorization', `Bearer ${bearerToken}`)
            .expect(200);

        await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${bearerToken}`).expect(401);
        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(401);
    });

    // ── Protected crop endpoints / regression ─────────────────────────────────
    it('protected crop endpoints accept both Bearer and Cookie', async () => {
        const { bearerToken, cookieToken } = await loginFresh();

        const paths = [
            '/api/v1/plantings',
            '/api/v1/varieties',
            '/api/v1/dashboard/lifecycle-monitoring'
        ];
        for (const path of paths) {
            await agent.get(path).set('Authorization', `Bearer ${bearerToken}`).expect(200);
            await agent.get(path).set('Cookie', `${COOKIE}=${cookieToken}`).expect(200);
        }

        for (const path of ['/api/v1/plantings', '/api/v1/varieties']) {
            await agent.get(path).expect(401);
        }
    });

    it('refreshed Bearer token is immediately usable', async () => {
        await db.query('DELETE FROM sessions WHERE user_id = ?', [adminId]);
        const login = await agent.post('/api/v1/auth/login').send(TEST_USER).expect(200);

        const refreshed = await agent
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: login.body.refreshToken })
            .expect(200);

        await agent
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${refreshed.body.token}`)
            .expect(200);
    });

    it('no subordinate accounts are created', async () => {
        const [counts] = await db.query('SELECT COUNT(*) AS c FROM users');
        assert.equal(counts[0].c, initialUserCount, 'Phase 3 must not create user rows');

        const [roles] = await db.query('SELECT DISTINCT role FROM users');
        assert.deepEqual(roles.map((r) => r.role), ['admin']);
    });

    after(async () => {
        await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [adminId]);
        await db.query('DELETE FROM sessions WHERE user_id = ?', [adminId]);
        await db.query('DELETE FROM token_blacklist');
        if (server) await new Promise((resolve) => server.close(resolve));
        await db.end();
    });
});
