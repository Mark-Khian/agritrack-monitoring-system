const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../server/node_modules/puppeteer');
const mysql = require('../server/node_modules/mysql2/promise');
const dotenv = require('../server/node_modules/dotenv');

dotenv.config({
    path: path.join(__dirname, '..', 'server', '.env'),
    quiet: true,
});

const APP_URL = 'http://localhost:5173';
const TEST_DB = 'crop_management_rearch_test';
const AUTH_COOKIE = 'agritrack_session';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const executablePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const test = async (name, callback) => {
    await callback();
    console.log(`PASS ${name}`);
};

const clickButton = async (page, label) => {
    const clicked = await page.evaluate((text) => {
        const button = [...document.querySelectorAll('button')]
            .find((candidate) => candidate.textContent.trim() === text);
        if (!button) return false;
        button.click();
        return true;
    }, label);
    assert.equal(clicked, true, `button "${label}" should exist`);
};

const login = async (page) => {
    await page.waitForSelector('#username');
    await page.type('#username', 'superadmin');
    await page.type('#password', 'admin1234');
    await clickButton(page, 'Login');
    await page.waitForFunction(() => window.location.pathname === '/dashboard', {
        timeout: 15_000,
    });
    await page.waitForFunction(() => (
        [...document.querySelectorAll('a')]
            .some((candidate) => candidate.textContent.includes('Plantings'))
    ));
};

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: TEST_DB,
    });
    const [[dbName]] = await db.query('SELECT DATABASE() AS name');
    assert.equal(dbName.name, TEST_DB);

    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const requests = [];
    const responses = [];
    let meFailure = null;
    let failLogout = false;

    await page.setRequestInterception(true);
    page.on('request', async (request) => {
        const url = new URL(request.url());
        if (url.pathname === '/api/v1/auth/me' && meFailure === '503') {
            await request.respond({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'temporary test outage' }),
            });
            return;
        }
        if (url.pathname === '/api/v1/auth/me' && meFailure === 'network') {
            await request.abort('failed');
            return;
        }
        if (url.pathname === '/api/v1/auth/logout' && failLogout) {
            await request.abort('failed');
            return;
        }

        requests.push({
            method: request.method(),
            url: request.url(),
            headers: request.headers(),
        });
        await request.continue();
    });
    page.on('response', (response) => {
        responses.push({
            status: response.status(),
            url: response.url(),
        });
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#username');

        await page.evaluate(() => {
            localStorage.setItem('token', 'legacy-access');
            localStorage.setItem('refreshToken', 'legacy-refresh');
            localStorage.setItem('user', '{"legacy":true}');
            sessionStorage.setItem('token', 'legacy-session-access');
            localStorage.setItem('theme', 'light');
            localStorage.setItem('agritrack_quick_tasks', '[{"id":1,"text":"keep"}]');
        });
        await page.reload({ waitUntil: 'networkidle0' });

        await test('initial 401 shows login and removes only legacy auth keys', async () => {
            const storage = await page.evaluate(() => ({
                local: { ...localStorage },
                session: { ...sessionStorage },
            }));
            assert.equal(storage.local.token, undefined);
            assert.equal(storage.local.refreshToken, undefined);
            assert.equal(storage.local.user, undefined);
            assert.equal(storage.session.token, undefined);
            assert.equal(storage.local.theme, 'light');
            assert.equal(storage.local.agritrack_quick_tasks, '[{"id":1,"text":"keep"}]');
        });

        await login(page);

        await test('cookie login and /auth/me establish the session', async () => {
            const cookies = await page.cookies();
            const session = cookies.find((cookie) => cookie.name === AUTH_COOKIE);
            assert.ok(session);
            assert.equal(session.httpOnly, true);
            assert.ok(responses.some((response) => (
                response.url.endsWith('/api/v1/auth/me') && response.status === 200
            )));

            const visibleCookie = await page.evaluate(() => document.cookie);
            assert.ok(!visibleCookie.includes(`${AUTH_COOKIE}=`));

            const storage = await page.evaluate(() => ({
                local: { ...localStorage },
                session: { ...sessionStorage },
            }));
            for (const key of ['token', 'refreshToken', 'user']) {
                assert.equal(storage.local[key], undefined);
                assert.equal(storage.session[key], undefined);
            }
        });

        await test('browser refresh restores the protected route through /auth/me', async () => {
            await page.reload({ waitUntil: 'networkidle0' });
            assert.equal(new URL(page.url()).pathname, '/dashboard');
            await page.waitForSelector('aside');
        });

        await test('normal frontend traffic sends neither Bearer nor refresh requests', async () => {
            const apiRequests = requests.filter((request) => request.url.includes('/api/'));
            assert.ok(apiRequests.length > 0);
            assert.ok(apiRequests.every((request) => !request.headers.authorization));
            assert.ok(apiRequests.every((request) => !request.url.includes('/auth/refresh')));
        });

        await test('cookie-authenticated GET/POST/PUT/PATCH/DELETE pass CSRF', async () => {
            const result = await page.evaluate(async () => {
                const json = { 'Content-Type': 'application/json' };
                const get = await fetch('/api/v1/notes', { credentials: 'include' });
                const created = await fetch('/api/v1/notes', {
                    method: 'POST',
                    credentials: 'include',
                    headers: json,
                    body: JSON.stringify({
                        title: 'Phase 4 browser test',
                        note_date: '2026-09-10',
                        color: 'slate',
                    }),
                });
                const createdBody = await created.json();
                const noteId = createdBody.data?.id;
                const put = await fetch(`/api/v1/notes/${noteId}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: json,
                    body: JSON.stringify({
                        title: 'Phase 4 browser test updated',
                        note_date: '2026-09-10',
                        color: 'slate',
                    }),
                });
                const patch = await fetch('/api/v1/notifications/read-all', {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: json,
                    body: JSON.stringify({}),
                });
                const del = await fetch(`/api/v1/notes/${noteId}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
                return {
                    get: get.status,
                    post: created.status,
                    put: put.status,
                    patch: patch.status,
                    delete: del.status,
                };
            });
            assert.deepEqual(result, {
                get: 200,
                post: 201,
                put: 200,
                patch: 200,
                delete: 200,
            });
            const unsafeRequests = requests.filter((request) => (
                request.url.includes('/api/v1/')
                && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
            ));
            assert.ok(unsafeRequests.length >= 4);
            assert.ok(unsafeRequests.every((request) => request.headers.origin === APP_URL));
        });

        await test('existing functional pages and centralized Analytics requests regress cleanly', async () => {
            const routes = [
                ['Plantings', '/plantings'],
                ['Activities', '/activities'],
                ['Harvests', '/harvests'],
                ['Calendar', '/calendar'],
                ['Analytics', '/analytics'],
                ['Dashboard', '/dashboard'],
            ];

            for (const [label, route] of routes) {
                await page.evaluate((text) => {
                    const link = [...document.querySelectorAll('a')]
                        .find((candidate) => candidate.textContent.includes(text));
                    link.click();
                }, label);
                await page.waitForFunction(
                    (expected) => window.location.pathname === expected,
                    {},
                    route
                );
                assert.ok(await page.$('main'));
                if (label === 'Analytics') {
                    await new Promise((resolve) => setTimeout(resolve, 750));
                }
            }

            const analyticsTraffic = requests.filter((request) => (
                ['/plantings', '/harvests', '/activities']
                    .some((pathPart) => request.url.includes(`/api/v1${pathPart}`))
            ));
            assert.ok(analyticsTraffic.length >= 3);
            assert.ok(analyticsTraffic.every((request) => (
                new URL(request.url).origin === APP_URL
                && !request.headers.authorization
            )));
        });

        await test('/auth/me 503 preserves unknown state and never shows login', async () => {
            meFailure = '503';
            await page.reload({ waitUntil: 'networkidle0' });
            await page.waitForFunction(() => document.body.textContent.includes('temporarily unavailable'));
            assert.equal(await page.$('#username'), null);
            meFailure = null;
            await clickButton(page, 'Try again');
            await page.waitForFunction(() => (
                window.location.pathname === '/dashboard'
                && [...document.querySelectorAll('button')]
                    .some((button) => button.textContent.trim() === 'Logout')
            ));
        });

        await test('/auth/me network failure preserves unknown state', async () => {
            meFailure = 'network';
            await page.reload({ waitUntil: 'networkidle0' });
            await page.waitForFunction(() => document.body.textContent.includes('temporarily unavailable'));
            assert.equal(await page.$('#username'), null);
            meFailure = null;
            await clickButton(page, 'Try again');
            await page.waitForFunction(() => (
                window.location.pathname === '/dashboard'
                && [...document.querySelectorAll('button')]
                    .some((button) => button.textContent.trim() === 'Logout')
            ));
        });

        await test('logout network failure keeps authenticated state and server cookie', async () => {
            failLogout = true;
            await clickButton(page, 'Logout');
            await clickButton(page, 'Log out');
            await page.waitForFunction(() => !document.body.textContent.includes('Logging out...'));
            assert.equal(new URL(page.url()).pathname, '/dashboard');
            assert.ok((await page.cookies()).some((cookie) => cookie.name === AUTH_COOKIE));
            failLogout = false;
        });

        await test('successful logout clears frontend state and server cookie', async () => {
            await clickButton(page, 'Logout');
            await clickButton(page, 'Log out');
            await page.waitForFunction(() => window.location.pathname === '/', {
                timeout: 10_000,
            });
            await page.waitForSelector('#username');
            assert.ok(!(await page.cookies()).some((cookie) => cookie.name === AUTH_COOKIE));
        });

        await login(page);
        await test('revoked runtime session triggers controlled protected-API 401 logout', async () => {
            const cookie = (await page.cookies()).find((item) => item.name === AUTH_COOKIE);
            await db.query('UPDATE sessions SET is_active = 0 WHERE token_hash = ?', [
                sha256(cookie.value),
            ]);
            await page.evaluate(() => {
                const link = [...document.querySelectorAll('a')]
                    .find((candidate) => candidate.textContent.includes('Plantings'));
                link.click();
            });
            await page.waitForFunction(() => window.location.pathname === '/');
            await page.waitForSelector('#username');
        });

        await login(page);
        await test('expired cookie is rejected during bootstrap', async () => {
            const cookie = (await page.cookies()).find((item) => item.name === AUTH_COOKIE);
            await db.query(
                'UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE token_hash = ?',
                [sha256(cookie.value)]
            );
            await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle0' });
            await page.waitForSelector('#username');
            assert.equal(new URL(page.url()).pathname, '/');
        });

        await login(page);
        await test('invalid cookie is rejected during bootstrap', async () => {
            await page.setCookie({
                name: AUTH_COOKIE,
                value: crypto.randomBytes(32).toString('hex'),
                domain: 'localhost',
                path: '/',
                httpOnly: true,
            });
            await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle0' });
            await page.waitForSelector('#username');
            assert.equal(new URL(page.url()).pathname, '/');
        });

        await test('desktop and mobile route structure remains responsive', async () => {
            await login(page);
            await page.setViewport({ width: 1440, height: 900 });
            await page.reload({ waitUntil: 'networkidle0' });
            assert.ok(await page.$('aside.hidden.lg\\:flex'));

            await page.setViewport({ width: 390, height: 844 });
            await page.reload({ waitUntil: 'networkidle0' });
            assert.ok(await page.$('nav'));
            assert.ok(await page.$('aside.hidden.lg\\:flex'));
            assert.equal(new URL(page.url()).pathname, '/dashboard');
        });

        console.log(`PASS all requests used browser origin ${APP_URL}`);
        console.log(`PASS target database ${TEST_DB}`);
    } finally {
        await browser.close();
        await db.query(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = 'superadmin')"
        );
        await db.query('DELETE FROM token_blacklist');
        await db.end();
    }
})().catch((error) => {
    console.error('FAIL', error);
    process.exit(1);
});
