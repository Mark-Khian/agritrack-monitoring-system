process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 6 tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `phase6_${Date.now()}_${process.pid}`;
const ADMIN = { username: 'superadmin', password: 'admin1234' };
const FINAL_PASSWORD = ' Phase6-Final!42 ';
const SECOND_PASSWORD = 'Phase6-Second!84';
const COOKIE_NAME = 'agritrack_session';
const DOMAIN_TABLES = ['plantings', 'activities', 'harvests', 'notes', 'notifications'];

const mutation = (agent, method, path) => agent[method](path).set('Origin', ORIGIN);
const cookieValue = (response) => {
    const line = response.headers['set-cookie']?.find((item) => item.startsWith(`${COOKIE_NAME}=`));
    assert.ok(line, 'login did not issue the session cookie');
    return line.split(';', 1)[0].slice(COOKIE_NAME.length + 1);
};
const login = async (credentials, status = 200) => {
    const agent = request.agent(app);
    const response = await agent.post('/api/v1/auth/login').send(credentials).expect(status);
    return { agent, response };
};
const userRow = async (id) => {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
};
const sessionRows = async (id) => {
    const [rows] = await db.query(
        'SELECT id, token_hash, is_active, revoked_at FROM sessions WHERE user_id = ? ORDER BY id',
        [id]
    );
    return rows;
};
const activeSessionCount = async (id) => {
    const [[row]] = await db.query(
        'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND is_active = 1',
        [id]
    );
    return Number(row.count);
};
const accountCount = async () => {
    const [[row]] = await db.query(
        'SELECT COUNT(*) AS count FROM users WHERE email LIKE ? OR username LIKE ?',
        [`${PREFIX}%`, `${PREFIX}%`]
    );
    return Number(row.count);
};
const domainCounts = async () => {
    const result = {};
    for (const table of DOMAIN_TABLES) {
        const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
        result[table] = Number(row.count);
    }
    return result;
};
const assertNoSecretKeys = (value) => {
    const forbidden = /^(password|password_hash|temporaryPassword|temporary_password|token|refreshToken)$/;
    const visit = (item) => {
        if (!item || typeof item !== 'object') return;
        for (const [key, child] of Object.entries(item)) {
            assert.equal(forbidden.test(key), false, `response exposed secret field ${key}`);
            visit(child);
        }
    };
    visit(value);
};
const expectUnchanged = async (id, action) => {
    const beforeRow = await userRow(id);
    const beforeSessions = await sessionRows(id);
    await action();
    assert.deepEqual(await userRow(id), beforeRow);
    assert.deepEqual(await sessionRows(id), beforeSessions);
};

describe('Phase 6 account administration and forced password change', () => {
    let admin;
    let adminId;
    let secretary;
    let worker;
    let fakeRole;
    let initialDomainCounts;
    const issuedSecrets = [];

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');
        initialDomainCounts = await domainCounts();

        const loggedIn = await login(ADMIN);
        admin = loggedIn.agent;
        const me = await admin.get('/api/v1/auth/me').expect(200);
        adminId = me.body.id;
    });

    after(async () => {
        const [users] = await db.query(
            'SELECT id FROM users WHERE email LIKE ? OR username LIKE ?',
            [`${PREFIX}%`, `${PREFIX}%`]
        );
        const ids = users.map((row) => row.id);
        if (ids.length) {
            const placeholders = ids.map(() => '?').join(',');
            await db.query(`DELETE FROM sessions WHERE user_id IN (${placeholders})`, ids);
            await db.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, ids);
            await db.query(`DELETE FROM notes WHERE user_id IN (${placeholders})`, ids);
            await db.query(
                `DELETE FROM activity_logs
                 WHERE user_id IN (${placeholders}) OR (entity = 'users' AND entity_id IN (${placeholders}))`,
                [...ids, ...ids]
            );
            await db.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
        }
        await db.query('DELETE FROM login_attempts WHERE email LIKE ?', [`${PREFIX}%`]);
        await db.end();
    });

    it('creates Secretary and Worker with exact dual writes and one-time secrets', async () => {
        const fixtures = [
            { name: 'Phase 6 Secretary', username: `${PREFIX}_secretary`, role: 'SECRETARY' },
            { name: 'Phase 6 Worker', username: `${PREFIX}_worker`, role: 'FARM_WORKER' },
        ];

        for (const fixture of fixtures) {
            const response = await mutation(admin, 'post', '/api/v1/users')
                .send(fixture)
                .expect(201);
            assert.match(response.headers['cache-control'] || '', /no-store/i);
            assert.match(response.headers.pragma || '', /no-cache/i);
            assert.equal(typeof response.body.temporaryPassword, 'string');
            issuedSecrets.push(response.body.temporaryPassword);

            const row = await userRow(response.body.user.id);
            assert.equal(row.name, fixture.name);
            assert.equal(row.full_name, fixture.name);
            assert.equal(row.email, fixture.username);
            assert.equal(row.username, fixture.username);
            assert.equal(row.password, row.password_hash);
            assert.equal(row.is_active, 1);
            assert.equal(row.status, 'ACTIVE');
            assert.equal(row.created_by, adminId);
            assert.equal(row.must_change_password, 1);
            assert.equal(bcrypt.getRounds(row.password), BCRYPT_COST);
            assert.equal(await bcrypt.compare(response.body.temporaryPassword, row.password), true);
            assert.notEqual(row.password, response.body.temporaryPassword);

            const state = { id: row.id, ...fixture, temporaryPassword: response.body.temporaryPassword };
            if (fixture.role === 'SECRETARY') secretary = state;
            else worker = state;
        }
    });

    it('rejects duplicate, ADMIN, fake role, and field injection without inserts', async () => {
        const before = await accountCount();
        const attacks = [
            { name: 'Duplicate', username: secretary.username, role: 'SECRETARY', status: 409 },
            { name: 'Admin', username: `${PREFIX}_admin`, role: 'ADMIN', status: 400 },
            { name: 'Fake', username: `${PREFIX}_fake`, role: 'SUPERVISOR', status: 400 },
            { name: 'Injected', username: `${PREFIX}_inject_role`, role: 'SECRETARY', user_id: adminId, status: 400 },
            { name: 'Injected', username: `${PREFIX}_inject_password`, role: 'FARM_WORKER', password: 'chosen', status: 400 },
            { name: 'Injected', username: `${PREFIX}_inject_active`, role: 'FARM_WORKER', is_active: false, status: 400 },
            { name: 'Injected', username: `${PREFIX}_inject_privilege`, role: 'FARM_WORKER', created_by: adminId, status: 400 },
        ];
        for (const { status, ...body } of attacks) {
            await mutation(admin, 'post', '/api/v1/users')
                .set('X-Role', 'ADMIN')
                .send(body)
                .expect(status);
            assert.equal(await accountCount(), before);
        }
    });

    it('allows forced /me, denies ordinary routes with code, and retains the session', async () => {
        const first = await login({
            username: secretary.username,
            password: secretary.temporaryPassword,
        });
        secretary.firstAgent = first.agent;
        secretary.firstCookie = cookieValue(first.response);

        const me = await first.agent.get('/api/v1/auth/me').expect(200);
        assert.equal(me.body.must_change_password, true);
        const forbiddenGets = [
            '/api/v1/dashboard/lifecycle-monitoring',
            '/api/v1/plantings',
            '/api/v1/activities',
            '/api/v1/notes',
            '/api/v1/weather',
            '/api/v1/auth/sessions',
            '/api/v1/users',
        ];
        for (const path of forbiddenGets) {
            const denied = await first.agent.get(path).expect(403);
            assert.equal(denied.body.code, 'PASSWORD_CHANGE_REQUIRED', path);
            await first.agent.get('/api/v1/auth/me').expect(200);
        }
        const logoutAllDenied = await mutation(first.agent, 'post', '/api/v1/auth/logout-all')
            .send({})
            .expect(403);
        assert.equal(logoutAllDenied.body.code, 'PASSWORD_CHANGE_REQUIRED');
        await first.agent.get('/api/v1/auth/me').expect(200);

        const logoutProbe = await login({
            username: secretary.username,
            password: secretary.temporaryPassword,
        });
        await mutation(logoutProbe.agent, 'post', '/api/v1/auth/logout')
            .send({})
            .expect(200);
        assert.ok(await activeSessionCount(secretary.id) >= 1);
    });

    it('enforces strong policy, UTF-8 byte limit, and never trims passwords', async () => {
        const invalid = [
            'short',
            'alllowercase!42',
            'ALLUPPERCASE!42',
            'NoNumberHere!',
            'NoSymbolHere42',
            `Aa1!${'é'.repeat(35)}`,
        ];
        for (const newPassword of invalid) {
            await mutation(secretary.firstAgent, 'post', '/api/v1/auth/change-password')
                .send({ currentPassword: secretary.temporaryPassword, newPassword })
                .expect(400);
            assert.equal((await userRow(secretary.id)).must_change_password, 1);
        }

        await mutation(secretary.firstAgent, 'post', '/api/v1/auth/change-password')
            .send({ currentPassword: ` ${secretary.temporaryPassword} `, newPassword: FINAL_PASSWORD })
            .expect(400);

        secretary.sibling = await login({
            username: secretary.username,
            password: secretary.temporaryPassword,
        });
        secretary.sessionsAtChange = (await sessionRows(secretary.id)).map((session) => session.id);
        await mutation(secretary.firstAgent, 'post', '/api/v1/auth/change-password')
            .send({ currentPassword: secretary.temporaryPassword, newPassword: FINAL_PASSWORD })
            .expect(200);
        const row = await userRow(secretary.id);
        assert.equal(row.must_change_password, 0);
        assert.ok(row.password_changed_at);
        assert.equal(row.password, row.password_hash);
        assert.equal(await bcrypt.compare(FINAL_PASSWORD, row.password), true);
        assert.equal(await bcrypt.compare(FINAL_PASSWORD.trim(), row.password), false);
        await secretary.firstAgent.get('/api/v1/dashboard/lifecycle-monitoring').expect(200);
        await login({ username: secretary.username, password: FINAL_PASSWORD.trim() }, 401);
        await login({ username: secretary.username, password: FINAL_PASSWORD });
    });

    it('preserves only the exact cookie session used to change password', async () => {
        await secretary.firstAgent.get('/api/v1/auth/me').expect(200);
        await secretary.sibling.agent.get('/api/v1/auth/me').expect(401);

        const rows = await sessionRows(secretary.id);
        const cookieHash = require('node:crypto')
            .createHash('sha256').update(secretary.firstCookie).digest('hex');
        assert.equal(rows.find((row) => row.token_hash === cookieHash)?.is_active, 1);
        assert.ok(rows
            .filter((row) => secretary.sessionsAtChange.includes(row.id) && row.token_hash !== cookieHash)
            .every((row) => row.is_active === 0));
    });

    it('denies subordinate, spoofed role, user_id, and privileged account operations', async () => {
        const targetBefore = await userRow(worker.id);
        const calls = [
            ['get', '/api/v1/users'],
            ['post', '/api/v1/users', { name: 'Escalation', username: `${PREFIX}_escalate`, role: 'SECRETARY' }],
            ['post', `/api/v1/users/${worker.id}/reset-password`, {}],
            ['patch', `/api/v1/users/${worker.id}/disable`, {}],
            ['patch', `/api/v1/users/${worker.id}/reactivate`, {}],
            ['post', `/api/v1/users/${worker.id}/revoke-sessions`, {}],
        ];
        for (const [method, path, body] of calls) {
            let call = method === 'get'
                ? secretary.firstAgent.get(path)
                : mutation(secretary.firstAgent, method, path);
            call = call.set('X-Role', 'ADMIN');
            if (body) call = call.send({ ...body, user_id: adminId, is_active: true, created_by: adminId });
            await call.expect(403);
        }
        assert.deepEqual(await userRow(worker.id), targetBefore);
        assert.equal(await accountCount(), 2);

        const fakeResponse = await mutation(admin, 'post', '/api/v1/users')
            .send({ name: 'Phase 6 Fake Role', username: `${PREFIX}_unknown`, role: 'FARM_WORKER' })
            .expect(201);
        fakeRole = {
            id: fakeResponse.body.user.id,
            username: `${PREFIX}_unknown`,
            temporaryPassword: fakeResponse.body.temporaryPassword,
        };
        issuedSecrets.push(fakeRole.temporaryPassword);
        const fakeLogin = await login({
            username: fakeRole.username,
            password: fakeRole.temporaryPassword,
        });
        const connection = await db.getConnection();
        try {
            await connection.query("SET SESSION sql_mode = ''");
            await connection.query("UPDATE users SET role = '' WHERE id = ?", [fakeRole.id]);
        } finally {
            connection.release();
        }
        await fakeLogin.agent.get('/api/v1/auth/me').expect(403);
        await fakeLogin.agent.get('/api/v1/users').set('X-Role', 'ADMIN').expect(403);
    });

    it('reset revokes old sessions, rotates the password, and forces change', async () => {
        const old = await login({ username: secretary.username, password: FINAL_PASSWORD });
        const beforeHash = (await userRow(secretary.id)).password;
        const reset = await mutation(admin, 'post', `/api/v1/users/${secretary.id}/reset-password`)
            .send({})
            .expect(200);
        assert.match(reset.headers['cache-control'] || '', /no-store/i);
        const temporaryPassword = reset.body.temporaryPassword;
        issuedSecrets.push(temporaryPassword);
        assert.notEqual((await userRow(secretary.id)).password, beforeHash);
        assert.equal((await userRow(secretary.id)).must_change_password, 1);
        assert.equal(await activeSessionCount(secretary.id), 0);
        await old.agent.get('/api/v1/auth/me').expect(401);
        await login({ username: secretary.username, password: FINAL_PASSWORD }, 401);
        const fresh = await login({ username: secretary.username, password: temporaryPassword });
        const denied = await fresh.agent.get('/api/v1/plantings').expect(403);
        assert.equal(denied.body.code, 'PASSWORD_CHANGE_REQUIRED');
        secretary.resetPassword = temporaryPassword;
    });

    it('disable records metadata, revokes sessions, and rejects login and stale cookies', async () => {
        const active = await login({
            username: worker.username,
            password: worker.temporaryPassword,
        });
        const activeBefore = await userRow(worker.id);
        const activeSessionsBefore = await sessionRows(worker.id);
        await mutation(admin, 'patch', `/api/v1/users/${worker.id}/reactivate`)
            .send({})
            .expect(409);
        assert.deepEqual(await userRow(worker.id), activeBefore);
        assert.deepEqual(await sessionRows(worker.id), activeSessionsBefore);

        const disabled = await mutation(admin, 'patch', `/api/v1/users/${worker.id}/disable`)
            .send({})
            .expect(200);
        assert.equal(disabled.body.temporaryPassword, undefined);
        const row = await userRow(worker.id);
        assert.equal(row.is_active, 0);
        assert.equal(row.status, 'INACTIVE');
        assert.ok(row.disabled_at);
        assert.equal(row.disabled_by, adminId);
        assert.equal(await activeSessionCount(worker.id), 0);
        await active.agent.get('/api/v1/auth/me').expect(401);
        await login({ username: worker.username, password: worker.temporaryPassword }, 401);

        const disabledBefore = await userRow(worker.id);
        await mutation(admin, 'post', `/api/v1/users/${worker.id}/reset-password`)
            .send({})
            .expect(409);
        assert.deepEqual(await userRow(worker.id), disabledBefore);
        assert.equal(await activeSessionCount(worker.id), 0);

        await mutation(admin, 'patch', `/api/v1/users/${worker.id}/disable`)
            .send({})
            .expect(409);
        assert.deepEqual(await userRow(worker.id), disabledBefore);
    });

    it('makes Admin reset, disable, reactivate, revoke, delete, and role mutation impossible', async () => {
        const paths = [
            ['post', `/api/v1/users/${adminId}/reset-password`],
            ['patch', `/api/v1/users/${adminId}/disable`],
            ['patch', `/api/v1/users/${adminId}/reactivate`],
            ['post', `/api/v1/users/${adminId}/revoke-sessions`],
        ];
        for (const [method, path] of paths) {
            await expectUnchanged(adminId, () => mutation(admin, method, `${path}?role=ADMIN&user_id=${adminId}`)
                .set('X-Role', 'ADMIN')
                .send({})
                .expect(404));
        }
        await expectUnchanged(adminId, () => mutation(admin, 'patch', `/api/v1/users/${adminId}`)
            .set('X-Role', 'ADMIN')
            .send({ role: 'ADMIN', user_id: adminId })
            .expect(404));
        await expectUnchanged(adminId, () => mutation(admin, 'delete', `/api/v1/users/${adminId}`)
            .set('X-Role', 'ADMIN')
            .expect(404));
        await admin.get('/api/v1/auth/me').expect(200);
    });

    it('reactivates securely with a fresh temp password and dead old sessions', async () => {
        const oldHash = (await userRow(worker.id)).password;
        const response = await mutation(admin, 'patch', `/api/v1/users/${worker.id}/reactivate`)
            .send({})
            .expect(200);
        assert.match(response.headers['cache-control'] || '', /no-store/i);
        const freshPassword = response.body.temporaryPassword;
        issuedSecrets.push(freshPassword);
        const row = await userRow(worker.id);
        assert.equal(row.is_active, 1);
        assert.equal(row.status, 'ACTIVE');
        assert.equal(row.disabled_at, null);
        assert.equal(row.disabled_by, null);
        assert.equal(row.must_change_password, 1);
        assert.notEqual(row.password, oldHash);
        assert.equal(await bcrypt.compare(freshPassword, row.password), true);
        assert.equal(await activeSessionCount(worker.id), 0);
        await login({ username: worker.username, password: worker.temporaryPassword }, 401);
        const fresh = await login({ username: worker.username, password: freshPassword });
        await fresh.agent.get('/api/v1/auth/me').expect(200);
        const denied = await fresh.agent.get('/api/v1/dashboard/lifecycle-monitoring').expect(403);
        assert.equal(denied.body.code, 'PASSWORD_CHANGE_REQUIRED');

        const sibling = await login({ username: worker.username, password: freshPassword });
        await mutation(fresh.agent, 'post', '/api/v1/auth/change-password')
            .send({ currentPassword: freshPassword, newPassword: SECOND_PASSWORD })
            .expect(200);
        await fresh.agent.get('/api/v1/auth/me').expect(200);
        await sibling.agent.get('/api/v1/auth/me').expect(401);
        const cookieHash = require('node:crypto')
            .createHash('sha256').update(cookieValue(fresh.response)).digest('hex');
        const sessions = await sessionRows(worker.id);
        assert.equal(sessions.find((session) => session.token_hash === cookieHash)?.is_active, 1);
        assert.ok(sessions
            .filter((session) => session.token_hash !== cookieHash)
            .every((session) => session.is_active === 0));
        worker.currentCookie = cookieValue(fresh.response);
    });

    it('revokes subordinate sessions idempotently without changing account state', async () => {
        const before = await userRow(worker.id);
        await expectUnchanged(worker.id, () => mutation(admin, 'patch', `/api/v1/users/${worker.id}`)
            .send({ role: 'SECRETARY' })
            .expect(404));
        await expectUnchanged(worker.id, () => mutation(admin, 'delete', `/api/v1/users/${worker.id}`)
            .expect(404));

        await mutation(admin, 'post', `/api/v1/users/${worker.id}/revoke-sessions`)
            .send({})
            .expect(200);
        assert.deepEqual(await userRow(worker.id), before);
        assert.equal(await activeSessionCount(worker.id), 0);
        await request(app)
            .get('/api/v1/auth/me')
            .set('Cookie', `${COOKIE_NAME}=${worker.currentCookie}`)
            .expect(401);

        await mutation(admin, 'post', `/api/v1/users/${worker.id}/revoke-sessions`)
            .send({})
            .expect(200);
        assert.deepEqual(await userRow(worker.id), before);
        assert.equal(await activeSessionCount(worker.id), 0);
    });

    it('records lifecycle audit actions with actor and target metadata but no secrets', async () => {
        const [logs] = await db.query(
            `SELECT *
             FROM activity_logs
             WHERE entity = 'users' AND entity_id IN (?, ?, ?)
             ORDER BY id`,
            [secretary.id, worker.id, fakeRole.id]
        );
        const expected = [
            ['CREATE_USER', adminId, secretary.id],
            ['RESET_USER_PASSWORD', adminId, secretary.id],
            ['CHANGE_PASSWORD', secretary.id, secretary.id],
            ['DISABLE_USER', adminId, worker.id],
            ['REACTIVATE_USER', adminId, worker.id],
            ['CHANGE_PASSWORD', worker.id, worker.id],
            ['REVOKE_USER_SESSIONS', adminId, worker.id],
        ];
        for (const [action, actorId, targetId] of expected) {
            assert.ok(logs.some((log) => (
                log.action === action
                && log.user_id === actorId
                && log.entity_id === targetId
                && log.status === 'success'
                && typeof log.ip_address === 'string'
            )), `missing audit event ${action} for target ${targetId}`);
        }

        const serializedLogs = JSON.stringify(logs);
        const managedRows = await Promise.all([
            userRow(secretary.id),
            userRow(worker.id),
            userRow(fakeRole.id),
        ]);
        for (const secret of issuedSecrets) {
            assert.equal(serializedLogs.includes(secret), false);
        }
        for (const row of managedRows) {
            assert.equal(serializedLogs.includes(row.password), false);
            assert.equal(serializedLogs.includes(row.password_hash), false);
        }
    });

    it('lists no secrets and never persists raw temporary passwords', async () => {
        const list = await admin.get('/api/v1/users').expect(200);
        assertNoSecretKeys(list.body);
        assert.ok(list.body.users.some((user) => user.id === secretary.id));
        assert.ok(list.body.users.some((user) => user.id === worker.id));
        assert.ok(list.body.users.every((user) => ['SECRETARY', 'FARM_WORKER'].includes(user.role)));

        const [users] = await db.query(
            `SELECT name, full_name, email, username, password, password_hash
             FROM users WHERE email LIKE ? OR username LIKE ?`,
            [`${PREFIX}%`, `${PREFIX}%`]
        );
        const [sessions] = await db.query(
            `SELECT s.token_hash, s.ip_address, s.user_agent, s.device_type
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE u.email LIKE ? OR u.username LIKE ?`,
            [`${PREFIX}%`, `${PREFIX}%`]
        );
        const [logs] = await db.query(
            `SELECT action, entity, ip_address, status
             FROM activity_logs WHERE entity = 'users' AND entity_id IN (?, ?, ?)`,
            [secretary.id, worker.id, fakeRole.id]
        );
        const [attempts] = await db.query(
            'SELECT ip_address, email, success FROM login_attempts WHERE email LIKE ?',
            [`${PREFIX}%`]
        );
        const persisted = JSON.stringify({ users, sessions, logs, attempts });
        for (const secret of issuedSecrets) {
            assert.equal(persisted.includes(secret), false, 'raw temporary password was persisted');
        }
    });

    it('preserves all historical domain rows', async () => {
        assert.deepEqual(await domainCounts(), initialDomainCounts);
    });
});
