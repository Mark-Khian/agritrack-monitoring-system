/**
 * Focused checks for the active-identity lock and migration 014.
 * Connects only to crop_management_rearch_test. The duplicate cases use a
 * temporary table and do not change user rows.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TEST_DB = 'crop_management_rearch_test';
const LOCK_SQL =
    'SELECT id FROM users WHERE archived_at IS NULL AND (username = ? OR email = ?) LIMIT 1 FOR UPDATE';
const MIGRATION_PATH = path.join(__dirname, '..', 'migrations', '014_release_archived_usernames.sql');
const CONTROLLER_PATH = path.join(__dirname, '..', 'controllers', 'userController.js');

const fragment = (sql, name) => {
    const start = `-- sql-fragment: ${name}`;
    const end = `-- end-sql-fragment: ${name}`;
    const from = sql.indexOf(start);
    const to = sql.indexOf(end);
    assert.ok(from !== -1 && to > from, `missing SQL fragment ${name}`);
    return sql.slice(from + start.length, to).trim();
};

const openTestDb = async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
        port: Number(process.env.DB_PORT) || 3306,
        database: TEST_DB,
        multipleStatements: true,
    });
    const [[row]] = await conn.query('SELECT DATABASE() AS name');
    if (row.name !== TEST_DB) {
        await conn.end();
        throw new Error(`Refusing to use database ${row.name}`);
    }
    return conn;
};

test('active identity lock is valid MySQL and is the controller query', async () => {
    const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    assert.match(source, new RegExp(LOCK_SQL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(source.includes('FORUPDATE'), false);
    assert.match(LOCK_SQL, / LIMIT 1 FOR UPDATE$/);

    const conn = await openTestDb();
    try {
        const [plan] = await conn.query(`EXPLAIN ${LOCK_SQL}`, ['identity-probe', 'identity-probe']);
        assert.ok(plan.length >= 1);
        assert.equal(plan[0].table, 'users');
    } finally {
        await conn.end();
    }
});

test('migration 014 duplicate checks stay column-specific and do not change user rows', async () => {
    const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
    assert.equal(/UPDATE\s+users/i.test(migration), false);
    assert.equal(/DELETE\s+FROM\s+users/i.test(migration), false);
    assert.equal(/UNION\s+ALL/i.test(migration), false);

    const usernameCheck = fragment(migration, 'active-username-duplicates')
        .replaceAll('FROM users', 'FROM migration_014_identity_probe');
    const emailCheck = fragment(migration, 'active-email-duplicates')
        .replaceAll('FROM users', 'FROM migration_014_identity_probe');
    assert.equal(usernameCheck.includes('email'), false);
    assert.equal(emailCheck.includes('username'), false);

    const conn = await openTestDb();
    try {
        await conn.query('DROP TEMPORARY TABLE IF EXISTS migration_014_identity_probe');
        await conn.query(
            `CREATE TEMPORARY TABLE migration_014_identity_probe (
                username VARCHAR(100) NULL,
                email VARCHAR(100) NULL,
                archived_at DATETIME NULL
            )`
        );

        const counts = async () => {
            await conn.query(usernameCheck);
            await conn.query(emailCheck);
            const [[row]] = await conn.query(
                'SELECT @active_username_duplicates AS usernames, @active_email_duplicates AS emails'
            );
            return { usernames: Number(row.usernames), emails: Number(row.emails) };
        };

        await conn.query(
            `INSERT INTO migration_014_identity_probe (username, email, archived_at) VALUES
                ('shared', 'other', NULL),
                ('another', 'shared', NULL)`
        );
        assert.deepEqual(await counts(), { usernames: 0, emails: 0 });

        await conn.query('DELETE FROM migration_014_identity_probe');
        await conn.query(
            `INSERT INTO migration_014_identity_probe (username, email, archived_at) VALUES
                ('kept', NULL, NULL),
                (NULL, 'kept', NULL),
                (NULL, NULL, NULL),
                (NULL, NULL, NULL)`
        );
        assert.deepEqual(await counts(), { usernames: 0, emails: 0 });

        await conn.query('DELETE FROM migration_014_identity_probe');
        await conn.query(
            `INSERT INTO migration_014_identity_probe (username, email, archived_at) VALUES
                ('again', 'old@example.test', '2020-01-01 00:00:00'),
                ('again', 'old@example.test', '2020-02-01 00:00:00'),
                ('again', 'fresh@example.test', NULL)`
        );
        assert.deepEqual(await counts(), { usernames: 0, emails: 0 });

        await conn.query('DELETE FROM migration_014_identity_probe');
        await conn.query(
            `INSERT INTO migration_014_identity_probe (username, email, archived_at) VALUES
                ('dup', 'a@example.test', NULL),
                ('dup', 'b@example.test', NULL)`
        );
        assert.deepEqual(await counts(), { usernames: 1, emails: 0 });

        await conn.query('DELETE FROM migration_014_identity_probe');
        await conn.query(
            `INSERT INTO migration_014_identity_probe (username, email, archived_at) VALUES
                ('a', 'dup@example.test', NULL),
                ('b', 'dup@example.test', NULL)`
        );
        assert.deepEqual(await counts(), { usernames: 0, emails: 1 });
    } finally {
        await conn.end();
    }
});

test('migration 014 accepts the current test schema and does not rewrite user rows', async () => {
    const beforeConn = await openTestDb();
    let beforeUsers;
    try {
        const [[row]] = await beforeConn.query(
            'SELECT COUNT(*) AS users, COALESCE(SUM(archived_at IS NOT NULL), 0) AS archived FROM users'
        );
        beforeUsers = { users: Number(row.users), archived: Number(row.archived) };
    } finally {
        await beforeConn.end();
    }

    const conn = await openTestDb();
    try {
        const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
        await conn.query(migration);
        const [[row]] = await conn.query(
            'SELECT COUNT(*) AS users, COALESCE(SUM(archived_at IS NOT NULL), 0) AS archived FROM users'
        );
        assert.deepEqual(
            { users: Number(row.users), archived: Number(row.archived) },
            beforeUsers
        );
        const [indexes] = await conn.query(
            `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'users'
               AND INDEX_NAME IN ('uq_users_active_username', 'uq_users_active_email', 'uq_users_username', 'email')
             ORDER BY INDEX_NAME, SEQ_IN_INDEX`
        );
        assert.deepEqual(indexes.map((index) => index.INDEX_NAME), [
            'uq_users_active_email',
            'uq_users_active_username',
        ]);
        assert.ok(indexes.every((index) => index.NON_UNIQUE === 0));
    } finally {
        await conn.end();
    }
});
