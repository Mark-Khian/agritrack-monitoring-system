process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 8 tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const { CAPABILITIES, hasCapability, normalizeRole } = require('../security/rbac');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `phase8_${Date.now()}_${process.pid}`;
const ADMIN = { username: 'superadmin', password: 'admin1234' };
const PASSWORD = 'Phase8-Test-Only!42';
const NEW_PASSWORD = 'Phase8-Changed!84';
const LIFECYCLE_ACTIONS = [
    'CREATE_USER',
    'RESET_USER_PASSWORD',
    'CHANGE_PASSWORD',
    'DISABLE_USER',
    'REACTIVATE_USER',
    'REVOKE_USER_SESSIONS',
];

const mutation = (agent, method, urlPath) => agent[method](urlPath).set('Origin', ORIGIN);

const plantingBody = (fieldName) => ({
    field_name: fieldName,
    variety_class: 'Irrigated / Lowland Varieties',
    variety: 'NSIC Rc110',
    planting_date: '2026-01-10',
    cropping_season: 'DRY_SEASON',
    establishment_method: 'TRANSPLANTED',
    field_condition: 'IRRIGATED',
    lifecycle_state: 'ACTIVE',
    status: 'active',
});

const login = async (credentials, status = 200) => {
    const agent = request.agent(app);
    const response = await agent.post('/api/v1/auth/login').send(credentials).expect(status);
    return { agent, response };
};

const ensureIndex = async (name, columnsSql) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'activity_logs'
           AND INDEX_NAME = ?`,
        [name]
    );
    if (!Number(row.cnt)) {
        await db.query(`ALTER TABLE activity_logs ADD KEY ${name} ${columnsSql}`);
    }
};

const latestLog = async (action, extraSql = '', params = []) => {
    const [rows] = await db.query(
        `SELECT * FROM activity_logs WHERE action = ? ${extraSql} ORDER BY id DESC LIMIT 1`,
        [action, ...params]
    );
    return rows[0] || null;
};

const logCount = async (whereSql = '', params = []) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS count FROM activity_logs ${whereSql}`,
        params
    );
    return Number(row.count);
};

const assertNoSecrets = (value, secrets = []) => {
    const serialized = JSON.stringify(value);
    for (const secret of secrets) {
        if (!secret) continue;
        assert.equal(serialized.includes(secret), false, 'audit payload leaked a secret');
    }
    assert.equal(
        /password_hash|"password"|temporaryPassword|refreshToken|Authorization|challengeAnswer|answer_hash/i.test(serialized),
        false
    );
};

describe('Phase 8 — Audit & Accountability', () => {
    let admin;
    let secretary;
    let worker;
    let ids;
    let secretaryPlantingId;
    let harvestPlantingId;
    let progressActivityId;
    let createdUser;
    let issuedSecrets = [];
    let retainUserId;

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        await ensureIndex('idx_activity_logs_created_id', '(created_at, id)');
        await ensureIndex('idx_activity_logs_action_created', '(action, created_at)');

        const hash = await bcrypt.hash(PASSWORD, 12);
        const [adminRows] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [ADMIN.username]
        );
        assert.ok(adminRows.length, 'test admin missing; run npm run test:setup-db');

        const [result] = await db.query(
            `INSERT INTO users (name, email, password, role, is_active, status)
             VALUES
               ('Phase 8 Secretary', ?, ?, 'SECRETARY', 1, 'ACTIVE'),
               ('Phase 8 Worker', ?, ?, 'FARM_WORKER', 1, 'ACTIVE'),
               ('Phase 8 Retain', ?, ?, 'SECRETARY', 1, 'ACTIVE')`,
            [
                `${PREFIX}_secretary`, hash,
                `${PREFIX}_worker`, hash,
                `${PREFIX}_retain`, hash,
            ]
        );

        ids = {
            admin: adminRows[0].id,
            secretary: result.insertId,
            worker: result.insertId + 1,
            retain: result.insertId + 2,
        };
        retainUserId = ids.retain;

        ({ agent: admin } = await login(ADMIN));
        ({ agent: secretary } = await login({ username: `${PREFIX}_secretary`, password: PASSWORD }));
        ({ agent: worker } = await login({ username: `${PREFIX}_worker`, password: PASSWORD }));

        const planting = await mutation(secretary, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_secretary`))
            .expect(201);
        secretaryPlantingId = planting.body.plantingId;

        const harvestPlanting = await mutation(secretary, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_harvest`))
            .expect(201);
        harvestPlantingId = harvestPlanting.body.plantingId;

        const progress = await mutation(secretary, 'post', '/api/v1/activities')
            .send({
                planting_id: secretaryPlantingId,
                activity_type: 'weeding',
                planned_date: '2026-08-02',
                notes: 'Phase 8 worker progress target',
            })
            .expect(201);
        progressActivityId = progress.body.activityId;
    });

    after(async () => {
        await db.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');

        const [plantings] = await db.query(
            'SELECT id FROM plantings WHERE field_name LIKE ?',
            [`${PREFIX}%`]
        );
        const plantingIds = plantings.map((row) => row.id);
        if (plantingIds.length > 0) {
            const placeholders = plantingIds.map(() => '?').join(',');
            await db.query(`DELETE FROM harvests WHERE planting_id IN (${placeholders})`, plantingIds);
            await db.query(`DELETE FROM activities WHERE planting_id IN (${placeholders})`, plantingIds);
            await db.query(`DELETE FROM plantings WHERE id IN (${placeholders})`, plantingIds);
        }

        const userIds = [ids?.secretary, ids?.worker, ids?.retain, createdUser?.id].filter(Boolean);
        if (userIds.length) {
            const placeholders = userIds.map(() => '?').join(',');
            await db.query(`DELETE FROM sessions WHERE user_id IN (${placeholders})`, userIds);
            await db.query(`DELETE FROM notes WHERE user_id IN (${placeholders})`, userIds);
            await db.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
            await db.query(
                `DELETE FROM activity_logs
                 WHERE user_id IN (${placeholders})
                    OR (entity = 'users' AND entity_id IN (${placeholders}))`,
                [...userIds, ...userIds]
            );
            await db.query(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
        }
        await db.query('DELETE FROM login_attempts WHERE email LIKE ?', [`${PREFIX}%`]);
        await db.end();
    });

    it('snapshots Admin/Secretary/Worker actors from the database role, not spoofed input', async () => {
        assert.equal(normalizeRole('admin'), 'ADMIN');
        assert.equal(hasCapability('SECRETARY', CAPABILITIES.AUDIT_READ), false);
        assert.equal(hasCapability('FARM_WORKER', CAPABILITIES.AUDIT_READ), false);
        assert.equal(hasCapability('ADMIN', CAPABILITIES.AUDIT_READ), true);
        assert.equal(hasCapability('admin', CAPABILITIES.AUDIT_READ), true);

        const adminLogin = await latestLog('LOGIN_SUCCESS', 'AND entity_id = ?', [ids.admin]);
        assert.equal(adminLogin.user_id, ids.admin);
        assert.equal(adminLogin.actor_role, 'ADMIN');
        assert.equal(adminLogin.entity, 'users');
        assert.equal(adminLogin.status, 'success');

        const secretaryLogin = await latestLog('LOGIN_SUCCESS', 'AND entity_id = ?', [ids.secretary]);
        assert.equal(secretaryLogin.user_id, ids.secretary);
        assert.equal(secretaryLogin.actor_role, 'SECRETARY');

        const workerLogin = await latestLog('LOGIN_SUCCESS', 'AND entity_id = ?', [ids.worker]);
        assert.equal(workerLogin.user_id, ids.worker);
        assert.equal(workerLogin.actor_role, 'FARM_WORKER');

        const spoofedPlanting = await mutation(secretary, 'post', '/api/v1/plantings')
            .set('X-Role', 'ADMIN')
            .query({ role: 'ADMIN', actor_role: 'ADMIN', user_id: ids.admin })
            .send({
                ...plantingBody(`${PREFIX}_spoof`),
                role: 'ADMIN',
                actor_role: 'ADMIN',
                user_id: ids.admin,
            })
            .expect(201);

        const spoofLog = await latestLog('CREATE_PLANTING', 'AND entity_id = ?', [spoofedPlanting.body.plantingId]);
        assert.equal(spoofLog.user_id, ids.secretary);
        assert.equal(spoofLog.actor_role, 'SECRETARY');
        assert.notEqual(spoofLog.user_id, ids.admin);
        assert.notEqual(spoofLog.actor_role, 'ADMIN');

        await mutation(worker, 'patch', `/api/v1/activities/${progressActivityId}/progress`)
            .set('X-Role', 'ADMIN')
            .query({ role: 'ADMIN', actor_role: 'ADMIN' })
            .send({ actual_date: '2026-08-03', status: 'COMPLETED' })
            .expect(200);

        const progressLog = await latestLog('UPDATE_ACTIVITY_PROGRESS', 'AND entity_id = ?', [progressActivityId]);
        assert.equal(progressLog.user_id, ids.worker);
        assert.equal(progressLog.actor_role, 'FARM_WORKER');
    });

    it('keeps known-account login failures as NULL actor with target in entity_id', async () => {
        const failed = await request(app)
            .post('/api/v1/auth/login')
            .set('X-Forwarded-For', '203.0.113.9, 127.0.0.1')
            .send({ username: `${PREFIX}_secretary`, password: 'wrong-password' })
            .expect(401);

        assert.equal(failed.body.message, 'Invalid credentials.');
        assert.equal(JSON.stringify(failed.body).includes(`${PREFIX}_secretary`), false);

        const row = await latestLog('LOGIN_FAILED', 'AND entity_id = ?', [ids.secretary]);
        assert.equal(row.user_id, null);
        assert.equal(row.actor_role, null);
        assert.equal(row.action, 'LOGIN_FAILED');
        assert.equal(row.entity, 'users');
        assert.equal(row.entity_id, ids.secretary);
        assert.equal(row.status, 'failed');
        assert.equal(typeof row.ip_address, 'string');
        assert.ok(row.ip_address.length > 0);
        assert.notEqual(row.ip_address, 'unknown');
    });

    it('leaves unknown-identity failures and reads out of activity_logs', async () => {
        const beforeUnknown = await logCount();
        await request(app)
            .post('/api/v1/auth/login')
            .send({ username: `${PREFIX}_nobody`, password: 'wrong-password' })
            .expect(401);
        assert.equal(await logCount(), beforeUnknown);

        const beforeReads = await logCount();
        await secretary.get('/api/v1/plantings').expect(200);
        await secretary.get('/api/v1/notes').expect(200);
        await secretary.post('/api/v1/auth/challenge').send({ username: `${PREFIX}_secretary` });
        assert.equal(await logCount(), beforeReads);
    });

    it('records logout, logout-all, and failed current-password change without secrets', async () => {
        const logoutAgent = (await login({ username: `${PREFIX}_secretary`, password: PASSWORD })).agent;
        await logoutAgent.post('/api/v1/auth/logout').set('Origin', ORIGIN).expect(200);
        const logoutRow = await latestLog('LOGOUT', 'AND entity_id = ?', [ids.secretary]);
        assert.equal(logoutRow.user_id, ids.secretary);
        assert.equal(logoutRow.actor_role, 'SECRETARY');
        assert.equal(logoutRow.entity, 'users');

        ({ agent: secretary } = await login({ username: `${PREFIX}_secretary`, password: PASSWORD }));
        await mutation(secretary, 'post', '/api/v1/auth/logout-all').expect(200);
        const logoutAll = await latestLog('LOGOUT_ALL_DEVICES', 'AND entity_id = ?', [ids.secretary]);
        assert.equal(logoutAll.user_id, ids.secretary);
        assert.equal(logoutAll.actor_role, 'SECRETARY');

        ({ agent: secretary } = await login({ username: `${PREFIX}_secretary`, password: PASSWORD }));
        await mutation(secretary, 'post', '/api/v1/auth/change-password')
            .send({
                currentPassword: 'not-the-current',
                newPassword: NEW_PASSWORD,
            })
            .expect(400);
        const failedChange = await latestLog('CHANGE_PASSWORD', 'AND entity_id = ? AND status = ?', [ids.secretary, 'failed']);
        assert.equal(failedChange.user_id, ids.secretary);
        assert.equal(failedChange.actor_role, 'SECRETARY');
        assert.equal(failedChange.status, 'failed');
        assertNoSecrets(failedChange, [PASSWORD, NEW_PASSWORD, 'not-the-current']);
    });

    it('keeps Phase 6 lifecycle action names and couples them to the same transaction', async () => {
        const created = await mutation(admin, 'post', '/api/v1/users')
            .send({ name: 'Phase 8 Created', username: `${PREFIX}_created`, role: 'SECRETARY' })
            .expect(201);
        createdUser = created.body.user;
        issuedSecrets.push(created.body.temporaryPassword);
        const createLog = await latestLog('CREATE_USER', 'AND entity_id = ?', [createdUser.id]);
        assert.equal(createLog.user_id, ids.admin);
        assert.equal(createLog.actor_role, 'ADMIN');
        assert.equal(createLog.action, 'CREATE_USER');

        const reset = await mutation(admin, 'post', `/api/v1/users/${createdUser.id}/reset-password`)
            .send({})
            .expect(200);
        issuedSecrets.push(reset.body.temporaryPassword);
        assert.equal((await latestLog('RESET_USER_PASSWORD', 'AND entity_id = ?', [createdUser.id])).action, 'RESET_USER_PASSWORD');

        await mutation(admin, 'post', `/api/v1/users/${createdUser.id}/revoke-sessions`).send({}).expect(200);
        assert.equal((await latestLog('REVOKE_USER_SESSIONS', 'AND entity_id = ?', [createdUser.id])).action, 'REVOKE_USER_SESSIONS');

        await mutation(admin, 'patch', `/api/v1/users/${retainUserId}/disable`).send({}).expect(200);
        const disableLog = await latestLog('DISABLE_USER', 'AND entity_id = ?', [retainUserId]);
        assert.equal(disableLog.action, 'DISABLE_USER');
        assert.equal(disableLog.user_id, ids.admin);
        assert.equal(disableLog.entity_id, retainUserId);

        await db.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');
        await db.query(
            `CREATE TRIGGER phase8_fail_activity_logs_insert
             BEFORE INSERT ON activity_logs
             FOR EACH ROW
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'phase8 audit fail'`
        );
        try {
            const [[before]] = await db.query('SELECT is_active FROM users WHERE id = ?', [createdUser.id]);
            await mutation(admin, 'patch', `/api/v1/users/${createdUser.id}/disable`).send({}).expect(500);
            const [[after]] = await db.query('SELECT is_active FROM users WHERE id = ?', [createdUser.id]);
            assert.equal(Number(after.is_active), Number(before.is_active));
            assert.equal(Number(after.is_active), 1);
        } finally {
            await db.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');
        }

        for (const action of LIFECYCLE_ACTIONS) {
            assert.equal(action.includes('USER') || action === 'CHANGE_PASSWORD', true);
        }
    });

    it('rolls back a successful password change when the coupled audit insert fails', async () => {
        const [[before]] = await db.query('SELECT password FROM users WHERE id = ?', [ids.secretary]);
        await db.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');
        await db.query(
            `CREATE TRIGGER phase8_fail_activity_logs_insert
             BEFORE INSERT ON activity_logs
             FOR EACH ROW
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'phase8 audit fail'`
        );
        try {
            await mutation(secretary, 'post', '/api/v1/auth/change-password')
                .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
                .expect(500);
            const [[after]] = await db.query('SELECT password FROM users WHERE id = ?', [ids.secretary]);
            assert.equal(after.password, before.password);
        } finally {
            await db.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');
        }
    });

    it('does not reconstruct historical NULL actor_role from the current DB role', async () => {
        const [inserted] = await db.query(
            `INSERT INTO activity_logs (user_id, actor_role, action, entity, entity_id, ip_address, status)
             VALUES (?, NULL, 'PHASE8_LEGACY_NULL_ROLE', 'users', ?, '127.0.0.1', 'success')`,
            [ids.admin, ids.admin]
        );

        const listed = await admin.get('/api/v1/audit?action=PHASE8_LEGACY_NULL_ROLE').expect(200);
        assert.equal(listed.headers['cache-control'], 'no-store');
        const row = listed.body.logs.find((log) => log.id === inserted.insertId);
        assert.ok(row);
        assert.equal(row.actor_id, ids.admin);
        assert.equal(row.actor_role, null);
        assert.notEqual(row.actor_role, 'ADMIN');
        assert.notEqual(row.actor_role, 'admin');
        assertNoSecrets(listed.body, issuedSecrets);
    });

    it('exposes Admin-only audit GET, refuses write verbs, and keeps disabled-user rows', async () => {
        const listed = await admin.get('/api/v1/audit?limit=10').expect(200);
        assert.equal(listed.headers['cache-control'], 'no-store');
        assert.ok(Array.isArray(listed.body.logs));
        assert.ok(listed.body.logs.length >= 1);
        if (listed.body.logs.length >= 2) {
            assert.ok(listed.body.logs[0].id >= listed.body.logs[1].id);
        }
        const keys = Object.keys(listed.body.logs[0]).sort();
        assert.deepEqual(keys, [
            'action', 'actor', 'actor_id', 'actor_role', 'created_at',
            'entity', 'entity_id', 'id', 'ip_address', 'status',
        ]);

        const disableRow = listed.body.logs.find((log) => (
            log.action === 'DISABLE_USER' && log.entity_id === retainUserId
        )) || (await admin.get(`/api/v1/audit?action=DISABLE_USER`).expect(200))
            .body.logs.find((log) => log.entity_id === retainUserId);
        assert.ok(disableRow);
        assert.equal(disableRow.entity_id, retainUserId);

        await secretary.get('/api/v1/audit').expect(403);
        await worker.get('/api/v1/audit').expect(403);
        await admin.post('/api/v1/audit').expect(404);
        await admin.put('/api/v1/audit').expect(404);
        await admin.patch('/api/v1/audit/1').expect(404);
        await admin.delete('/api/v1/audit/1').expect(404);
    });

    it('does not write a successful mutation audit row for forbidden requests', async () => {
        const before = await logCount('WHERE action = ? AND user_id = ?', ['CREATE_PLANTING', ids.worker]);
        await mutation(worker, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_forbidden`))
            .expect(403);
        assert.equal(
            await logCount('WHERE action = ? AND user_id = ?', ['CREATE_PLANTING', ids.worker]),
            before
        );

        const beforeNotes = await logCount('WHERE action = ? AND user_id = ?', ['CREATE_NOTE', ids.worker]);
        await mutation(worker, 'post', '/api/v1/notes')
            .send({ title: 'forbidden', note_date: '2026-09-10' })
            .expect(403);
        assert.equal(
            await logCount('WHERE action = ? AND user_id = ?', ['CREATE_NOTE', ids.worker]),
            beforeNotes
        );
    });

    it('attributes note C/U/D and keeps crop mutation behavior unchanged', async () => {
        const created = await mutation(secretary, 'post', '/api/v1/notes')
            .send({
                title: 'Phase 8 note',
                description: 'audit coverage',
                note_date: '2026-09-10',
                color: 'slate',
            })
            .expect(201);
        const noteId = created.body.data.id;
        const createLog = await latestLog('CREATE_NOTE', 'AND entity_id = ?', [noteId]);
        assert.equal(createLog.user_id, ids.secretary);
        assert.equal(createLog.actor_role, 'SECRETARY');
        assert.equal(createLog.entity, 'notes');

        await mutation(secretary, 'put', `/api/v1/notes/${noteId}`)
            .send({
                title: 'Phase 8 note updated',
                description: 'updated',
                note_date: '2026-09-11',
                color: 'slate',
            })
            .expect(200);
        assert.equal((await latestLog('UPDATE_NOTE', 'AND entity_id = ?', [noteId])).actor_role, 'SECRETARY');

        await mutation(secretary, 'delete', `/api/v1/notes/${noteId}`).expect(200);
        assert.equal((await latestLog('DELETE_NOTE', 'AND entity_id = ?', [noteId])).user_id, ids.secretary);

        const crop = await mutation(secretary, 'post', '/api/v1/plantings')
            .send(plantingBody(`${PREFIX}_crop`))
            .expect(201);
        const planting = await secretary.get(`/api/v1/plantings/${crop.body.plantingId}`).expect(200);
        const plantingRow = planting.body.planting || planting.body.data || planting.body;
        const fieldName = plantingRow.field_name || plantingRow.planting?.field_name;
        assert.equal(fieldName, `${PREFIX}_crop`);
        const createPlanting = await latestLog('CREATE_PLANTING', 'AND entity_id = ?', [crop.body.plantingId]);
        assert.equal(createPlanting.actor_role, 'SECRETARY');

        const harvest = await mutation(secretary, 'post', '/api/v1/harvests')
            .send({
                planting_id: harvestPlantingId,
                harvest_date: '2026-09-01',
                yield_kg: 250,
                quality_grade: 'A',
                remarks: 'Phase 8 harvest',
                financial_value: 5000,
            })
            .expect(201);
        assert.equal(
            (await latestLog('CREATE_HARVEST', 'AND entity_id = ?', [harvest.body.harvestId])).actor_role,
            'SECRETARY'
        );

        await admin.get(`/api/v1/plantings/export/csv?plantingIds=${harvestPlantingId}`).expect(200);
        const exportLog = await latestLog('EXPORT_PLANTINGS_CSV');
        assert.equal(exportLog.user_id, ids.admin);
        assert.equal(exportLog.actor_role, 'ADMIN');
        assert.equal(exportLog.entity, 'plantings');
    });

    it('audits Admin-triggered backups at the request layer and never attributes cron jobs', async () => {
        const backupUtil = fs.readFileSync(path.join(__dirname, '..', 'utils', 'backup.js'), 'utf8');
        const backupRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'backupRoutes.js'), 'utf8');
        assert.equal(/logActivity|fromRequest/.test(backupUtil), false);
        assert.match(backupRoutes, /RUN_BACKUP/);
        assert.match(backupRoutes, /DOWNLOAD_BACKUP/);
        assert.match(backupRoutes, /fromRequest/);
        assert.match(backupUtil, /cron\.schedule/);

        await mutation(admin, 'post', '/api/v1/backups/run').expect(503);
        assert.equal(await logCount('WHERE action = ?', ['RUN_BACKUP']), 0);
    });
});
