const transporter = require('../config/mailer');
require('dotenv').config();

const sendPasswordResetEmail = async (user, token) => {
    const resetURL = `${process.env.ALLOWED_ORIGIN}/reset-password?token=${token}&email=${user.email}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject: '🔑 AgriTrack — Password Reset Request',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #14532d, #16a34a);
                    padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">🌾 AgriTrack</h1>
          <p style="color: #bbf7d0; margin: 5px 0 0;">Password Reset</p>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827;">Hello, ${user.name}! 👋</h2>
          <p style="color: #6b7280; line-height: 1.6;">
            We received a request to reset your password.
            Click the button below to set a new password.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetURL}"
               style="background: #16a34a; color: white; padding: 14px 32px;
                      border-radius: 8px; text-decoration: none;
                      font-weight: bold; font-size: 16px; display: inline-block;">
              🔑 Reset My Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            Or copy and paste this link:
          </p>
          <p style="background: #f3f4f6; padding: 12px; border-radius: 8px;
                    font-size: 13px; word-break: break-all; color: #374151;">
            ${resetURL}
          </p>
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b;
                      padding: 12px 16px; border-radius: 4px; margin-top: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⚠️ This link expires in <strong>1 hour</strong>.
              If you didn't request this, ignore this email.
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

module.exports = sendPasswordResetEmail;