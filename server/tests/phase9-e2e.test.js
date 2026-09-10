process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://127.0.0.1:5179';
process.env.LOGIN_CHALLENGE_SECRET = process.env.LOGIN_CHALLENGE_SECRET
    || 'phase9-test-challenge-secret-32bytes-min';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 9 tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `phase9_${process.pid}_`;
const STAMP = Date.now();
const TEST_ADMIN = {
    username: process.env.TEST_ADMIN_USERNAME || 'superadmin',
    password: process.env.TEST_ADMIN_PASSWORD || 'admin1234',
};
const FINAL_PASSWORD = 'Phase9-Final!42';
const SECOND_PASSWORD = 'Phase9-Second!84';
const COOKIE_NAME = 'agritrack_session';
const TRANSPLANTED_TEMPLATE_COUNT = 9;

const mutation = (agent, method, urlPath) => agent[method](urlPath).set('Origin', ORIGIN);

const plantingBody = (fieldName, extras = {}) => ({
    field_name: fieldName,
    variety_class: 'Irrigated / Lowland Varieties',
    variety: 'NSIC Rc110',
    planting_date: '2026-01-10',
    cropping_season: 'DRY_SEASON',
    establishment_method: 'TRANSPLANTED',
    field_condition: 'IRRIGATED',
    lifecycle_state: 'ACTIVE',
    status: 'active',
    ...extras,
});

const harvestBody = (plantingId, extras = {}) => ({
    planting_id: plantingId,
    harvest_date: '2026-09-01',
    yield_kg: 250,
    quality_grade: 'A',
    remarks: `${PREFIX}harvest`,
    financial_value: 5000,
    ...extras,
});

const login = async (credentials, status = 200) => {
    const agent = request.agent(app);
    const response = await agent.post('/api/v1/auth/login').send(credentials).expect(status);
    return { agent, response };
};

const userRow = async (id) => {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
};

const activeSessionCount = async (id) => {
    const [[row]] = await db.query(
        'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND is_active = 1',
        [id]
    );
    return Number(row.count);
};

const logCount = async (whereSql = '', params = []) => {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM activity_logs ${whereSql}`, params);
    return Number(row.count);
};

const latestLog = async (action, extraSql = '', params = []) => {
    const [rows] = await db.query(
        `SELECT * FROM activity_logs WHERE action = ? ${extraSql} ORDER BY id DESC LIMIT 1`,
        [action, ...params]
    );
    return rows[0] || null;
};

const snapshotRow = async (table, id) => {
    const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [id]);
    return rows[0] || null;
};

const createSubordinate = async (adminAgent, role, suffix) => {
    const username = `${PREFIX}${STAMP}_${suffix}`;
    const response = await mutation(adminAgent, 'post', '/api/v1/users')
        .send({ name: `Phase 9 ${suffix}`, username, role })
        .expect(201);
    return {
        id: response.body.user.id,
        username,
        role,
        temporaryPassword: response.body.temporaryPassword,
    };
};

const changePassword = async (agent, currentPassword, newPassword) => {
    await mutation(agent, 'post', '/api/v1/auth/change-password')
        .send({ currentPassword, newPassword })
        .expect(200);
};

describe('Phase 9 full E2E, regression, and security validation', () => {
    let admin;
    let adminId;
    const createdUserIds = [];
    const createdPlantingIds = [];
    const createdNoteIds = [];
    let lifecycle;
    let crop;

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        await db.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');
        await db.query('DROP TRIGGER IF EXISTS phase9_fail_users_insert');
        await db.query('DROP TRIGGER IF EXISTS phase9_fail_harvests_insert');

        const [indexes] = await db.query(
            `SELECT INDEX_NAME
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'activity_logs'
               AND INDEX_NAME IN ('idx_activity_logs_created_id', 'idx_activity_logs_action_created')
             GROUP BY INDEX_NAME`
        );
        assert.equal(indexes.length, 2, 'Phase 8 TEST indexes must exist');

        const loggedIn = await login(TEST_ADMIN);
        admin = loggedIn.agent;
        const me = await admin.get('/api/v1/auth/me').expect(200);
        adminId = me.body.id;
        assert.equal(me.body.must_change_password, false);
    });

    after(async () => {
        try {
            await db.query('DROP TRIGGER IF EXISTS phase9_fail_users_insert');
            await db.query('DROP TRIGGER IF EXISTS phase9_fail_harvests_insert');
            const [users] = await db.query(
                'SELECT id FROM users WHERE email LIKE ? OR username LIKE ?',
                [`${PREFIX}%`, `${PREFIX}%`]
            );
            const userIds = [...new Set([...createdUserIds, ...users.map((row) => row.id)])];
            const [plantings] = await db.query(
                'SELECT id FROM plantings WHERE field_name LIKE ?',
                [`${PREFIX}%`]
            );
            const plantingIds = [...new Set([...createdPlantingIds, ...plantings.map((row) => row.id)])];

            let activityIds = [];
            let harvestIds = [];
            if (plantingIds.length) {
                const plantingPlaceholders = plantingIds.map(() => '?').join(',');
                const [activities] = await db.query(
                    `SELECT id FROM activities WHERE planting_id IN (${plantingPlaceholders})`,
                    plantingIds
                );
                activityIds = activities.map((row) => row.id);
                const [harvests] = await db.query(
                    `SELECT id FROM harvests WHERE planting_id IN (${plantingPlaceholders})`,
                    plantingIds
                );
                harvestIds = harvests.map((row) => row.id);
                if (activityIds.length) {
                    const activityPlaceholders = activityIds.map(() => '?').join(',');
                    await db.query(
                        `DELETE FROM notifications WHERE related_id IN (${activityPlaceholders})`,
                        activityIds
                    );
                    await db.query(
                        `DELETE FROM activities WHERE id IN (${activityPlaceholders})`,
                        activityIds
                    );
                }
                if (harvestIds.length) {
                    const harvestPlaceholders = harvestIds.map(() => '?').join(',');
                    await db.query(
                        `DELETE FROM harvests WHERE id IN (${harvestPlaceholders})`,
                        harvestIds
                    );
                }
                await db.query(
                    `DELETE FROM plantings WHERE id IN (${plantingPlaceholders})`,
                    plantingIds
                );
            }

            if (createdNoteIds.length) {
                const notePlaceholders = createdNoteIds.map(() => '?').join(',');
                await db.query(`DELETE FROM notes WHERE id IN (${notePlaceholders})`, createdNoteIds);
            }

            if (userIds.length) {
                const userPlaceholders = userIds.map(() => '?').join(',');
                await db.query(`DELETE FROM sessions WHERE user_id IN (${userPlaceholders})`, userIds);
                await db.query(`DELETE FROM notes WHERE user_id IN (${userPlaceholders})`, userIds);
                await db.query(`DELETE FROM notifications WHERE user_id IN (${userPlaceholders})`, userIds);
                await db.query('DELETE FROM login_attempts WHERE email LIKE ? OR username LIKE ?', [
                    `${PREFIX}%`,
                    `${PREFIX}%`,
                ]);

                const auditClauses = [`user_id IN (${userPlaceholders})`, `(entity = 'users' AND entity_id IN (${userPlaceholders}))`];
                const auditParams = [...userIds, ...userIds];
                if (plantingIds.length) {
                    auditClauses.push(`(entity = 'plantings' AND entity_id IN (${plantingIds.map(() => '?').join(',')}))`);
                    auditParams.push(...plantingIds);
                }
                if (activityIds.length) {
                    auditClauses.push(`(entity = 'activities' AND entity_id IN (${activityIds.map(() => '?').join(',')}))`);
                    auditParams.push(...activityIds);
                }
                if (harvestIds.length) {
                    auditClauses.push(`(entity = 'harvests' AND entity_id IN (${harvestIds.map(() => '?').join(',')}))`);
                    auditParams.push(...harvestIds);
                }
                if (createdNoteIds.length) {
                    auditClauses.push(`(entity = 'notes' AND entity_id IN (${createdNoteIds.map(() => '?').join(',')}))`);
                    auditParams.push(...createdNoteIds);
                }
                await db.query(
                    `DELETE FROM activity_logs WHERE ${auditClauses.join(' OR ')}`,
                    auditParams
                );
                await db.query(`DELETE FROM users WHERE id IN (${userPlaceholders})`, userIds);
            } else {
                await db.query('DELETE FROM login_attempts WHERE email LIKE ? OR username LIKE ?', [
                    `${PREFIX}%`,
                    `${PREFIX}%`,
                ]);
            }
        } finally {
            await db.end();
        }
    });

    it('pins the TEST database and refuses any other name', async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');
        assert.equal(process.env.DB_NAME, 'crop_management_rearch_test');
        assert.notEqual(process.env.DB_NAME, 'crop_management');
    });

    it('completes the full subordinate lifecycle in one chain', async () => {
        lifecycle = await createSubordinate(admin, 'SECRETARY', 'life');
        createdUserIds.push(lifecycle.id);
        assert.equal((await userRow(lifecycle.id)).must_change_password, 1);

        const first = await login({
            username: lifecycle.username,
            password: lifecycle.temporaryPassword,
        });
        const blocked = await first.agent.get('/api/v1/plantings').expect(403);
        assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
        await changePassword(first.agent, lifecycle.temporaryPassword, FINAL_PASSWORD);
        await first.agent.get('/api/v1/auth/me').expect(200);
        await first.agent.get('/api/v1/plantings').expect(200);
        await login({ username: lifecycle.username, password: lifecycle.temporaryPassword }, 401);
        const activeNormal = await login({ username: lifecycle.username, password: FINAL_PASSWORD });
        await activeNormal.agent.get('/api/v1/plantings').expect(200);

        const reset = await mutation(admin, 'post', `/api/v1/users/${lifecycle.id}/reset-password`)
            .send({})
            .expect(200);
        const resetPasswordValue = reset.body.temporaryPassword;
        await login({ username: lifecycle.username, password: FINAL_PASSWORD }, 401);
        await activeNormal.agent.get('/api/v1/auth/me').expect(401);
        const forced = await login({ username: lifecycle.username, password: resetPasswordValue });
        const forcedDenied = await forced.agent.get('/api/v1/plantings').expect(403);
        assert.equal(forcedDenied.body.code, 'PASSWORD_CHANGE_REQUIRED');
        await changePassword(forced.agent, resetPasswordValue, SECOND_PASSWORD);
        const activeAgain = await login({ username: lifecycle.username, password: SECOND_PASSWORD });
        await activeAgain.agent.get('/api/v1/plantings').expect(200);

        await mutation(admin, 'post', `/api/v1/users/${lifecycle.id}/revoke-sessions`).send({}).expect(200);
        await activeAgain.agent.get('/api/v1/auth/me').expect(401);
        assert.equal(await activeSessionCount(lifecycle.id), 0);
        const afterRevoke = await login({ username: lifecycle.username, password: SECOND_PASSWORD });
        await afterRevoke.agent.get('/api/v1/auth/me').expect(200);

        await mutation(admin, 'patch', `/api/v1/users/${lifecycle.id}/disable`).send({}).expect(200);
        await afterRevoke.agent.get('/api/v1/auth/me').expect(401);
        await login({ username: lifecycle.username, password: SECOND_PASSWORD }, 401);
        await mutation(admin, 'post', `/api/v1/users/${lifecycle.id}/reset-password`).send({}).expect(409);
        await mutation(admin, 'delete', `/api/v1/users/${lifecycle.id}`).expect(404);
        await mutation(admin, 'post', '/api/v1/users')
            .send({ name: 'reuse', username: lifecycle.username, role: 'SECRETARY' })
            .expect(409);

        const reactivated = await mutation(admin, 'patch', `/api/v1/users/${lifecycle.id}/reactivate`)
            .send({})
            .expect(200);
        const freshTemp = reactivated.body.temporaryPassword;
        await login({ username: lifecycle.username, password: SECOND_PASSWORD }, 401);
        const forcedAgain = await login({ username: lifecycle.username, password: freshTemp });
        assert.equal((await forcedAgain.agent.get('/api/v1/plantings').expect(403)).body.code, 'PASSWORD_CHANGE_REQUIRED');
        await changePassword(forcedAgain.agent, freshTemp, FINAL_PASSWORD);
        const restored = await login({ username: lifecycle.username, password: FINAL_PASSWORD });
        await restored.agent.get('/api/v1/auth/me').expect(200);
        lifecycle.agent = restored.agent;
        lifecycle.password = FINAL_PASSWORD;

        await mutation(admin, 'patch', `/api/v1/users/${adminId}/disable`).send({}).expect(404);
        await admin.get('/api/v1/auth/me').expect(200);
        assert.ok(await userRow(lifecycle.id));
        assert.ok(await latestLog('CREATE_USER', 'AND entity_id = ?', [lifecycle.id]));
    });

    it('enforces current crop runtime invariants', async () => {
        const field = `${PREFIX}${STAMP}_field`;
        const created = await mutation(admin, 'post', '/api/v1/plantings')
            .send(plantingBody(field))
            .expect(201);
        const plantingId = created.body.plantingId;
        createdPlantingIds.push(plantingId);

        const [[templateCount]] = await db.query(
            `SELECT COUNT(*) AS count
             FROM activities
             WHERE planting_id = ? AND activity_source = 'SYSTEM_SCHEDULED' AND deleted_at IS NULL`,
            [plantingId]
        );
        assert.equal(Number(templateCount.count), TRANSPLANTED_TEMPLATE_COUNT);

        await mutation(admin, 'post', '/api/v1/plantings')
            .send(plantingBody(field))
            .expect(409);
        await mutation(admin, 'post', '/api/v1/plantings')
            .send(plantingBody(field, { planting_date: '2026-02-01' }))
            .expect(409);

        const earlyField = `${PREFIX}${STAMP}_early`;
        const early = await mutation(admin, 'post', '/api/v1/plantings')
            .send(plantingBody(earlyField, { planting_date: '2026-08-01' }))
            .expect(201);
        createdPlantingIds.push(early.body.plantingId);
        await mutation(admin, 'post', '/api/v1/harvests')
            .send(harvestBody(early.body.plantingId, { harvest_date: '2026-08-20' }))
            .expect(400);

        const manual = await mutation(admin, 'post', '/api/v1/activities')
            .send({
                planting_id: plantingId,
                activity_type: 'weeding',
                planned_date: '2026-08-02',
                notes: `${PREFIX}manual`,
            })
            .expect(201);
        const activityId = manual.body.activityId;
        await mutation(admin, 'put', `/api/v1/activities/${activityId}`)
            .send({ status: 'COMPLETED', actual_date: '2026-08-03' })
            .expect(200);
        await mutation(admin, 'put', `/api/v1/activities/${activityId}`)
            .send({ status: 'SKIPPED' })
            .expect(400);

        const skipTarget = await mutation(admin, 'post', '/api/v1/activities')
            .send({
                planting_id: plantingId,
                activity_type: 'pest_control',
                planned_date: '2026-08-04',
                notes: `${PREFIX}skip`,
            })
            .expect(201);
        await mutation(admin, 'put', `/api/v1/activities/${skipTarget.body.activityId}`)
            .send({ status: 'SKIPPED' })
            .expect(200);

        const harvested = await mutation(admin, 'post', '/api/v1/harvests')
            .send(harvestBody(plantingId))
            .expect(201);
        const planting = await snapshotRow('plantings', plantingId);
        assert.equal(planting.status, 'completed');
        assert.equal(planting.lifecycle_state, 'HARVESTED');
        const [[harvesting]] = await db.query(
            `SELECT status FROM activities
             WHERE planting_id = ? AND activity_type = 'harvesting' AND deleted_at IS NULL`,
            [plantingId]
        );
        assert.equal(harvesting.status, 'COMPLETED');
        const [[pendingLeft]] = await db.query(
            `SELECT COUNT(*) AS count FROM activities
             WHERE planting_id = ? AND status = 'PENDING' AND actual_date IS NULL AND deleted_at IS NULL`,
            [plantingId]
        );
        assert.equal(Number(pendingLeft.count), 0);
        await mutation(admin, 'post', '/api/v1/harvests')
            .send(harvestBody(plantingId))
            .expect(409);

        crop = { plantingId, harvestedId: harvested.body.harvestId, completedId: plantingId };
    });

    it('proves leftover BOLA, spoof headers, 401 vs 403, and no false audit success', async () => {
        const worker = await createSubordinate(admin, 'FARM_WORKER', 'bola');
        createdUserIds.push(worker.id);
        const workerLogin = await login({
            username: worker.username,
            password: worker.temporaryPassword,
        });
        await changePassword(workerLogin.agent, worker.temporaryPassword, FINAL_PASSWORD);
        const workerAgent = (await login({ username: worker.username, password: FINAL_PASSWORD })).agent;

        await workerAgent.get('/api/v1/users').expect(403);
        await lifecycle.agent.get('/api/v1/users').expect(403);
        await workerAgent.get('/api/v1/audit').expect(403);
        await lifecycle.agent.get('/api/v1/audit').expect(403);
        await workerAgent.get(`/api/v1/harvests/${crop.harvestedId}`).expect(403);
        await workerAgent.get(`/api/v1/plantings/${crop.completedId}`).expect(404);

        const list = await workerAgent.get('/api/v1/plantings?status=completed').expect(200);
        assert.ok(list.body.data.every((row) => row.status === 'active'));
        assert.ok(list.body.data.every((row) => !Object.prototype.hasOwnProperty.call(row, 'user_id')));

        const beforePlantings = await snapshotRow('plantings', crop.plantingId);
        const beforeCreateLogs = await logCount('WHERE action = ? AND user_id = ?', ['CREATE_PLANTING', worker.id]);
        const spoof = await mutation(workerAgent, 'post', '/api/v1/plantings?role=ADMIN')
            .set('X-Role', 'ADMIN')
            .send({ ...plantingBody(`${PREFIX}${STAMP}_spoof`), role: 'ADMIN', user_id: adminId });
        assert.equal(spoof.status, 403);
        assert.deepEqual(await snapshotRow('plantings', crop.plantingId), beforePlantings);
        assert.equal(
            await logCount('WHERE action = ? AND user_id = ?', ['CREATE_PLANTING', worker.id]),
            beforeCreateLogs
        );

        const unauth = await request(app).get('/api/v1/plantings').expect(401);
        assert.ok(unauth.body.message);

        const progress = await mutation(admin, 'post', '/api/v1/activities')
            .send({
                planting_id: createdPlantingIds[1],
                activity_type: 'weeding',
                planned_date: '2026-08-10',
                notes: `${PREFIX}progress`,
            })
            .expect(201);
        await mutation(workerAgent, 'patch', `/api/v1/activities/${progress.body.activityId}/progress`)
            .send({ status: 'SKIPPED', actual_date: '2026-08-11' })
            .expect(400);
        await mutation(workerAgent, 'patch', `/api/v1/activities/${progress.body.activityId}/progress`)
            .send({ status: 'COMPLETED', actual_date: '2026-08-11', notes: 'nope' })
            .expect(400);
        await mutation(workerAgent, 'patch', `/api/v1/activities/${progress.body.activityId}/progress`)
            .send({ status: 'COMPLETED', actual_date: '2026-08-11' })
            .expect(200);

        await workerAgent.post('/api/v1/notes')
            .set('Origin', ORIGIN)
            .send({ title: `${PREFIX}note`, note_date: '2026-09-11' })
            .expect(403);
        const ownNotes = await workerAgent.get('/api/v1/notes').expect(200);
        assert.equal(ownNotes.body.count, 0);

        const weather = await workerAgent.get('/api/v1/weather');
        assert.ok([200, 400].includes(weather.status));
        await workerAgent.get('/api/v1/backups').expect(403);
        await admin.get('/api/v1/backups').expect(503);
    });

    it('records actor/target audit for the chain and known failed login without false success', async () => {
        const createUser = await latestLog('CREATE_USER', 'AND entity_id = ?', [lifecycle.id]);
        assert.equal(createUser.user_id, adminId);
        assert.equal(createUser.actor_role, 'ADMIN');
        assert.equal(createUser.entity, 'users');
        assert.equal(createUser.status, 'success');

        await login({ username: lifecycle.username, password: 'Wrong-Pass!99' }, 401);
        const failed = await latestLog('LOGIN_FAILED', 'AND entity_id = ?', [lifecycle.id]);
        assert.equal(failed.user_id, null);
        assert.equal(failed.actor_role, null);
        assert.equal(failed.entity, 'users');
        assert.equal(failed.status, 'failed');

        const harvestLog = await latestLog('CREATE_HARVEST', 'AND entity_id = ?', [crop.harvestedId]);
        assert.equal(harvestLog.user_id, adminId);
        assert.equal(harvestLog.entity, 'harvests');
        assert.equal(harvestLog.status, 'success');

        const note = await mutation(lifecycle.agent, 'post', '/api/v1/notes')
            .send({ title: `${PREFIX}sec-note`, description: 'phase9', note_date: '2026-09-11' })
            .expect(201);
        createdNoteIds.push(note.body.data.id);
        const noteLog = await latestLog('CREATE_NOTE', 'AND entity_id = ?', [note.body.data.id]);
        assert.equal(noteLog.user_id, lifecycle.id);
        assert.equal(noteLog.actor_role, 'SECRETARY');
    });

    it('handles controlled concurrency without overlapping Phase 7', async () => {
        const rounds = 8;
        for (let round = 0; round < rounds; round += 1) {
            const username = `${PREFIX}${STAMP}_dup${round}`;
            const [first, second] = await Promise.all([
                mutation(admin, 'post', '/api/v1/users').send({
                    name: 'Phase 9 Dup A',
                    username,
                    role: 'SECRETARY',
                }),
                mutation(admin, 'post', '/api/v1/users').send({
                    name: 'Phase 9 Dup B',
                    username,
                    role: 'SECRETARY',
                }),
            ]);
            assert.deepEqual([first.status, second.status].sort(), [201, 409], `username round ${round}`);
            const created = first.status === 201 ? first : second;
            createdUserIds.push(created.body.user.id);
            const [dupRows] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
            assert.equal(dupRows.length, 1, `username round ${round} row count`);
        }

        for (let round = 0; round < rounds; round += 1) {
            const concField = `${PREFIX}${STAMP}_conc${round}`;
            const concPlanting = await mutation(admin, 'post', '/api/v1/plantings')
                .send(plantingBody(concField))
                .expect(201);
            createdPlantingIds.push(concPlanting.body.plantingId);
            const [harvestA, harvestB] = await Promise.all([
                mutation(admin, 'post', '/api/v1/harvests').send(harvestBody(concPlanting.body.plantingId)),
                mutation(admin, 'post', '/api/v1/harvests').send(harvestBody(concPlanting.body.plantingId)),
            ]);
            assert.deepEqual(
                [harvestA.status, harvestB.status].sort(),
                [201, 409],
                `harvest round ${round} statuses ${harvestA.status},${harvestB.status}`
            );
            const [[harvestCount]] = await db.query(
                'SELECT COUNT(*) AS count FROM harvests WHERE planting_id = ? AND deleted_at IS NULL',
                [concPlanting.body.plantingId]
            );
            assert.equal(Number(harvestCount.count), 1, `harvest round ${round} row count`);
            const closed = await snapshotRow('plantings', concPlanting.body.plantingId);
            assert.equal(closed.status, 'completed');
            assert.equal(closed.lifecycle_state, 'HARVESTED');
        }

        const raceUser = await createSubordinate(admin, 'FARM_WORKER', 'race');
        createdUserIds.push(raceUser.id);
        const raceLogin = await login({
            username: raceUser.username,
            password: raceUser.temporaryPassword,
        });
        await changePassword(raceLogin.agent, raceUser.temporaryPassword, FINAL_PASSWORD);
        const armed = await login({ username: raceUser.username, password: FINAL_PASSWORD });
        await mutation(admin, 'post', `/api/v1/users/${raceUser.id}/reset-password`).send({}).expect(200);
        await login({ username: raceUser.username, password: FINAL_PASSWORD }, 401);
        await armed.agent.get('/api/v1/auth/me').expect(401);

        const disableTarget = await createSubordinate(admin, 'SECRETARY', 'dis');
        createdUserIds.push(disableTarget.id);
        const disableLogin = await login({
            username: disableTarget.username,
            password: disableTarget.temporaryPassword,
        });
        await changePassword(disableLogin.agent, disableTarget.temporaryPassword, FINAL_PASSWORD);
        const live = await login({ username: disableTarget.username, password: FINAL_PASSWORD });
        await db.query('UPDATE users SET is_active = 0, status = ? WHERE id = ?', ['INACTIVE', disableTarget.id]);
        const disabledMe = await live.agent.get('/api/v1/auth/me').expect(403);
        assert.equal(disabledMe.body.message, 'Your account has been disabled.');
        await db.query(
            'UPDATE users SET is_active = 1, status = ? WHERE id = ?',
            ['ACTIVE', disableTarget.id]
        );
        await mutation(admin, 'patch', `/api/v1/users/${disableTarget.id}/disable`).send({}).expect(200);
        await live.agent.get('/api/v1/auth/me').expect(401);
        await login({ username: disableTarget.username, password: FINAL_PASSWORD }, 401);
    });

    it('does not convert unexpected database failures into 409 conflicts', async () => {
        const failUsername = `${PREFIX}${STAMP}_boom`;
        await db.query('DROP TRIGGER IF EXISTS phase9_fail_users_insert');
        await db.query(
            `CREATE TRIGGER phase9_fail_users_insert
             BEFORE INSERT ON users
             FOR EACH ROW
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'phase9 injected user fail'`
        );
        try {
            const failedUser = await mutation(admin, 'post', '/api/v1/users').send({
                name: 'Phase 9 Injected Fail',
                username: failUsername,
                role: 'SECRETARY',
            });
            assert.equal(failedUser.status, 500);
            assert.notEqual(failedUser.status, 409);
            const [boomUsers] = await db.query('SELECT id FROM users WHERE username = ?', [failUsername]);
            assert.equal(boomUsers.length, 0);
        } finally {
            await db.query('DROP TRIGGER IF EXISTS phase9_fail_users_insert');
        }

        const failField = `${PREFIX}${STAMP}_boom_field`;
        const failPlanting = await mutation(admin, 'post', '/api/v1/plantings')
            .send(plantingBody(failField))
            .expect(201);
        createdPlantingIds.push(failPlanting.body.plantingId);
        await db.query('DROP TRIGGER IF EXISTS phase9_fail_harvests_insert');
        await db.query(
            `CREATE TRIGGER phase9_fail_harvests_insert
             BEFORE INSERT ON harvests
             FOR EACH ROW
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'phase9 injected harvest fail'`
        );
        try {
            const failedHarvest = await mutation(admin, 'post', '/api/v1/harvests')
                .send(harvestBody(failPlanting.body.plantingId));
            assert.equal(failedHarvest.status, 500);
            assert.notEqual(failedHarvest.status, 409);
            const [[harvestCount]] = await db.query(
                'SELECT COUNT(*) AS count FROM harvests WHERE planting_id = ?',
                [failPlanting.body.plantingId]
            );
            assert.equal(Number(harvestCount.count), 0);
            const planting = await snapshotRow('plantings', failPlanting.body.plantingId);
            assert.equal(planting.status, 'active');
        } finally {
            await db.query('DROP TRIGGER IF EXISTS phase9_fail_harvests_insert');
        }
    });

    it('exposes offline challenge without enabling the Phase 7 limiter in this file', async () => {
        assert.notEqual(process.env.PHASE7_ABUSE_MIDDLEWARE, '1');
        const response = await request(app)
            .post('/api/v1/auth/challenge')
            .send({ username: `${PREFIX}challenge` })
            .expect(200);
        assert.equal(typeof response.body.challengeId, 'string');
        assert.match(String(response.body.prompt), /What is \d+/);
        await db.query('DELETE FROM login_challenges WHERE id = ?', [response.body.challengeId]);
    });
});
