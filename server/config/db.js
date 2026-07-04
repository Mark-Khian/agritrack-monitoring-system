const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'crop_management',

    // ── Connection Pool Limits ────────────
    waitForConnections: true,
    connectionLimit: 10,       // max 10 simultaneous connections
    queueLimit: 0,        // unlimited queue
    connectTimeout: 10000,    // 10 seconds connection timeout

    // ── Security ──────────────────────────
    multipleStatements: false,    // prevent multiple SQL statements
    dateStrings: true,     // return dates as strings
});

const runMigrations = require('./migration');

// Test connection on startup
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ DB connection failed:', err.message);
        return;
    }
    console.log('✅ Connected to MySQL database!');
    connection.release();
    
    // Run database schema migrations
    runMigrations(pool.promise());
});

// ── DB Health Check ───────────────────────
const checkDbHealth = () => {
    pool.query('SELECT 1', (err) => {
        if (err) {
            console.error('❌ DB health check failed:', err.message);
        }
    });
};

// Run health check every 30 seconds
setInterval(checkDbHealth, 30000);

module.exports = pool.promise();