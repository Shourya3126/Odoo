import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { generateRandomPassword, createAuditLog } from '../../utils/helpers';
import { sendPasswordEmail } from '../../utils/email';

const router = Router();

// All routes require auth
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

// POST /api/users - Admin creates user
router.post('/', authorize('ADMIN'), validate(createUserSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, manager_id } = req.body;
    const companyId = req.tenantId!;

    // Check email uniqueness within company
    const existing = await db('users')
      .where({ email, company_id: companyId })
      .first();
    if (existing) {
      res.status(409).json({ error: 'Email already exists in this company' });
      return;
    }

    // Generate temp password
    const tempPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [user] = await db('users').insert({
      company_id: companyId,
      name,
      email,
      password_hash: passwordHash,
      role,
      manager_id: manager_id || null,
      must_reset_password: true,
    }).returning(['id', 'company_id', 'name', 'email', 'role', 'manager_id', 'is_active', 'must_reset_password', 'invitation_sent', 'created_at']);

    await createAuditLog({
      company_id: companyId,
      entity_type: 'USER',
      entity_id: user.id,
      action: 'CREATED',
      actor_id: req.user!.userId,
      details: { name, email, role },
    });

    res.status(201).json({ user, tempPassword });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users - List company users
router.get('/', authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const { role, search, page = '1', limit = '20' } = req.query;

    let query = db('users')
      .where({ company_id: companyId })
      .select('id', 'name', 'email', 'role', 'manager_id', 'is_active', 'invitation_sent', 'created_at');

    if (role) {
      query = query.where({ role: role as string });
    }
    if (search) {
      query = query.where(function () {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
      });
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const users = await query.orderBy('created_at', 'desc').limit(parseInt(limit as string)).offset(offset);

    const [{ count }] = await db('users').where({ company_id: companyId }).count();

    // Fetch manager names
    const managerIds = users.filter((u: any) => u.manager_id).map((u: any) => u.manager_id);
    const managers = managerIds.length > 0
      ? await db('users').whereIn('id', managerIds).select('id', 'name')
      : [];
    const managerMap = new Map(managers.map((m: any) => [m.id, m.name]));

    const usersWithManager = users.map((u: any) => ({
      ...u,
      manager_name: u.manager_id ? managerMap.get(u.manager_id) || null : null,
    }));

    res.json({
      users: usersWithManager,
      total: parseInt(count as string),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await db('users')
      .where({ id: req.params.id, company_id: req.tenantId })
      .select('id', 'name', 'email', 'role', 'manager_id', 'is_active', 'invitation_sent', 'created_at')
      .first();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id - Admin updates user
router.patch('/:id', authorize('ADMIN'), validate(updateUserSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;
    const updates = req.body;

    const existing = await db('users').where({ id, company_id: companyId }).first();
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await db('users').where({ id, company_id: companyId }).update({
      ...updates,
      updated_at: db.fn.now(),
    });

    const updatedUser = await db('users')
      .where({ id })
      .select('id', 'name', 'email', 'role', 'manager_id', 'is_active', 'invitation_sent', 'created_at')
      .first();

    await createAuditLog({
      company_id: companyId,
      entity_type: 'USER',
      entity_id: id,
      action: 'UPDATED',
      actor_id: req.user!.userId,
      details: updates,
    });

    res.json({ user: updatedUser });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/send-password - Send/resend password to user
router.post('/:id/send-password', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;

    const user = await db('users').where({ id, company_id: companyId }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const tempPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await db('users').where({ id }).update({
      password_hash: passwordHash,
      must_reset_password: true,
      invitation_sent: true,
      updated_at: db.fn.now(),
    });

    await sendPasswordEmail(user.email, user.name, tempPassword);

    await createAuditLog({
      company_id: companyId,
      entity_type: 'USER',
      entity_id: id,
      action: 'PASSWORD_SENT',
      actor_id: req.user!.userId,
    });

    res.json({ message: 'Password sent successfully' });
  } catch (err) {
    console.error('Send password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/managers/list - Get all managers for hierarchy assignment
router.get('/managers/list', async (req: AuthRequest, res: Response) => {
  try {
    const managers = await db('users')
      .where({ company_id: req.tenantId, role: 'MANAGER', is_active: true })
      .select('id', 'name', 'email');
    res.json({ managers });
  } catch (err) {
    console.error('List managers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
