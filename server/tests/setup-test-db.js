/**
 * Initializes crop_management_rearch_test from the accepted baseline schema.sql plus
 * the auth-era migrations, applied in order: 008, then 009.
 * Run manually: node tests/setup-test-db.js
 * Not invoked by Phase 3 test suite (tests must not alter schema).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const TEST_DB = 'crop_management_rearch_test';

(async () => {
    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASS || process.env.DB_PASSWORD || '';
    const port = Number(process.env.DB_PORT) || 3306;

    const root = await mysql.createConnection({ host, user, password, port, multipleStatements: true });
    await root.query(
        `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
    );
    await root.end();

    const conn = await mysql.createConnection({
        host,
        user,
        password,
        port,
        database: TEST_DB,
        multipleStatements: true,
    });

    const [tables] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
        [TEST_DB]
    );
    if (tables[0].cnt === 0) {
        console.log('Loading schema.sql...');
        let schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
        if (schema.charCodeAt(0) === 0xFEFF) schema = schema.slice(1);
        await conn.query(schema);
    } else {
        console.log('users table exists; skipping schema.sql load.');
    }

    // Applied in order from the repo's real migration files — no inline/dynamic DDL.
    const MIGRATIONS = [
        '008_add_v2_auth_foundation.sql',
        '009_relax_legacy_activity_date.sql'
    ];

    for (const file of MIGRATIONS) {
        console.log(`Applying migration ${file}...`);
        const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf8');
        await conn.query(sql);
    }

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('admin1234', 12);
    const [existing] = await conn.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (existing.length === 0) {
        await conn.query(
            `INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'admin', 1)`,
            ['Super Admin', 'superadmin', hash]
        );
        console.log('Seeded admin user.');
    } else {
        await conn.query(
            `UPDATE users SET password = ?, is_active = 1, failed_attempts = 0, locked_until = NULL, captcha_required = 0 WHERE id = ?`,
            [hash, existing[0].id]
        );
        console.log('Reset admin credentials.');
    }

    await conn.end();
    console.log(`✅ ${TEST_DB} is ready.`);
})().catch((err) => {
    console.error('Setup failed:', err.message);
    process.exit(1);
});
