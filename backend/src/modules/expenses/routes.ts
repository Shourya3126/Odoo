import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAuditLog } from '../../utils/helpers';
import { sendSuccess, sendError } from '../../utils/response';
import { getIO } from '../../websocket';
import logger from '../../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';

const router = Router();
router.use(authenticate);

// ──────────────────────────────────────────────────
// STRICT STATE MACHINE
// Allowed transitions:
//   DRAFT → SUBMITTED (only owner)
//   SUBMITTED → PENDING_APPROVAL (system only, via workflow trigger)
//   PENDING_APPROVAL → APPROVED / REJECTED (system only, via approval engine)
//   DRAFT is editable, anything else is LOCKED
// ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  'DRAFT': ['SUBMITTED'],
  'SUBMITTED': ['PENDING_APPROVAL', 'APPROVED'], // APPROVED = auto-approve when no workflow
  'PENDING_APPROVAL': ['APPROVED', 'REJECTED'],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

// File upload config
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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Allowed: jpg, jpeg, png, pdf, gif, webp'));
  },
});

// ──────────────────────────────────────────────────
// VALIDATION SCHEMAS
// ──────────────────────────────────────────────────

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CNY', 'CHF', 'SGD',
  'HKD', 'NZD', 'KRW', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'SEK', 'NOK', 'DKK', 'PLN',
  'THB', 'MYR', 'IDR', 'PHP', 'VND', 'EGP', 'NGN', 'KES', 'RUB', 'TRY', 'ILS', 'PKR',
  'BDT', 'LKR', 'NPR', 'TWD', 'CLP', 'COP', 'PEN', 'ARS'];

// ──────────────────────────────────────────────────
// CREATE EXPENSE
// ──────────────────────────────────────────────────

router.post('/', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const userId = req.user!.userId;

    const amount = parseFloat(req.body.amount);
    const currency = (req.body.currency || '').toUpperCase();
    const category = req.body.category;
    const description = req.body.description || '';
    const expense_date = req.body.expense_date;
    const converted_amount = req.body.converted_amount ? parseFloat(req.body.converted_amount) : null;
    const conversion_rate = req.body.conversion_rate ? parseFloat(req.body.conversion_rate) : null;
    const status = req.body.status || 'DRAFT';

    // Strict validation
    if (!amount || amount <= 0) return sendError(res, 'Amount must be a positive number', 400);
    if (isNaN(amount)) return sendError(res, 'Amount must be a valid number', 400);
    if (currency.length !== 3) return sendError(res, 'Currency must be a 3-letter code', 400);
    if (!category || category.trim().length === 0) return sendError(res, 'Category is required', 400);
    if (!expense_date) return sendError(res, 'Expense date is required', 400);

    const receipt_url = req.file ? `/uploads/receipts/${req.file.filename}` : null;

    const [expense] = await db('expenses').insert({
      company_id: companyId, user_id: userId,
      amount, currency, converted_amount, conversion_rate,
      category, description, expense_date, receipt_url,
      status: status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT',
      submitted_at: status === 'SUBMITTED' ? db.fn.now() : null,
      rate_is_fallback: req.body.rate_is_fallback === 'true' || false,
      version: 1,
    }).returning('*');

    await createAuditLog({
      company_id: companyId, entity_type: 'EXPENSE', entity_id: expense.id,
      action: 'CREATED', actor_id: userId,
      details: { amount, currency, category, status: expense.status },
    });

    // If submitted, trigger approval workflow
    if (expense.status === 'SUBMITTED') {
      await triggerApprovalWorkflow(expense, companyId, userId);
    }

    logger.info(`Expense created: ${expense.id}`, { userId, companyId, amount, currency });
    sendSuccess(res, { expense }, 201);
  } catch (err) {
    logger.error('Create expense error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// SUBMIT DRAFT → SUBMITTED (strict transition)
// ──────────────────────────────────────────────────

router.post('/:id/submit', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;
    const userId = req.user!.userId;

    const expense = await db('expenses').where({ id, company_id: companyId, user_id: userId }).first();
    if (!expense) return sendError(res, 'Expense not found', 404);

    // STRICT STATE MACHINE — only DRAFT can be submitted
    if (!isValidTransition(expense.status, 'SUBMITTED')) {
      return sendError(res, `Invalid transition: ${expense.status} → SUBMITTED. Only DRAFT expenses can be submitted.`, 400);
    }

    // Additional validation before submission
    if (!expense.amount || expense.amount <= 0) return sendError(res, 'Cannot submit: invalid amount', 400);
    if (!expense.category) return sendError(res, 'Cannot submit: category is required', 400);

    await db('expenses').where({ id }).update({
      status: 'SUBMITTED', submitted_at: db.fn.now(), updated_at: db.fn.now(),
      version: db.raw('version + 1'),
    });

    await createAuditLog({
      company_id: companyId, entity_type: 'EXPENSE', entity_id: id,
      action: 'SUBMITTED', actor_id: userId,
    });

    await triggerApprovalWorkflow({ ...expense, id }, companyId, userId);

    const updated = await db('expenses').where({ id }).first();

    try {
      const io = getIO();
      io.to(`company:${companyId}`).emit('expense:submitted', { expense: updated });
    } catch (e) {}

    logger.info(`Expense submitted: ${id}`, { userId, companyId });
    sendSuccess(res, { expense: updated });
  } catch (err) {
    logger.error('Submit expense error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// LIST EXPENSES
// ──────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { status, category, page = '1', limit = '20', search } = req.query;

    let query = db('expenses')
      .where({ 'expenses.company_id': companyId })
      .leftJoin('users', 'expenses.user_id', 'users.id')
      .select('expenses.*', 'users.name as user_name', 'users.email as user_email');

    if (userRole === 'EMPLOYEE') {
      query = query.where({ 'expenses.user_id': userId });
    } else if (userRole === 'MANAGER') {
      query = query.where(function () {
        this.where({ 'expenses.user_id': userId }).orWhere({ 'users.manager_id': userId });
      });
    }

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

    let countQuery = db('expenses').where({ company_id: companyId });
    if (userRole === 'EMPLOYEE') countQuery = countQuery.where({ user_id: userId });
    if (status) countQuery = countQuery.where({ status: status as string });
    const [{ count }] = await countQuery.count();

    sendSuccess(res, {
      expenses, total: parseInt(count as string),
      page: parseInt(page as string), limit: parseInt(limit as string),
    });
  } catch (err) {
    logger.error('List expenses error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// GET EXPENSE DETAIL + TIMELINE + AUDIT
// ──────────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;

    const expense = await db('expenses')
      .where({ 'expenses.id': id, 'expenses.company_id': companyId })
      .leftJoin('users', 'expenses.user_id', 'users.id')
      .select('expenses.*', 'users.name as user_name', 'users.email as user_email')
      .first();

    if (!expense) return sendError(res, 'Expense not found', 404);

    const approvals = await db('expense_approvals')
      .where({ expense_id: id })
      .leftJoin('users', 'expense_approvals.approver_id', 'users.id')
      .select('expense_approvals.*', 'users.name as approver_name', 'users.email as approver_email')
      .orderBy('expense_approvals.step_order', 'asc')
      .orderBy('expense_approvals.created_at', 'asc');

    const auditLogs = await db('audit_logs')
      .where({ entity_type: 'EXPENSE', entity_id: id, company_id: companyId })
      .leftJoin('users', 'audit_logs.actor_id', 'users.id')
      .select('audit_logs.*', 'users.name as actor_name')
      .orderBy('audit_logs.created_at', 'desc');

    sendSuccess(res, { expense, approvals, auditLogs });
  } catch (err) {
    logger.error('Get expense error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// UPDATE EXPENSE — only DRAFT is editable
// ──────────────────────────────────────────────────

router.patch('/:id', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.tenantId!;
    const userId = req.user!.userId;

    const expense = await db('expenses').where({ id, company_id: companyId, user_id: userId }).first();
    if (!expense) return sendError(res, 'Expense not found', 404);

    // STRICT: only DRAFT expenses can be edited
    if (expense.status !== 'DRAFT') {
      return sendError(res, `Cannot edit: expense is ${expense.status}. Only DRAFT expenses can be modified.`, 400);
    }

    const updates: any = {};
    if (req.body.amount) {
      const amt = parseFloat(req.body.amount);
      if (isNaN(amt) || amt <= 0) return sendError(res, 'Amount must be a positive number', 400);
      updates.amount = amt;
    }
    if (req.body.currency) updates.currency = req.body.currency.toUpperCase();
    if (req.body.category) updates.category = req.body.category;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.expense_date) updates.expense_date = req.body.expense_date;
    if (req.body.converted_amount) updates.converted_amount = parseFloat(req.body.converted_amount);
    if (req.body.conversion_rate) updates.conversion_rate = parseFloat(req.body.conversion_rate);
    if (req.file) updates.receipt_url = `/uploads/receipts/${req.file.filename}`;
    updates.updated_at = db.fn.now();
    updates.version = db.raw('version + 1');

    await db('expenses').where({ id }).update(updates);
    const updated = await db('expenses').where({ id }).first();

    sendSuccess(res, { expense: updated });
  } catch (err) {
    logger.error('Update expense error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// LIST CATEGORIES
// ──────────────────────────────────────────────────

router.get('/categories/list', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await db('expense_categories')
      .where({ company_id: req.tenantId, is_active: true })
      .select('id', 'name', 'description');
    sendSuccess(res, { categories });
  } catch (err) {
    logger.error('List categories error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// TRIGGER APPROVAL WORKFLOW — enhanced manager-first edge handling
// ──────────────────────────────────────────────────

async function triggerApprovalWorkflow(expense: any, companyId: string, submitterId: string) {
  try {
    const flow = await db('approval_flows').where({ company_id: companyId, is_active: true }).first();

    if (!flow) {
      // No workflow → auto-approve
      await db('expenses').where({ id: expense.id }).update({
        status: 'APPROVED', updated_at: db.fn.now(), version: db.raw('version + 1'),
      });
      logger.info(`Expense ${expense.id} auto-approved (no workflow)`);
      return;
    }

    // Transition: SUBMITTED → PENDING_APPROVAL
    await db('expenses').where({ id: expense.id }).update({
      status: 'PENDING_APPROVAL', updated_at: db.fn.now(), version: db.raw('version + 1'),
    });

    const steps = await db('approval_steps').where({ flow_id: flow.id }).orderBy('step_order', 'asc');
    const submitter = await db('users').where({ id: submitterId }).first();
    let allApprovals: any[] = [];

    for (const step of steps) {
      const approvers = await db('step_approvers').where({ step_id: step.id });

      for (const approver of approvers) {
        let approverId: string | null = null;

        if (approver.approver_type === 'MANAGER') {
          approverId = submitter?.manager_id || null;
          // EDGE CASE: No manager assigned → fallback to Admin
          if (!approverId) {
            const admin = await db('users')
              .where({ company_id: companyId, role: 'ADMIN', is_active: true })
              .whereNot({ id: submitterId })
              .first();
            approverId = admin?.id || null;
            if (approverId) {
              logger.info(`No manager for user ${submitterId}, falling back to admin ${approverId}`);
            }
          }
        } else if (approver.approver_type === 'USER') {
          approverId = approver.approver_id;
        } else if (approver.approver_type === 'ROLE') {
          const roleUsers = await db('users')
            .where({ company_id: companyId, role: 'MANAGER', is_active: true })
            .select('id');
          if (roleUsers.length > 0) approverId = roleUsers[0].id;
        }

        // Cannot be submitter + not already added for this step
        if (approverId && approverId !== submitterId) {
          const alreadyAdded = allApprovals.some(
            (a) => a.approver_id === approverId && a.step_order === step.step_order
          );
          if (!alreadyAdded) {
            allApprovals.push({
              expense_id: expense.id, step_id: step.id, approver_id: approverId,
              status: 'PENDING', step_order: step.step_order,
              is_required: approver.is_required, is_final: false, version: 1,
            });
          }
        }
      }
    }

    // MANAGER-FIRST: insert manager as step 0
    if (flow.is_manager_first) {
      let managerId = submitter?.manager_id || null;

      // EDGE CASE: No manager → fallback to admin
      if (!managerId) {
        const admin = await db('users')
          .where({ company_id: companyId, role: 'ADMIN', is_active: true })
          .whereNot({ id: submitterId })
          .first();
        managerId = admin?.id || null;
      }

      if (managerId) {
        // EDGE CASE: Manager already in later steps → mark as already present (deduplicate)
        const existingInLaterSteps = allApprovals.findIndex((a) => a.approver_id === managerId);
        if (existingInLaterSteps >= 0) {
          // Remove from later step (will be in step 0 instead)
          allApprovals.splice(existingInLaterSteps, 1);
          logger.info(`Manager ${managerId} moved from later step to step 0`);
        }

        // Insert at position 0
        allApprovals.unshift({
          expense_id: expense.id, step_id: null, approver_id: managerId,
          status: 'PENDING', step_order: -1, // Will be renumbered
          is_required: false, is_final: false, version: 1,
        });

        // Renumber all step orders
        allApprovals = allApprovals.map((a, i) => ({ ...a, step_order: i }));
      }
    }

    if (allApprovals.length > 0) {
      await db('expense_approvals').insert(allApprovals);

      // Notify first-step approvers
      const firstStepOrder = allApprovals[0]?.step_order;
      const firstStepApprovers = allApprovals.filter((a) => a.step_order === firstStepOrder);
      for (const a of firstStepApprovers) {
        await db('notifications').insert({
          company_id: companyId, user_id: a.approver_id,
          type: 'APPROVAL_REQUIRED', title: 'New Expense Approval',
          message: `${submitter?.name} submitted an expense of ${expense.amount} ${expense.currency} for approval.`,
          metadata: { expense_id: expense.id },
        });
      }
    } else {
      // No valid approvers → auto-approve
      await db('expenses').where({ id: expense.id }).update({
        status: 'APPROVED', updated_at: db.fn.now(), version: db.raw('version + 1'),
      });
      logger.info(`Expense ${expense.id} auto-approved (no valid approvers)`);
    }
  } catch (err) {
    logger.error('Trigger approval workflow error', err);
  }
}

export default router;
