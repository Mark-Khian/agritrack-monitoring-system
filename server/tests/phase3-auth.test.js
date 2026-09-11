/**
 * Phase 11 cookie-only auth (rewritten from Phase 3 dual JWT + cookie coverage).
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
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
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

const historicalJwtFor = (userId) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        id: userId,
        jti: crypto.randomBytes(16).toString('hex'),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    return `${header}.${payload}.not-a-real-signature`;
};

describe('Phase 3 auth', () => {
    let server;
    let agent;
    let adminId;
    let initialUserCount;

    const loginFresh = async () => {
        await db.query('DELETE FROM sessions WHERE user_id = ?', [adminId]);
        await db.query('DELETE FROM token_blacklist');

        const res = await agent.post('/api/v1/auth/login').send(TEST_USER).expect(200);
        const cookieToken = parseSessionCookie(res.headers['set-cookie']);

        assert.equal(res.body.token, undefined, 'login must not return a token');
        assert.equal(res.body.refreshToken, undefined, 'login must not return a refreshToken');
        assert.ok(cookieToken, `login should set the ${COOKIE} cookie`);
        assert.equal(res.body.agritrack_session, undefined, 'raw cookie must not appear in JSON');
        assert.ok(!JSON.stringify(res.body).includes(cookieToken), 'cookie absent from login JSON');

        return { cookieToken, setCookie: res.headers['set-cookie'], body: res.body };
    };

    before(async () => {
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

    it('login creates exactly one opaque cookie session', async () => {
        const { cookieToken } = await loginFresh();
        assert.match(cookieToken, /^[a-f0-9]{64}$/, 'cookie token should be a 32-byte opaque value');

        const [sessions] = await db.query(
            'SELECT token_hash FROM sessions WHERE user_id = ? AND is_active = 1',
            [adminId]
        );
        assert.equal(sessions.length, 1, 'exactly one session per login');
        assert.equal(sessions[0].token_hash, sha256(cookieToken));
    });

    it('DB stores SHA-256 hashes only — raw tokens absent', async () => {
        const { cookieToken } = await loginFresh();

        const [rawRows] = await db.query(
            'SELECT id FROM sessions WHERE token_hash = ?',
            [cookieToken]
        );
        assert.equal(rawRows.length, 0, 'raw tokens must never be stored');

        const [rows] = await db.query(
            'SELECT token_hash FROM sessions WHERE user_id = ?',
            [adminId]
        );
        for (const row of rows) {
            assert.match(row.token_hash, /^[a-f0-9]{64}$/, 'token_hash must be SHA-256 hex');
            assert.notEqual(row.token_hash, cookieToken);
        }
    });

    it('session expiry is 8h server-side', async () => {
        const { cookieToken } = await loginFresh();
        const [rows] = await db.query(
            'SELECT TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS mins FROM sessions WHERE token_hash = ?',
            [sha256(cookieToken)]
        );
        assert.ok(rows[0].mins >= 475 && rows[0].mins <= 480, `expected ~480m, got ${rows[0].mins}`);
    });

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

    it('Cookie-only succeeds on /auth/me', async () => {
        const { cookieToken } = await loginFresh();
        const res = await agent
            .get('/api/v1/auth/me')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);
        assert.equal(res.body.id, adminId);
        assert.ok(res.body.username);
        assert.equal(res.body.role, 'admin');
    });

    it('no credentials returns 401', async () => {
        await agent.get('/api/v1/auth/me').expect(401);
    });

    it('historically valid JWT/Bearer alone cannot authenticate', async () => {
        await loginFresh();
        const historicalJwt = historicalJwtFor(adminId);
        await db.query(
            `INSERT INTO sessions
             (user_id, token_hash, ip_address, user_agent, device_type, expires_at)
             VALUES (?, ?, '127.0.0.1', 'phase11-historical-jwt', 'test', DATE_ADD(NOW(), INTERVAL 8 HOUR))`,
            [adminId, sha256(historicalJwt)]
        );

        const res = await agent
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${historicalJwt}`)
            .expect(401);
        assert.equal(res.body.message, 'Access denied. No authentication provided.');
    });

    it('cookie + Bearer uses the cookie and does not bypass CSRF', async () => {
        const { cookieToken } = await loginFresh();
        const historicalJwt = historicalJwtFor(adminId);
        await db.query(
            `INSERT INTO sessions
             (user_id, token_hash, ip_address, user_agent, device_type, expires_at)
             VALUES (?, ?, '127.0.0.1', 'phase11-historical-jwt', 'test', DATE_ADD(NOW(), INTERVAL 8 HOUR))`,
            [adminId, sha256(historicalJwt)]
        );

        const me = await agent
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${historicalJwt}`)
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);
        assert.equal(me.body.id, adminId);

        await agent
            .post('/api/v1/auth/resolve-location')
            .set('Authorization', `Bearer ${historicalJwt}`)
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .send({ location: 'Manila' })
            .expect(403);

        await agent
            .post('/api/v1/auth/resolve-location')
            .set('Authorization', `Bearer ${historicalJwt}`)
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .set('Origin', ALLOWED_ORIGIN)
            .send({ location: 'Manila' })
            .expect(200);
    });

    it('malformed Bearer + valid cookie still authenticates', async () => {
        const { cookieToken } = await loginFresh();
        for (const header of ['Bearer not.a.valid.jwt', 'Bearer ', 'Bearer']) {
            await agent
                .get('/api/v1/auth/me')
                .set('Authorization', header)
                .set('Cookie', `${COOKIE}=${cookieToken}`)
                .expect(200);
        }
    });

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

    it('revoked cookie session returns 401', async () => {
        const { cookieToken } = await loginFresh();
        await db.query('UPDATE sessions SET is_active = 0 WHERE token_hash = ?', [sha256(cookieToken)]);
        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(401);
    });

    it('users.is_active remains authoritative for the cookie session', async () => {
        const { cookieToken } = await loginFresh();
        await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [adminId]);
        try {
            await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(403);
            await agent.get('/api/v1/plantings').set('Cookie', `${COOKIE}=${cookieToken}`).expect(403);
            await agent.post('/api/v1/auth/login').send(TEST_USER).expect(401);
        } finally {
            await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [adminId]);
        }

        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(200);
    });

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

    it('csrfGuard unit: safe methods pass and unsafe methods are never Bearer-exempt', () => {
        const run = ({ method, headers = {} }) => {
            let status = null;
            let passed = false;
            const req = { method, headers };
            const res = { status: (s) => { status = s; return { json: () => {} }; } };
            csrfGuard(req, res, () => { passed = true; });
            return { status, passed };
        };

        assert.equal(run({ method: 'GET' }).passed, true);
        assert.equal(run({ method: 'HEAD' }).passed, true);
        assert.equal(run({ method: 'OPTIONS' }).passed, true);
        assert.equal(run({ method: 'PATCH' }).status, 403);
        assert.equal(
            run({ method: 'PATCH', headers: { origin: ALLOWED_ORIGIN } }).passed,
            true
        );
    });

    it('logout revokes the cookie session and clears the cookie', async () => {
        const { cookieToken } = await loginFresh();

        const res = await agent
            .post('/api/v1/auth/logout')
            .set('Cookie', `${COOKIE}=${cookieToken}`)
            .expect(200);

        assert.match(cookieLine(res.headers['set-cookie']) || '', /Expires=/i, 'cookie cleared');

        const [rows] = await db.query(
            'SELECT token_hash, is_active FROM sessions WHERE token_hash = ?',
            [sha256(cookieToken)]
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].is_active, 0);

        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${cookieToken}`).expect(401);
    });

    it('logout is idempotent and clears the cookie with no credentials', async () => {
        const { cookieToken } = await loginFresh();

        for (let i = 0; i < 2; i += 1) {
            await agent
                .post('/api/v1/auth/logout')
                .set('Cookie', `${COOKIE}=${cookieToken}`)
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
        const first = await loginFresh();
        const second = await agent.post('/api/v1/auth/login').send(TEST_USER).expect(200);
        const secondCookie = parseSessionCookie(second.headers['set-cookie']);

        await agent
            .post('/api/v1/auth/logout-all')
            .set('Cookie', `${COOKIE}=${first.cookieToken}`)
            .set('Origin', ALLOWED_ORIGIN)
            .expect(200);

        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${first.cookieToken}`).expect(401);
        await agent.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${secondCookie}`).expect(401);
    });

    it('protected crop endpoints accept cookie and reject missing credentials', async () => {
        const { cookieToken } = await loginFresh();

        const paths = [
            '/api/v1/plantings',
            '/api/v1/varieties',
            '/api/v1/dashboard/lifecycle-monitoring'
        ];
        for (const pathName of paths) {
            await agent.get(pathName).set('Cookie', `${COOKIE}=${cookieToken}`).expect(200);
        }

        for (const pathName of ['/api/v1/plantings', '/api/v1/varieties']) {
            await agent.get(pathName).expect(401);
        }
    });

    it('refresh endpoint is gone', async () => {
        await agent
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: 'legacy-refresh' })
            .expect(404);
    });

    it('process starts with RSA auth key files absent', () => {
        const keyDir = path.join(__dirname, '..');
        const files = ['private.key', 'public.key'];
        const hidden = [];

        for (const name of files) {
            const src = path.join(keyDir, name);
            if (fs.existsSync(src)) {
                const dest = `${src}.phase11bak`;
                fs.renameSync(src, dest);
                hidden.push([src, dest]);
            }
        }

        try {
            const result = spawnSync(process.execPath, ['-e', `
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
require(${JSON.stringify(path.join(__dirname, '..', 'app'))});
process.stdout.write('booted');
process.exit(0);
`], { encoding: 'utf8', timeout: 30000 });

            assert.equal(result.status, 0, result.stderr);
            assert.match(result.stdout, /booted/);
        } finally {
            for (const [src, dest] of hidden) {
                if (fs.existsSync(dest)) fs.renameSync(dest, src);
            }
        }
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
