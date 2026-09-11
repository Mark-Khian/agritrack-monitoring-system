/**
 * Active-admin farm location resolution for Weather + notifications.
 * Isolation: pins DB_NAME before requires (dotenv will not override).
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = '';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run weather-active-admin tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const { getActiveAdmin, getActiveAdminId } = require('../utils/activeAdmin');
const { getAdminId } = require('../utils/notificationService');
const { BCRYPT_COST } = require('../utils/passwordHelper');

const PREFIX = `wx_admin_${Date.now()}_${process.pid}`;
const PASSWORD = 'Wx-Active-Admin!42';

describe('Weather active-admin lookup', () => {
    let inactiveId;
    let activeId;
    let loginAgent;
    let priorActiveSnapshot;

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        // Snapshot existing active admins so we can restore / temporarily demote them.
        const [existingActive] = await db.query(
            `SELECT id, is_active, status, farm_latitude, farm_longitude, farm_location_name
             FROM users
             WHERE role = 'admin' AND is_active = 1 AND status = 'ACTIVE'`
        );
        priorActiveSnapshot = existingActive;

        // Demote existing active admins for this suite so fixtures control selection.
        if (existingActive.length) {
            await db.query(
                `UPDATE users
                 SET is_active = 0, status = 'INACTIVE'
                 WHERE id IN (${existingActive.map(() => '?').join(',')})`,
                existingActive.map((row) => row.id)
            );
        }

        const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
        const [inactiveInsert] = await db.query(
            `INSERT INTO users
                (name, email, password, role, is_active, status,
                 farm_latitude, farm_longitude, farm_location_name)
             VALUES (?, ?, ?, 'admin', 0, 'INACTIVE', NULL, NULL, NULL)`,
            [`${PREFIX}_inactive`, `${PREFIX}_inactive@test.invalid`, hash]
        );
        inactiveId = inactiveInsert.insertId;

        const [activeInsert] = await db.query(
            `INSERT INTO users
                (name, email, password, role, is_active, status,
                 farm_latitude, farm_longitude, farm_location_name)
             VALUES (?, ?, ?, 'admin', 1, 'ACTIVE', NULL, NULL, NULL)`,
            [`${PREFIX}_active`, `${PREFIX}_active@test.invalid`, hash]
        );
        activeId = activeInsert.insertId;

        assert.ok(inactiveId < activeId, 'inactive fixture must have lower id');

        loginAgent = request.agent(app);
        await loginAgent
            .post('/api/v1/auth/login')
            .send({ username: `${PREFIX}_active@test.invalid`, password: PASSWORD })
            .expect(200);
    });

    after(async () => {
        if (inactiveId) {
            await db.query('DELETE FROM sessions WHERE user_id = ?', [inactiveId]);
            await db.query('DELETE FROM notifications WHERE user_id = ?', [inactiveId]);
            await db.query('DELETE FROM users WHERE id = ?', [inactiveId]);
        }
        if (activeId) {
            await db.query('DELETE FROM sessions WHERE user_id = ?', [activeId]);
            await db.query('DELETE FROM notifications WHERE user_id = ?', [activeId]);
            await db.query('DELETE FROM users WHERE id = ?', [activeId]);
        }
        // Restore prior active admins
        for (const row of priorActiveSnapshot || []) {
            await db.query(
                `UPDATE users
                 SET is_active = ?, status = ?,
                     farm_latitude = ?, farm_longitude = ?, farm_location_name = ?
                 WHERE id = ?`,
                [
                    row.is_active,
                    row.status,
                    row.farm_latitude,
                    row.farm_longitude,
                    row.farm_location_name,
                    row.id,
                ]
            );
        }
        await db.end();
    });

    it('helper ignores inactive lower-id admin and returns active admin', async () => {
        const admin = await getActiveAdmin();
        assert.ok(admin);
        assert.equal(admin.id, activeId);
        assert.notEqual(admin.id, inactiveId);

        const id = await getActiveAdminId();
        assert.equal(id, activeId);
    });

    it('getAdminId targets active admin, never inactive legacy admin', async () => {
        const id = await getAdminId();
        assert.equal(id, activeId);
        assert.notEqual(id, inactiveId);
    });

    it('GET /weather returns farmNotConfigured when active admin has NULL coords', async () => {
        await db.query(
            `UPDATE users
             SET farm_latitude = NULL, farm_longitude = NULL, farm_location_name = NULL
             WHERE id = ?`,
            [activeId]
        );

        const res = await loginAgent.get('/api/v1/weather').expect(400);
        assert.equal(res.body.farmNotConfigured, true);
        assert.match(String(res.body.message), /not been configured/i);
    });

    it('GET /weather uses active admin coords and ignores inactive NULL admin', async () => {
        await db.query(
            `UPDATE users
             SET farm_latitude = ?, farm_longitude = ?, farm_location_name = ?
             WHERE id = ?`,
            [15.4865, 120.9675, 'Calaanan, Bongabon, Nueva Ecija', activeId]
        );
        // Inactive remains NULL — must be ignored even with lower id
        await db.query(
            `UPDATE users
             SET farm_latitude = NULL, farm_longitude = NULL, farm_location_name = NULL
             WHERE id = ?`,
            [inactiveId]
        );

        const res = await loginAgent.get('/api/v1/weather');
        assert.notEqual(res.body.farmNotConfigured, true);
        // 200 = OpenWeather OK; 502 = provider/network after passing admin lookup
        assert.ok([200, 502].includes(res.status), `unexpected status ${res.status}`);
        if (res.status === 200) {
            assert.equal(Number(res.body.location.lat.toFixed(4)), 15.4865);
            assert.equal(Number(res.body.location.lon.toFixed(4)), 120.9675);
        }
    });

    it('farm-location save on session admin is the same identity weather reads', async () => {
        // Simulate successful PUT /farm-location write target (req.user.id = active admin)
        await db.query(
            `UPDATE users
             SET farm_latitude = ?, farm_longitude = ?, farm_location_name = ?
             WHERE id = ?`,
            [15.1111, 120.2222, 'Jaen, Nueva Ecija', activeId]
        );

        const helper = await getActiveAdmin();
        assert.equal(helper.id, activeId);
        assert.equal(Number(helper.farm_latitude), 15.1111);
        assert.equal(Number(helper.farm_longitude), 120.2222);

        const [inactiveRow] = await db.query(
            'SELECT farm_latitude, farm_longitude FROM users WHERE id = ?',
            [inactiveId]
        );
        assert.equal(inactiveRow[0].farm_latitude, null);
        assert.equal(inactiveRow[0].farm_longitude, null);

        const weather = await loginAgent.get('/api/v1/weather');
        assert.notEqual(weather.body.farmNotConfigured, true);
        assert.ok([200, 502].includes(weather.status));
    });

    it('does not select inactive admin when no active admin exists', async () => {
        await db.query(
            `UPDATE users SET is_active = 0, status = 'INACTIVE' WHERE id = ?`,
            [activeId]
        );

        const admin = await getActiveAdmin();
        assert.equal(admin, null);

        // Restore for subsequent cleanup / other tests in this file
        await db.query(
            `UPDATE users SET is_active = 1, status = 'ACTIVE' WHERE id = ?`,
            [activeId]
        );

        // Login again may be needed if session still valid — weather with no active:
        // temporarily demote and hit API with existing session (session user still exists)
        await db.query(
            `UPDATE users SET is_active = 0, status = 'INACTIVE' WHERE id = ?`,
            [activeId]
        );
        const res = await loginAgent.get('/api/v1/weather');
        // protect may 403 disabled account, or controller 500 if session still valid
        assert.ok([403, 500].includes(res.status), `unexpected status ${res.status}`);
        if (res.status === 500) {
            assert.match(String(res.body.message), /no active administrator/i);
        }

        await db.query(
            `UPDATE users SET is_active = 1, status = 'ACTIVE' WHERE id = ?`,
            [activeId]
        );
    });
});
