process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run worker progress-notes tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const { buildCompletedCropsHtml } = require('../utils/completedCropExportHtml');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PASSWORD = 'WorkerNotes-Test-Only!42';
const PREFIX = `wnotes_${Date.now()}`;
const accounts = {
    admin: { username: 'superadmin', password: 'admin1234' },
    secretary: { username: `${PREFIX}_secretary@test.invalid`, password: PASSWORD },
    worker: { username: `${PREFIX}_worker@test.invalid`, password: PASSWORD },
};

const mutation = (agent, method, path) => agent[method](path).set('Origin', ORIGIN);
const rowSnapshot = async (id) => {
    const [rows] = await db.query('SELECT * FROM activities WHERE id = ?', [id]);
    return rows[0] || null;
};

describe('Worker activity progress notes', () => {
    let admin;
    let secretary;
    let worker;
    let plantingId;
    let ids = {};

    const login = async (credentials) => {
        const agent = request.agent(app);
        await agent.post('/api/v1/auth/login').send(credentials).expect(200);
        return agent;
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
               ('Worker Notes Secretary', ?, ?, 'SECRETARY', 1, 'ACTIVE'),
               ('Worker Notes Worker', ?, ?, 'FARM_WORKER', 1, 'ACTIVE')`,
            [
                accounts.secretary.username, hash,
                accounts.worker.username, hash,
            ]
        );

        ids = {
            admin: adminRows[0].id,
            secretary: result.insertId,
            worker: result.insertId + 1,
        };

        [admin, secretary, worker] = await Promise.all([
            login(accounts.admin),
            login(accounts.secretary),
            login(accounts.worker),
        ]);

        const planting = await mutation(secretary, 'post', '/api/v1/plantings')
            .send({
                field_name: `${PREFIX}_field`,
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
        plantingId = planting.body.plantingId;
    });

    after(async () => {
        if (plantingId) {
            await db.query('DELETE FROM activities WHERE planting_id = ?', [plantingId]);
            await db.query('DELETE FROM plantings WHERE id = ?', [plantingId]);
        }
        if (ids.secretary || ids.worker) {
            await db.query('DELETE FROM users WHERE id IN (?, ?)', [ids.secretary, ids.worker]);
        }
    });

    const createPendingActivity = async (notes = null) => {
        const body = {
            planting_id: plantingId,
            activity_type: 'crop_monitoring',
            planned_date: '2026-03-01',
        };
        if (notes != null) body.notes = notes;
        const created = await mutation(secretary, 'post', '/api/v1/activities')
            .send(body)
            .expect(201);
        return created.body.activityId;
    };

    it('lets Worker complete with actual_date + note and persists it on the activity', async () => {
        const activityId = await createPendingActivity('Scheduler placeholder note');
        const observation = 'No significant pest damage observed.';

        await mutation(worker, 'patch', `/api/v1/activities/${activityId}/progress`)
            .send({
                status: 'COMPLETED',
                actual_date: '2026-03-05',
                notes: observation,
            })
            .expect(200);

        const row = await rowSnapshot(activityId);
        assert.equal(row.status, 'COMPLETED');
        assert.equal(
            row.actual_date instanceof Date
                ? row.actual_date.toISOString().slice(0, 10)
                : String(row.actual_date).slice(0, 10),
            '2026-03-05'
        );
        assert.equal(row.notes, observation);

        const detail = await worker.get(`/api/v1/activities/${activityId}`).expect(200);
        assert.equal(detail.body.notes, observation);
        assert.equal(String(detail.body.status).toUpperCase(), 'COMPLETED');

        const html = buildCompletedCropsHtml([{
            planting_id: plantingId,
            field_name: `${PREFIX}_field`,
            crop_variety: 'NSIC Rc110',
            cropping_season: 'DRY_SEASON',
            establishment_method: 'TRANSPLANTED',
            field_condition: 'IRRIGATED',
            planting_date: '2026-01-10',
            expected_harvest: '2026-05-10',
            harvest_date: '2026-05-08',
            cycle_duration: 118,
            yield_kg: 1000,
            quality_grade: 'A',
            financial_value: 1000,
            harvest_remarks: null,
            activities: [{
                activity_type: 'crop_monitoring',
                planned_date: '2026-03-01',
                actual_date: '2026-03-05',
                status: 'COMPLETED',
                notes: observation,
            }],
        }]);
        assert.match(html, /No significant pest damage observed\./);
        assert.match(html, /<th>Notes<\/th>/);
    });

    it('lets Worker complete without a note and preserves existing activity notes', async () => {
        const existing = 'Keep prior system note.';
        const activityId = await createPendingActivity(existing);

        await mutation(worker, 'patch', `/api/v1/activities/${activityId}/progress`)
            .send({ status: 'COMPLETED', actual_date: '2026-03-06' })
            .expect(200);

        const row = await rowSnapshot(activityId);
        assert.equal(row.status, 'COMPLETED');
        assert.equal(row.notes, existing);
    });

    it('normalizes whitespace-only notes to null when notes is explicitly sent', async () => {
        const activityId = await createPendingActivity('Will clear');

        await mutation(worker, 'patch', `/api/v1/activities/${activityId}/progress`)
            .send({ status: 'COMPLETED', actual_date: '2026-03-07', notes: '   ' })
            .expect(200);

        const row = await rowSnapshot(activityId);
        assert.equal(row.notes, null);
    });

    it('rejects notes longer than 1000 characters', async () => {
        const activityId = await createPendingActivity();
        const before = await rowSnapshot(activityId);

        await mutation(worker, 'patch', `/api/v1/activities/${activityId}/progress`)
            .send({
                status: 'COMPLETED',
                actual_date: '2026-03-08',
                notes: 'x'.repeat(1001),
            })
            .expect(400);

        assert.deepEqual(await rowSnapshot(activityId), before);
    });

    it('still rejects forbidden progress fields and non-COMPLETED statuses', async () => {
        const activityId = await createPendingActivity();
        const before = await rowSnapshot(activityId);
        const attacks = [
            { status: 'COMPLETED', actual_date: '2026-03-09', planned_date: '2030-01-01' },
            { status: 'COMPLETED', actual_date: '2026-03-09', planting_id: plantingId },
            { status: 'COMPLETED', actual_date: '2026-03-09', activity_type: 'harvesting' },
            { status: 'SKIPPED', actual_date: '2026-03-09', notes: 'nope' },
            { status: 'CANCELLED', actual_date: '2026-03-09' },
        ];

        for (const body of attacks) {
            await mutation(worker, 'patch', `/api/v1/activities/${activityId}/progress`)
                .send(body)
                .expect(400);
            assert.deepEqual(await rowSnapshot(activityId), before);
        }
    });

    it('keeps Admin full activity update with notes unchanged', async () => {
        const activityId = await createPendingActivity();
        await mutation(admin, 'put', `/api/v1/activities/${activityId}`)
            .send({
                status: 'COMPLETED',
                actual_date: '2026-03-10',
                notes: 'Admin recorded observation.',
            })
            .expect(200);
        const row = await rowSnapshot(activityId);
        assert.equal(row.status, 'COMPLETED');
        assert.equal(row.notes, 'Admin recorded observation.');
    });

    it('keeps Secretary full activity update with notes unchanged', async () => {
        const activityId = await createPendingActivity();
        await mutation(secretary, 'put', `/api/v1/activities/${activityId}`)
            .send({
                status: 'COMPLETED',
                actual_date: '2026-03-11',
                notes: 'Secretary recorded observation.',
            })
            .expect(200);
        const row = await rowSnapshot(activityId);
        assert.equal(row.status, 'COMPLETED');
        assert.equal(row.notes, 'Secretary recorded observation.');
    });

    it('still denies Worker full activity PUT', async () => {
        const activityId = await createPendingActivity();
        const before = await rowSnapshot(activityId);
        await mutation(worker, 'put', `/api/v1/activities/${activityId}`)
            .send({ notes: 'should fail', status: 'COMPLETED', actual_date: '2026-03-12' })
            .expect(403);
        assert.deepEqual(await rowSnapshot(activityId), before);
    });
});
