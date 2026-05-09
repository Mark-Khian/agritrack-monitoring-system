const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const https = require('https');
const http = require('http');
const cron = require('node-cron');
const generateCerts = require('./config/https');
require('dotenv').config();

const { scheduleBackups } = require('./utils/backup');
const { runActivityCycle, runWeatherCycle } = require('./utils/notificationService');


const app = express();

// ── Security Middlewares ──────────────────
app.use(helmet({
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
app.use(compression());
app.use(morgan(
    process.env.NODE_ENV === 'production' ? 'combined' : 'dev'
));

// Use HTTPS origin in production, HTTP in development
const allowedOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'https://localhost:5173')
    : (process.env.ALLOWED_ORIGIN || 'http://localhost:5173');

app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));


// ── Force HTTPS in production ─────────────
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            return res.redirect(`https://${req.header('host')}${req.url}`);
        }
        next();
    });
}

// ── DB Connection ─────────────────────────
require('./config/db');

// ── Start Backup Scheduler ────────────────
scheduleBackups();

// ── Notification Scheduler ────────────────
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

// Run once at startup so notifications are immediately available
setTimeout(() => {
    runActivityCycle().catch((e) => console.error('[Notifications] Startup cycle error:', e.message));
    runWeatherCycle().catch((e) => console.error('[Notifications] Startup weather error:', e.message));
}, 5000); // 5-second delay lets DB connections stabilise

console.log('🔔 Notification scheduler registered (6h activity/lifecycle, 12h weather)');

// ── Routes ───────────────────────────────
app.use('/api/v1', require('./routes/v1/index'));
app.use('/api', require('./routes/v1/index'));

// ── Test Route ────────────────────────────
app.get('/', (req, res) => {
    res.json({ message: '🌾 Crop Management API is running!' });
});

// ── 404 Handler ──────────────────────────
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found.' });
});

// ── Global Error Handler ──────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong.'
            : err.message
    });
});

// ── Start Server ──────────────────────────
const PORT = process.env.PORT || 5000;
const HTTPS_PORT = process.env.HTTPS_PORT || 5443;

const sslCerts = generateCerts();

// HTTP Server
http.createServer(app).listen(PORT, () => {
    console.log(`🌐 HTTP  running on http://localhost:${PORT}`);
});

// HTTPS Server
if (sslCerts) {
    https.createServer(sslCerts, app).listen(HTTPS_PORT, () => {
        console.log(`🔒 HTTPS running on https://localhost:${HTTPS_PORT}`);
    });
} else {
    console.log('⚠️  HTTPS disabled — SSL certificates not available.');
}