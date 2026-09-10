const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('../server/node_modules/bcryptjs');
const mysql = require('../server/node_modules/mysql2/promise');
const puppeteer = require('../server/node_modules/puppeteer');
const dotenv = require('../server/node_modules/dotenv');

dotenv.config({
    path: path.join(__dirname, '..', 'server', '.env'),
    quiet: true,
});

const APP_URL = 'http://localhost:5173';
const TEST_DB = 'crop_management_rearch_test';
const PASSWORD = 'Phase5-Browser-Only!42';
const PREFIX = `phase5_browser_${Date.now()}`;
const accounts = {
    secretary: { username: `${PREFIX}_secretary@test.invalid`, password: PASSWORD },
    worker: { username: `${PREFIX}_worker@test.invalid`, password: PASSWORD },
};
const executablePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const buttonTexts = (page) => page.evaluate(() => (
    [...document.querySelectorAll('button')].map((button) => button.textContent.trim()).filter(Boolean)
));

const linkTexts = (page) => page.evaluate(() => (
    [...document.querySelectorAll('a')].map((link) => link.textContent.trim()).filter(Boolean)
));

const login = async (page, account) => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#username');
    await page.type('#username', account.username);
    await page.type('#password', account.password);
    await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')]
            .find((candidate) => candidate.textContent.trim() === 'Login');
        button.click();
    });
    await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 15_000 });
    await page.waitForSelector('nav');
};

const openRolePage = async (browser, account) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const requests = [];
    page.on('request', (request) => requests.push({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
    }));
    await login(page, account);
    return { context, page, requests };
};

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: TEST_DB,
    });
    const [[database]] = await db.query('SELECT DATABASE() AS name');
    assert.equal(database.name, TEST_DB);

    const hash = await bcrypt.hash(PASSWORD, 12);
    const [insert] = await db.query(
        `INSERT INTO users (name, email, password, role, is_active, status)
         VALUES
           ('Phase 5 Browser Secretary', ?, ?, 'SECRETARY', 1, 'ACTIVE'),
           ('Phase 5 Browser Worker', ?, ?, 'FARM_WORKER', 1, 'ACTIVE')`,
        [accounts.secretary.username, hash, accounts.worker.username, hash]
    );
    const userIds = [insert.insertId, insert.insertId + 1];

    let browser;
    let secretaryContext;
    let workerContext;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            args: ['--no-sandbox'],
        });

        const secretarySession = await openRolePage(browser, accounts.secretary);
        secretaryContext = secretarySession.context;
        const secretaryPage = secretarySession.page;

        let nav = await linkTexts(secretaryPage);
        assert.ok(nav.includes('Harvests'));
        assert.ok(nav.includes('Analytics'));

        await secretaryPage.goto(`${APP_URL}/plantings`, { waitUntil: 'networkidle0' });
        let buttons = await buttonTexts(secretaryPage);
        assert.ok(buttons.includes('Add Planting'));
        assert.ok(!buttons.includes('Export Report'));
        assert.equal(
            (await secretaryPage.$$('[title="Delete planting"]')).length,
            0,
            'Secretary must not see Planting delete'
        );

        await secretaryPage.goto(`${APP_URL}/harvests`, { waitUntil: 'networkidle0' });
        buttons = await buttonTexts(secretaryPage);
        assert.ok(buttons.includes('Record Harvest'));
        assert.ok(!buttons.includes('Export Report'));
        assert.equal(
            (await secretaryPage.$$('[title="Delete harvest"]')).length,
            0,
            'Secretary must not see Harvest delete'
        );

        await secretaryPage.goto(`${APP_URL}/analytics`, { waitUntil: 'networkidle0' });
        assert.equal(new URL(secretaryPage.url()).pathname, '/analytics');

        const secretaryBypass = await secretaryPage.evaluate(async () => {
            const forbidden = await fetch('/api/v1/plantings/1', {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-Role': 'ADMIN' },
                body: JSON.stringify({ role: 'ADMIN', user_id: 1 }),
            });
            const me = await fetch('/api/v1/auth/me', { credentials: 'include' });
            return { forbidden: forbidden.status, me: me.status };
        });
        assert.deepEqual(secretaryBypass, { forbidden: 403, me: 200 });

        const workerSession = await openRolePage(browser, accounts.worker);
        workerContext = workerSession.context;
        const workerPage = workerSession.page;
        nav = await linkTexts(workerPage);
        assert.ok(!nav.includes('Harvests'));
        assert.ok(!nav.includes('Analytics'));
        assert.ok(nav.includes('Plantings'));
        assert.ok(nav.includes('Activities'));
        assert.ok(nav.includes('Calendar'));

        assert.ok(
            !workerSession.requests.some((request) => (
                new URL(request.url).pathname.startsWith('/api/v1/harvests')
            )),
            'Worker Dashboard must not request Harvest data'
        );

        await workerPage.goto(`${APP_URL}/harvests`, { waitUntil: 'networkidle0' });
        assert.equal(new URL(workerPage.url()).pathname, '/dashboard');

        await workerPage.goto(`${APP_URL}/analytics`, { waitUntil: 'networkidle0' });
        assert.equal(new URL(workerPage.url()).pathname, '/dashboard');

        await workerPage.goto(`${APP_URL}/plantings`, { waitUntil: 'networkidle0' });
        buttons = await buttonTexts(workerPage);
        assert.ok(!buttons.includes('Add Planting'));
        assert.ok(!buttons.includes('Export Report'));
        assert.ok(buttons.includes('Active'));
        assert.ok(!buttons.includes('All'));
        assert.ok(!buttons.includes('Completed'));
        assert.equal((await workerPage.$$('[title="Edit planting"]')).length, 0);
        assert.equal((await workerPage.$$('[title="Delete planting"]')).length, 0);

        await workerPage.goto(`${APP_URL}/activities`, { waitUntil: 'networkidle0' });
        buttons = await buttonTexts(workerPage);
        assert.ok(!buttons.includes('Log Activity'));

        await workerPage.goto(`${APP_URL}/calendar`, { waitUntil: 'networkidle0' });
        buttons = await buttonTexts(workerPage);
        assert.ok(!buttons.includes('Add Note'));

        const workerBypass = await workerPage.evaluate(async () => {
            const forbidden = await fetch('/api/v1/harvests?user_id=1&role=ADMIN', {
                credentials: 'include',
                headers: { 'X-Role': 'ADMIN' },
            });
            const me = await fetch('/api/v1/auth/me', { credentials: 'include' });
            return { forbidden: forbidden.status, me: me.status, role: (await me.json()).role };
        });
        assert.deepEqual(workerBypass, { forbidden: 403, me: 200, role: 'FARM_WORKER' });

        const storage = await workerPage.evaluate(() => ({
            local: { ...localStorage },
            session: { ...sessionStorage },
        }));
        for (const key of ['token', 'refreshToken', 'user']) {
            assert.equal(storage.local[key], undefined);
            assert.equal(storage.session[key], undefined);
        }

        console.log('PASS Secretary navigation/actions and 403 session retention');
        console.log('PASS Worker navigation/direct URL/API guards and no Harvest request');
        console.log('PASS role-aware storage remains free of auth JWT data');
    } finally {
        if (secretaryContext) await secretaryContext.close();
        if (workerContext) await workerContext.close();
        if (browser) await browser.close();
        await db.query(`DELETE FROM sessions WHERE user_id IN (?, ?)`, userIds);
        await db.query(`DELETE FROM notes WHERE user_id IN (?, ?)`, userIds);
        await db.query(`DELETE FROM notifications WHERE user_id IN (?, ?)`, userIds);
        await db.query(`DELETE FROM users WHERE id IN (?, ?)`, userIds);
        await db.end();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
