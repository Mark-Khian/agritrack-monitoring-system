const db = require('../config/db');
const bcrypt = require('bcryptjs');

const HISTORY_LIMIT = 3; // Check last 3 passwords

// Save password to history
const savePasswordHistory = async (userId, hashedPassword) => {
    await db.query(
        'INSERT INTO password_history (user_id, password) VALUES (?, ?)',
        [userId, hashedPassword]
    );

    // Keep only last 10 records per user
    await db.query(
        `DELETE FROM password_history
     WHERE user_id = ?
     AND id NOT IN (
       SELECT id FROM (
         SELECT id FROM password_history
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10
       ) AS recent
     )`,
        [userId, userId]
    );
};

// Check if password was recently used
const isPasswordReused = async (userId, newPassword) => {
    const [history] = await db.query(
        `SELECT password FROM password_history
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
        [userId, HISTORY_LIMIT]
    );

    for (const record of history) {
        const isMatch = await bcrypt.compare(newPassword, record.password);
        if (isMatch) return true;
    }
    return false;
};

module.exports = { savePasswordHistory, isPasswordReused };