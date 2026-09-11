/**
 * Plantings SSE invalidation — focused regression tests.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run planting-sse tests outside crop_management_rearch_test');
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
    broadcastPlantingsChanged,
    PLANTINGS_CHANGED_PAYLOAD,
} = require('../utils/plantingHub');
const {
    getClientCount: getWeatherClientCount,
} = require('../utils/weatherLocationHub');
const {
    getClientCount: getNotificationClientCount,
} = require('../utils/notificationHub');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `pl_sse_${Date.now()}_${process.pid}`;
const PASSWORD = 'Pl-Sse-Test!42';
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

const todayYmd = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const plantingBody = (fieldName, extras = {}) => ({
    field_name: fieldName,
    variety_class: 'Irrigated / Lowland Varieties',
    variety: 'NSIC Rc110',
    planting_date: todayYmd(),
    cropping_season: 'DRY_SEASON',
    establishment_method: 'TRANSPLANTED',
    field_condition: 'IRRIGATED',
    lifecycle_state: 'ACTIVE',
    status: 'active',
    ...extras,
});

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
            path: '/api/v1/plantings/events',
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
            if (!done && err.code !== 'ECONNRESET') {
                finish(null, err);
            }
        });
        req.end();
    });
});

describe('Plantings SSE', () => {
    let adminAgent;
    let adminCookie;
    let workerAgent;
    let workerCookie;
    let secretaryCookie;
    let workerId;
    let secretaryId;
    let createdPlantingIds = [];

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        const [adminRows] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [ADMIN.username]
        );
        assert.ok(adminRows.length, 'test admin missing; run npm run test:setup-db');
        await db.query(
            'UPDATE users SET is_active = 1, status = ? WHERE id = ?',
            ['ACTIVE', adminRows[0].id]
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
        for (const id of createdPlantingIds.filter(Boolean)) {
            await db.query('DELETE FROM activities WHERE planting_id = ?', [id]);
            await db.query('DELETE FROM plantings WHERE id = ?', [id]);
        }
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

        broadcastPlantingsChanged();
        assert.equal(writes.length, 1);
        assert.equal(writes[0], PLANTINGS_CHANGED_PAYLOAD);
        assert.match(writes[0], /event: plantings-changed/);
        assert.match(writes[0], /"type":"plantings_changed"/);
        assert.doesNotMatch(writes[0], /field_name|variety|planting_date|password|session|token|latitude/i);

        removeClient(fakeRes);
        assert.equal(getClientCount(), before);
    });

    it('unauthenticated GET /plantings/events returns 401', async () => {
        await request(app).get('/api/v1/plantings/events').expect(401);
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

    it('authorized Secretary can establish SSE stream', async () => {
        const result = await readSse(
            secretaryCookie,
            (buf) => buf.includes(': connected') || buf.includes(': heartbeat')
        );
        assert.equal(result.status, 200);
    });

    it('authorized Worker with Plantings read can establish SSE stream', async () => {
        const result = await readSse(
            workerCookie,
            (buf) => buf.includes(': connected') || buf.includes(': heartbeat')
        );
        assert.equal(result.status, 200);
    });

    it('failed/no-op Planting mutation does not broadcast', async () => {
        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);
        const before = writes.length;

        await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send({ field_name: '' })
            .expect(400);

        assert.equal(writes.length, before);
        removeClient(fakeRes);
    });

    it('successful Planting create broadcasts once', async () => {
        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);

        const created = await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_create`))
            .expect(201);
        createdPlantingIds.push(created.body.plantingId);

        const hits = writes.filter((w) => w.includes('plantings-changed'));
        assert.equal(hits.length, 1);
        assert.ok(hits.every((w) => !/field_name|NSIC|variety|password/i.test(w)));
        removeClient(fakeRes);
    });

    it('successful Planting update broadcasts once', async () => {
        const created = await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_update`))
            .expect(201);
        const plantingId = created.body.plantingId;
        createdPlantingIds.push(plantingId);

        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);

        await mutation(adminAgent, 'put', `/api/v1/plantings/${plantingId}`)
            .send({
                ...plantingBody(`${PREFIX}_update`),
                adjustment_days: 3,
                expected_growth_days: 120,
            })
            .expect(200);

        const hits = writes.filter((w) => w.includes('plantings-changed'));
        assert.equal(hits.length, 1);
        removeClient(fakeRes);
    });

    it('Worker RBAC/lifecycle filtering is unchanged', async () => {
        const active = await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_worker_active`))
            .expect(201);
        createdPlantingIds.push(active.body.plantingId);

        const abandoned = await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_worker_abandon`))
            .expect(201);
        createdPlantingIds.push(abandoned.body.plantingId);

        await db.query(
            `UPDATE plantings
             SET lifecycle_state = 'ABANDONED', status = 'active'
             WHERE id = ?`,
            [abandoned.body.plantingId]
        );

        const list = await workerAgent.get('/api/v1/plantings?limit=100').expect(200);
        const ids = (list.body.data || []).map((p) => p.id);
        assert.ok(ids.includes(active.body.plantingId));
        assert.ok(!ids.includes(abandoned.body.plantingId));

        for (const row of list.body.data || []) {
            assert.ok(
                ['ACTIVE', 'MATURING', 'READY_FOR_HARVEST'].includes(String(row.lifecycle_state || '').toUpperCase())
                || String(row.status).toLowerCase() === 'active'
            );
        }
        const lifecycleOk = (list.body.data || []).every((p) =>
            ['ACTIVE', 'MATURING', 'READY_FOR_HARVEST'].includes(String(p.lifecycle_state || '').toUpperCase())
        );
        assert.ok(lifecycleOk);
    });

    it('Weather and Notification SSE hubs remain unaffected', () => {
        const weatherBefore = getWeatherClientCount();
        const notifBefore = getNotificationClientCount();
        broadcastPlantingsChanged();
        assert.equal(getWeatherClientCount(), weatherBefore);
        assert.equal(getNotificationClientCount(), notifBefore);
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
                path: '/api/v1/plantings/events',
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
