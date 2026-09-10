/**
 * Phase 7 — offline login abuse protection.
 * Exercises the REAL limiter/challenge middleware inside NODE_ENV=test only
 * via PHASE7_ABUSE_MIDDLEWARE=1. That flag cannot disable protection outside test.
 */
process.env.NODE_ENV = 'test';
process.env.PHASE7_ABUSE_MIDDLEWARE = '1';
process.env.LOGIN_CHALLENGE_SECRET = 'phase7-test-challenge-secret-32bytes-min';
process.env.JWT_SECRET = 'jwt-secret-must-not-be-reused-as-challenge';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 7 tests outside crop_management_rearch_test');
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('../app');
const db = require('../config/db');
const { BCRYPT_COST } = require('../utils/passwordHelper');
const { countOpenChallenges } = require('../services/loginChallengeService');

const ORIGIN = process.env.ALLOWED_ORIGIN;
const PREFIX = `phase7_${Date.now()}_${process.pid}`;
const ADMIN = { username: 'superadmin', password: 'admin1234' };
const PASSWORD = 'Phase7-Test-Only!42';
const FINAL_PASSWORD = 'Phase7-Changed!84';
const COOKIE = 'agritrack_session';

const solvePrompt = (prompt) => {
    const match = String(prompt).match(/What is (\d+) ([+*-]) (\d+)\?/);
    assert.ok(match, 'challenge prompt must be a local arithmetic question');
    const left = Number(match[1]);
    const operator = match[2];
    const right = Number(match[3]);
    if (operator === '+') return String(left + right);
    if (operator === '-') return String(left - right);
    return String(left * right);
};

const forwarded = (ip, spoofed) => (
    spoofed ? `${spoofed}, ${ip}` : ip
);

const loginRequest = (body, ip, spoofed) => request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', forwarded(ip, spoofed))
    .send(body);

const challengeRequest = (username, ip, spoofed) => request(app)
    .post('/api/v1/auth/challenge')
    .set('X-Forwarded-For', forwarded(ip, spoofed))
    .send({ username });

const issueSolvedChallenge = async (username, ip) => {
    const response = await challengeRequest(username, ip).expect(200);
    assert.equal(typeof response.body.challengeId, 'string');
    assert.equal(response.body.challengeId.length, 64);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.answer, undefined);
    assert.equal(response.body.answer_hash, undefined);
    return {
        challengeId: response.body.challengeId,
        challengeAnswer: solvePrompt(response.body.prompt),
        prompt: response.body.prompt,
    };
};

const failLogin = (username, ip, password = 'wrong-password') => (
    loginRequest({ username, password }, ip)
);

const userRow = async (id) => {
    const [rows] = await db.query(
        `SELECT id, is_active, locked_until, failed_attempts, failed_login_attempts,
                last_failed_login_at, captcha_required, must_change_password
         FROM users WHERE id = ?`,
        [id]
    );
    return rows[0];
};

describe('Phase 7 offline login abuse protection', () => {
    let adminId;
    let secretaryId;
    let workerId;
    let disabledId;
    let forcedId;
    let ipSerial = 10;

    const nextIp = () => {
        ipSerial += 1;
        return `203.0.113.${ipSerial}`;
    };

    before(async () => {
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, 'crop_management_rearch_test');

        const [adminRows] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [ADMIN.username]
        );
        assert.ok(adminRows.length, 'test admin missing; run npm run test:setup-db');
        adminId = adminRows[0].id;

        const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
        const [result] = await db.query(
            `INSERT INTO users
             (name, email, username, password, password_hash, role, is_active, status,
              failed_attempts, failed_login_attempts, must_change_password)
             VALUES
               ('Phase 7 Secretary', ?, ?, ?, ?, 'SECRETARY', 1, 'ACTIVE', 0, 0, 0),
               ('Phase 7 Worker', ?, ?, ?, ?, 'FARM_WORKER', 1, 'ACTIVE', 0, 0, 0),
               ('Phase 7 Disabled', ?, ?, ?, ?, 'SECRETARY', 0, 'INACTIVE', 0, 0, 0),
               ('Phase 7 Forced', ?, ?, ?, ?, 'SECRETARY', 1, 'ACTIVE', 0, 0, 1)`,
            [
                `${PREFIX}_secretary`, `${PREFIX}_secretary`, hash, hash,
                `${PREFIX}_worker`, `${PREFIX}_worker`, hash, hash,
                `${PREFIX}_disabled`, `${PREFIX}_disabled`, hash, hash,
                `${PREFIX}_forced`, `${PREFIX}_forced`, hash, hash,
            ]
        );
        secretaryId = result.insertId;
        workerId = result.insertId + 1;
        disabledId = result.insertId + 2;
        forcedId = result.insertId + 3;

        await db.query(
            `UPDATE users
             SET failed_attempts = 0, failed_login_attempts = 0, last_failed_login_at = NULL,
                 locked_until = NULL, captcha_required = 0, is_active = 1
             WHERE id = ?`,
            [adminId]
        );
        await db.query(
            `DELETE FROM login_attempts
             WHERE username = ? OR email = ?`,
            [ADMIN.username, ADMIN.username]
        );
        await db.query('DELETE FROM login_challenges');
    });

    after(async () => {
        await db.query('DELETE FROM login_challenges');
        await db.query('DELETE FROM login_attempts WHERE email LIKE ? OR username LIKE ?', [`${PREFIX}%`, `${PREFIX}%`]);
        await db.query('DELETE FROM sessions WHERE user_id IN (?, ?, ?, ?)', [secretaryId, workerId, disabledId, forcedId]);
        await db.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [secretaryId, workerId, disabledId, forcedId]);
        await db.end();
    });

    it('does not depend on Google reCAPTCHA or axios', () => {
        const files = [
            'middleware/captcha.js',
            'middleware/captchaGuard.js',
            'services/loginChallengeService.js',
            'controllers/challengeController.js',
            'routes/authRoutes.js',
        ];
        for (const file of files) {
            const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
            assert.equal(/recaptcha|google\.com\/recaptcha|axios/i.test(source), false, file);
        }
        const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
        assert.equal(/recaptcha/i.test(html), false);
    });

    it('allows a normal valid login before any threshold', async () => {
        const ip = nextIp();
        const response = await loginRequest(ADMIN, ip).expect(200);
        assert.equal(response.body.message, 'Login successful!');
        assert.ok(response.headers['set-cookie']?.some((line) => line.startsWith(`${COOKIE}=`)));
        const row = await userRow(adminId);
        assert.equal(row.failed_attempts, 0);
        assert.equal(row.failed_login_attempts, 0);
        assert.equal(row.last_failed_login_at, null);
        assert.equal(row.locked_until, null);
    });

    it('returns equivalent generic failures for known and unknown identities', async () => {
        const known = await failLogin(`${PREFIX}_secretary`, nextIp()).expect(401);
        const unknown = await failLogin(`${PREFIX}_missing_user`, nextIp()).expect(401);
        assert.equal(known.body.message, 'Invalid credentials.');
        assert.equal(unknown.body.message, 'Invalid credentials.');
        assert.equal(known.body.challengeRequired, false);
        assert.equal(unknown.body.challengeRequired, false);
        assert.equal(known.body.role, undefined);
        assert.equal(unknown.body.exists, undefined);
    });

    it('requires a challenge after 3 IP failures in 5 minutes', async () => {
        const ip = nextIp();
        const first = await failLogin(`${PREFIX}_ip_threshold`, ip).expect(401);
        const second = await failLogin(`${PREFIX}_ip_threshold`, ip).expect(401);
        const third = await failLogin(`${PREFIX}_ip_threshold`, ip).expect(401);
        assert.equal(first.body.challengeRequired, false);
        assert.equal(second.body.challengeRequired, false);
        assert.equal(third.body.challengeRequired, true);

        const blocked = await failLogin(`${PREFIX}_ip_threshold`, ip).expect(401);
        assert.equal(blocked.body.message, 'Invalid credentials.');
        assert.equal(blocked.body.challengeRequired, true);
    });

    it('requires a challenge after 5 identity failures across IPs', async () => {
        const username = `${PREFIX}_identity`;
        let last;
        for (let index = 0; index < 5; index += 1) {
            last = await failLogin(username, nextIp()).expect(401);
        }
        assert.equal(last.body.challengeRequired, true);
        const still = await failLogin(username, nextIp()).expect(401);
        assert.equal(still.body.challengeRequired, true);
    });

    it('resets identity escalation at the last successful login without clearing other IP failures', async () => {
        const username = `${PREFIX}_worker`;
        for (let index = 0; index < 4; index += 1) {
            await failLogin(username, nextIp()).expect(401);
        }
        const successIp = nextIp();
        await loginRequest({ username, password: PASSWORD }, successIp).expect(200);
        const row = await userRow(workerId);
        assert.equal(row.failed_attempts, 0);
        assert.equal(row.failed_login_attempts, 0);
        assert.equal(row.last_failed_login_at, null);

        const next = await failLogin(username, nextIp()).expect(401);
        assert.equal(next.body.challengeRequired, false);

        const otherIp = nextIp();
        await failLogin(`${PREFIX}_unrelated_ip`, otherIp).expect(401);
        await failLogin(`${PREFIX}_unrelated_ip`, otherIp).expect(401);
        const third = await failLogin(`${PREFIX}_unrelated_ip`, otherIp).expect(401);
        assert.equal(third.body.challengeRequired, true);
        await loginRequest({ username, password: PASSWORD }, successIp).expect(200);
        const stillChallenged = await failLogin(`${PREFIX}_unrelated_ip`, otherIp).expect(401);
        assert.equal(stillChallenged.body.challengeRequired, true);
    });

    it('never hard-locks Admin after repeated failures', async () => {
        const username = ADMIN.username;
        for (let index = 0; index < 6; index += 1) {
            const ip = nextIp();
            const failed = await failLogin(username, ip).expect(401);
            if (failed.body.challengeRequired) {
                const challenge = await issueSolvedChallenge(username, ip);
                await loginRequest({
                    username,
                    password: 'still-wrong',
                    ...challenge,
                }, ip).expect(401);
            }
        }
        const row = await userRow(adminId);
        assert.equal(row.is_active, 1);
        assert.equal(row.locked_until, null);
        assert.equal(row.captcha_required, 0);
        const ip = nextIp();
        const challenge = await issueSolvedChallenge(username, ip);
        await loginRequest({ ...ADMIN, ...challenge }, ip).expect(200);
    });

    it('rejects missing, incorrect, expired, reused, refreshed, IP-mismatched, and identity-mismatched challenges', async () => {
        const escalateIp = async (username, ip) => {
            for (let index = 0; index < 3; index += 1) {
                await failLogin(username, ip).expect(401);
            }
        };

        const missingName = `${PREFIX}_missing`;
        const missingIp = nextIp();
        await escalateIp(missingName, missingIp);
        const missing = await loginRequest({ username: missingName, password: PASSWORD }, missingIp).expect(401);
        assert.equal(missing.body.message, 'Invalid credentials.');
        assert.equal(missing.body.challengeRequired, true);

        const wrongName = `${PREFIX}_wrongans`;
        const wrongIp = nextIp();
        await escalateIp(wrongName, wrongIp);
        const issued = await issueSolvedChallenge(wrongName, wrongIp);
        const wrong = await loginRequest({
            username: wrongName,
            password: PASSWORD,
            challengeId: issued.challengeId,
            challengeAnswer: '9999',
        }, wrongIp).expect(401);
        assert.equal(wrong.body.message, 'Invalid credentials.');

        const expireName = `${PREFIX}_expire`;
        const expiredIp = nextIp();
        await escalateIp(expireName, expiredIp);
        const expiring = await issueSolvedChallenge(expireName, expiredIp);
        await db.query('UPDATE login_challenges SET expires_at = DATE_SUB(NOW(), INTERVAL 6 MINUTE) WHERE id = ?', [expiring.challengeId]);
        const expired = await loginRequest({
            username: expireName,
            password: PASSWORD,
            ...expiring,
        }, expiredIp).expect(401);
        assert.equal(expired.body.challengeRequired, true);

        const replayIp = nextIp();
        await escalateIp(`${PREFIX}_secretary`, replayIp);
        const reusable = await issueSolvedChallenge(`${PREFIX}_secretary`, replayIp);
        await loginRequest({ username: `${PREFIX}_secretary`, password: PASSWORD, ...reusable }, replayIp).expect(200);
        const replay = await loginRequest({ username: `${PREFIX}_secretary`, password: PASSWORD, ...reusable }, replayIp).expect(401);
        assert.equal(replay.body.message, 'Invalid credentials.');
        assert.equal(replay.body.challengeRequired, true);

        const refreshIp = nextIp();
        await escalateIp(`${PREFIX}_refresh`, refreshIp);
        const first = await issueSolvedChallenge(`${PREFIX}_refresh`, refreshIp);
        const second = await issueSolvedChallenge(`${PREFIX}_refresh`, refreshIp);
        assert.notEqual(first.challengeId, second.challengeId);
        assert.equal(await countOpenChallenges(refreshIp, `${PREFIX}_refresh`), 1);
        await loginRequest({
            username: `${PREFIX}_refresh`,
            password: 'wrong',
            ...first,
        }, refreshIp).expect(401);
        await loginRequest({
            username: `${PREFIX}_refresh`,
            password: 'wrong',
            ...second,
        }, refreshIp).expect(401);

        const bindName = `${PREFIX}_bind`;
        const otherName = `${PREFIX}_bind_other`;
        const bindIp = nextIp();
        const otherIp = nextIp();
        await escalateIp(bindName, bindIp);
        await escalateIp(bindName, otherIp);
        const bound = await issueSolvedChallenge(bindName, bindIp);
        const ipMismatch = await loginRequest({ username: bindName, password: PASSWORD, ...bound }, otherIp).expect(401);
        assert.equal(ipMismatch.body.challengeRequired, true);
        const identityMismatch = await loginRequest({
            username: otherName,
            password: PASSWORD,
            ...bound,
        }, bindIp).expect(401);
        assert.equal(identityMismatch.body.message, 'Invalid credentials.');
    });

    it('consumes a challenge atomically so concurrent reuse cannot succeed twice', async () => {
        const username = `${PREFIX}_secretary`;
        const ip = nextIp();
        await failLogin(username, ip).expect(401);
        await failLogin(username, ip).expect(401);
        await failLogin(username, ip).expect(401);
        const challenge = await issueSolvedChallenge(username, ip);
        const [first, second] = await Promise.all([
            loginRequest({ username, password: PASSWORD, ...challenge }, ip),
            loginRequest({ username, password: PASSWORD, ...challenge }, ip),
        ]);
        const statuses = [first.status, second.status].sort();
        assert.deepEqual(statuses, [200, 401]);
        assert.equal(first.body.challengeId || second.body.challengeId, undefined);
    });

    it('treats a correct challenge plus wrong password as a generic failure that needs a fresh challenge', async () => {
        const username = `${PREFIX}_worker`;
        const ip = nextIp();
        await failLogin(username, ip).expect(401);
        await failLogin(username, ip).expect(401);
        await failLogin(username, ip).expect(401);
        const challenge = await issueSolvedChallenge(username, ip);
        const failed = await loginRequest({
            username,
            password: 'wrong-password',
            ...challenge,
        }, ip).expect(401);
        assert.equal(failed.body.message, 'Invalid credentials.');
        assert.equal(failed.body.challengeRequired, true);
        const reused = await loginRequest({
            username,
            password: PASSWORD,
            ...challenge,
        }, ip).expect(401);
        assert.equal(reused.body.challengeRequired, true);
        const successIp = nextIp();
        const fresh = await issueSolvedChallenge(username, successIp);
        await loginRequest({ username, password: PASSWORD, ...fresh }, successIp).expect(200);
    });

    it('rate-limits challenge issuance independently from login', async () => {
        const ip = nextIp();
        let limited = null;
        for (let index = 0; index < 12; index += 1) {
            const response = await challengeRequest(`${PREFIX}_issue_limit`, ip);
            if (response.status === 429) {
                limited = response;
                break;
            }
        }
        assert.ok(limited, 'challenge limiter should fire');
        assert.equal(limited.body.message.includes('Too many verification requests'), true);
        await failLogin(`${PREFIX}_issue_limit`, ip).expect(401);
    });

    it('ignores spoofed X-Forwarded-For left-hand addresses', async () => {
        const realIp = nextIp();
        const spoof = '198.51.100.9';
        let limited = null;
        for (let index = 0; index < 6; index += 1) {
            const response = await loginRequest(
                { username: `${PREFIX}_spoof`, password: 'wrong' },
                realIp,
                spoof
            );
            if (response.status === 429) {
                limited = response;
                break;
            }
        }
        assert.ok(limited, 'real client IP should still be rate-limited');
        const otherReal = nextIp();
        const other = await loginRequest(
            { username: `${PREFIX}_spoof`, password: 'wrong' },
            otherReal,
            spoof
        );
        assert.notEqual(other.status, 429);
        assert.equal(other.body.message, 'Invalid credentials.');
    });

    it('returns generic 401 for disabled accounts and never sets lockout fields', async () => {
        const ip = nextIp();
        const response = await loginRequest({
            username: `${PREFIX}_disabled`,
            password: PASSWORD,
        }, ip).expect(401);
        assert.equal(response.body.message, 'Invalid credentials.');
        const row = await userRow(disabledId);
        assert.equal(row.is_active, 0);
        assert.equal(row.locked_until, null);
        const unknown = await failLogin(`${PREFIX}_no_such`, nextIp()).expect(401);
        assert.equal(unknown.body.message, response.body.message);
    });

    it('authenticates Secretary and Farm Worker through a required challenge', async () => {
        for (const account of [
            { username: `${PREFIX}_secretary`, password: PASSWORD },
            { username: `${PREFIX}_worker`, password: PASSWORD },
        ]) {
            const ip = nextIp();
            await failLogin(account.username, ip).expect(401);
            await failLogin(account.username, ip).expect(401);
            await failLogin(account.username, ip).expect(401);
            const challenge = await issueSolvedChallenge(account.username, ip);
            const response = await loginRequest({ ...account, ...challenge }, ip).expect(200);
            assert.equal(response.body.message, 'Login successful!');
        }
    });

    it('keeps forced-password users gated after a successful challenge login', async () => {
        const username = `${PREFIX}_forced`;
        const ip = nextIp();
        await failLogin(username, ip).expect(401);
        await failLogin(username, ip).expect(401);
        await failLogin(username, ip).expect(401);
        const challenge = await issueSolvedChallenge(username, ip);
        const agent = request.agent(app);
        await agent.post('/api/v1/auth/login')
            .set('X-Forwarded-For', ip)
            .send({ username, password: PASSWORD, ...challenge })
            .expect(200);
        const denied = await agent.get('/api/v1/plantings').expect(403);
        assert.equal(denied.body.code, 'PASSWORD_CHANGE_REQUIRED');
        await agent.post('/api/v1/auth/change-password')
            .set('Origin', ORIGIN)
            .send({ currentPassword: PASSWORD, newPassword: FINAL_PASSWORD })
            .expect(200);
        await agent.get('/api/v1/auth/me').expect(200);
    });

    it('stores hashes only and never persists raw answers or passwords', async () => {
        const [challenges] = await db.query('SELECT * FROM login_challenges');
        for (const row of challenges) {
            assert.match(row.answer_hash, /^[a-f0-9]{64}$/);
            assert.equal(row.answer, undefined);
            const serialized = JSON.stringify(row);
            assert.equal(serialized.includes(PASSWORD), false);
            assert.equal(serialized.includes(ADMIN.password), false);
        }
        const [attempts] = await db.query(
            'SELECT ip_address, email, username, success FROM login_attempts WHERE username LIKE ?',
            [`${PREFIX}%`]
        );
        const serialized = JSON.stringify(attempts);
        assert.equal(serialized.includes(PASSWORD), false);
        assert.equal(serialized.includes('What is'), false);
    });

    it('fails closed when the challenge secret is missing and refuses JWT reuse', async () => {
        const original = process.env.LOGIN_CHALLENGE_SECRET;
        process.env.LOGIN_CHALLENGE_SECRET = '';
        const missing = await challengeRequest(`${PREFIX}_secret`, nextIp()).expect(503);
        assert.equal(missing.body.message, 'Login verification is temporarily unavailable.');
        process.env.LOGIN_CHALLENGE_SECRET = process.env.JWT_SECRET;
        const reused = await challengeRequest(`${PREFIX}_secret`, nextIp()).expect(503);
        assert.equal(reused.body.message, 'Login verification is temporarily unavailable.');
        process.env.LOGIN_CHALLENGE_SECRET = original;
        await challengeRequest(`${PREFIX}_secret`, nextIp()).expect(200);
    });

    it('fails closed when login-attempt storage is unavailable', async () => {
        const original = db.query;
        db.query = async () => {
            throw new Error('simulated challenge store failure');
        };
        try {
            const response = await failLogin(`${PREFIX}_dbfail`, nextIp());
            assert.equal(response.status, 503);
            assert.equal(response.body.message, 'Login verification is temporarily unavailable.');
        } finally {
            db.query = original;
        }
    });

    it('keeps dual legacy/v2 failure counters consistent and never enforces locked_until', async () => {
        const row = await userRow(workerId);
        assert.equal(row.failed_attempts, row.failed_login_attempts);
        assert.equal(row.locked_until, null);
        const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');
        assert.equal(/locked_until\s*>/.test(source), false);
        assert.equal(/LOCKOUT_TIME/.test(source), false);
    });
});
