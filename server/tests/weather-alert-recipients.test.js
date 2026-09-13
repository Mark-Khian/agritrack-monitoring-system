/**
 * Weather alert recipient fan-out — Admin / Secretary / Farm Worker sync,
 * per-user read state, inactive/archived exclusion, and per-user dedupe.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run weather-alert-recipients tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const {
    generateWeatherNotifications,
    runWeatherCycle,
    setRainStatusOverrideForTests,
    getWeatherAlertRecipientIds,
} = require('../utils/notificationService');
const { addClient, removeClient } = require('../utils/notificationHub');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `wx_rcpt_${Date.now()}_${process.pid}`;
const PASSWORD = 'Wx-Alert-Recipients!42';
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

const weatherRowsFor = async (userIds) => {
    if (!userIds.length) return [];
    const [rows] = await db.query(
        `SELECT id, user_id, type, title, message, is_read, notif_date
         FROM notifications
         WHERE type = 'weather_alert'
           AND notif_date = CURDATE()
           AND user_id IN (?)
         ORDER BY user_id ASC`,
        [userIds]
    );
    return rows;
};

describe('Weather alert recipient fan-out', () => {
    let adminAgent;
    let secretaryAgent;
    let workerAgent;
    let adminId;
    let secretaryId;
    let workerId;
    let inactiveId;
    let archivedId;
    let plantingId;
    const createdUserIds = [];

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
            'UPDATE users SET is_active = 1, status = ?, archived_at = NULL WHERE id = ?',
            ['ACTIVE', adminId]
        );

        ({ agent: adminAgent } = await loginSession(ADMIN.username, ADMIN.password));

        const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
        const [ins] = await db.query(
            `INSERT INTO users (name, email, password, role, is_active, status, archived_at)
             VALUES
               (?, ?, ?, 'SECRETARY', 1, 'ACTIVE', NULL),
               (?, ?, ?, 'FARM_WORKER', 1, 'ACTIVE', NULL),
               (?, ?, ?, 'FARM_WORKER', 0, 'INACTIVE', NULL),
               (?, ?, ?, 'SECRETARY', 0, 'INACTIVE', NOW())`,
            [
                `${PREFIX}_sec`, `${PREFIX}_sec@test.invalid`, hash,
                `${PREFIX}_worker`, `${PREFIX}_worker@test.invalid`, hash,
                `${PREFIX}_inactive`, `${PREFIX}_inactive@test.invalid`, hash,
                `${PREFIX}_archived`, `${PREFIX}_archived@test.invalid`, hash,
            ]
        );
        secretaryId = ins.insertId;
        workerId = ins.insertId + 1;
        inactiveId = ins.insertId + 2;
        archivedId = ins.insertId + 3;
        createdUserIds.push(secretaryId, workerId, inactiveId, archivedId);

        ({ agent: secretaryAgent } = await loginSession(`${PREFIX}_sec@test.invalid`, PASSWORD));
        ({ agent: workerAgent } = await loginSession(`${PREFIX}_worker@test.invalid`, PASSWORD));

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

        await db.query(
            `UPDATE users
             SET farm_latitude = 15.35, farm_longitude = 120.94, farm_location_name = 'Wx Fanout Farm'
             WHERE id = ?`,
            [adminId]
        );

        setRainStatusOverrideForTests(async () => ({ rainExpected: true }));
    });

    after(async () => {
        setRainStatusOverrideForTests(null);

        const allIds = [adminId, ...createdUserIds].filter(Boolean);
        if (allIds.length) {
            await db.query(
                `DELETE FROM notifications WHERE type = 'weather_alert' AND user_id IN (?)`,
                [allIds]
            );
        }

        if (plantingId) {
            await db.query('DELETE FROM activities WHERE planting_id = ?', [plantingId]);
            await db.query('DELETE FROM plantings WHERE id = ?', [plantingId]);
        }

        for (const id of createdUserIds) {
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

    it('recipient helper includes only active non-archived admin/secretary/worker', async () => {
        const ids = await getWeatherAlertRecipientIds();
        assert.ok(ids.includes(adminId));
        assert.ok(ids.includes(secretaryId));
        assert.ok(ids.includes(workerId));
        assert.ok(!ids.includes(inactiveId));
        assert.ok(!ids.includes(archivedId));
    });

    it('fans out equivalent weather alerts to admin, secretary, and worker', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE type = 'weather_alert' AND notif_date = CURDATE()
               AND user_id IN (?)`,
            [[adminId, secretaryId, workerId, inactiveId, archivedId]]
        );

        const created = await generateWeatherNotifications();
        assert.equal(created, true);

        const rows = await weatherRowsFor([adminId, secretaryId, workerId, inactiveId, archivedId]);
        const byUser = new Map(rows.map((row) => [row.user_id, row]));

        assert.ok(byUser.has(adminId), 'admin should receive weather alert');
        assert.ok(byUser.has(secretaryId), 'secretary should receive weather alert');
        assert.ok(byUser.has(workerId), 'worker should receive weather alert');
        assert.ok(!byUser.has(inactiveId), 'inactive user must not receive weather alert');
        assert.ok(!byUser.has(archivedId), 'archived user must not receive weather alert');

        const adminRow = byUser.get(adminId);
        const secretaryRow = byUser.get(secretaryId);
        const workerRow = byUser.get(workerId);

        assert.notEqual(adminRow.id, secretaryRow.id);
        assert.notEqual(adminRow.id, workerRow.id);
        assert.notEqual(secretaryRow.id, workerRow.id);

        assert.equal(adminRow.title, secretaryRow.title);
        assert.equal(adminRow.title, workerRow.title);
        assert.equal(adminRow.message, secretaryRow.message);
        assert.equal(adminRow.message, workerRow.message);
        assert.match(adminRow.title, /Rain Expected at Wx Fanout Farm/);
    });

    it('admin marking read does not change secretary/worker unread state', async () => {
        const rows = await weatherRowsFor([adminId, secretaryId, workerId]);
        const byUser = new Map(rows.map((row) => [row.user_id, row]));
        assert.ok(byUser.has(adminId));

        await mutation(adminAgent, 'patch', `/api/v1/notifications/${byUser.get(adminId).id}/read`)
            .expect(200);

        const after = await weatherRowsFor([adminId, secretaryId, workerId]);
        const afterByUser = new Map(after.map((row) => [row.user_id, row]));
        assert.equal(Number(afterByUser.get(adminId).is_read), 1);
        assert.equal(Number(afterByUser.get(secretaryId).is_read), 0);
        assert.equal(Number(afterByUser.get(workerId).is_read), 0);

        const secretaryList = await secretaryAgent.get('/api/v1/notifications').expect(200);
        const workerList = await workerAgent.get('/api/v1/notifications').expect(200);
        const adminList = await adminAgent.get('/api/v1/notifications').expect(200);

        assert.ok(secretaryList.body.data.some((n) => n.id === afterByUser.get(secretaryId).id));
        assert.ok(workerList.body.data.some((n) => n.id === afterByUser.get(workerId).id));
        assert.ok(adminList.body.data.some((n) => n.id === afterByUser.get(adminId).id && Number(n.is_read) === 1));

        assert.ok(!secretaryList.body.data.some((n) => n.id === afterByUser.get(adminId).id));
        assert.ok(!secretaryList.body.data.some((n) => n.id === afterByUser.get(workerId).id));
        assert.ok(!workerList.body.data.some((n) => n.id === afterByUser.get(adminId).id));
        assert.ok(!workerList.body.data.some((n) => n.id === afterByUser.get(secretaryId).id));
        assert.ok(!adminList.body.data.some((n) => n.id === afterByUser.get(secretaryId).id));
        assert.ok(!adminList.body.data.some((n) => n.id === afterByUser.get(workerId).id));
    });

    it('duplicate scheduler cycle does not create a second copy per user', async () => {
        const before = await weatherRowsFor([adminId, secretaryId, workerId]);
        assert.equal(before.length, 3);

        const createdAgain = await generateWeatherNotifications();
        assert.equal(createdAgain, false);

        const after = await weatherRowsFor([adminId, secretaryId, workerId]);
        assert.equal(after.length, 3);
        assert.deepEqual(
            after.map((row) => row.id).sort((a, b) => a - b),
            before.map((row) => row.id).sort((a, b) => a - b)
        );
    });

    it('admin existing copy does not suppress secretary/worker copies', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE type = 'weather_alert' AND notif_date = CURDATE()
               AND user_id IN (?)`,
            [[secretaryId, workerId]]
        );

        const [adminOnly] = await db.query(
            `SELECT COUNT(*) AS count FROM notifications
             WHERE type = 'weather_alert' AND notif_date = CURDATE() AND user_id = ?`,
            [adminId]
        );
        assert.ok(Number(adminOnly[0].count) >= 1);

        const created = await generateWeatherNotifications();
        assert.equal(created, true);

        const rows = await weatherRowsFor([adminId, secretaryId, workerId]);
        const byUser = new Map(rows.map((row) => [row.user_id, row]));
        assert.ok(byUser.has(adminId));
        assert.ok(byUser.has(secretaryId));
        assert.ok(byUser.has(workerId));
    });

    it('weather cycle still broadcasts a content-free invalidation signal', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE type = 'weather_alert' AND notif_date = CURDATE()
               AND user_id IN (?)`,
            [[adminId, secretaryId, workerId]]
        );

        const writes = [];
        const fakeRes = { write: (chunk) => writes.push(String(chunk)) };
        addClient(fakeRes);

        await runWeatherCycle();

        assert.ok(writes.some((w) => w.includes('notifications-changed')));
        assert.ok(writes.every((w) => !/Rain Expected|Wx Fanout Farm|OPENWEATHER|appid/i.test(w)));
        removeClient(fakeRes);
    });
});
