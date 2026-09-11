const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const app = express();
// Trust only the local reverse-proxy hop (Ubuntu Nginx → 127.0.0.1:5000).
// Do not trust arbitrary client-supplied X-Forwarded-For from LAN hosts.
app.set('trust proxy', 'loopback');

// HTTP LAN deployment (Phase 12 Transport B): do not emit HSTS/preload.
// Other Helmet defaults (CSP, frame protection, nosniff, Referrer-Policy) stay on.
app.use(helmet({
    hsts: false
}));
app.use(compression({
    filter: (req, res) => {
        // SSE must not be compressed/buffered.
        if (req.path && (
            req.path.includes('/weather/events')
            || req.path.includes('/notifications/events')
            || req.path.includes('/plantings/events')
        )) {
            return false;
        }
        return compression.filter(req, res);
    },
}));
app.use(morgan(
    process.env.NODE_ENV === 'production' ? 'combined' : 'dev'
));

const { isTrustedOrigin } = require('./config/trustedOrigins');

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }
        if (isTrustedOrigin(origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';
if (process.env.NODE_ENV === 'production' && FORCE_HTTPS) {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            return res.redirect(`https://${req.header('host')}${req.url}`);
        }
        next();
    });
}

app.use('/api/v1', require('./routes/v1/index'));
app.use('/api', require('./routes/v1/index'));

app.get('/', (req, res) => {
    res.json({ message: '🌾 Crop Management API is running!' });
});

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found.' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong.'
            : err.message
    });
});

module.exports = app;
