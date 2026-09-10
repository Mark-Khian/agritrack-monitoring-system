const https = require('https');
const http = require('http');
const cron = require('node-cron');
const generateCerts = require('./config/https');
require('dotenv').config();

const app = require('./app');
const { scheduleBackups } = require('./utils/backup');
const { runActivityCycle, runWeatherCycle } = require('./utils/notificationService');

const db = require('./config/db');
const runMigrations = require('./config/migration');

async function startServer() {
    try {
        console.log('🚀 Starting application...');
        
        // 1. Run migrations synchronously
        await runMigrations(db);

        // 2. Start Backup Scheduler
        scheduleBackups();

        // 3. Register Notification/Weather Schedulers
        // Every 6 hours: activity due, overdue, lifecycle stage transitions
        cron.schedule('0 */6 * * *', async () => {
            console.log('⏰ [Notifications] Running activity/lifecycle cycle...');
            await runActivityCycle();
        }, { timezone: 'Asia/Manila' });

        // Every 12 hours: weather alerts
        cron.schedule('0 */12 * * *', async () => {
            console.log('⏰ [Notifications] Running weather alert cycle...');
            await runWeatherCycle();
        }, { timezone: 'Asia/Manila' });

        console.log('🔔 Notification scheduler registered (6h activity/lifecycle, 12h weather)');

        // 4. Start HTTP/HTTPS servers
        const PORT = process.env.PORT || 5000;
        const HTTPS_PORT = process.env.HTTPS_PORT || 5443;
        const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
        const sslCerts = generateCerts();

        http.createServer(app).listen(PORT, BIND_HOST, () => {
            console.log(`🌐 HTTP  running on http://localhost:${PORT}`);
        });

        if (sslCerts) {
            https.createServer(sslCerts, app).listen(HTTPS_PORT, BIND_HOST, () => {
                console.log(`🔒 HTTPS running on https://localhost:${HTTPS_PORT}`);
            });
        } else {
            console.log('⚠️  HTTPS disabled — SSL certificates not available.');
        }

        // 5. Run initial background jobs (delayed slightly to ensure server is ready)
        setTimeout(() => {
            runActivityCycle().catch((e) => console.error('[Notifications] Startup cycle error:', e.message));
            runWeatherCycle().catch((e) => console.error('[Notifications] Startup weather error:', e.message));
        }, 5000);

    } catch (err) {
        console.error('❌ Application startup failed due to initialization error:', err.message);
        process.exit(1);
    }
}

startServer();