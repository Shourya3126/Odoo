import nodemailer from 'nodemailer';
import { config } from '../config';

export const isSmtpConfigured = () => Boolean(config.smtp.user && config.smtp.pass);

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  try {
    if (!isSmtpConfigured()) {
      return false;
    }

    await transporter.sendMail({
      from: `"Expense System" <${config.smtp.user}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
};

export const sendPasswordEmail = async (to: string, name: string, password: string): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">Welcome to Expense Management System</h2>
      <p>Hi ${name},</p>
      <p>Your account has been created. Here are your login credentials:</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Temporary Password:</strong> ${password}</p>
      </div>
      <p style="color: #ef4444;">Please change your password upon first login.</p>
      <p>Best regards,<br/>Expense Management Team</p>
    </div>
  `;
  return sendEmail(to, 'Your Account Credentials', html);
};

export const sendForgotPasswordEmail = async (to: string, name: string, tempPassword: string): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">Password Reset</h2>
      <p>Hi ${name},</p>
      <p>A temporary password has been generated for your account:</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      </div>
      <p style="color: #ef4444;">You will be required to change your password upon login.</p>
      <p>Best regards,<br/>Expense Management Team</p>
    </div>
  `;
  return sendEmail(to, 'Password Reset - Temporary Password', html);
};
