const transporter = require('../config/mailer');
require('dotenv').config();

const sendLockoutAlertEmail = async ({ name, email, ip, userAgent, time }) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: '⚠️ AgriTrack — Suspicious Login Attempt Detected',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7f1d1d, #dc2626);
                    padding: 30px; text-align: center; 
                    border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">🌾 AgriTrack</h1>
          <p style="color: #fecaca; margin: 5px 0 0;">Security Alert</p>
        </div>

        <!-- Body -->
        <div style="background: white; padding: 30px; 
                    border: 1px solid #e5e7eb;">
          <h2 style="color: #111827;">Hello, ${name}! 👋</h2>
          
          <!-- Alert Banner -->
          <div style="background: #fef2f2; border: 1px solid #fecaca;
                      border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; color: #dc2626; font-weight: bold; font-size: 15px;">
              🚨 Your account has been locked!
            </p>
            <p style="margin: 8px 0 0; color: #7f1d1d; font-size: 14px;">
              Someone has made <strong>5 failed login attempts</strong> 
              on your AgriTrack account. Your account has been 
              temporarily locked for <strong>15 minutes</strong> 
              for your protection.
            </p>
          </div>

          <!-- Attempt Details -->
          <div style="background: #f9fafb; border-radius: 8px;
                      padding: 16px; margin: 20px 0;
                      border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 8px; color: #374151; 
                      font-weight: bold; font-size: 14px;">
              📋 Attempt Details
            </p>
            <p style="margin: 4px 0; color: #374151; font-size: 14px;">
              🕐 <strong>Time:</strong> ${time}
            </p>
            <p style="margin: 4px 0; color: #374151; font-size: 14px;">
              🌐 <strong>IP Address:</strong> ${ip}
            </p>
            <p style="margin: 4px 0; color: #374151; font-size: 14px;">
              💻 <strong>Device:</strong> ${userAgent}
            </p>
          </div>

          <!-- What to do -->
          <div style="background: #fffbeb; border-left: 4px solid #f59e0b;
                      padding: 12px 16px; border-radius: 4px; margin-top: 20px;">
            <p style="margin: 0 0 6px; color: #92400e; 
                      font-weight: bold; font-size: 14px;">
              🔐 What should you do?
            </p>
            <ul style="margin: 0; padding-left: 16px; 
                       color: #92400e; font-size: 13px; line-height: 1.8;">
              <li>If this was you — wait 15 minutes and try again</li>
              <li>If this was NOT you — change your password immediately</li>
              <li>Contact your administrator if you need help</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 20px; text-align: center;
                    border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;
                    border-top: none;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            © 2024 AgriTrack. Rice Crop Management System.
          </p>
          <p style="color: #d1d5db; font-size: 11px; margin: 4px 0 0;">
            This is an automated security notification.
          </p>
        </div>

      </div>
    `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = sendLockoutAlertEmail;