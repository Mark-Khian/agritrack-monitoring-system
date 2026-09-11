/**
 * Notifications SSE invalidation — focused regression tests.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run notification-sse tests outside crop_management_rearch_test');
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
    broadcastNotificationsChanged,
    NOTIFICATIONS_CHANGED_PAYLOAD,
} = require('../utils/notificationHub');
const {
    getClientCount: getWeatherClientCount,
} = require('../utils/weatherLocationHub');
const {
    runActivityCycle,
    runWeatherCycle,
    setRainStatusOverrideForTests,
} = require('../utils/notificationService');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `notif_sse_${Date.now()}_${process.pid}`;
const PASSWORD = 'Notif-Sse-Test!42';
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

/**
 * Open GET /notifications/events until predicate matches, then tear down.
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
            path: '/api/v1/notifications/events',
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

describe('Notifications SSE', () => {
    let adminAgent;
    let adminCookie;
    let workerAgent;
    let workerCookie;
    let secretaryCookie;
    let workerId;
    let secretaryId;
    let adminId;
    let plantingId;
    let activityId;

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

        const field = `${PREFIX}_field`;
        const created = await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send({
                field_name: field,
                variety_class: 'Irrigated / Lowland Varieties',
                variety: 'NSIC Rc110',
                planting_date: todayYmd(),
                cropping_season: 'DRY_SEASON',
                establishment_method: 'TRANSPLANTED',
                field_condition: 'IRRIGATED',
                lifecycle_state: 'ACTIVE',
                status: 'active',
            })
            .expect(201);
        plantingId = created.body.plantingId;

        const activity = await mutation(adminAgent, 'post', '/api/v1/activities')
            .send({
                planting_id: plantingId,
                activity_type: 'weeding',
                planned_date: todayYmd(),
                notes: `${PREFIX}_due`,
            })
            .expect(201);
        activityId = activity.body.activityId;

        await db.query(
            `UPDATE users
             SET farm_latitude = 15.35, farm_longitude = 120.94, farm_location_name = 'SSE Notif Farm'
             WHERE id = ?`,
            [adminId]
        );
    });

    after(async () => {
        setRainStatusOverrideForTests(null);

        if (plantingId) {
            await db.query('DELETE FROM notifications WHERE related_id = ?', [activityId]);
            await db.query('DELETE FROM notifications WHERE related_id = ?', [plantingId]);
            await db.query('DELETE FROM notifications WHERE user_id = ? AND type = ?', [adminId, 'weather_alert']);
            await db.query('DELETE FROM activities WHERE planting_id = ?', [plantingId]);
            await db.query('DELETE FROM plantings WHERE id = ?', [plantingId]);
        }

        for (const id of [workerId, secretaryId].filter(Boolean)) {
            await db.query('DELETE FROM sessions WHERE user_id = ?', [id]);
            await db.query('DELETE FROM notifications WHERE user_id = ?', [id]);
            await db.query('DELETE FROM users WHERE id = ?', [id]);
        }

        await db.query(
            `UPDATE users
             SET farm_latitude = NULL, farm_longitude = NULL, farm_location_name = NULL
             WHERE id = ?`,
            [adminId]
        );
        await db.end();
    });

    it('hub removes disconnected clients and broadcasts only the invalidation signal', () => {
        const before = getClientCount();
        const writes = [];
        const fakeRes = { write: (chunk) => { writes.push(String(chunk)); } };
        addClient(fakeRes);
        assert.equal(getClientCount(), before + 1);

        broadcastNotificationsChanged();
        assert.equal(writes.length, 1);
        assert.equal(writes[0], NOTIFICATIONS_CHANGED_PAYLOAD);
        assert.match(writes[0], /event: notifications-changed/);
        assert.match(writes[0], /"type":"notifications_changed"/);
        assert.doesNotMatch(writes[0], /title|message|latitude|longitude|password|session|token|OPENWEATHER|email/i);

        removeClient(fakeRes);
        assert.equal(getClientCount(), before);
    });

    it('unauthenticated GET /notifications/events returns 401', async () => {
        await request(app).get('/api/v1/notifications/events').expect(401);
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

    it('authorized Worker can establish SSE stream', async () => {
        const result = await readSse(
            workerCookie,
            (buf) => buf.includes(': connected') || buf.includes(': heartbeat')
        );
        assert.equal(result.status, 200);
    });

    it('failed/no-op weather generation does not broadcast', async () => {
        // Ensure prune has nothing to delete so a no-op cycle stays silent.
        await db.query(
            `DELETE FROM notifications WHERE user_id = ? AND type = 'weather_alert'`,
            [adminId]
        );

        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);
        const before = writes.length;

        setRainStatusOverrideForTests(async () => ({ rainExpected: false }));
        await runWeatherCycle();

        assert.equal(writes.length, before);
        removeClient(fakeRes);
        setRainStatusOverrideForTests(null);
    });

    it('creation of weather alert triggers notifications_changed', async () => {
        await db.query(
            `DELETE FROM notifications WHERE user_id = ? AND type = 'weather_alert' AND notif_date = CURDATE()`,
            [adminId]
        );

        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);

        setRainStatusOverrideForTests(async () => ({ rainExpected: true }));
        await runWeatherCycle();

        assert.ok(writes.some((w) => w.includes('notifications-changed')));
        assert.ok(writes.every((w) => !/Rain Expected|15\.35|120\.94|SSE Notif Farm|OPENWEATHER|appid/i.test(w)));
        removeClient(fakeRes);
        setRainStatusOverrideForTests(null);
    });

    it('creation of activity/lifecycle alert triggers notifications_changed', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE related_id IN (?, ?)
                OR (user_id = ? AND type IN ('activity_due', 'activity_overdue', 'lifecycle_update') AND notif_date = CURDATE())`,
            [activityId, plantingId, adminId]
        );

        const writes = [];
        const fakeRes = { write: (c) => writes.push(String(c)) };
        addClient(fakeRes);

        await runActivityCycle();

        assert.ok(writes.some((w) => w.includes('notifications-changed')));
        assert.ok(writes.every((w) => !/weeding|Due Today|Lifecycle Update|password|session/i.test(w)));
        removeClient(fakeRes);
    });

    it('existing notification authorization remains unchanged', async () => {
        const [ins] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, related_id, notif_date, is_read)
             VALUES (?, 'system_guidance', 'Worker only', 'scoped', NULL, CURDATE(), 0)`,
            [workerId]
        );
        const notifId = ins.insertId;

        const list = await workerAgent.get('/api/v1/notifications').expect(200);
        assert.ok(list.body.data.some((n) => n.id === notifId));

        await mutation(workerAgent, 'patch', `/api/v1/notifications/${notifId}/read`).expect(200);

        const secretaryList = await request(app)
            .get('/api/v1/notifications')
            .set('Cookie', secretaryCookie)
            .expect(200);
        assert.ok(!secretaryList.body.data.some((n) => n.id === notifId));

        await db.query('DELETE FROM notifications WHERE id = ?', [notifId]);
    });

    it('Weather Location SSE hub remains unaffected by notification broadcasts', () => {
        const weatherBefore = getWeatherClientCount();
        broadcastNotificationsChanged();
        assert.equal(getWeatherClientCount(), weatherBefore);
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
                path: '/api/v1/notifications/events',
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
