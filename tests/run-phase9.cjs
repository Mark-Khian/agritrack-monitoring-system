process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'crop_management_rearch_test';
process.env.COOKIE_SECURE = 'false';

const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const TEST_DB = 'crop_management_rearch_test';
const CANONICAL = '3a96115177824af19197dfa9e9842b3497248837';
const PHASE45_API = 5100;
const PHASE45_UI = 5173;
const OWNED_PORTS = [5100, 5106, 5107, 5108, 5109, 5173, 5176, 5177, 5178, 5179];

require(path.join(SERVER, 'node_modules', 'dotenv')).config({
    path: path.join(SERVER, '.env'),
    quiet: true,
    override: false,
});

if (process.env.DB_NAME !== TEST_DB) {
    throw new Error(`Refusing to run Phase 9 outside ${TEST_DB}`);
}

const results = [];

const run = (name, command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        cwd: options.cwd || ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            DB_NAME: TEST_DB,
            COOKIE_SECURE: 'false',
            ...(options.env || {}),
        },
        stdio: 'inherit',
        shell: process.platform === 'win32' && command !== process.execPath,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
        const passed = code === 0;
        results.push({ name, passed, code });
        if (passed) resolve();
        else reject(new Error(`${name} failed with exit ${code}`));
    });
});

const listeningPids = (port) => {
    let output = '';
    try {
        output = execSync('netstat -ano', { encoding: 'utf8' });
    } catch {
        return [];
    }
    const pids = new Set();
    const needle = `:${port}`;
    for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING') || !line.includes(needle)) continue;
        if (!new RegExp(`:${port}(?:\\s|\\])`).test(line)) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== '0' && pid !== '4') pids.add(pid);
    }
    return [...pids];
};

const freeOwnedPorts = () => {
    for (const port of OWNED_PORTS) {
        for (const pid of listeningPids(port)) {
            try {
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                console.log(`Freed port ${port} (pid ${pid})`);
            } catch {
                console.log(`Could not free port ${port} (pid ${pid})`);
            }
        }
    }
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
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw lastError || new Error(`Timed out waiting for ${url}`);
};

const servePhase45 = async () => {
    process.env.ALLOWED_ORIGIN = 'http://localhost:5173';
    process.env.VITE_API_PROXY_TARGET = `http://127.0.0.1:${PHASE45_API}`;
    const app = require('../server/app');
    const db = require('../server/config/db');
    const [[database]] = await db.query('SELECT DATABASE() AS name');
    if (database.name !== TEST_DB) {
        throw new Error(`Phase 4/5 API bound to ${database.name}`);
    }
    const apiServer = http.createServer(app);
    await new Promise((resolve, reject) => {
        apiServer.once('error', reject);
        apiServer.listen(PHASE45_API, '127.0.0.1', resolve);
    });
    const { createServer } = await import('../node_modules/vite/dist/node/index.js');
    const vite = await createServer({
        configFile: path.join(ROOT, 'vite.config.js'),
        mode: 'phase4',
        server: { host: '127.0.0.1', port: PHASE45_UI, strictPort: true },
    });
    await vite.listen();
    console.log('PHASE45_READY');
    const shutdown = async () => {
        await vite.close().catch(() => {});
        await new Promise((resolve) => {
            apiServer.close(resolve);
            apiServer.closeAllConnections?.();
        });
        await db.end().catch(() => {});
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

const preflight = async () => {
    const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    console.log(`Git HEAD ${head}`);
    if (head !== CANONICAL) {
        console.log(`WARNING HEAD is not canonical ${CANONICAL}`);
    }
    console.log(execSync('git status --short', { cwd: ROOT, encoding: 'utf8' }) || 'working tree clean before Phase 9 files');

    if (process.env.DB_NAME !== TEST_DB) {
        throw new Error('DB_NAME was not pinned before DB access');
    }
    const mysql = require(path.join(SERVER, 'node_modules', 'mysql2/promise'));
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: TEST_DB,
    });
    const [[database]] = await conn.query('SELECT DATABASE() AS name');
    console.log(`SELECT DATABASE() = ${database.name}`);
    if (database.name !== TEST_DB) {
        throw new Error(`Abort: connected to ${database.name}`);
    }
    await conn.query('DROP TRIGGER IF EXISTS phase8_fail_activity_logs_insert');
    const [indexes] = await conn.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'activity_logs'
           AND INDEX_NAME IN ('idx_activity_logs_created_id', 'idx_activity_logs_action_created')
         GROUP BY INDEX_NAME`
    );
    console.log(`activity_logs indexes: ${indexes.map((row) => row.INDEX_NAME).join(',')}`);
    const [tables] = await conn.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN ('users','sessions','activity_logs','login_attempts','login_challenges','plantings','activities','harvests','notes')
         ORDER BY TABLE_NAME`
    );
    console.log(`TEST tables: ${tables.map((row) => row.TABLE_NAME).join(',')}`);
    await conn.end();
    freeOwnedPorts();
    const leftover5173 = listeningPids(5173);
    if (leftover5173.length) {
        throw new Error(`Port 5173 still owned by ${leftover5173.join(',')}`);
    }
    console.log('Port 5000 left untouched; Phase 4/5 will use TEST-backed 5100/5173');
};

const startPhase45Child = () => {
    const child = spawn(process.execPath, [__filename, '--serve-phase45'], {
        cwd: ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            DB_NAME: TEST_DB,
            COOKIE_SECURE: 'false',
            ALLOWED_ORIGIN: 'http://localhost:5173',
            VITE_API_PROXY_TARGET: `http://127.0.0.1:${PHASE45_API}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    return child;
};

const stopChild = async (child) => {
    if (!child || child.killed) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
        }, 8000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
};

const main = async () => {
    await preflight();
    await run('test:setup-db', 'npm', ['run', 'test:setup-db'], { cwd: SERVER });
    await run('phase3', 'npm', ['run', 'test:phase3'], { cwd: SERVER });
    await run('phase5', 'npm', ['run', 'test:phase5'], { cwd: SERVER });
    await run('phase6', 'npm', ['run', 'test:phase6'], { cwd: SERVER });
    await run('phase7', 'npm', ['run', 'test:phase7'], { cwd: SERVER });
    await run('phase8', 'npm', ['run', 'test:phase8'], { cwd: SERVER });
    await run('phase9', 'npm', ['run', 'test:phase9'], { cwd: SERVER });

    freeOwnedPorts();
    const phase45 = startPhase45Child();
    try {
        await waitForHttp(`http://127.0.0.1:${PHASE45_API}`);
        await waitForHttp(`http://localhost:${PHASE45_UI}`);
        await run('phase4-browser', 'npm', ['run', 'test:phase4:browser']);
        await run('phase5-browser', 'npm', ['run', 'test:phase5:browser']);
    } finally {
        await stopChild(phase45);
        freeOwnedPorts();
    }

    await run('phase6-browser', 'npm', ['run', 'test:phase6:browser']);
    await run('phase7-browser', 'npm', ['run', 'test:phase7:browser']);
    await run('phase8-browser', 'npm', ['run', 'test:phase8:browser']);
    await run('phase9-browser', 'npm', ['run', 'test:phase9:browser']);

    await run('vite-build', 'npm', ['run', 'build']);
    await run('node-check-e2e', process.execPath, ['--check', path.join(SERVER, 'tests', 'phase9-e2e.test.js')]);
    await run('node-check-browser', process.execPath, ['--check', path.join(ROOT, 'tests', 'phase9-browser.cjs')]);
    await run('node-check-runner', process.execPath, ['--check', __filename]);
    await run('git-diff-check', 'git', ['diff', '--check']);

    freeOwnedPorts();
    console.log('\nPhase 9 serial results:');
    for (const item of results) {
        console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
    }
};

if (process.argv.includes('--serve-phase45')) {
    servePhase45().catch((error) => {
        console.error(error);
        process.exit(1);
    });
} else {
    main().catch((error) => {
        console.error(error);
        console.log('\nPhase 9 serial results:');
        for (const item of results) {
            console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
        }
        process.exit(1);
    });
}
