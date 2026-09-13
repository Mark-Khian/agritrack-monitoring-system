process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 6 browser tests outside crop_management_rearch_test');
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const mysql = require('../server/node_modules/mysql2/promise');
const puppeteer = require('../server/node_modules/puppeteer');

const ROOT = path.join(__dirname, '..');
const TEST_DB = 'crop_management_rearch_test';
const API_PORT = 5106;
const UI_PORT = 5176;
const APP_ORIGIN = `http://127.0.0.1:${UI_PORT}`;
const APP_URL = APP_ORIGIN;

const pinBrowserTestOrigin = () => {
    process.env.ALLOWED_ORIGIN = APP_ORIGIN;
    process.env.ALLOWED_ORIGINS = APP_ORIGIN;
};
pinBrowserTestOrigin();
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

const fillField = async (page, selector, value) => {
    await page.waitForSelector(selector, { visible: true });
    await page.focus(selector);
    await page.$eval(selector, (el, next) => {
        const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue('');
        if (setter) setter.call(el, next);
        else el.value = next;
        el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            composed: true,
            data: next,
            inputType: 'insertFromPaste',
        }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.waitForFunction(
        (sel, expected) => document.querySelector(sel)?.value === expected,
        {},
        selector,
        value
    );
};

const loginUi = async (page, account, destination) => {
    await page.evaluate(() => window.__closeAgriTrackEventSources?.()).catch(() => {});
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await fillField(page, '#username', account.username);
    await fillField(page, '#password', account.password);
    await page.waitForFunction(
        (user, pass) => (
            document.querySelector('#username')?.value === user
            && document.querySelector('#password')?.value === pass
        ),
        {},
        account.username,
        account.password
    );
    await clickMatching(page, 'form button[type="submit"]', 'Login', { exact: true });
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

const clickText = async (page, text) => {
    const handle = await page.waitForFunction((expected) => (
        [...document.querySelectorAll('button, a')]
            .find((candidate) => candidate.textContent.replace(/\s+/g, ' ').trim().includes(expected)) || null
    ), {}, text);
    const element = handle.asElement();
    if (!element) throw new Error(`Could not find clickable text: ${text}`);
    await element.click();
};

const clickMatching = async (page, selector, match, { exact = false } = {}) => {
    const handle = await page.waitForFunction((sel, expected, exactMatch) => (
        [...document.querySelectorAll(sel)].find((candidate) => {
            const label = candidate.textContent.replace(/\s+/g, ' ').trim();
            return exactMatch ? label === expected : label.includes(expected);
        }) || null
    ), {}, selector, match, exact);
    const element = handle.asElement();
    if (!element) throw new Error(`Could not find ${selector} matching ${match}`);
    await element.click();
};

const waitForText = (page, text) => page.waitForFunction(
    (expected) => document.body.textContent.includes(expected),
    {},
    text
);

const openSuitePage = async (context) => {
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
        const Original = window.EventSource;
        const registry = [];
        window.EventSource = class extends Original {
            constructor(url, configuration) {
                super(url, configuration);
                registry.push(this);
            }
        };
        window.__closeAgriTrackEventSources = () => {
            for (const source of registry.splice(0, registry.length)) {
                try { source.close(); } catch { /* already closed */ }
            }
        };
    });
    return page;
};

const gotoPath = async (page, target, expectedPath) => {
    const url = target.startsWith('http') ? target : `${APP_URL}${target}`;
    const targetPath = new URL(url).pathname;
    const expected = expectedPath || targetPath;
    let usedNav = false;
    if (page.url().startsWith(APP_ORIGIN) && targetPath === expected && !url.includes('?')) {
        const handle = await page.evaluateHandle((path) => (
            [...document.querySelectorAll('nav a')].find((anchor) => {
                try {
                    return new URL(anchor.getAttribute('href'), location.origin).pathname === path;
                } catch {
                    return false;
                }
            }) || null
        ), targetPath);
        const navLink = handle.asElement();
        if (navLink) {
            await navLink.click();
            usedNav = true;
        }
    }
    if (!usedNav) {
        await page.evaluate(() => window.__closeAgriTrackEventSources?.()).catch(() => {});
        await page.goto(url, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForFunction(
        (pathname) => window.location.pathname === pathname,
        { timeout: 20_000 },
        expected
    );
    assert.equal(new URL(page.url()).pathname, expected);
};

const createAccountUi = async (page, { name, username, role, password }) => {
    const chosenPassword = password || `p6_${username.slice(-12)}_ok`;
    await clickMatching(page, 'button[type="button"]', 'Create Account');
    const nameInput = await page.waitForSelector('#account-name', { visible: true });
    assert.ok(nameInput, 'Create Account modal did not expose #account-name');
    const box = await nameInput.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, '#account-name is not visible');
    await page.waitForSelector('form [aria-haspopup="listbox"]', { visible: true });
    await page.click('form [aria-haspopup="listbox"]');
    const roleLabel = role === 'FARM_WORKER' ? 'Farm Worker' : 'Secretary';
    await clickMatching(page, '[role="option"]', roleLabel, { exact: true });
    await fillField(page, '#account-name', name);
    await fillField(page, '#account-username', username);
    await fillField(page, '#account-create-password', chosenPassword);
    await fillField(page, '#account-create-confirm', chosenPassword);
    await page.click('form:has(#account-name) button[type="submit"]');
    await page.waitForSelector('#account-name', { hidden: true });
    await waitForText(page, username);
    const serializedStorage = JSON.stringify(await storageSnapshot(page));
    assert.equal(serializedStorage.includes(chosenPassword), false);
    assert.equal(
        [...await page.$$eval('h2, h3', (elements) => elements.map((element) => element.textContent.trim()))]
            .includes('One-Time Credentials'),
        false
    );
    return chosenPassword;
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

        pinBrowserTestOrigin();
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
        pinBrowserTestOrigin();
        await waitForHttp(APP_URL);

        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agritrack-p6-'));
        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            userDataDir,
            args: [
                '--no-sandbox',
                '--disable-save-password-bubble',
                '--disable-features=PasswordGeneration,PasswordManagerOnboarding,AutofillServerCommunication',
            ],
        });

        const adminContext = await browser.createBrowserContext();
        contexts.push(adminContext);
        const adminPage = await openSuitePage(adminContext);
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
        fixtures.secretary.password = await createAccountUi(adminPage, {
            ...fixtures.secretary,
            password: FINAL_PASSWORD,
        });
        fixtures.worker.password = `p6_${PREFIX.slice(-8)}_wrk`;
        const workerCreation = await adminPage.evaluate(async (fixture) => {
            const response = await fetch('/api/v1/users', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: fixture.name,
                    username: fixture.username,
                    role: fixture.role,
                    password: fixture.password,
                    confirmPassword: fixture.password,
                }),
            });
            return {
                status: response.status,
                cacheControl: response.headers.get('cache-control'),
                body: await response.json(),
            };
        }, fixtures.worker);
        assert.equal(workerCreation.status, 201);
        assert.match(workerCreation.cacheControl || '', /no-store/i);
        assert.equal(workerCreation.body.temporaryPassword, undefined);
        assert.equal(
            JSON.stringify(await storageSnapshot(adminPage)).includes(fixtures.worker.password),
            false
        );
        await gotoPath(adminPage, `/accounts?refresh=${Date.now()}`, '/accounts');
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
            const page = await openSuitePage(context);
            await loginUi(page, fixture, '/dashboard');

            await gotoPath(page, '/accounts', '/dashboard');
            const forbiddenBoundary = await page.evaluate(async () => {
                const response = await fetch('/api/v1/users', {
                    credentials: 'include',
                    headers: { 'X-Role': 'ADMIN' },
                });
                return { status: response.status, body: await response.json() };
            });
            assert.equal(forbiddenBoundary.status, 403);
            assert.notEqual(forbiddenBoundary.body.code, 'PASSWORD_CHANGE_REQUIRED');

            const stored = JSON.stringify(await storageSnapshot(page));
            assert.equal(stored.includes(fixture.password), false);
            for (const key of ['token', 'refreshToken', 'user']) {
                assert.equal((await storageSnapshot(page)).local[key], undefined);
                assert.equal((await storageSnapshot(page)).session[key], undefined);
            }

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
            await gotoPath(page, '/accounts', '/dashboard');
            const links = await page.$$eval(
                'nav a',
                (items) => items.map((item) => item.textContent.trim())
            );
            assert.equal(links.includes('Accounts'), false);
        }

        await gotoPath(adminPage, '/accounts');
        await waitForText(adminPage, fixtures.worker.username);
        const workerDisable = await adminPage.evaluate(async (username) => {
            const list = await fetch('/api/v1/users', { credentials: 'include' });
            const body = await list.json();
            const target = (body.users || []).find((user) => user.username === username);
            if (!target) return { status: 404 };
            const response = await fetch(`/api/v1/users/${target.id}/disable`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            return { status: response.status };
        }, fixtures.worker.username);
        assert.equal(workerDisable.status, 200);
        await gotoPath(adminPage, `/accounts?refresh=${Date.now()}`, '/accounts');
        await waitForText(adminPage, fixtures.worker.username);
        await waitForText(adminPage, 'Reactivate');
        const deleteClicked = await adminPage.evaluate((username) => {
            const button = [...document.querySelectorAll('button')].find((candidate) => (
                candidate.getAttribute('aria-label') === `Delete ${username}`
                || candidate.getAttribute('title') === 'Delete account'
            ));
            if (!button) return false;
            button.click();
            return true;
        }, fixtures.worker.username);
        assert.equal(deleteClicked, true, 'Delete action was not available for disabled account');
        await adminPage.waitForFunction(() => (
            [...document.querySelectorAll('button')]
                .some((button) => button.textContent.trim() === 'Delete Account')
        ));
        await clickMatching(adminPage, 'button', 'Delete Account', { exact: true });
        await adminPage.waitForFunction(
            (username) => !document.body.textContent.includes(username),
            { timeout: 20_000 },
            fixtures.worker.username
        );
        const [[archivedRow]] = await db.query(
            'SELECT archived_at, is_active FROM users WHERE username = ?',
            [fixtures.worker.username]
        );
        assert.ok(archivedRow.archived_at);
        assert.equal(archivedRow.is_active, 0);

        console.log('PASS Admin Accounts navigation and API-backed account creation');
        console.log('PASS Admin-chosen passwords stay out of browser storage');
        console.log('PASS Secretary/Worker login immediately without forced password change');
        console.log('PASS subordinate Accounts guards remain 403');
        console.log('PASS disabled account Delete soft-archives and leaves the list');
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
