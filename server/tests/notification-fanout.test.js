/**
 * Final notification fan-out policy — weather + activity overdue + lifecycle
 * across Admin / Secretary / Farm Worker with per-user read isolation.
 * Notification fan-out must NOT expand Worker activity-edit RBAC.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run notification-fanout tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const {
    generateWeatherNotifications,
    generateOverdueNotifications,
    generateLifecycleNotifications,
    setRainStatusOverrideForTests,
    getFarmNotificationRecipientIds,
} = require('../utils/notificationService');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `notif_fo_${Date.now()}_${process.pid}`;
const PASSWORD = 'Notif-Fanout-Test!42';
const ADMIN = { username: 'superadmin', password: 'admin1234' };

const mutation = (agent, method, path) => agent[method](path).set('Origin', ORIGIN);

const loginSession = async (username, password) => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ username, password }).expect(200);
    return agent;
};

const todayYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysAgoYmd = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const rowsFor = async (type, userIds, relatedId = null) => {
    if (!userIds.length) return [];
    let sql = `SELECT id, user_id, type, title, message, related_id, is_read
               FROM notifications
               WHERE type = ? AND notif_date = CURDATE() AND user_id IN (?)`;
    const params = [type, userIds];
    if (relatedId != null) {
        sql += ' AND related_id = ?';
        params.push(relatedId);
    }
    sql += ' ORDER BY user_id ASC';
    const [rows] = await db.query(sql, params);
    return rows;
};

const assertFanOut = (rows, adminId, secretaryId, workerId, inactiveId, archivedId) => {
    const byUser = new Map(rows.map((row) => [row.user_id, row]));
    assert.ok(byUser.has(adminId));
    assert.ok(byUser.has(secretaryId));
    assert.ok(byUser.has(workerId));
    assert.ok(!byUser.has(inactiveId));
    assert.ok(!byUser.has(archivedId));
    assert.notEqual(byUser.get(adminId).id, byUser.get(secretaryId).id);
    assert.notEqual(byUser.get(adminId).id, byUser.get(workerId).id);
    assert.notEqual(byUser.get(secretaryId).id, byUser.get(workerId).id);
    assert.equal(byUser.get(adminId).title, byUser.get(secretaryId).title);
    assert.equal(byUser.get(adminId).title, byUser.get(workerId).title);
    assert.equal(byUser.get(adminId).message, byUser.get(secretaryId).message);
    assert.equal(byUser.get(adminId).message, byUser.get(workerId).message);
    return byUser;
};

describe('Notification fan-out (weather + activity + lifecycle)', () => {
    let adminAgent;
    let secretaryAgent;
    let workerAgent;
    let adminId;
    let secretaryId;
    let workerId;
    let inactiveId;
    let archivedId;
    let plantingId;
    let overdueActivityId;
    const createdUserIds = [];
    const scopedUserIds = () => [adminId, secretaryId, workerId, inactiveId, archivedId];

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

        adminAgent = await loginSession(ADMIN.username, ADMIN.password);

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

        secretaryAgent = await loginSession(`${PREFIX}_sec@test.invalid`, PASSWORD);
        workerAgent = await loginSession(`${PREFIX}_worker@test.invalid`, PASSWORD);

        const created = await mutation(adminAgent, 'post', '/api/v1/plantings')
            .send({
                field_name: `${PREFIX}_field`,
                variety_class: 'Irrigated / Lowland Varieties',
                variety: 'NSIC Rc110',
                planting_date: daysAgoYmd(20),
                expected_growth_days: 100,
                cropping_season: 'DRY_SEASON',
                establishment_method: 'TRANSPLANTED',
                field_condition: 'IRRIGATED',
                lifecycle_state: 'ACTIVE',
                status: 'active',
            })
            .expect(201);
        plantingId = created.body.plantingId;

        const overdue = await mutation(adminAgent, 'post', '/api/v1/activities')
            .send({
                planting_id: plantingId,
                activity_type: 'irrigation',
                planned_date: daysAgoYmd(2),
                notes: `${PREFIX}_overdue`,
            })
            .expect(201);
        overdueActivityId = overdue.body.activityId;

        await db.query(
            `UPDATE users
             SET farm_latitude = 15.35, farm_longitude = 120.94, farm_location_name = 'Fanout Farm'
             WHERE id = ?`,
            [adminId]
        );
        setRainStatusOverrideForTests(async () => ({ rainExpected: true }));
    });

    after(async () => {
        setRainStatusOverrideForTests(null);

        await db.query(
            `DELETE FROM notifications
             WHERE user_id IN (?)
                OR related_id IN (?, ?)`,
            [scopedUserIds(), overdueActivityId, plantingId]
        );

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

    it('recipient helper includes only active non-archived farm roles', async () => {
        const ids = await getFarmNotificationRecipientIds();
        assert.ok(ids.includes(adminId));
        assert.ok(ids.includes(secretaryId));
        assert.ok(ids.includes(workerId));
        assert.ok(!ids.includes(inactiveId));
        assert.ok(!ids.includes(archivedId));
    });

    it('fans out weather alerts to admin, secretary, and worker', async () => {
        await db.query(
            `DELETE FROM notifications WHERE type = 'weather_alert' AND notif_date = CURDATE() AND user_id IN (?)`,
            [scopedUserIds()]
        );
        assert.equal(await generateWeatherNotifications(), true);
        assertFanOut(
            await rowsFor('weather_alert', scopedUserIds()),
            adminId, secretaryId, workerId, inactiveId, archivedId
        );
    });

    it('fans out overdue activity alerts to admin, secretary, and worker', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE type = 'activity_overdue' AND related_id = ? AND user_id IN (?)`,
            [overdueActivityId, scopedUserIds()]
        );
        assert.equal(await generateOverdueNotifications(), true);
        const byUser = assertFanOut(
            await rowsFor('activity_overdue', scopedUserIds(), overdueActivityId),
            adminId, secretaryId, workerId, inactiveId, archivedId
        );
        assert.match(byUser.get(adminId).title, /Overdue:.*[Ii]rrigation/i);
    });

    it('fans out lifecycle updates to admin, secretary, and worker', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE type = 'lifecycle_update' AND related_id = ? AND user_id IN (?)`,
            [plantingId, scopedUserIds()]
        );
        assert.equal(await generateLifecycleNotifications(), true);
        const byUser = assertFanOut(
            await rowsFor('lifecycle_update', scopedUserIds(), plantingId),
            adminId, secretaryId, workerId, inactiveId, archivedId
        );
        assert.match(byUser.get(adminId).title, /Lifecycle Update:/);
    });

    it('admin mark-read does not affect secretary/worker copies', async () => {
        const overdue = assertFanOut(
            await rowsFor('activity_overdue', scopedUserIds(), overdueActivityId),
            adminId, secretaryId, workerId, inactiveId, archivedId
        );

        await mutation(adminAgent, 'patch', `/api/v1/notifications/${overdue.get(adminId).id}/read`)
            .expect(200);

        const after = await rowsFor('activity_overdue', scopedUserIds(), overdueActivityId);
        const byUser = new Map(after.map((row) => [row.user_id, row]));
        assert.equal(Number(byUser.get(adminId).is_read), 1);
        assert.equal(Number(byUser.get(secretaryId).is_read), 0);
        assert.equal(Number(byUser.get(workerId).is_read), 0);
    });

    it('secretary mark-read does not affect worker/admin copies', async () => {
        const overdue = await rowsFor('activity_overdue', scopedUserIds(), overdueActivityId);
        const byUser = new Map(overdue.map((row) => [row.user_id, row]));

        await mutation(secretaryAgent, 'patch', `/api/v1/notifications/${byUser.get(secretaryId).id}/read`)
            .expect(200);

        const after = await rowsFor('activity_overdue', scopedUserIds(), overdueActivityId);
        const afterByUser = new Map(after.map((row) => [row.user_id, row]));
        assert.equal(Number(afterByUser.get(adminId).is_read), 1);
        assert.equal(Number(afterByUser.get(secretaryId).is_read), 1);
        assert.equal(Number(afterByUser.get(workerId).is_read), 0);
    });

    it('APIs remain user-scoped for activity notifications', async () => {
        const overdue = await rowsFor('activity_overdue', [adminId, secretaryId, workerId], overdueActivityId);
        const byUser = new Map(overdue.map((row) => [row.user_id, row]));

        const adminList = await adminAgent.get('/api/v1/notifications').expect(200);
        const secretaryList = await secretaryAgent.get('/api/v1/notifications').expect(200);
        const workerList = await workerAgent.get('/api/v1/notifications').expect(200);

        assert.ok(adminList.body.data.some((n) => n.id === byUser.get(adminId).id));
        assert.ok(!adminList.body.data.some((n) => n.id === byUser.get(secretaryId).id));
        assert.ok(!adminList.body.data.some((n) => n.id === byUser.get(workerId).id));

        assert.ok(secretaryList.body.data.some((n) => n.id === byUser.get(secretaryId).id));
        assert.ok(!secretaryList.body.data.some((n) => n.id === byUser.get(adminId).id));

        assert.ok(workerList.body.data.some((n) => n.id === byUser.get(workerId).id));
        assert.ok(!workerList.body.data.some((n) => n.id === byUser.get(adminId).id));
    });

    it('admin existing overdue copy does not suppress secretary/worker copies', async () => {
        await db.query(
            `DELETE FROM notifications
             WHERE type = 'activity_overdue' AND related_id = ? AND user_id IN (?)`,
            [overdueActivityId, [secretaryId, workerId]]
        );
        const [adminOnly] = await db.query(
            `SELECT COUNT(*) AS count FROM notifications
             WHERE type = 'activity_overdue' AND related_id = ? AND user_id = ? AND notif_date = CURDATE()`,
            [overdueActivityId, adminId]
        );
        assert.ok(Number(adminOnly[0].count) >= 1);

        assert.equal(await generateOverdueNotifications(), true);
        assertFanOut(
            await rowsFor('activity_overdue', scopedUserIds(), overdueActivityId),
            adminId, secretaryId, workerId, inactiveId, archivedId
        );
    });

    it('repeated overdue generation does not duplicate per user', async () => {
        const before = await rowsFor('activity_overdue', [adminId, secretaryId, workerId], overdueActivityId);
        assert.equal(before.length, 3);
        // May still return true if OTHER overdue activities in the shared test DB insert,
        // so assert our related_id rows stay stable.
        await generateOverdueNotifications();
        const after = await rowsFor('activity_overdue', [adminId, secretaryId, workerId], overdueActivityId);
        assert.equal(after.length, 3);
        assert.deepEqual(
            after.map((row) => row.id).sort((a, b) => a - b),
            before.map((row) => row.id).sort((a, b) => a - b)
        );
    });

    it('Worker RBAC remains limited — no unrestricted activity PUT', async () => {
        const denied = await mutation(workerAgent, 'put', `/api/v1/activities/${overdueActivityId}`)
            .send({
                planting_id: plantingId,
                activity_type: 'irrigation',
                planned_date: daysAgoYmd(2),
                status: 'COMPLETED',
                notes: 'worker should not fully edit',
            });
        assert.equal(denied.status, 403);

        const progress = await mutation(workerAgent, 'patch', `/api/v1/activities/${overdueActivityId}/progress`)
            .send({
                status: 'COMPLETED',
                actual_date: todayYmd(),
            });
        assert.ok([200, 400].includes(progress.status));
        if (progress.status === 200) {
            await db.query(
                `UPDATE activities SET status = 'PENDING', actual_date = NULL WHERE id = ?`,
                [overdueActivityId]
            );
        }
    });
});
