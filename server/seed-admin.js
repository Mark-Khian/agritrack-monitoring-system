/**
 * seed-admin.js
 * Creates or resets the single Super Admin account.
 * Run from the server/ folder:  node seed-admin.js
 */

const bcrypt = require('bcryptjs');
const db = require('./config/db');

// ── Configure your admin credentials here ─────────────────────────
const ADMIN_NAME     = 'Super Admin';
const ADMIN_EMAIL    = 'superadmin';
const ADMIN_PASSWORD = 'admin1234';
// ──────────────────────────────────────────────────────────────────

(async () => {
    try {
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

        // Check if an admin already exists
        const [existing] = await db.query(
            `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
        );

        if (existing.length > 0) {
            // Reset the existing admin
            await db.query(
                `UPDATE users
                 SET name            = ?,
                     email           = ?,
                     password        = ?,
                     is_active       = 1,
                     failed_attempts = 0,
                     locked_until    = NULL,
                     captcha_required = 0
                 WHERE id = ?`,
                [ADMIN_NAME, ADMIN_EMAIL, hash, existing[0].id]
            );
            console.log(`✅ Admin account reset. ID: ${existing[0].id}`);
        } else {
            // Insert fresh admin account
            const [result] = await db.query(
                `INSERT INTO users (name, email, password, role, is_active, is_verified)
                 VALUES (?, ?, ?, 'admin', 1, 1)`,
                [ADMIN_NAME, ADMIN_EMAIL, hash]
            );
            console.log(`✅ Admin account created. ID: ${result.insertId}`);
        }

        console.log(`   Email   : ${ADMIN_EMAIL}`);
        console.log(`   Password: ${ADMIN_PASSWORD}`);
        console.log('\n⚠️  Change your password after first login!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        process.exit(1);
    }
})();
