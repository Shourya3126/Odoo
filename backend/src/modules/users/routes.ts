import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { generateRandomPassword, createAuditLog } from '../../utils/helpers';
import { isSmtpConfigured, sendPasswordEmail } from '../../utils/email';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';

const router = Router();
router.use(authenticate);

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']),
  manager_id: z.string().uuid().nullable().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']).optional(),
  manager_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

// POST /api/users — Admin creates user with temp password + 24h expiry
router.post('/', authorize('ADMIN'), validate(createUserSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, manager_id } = req.body;
    const companyId = req.tenantId!;

    const existing = await db('users').where({ email, company_id: companyId }).first();
    if (existing) return sendError(res, 'Email already exists in this company', 409);

    const tempPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const [user] = await db('users').insert({
      company_id: companyId, name, email, password_hash: passwordHash,
      role, manager_id: manager_id || null,
      must_reset_password: true, invitation_status: 'PENDING',
      temp_password_expiry: expiry,
    }).returning(['id', 'company_id', 'name', 'email', 'role', 'manager_id', 'is_active',
      'must_reset_password', 'invitation_status', 'created_at']);

    await createAuditLog({
      company_id: companyId, entity_type: 'USER', entity_id: user.id,
      action: 'CREATED', actor_id: req.user!.userId, details: { name, email, role },
    });

    logger.info(`User created: ${email}`, { companyId, role });
    sendSuccess(res, { user, tempPassword }, 201);
  } catch (err) {
    logger.error('Create user error', err);
    sendError(res, 'Internal server error');
  }
});

// GET /api/users
router.get('/', authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const { role, search, page = '1', limit = '20' } = req.query;

    let query = db('users').where({ company_id: companyId })
      .select('id', 'name', 'email', 'role', 'manager_id', 'is_active',
        'invitation_status', 'created_at');

    if (role) query = query.where({ role: role as string });
    if (search) {
      query = query.where(function () {
        this.where('name', 'ilike', `%${search}%`).orWhere('email', 'ilike', `%${search}%`);
      });
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const users = await query.orderBy('created_at', 'desc').limit(parseInt(limit as string)).offset(offset);
    const [{ count }] = await db('users').where({ company_id: companyId }).count();

    const managerIds = users.filter((u: any) => u.manager_id).map((u: any) => u.manager_id);
    const managers = managerIds.length > 0
      ? await db('users').whereIn('id', managerIds).select('id', 'name') : [];
    const managerMap = new Map(managers.map((m: any) => [m.id, m.name]));

    const usersWithManager = users.map((u: any) => ({
      ...u, manager_name: u.manager_id ? managerMap.get(u.manager_id) || null : null,
    }));

    sendSuccess(res, {
      users: usersWithManager, total: parseInt(count as string),
      page: parseInt(page as string), limit: parseInt(limit as string),
    });
  } catch (err) {
    logger.error('List users error', err);
    sendError(res, 'Internal server error');
  }
});

// GET /api/users/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await db('users')
      .where({ id: req.params.id, company_id: req.tenantId })
      .select('id', 'name', 'email', 'role', 'manager_id', 'is_active', 'invitation_status', 'created_at')
      .first();
    if (!user) return sendError(res, 'User not found', 404);
    sendSuccess(res, { user });
  } catch (err) {
    logger.error('Get user error', err);
    sendError(res, 'Internal server error');
  }
});

// PATCH /api/users/:id
router.patch('/:id', authorize('ADMIN'), validate(updateUserSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;
    const updates = req.body;

    const existing = await db('users').where({ id, company_id: companyId }).first();
    if (!existing) return sendError(res, 'User not found', 404);

    await db('users').where({ id, company_id: companyId }).update({
      ...updates, updated_at: db.fn.now(),
    });

    const updatedUser = await db('users').where({ id })
      .select('id', 'name', 'email', 'role', 'manager_id', 'is_active', 'invitation_status', 'created_at')
      .first();

    await createAuditLog({
      company_id: companyId, entity_type: 'USER', entity_id: id,
      action: 'UPDATED', actor_id: req.user!.userId, details: updates,
    });

    sendSuccess(res, { user: updatedUser });
  } catch (err) {
    logger.error('Update user error', err);
    sendError(res, 'Internal server error');
  }
});

// POST /api/users/:id/send-password — with temp expiry + invitation_status tracking
router.post('/:id/send-password', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    if (!isSmtpConfigured()) {
      return sendError(res, 'SMTP is not configured. Set SMTP_USER and SMTP_PASS before sending passwords by email.', 503);
    }

    const { id } = req.params;
    const companyId = req.tenantId!;

    const user = await db('users').where({ id, company_id: companyId }).first();
    if (!user) return sendError(res, 'User not found', 404);

    const tempPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await db('users').where({ id }).update({
      password_hash: passwordHash,
      must_reset_password: true,
      invitation_status: 'SENT',
      temp_password_expiry: expiry,
      invitation_sent: true,
      updated_at: db.fn.now(),
    });

    const emailSent = await sendPasswordEmail(user.email, user.name, tempPassword);
    if (!emailSent) return sendError(res, 'Failed to send password email. Please verify your SMTP settings.', 502);

    await createAuditLog({
      company_id: companyId, entity_type: 'USER', entity_id: id,
      action: 'PASSWORD_SENT', actor_id: req.user!.userId,
    });

    logger.info(`Temp password sent to ${user.email}`, { expiry: expiry.toISOString() });
    sendSuccess(res, { message: `Password sent successfully to ${user.email}` });
  } catch (err) {
    logger.error('Send password error', err);
    sendError(res, 'Internal server error');
  }
});

// GET /api/users/managers/list
router.get('/managers/list', async (req: AuthRequest, res: Response) => {
  try {
    const managers = await db('users')
      .where({ company_id: req.tenantId, is_active: true })
      .whereIn('role', ['MANAGER', 'ADMIN'])
      .select('id', 'name', 'email');
    sendSuccess(res, { managers });
  } catch (err) {
    logger.error('List managers error', err);
    sendError(res, 'Internal server error');
  }
});

export default router;
