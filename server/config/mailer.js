const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Test connection
transporter.verify((err, success) => {
    if (err) {
        console.error('❌ Email service error:', err.message);
    } else {
        console.log('✅ Email service ready!');
    }
});

module.exports = transporter;