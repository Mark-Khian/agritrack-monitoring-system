process.env.NODE_ENV = 'test';
process.env.PHASE7_ABUSE_MIDDLEWARE = '1';
process.env.LOGIN_CHALLENGE_SECRET = 'phase7-browser-challenge-secret-32bytes';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGIN = 'http://127.0.0.1:5177';

const path = require('node:path');
require('../server/node_modules/dotenv').config({
    path: path.join(__dirname, '..', 'server', '.env'),
    quiet: true,
});

if (process.env.DB_NAME !== 'crop_management_rearch_test') {
    throw new Error('Refusing to run Phase 7 browser tests outside crop_management_rearch_test');
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const bcrypt = require('../server/node_modules/bcryptjs');
const mysql = require('../server/node_modules/mysql2/promise');
const puppeteer = require('../server/node_modules/puppeteer');

const ROOT = path.join(__dirname, '..');
const TEST_DB = 'crop_management_rearch_test';
const API_PORT = 5107;
const UI_PORT = 5177;
const APP_URL = `http://127.0.0.1:${UI_PORT}`;
const ADMIN = { username: 'superadmin', password: 'admin1234' };
const executablePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const solvePrompt = (prompt) => {
    const match = String(prompt).match(/What is (\d+) ([+*-]) (\d+)\?/);
    if (!match) throw new Error(`Unexpected challenge prompt: ${prompt}`);
    const left = Number(match[1]);
    const operator = match[2];
    const right = Number(match[3]);
    if (operator === '+') return String(left + right);
    if (operator === '-') return String(left - right);
    return String(left * right);
};

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

(async () => {
    let db;
    let apiServer;
    let vite;
    let browser;

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
        const hash = await bcrypt.hash(ADMIN.password, 12);
        const [updated] = await db.query(
            `UPDATE users
             SET password = ?, password_hash = ?, is_active = 1,
                 failed_attempts = 0, failed_login_attempts = 0,
                 last_failed_login_at = NULL, locked_until = NULL, captcha_required = 0
             WHERE email = ? OR username = ?`,
            [hash, hash, ADMIN.username, ADMIN.username]
        );
        assert.ok(updated.affectedRows > 0, 'test admin password reset matched no rows');
        await db.query(
            `DELETE FROM login_attempts
             WHERE ip_address IN ('127.0.0.1', '::1', '::ffff:127.0.0.1')
                OR username = ? OR email = ?`,
            [ADMIN.username, ADMIN.username]
        );
        await db.query('DELETE FROM login_challenges');

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
            mode: 'phase7',
            server: { host: '127.0.0.1', port: UI_PORT, strictPort: true },
        });
        await vite.listen();
        await waitForHttp(APP_URL);

        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            args: ['--no-sandbox'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setRequestInterception(true);
        page.on('request', (intercepted) => {
            const url = intercepted.url();
            if (/google\.com|gstatic\.com|recaptcha/i.test(url)) {
                return intercepted.abort();
            }
            return intercepted.continue();
        });

        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#username');
        const recaptcha = await page.$('.g-recaptcha, iframe[src*="recaptcha"]');
        assert.equal(recaptcha, null);
        await page.waitForFunction(() => (
            document.body.textContent.includes('Account Login')
            && document.body.textContent.includes('Rice Crop Record Management')
        ));

        const loginButtonEnabled = async () => page.waitForFunction(() => {
            const button = [...document.querySelectorAll('button')]
                .find((candidate) => candidate.textContent.trim() === 'Login');
            return Boolean(button && !button.disabled);
        });

        const submitLogin = async () => {
            await loginButtonEnabled();
            const [response] = await Promise.all([
                page.waitForResponse((candidate) => (
                    candidate.url().includes('/auth/login')
                    && candidate.request().method() === 'POST'
                )),
                page.evaluate(() => {
                    [...document.querySelectorAll('button')]
                        .find((button) => button.textContent.trim() === 'Login')
                        .click();
                }),
            ]);
            return response;
        };

        const failOnce = async () => {
            await loginButtonEnabled();
            await fillInput('#username', ADMIN.username);
            await fillInput('#password', 'wrong-password');
            await submitLogin();
            await page.waitForFunction(() => document.body.textContent.includes('Invalid credentials.'));
        };

        const fillInput = async (selector, value) => {
            await page.$eval(selector, (element, nextValue) => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(element, nextValue);
                element.dispatchEvent(new Event('input', { bubbles: true }));
            }, value);
        };

        await fillInput('#username', ADMIN.username);
        await failOnce();
        await failOnce();
        await failOnce();
        await page.waitForFunction(() => /What is \d+ [+*-] \d+\?/.test(document.body.textContent));
        await page.waitForSelector('#challenge-answer', { visible: true });
        await page.waitForFunction(() => {
            const password = document.querySelector('#password');
            return Boolean(password && !password.disabled);
        });
        const prompt = await page.$eval(
            '#challenge-answer',
            (input) => input.parentElement.querySelector('p')?.textContent.trim()
        );
        await fillInput('#username', ADMIN.username);
        await fillInput('#password', ADMIN.password);
        await fillInput('#challenge-answer', solvePrompt(prompt));
        await page.click('button[aria-label="Close verification"]');
        const challenged = await submitLogin();
        if (!challenged.ok()) {
            throw new Error(`Challenged login failed: ${challenged.status()} ${await challenged.text()}`);
        }
        await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 20_000 });
        console.log('PASS phase7 browser offline challenge login');
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (vite) await vite.close().catch(() => {});
        if (apiServer) {
            await new Promise((resolve) => {
                apiServer.close(resolve);
                apiServer.closeAllConnections?.();
            });
        }
        if (db) await db.end().catch(() => {});
    }
})().then(
    () => process.exit(0),
    (error) => {
        console.error(error);
        process.exit(1);
    }
);
