const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 7; // keep last 7 days only
const DB_NAME = process.env.DB_NAME || 'crop_management';
const DEFAULT_BACKUP_CNF = path.join(process.env.HOME || '/home/superadmin', '.agritrack-db-backup.cnf');

// ── Ensure backup folder exists with restricted permissions ───
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
} else {
    try {
        fs.chmodSync(BACKUP_DIR, 0o700);
    } catch (_) {}
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
    const backupCnf = process.env.MYSQL_BACKUP_CNF || DEFAULT_BACKUP_CNF;

    // Fail-closed check: Protected options file MUST exist and be readable
    if (!fs.existsSync(backupCnf)) {
        console.error('❌ Backup aborted: Protected MySQL options file not found or inaccessible.');
        return;
    }

    try {
        fs.accessSync(backupCnf, fs.constants.R_OK);
    } catch (e) {
        console.error('❌ Backup aborted: Protected MySQL options file not found or inaccessible.');
        return;
    }

    const filename = getBackupFilename();
    const filepath = path.join(BACKUP_DIR, filename);

    // Build mysqldump command using protected options file only
    const command = `mysqldump --defaults-extra-file="${backupCnf}" ${DB_NAME} > "${filepath}"`;

    console.log(`🗄️  Running database backup...`);

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error('❌ Backup failed:', err.message);
            // Clean up potentially empty or broken dump file
            if (fs.existsSync(filepath)) {
                try { fs.unlinkSync(filepath); } catch (_) {}
            }
            return;
        }

        // Check if file was created and has content
        if (fs.existsSync(filepath)) {
            // Apply strict 0600 mode immediately to newly generated backup file
            try {
                fs.chmodSync(filepath, 0o600);
            } catch (chmodErr) {
                console.error('⚠️  Failed to set 0600 permissions on backup file:', chmodErr.message);
            }

            const stats = fs.statSync(filepath);
            if (stats.size === 0) {
                console.error('❌ Backup failed: Generated file is empty.');
                try { fs.unlinkSync(filepath); } catch (_) {}
                return;
            }

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
            // Sort safely by filename descending, which embeds the ISO timestamp.
            // This avoids file system mtime anomalies.
            .sort((a, b) => b.localeCompare(a)); 

        // Delete files beyond MAX_BACKUPS
        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            toDelete.forEach(file => {
                fs.unlinkSync(path.join(BACKUP_DIR, file));
                console.log(`🧹 Deleted old backup: ${file}`);
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