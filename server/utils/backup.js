const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 7; // keep last 7 days only
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || 'crop_management';
const DB_PORT = process.env.DB_PORT || 3306;

// ── Ensure backup folder exists ───────────
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── Generate backup filename ──────────────
const getBackupFilename = () => {
    const now = new Date();
    const date = now.toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .replace(/\..+/, '');
    return `backup_${date}.sql`;
};

// ── Run the actual backup ─────────────────
const runBackup = () => {
    const filename = getBackupFilename();
    const filepath = path.join(BACKUP_DIR, filename);

    // Build mysqldump command
    const passFlag = DB_PASS ? `-p${DB_PASS}` : '';
    const command = `mysqldump -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${passFlag} ${DB_NAME} > "${filepath}"`;

    console.log(`🗄️  Running database backup...`);

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error('❌ Backup failed:', err.message);
            return;
        }

        // Check if file was created and has content
        if (fs.existsSync(filepath)) {
            const stats = fs.statSync(filepath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            console.log(`✅ Backup saved: ${filename} (${sizeKB} KB)`);

            // Cleanup old backups
            cleanupOldBackups();
        } else {
            console.error('❌ Backup file not created.');
        }
    });
};

// ── Delete old backups (keep last 7) ──────
const cleanupOldBackups = () => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup_') && f.endsWith('.sql'))
            .map(f => ({
                name: f,
                time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // newest first

        // Delete files beyond MAX_BACKUPS
        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            toDelete.forEach(file => {
                fs.unlinkSync(path.join(BACKUP_DIR, file.name));
                console.log(`🧹 Deleted old backup: ${file.name}`);
            });
        }
    } catch (err) {
        console.error('Cleanup error:', err.message);
    }
};

// ── List all backups ──────────────────────
const listBackups = () => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup_') && f.endsWith('.sql'))
            .map(f => {
                const stats = fs.statSync(path.join(BACKUP_DIR, f));
                const sizeKB = (stats.size / 1024).toFixed(2);
                return {
                    name: f,
                    size: `${sizeKB} KB`,
                    created: stats.mtime.toLocaleString('en-PH', {
                        timeZone: 'Asia/Manila'
                    })
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));

        return files;
    } catch (err) {
        console.error('List backups error:', err.message);
        return [];
    }
};

// ── Schedule automatic backups ────────────
const scheduleBackups = () => {
    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', () => {
        console.log('⏰ Scheduled backup starting...');
        runBackup();
    }, {
        timezone: 'Asia/Manila'
    });

    console.log('📅 Automatic backup scheduled — daily at 2:00 AM (Manila time)');
};

module.exports = { runBackup, scheduleBackups, listBackups, cleanupOldBackups };