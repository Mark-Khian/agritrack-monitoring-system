process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 5 tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const { normalizeRole, hasCapability, CAPABILITIES } = require('../security/rbac');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PASSWORD = 'Phase5-Test-Only!42';
const PREFIX = `phase5_${Date.now()}`;
const accounts = {
    admin: { username: 'superadmin', password: 'admin1234' },
    secretary: { username: `${PREFIX}_secretary@test.invalid`, password: PASSWORD },
    worker: { username: `${PREFIX}_worker@test.invalid`, password: PASSWORD },
    inactive: { username: `${PREFIX}_inactive@test.invalid`, password: PASSWORD },
    unknown: { username: `${PREFIX}_unknown@test.invalid`, password: PASSWORD },
};

const mutation = (agent, method, path) => agent[method](path).set('Origin', ORIGIN);
const rowSnapshot = async (table, id) => {
    const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [id]);
    return rows[0] || null;
};

describe('Phase 5 centralized RBAC', () => {
    let admin;
    let secretary;
    let worker;
    let unknown;
    let ids;
    let secretaryPlantingId;
    let harvestPlantingId;
    let adminDeletePlantingId;
    let activityId;
    let workerProgressActivityId;
    let harvestId;
    let secretaryNoteId;
    let secretaryNotificationId;
    let workerNotificationId;

    const login = async (credentials) => {
        const agent = request.agent(app);
        const response = await agent.post('/api/v1/auth/login').send(credentials).expect(200);
        assert.ok(response.headers['set-cookie']?.some((line) => line.startsWith('agritrack_session=')));
        return agent;
    };

    const createPlanting = async (agent, fieldName) => {
        const response = await mutation(agent, 'post', '/api/v1/plantings')
            .send({
                field_name: fieldName,
                variety_class: 'Irrigated / Lowland Varieties',
                variety: 'NSIC Rc110',
                planting_date: '2026-01-10',
                cropping_season: 'DRY_SEASON',
                establishment_method: 'TRANSPLANTED',
                field_condition: 'IRRIGATED',
                lifecycle_state: 'ACTIVE',
                status: 'active',
            })
            .expect(201);
        return response.body.plantingId;
    };

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        const hash = await bcrypt.hash(PASSWORD, 12);
        const [adminRows] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [accounts.admin.username]
        );
        assert.ok(adminRows.length, 'test admin missing; run npm run test:setup-db');

        const [result] = await db.query(
            `INSERT INTO users (name, email, password, role, is_active, status)
             VALUES
               ('Phase 5 Secretary', ?, ?, 'SECRETARY', 1, 'ACTIVE'),
               ('Phase 5 Worker', ?, ?, 'FARM_WORKER', 1, 'ACTIVE'),
               ('Phase 5 Inactive', ?, ?, 'FARM_WORKER', 0, 'INACTIVE'),
               ('Phase 5 Unknown', ?, ?, 'FARM_WORKER', 1, 'ACTIVE')`,
            [
                accounts.secretary.username, hash,
                accounts.worker.username, hash,
                accounts.inactive.username, hash,
                accounts.unknown.username, hash,
            ]
        );

        ids = {
            admin: adminRows[0].id,
            secretary: result.insertId,
            worker: result.insertId + 1,
            inactive: result.insertId + 2,
            unknown: result.insertId + 3,
        };

        [admin, secretary, worker, unknown] = await Promise.all([
            login(accounts.admin),
            login(accounts.secretary),
            login(accounts.worker),
            login(accounts.unknown),
        ]);

        // Create an unrecognized DB role only inside the disposable test database,
        // after login, so the already-issued valid session exercises default deny.
        const connection = await db.getConnection();
        try {
            await connection.query("SET SESSION sql_mode = ''");
            await connection.query("UPDATE users SET role = '' WHERE id = ?", [ids.unknown]);
        } finally {
            connection.release();
        }

        secretaryPlantingId = await createPlanting(secretary, `${PREFIX}_secretary`);
        harvestPlantingId = await createPlanting(secretary, `${PREFIX}_harvest`);
        adminDeletePlantingId = await createPlanting(admin, `${PREFIX}_admin_delete`);

        const activityResponse = await mutation(secretary, 'post', '/api/v1/activities')
            .send({
                planting_id: secretaryPlantingId,
                activity_type: 'other',
                planned_date: '2026-08-01',
                notes: 'Phase 5 secretary activity',
            })
            .expect(201);
        activityId = activityResponse.body.activityId;

        const progressResponse = await mutation(secretary, 'post', '/api/v1/activities')
            .send({
                planting_id: secretaryPlantingId,
                activity_type: 'weeding',
                planned_date: '2026-08-02',
                notes: 'Phase 5 worker progress target',
            })
            .expect(201);
        workerProgressActivityId = progressResponse.body.activityId;

        const harvestResponse = await mutation(secretary, 'post', '/api/v1/harvests')
            .send({
                planting_id: harvestPlantingId,
                harvest_date: '2026-09-01',
                yield_kg: 250,
                quality_grade: 'A',
                remarks: 'Phase 5 harvest',
                financial_value: 5000,
            })
            .expect(201);
        harvestId = harvestResponse.body.harvestId;

        const noteResponse = await mutation(secretary, 'post', '/api/v1/notes')
            .send({
                title: 'Phase 5 private note',
                description: 'Secretary only',
                note_date: '2026-09-10',
                color: 'slate',
            })
            .expect(201);
        secretaryNoteId = noteResponse.body.data.id;

        const [secretaryNotification] = await db.query(
            `INSERT INTO notifications
             (user_id, type, title, message, is_read, notif_date)
             VALUES (?, 'system_guidance', 'Secretary private', 'Private', 0, '2026-09-10')`,
            [ids.secretary]
        );
        secretaryNotificationId = secretaryNotification.insertId;
        const [workerNotification] = await db.query(
            `INSERT INTO notifications
             (user_id, type, title, message, is_read, notif_date)
             VALUES (?, 'system_guidance', 'Worker private', 'Private', 0, '2026-09-10')`,
            [ids.worker]
        );
        workerNotificationId = workerNotification.insertId;
    });

    after(async () => {
        if (ids) {
            await db.query('DELETE FROM notifications WHERE user_id IN (?, ?, ?, ?)', [
                ids.secretary, ids.worker, ids.inactive, ids.unknown
            ]);
            await db.query('DELETE FROM notes WHERE user_id IN (?, ?, ?, ?)', [
                ids.secretary, ids.worker, ids.inactive, ids.unknown
            ]);
            await db.query('DELETE FROM sessions WHERE user_id IN (?, ?, ?, ?)', [
                ids.secretary, ids.worker, ids.inactive, ids.unknown
            ]);
        }

        const [plantings] = await db.query(
            'SELECT id FROM plantings WHERE field_name LIKE ?',
            [`${PREFIX}%`]
        );
        const plantingIds = plantings.map((row) => row.id);
        if (plantingIds.length > 0) {
            await db.query(
                `DELETE FROM harvests WHERE planting_id IN (${plantingIds.map(() => '?').join(',')})`,
                plantingIds
            );
            await db.query(
                `DELETE FROM activities WHERE planting_id IN (${plantingIds.map(() => '?').join(',')})`,
                plantingIds
            );
            await db.query(
                `DELETE FROM plantings WHERE id IN (${plantingIds.map(() => '?').join(',')})`,
                plantingIds
            );
        }
        await db.query('DELETE FROM users WHERE email LIKE ?', [`${PREFIX}%`]);
        await db.end();
    });

    it('normalizes only frozen role spellings and defaults unknown roles to deny', () => {
        assert.equal(normalizeRole('admin'), 'ADMIN');
        assert.equal(normalizeRole('ADMIN'), 'ADMIN');
        assert.equal(normalizeRole('SECRETARY'), 'SECRETARY');
        assert.equal(normalizeRole('FARM_WORKER'), 'FARM_WORKER');
        assert.equal(normalizeRole('AdMiN'), null);
        assert.equal(normalizeRole(undefined), null);
        assert.equal(hasCapability('FARM_WORKER', CAPABILITIES.HARVEST_READ), false);
        assert.equal(hasCapability('SECRETARY', CAPABILITIES.HARVEST_READ), true);
    });

    it('enforces authentication, unknown-role, and inactive-account boundaries', async () => {
        await request(app).get('/api/v1/dashboard/lifecycle-monitoring').expect(401);
        await unknown.get('/api/v1/dashboard/lifecycle-monitoring').expect(403);
        await request(app).post('/api/v1/auth/login').send(accounts.inactive).expect(403);
    });

    it('preserves the transitional Admin contract and returns canonical subordinate roles', async () => {
        assert.equal((await admin.get('/api/v1/auth/me').expect(200)).body.role, 'admin');
        assert.equal((await secretary.get('/api/v1/auth/me').expect(200)).body.role, 'SECRETARY');
        assert.equal((await worker.get('/api/v1/auth/me').expect(200)).body.role, 'FARM_WORKER');
    });

    it('allows Secretary CRUD-minus-delete, calendar management, reports data, and weather reads', async () => {
        await secretary.get('/api/v1/dashboard/lifecycle-monitoring').expect(200);
        await secretary.get('/api/v1/plantings').expect(200);
        await mutation(secretary, 'put', `/api/v1/plantings/${secretaryPlantingId}`)
            .send({ expected_stage: 'Vegetative Stage' })
            .expect(200);

        await secretary.get('/api/v1/activities').expect(200);
        await mutation(secretary, 'put', `/api/v1/activities/${activityId}`)
            .send({ status: 'SKIPPED' })
            .expect(200);

        await secretary.get('/api/v1/harvests').expect(200);
        await mutation(secretary, 'put', `/api/v1/harvests/${harvestId}`)
            .send({
                planting_id: harvestPlantingId,
                harvest_date: '2026-09-01',
                yield_kg: 275,
                quality_grade: 'A',
                remarks: 'Phase 5 harvest updated',
                financial_value: 5500,
            })
            .expect(200);

        await mutation(secretary, 'put', `/api/v1/notes/${secretaryNoteId}`)
            .send({
                title: 'Phase 5 private note updated',
                description: 'Still private',
                note_date: '2026-09-10',
                color: 'blue',
            })
            .expect(200);

        const weather = await secretary.get('/api/v1/weather');
        assert.notEqual(weather.status, 401);
        assert.notEqual(weather.status, 403);
    });

    it('denies every Secretary privileged operation before mutation', async () => {
        const cases = [
            ['delete', `/api/v1/plantings/${secretaryPlantingId}`, 'plantings', secretaryPlantingId],
            ['delete', `/api/v1/activities/${activityId}`, 'activities', activityId],
            ['delete', `/api/v1/harvests/${harvestId}`, 'harvests', harvestId],
        ];
        for (const [method, path, table, id] of cases) {
            const beforeRow = await rowSnapshot(table, id);
            await mutation(secretary, method, path).expect(403);
            assert.deepEqual(await rowSnapshot(table, id), beforeRow, `${path} changed the database`);
        }

        await secretary.get('/api/v1/plantings/export/csv').expect(403);
        await secretary.get('/api/v1/plantings/export/pdf').expect(403);
        await secretary.get(`/api/v1/plantings/${secretaryPlantingId}/export/pdf`).expect(403);
        await secretary.get('/api/v1/harvests/export/csv').expect(403);
        await secretary.get('/api/v1/backups').expect(403);
        await secretary.get('/api/v1/backups/download/fake.sql').expect(403);
        await mutation(secretary, 'post', '/api/v1/backups/run').expect(403);
        await mutation(secretary, 'put', '/api/v1/auth/farm-location')
            .send({ psgcCode: 'fake' })
            .expect(403);
        await mutation(secretary, 'post', '/api/v1/auth/resolve-location')
            .send({ location: 'Cabanatuan' })
            .expect(403);
    });

    it('limits Worker to current planting reads and the exact progress patch', async () => {
        await worker.get('/api/v1/dashboard/lifecycle-monitoring').expect(200);
        const plantingResponse = await worker.get('/api/v1/plantings').expect(200);
        assert.ok(plantingResponse.body.data.every((row) => row.status === 'active'));
        assert.ok(plantingResponse.body.data.every((row) => row.user_id === undefined));
        await worker.get(`/api/v1/plantings/${harvestPlantingId}`).expect(404);
        await worker.get('/api/v1/activities').expect(200);
        await worker.get('/api/v1/notes').expect(200);

        await mutation(worker, 'patch', `/api/v1/activities/${workerProgressActivityId}/progress`)
            .send({ status: 'COMPLETED', actual_date: '2026-09-10' })
            .expect(200);
        const updated = await rowSnapshot('activities', workerProgressActivityId);
        assert.equal(updated.status, 'COMPLETED');
        assert.equal(
            updated.actual_date instanceof Date
                ? updated.actual_date.toISOString().slice(0, 10)
                : String(updated.actual_date).slice(0, 10),
            '2026-09-10'
        );

        const weather = await worker.get('/api/v1/weather');
        assert.notEqual(weather.status, 401);
        assert.notEqual(weather.status, 403);
    });

    it('rejects Worker field injection and status expansion with no database mutation', async () => {
        const beforeRow = await rowSnapshot('activities', activityId);
        const attacks = [
            { status: 'COMPLETED', actual_date: '2026-09-10', planned_date: '2030-01-01' },
            { status: 'COMPLETED', actual_date: '2026-09-10', planting_id: ids.admin },
            { status: 'COMPLETED', actual_date: '2026-09-10', activity_type: 'harvesting' },
            { status: 'COMPLETED', actual_date: '2026-09-10', is_system_generated: true },
            { status: 'SKIPPED', actual_date: '2026-09-10' },
            { status: 'CANCELLED', actual_date: '2026-09-10' },
            { status: 'COMPLETED' },
        ];

        for (const body of attacks) {
            await mutation(worker, 'patch', `/api/v1/activities/${activityId}/progress`)
                .send(body)
                .expect(400);
            assert.deepEqual(await rowSnapshot('activities', activityId), beforeRow);
        }
    });

    it('denies all Worker administrative routes with 403 and no mutation', async () => {
        const plantingBefore = await rowSnapshot('plantings', secretaryPlantingId);
        const activityBefore = await rowSnapshot('activities', activityId);
        const harvestBefore = await rowSnapshot('harvests', harvestId);
        const noteBefore = await rowSnapshot('notes', secretaryNoteId);

        const forbidden = [
            ['post', '/api/v1/plantings', { role: 'ADMIN' }],
            ['put', `/api/v1/plantings/${secretaryPlantingId}`, { status: 'completed' }],
            ['delete', `/api/v1/plantings/${secretaryPlantingId}`],
            ['post', '/api/v1/activities', { role: 'ADMIN' }],
            ['put', `/api/v1/activities/${activityId}`, { status: 'COMPLETED' }],
            ['delete', `/api/v1/activities/${activityId}`],
            ['get', '/api/v1/harvests'],
            ['post', '/api/v1/harvests', { role: 'ADMIN' }],
            ['put', `/api/v1/harvests/${harvestId}`, { role: 'ADMIN' }],
            ['delete', `/api/v1/harvests/${harvestId}`],
            ['get', '/api/v1/plantings/export/csv'],
            ['get', '/api/v1/harvests/export/pdf'],
            ['post', '/api/v1/notes', { title: 'forbidden' }],
            ['put', `/api/v1/notes/${secretaryNoteId}`, { title: 'forbidden' }],
            ['delete', `/api/v1/notes/${secretaryNoteId}`],
            ['get', '/api/v1/backups'],
            ['get', '/api/v1/backups/download/fake.sql'],
            ['put', '/api/v1/auth/farm-location', { psgcCode: 'fake' }],
        ];

        for (const [method, path, body] of forbidden) {
            let call = method === 'get' ? worker.get(path) : mutation(worker, method, path);
            call = call.set('X-Role', 'ADMIN');
            if (body) call = call.send({ ...body, role: 'ADMIN', user_id: ids.admin });
            await call.expect(403);
        }

        assert.deepEqual(await rowSnapshot('plantings', secretaryPlantingId), plantingBefore);
        assert.deepEqual(await rowSnapshot('activities', activityId), activityBefore);
        assert.deepEqual(await rowSnapshot('harvests', harvestId), harvestBefore);
        assert.deepEqual(await rowSnapshot('notes', secretaryNoteId), noteBefore);
    });

    it('keeps notes and notifications strictly self-scoped despite user_id manipulation', async () => {
        const workerNotes = await worker.get(`/api/v1/notes?user_id=${ids.secretary}`).expect(200);
        assert.ok(workerNotes.body.data.every((note) => note.user_id === undefined || note.user_id === ids.worker));
        assert.ok(!workerNotes.body.data.some((note) => note.id === secretaryNoteId));

        const workerNotifications = await worker
            .get(`/api/v1/notifications?user_id=${ids.secretary}`)
            .expect(200);
        assert.ok(workerNotifications.body.data.some((item) => item.id === workerNotificationId));
        assert.ok(!workerNotifications.body.data.some((item) => item.id === secretaryNotificationId));

        await mutation(worker, 'patch', `/api/v1/notifications/${workerNotificationId}/read`)
            .send({ user_id: ids.secretary, role: 'ADMIN' })
            .expect(200);
        assert.equal((await rowSnapshot('notifications', workerNotificationId)).is_read, 1);

        await mutation(worker, 'patch', `/api/v1/notifications/${secretaryNotificationId}/read`)
            .send({ user_id: ids.secretary, role: 'ADMIN' })
            .expect(404);
        assert.equal((await rowSnapshot('notifications', secretaryNotificationId)).is_read, 0);

        await mutation(worker, 'delete', `/api/v1/notifications/${secretaryNotificationId}`)
            .send({ user_id: ids.secretary })
            .expect(404);
        assert.ok(await rowSnapshot('notifications', secretaryNotificationId));

        await mutation(worker, 'delete', `/api/v1/notifications/${workerNotificationId}`)
            .send({ user_id: ids.secretary })
            .expect(200);
        assert.equal(await rowSnapshot('notifications', workerNotificationId), null);
    });

    it('keeps Admin functionality and delete authority while backup remains safely disabled in test', async () => {
        await admin
            .get(`/api/v1/plantings/export/csv?plantingIds=${harvestPlantingId}`)
            .expect(200);
        await admin.get('/api/v1/backups').expect(503);

        await mutation(admin, 'delete', `/api/v1/activities/${activityId}`).expect(200);
        await mutation(admin, 'delete', `/api/v1/harvests/${harvestId}`).expect(200);
        await mutation(admin, 'delete', `/api/v1/plantings/${adminDeletePlantingId}`).expect(200);
    });
});
