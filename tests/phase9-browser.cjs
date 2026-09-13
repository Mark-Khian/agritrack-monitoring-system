process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';

const path = require('node:path');
require('../server/node_modules/dotenv').config({
    path: path.join(__dirname, '..', 'server', '.env'),
    quiet: true,
});

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 9 browser tests outside crop_management_rearch_test');
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const mysql = require('../server/node_modules/mysql2/promise');
const puppeteer = require('../server/node_modules/puppeteer');

const ROOT = path.join(__dirname, '..');
const TEST_DB = 'crop_management_rearch_test';
const API_PORT = 5109;
const UI_PORT = 5179;
const APP_ORIGIN = `http://127.0.0.1:${UI_PORT}`;
const APP_URL = APP_ORIGIN;

const pinBrowserTestOrigin = () => {
    process.env.ALLOWED_ORIGIN = APP_ORIGIN;
    process.env.ALLOWED_ORIGINS = APP_ORIGIN;
};
pinBrowserTestOrigin();
const PREFIX = `phase9_${process.pid}_`;
const STAMP = Date.now();
const TEST_ADMIN = {
    username: process.env.TEST_ADMIN_USERNAME || 'superadmin',
    password: process.env.TEST_ADMIN_PASSWORD || 'admin1234',
};
const SECRETARY_PASSWORD = 'Phase9-Sec-Final!42';
const WORKER_PASSWORD = 'Phase9-Wrk-Final!42';
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

const logoutUi = async (page) => {
    await page.evaluate(() => window.__closeAgriTrackEventSources?.()).catch(() => {});
    await clickText(page, 'Logout');
    await page.waitForFunction(() => (
        [...document.querySelectorAll('button')]
            .some((button) => button.textContent.trim() === 'Log out')
    ));
    await page.evaluate(() => {
        const confirm = [...document.querySelectorAll('button')]
            .find((button) => button.textContent.trim() === 'Log out');
        if (!confirm) throw new Error('Logout confirm button missing');
        confirm.click();
    });
    await page.waitForFunction(() => window.location.pathname === '/', { timeout: 20_000 });
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

const navTexts = (page) => page.$$eval(
    'nav a',
    (links) => links.map((link) => link.textContent.trim())
);

const buttonTexts = (page) => page.evaluate(() => (
    [...document.querySelectorAll('button')].map((button) => button.textContent.trim()).filter(Boolean)
));

const createAccountUi = async (page, { name, username, role, password }) => {
    const chosenPassword = password || `p9_${username.slice(-8)}_ok`;
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
    return chosenPassword;
};

const changePasswordUi = async (page, currentPassword, newPassword) => {
    await page.waitForSelector('#current-password');
    await page.type('#current-password', currentPassword);
    await page.type('#new-password', newPassword);
    await page.type('#confirm-password', newPassword);
    await page.evaluate(() => document.querySelector('#current-password').closest('form').requestSubmit());
    await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 20_000 });
};

const apiFromPage = (page, urlPath, options = {}) => page.evaluate(async (target, init) => {
    const response = await fetch(target, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        ...init,
        body: init.body ? JSON.stringify(init.body) : undefined,
    });
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    return { status: response.status, body };
}, urlPath, options);

const collectApiPaths = (requests) => requests
    .map((entry) => {
        try {
            return new URL(entry.url).pathname;
        } catch {
            return '';
        }
    })
    .filter((pathname) => pathname.startsWith('/api/'));

(async () => {
    let db;
    let apiServer;
    let vite;
    let browser;
    const contexts = [];
    const fixtureIds = [];
    const plantingIds = [];
    const noteIds = [];

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
            [TEST_ADMIN.username]
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
            server: { host: '127.0.0.1', port: UI_PORT, strictPort: true },
        });
        await vite.listen();
        pinBrowserTestOrigin();
        await waitForHttp(APP_URL);

        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agritrack-p9-'));
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

        const fixtures = {
            secretary: {
                name: 'Phase 9 Browser Secretary',
                username: `${PREFIX}${STAMP}_secretary`,
                role: 'SECRETARY',
            },
            worker: {
                name: 'Phase 9 Browser Worker',
                username: `${PREFIX}${STAMP}_worker`,
                role: 'FARM_WORKER',
            },
        };

        const adminContext = await browser.createBrowserContext();
        contexts.push(adminContext);
        const adminPage = await openSuitePage(adminContext);
        const adminRequests = [];
        adminPage.on('request', (request) => adminRequests.push({
            method: request.method(),
            url: request.url(),
        }));
        await loginUi(adminPage, TEST_ADMIN, '/dashboard');
        await adminPage.waitForSelector('nav');
        const adminLinks = await navTexts(adminPage);
        assert.ok(adminLinks.includes('Accounts'));
        assert.ok(adminLinks.includes('Audit Log'));
        assert.ok(adminLinks.includes('Harvests'));
        assert.ok(adminLinks.includes('Analytics'));
        assert.ok(
            collectApiPaths(adminRequests).some((pathname) => pathname.startsWith('/api/v1/harvests')),
            'Admin dashboard must request harvests'
        );

        await clickText(adminPage, 'Accounts');
        await adminPage.waitForFunction(() => window.location.pathname === '/accounts');
        await waitForText(adminPage, 'Manage Secretary and Farm Worker access');
        fixtures.secretary.password = await createAccountUi(adminPage, {
            ...fixtures.secretary,
            password: SECRETARY_PASSWORD,
        });
        const workerCreation = await apiFromPage(adminPage, '/api/v1/users', {
            method: 'POST',
            body: {
                name: fixtures.worker.name,
                username: fixtures.worker.username,
                role: fixtures.worker.role,
                password: WORKER_PASSWORD,
                confirmPassword: WORKER_PASSWORD,
            },
        });
        assert.equal(workerCreation.status, 201);
        fixtures.worker.password = WORKER_PASSWORD;
        assert.equal(workerCreation.body.temporaryPassword, undefined);
        assert.equal(
            JSON.stringify(await storageSnapshot(adminPage)).includes(WORKER_PASSWORD),
            false
        );

        const fieldName = `${PREFIX}${STAMP}_field`;
        const planting = await apiFromPage(adminPage, '/api/v1/plantings', {
            method: 'POST',
            body: {
                field_name: fieldName,
                variety_class: 'Irrigated / Lowland Varieties',
                variety: 'NSIC Rc110',
                planting_date: '2026-01-10',
                cropping_season: 'DRY_SEASON',
                establishment_method: 'TRANSPLANTED',
                field_condition: 'IRRIGATED',
                lifecycle_state: 'ACTIVE',
                status: 'active',
            },
        });
        assert.equal(planting.status, 201);
        plantingIds.push(planting.body.plantingId);
        const activity = await apiFromPage(adminPage, '/api/v1/activities', {
            method: 'POST',
            body: {
                planting_id: planting.body.plantingId,
                activity_type: 'weeding',
                planned_date: '2026-08-02',
                notes: `${PREFIX}activity`,
            },
        });
        assert.equal(activity.status, 201);
        const harvest = await apiFromPage(adminPage, '/api/v1/harvests', {
            method: 'POST',
            body: {
                planting_id: planting.body.plantingId,
                harvest_date: '2026-09-01',
                yield_kg: 180,
                quality_grade: 'A',
                remarks: `${PREFIX}harvest`,
                financial_value: 3600,
            },
        });
        assert.equal(harvest.status, 201);
        const adminNote = await apiFromPage(adminPage, '/api/v1/notes', {
            method: 'POST',
            body: { title: `${PREFIX}admin-note`, note_date: '2026-09-11', description: 'phase9' },
        });
        assert.equal(adminNote.status, 201);
        noteIds.push(adminNote.body.data.id);

        for (const route of ['/plantings', '/activities', '/harvests', '/calendar', '/analytics', '/audit']) {
            await gotoPath(adminPage, route);
        }
        await waitForText(adminPage, 'Audit Log');
        const weatherStatus = await apiFromPage(adminPage, '/api/v1/weather');
        assert.ok([200, 400].includes(weatherStatus.status));
        await logoutUi(adminPage);

        const secretaryContext = await browser.createBrowserContext();
        contexts.push(secretaryContext);
        const secretaryPage = await openSuitePage(secretaryContext);
        await loginUi(secretaryPage, {
            username: fixtures.secretary.username,
            password: SECRETARY_PASSWORD,
        }, '/dashboard');
        for (const blocked of ['/accounts', '/audit']) {
            await gotoPath(secretaryPage, blocked, '/dashboard');
        }
        await gotoPath(secretaryPage, '/plantings');
        await secretaryPage.waitForSelector('nav');
        const secretaryLinks = await navTexts(secretaryPage);
        assert.equal(secretaryLinks.includes('Accounts'), false);
        assert.equal(secretaryLinks.includes('Audit Log'), false);
        assert.ok(secretaryLinks.includes('Harvests'));
        assert.ok(secretaryLinks.includes('Analytics'));

        await gotoPath(secretaryPage, '/plantings');
        let buttons = await buttonTexts(secretaryPage);
        assert.ok(buttons.includes('Add Planting'));
        assert.ok(buttons.includes('Export Report'));
        assert.equal((await secretaryPage.$$('[title="Delete planting"]')).length, 0);

        await gotoPath(secretaryPage, '/harvests');
        buttons = await buttonTexts(secretaryPage);
        assert.ok(buttons.includes('Record Harvest'));
        assert.ok(buttons.includes('Export Report'));
        assert.equal((await secretaryPage.$$('[title="Delete harvest"]')).length, 0);

        const secretaryField = `${PREFIX}${STAMP}_sec_field`;
        const secretaryPlanting = await apiFromPage(secretaryPage, '/api/v1/plantings', {
            method: 'POST',
            body: {
                field_name: secretaryField,
                variety_class: 'Irrigated / Lowland Varieties',
                variety: 'NSIC Rc110',
                planting_date: '2026-01-10',
                cropping_season: 'DRY_SEASON',
                establishment_method: 'TRANSPLANTED',
                field_condition: 'IRRIGATED',
                lifecycle_state: 'ACTIVE',
                status: 'active',
            },
        });
        assert.equal(secretaryPlanting.status, 201);
        plantingIds.push(secretaryPlanting.body.plantingId);
        const secretaryActivity = await apiFromPage(secretaryPage, '/api/v1/activities', {
            method: 'POST',
            body: {
                planting_id: secretaryPlanting.body.plantingId,
                activity_type: 'weeding',
                planned_date: '2026-08-05',
                notes: `${PREFIX}sec-activity`,
            },
        });
        assert.equal(secretaryActivity.status, 201);
        const skipped = await apiFromPage(secretaryPage, `/api/v1/activities/${secretaryActivity.body.activityId}`, {
            method: 'PUT',
            body: { status: 'SKIPPED' },
        });
        assert.equal(skipped.status, 200);
        const secretaryHarvest = await apiFromPage(secretaryPage, '/api/v1/harvests', {
            method: 'POST',
            body: {
                planting_id: secretaryPlanting.body.plantingId,
                harvest_date: '2026-09-01',
                yield_kg: 190,
                quality_grade: 'B',
                remarks: `${PREFIX}sec-harvest`,
            },
        });
        assert.equal(secretaryHarvest.status, 201);
        const progressPlanting = await apiFromPage(secretaryPage, '/api/v1/plantings', {
            method: 'POST',
            body: {
                field_name: `${PREFIX}${STAMP}_wrk_field`,
                variety_class: 'Irrigated / Lowland Varieties',
                variety: 'NSIC Rc110',
                planting_date: '2026-01-10',
                cropping_season: 'DRY_SEASON',
                establishment_method: 'TRANSPLANTED',
                field_condition: 'IRRIGATED',
                lifecycle_state: 'ACTIVE',
                status: 'active',
            },
        });
        assert.equal(progressPlanting.status, 201);
        plantingIds.push(progressPlanting.body.plantingId);
        const progressActivity = await apiFromPage(secretaryPage, '/api/v1/activities', {
            method: 'POST',
            body: {
                planting_id: progressPlanting.body.plantingId,
                activity_type: 'weeding',
                planned_date: '2026-08-12',
                notes: `${PREFIX}worker-progress`,
            },
        });
        assert.equal(progressActivity.status, 201);
        const secretaryNote = await apiFromPage(secretaryPage, '/api/v1/notes', {
            method: 'POST',
            body: { title: `${PREFIX}sec-note`, note_date: '2026-09-11' },
        });
        assert.equal(secretaryNote.status, 201);
        noteIds.push(secretaryNote.body.data.id);

        await gotoPath(secretaryPage, '/calendar');
        await gotoPath(secretaryPage, '/analytics');
        await gotoPath(secretaryPage, '/accounts', '/dashboard');
        await gotoPath(secretaryPage, '/audit', '/dashboard');

        const secretaryForbidden = await secretaryPage.evaluate(async () => {
            const users = await fetch('/api/v1/users', { credentials: 'include' });
            const audit = await fetch('/api/v1/audit', { credentials: 'include' });
            const backups = await fetch('/api/v1/backups', { credentials: 'include' });
            return { users: users.status, audit: audit.status, backups: backups.status };
        });
        assert.deepEqual(secretaryForbidden, { users: 403, audit: 403, backups: 403 });
        await logoutUi(secretaryPage);

        const workerContext = await browser.createBrowserContext();
        contexts.push(workerContext);
        const workerPage = await openSuitePage(workerContext);
        const workerRequests = [];
        workerPage.on('request', (request) => workerRequests.push({
            method: request.method(),
            url: request.url(),
        }));
        await loginUi(workerPage, {
            username: fixtures.worker.username,
            password: WORKER_PASSWORD,
        }, '/dashboard');
        await workerPage.waitForSelector('nav');
        const workerLinks = await navTexts(workerPage);
        assert.equal(workerLinks.includes('Harvests'), false);
        assert.equal(workerLinks.includes('Analytics'), false);
        assert.equal(workerLinks.includes('Accounts'), false);
        assert.equal(workerLinks.includes('Audit Log'), false);
        assert.ok(
            !collectApiPaths(workerRequests).some((pathname) => pathname.startsWith('/api/v1/harvests')),
            'Worker dashboard must not request harvests'
        );

        await gotoPath(workerPage, '/plantings');
        await waitForText(workerPage, 'Current');
        buttons = await buttonTexts(workerPage);
        assert.ok(!buttons.includes('Add Planting'));
        assert.ok(buttons.includes('Current'));
        await gotoPath(workerPage, '/calendar');
        const addNote = await workerPage.$$('[title="Add Note"]');
        assert.equal(addNote.length, 0);
        await gotoPath(workerPage, '/harvests', '/dashboard');
        await gotoPath(workerPage, '/analytics', '/dashboard');
        await gotoPath(workerPage, '/accounts', '/dashboard');
        await gotoPath(workerPage, '/audit', '/dashboard');

        const workerApi = await workerPage.evaluate(async () => {
            const harvests = await fetch('/api/v1/harvests', { credentials: 'include' });
            const plantingCreate = await fetch('/api/v1/plantings', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-Role': 'ADMIN' },
                body: JSON.stringify({ role: 'ADMIN', field_name: 'nope' }),
            });
            const notesGet = await fetch('/api/v1/notes', { credentials: 'include' });
            const notesPost = await fetch('/api/v1/notes', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'worker-forbidden', note_date: '2026-09-11' }),
            });
            const weather = await fetch('/api/v1/weather', { credentials: 'include' });
            return {
                harvests: harvests.status,
                plantingCreate: plantingCreate.status,
                notesGet: notesGet.status,
                notesPost: notesPost.status,
                weather: weather.status,
            };
        });
        assert.equal(workerApi.harvests, 403);
        assert.equal(workerApi.plantingCreate, 403);
        assert.equal(workerApi.notesGet, 200);
        assert.equal(workerApi.notesPost, 403);
        assert.ok([200, 400].includes(workerApi.weather));
        const progress = await apiFromPage(workerPage, `/api/v1/activities/${progressActivity.body.activityId}/progress`, {
            method: 'PATCH',
            body: { status: 'COMPLETED', actual_date: '2026-08-13' },
        });
        assert.equal(progress.status, 200);
        await logoutUi(workerPage);

        const [created] = await db.query(
            'SELECT id FROM users WHERE username IN (?, ?)',
            [fixtures.secretary.username, fixtures.worker.username]
        );
        fixtureIds.push(...created.map((row) => row.id));

        console.log('PASS Admin journey: login, crop writes, page coverage, audit, logout');
        console.log('PASS Secretary forced-change then authorized work; accounts/audit blocked');
        console.log('PASS Worker forced-change, restricted nav, no harvest requests, logout');
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
            const [users] = await db.query(
                'SELECT id FROM users WHERE email LIKE ? OR username LIKE ?',
                [`${PREFIX}%`, `${PREFIX}%`]
            );
            const userIds = [...new Set([...fixtureIds, ...users.map((row) => row.id)])];
            const [plantings] = await db.query(
                'SELECT id FROM plantings WHERE field_name LIKE ?',
                [`${PREFIX}%`]
            );
            const allPlantingIds = [...new Set([...plantingIds, ...plantings.map((row) => row.id)])];
            let activityIds = [];
            let harvestIds = [];
            if (allPlantingIds.length) {
                const plantingPlaceholders = allPlantingIds.map(() => '?').join(',');
                const [activities] = await db.query(
                    `SELECT id FROM activities WHERE planting_id IN (${plantingPlaceholders})`,
                    allPlantingIds
                );
                activityIds = activities.map((row) => row.id);
                const [harvests] = await db.query(
                    `SELECT id FROM harvests WHERE planting_id IN (${plantingPlaceholders})`,
                    allPlantingIds
                );
                harvestIds = harvests.map((row) => row.id);
                if (activityIds.length) {
                    const activityPlaceholders = activityIds.map(() => '?').join(',');
                    await db.query(
                        `DELETE FROM notifications WHERE related_id IN (${activityPlaceholders})`,
                        activityIds
                    );
                    await db.query(`DELETE FROM activities WHERE id IN (${activityPlaceholders})`, activityIds);
                }
                if (harvestIds.length) {
                    await db.query(
                        `DELETE FROM harvests WHERE id IN (${harvestIds.map(() => '?').join(',')})`,
                        harvestIds
                    );
                }
                await db.query(`DELETE FROM plantings WHERE id IN (${plantingPlaceholders})`, allPlantingIds);
            }
            if (noteIds.length) {
                await db.query(
                    `DELETE FROM notes WHERE id IN (${noteIds.map(() => '?').join(',')})`,
                    noteIds
                );
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
                const auditClauses = [
                    `user_id IN (${userPlaceholders})`,
                    `(entity = 'users' AND entity_id IN (${userPlaceholders}))`,
                ];
                const auditParams = [...userIds, ...userIds];
                if (allPlantingIds.length) {
                    auditClauses.push(`(entity = 'plantings' AND entity_id IN (${allPlantingIds.map(() => '?').join(',')}))`);
                    auditParams.push(...allPlantingIds);
                }
                if (activityIds.length) {
                    auditClauses.push(`(entity = 'activities' AND entity_id IN (${activityIds.map(() => '?').join(',')}))`);
                    auditParams.push(...activityIds);
                }
                if (harvestIds.length) {
                    auditClauses.push(`(entity = 'harvests' AND entity_id IN (${harvestIds.map(() => '?').join(',')}))`);
                    auditParams.push(...harvestIds);
                }
                if (noteIds.length) {
                    auditClauses.push(`(entity = 'notes' AND entity_id IN (${noteIds.map(() => '?').join(',')}))`);
                    auditParams.push(...noteIds);
                }
                await db.query(`DELETE FROM activity_logs WHERE ${auditClauses.join(' OR ')}`, auditParams);
                await db.query(`DELETE FROM users WHERE id IN (${userPlaceholders})`, userIds);
            }
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
