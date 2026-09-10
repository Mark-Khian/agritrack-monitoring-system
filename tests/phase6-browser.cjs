process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://127.0.0.1:5176';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 6 browser tests outside crop_management_rearch_test');
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const mysql = require('../server/node_modules/mysql2/promise');
const puppeteer = require('../server/node_modules/puppeteer');

const ROOT = path.join(__dirname, '..');
const TEST_DB = 'crop_management_rearch_test';
const API_PORT = 5106;
const UI_PORT = 5176;
const APP_URL = `http://127.0.0.1:${UI_PORT}`;
const PREFIX = `phase6_browser_${Date.now()}_${process.pid}`;
const ADMIN = { username: 'superadmin', password: 'admin1234' };
const FINAL_PASSWORD = 'Phase6-Browser-Final!42';
const executablePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const waitForHttp = async (url) => {
    let lastError;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw lastError || new Error(`Timed out waiting for ${url}`);
};

const loginUi = async (page, account, destination) => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#username');
    await page.type('#username', account.username);
    await page.type('#password', account.password);
    await page.evaluate(() => {
        [...document.querySelectorAll('button')]
            .find((button) => button.textContent.trim() === 'Login')
            .click();
    });
    await page.waitForFunction(
        (pathname) => window.location.pathname === pathname,
        { timeout: 20_000 },
        destination
    );
};

const storageSnapshot = (page) => page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
}));

const clickText = (page, text) => page.evaluate((expected) => {
    const element = [...document.querySelectorAll('button, a')]
        .find((candidate) => candidate.textContent.replace(/\s+/g, ' ').trim().includes(expected));
    if (!element) throw new Error(`Could not find clickable text: ${expected}`);
    element.click();
}, text);

const waitForText = (page, text) => page.waitForFunction(
    (expected) => document.body.textContent.includes(expected),
    {},
    text
);

const createAccountUi = async (page, { name, username, role }) => {
    await clickText(page, 'Create Account');
    await page.waitForSelector('#account-name', { visible: true });
    await page.waitForSelector('form [aria-haspopup="listbox"]', { visible: true });
    await page.click('form [aria-haspopup="listbox"]');
    const roleLabel = role === 'FARM_WORKER' ? 'Farm Worker' : 'Secretary';
    await page.waitForSelector('[role="listbox"]');
    await page.evaluate((expected) => {
        const option = [...document.querySelectorAll('[role="option"]')]
            .find((candidate) => candidate.textContent.trim() === expected);
        if (!option) throw new Error(`Could not find role option: ${expected}`);
        option.click();
    }, roleLabel);
    await page.type('#account-name', name);
    await page.type('#account-username', username);
    await page.evaluate(() => document.querySelector('#account-name').closest('form').requestSubmit());
    await page.waitForFunction(() => (
        [...document.querySelectorAll('h2, h3')]
            .some((element) => element.textContent.trim() === 'One-Time Credentials')
    ));
    const codes = await page.$$eval('code', (elements) => elements.map((element) => element.textContent));
    assert.equal(codes[0], username);
    assert.equal(typeof codes[1], 'string');
    assert.ok(codes[1].length >= 12);
    const temporaryPassword = codes[1];
    const serializedStorage = JSON.stringify(await storageSnapshot(page));
    assert.equal(serializedStorage.includes(temporaryPassword), false);
    await clickText(page, 'I have saved these credentials');
    await page.waitForFunction(
        (secret) => !document.body.textContent.includes(secret),
        {},
        temporaryPassword
    );
    await page.waitForSelector('#account-name', { hidden: true });
    assert.equal(JSON.stringify(await storageSnapshot(page)).includes(temporaryPassword), false);
    return temporaryPassword;
};

(async () => {
    let db;
    let apiServer;
    let vite;
    let browser;
    const contexts = [];
    const fixtureIds = [];

    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || '',
            database: TEST_DB,
        });
        const [[database]] = await db.query('SELECT DATABASE() AS name');
        assert.equal(database.name, TEST_DB);
        const [adminRows] = await db.query(
            "SELECT id FROM users WHERE email = ? AND role = 'admin' LIMIT 1",
            [ADMIN.username]
        );
        assert.equal(adminRows.length, 1, 'test admin missing; run the test DB setup first');

        const app = require('../server/app');
        apiServer = http.createServer(app);
        await new Promise((resolve, reject) => {
            apiServer.once('error', reject);
            apiServer.listen(API_PORT, '127.0.0.1', resolve);
        });

        process.env.VITE_API_PROXY_TARGET = `http://127.0.0.1:${API_PORT}`;
        const { createServer } = await import('../node_modules/vite/dist/node/index.js');
        vite = await createServer({
            configFile: path.join(ROOT, 'vite.config.js'),
            mode: 'phase6',
            server: { host: '127.0.0.1', port: UI_PORT, strictPort: true },
        });
        await vite.listen();
        await waitForHttp(APP_URL);

        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            args: ['--no-sandbox'],
        });

        const adminContext = await browser.createBrowserContext();
        contexts.push(adminContext);
        const adminPage = await adminContext.newPage();
        await adminPage.setViewport({ width: 1440, height: 900 });
        await loginUi(adminPage, ADMIN, '/dashboard');
        await adminPage.waitForSelector('nav');
        const adminLinks = await adminPage.$$eval(
            'nav a',
            (links) => links.map((link) => link.textContent.trim())
        );
        assert.ok(adminLinks.includes('Accounts'));
        await clickText(adminPage, 'Accounts');
        await adminPage.waitForFunction(() => window.location.pathname === '/accounts');
        await waitForText(adminPage, 'Manage Secretary and Farm Worker access');

        const fixtures = {
            secretary: {
                name: 'Phase 6 Browser Secretary',
                username: `${PREFIX}_secretary`,
                role: 'SECRETARY',
            },
            worker: {
                name: 'Phase 6 Browser Worker',
                username: `${PREFIX}_worker`,
                role: 'FARM_WORKER',
            },
        };
        fixtures.secretary.password = await createAccountUi(adminPage, fixtures.secretary);
        const workerCreation = await adminPage.evaluate(async (fixture) => {
            const response = await fetch('/api/v1/users', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fixture),
            });
            return {
                status: response.status,
                cacheControl: response.headers.get('cache-control'),
                body: await response.json(),
            };
        }, fixtures.worker);
        assert.equal(workerCreation.status, 201);
        assert.match(workerCreation.cacheControl || '', /no-store/i);
        fixtures.worker.password = workerCreation.body.temporaryPassword;
        assert.equal(
            JSON.stringify(await storageSnapshot(adminPage)).includes(fixtures.worker.password),
            false
        );
        await adminPage.goto(`${APP_URL}/accounts?refresh=${Date.now()}`, {
            waitUntil: 'networkidle0',
        });
        assert.equal(new URL(adminPage.url()).pathname, '/accounts');
        await waitForText(adminPage, fixtures.worker.username);

        const [created] = await db.query(
            'SELECT id, username FROM users WHERE username IN (?, ?)',
            [fixtures.secretary.username, fixtures.worker.username]
        );
        assert.equal(created.length, 2);
        fixtureIds.push(...created.map((row) => row.id));

        for (const roleName of ['secretary', 'worker']) {
            const fixture = fixtures[roleName];
            const context = await browser.createBrowserContext();
            contexts.push(context);
            const page = await context.newPage();
            await page.setViewport({ width: 1440, height: 900 });
            await loginUi(page, fixture, '/change-password');
            await waitForText(page, 'Secure your account');

            await page.goto(`${APP_URL}/accounts`, { waitUntil: 'networkidle0' });
            assert.equal(new URL(page.url()).pathname, '/change-password');
            const forcedBoundary = await page.evaluate(async () => {
                const response = await fetch('/api/v1/users', {
                    credentials: 'include',
                    headers: { 'X-Role': 'ADMIN' },
                });
                return { status: response.status, body: await response.json() };
            });
            assert.equal(forcedBoundary.status, 403);
            assert.equal(forcedBoundary.body.code, 'PASSWORD_CHANGE_REQUIRED');

            const stored = JSON.stringify(await storageSnapshot(page));
            assert.equal(stored.includes(fixture.password), false);
            for (const key of ['token', 'refreshToken', 'user']) {
                assert.equal((await storageSnapshot(page)).local[key], undefined);
                assert.equal((await storageSnapshot(page)).session[key], undefined);
            }

            await page.type('#current-password', fixture.password);
            await page.type('#new-password', FINAL_PASSWORD);
            await page.type('#confirm-password', FINAL_PASSWORD);
            await clickText(page, 'Change password');
            await page.waitForFunction(
                () => window.location.pathname === '/dashboard',
                { timeout: 15_000 }
            );
            const retention = await page.evaluate(async () => {
                const forbidden = await fetch('/api/v1/users?role=ADMIN&user_id=1', {
                    credentials: 'include',
                    headers: { 'X-Role': 'ADMIN' },
                });
                const me = await fetch('/api/v1/auth/me', { credentials: 'include' });
                return {
                    forbidden: forbidden.status,
                    me: me.status,
                    role: (await me.json()).role,
                };
            });
            assert.deepEqual(retention, {
                forbidden: 403,
                me: 200,
                role: fixture.role,
            });
            await page.goto(`${APP_URL}/accounts`, { waitUntil: 'networkidle0' });
            assert.equal(new URL(page.url()).pathname, '/dashboard');
            const links = await page.$$eval(
                'nav a',
                (items) => items.map((item) => item.textContent.trim())
            );
            assert.equal(links.includes('Accounts'), false);
        }

        console.log('PASS Admin Accounts navigation and API-backed account creation');
        console.log('PASS one-time credential modal stays out of browser storage');
        console.log('PASS Secretary/Worker forced-change and direct Accounts guards');
        console.log('PASS successful forced change and 403 session retention');
    } finally {
        for (const context of contexts.reverse()) {
            await context.close().catch(() => {});
        }
        if (browser) await browser.close().catch(() => {});
        if (vite) await vite.close().catch(() => {});
        if (apiServer) {
            await new Promise((resolve) => {
                apiServer.close(resolve);
                apiServer.closeAllConnections?.();
            });
        }
        if (db) {
            let ids = fixtureIds;
            if (!ids.length) {
                const [rows] = await db.query('SELECT id FROM users WHERE username LIKE ?', [`${PREFIX}%`]);
                ids = rows.map((row) => row.id);
            }
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
        }
    }
})().then(
    () => process.exit(0),
    (error) => {
        console.error(error);
        process.exit(1);
    }
);
