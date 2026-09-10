process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://127.0.0.1:5178';

const path = require('node:path');
require('../server/node_modules/dotenv').config({
    path: path.join(__dirname, '..', 'server', '.env'),
    quiet: true,
});

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 8 browser tests outside crop_management_rearch_test');
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const bcrypt = require('../server/node_modules/bcryptjs');
const mysql = require('../server/node_modules/mysql2/promise');
const puppeteer = require('../server/node_modules/puppeteer');

const ROOT = path.join(__dirname, '..');
const TEST_DB = 'crop_management_rearch_test';
const API_PORT = 5108;
const UI_PORT = 5178;
const APP_URL = `http://127.0.0.1:${UI_PORT}`;
const PREFIX = `phase8_browser_${Date.now()}_${process.pid}`;
const ADMIN = { username: 'superadmin', password: 'admin1234' };
const PASSWORD = 'Phase8-Browser-Only!42';
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

const navTexts = (page) => page.$$eval(
    'nav a',
    (links) => links.map((link) => link.textContent.trim())
);

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
        const adminId = adminRows[0].id;

        const hash = await bcrypt.hash(PASSWORD, 12);
        const [inserted] = await db.query(
            `INSERT INTO users (name, email, password, role, is_active, status, must_change_password)
             VALUES
               ('Phase 8 Browser Secretary', ?, ?, 'SECRETARY', 1, 'ACTIVE', 0),
               ('Phase 8 Browser Worker', ?, ?, 'FARM_WORKER', 1, 'ACTIVE', 0)`,
            [`${PREFIX}_secretary`, hash, `${PREFIX}_worker`, hash]
        );
        fixtureIds.push(inserted.insertId, inserted.insertId + 1);

        await db.query(
            `INSERT INTO activity_logs (user_id, actor_role, action, entity, entity_id, ip_address, status)
             VALUES (?, NULL, 'PHASE8_LEGACY_NULL_ROLE', 'users', ?, '127.0.0.1', 'success')`,
            [adminId, adminId]
        );

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
        const adminLinks = await navTexts(adminPage);
        assert.ok(adminLinks.includes('Audit Log'));
        assert.ok(adminLinks.includes('Accounts'));

        await adminPage.click('nav a[href="/audit"]');
        await adminPage.waitForFunction(() => window.location.pathname === '/audit');
        await adminPage.waitForFunction(() => document.body.textContent.includes('Audit Log'));

        const actionInput = await adminPage.waitForSelector('input[placeholder="e.g. LOGIN_SUCCESS"]');
        await actionInput.type('PHASE8_LEGACY_NULL_ROLE');
        await adminPage.evaluate(() => {
            [...document.querySelectorAll('button')]
                .find((button) => button.textContent.trim() === 'Filter')
                .click();
        });
        await adminPage.waitForFunction(() => document.body.textContent.includes('Not Recorded'));
        const pageText = await adminPage.evaluate(() => document.body.innerText);
        assert.match(pageText, /Not Recorded/);
        assert.equal(/Edit|Delete/.test(pageText.split('Logout')[0]), false);

        const fixtures = {
            secretary: { username: `${PREFIX}_secretary`, password: PASSWORD },
            worker: { username: `${PREFIX}_worker`, password: PASSWORD },
        };

        for (const [roleName, account] of Object.entries(fixtures)) {
            const context = await browser.createBrowserContext();
            contexts.push(context);
            const page = await context.newPage();
            await page.setViewport({ width: 1440, height: 900 });
            await loginUi(page, account, '/dashboard');
            await page.waitForSelector('nav');
            const links = await navTexts(page);
            assert.equal(links.includes('Audit Log'), false, `${roleName} saw Audit Log nav`);
            assert.equal(links.includes('Accounts'), false);

            await page.goto(`${APP_URL}/audit`, { waitUntil: 'networkidle0' });
            assert.equal(new URL(page.url()).pathname, '/dashboard');

            const apiAccess = await page.evaluate(async () => {
                const response = await fetch('/api/v1/audit', { credentials: 'include' });
                return { status: response.status, cacheControl: response.headers.get('cache-control') };
            });
            assert.equal(apiAccess.status, 403);
        }

        console.log('PASS Admin Audit Log nav, read-only table, and Not Recorded legacy role');
        console.log('PASS Secretary/Worker cannot see Audit nav and are redirected from /audit');
        console.log('PASS Secretary/Worker audit API access is 403');
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
            if (fixtureIds.length) {
                const placeholders = fixtureIds.map(() => '?').join(',');
                await db.query(`DELETE FROM sessions WHERE user_id IN (${placeholders})`, fixtureIds);
                await db.query(
                    `DELETE FROM activity_logs
                     WHERE user_id IN (${placeholders})
                        OR (entity = 'users' AND entity_id IN (${placeholders}))
                        OR action = 'PHASE8_LEGACY_NULL_ROLE'`,
                    [...fixtureIds, ...fixtureIds]
                );
                await db.query(`DELETE FROM users WHERE id IN (${placeholders})`, fixtureIds);
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
