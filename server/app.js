const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const app = express();
app.set('trust proxy', 'loopback');

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

const allowedOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'https://localhost:5173')
    : null;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        if (origin === allowedOrigin) {
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
