import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../../config/database';
import { config } from '../../config';
import { validate } from '../../middleware/validate';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { getCurrencyForCountry, generateRandomPassword } from '../../utils/helpers';
import { isSmtpConfigured, sendForgotPasswordEmail } from '../../utils/email';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';

const router = Router();

const signupSchema = z.object({
  companyName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  country: z.string().min(2).max(3),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({ email: z.string().email() });

const resetPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

// POST /api/auth/signup
router.post('/signup', validate(signupSchema), async (req, res: Response) => {
  try {
    const { companyName, name, email, password, country } = req.body;
    const baseCurrency = getCurrencyForCountry(country);

    const existingUser = await db('users').where({ email }).first();
    if (existingUser) return sendError(res, 'Email already registered', 409);

    const result = await db.transaction(async (trx) => {
      const [company] = await trx('companies').insert({
        name: companyName, country: country.toUpperCase(), base_currency: baseCurrency,
      }).returning('*');

      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await trx('users').insert({
        company_id: company.id, name, email, password_hash: passwordHash,
        role: 'ADMIN', invitation_status: 'ACCEPTED',
      }).returning(['id', 'company_id', 'name', 'email', 'role']);

      await trx('expense_categories').insert([
        { company_id: company.id, name: 'Travel' },
        { company_id: company.id, name: 'Meals & Entertainment' },
        { company_id: company.id, name: 'Office Supplies' },
        { company_id: company.id, name: 'Software & Subscriptions' },
        { company_id: company.id, name: 'Transportation' },
        { company_id: company.id, name: 'Training & Education' },
        { company_id: company.id, name: 'Miscellaneous' },
      ]);

      return { company, user };
    });

    const token = jwt.sign(
      { userId: result.user.id, companyId: result.user.company_id, role: result.user.role, email: result.user.email },
      config.jwt.secret, { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    logger.info(`Company created: ${companyName}`, { companyId: result.company.id });
    sendSuccess(res, { token, user: result.user, company: result.company }, 201);
  } catch (err) {
    logger.error('Signup error', err);
    sendError(res, 'Internal server error');
  }
});

// POST /api/auth/login — with temp password expiry check + force reset
router.post('/login', validate(loginSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) return sendError(res, 'Invalid credentials', 401);

    // Check temp password expiry
    if (user.temp_password_expiry && new Date(user.temp_password_expiry) < new Date()) {
      return sendError(res, 'Temporary password has expired. Please request a new one.', 401);
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return sendError(res, 'Invalid credentials', 401);

    const company = await db('companies').where({ id: user.company_id }).first();

    // Mark invitation as ACCEPTED on first login
    if (user.invitation_status !== 'ACCEPTED') {
      await db('users').where({ id: user.id }).update({
        invitation_status: 'ACCEPTED',
        temp_password_expiry: null, // Clear expiry on successful login
        updated_at: db.fn.now(),
      });
    }

    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id, role: user.role, email: user.email },
      config.jwt.secret, { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    logger.info(`User logged in: ${email}`);
    sendSuccess(res, {
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        company_id: user.company_id, must_reset_password: user.must_reset_password,
      },
      company,
    });
  } catch (err) {
    logger.error('Login error', err);
    sendError(res, 'Internal server error');
  }
});

// POST /api/auth/forgot-password — with temp password expiry (24 hours)
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res: Response) => {
  try {
    if (!isSmtpConfigured()) {
      return sendError(res, 'SMTP is not configured. Password reset email is unavailable.', 503);
    }

    const { email } = req.body;
    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) {
      return sendSuccess(res, { message: 'If the email exists, a temporary password has been sent.' });
    }

    const tempPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db('users').where({ id: user.id }).update({
      password_hash: passwordHash,
      must_reset_password: true,
      temp_password_expiry: expiry,
      updated_at: db.fn.now(),
    });

    const emailSent = await sendForgotPasswordEmail(email, user.name, tempPassword);
    if (!emailSent) {
      return sendError(res, 'Failed to send password reset email. Please verify your SMTP settings.', 502);
    }

    logger.info(`Temp password sent to: ${email}`, { expiry: expiry.toISOString() });
    sendSuccess(res, { message: 'If the email exists, a temporary password has been sent.' });
  } catch (err) {
    logger.error('Forgot password error', err);
    sendError(res, 'Internal server error');
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authenticate, validate(resetPasswordSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    const user = await db('users').where({ id: userId }).first();
    if (!user) return sendError(res, 'User not found', 404);

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) return sendError(res, 'Current password is incorrect', 401);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id: userId }).update({
      password_hash: passwordHash, must_reset_password: false,
      temp_password_expiry: null, updated_at: db.fn.now(),
    });

    sendSuccess(res, { message: 'Password updated successfully' });
  } catch (err) {
    logger.error('Reset password error', err);
    sendError(res, 'Internal server error');
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db('users')
      .where({ id: req.user!.userId })
      .select('id', 'name', 'email', 'role', 'company_id', 'must_reset_password', 'manager_id', 'invitation_status')
      .first();
    const company = await db('companies').where({ id: req.user!.companyId }).first();
    sendSuccess(res, { user, company });
  } catch (err) {
    logger.error('Get me error', err);
    sendError(res, 'Internal server error');
  }
});

export default router;
