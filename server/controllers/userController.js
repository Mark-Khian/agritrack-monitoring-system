const db = require('../config/db');
const logActivity = require('../middleware/logger');
const { getClientIp } = require('../utils/clientIp');
const {
    generateTemporaryPassword,
    hashPassword
} = require('../utils/passwordHelper');
const { invalidateAllSessions } = require('../utils/sessionHelper');

const setSecretResponseHeaders = (res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
};

const getLockedSubordinate = async (connection, userId) => {
    const [users] = await connection.query(
        `SELECT id, name, username, email, role, is_active
         FROM users
         WHERE id = ? AND role IN ('SECRETARY', 'FARM_WORKER')
         FOR UPDATE`,
        [userId]
    );
    return users[0] || null;
};

const audit = (req, action, targetId, connection) => logActivity({
    user_id: req.user.id,
    actor_role: logActivity.snapshotRole(req.user.role),
    action,
    entity: 'users',
    entity_id: targetId,
    ip_address: getClientIp(req),
    connection
});

const listUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            `SELECT id,
                    COALESCE(full_name, name) AS name,
                    COALESCE(username, email) AS username,
                    role,
                    is_active,
                    status,
                    must_change_password,
                    created_at,
                    updated_at,
                    last_login_at,
                    password_changed_at,
                    disabled_at
             FROM users
             WHERE role IN ('SECRETARY', 'FARM_WORKER')
             ORDER BY created_at DESC, id DESC`
        );

        return res.status(200).json({
            users: users.map((user) => ({
                ...user,
                is_active: Boolean(user.is_active),
                must_change_password: Boolean(user.must_change_password)
            }))
        });
    } catch (err) {
        console.error('List users error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    }
};

const createUser = async (req, res) => {
    const name = req.body.name.trim();
    const username = req.body.username.trim();
    const role = req.body.role;
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [conflicts] = await connection.query(
            `SELECT id
             FROM users
             WHERE username = ? OR email = ?
             LIMIT 1
             FOR UPDATE`,
            [username, username]
        );
        if (conflicts.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'Username is already in use.' });
        }

        const [result] = await connection.query(
            `INSERT INTO users
                (name, full_name, email, username, password, password_hash, role,
                 is_active, status, must_change_password, password_changed_at,
                 created_by, failed_attempts, failed_login_attempts)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', 1, NULL, ?, 0, 0)`,
            [
                name,
                name,
                username,
                username,
                passwordHash,
                passwordHash,
                role,
                req.user.id
            ]
        );
        await audit(req, 'CREATE_USER', result.insertId, connection);
        await connection.commit();

        setSecretResponseHeaders(res);
        return res.status(201).json({
            message: 'Account created successfully.',
            user: {
                id: result.insertId,
                name,
                username,
                role,
                is_active: true,
                must_change_password: true
            },
            temporaryPassword
        });
    } catch (err) {
        if (connection) await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Username is already in use.' });
        }
        console.error('Create user error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
    }
};

const resetPassword = async (req, res) => {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const target = await getLockedSubordinate(connection, req.params.id);
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subordinate account not found.' });
        }
        if (!target.is_active) {
            await connection.rollback();
            return res.status(409).json({ message: 'Disabled accounts must be reactivated.' });
        }

        await connection.query(
            `UPDATE users
             SET password = ?,
                 password_hash = ?,
                 must_change_password = 1,
                 password_changed_at = NULL,
                 failed_attempts = 0,
                 failed_login_attempts = 0,
                 last_failed_login_at = NULL,
                 locked_until = NULL,
                 captcha_required = 0
             WHERE id = ?`,
            [passwordHash, passwordHash, target.id]
        );
        await invalidateAllSessions(target.id, connection);
        await audit(req, 'RESET_USER_PASSWORD', target.id, connection);
        await connection.commit();

        setSecretResponseHeaders(res);
        return res.status(200).json({
            message: 'Password reset successfully.',
            user: { id: target.id, username: target.username || target.email },
            temporaryPassword
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Reset user password error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
    }
};

const disableUser = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const target = await getLockedSubordinate(connection, req.params.id);
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subordinate account not found.' });
        }
        if (!target.is_active) {
            await connection.rollback();
            return res.status(409).json({ message: 'Account is already disabled.' });
        }

        await connection.query(
            `UPDATE users
             SET is_active = 0,
                 status = 'INACTIVE',
                 disabled_at = NOW(),
                 disabled_by = ?
             WHERE id = ?`,
            [req.user.id, target.id]
        );
        await invalidateAllSessions(target.id, connection);
        await audit(req, 'DISABLE_USER', target.id, connection);
        await connection.commit();

        return res.status(200).json({ message: 'Account disabled successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Disable user error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
    }
};

const reactivateUser = async (req, res) => {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const target = await getLockedSubordinate(connection, req.params.id);
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subordinate account not found.' });
        }
        if (target.is_active) {
            await connection.rollback();
            return res.status(409).json({ message: 'Account is already active.' });
        }

        await connection.query(
            `UPDATE users
             SET is_active = 1,
                 status = 'ACTIVE',
                 password = ?,
                 password_hash = ?,
                 must_change_password = 1,
                 password_changed_at = NULL,
                 disabled_at = NULL,
                 disabled_by = NULL,
                 failed_attempts = 0,
                 failed_login_attempts = 0,
                 last_failed_login_at = NULL,
                 locked_until = NULL,
                 captcha_required = 0
             WHERE id = ?`,
            [passwordHash, passwordHash, target.id]
        );
        await invalidateAllSessions(target.id, connection);
        await audit(req, 'REACTIVATE_USER', target.id, connection);
        await connection.commit();

        setSecretResponseHeaders(res);
        return res.status(200).json({
            message: 'Account reactivated successfully.',
            user: { id: target.id, username: target.username || target.email },
            temporaryPassword
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Reactivate user error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
    }
};

const revokeSessions = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const target = await getLockedSubordinate(connection, req.params.id);
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subordinate account not found.' });
        }

        await invalidateAllSessions(target.id, connection);
        await audit(req, 'REVOKE_USER_SESSIONS', target.id, connection);
        await connection.commit();

        return res.status(200).json({ message: 'Account sessions revoked successfully.' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Revoke user sessions error:', err.message);
        return res.status(500).json({ message: 'Server error.' });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    listUsers,
    createUser,
    resetPassword,
    disableUser,
    reactivateUser,
    revokeSessions
};
