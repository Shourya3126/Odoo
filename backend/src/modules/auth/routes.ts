import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../../config/database';
import { config } from '../../config';
import { validate } from '../../middleware/validate';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { getCurrencyForCountry, generateRandomPassword } from '../../utils/helpers';
import { sendForgotPasswordEmail } from '../../utils/email';

const router = Router();

// Validation schemas
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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

// POST /api/auth/signup
router.post('/signup', validate(signupSchema), async (req, res: Response) => {
  try {
    const { companyName, name, email, password, country } = req.body;
    const baseCurrency = getCurrencyForCountry(country);

    // Check if email already exists
    const existingUser = await db('users').where({ email }).first();
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const result = await db.transaction(async (trx) => {
      // Create company
      const [company] = await trx('companies').insert({
        name: companyName,
        country: country.toUpperCase(),
        base_currency: baseCurrency,
      }).returning('*');

      // Create admin user
      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await trx('users').insert({
        company_id: company.id,
        name,
        email,
        password_hash: passwordHash,
        role: 'ADMIN',
      }).returning(['id', 'company_id', 'name', 'email', 'role']);

      // Create default expense categories
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

    // Generate JWT
    const token = jwt.sign(
      {
        userId: result.user.id,
        companyId: result.user.company_id,
        role: result.user.role,
        email: result.user.email,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as string }
    );

    res.status(201).json({
      token,
      user: result.user,
      company: result.company,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await db('users')
      .where({ email, is_active: true })
      .first();

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const company = await db('companies').where({ id: user.company_id }).first();

    const token = jwt.sign(
      {
        userId: user.id,
        companyId: user.company_id,
        role: user.role,
        email: user.email,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as string }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        must_reset_password: user.must_reset_password,
      },
      company,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res: Response) => {
  try {
    const { email } = req.body;

    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) {
      // Don't reveal if email exists
      res.json({ message: 'If the email exists, a temporary password has been sent.' });
      return;
    }

    const tempPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await db('users').where({ id: user.id }).update({
      password_hash: passwordHash,
      must_reset_password: true,
      updated_at: db.fn.now(),
    });

    await sendForgotPasswordEmail(email, user.name, tempPassword);

    res.json({ message: 'If the email exists, a temporary password has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password (authenticated)
router.post('/reset-password', authenticate, validate(resetPasswordSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db('users').where({ id: userId }).update({
      password_hash: passwordHash,
      must_reset_password: false,
      updated_at: db.fn.now(),
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db('users')
      .where({ id: req.user!.userId })
      .select('id', 'name', 'email', 'role', 'company_id', 'must_reset_password', 'manager_id')
      .first();

    const company = await db('companies').where({ id: req.user!.companyId }).first();

    res.json({ user, company });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
