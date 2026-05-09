const transporter = require('../config/mailer');
require('dotenv').config();

const sendLoginAlertEmail = async ({ name, email, ip, userAgent, time }) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: '🔐 AgriTrack — New Login Detected',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #14532d, #16a34a);
                    padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">🌾 AgriTrack</h1>
          <p style="color: #bbf7d0; margin: 5px 0 0;">Security Alert</p>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827;">Hello, ${name}! 👋</h2>
          <p style="color: #6b7280;">
            A new login was detected on your AgriTrack account.
          </p>
          <div style="background: #f3f4f6; border-radius: 8px; 
                      padding: 16px; margin: 20px 0;">
            <p style="margin: 4px 0; color: #374151;">
              🕐 <strong>Time:</strong> ${time}
            </p>
            <p style="margin: 4px 0; color: #374151;">
              🌐 <strong>IP Address:</strong> ${ip}
            </p>
            <p style="margin: 4px 0; color: #374151;">
              💻 <strong>Device:</strong> ${userAgent}
            </p>
          </div>
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b;
                      padding: 12px 16px; border-radius: 4px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⚠️ If this wasn't you, please change your password immediately
              and contact your administrator.
            </p>
          </div>
        </div>
        <div style="background: #f9fafb; padding: 20px; text-align: center;
                    border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;
                    border-top: none;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            © 2024 AgriTrack. Rice Crop Management System.
          </p>
        </div>
      </div>
    `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = sendLoginAlertEmail;