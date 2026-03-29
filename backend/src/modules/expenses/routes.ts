import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAuditLog } from '../../utils/helpers';
import { getIO } from '../../websocket';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';

const router = Router();
router.use(authenticate);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(config.uploadDir, 'receipts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

const createExpenseSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  category: z.string().min(1),
  description: z.string().optional(),
  expense_date: z.string(),
  converted_amount: z.number().optional(),
  conversion_rate: z.number().optional(),
});

const updateExpenseSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  category: z.string().min(1).optional(),
  description: z.string().optional(),
  expense_date: z.string().optional(),
  converted_amount: z.number().optional(),
  conversion_rate: z.number().optional(),
});

// POST /api/expenses - Create expense
router.post('/', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const userId = req.user!.userId;

    // Parse body (multipart form data may send as strings)
    const amount = parseFloat(req.body.amount);
    const currency = req.body.currency;
    const category = req.body.category;
    const description = req.body.description || '';
    const expense_date = req.body.expense_date;
    const converted_amount = req.body.converted_amount ? parseFloat(req.body.converted_amount) : null;
    const conversion_rate = req.body.conversion_rate ? parseFloat(req.body.conversion_rate) : null;
    const status = req.body.status || 'DRAFT';

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Amount must be positive' });
      return;
    }

    const receipt_url = req.file ? `/uploads/receipts/${req.file.filename}` : null;

    const [expense] = await db('expenses').insert({
      company_id: companyId,
      user_id: userId,
      amount,
      currency: currency.toUpperCase(),
      converted_amount,
      conversion_rate,
      category,
      description,
      expense_date,
      receipt_url,
      status: status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT',
      submitted_at: status === 'SUBMITTED' ? db.fn.now() : null,
    }).returning('*');

    await createAuditLog({
      company_id: companyId,
      entity_type: 'EXPENSE',
      entity_id: expense.id,
      action: 'CREATED',
      actor_id: userId,
      details: { amount, currency, category, status: expense.status },
    });

    // If submitted, trigger approval workflow
    if (expense.status === 'SUBMITTED') {
      await triggerApprovalWorkflow(expense, companyId, userId);
    }

    res.status(201).json({ expense });
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/expenses/:id/submit - Submit a draft expense
router.post('/:id/submit', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;
    const userId = req.user!.userId;

    const expense = await db('expenses')
      .where({ id, company_id: companyId, user_id: userId })
      .first();

    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    if (expense.status !== 'DRAFT') {
      res.status(400).json({ error: 'Only draft expenses can be submitted' });
      return;
    }

    await db('expenses').where({ id }).update({
      status: 'SUBMITTED',
      submitted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    await createAuditLog({
      company_id: companyId,
      entity_type: 'EXPENSE',
      entity_id: id,
      action: 'SUBMITTED',
      actor_id: userId,
    });

    await triggerApprovalWorkflow({ ...expense, id }, companyId, userId);

    const updated = await db('expenses').where({ id }).first();
    
    // Emit WebSocket event
    try {
      const io = getIO();
      io.to(`company:${companyId}`).emit('expense:submitted', { expense: updated });
    } catch (e) {}

    res.json({ expense: updated });
  } catch (err) {
    console.error('Submit expense error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/expenses - List expenses
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { status, category, page = '1', limit = '20', search } = req.query;

    let query = db('expenses')
      .where({ 'expenses.company_id': companyId })
      .leftJoin('users', 'expenses.user_id', 'users.id')
      .select(
        'expenses.*',
        'users.name as user_name',
        'users.email as user_email'
      );

    // Role-based filtering
    if (userRole === 'EMPLOYEE') {
      query = query.where({ 'expenses.user_id': userId });
    } else if (userRole === 'MANAGER') {
      // Manager sees their team's expenses + their own
      query = query.where(function () {
        this.where({ 'expenses.user_id': userId })
          .orWhere({ 'users.manager_id': userId });
      });
    }
    // ADMIN sees all

    if (status) query = query.where({ 'expenses.status': status as string });
    if (category) query = query.where({ 'expenses.category': category as string });
    if (search) {
      query = query.where(function () {
        this.where('expenses.description', 'ilike', `%${search}%`)
          .orWhere('expenses.category', 'ilike', `%${search}%`);
      });
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const expenses = await query
      .orderBy('expenses.created_at', 'desc')
      .limit(parseInt(limit as string))
      .offset(offset);

    // Count total
    let countQuery = db('expenses').where({ company_id: companyId });
    if (userRole === 'EMPLOYEE') countQuery = countQuery.where({ user_id: userId });
    if (status) countQuery = countQuery.where({ status: status as string });
    const [{ count }] = await countQuery.count();

    res.json({
      expenses,
      total: parseInt(count as string),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error('List expenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/expenses/:id - Get expense detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;

    const expense = await db('expenses')
      .where({ 'expenses.id': id, 'expenses.company_id': companyId })
      .leftJoin('users', 'expenses.user_id', 'users.id')
      .select('expenses.*', 'users.name as user_name', 'users.email as user_email')
      .first();

    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    // Get approval timeline
    const approvals = await db('expense_approvals')
      .where({ expense_id: id })
      .leftJoin('users', 'expense_approvals.approver_id', 'users.id')
      .select(
        'expense_approvals.*',
        'users.name as approver_name',
        'users.email as approver_email'
      )
      .orderBy('expense_approvals.step_order', 'asc')
      .orderBy('expense_approvals.created_at', 'asc');

    // Get audit logs
    const auditLogs = await db('audit_logs')
      .where({ entity_type: 'EXPENSE', entity_id: id, company_id: companyId })
      .leftJoin('users', 'audit_logs.actor_id', 'users.id')
      .select('audit_logs.*', 'users.name as actor_name')
      .orderBy('audit_logs.created_at', 'desc');

    res.json({ expense, approvals, auditLogs });
  } catch (err) {
    console.error('Get expense error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/expenses/:id - Update draft expense
router.patch('/:id', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;
    const userId = req.user!.userId;

    const expense = await db('expenses')
      .where({ id, company_id: companyId, user_id: userId })
      .first();

    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    if (expense.status !== 'DRAFT') {
      res.status(400).json({ error: 'Only draft expenses can be edited' });
      return;
    }

    const updates: any = {};
    if (req.body.amount) updates.amount = parseFloat(req.body.amount);
    if (req.body.currency) updates.currency = req.body.currency.toUpperCase();
    if (req.body.category) updates.category = req.body.category;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.expense_date) updates.expense_date = req.body.expense_date;
    if (req.body.converted_amount) updates.converted_amount = parseFloat(req.body.converted_amount);
    if (req.body.conversion_rate) updates.conversion_rate = parseFloat(req.body.conversion_rate);
    if (req.file) updates.receipt_url = `/uploads/receipts/${req.file.filename}`;
    updates.updated_at = db.fn.now();

    await db('expenses').where({ id }).update(updates);

    const updated = await db('expenses').where({ id }).first();
    res.json({ expense: updated });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/expenses/categories/list
router.get('/categories/list', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await db('expense_categories')
      .where({ company_id: req.tenantId, is_active: true })
      .select('id', 'name', 'description');
    res.json({ categories });
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Trigger approval workflow
async function triggerApprovalWorkflow(expense: any, companyId: string, submitterId: string) {
  try {
    // Find active approval flow for the company
    const flow = await db('approval_flows')
      .where({ company_id: companyId, is_active: true })
      .first();

    if (!flow) {
      // No workflow configured — auto-approve
      await db('expenses').where({ id: expense.id }).update({
        status: 'APPROVED',
        updated_at: db.fn.now(),
      });
      return;
    }

    // Update expense to PENDING_APPROVAL
    await db('expenses').where({ id: expense.id }).update({
      status: 'PENDING_APPROVAL',
      updated_at: db.fn.now(),
    });

    // Get steps ordered
    const steps = await db('approval_steps')
      .where({ flow_id: flow.id })
      .orderBy('step_order', 'asc');

    const submitter = await db('users').where({ id: submitterId }).first();
    let allApprovals: any[] = [];

    for (const step of steps) {
      const approvers = await db('step_approvers').where({ step_id: step.id });

      for (const approver of approvers) {
        let approverId: string | null = null;

        if (approver.approver_type === 'MANAGER') {
          approverId = submitter?.manager_id || null;
        } else if (approver.approver_type === 'USER') {
          approverId = approver.approver_id;
        } else if (approver.approver_type === 'ROLE') {
          // Find users with this role in the company
          const roleUsers = await db('users')
            .where({ company_id: companyId, role: 'MANAGER', is_active: true })
            .select('id');
          if (roleUsers.length > 0) {
            approverId = roleUsers[0].id;
          }
        }

        if (approverId && approverId !== submitterId) {
          allApprovals.push({
            expense_id: expense.id,
            step_id: step.id,
            approver_id: approverId,
            status: 'PENDING',
            step_order: step.step_order,
          });
        }
      }
    }

    // If manager_first, insert manager as first step
    if (flow.is_manager_first && submitter?.manager_id) {
      const hasManager = allApprovals.some(a => a.approver_id === submitter.manager_id && a.step_order === 1);
      if (!hasManager) {
        allApprovals.unshift({
          expense_id: expense.id,
          step_id: null,
          approver_id: submitter.manager_id,
          status: 'PENDING',
          step_order: 0,
        });
        // Shift all other step orders
        allApprovals = allApprovals.map((a, i) => ({ ...a, step_order: i }));
      }
    }

    if (allApprovals.length > 0) {
      await db('expense_approvals').insert(allApprovals);

      // Create notifications for first step approvers
      const firstStepOrder = allApprovals[0]?.step_order;
      const firstStepApprovers = allApprovals.filter(a => a.step_order === firstStepOrder);

      for (const a of firstStepApprovers) {
        await db('notifications').insert({
          company_id: companyId,
          user_id: a.approver_id,
          type: 'APPROVAL_REQUIRED',
          title: 'New Expense Approval',
          message: `${submitter?.name} submitted an expense of ${expense.amount} ${expense.currency} for your approval.`,
          metadata: { expense_id: expense.id },
        });
      }
    } else {
      // No approvers found — auto-approve
      await db('expenses').where({ id: expense.id }).update({
        status: 'APPROVED',
        updated_at: db.fn.now(),
      });
    }
  } catch (err) {
    console.error('Trigger approval workflow error:', err);
  }
}

export default router;
