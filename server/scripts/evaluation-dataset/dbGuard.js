'use strict';

const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');
const { EVAL_DB_NAME, FORBIDDEN_DB_NAMES } = require('./constants');

dotenv.config({
    path: path.join(__dirname, '..', '..', '.env'),
    quiet: true,
});

const createConnection = async (dbNameOverride = null) => {
    const database = dbNameOverride || process.env.DB_NAME;
    if (!database) {
        throw new Error('DB_NAME is not set (server/.env or --db-name).');
    }
    return mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
        database,
        multipleStatements: false,
    });
};

const getDatabaseName = async (connection) => {
    const [[row]] = await connection.query('SELECT DATABASE() AS name');
    return row?.name || null;
};

/**
 * Hard guard: abort unless SELECT DATABASE() is exactly crop_management_eval.
 * Call immediately before any write / rollback mutation.
 */
const assertEvaluationDatabase = async (connection) => {
    const name = await getDatabaseName(connection);
    if (FORBIDDEN_DB_NAMES.includes(name)) {
        throw new Error(
            `REFUSING WRITE: connected database "${name}" is explicitly forbidden. `
            + `Only ${EVAL_DB_NAME} is allowed.`
        );
    }
    if (name !== EVAL_DB_NAME) {
        throw new Error(
            `REFUSING WRITE: SELECT DATABASE() returned "${name}". `
            + `Required exactly "${EVAL_DB_NAME}".`
        );
    }
    return name;
};

module.exports = {
    createConnection,
    getDatabaseName,
    assertEvaluationDatabase,
};
