/**
 * Weather Location SSE invalidation — focused regression tests.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run weather-sse tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const {
    addClient,
    removeClient,
    getClientCount,
    broadcastFarmLocationChanged,
    FARM_LOCATION_CHANGED_PAYLOAD,
} = require('../utils/weatherLocationHub');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `wx_sse_${Date.now()}_${process.pid}`;
const PASSWORD = 'Wx-Sse-Test!42';
const ADMIN = { username: 'superadmin', password: 'admin1234' };

const mutation = (agent, method, path) => agent[method](path).set('Origin', ORIGIN);

const cookieFrom = (res) => {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie) return '';
    return (Array.isArray(setCookie) ? setCookie : [setCookie])
        .map((line) => line.split(';')[0])
        .join('; ');
};

const loginSession = async (username, password) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/login').send({ username, password }).expect(200);
    return { agent, cookieHeader: cookieFrom(res) };
};

/**
 * Open GET /weather/events until predicate matches, then tear down.
 */
const readSse = (cookieHeader, predicate, timeoutMs = 8000) => new Promise((resolve, reject) => {
    assert.match(cookieHeader, /agritrack_session=/);

    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        let buf = '';
        let done = false;

        const finish = (payload, err) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { req.destroy(); } catch { /* ignore */ }
            server.close(() => {
                if (err) reject(err);
                else resolve(payload);
            });
        };

        const timer = setTimeout(() => {
            finish(null, new Error(`SSE timeout body=${buf.slice(0, 240)}`));
        }, timeoutMs);

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/api/v1/weather/events',
            method: 'GET',
            headers: {
                Accept: 'text/event-stream',
                Cookie: cookieHeader,
            },
        }, (res) => {
            if (res.statusCode !== 200) {
                res.on('data', (c) => { buf += c; });
                res.on('end', () => finish({ status: res.statusCode, body: buf, headers: res.headers }));
                return;
            }

            res.on('data', (chunk) => {
                buf += chunk.toString('utf8');
                if (predicate(buf, res)) {
                    finish({ status: res.statusCode, body: buf, headers: res.headers });
                }
            });
            res.on('error', (err) => {
                if (!done) finish(null, err);
            });
        });

        req.on('error', (err) => {
            // destroy() after a successful read often surfaces as ECONNRESET — ignore once done.
            if (!done && err.code !== 'ECONNRESET') {
                finish(null, err);
            }
        });
        req.end();
    });
});

describe('Weather Location SSE', () => {
    let adminAgent;
    let adminCookie;
    let workerAgent;
    let workerCookie;
    let secretaryCookie;
    let workerId;
    let secretaryId;
    let adminId;

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        const [adminRows] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [ADMIN.username]
        );
        assert.ok(adminRows.length, 'test admin missing; run npm run test:setup-db');
        adminId = adminRows[0].id;
        await db.query(
            'UPDATE users SET is_active = 1, status = ? WHERE id = ?',
            ['ACTIVE', adminId]
        );

        ({ agent: adminAgent, cookieHeader: adminCookie } = await loginSession(ADMIN.username, ADMIN.password));

        const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
        const [ins] = await db.query(
            `INSERT INTO users (name, email, password, role, is_active, status)
             VALUES (?, ?, ?, 'FARM_WORKER', 1, 'ACTIVE'),
                    (?, ?, ?, 'SECRETARY', 1, 'ACTIVE')`,
            [
                `${PREFIX}_worker`, `${PREFIX}_worker@test.invalid`, hash,
                `${PREFIX}_sec`, `${PREFIX}_sec@test.invalid`, hash,
            ]
        );
        workerId = ins.insertId;
        secretaryId = ins.insertId + 1;

        ({ agent: workerAgent, cookieHeader: workerCookie } = await loginSession(
            `${PREFIX}_worker@test.invalid`,
            PASSWORD
        ));
        ({ cookieHeader: secretaryCookie } = await loginSession(
            `${PREFIX}_sec@test.invalid`,
            PASSWORD
        ));
    });

    after(async () => {
        for (const id of [workerId, secretaryId].filter(Boolean)) {
            await db.query('DELETE FROM sessions WHERE user_id = ?', [id]);
            await db.query('DELETE FROM notifications WHERE user_id = ?', [id]);
            await db.query('DELETE FROM users WHERE id = ?', [id]);
        }
        await db.end();
    });

    it('hub removes disconnected clients and broadcasts only the invalidation signal', () => {
        const before = getClientCount();
        const writes = [];
        const fakeRes = { write: (chunk) => { writes.push(String(chunk)); } };
        addClient(fakeRes);
        assert.equal(getClientCount(), before + 1);

        broadcastFarmLocationChanged();
        assert.equal(writes.length, 1);
        assert.equal(writes[0], FARM_LOCATION_CHANGED_PAYLOAD);
        assert.match(writes[0], /event: farm-location-changed/);
        assert.match(writes[0], /"type":"farm_location_changed"/);
        assert.doesNotMatch(writes[0], /latitude|longitude|password|appid|session|token|OPENWEATHER/i);

        removeClient(fakeRes);
        assert.equal(getClientCount(), before);
    });

    it('unauthenticated GET /weather/events returns 401', async () => {
        await request(app).get('/api/v1/weather/events').expect(401);
    });

    it('authenticated user without WEATHER_READ receives 403', async () => {
        const connection = await db.getConnection();
        try {
            await connection.query("SET SESSION sql_mode = ''");
            await connection.query('UPDATE users SET role = ? WHERE id = ?', ['', workerId]);
        } finally {
            connection.release();
        }

        await workerAgent.get('/api/v1/weather/events').expect(403);

        await db.query('UPDATE users SET role = ? WHERE id = ?', ['FARM_WORKER', workerId]);
    });

    it('authorized Admin can establish SSE stream', async () => {
        const result = await readSse(
            adminCookie,
            (buf, res) => (
                String(res.headers['content-type'] || '').includes('text/event-stream')
                && (buf.includes(': connected') || buf.includes(': heartbeat'))
            )
        );
        assert.equal(result.status, 200);
        assert.match(String(result.headers['content-type']), /text\/event-stream/);
        assert.equal(result.headers['x-accel-buffering'], 'no');
    });

    it('authorized Worker and Secretary can establish SSE stream', async () => {
        const workerStream = await readSse(
            workerCookie,
            (buf) => buf.includes(': connected') || buf.includes(': heartbeat')
        );
        assert.equal(workerStream.status, 200);

        const secretaryStream = await readSse(
            secretaryCookie,
            (buf) => buf.includes(': connected') || buf.includes(': heartbeat')
        );
        assert.equal(secretaryStream.status, 200);
    });

    it('failed farm-location write does not broadcast', async () => {
        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);
        const before = writes.length;

        await mutation(adminAgent, 'put', '/api/v1/auth/farm-location')
            .send({ psgcCode: 'not-a-real-psgc' })
            .expect(400);

        assert.equal(writes.length, before);
        removeClient(fakeRes);
    });

    it('successful farm-location remove broadcasts farm_location_changed', async () => {
        await db.query(
            `UPDATE users
             SET farm_latitude = 15.1, farm_longitude = 120.2, farm_location_name = 'SSE Fixture'
             WHERE id = ?`,
            [adminId]
        );

        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);

        await mutation(adminAgent, 'delete', '/api/v1/auth/farm-location').expect(200);

        assert.ok(writes.some((w) => w.includes('farm-location-changed')));
        assert.ok(writes.every((w) => !/latitude|longitude|15\.1|120\.2/i.test(w)));
        removeClient(fakeRes);
    });

    it('successful farm-location update broadcasts farm_location_changed', async () => {
        const resolve = await mutation(adminAgent, 'post', '/api/v1/auth/resolve-location')
            .send({ location: 'Jaen' })
            .expect(200);
        const code = resolve.body.suggestions?.[0]?.psgcCode;
        assert.ok(code, 'expected PSGC suggestion for Jaen');

        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);

        const save = await mutation(adminAgent, 'put', '/api/v1/auth/farm-location')
            .send({ psgcCode: code });

        assert.equal(save.status, 200, JSON.stringify(save.body));
        assert.ok(writes.some((w) => w.includes('farm-location-changed')));
        assert.ok(writes.every((w) => !/appid|OPENWEATHER|password/i.test(w)));
        removeClient(fakeRes);

        await mutation(adminAgent, 'delete', '/api/v1/auth/farm-location').expect(200);
    });

    it('SSE close removes subscriber from hub', async () => {
        const before = getClientCount();
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();

        await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: '/api/v1/weather/events',
                method: 'GET',
                headers: { Accept: 'text/event-stream', Cookie: adminCookie },
            }, (res) => {
                assert.equal(res.statusCode, 200);
                res.once('data', () => {
                    assert.ok(getClientCount() >= before + 1);
                    req.destroy();
                });
                res.on('close', () => {
                    setTimeout(() => {
                        assert.equal(getClientCount(), before);
                        server.close(() => resolve());
                    }, 50);
                });
            });
            req.on('error', () => {
                // destroy() may emit; still wait for close path
            });
            req.end();
            setTimeout(() => reject(new Error('SSE close test timeout')), 8000);
        });
    });
});
