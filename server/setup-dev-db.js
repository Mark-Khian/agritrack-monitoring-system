/**
 * Local-development-only initializer for crop_management_dev.
 *
 * Creates the dedicated manual-dev database from schema.sql plus accepted
 * migrations 007–011, seeds the NSIC variety catalog, and upserts the three
 * development role accounts. Never targets crop_management_rearch_test.
 *
 * Run from server/:  npm run setup:dev-db
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ENV_PATH = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_PATH });

const DEV_DB = 'crop_management_dev';
const FORBIDDEN_DBS = new Set(['crop_management_rearch_test']);
const HOST = process.env.DB_HOST || 'localhost';

const DEV_ACCOUNTS = [
    {
        username: 'admin',
        name: 'Development Admin',
        role: 'admin',
        envKey: 'DEV_ADMIN_PASSWORD',
        mustChangePassword: 0
    },
    {
        username: 'secretary',
        name: 'Development Secretary',
        role: 'SECRETARY',
        envKey: 'DEV_SECRETARY_PASSWORD',
        mustChangePassword: 0
    },
    {
        username: 'worker',
        name: 'Development Worker',
        role: 'FARM_WORKER',
        envKey: 'DEV_WORKER_PASSWORD',
        mustChangePassword: 0
    }
];

// Prior local usernames — disable so they do not remain as duplicate active accounts.
const LEGACY_DEV_USERNAMES = ['dev_admin', 'dev_secretary', 'dev_worker'];

const upsertEnvKeys = (updates) => {
    let raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    if (raw.length && !raw.endsWith('\n')) raw += '\n';

    for (const [key, value] of Object.entries(updates)) {
        const pattern = new RegExp(`^${key}=.*$`, 'm');
        if (pattern.test(raw)) {
            raw = raw.replace(pattern, `${key}=${value}`);
        } else {
            raw += `${key}=${value}\n`;
        }
        process.env[key] = value;
        console.log(`env upserted: ${key}`);
    }

    fs.writeFileSync(ENV_PATH, raw, 'utf8');
};

const localChallengeSecret = () => {
    const existing = process.env.LOGIN_CHALLENGE_SECRET;
    if (
        typeof existing === 'string'
        && existing.length >= 32
        && existing !== process.env.JWT_SECRET
    ) {
        return existing;
    }
    return crypto.randomBytes(32).toString('hex');
};

const localAccountPassword = (envKey) => {
    const existing = process.env[envKey];
    // Prefer the gitignored local .env value as-is (may be a short local-only password).
    if (typeof existing === 'string' && existing.length > 0) {
        return existing;
    }
    return `AgriTrack-Dev-${envKey.replace('DEV_', '').replace('_PASSWORD', '')}-Local-Only-${crypto.randomBytes(4).toString('hex')}!`;
};

(async () => {
    if (FORBIDDEN_DBS.has(process.env.DB_NAME)) {
        throw new Error('Refusing to initialize the automated test database as a manual-dev DB.');
    }
    if (HOST !== 'localhost' && HOST !== '127.0.0.1') {
        throw new Error(`Refusing non-local DB_HOST=${HOST}`);
    }

    const password = process.env.DB_PASS || process.env.DB_PASSWORD || '';
    const port = Number(process.env.DB_PORT) || 3306;
    const user = process.env.DB_USER || 'root';
    const accountPasswords = {};
    for (const account of DEV_ACCOUNTS) {
        accountPasswords[account.envKey] = localAccountPassword(account.envKey);
        process.env[account.envKey] = accountPasswords[account.envKey];
    }

    const root = await mysql.createConnection({ host: HOST, user, password, port, multipleStatements: true });
    await root.query(
        `CREATE DATABASE IF NOT EXISTS \`${DEV_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
    );
    await root.end();

    const conn = await mysql.createConnection({
        host: HOST,
        user,
        password,
        port,
        database: DEV_DB,
        multipleStatements: true
    });

    const [tables] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
        [DEV_DB]
    );
    if (tables[0].cnt === 0) {
        console.log('Loading schema.sql...');
        let schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        if (schema.charCodeAt(0) === 0xFEFF) schema = schema.slice(1);
        await conn.query(schema);
    } else {
        console.log('users table exists; skipping schema.sql load.');
    }

    const applySqlFile = async (file) => {
        console.log(`Applying ${file}...`);
        const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
        await conn.query(sql);
    };

    const [farmLocationColumn] = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'farm_latitude'`,
        [DEV_DB]
    );
    if (farmLocationColumn[0].cnt === 0) {
        await applySqlFile('007_add_farm_location.sql');
    }

    for (const file of [
        '008_add_v2_auth_foundation.sql',
        '009_relax_legacy_activity_date.sql',
        '010_add_login_challenges.sql',
        '011_add_activity_logs_indexes.sql'
    ]) {
        await applySqlFile(file);
    }

    const [[varietyCount]] = await conn.query('SELECT COUNT(*) AS cnt FROM varieties');
    if (Number(varietyCount.cnt) === 0) {
        console.log('Seeding NSIC variety catalog from 004...');
        await applySqlFile('004_varieties_and_planting_variety_id.sql');
    } else {
        console.log(`varieties already present (${varietyCount.cnt}); leaving catalog unchanged.`);
    }

    for (const account of DEV_ACCOUNTS) {
        const hash = await bcrypt.hash(process.env[account.envKey], 12);
        const [existing] = await conn.query(
            'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
            [account.username, account.username]
        );
        if (existing.length > 0) {
            await conn.query(
                `UPDATE users
                 SET name = ?,
                     full_name = ?,
                     email = ?,
                     username = ?,
                     password = ?,
                     password_hash = ?,
                     role = ?,
                     is_active = 1,
                     status = 'ACTIVE',
                     must_change_password = ?,
                     failed_attempts = 0,
                     failed_login_attempts = 0,
                     last_failed_login_at = NULL,
                     locked_until = NULL,
                     captcha_required = 0,
                     disabled_at = NULL,
                     disabled_by = NULL
                 WHERE id = ?`,
                [
                    account.name,
                    account.name,
                    account.username,
                    account.username,
                    hash,
                    hash,
                    account.role,
                    account.mustChangePassword,
                    existing[0].id
                ]
            );
            console.log(`Updated development account ${account.username} (id=${existing[0].id})`);
        } else {
            const [result] = await conn.query(
                `INSERT INTO users
                    (name, full_name, email, username, password, password_hash, role,
                     is_active, status, must_change_password, password_changed_at,
                     failed_attempts, failed_login_attempts)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', ?, NULL, 0, 0)`,
                [
                    account.name,
                    account.name,
                    account.username,
                    account.username,
                    hash,
                    hash,
                    account.role,
                    account.mustChangePassword
                ]
            );
            console.log(`Created development account ${account.username} (id=${result.insertId})`);
        }
    }

    if (LEGACY_DEV_USERNAMES.length > 0) {
        const [legacyResult] = await conn.query(
            `UPDATE users
             SET is_active = 0,
                 status = 'INACTIVE',
                 disabled_at = COALESCE(disabled_at, NOW()),
                 locked_until = NULL,
                 captcha_required = 0
             WHERE (username IN (?) OR email IN (?))
               AND role IN ('admin', 'SECRETARY', 'FARM_WORKER')`,
            [LEGACY_DEV_USERNAMES, LEGACY_DEV_USERNAMES]
        );
        console.log(`Disabled legacy development accounts: ${legacyResult.affectedRows}`);
    }

    const [[loginAttemptsUsername]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'username'`,
        [DEV_DB]
    );
    const [[challenges]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'login_challenges'`,
        [DEV_DB]
    );
    const [[activityDate]] = await conn.query(
        `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'activity_date'`,
        [DEV_DB]
    );
    const [[varietyFinal]] = await conn.query('SELECT COUNT(*) AS cnt FROM varieties');

    console.log('login_attempts.username', loginAttemptsUsername.cnt > 0);
    console.log('login_challenges', challenges.cnt > 0);
    console.log('activities.activity_date nullable', activityDate.IS_NULLABLE === 'YES');
    console.log('varieties.count', varietyFinal.cnt);

    upsertEnvKeys({
        NODE_ENV: 'development',
        BIND_HOST: '127.0.0.1',
        PORT: process.env.PORT || '5000',
        ALLOWED_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: 'false',
        FORCE_HTTPS: 'false',
        DB_NAME: DEV_DB,
        LOGIN_CHALLENGE_SECRET: localChallengeSecret(),
        ...accountPasswords
    });
    console.log(`✅ ${DEV_DB} is ready. Account passwords are stored in server/.env and are not logged.`);

    await conn.end();
})().catch((err) => {
    console.error('Setup failed:', err.message);
    process.exit(1);
});
