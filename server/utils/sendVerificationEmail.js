const transporter = require('../config/mailer');
require('dotenv').config();

const sendVerificationEmail = async (user, token) => {
    const verifyURL = `http://localhost:5000/api/auth/verify-email?token=${token}&email=${user.email}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject: '🌾 AgriTrack — Verify Your Email Address',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #14532d, #16a34a); 
                    padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🌾 AgriTrack</h1>
          <p style="color: #bbf7d0; margin: 5px 0 0;">Rice Crop Management System</p>
        </div>

        <!-- Body -->
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827;">Hello, ${user.name}! 👋</h2>
          <p style="color: #6b7280; line-height: 1.6;">
            Thank you for registering at <strong>AgriTrack</strong>. 
            Please verify your email address to activate your account.
          </p>

          <!-- Verify Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyURL}" 
               style="background: #16a34a; color: white; padding: 14px 32px; 
                      border-radius: 8px; text-decoration: none; 
                      font-weight: bold; font-size: 16px; display: inline-block;">
              ✅ Verify My Email
            </a>
          </div>

          <p style="color: #6b7280; font-size: 14px;">
            Or copy and paste this link in your browser:
          </p>
          <p style="background: #f3f4f6; padding: 12px; border-radius: 8px; 
                    font-size: 13px; word-break: break-all; color: #374151;">
            ${verifyURL}
          </p>

          <!-- Warning -->
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; 
                      padding: 12px 16px; border-radius: 4px; margin-top: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⚠️ This link expires in <strong>24 hours</strong>. 
              If you did not register, ignore this email.
            </p>
          </div>
        </div>

        <!-- Footer -->
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

module.exports = sendVerificationEmail;