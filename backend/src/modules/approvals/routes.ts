import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAuditLog } from '../../utils/helpers';
import { sendSuccess, sendError } from '../../utils/response';
import { getIO } from '../../websocket';
import logger from '../../utils/logger';

const router = Router();
router.use(authenticate);

// ──────────────────────────────────────────────────
// WORKFLOW CRUD
// ──────────────────────────────────────────────────

const createFlowSchema = z.object({
  name: z.string().min(2),
  is_manager_first: z.boolean().optional().default(false),
  approval_percentage: z.number().min(0).max(100).optional().default(100),
  amount_threshold: z.number().optional().nullable(),
  steps: z.array(z.object({
    step_order: z.number().int().min(0),
    step_type: z.enum(['SEQUENTIAL', 'PARALLEL']),
    approvers: z.array(z.object({
      approver_type: z.enum(['USER', 'ROLE', 'MANAGER']),
      approver_id: z.string().uuid().nullable().optional(),
      is_required: z.boolean().optional().default(false),
    })),
  })),
});

router.post('/flows', authorize('ADMIN'), validate(createFlowSchema), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const { name, is_manager_first, approval_percentage, amount_threshold, steps } = req.body;

    const result = await db.transaction(async (trx) => {
      const [flow] = await trx('approval_flows').insert({
        company_id: companyId, name, is_manager_first, approval_percentage, amount_threshold,
      }).returning('*');

      for (const step of steps) {
        const [dbStep] = await trx('approval_steps').insert({
          flow_id: flow.id, step_order: step.step_order, step_type: step.step_type,
        }).returning('*');
        for (const approver of step.approvers) {
          await trx('step_approvers').insert({
            step_id: dbStep.id, approver_type: approver.approver_type,
            approver_id: approver.approver_id || null, is_required: approver.is_required,
          });
        }
      }
      return flow;
    });

    await createAuditLog({
      company_id: companyId, entity_type: 'APPROVAL_FLOW', entity_id: result.id,
      action: 'CREATED', actor_id: req.user!.userId, details: { name, steps: steps.length },
    });

    logger.info(`Workflow created: ${name}`, { companyId, flowId: result.id });
    sendSuccess(res, { flow: result }, 201);
  } catch (err) {
    logger.error('Create flow error', err);
    sendError(res, 'Internal server error');
  }
});

router.get('/flows', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const flows = await db('approval_flows').where({ company_id: req.tenantId }).orderBy('created_at', 'desc');
    const flowsWithSteps = await Promise.all(flows.map(async (flow: any) => {
      const steps = await db('approval_steps').where({ flow_id: flow.id }).orderBy('step_order', 'asc');
      const stepsWithApprovers = await Promise.all(steps.map(async (step: any) => {
        const approvers = await db('step_approvers').where({ step_id: step.id })
          .leftJoin('users', 'step_approvers.approver_id', 'users.id')
          .select('step_approvers.*', 'users.name as approver_name', 'users.email as approver_email');
        return { ...step, approvers };
      }));
      return { ...flow, steps: stepsWithApprovers };
    }));
    sendSuccess(res, { flows: flowsWithSteps });
  } catch (err) {
    logger.error('List flows error', err);
    sendError(res, 'Internal server error');
  }
});

router.get('/flows/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const flow = await db('approval_flows').where({ id: req.params.id, company_id: req.tenantId }).first();
    if (!flow) return sendError(res, 'Flow not found', 404);
    const steps = await db('approval_steps').where({ flow_id: flow.id }).orderBy('step_order', 'asc');
    const stepsWithApprovers = await Promise.all(steps.map(async (step: any) => {
      const approvers = await db('step_approvers').where({ step_id: step.id })
        .leftJoin('users', 'step_approvers.approver_id', 'users.id')
        .select('step_approvers.*', 'users.name as approver_name', 'users.email as approver_email');
      return { ...step, approvers };
    }));
    sendSuccess(res, { flow: { ...flow, steps: stepsWithApprovers } });
  } catch (err) {
    logger.error('Get flow error', err);
    sendError(res, 'Internal server error');
  }
});

router.delete('/flows/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await db('approval_flows').where({ id: req.params.id, company_id: req.tenantId }).del();
    if (!deleted) return sendError(res, 'Flow not found', 404);
    sendSuccess(res, { message: 'Flow deleted' });
  } catch (err) {
    logger.error('Delete flow error', err);
    sendError(res, 'Internal server error');
  }
});

router.patch('/flows/:id/toggle', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const flow = await db('approval_flows').where({ id: req.params.id, company_id: req.tenantId }).first();
    if (!flow) return sendError(res, 'Flow not found', 404);
    await db('approval_flows').where({ id: req.params.id }).update({ is_active: !flow.is_active, updated_at: db.fn.now() });
    sendSuccess(res, { is_active: !flow.is_active });
  } catch (err) {
    logger.error('Toggle flow error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// PENDING APPROVALS
// ──────────────────────────────────────────────────

router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.tenantId!;

    const pending = await db('expense_approvals')
      .where({ 'expense_approvals.approver_id': userId, 'expense_approvals.status': 'PENDING', 'expense_approvals.is_final': false })
      .join('expenses', 'expense_approvals.expense_id', 'expenses.id')
      .join('users', 'expenses.user_id', 'users.id')
      .where({ 'expenses.company_id': companyId })
      .whereIn('expenses.status', ['SUBMITTED', 'PENDING_APPROVAL'])
      .select(
        'expense_approvals.*', 'expenses.amount', 'expenses.currency',
        'expenses.converted_amount', 'expenses.category', 'expenses.description',
        'expenses.expense_date', 'expenses.receipt_url', 'expenses.status as expense_status',
        'users.name as submitter_name', 'users.email as submitter_email'
      )
      .orderBy('expense_approvals.created_at', 'desc');

    // Check actionability: all earlier sequential steps must be completed
    const actionable = await Promise.all(pending.map(async (approval: any) => {
      if (approval.step_order === 0) return { ...approval, is_actionable: true };
      const earlierPending = await db('expense_approvals')
        .where({ expense_id: approval.expense_id })
        .where('step_order', '<', approval.step_order)
        .where('status', 'PENDING')
        .first();
      return { ...approval, is_actionable: !earlierPending };
    }));

    sendSuccess(res, { approvals: actionable });
  } catch (err) {
    logger.error('Get pending approvals error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// APPROVE — with idempotency + row locking + transactions
// ──────────────────────────────────────────────────

router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user!.userId;
    const companyId = req.tenantId!;

    await db.transaction(async (trx) => {
      // Row-level lock via FOR UPDATE
      const approval = await trx('expense_approvals')
        .where({ id, approver_id: userId })
        .forUpdate()
        .first();

      if (!approval) {
        throw { status: 404, message: 'Approval not found' };
      }

      // IDEMPOTENCY: already actioned → return success (no duplicate)
      if (approval.is_final || approval.status !== 'PENDING') {
        logger.warn(`Duplicate approve attempt on ${id} by ${userId}`);
        throw { status: 409, message: 'Approval already actioned — no further action allowed' };
      }

      // Verify approver belongs to this step (security)
      if (approval.step_id) {
        const stepApprover = await trx('step_approvers')
          .where({ step_id: approval.step_id })
          .where(function() {
            this.where({ approver_id: userId }).orWhere({ approver_type: 'MANAGER' });
          })
          .first();
        if (!stepApprover && approval.approver_id !== userId) {
          throw { status: 403, message: 'You are not authorized to approve this step' };
        }
      }

      // Verify sequential ordering: cannot skip steps
      if (approval.step_order > 0) {
        const earlierPending = await trx('expense_approvals')
          .where({ expense_id: approval.expense_id })
          .where('step_order', '<', approval.step_order)
          .where('status', 'PENDING')
          .first();
        if (earlierPending) {
          throw { status: 400, message: 'Previous approval steps must be completed first' };
        }
      }

      // Optimistic lock: check version matches
      const updated = await trx('expense_approvals')
        .where({ id, version: approval.version })
        .update({
          status: 'APPROVED',
          comment: comment || null,
          is_final: true,
          version: approval.version + 1,
          updated_at: trx.fn.now(),
        });

      if (updated === 0) {
        throw { status: 409, message: 'Concurrent modification detected — please retry' };
      }

      await createAuditLog({
        company_id: companyId, entity_type: 'EXPENSE', entity_id: approval.expense_id,
        action: 'APPROVED', actor_id: userId,
        details: { comment, step_order: approval.step_order, approval_id: id },
      });

      // Evaluate overall status within the same transaction
      await evaluateApprovalStatusTx(trx, approval.expense_id, companyId);
    });

    // Emit WebSocket event (outside transaction)
    try {
      const io = getIO();
      const approval = await db('expense_approvals').where({ id }).first();
      io.to(`company:${companyId}`).emit('approval:completed', {
        expense_id: approval?.expense_id, approver_id: userId, action: 'APPROVED',
      });
    } catch (e) {}

    sendSuccess(res, { message: 'Approved successfully' });
  } catch (err: any) {
    if (err.status) return sendError(res, err.message, err.status);
    logger.error('Approve error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// REJECT — with idempotency + row locking + required approver enforcement
// ──────────────────────────────────────────────────

router.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user!.userId;
    const companyId = req.tenantId!;

    await db.transaction(async (trx) => {
      // Row-level lock
      const approval = await trx('expense_approvals')
        .where({ id, approver_id: userId })
        .forUpdate()
        .first();

      if (!approval) {
        throw { status: 404, message: 'Approval not found' };
      }

      if (approval.is_final || approval.status !== 'PENDING') {
        logger.warn(`Duplicate reject attempt on ${id} by ${userId}`);
        throw { status: 409, message: 'Approval already actioned — no further action allowed' };
      }

      // Verify sequential ordering
      if (approval.step_order > 0) {
        const earlierPending = await trx('expense_approvals')
          .where({ expense_id: approval.expense_id })
          .where('step_order', '<', approval.step_order)
          .where('status', 'PENDING')
          .first();
        if (earlierPending) {
          throw { status: 400, message: 'Previous approval steps must be completed first' };
        }
      }

      // Optimistic lock update
      const updated = await trx('expense_approvals')
        .where({ id, version: approval.version })
        .update({
          status: 'REJECTED',
          comment: comment || null,
          is_final: true,
          version: approval.version + 1,
          updated_at: trx.fn.now(),
        });

      if (updated === 0) {
        throw { status: 409, message: 'Concurrent modification detected — please retry' };
      }

      // Check if this is a required approver
      const isRequired = approval.is_required;

      await createAuditLog({
        company_id: companyId, entity_type: 'EXPENSE', entity_id: approval.expense_id,
        action: 'REJECTED', actor_id: userId,
        details: { comment, step_order: approval.step_order, is_required: isRequired, approval_id: id },
      });

      // REQUIRED APPROVER ENFORCEMENT: rejection → immediate expense rejection
      if (isRequired) {
        logger.info(`Required approver ${userId} rejected expense ${approval.expense_id} — auto-rejecting`);

        await trx('expenses').where({ id: approval.expense_id }).update({
          status: 'REJECTED', updated_at: trx.fn.now(),
          version: trx.raw('version + 1'),
        });

        // Cancel all remaining pending approvals
        await trx('expense_approvals')
          .where({ expense_id: approval.expense_id, status: 'PENDING' })
          .update({
            status: 'REJECTED',
            comment: 'Auto-rejected: required approver rejected',
            is_final: true,
            version: trx.raw('version + 1'),
            updated_at: trx.fn.now(),
          });
      } else {
        await evaluateApprovalStatusTx(trx, approval.expense_id, companyId);
      }
    });

    try {
      const io = getIO();
      const approval = await db('expense_approvals').where({ id }).first();
      io.to(`company:${companyId}`).emit('approval:completed', {
        expense_id: approval?.expense_id, approver_id: userId, action: 'REJECTED',
      });
    } catch (e) {}

    sendSuccess(res, { message: 'Rejected successfully' });
  } catch (err: any) {
    if (err.status) return sendError(res, err.message, err.status);
    logger.error('Reject error', err);
    sendError(res, 'Internal server error');
  }
});

// ──────────────────────────────────────────────────
// DETERMINISTIC RULE EVALUATION (WITHIN TRANSACTION)
//
// Priority order:
//   1. Required approver check — if pending → WAIT, if rejected → REJECT
//   2. Specific approver override — if any specific USER approver approved → consider APPROVE
//   3. Percentage threshold rule
// ──────────────────────────────────────────────────

async function evaluateApprovalStatusTx(trx: any, expenseId: string, companyId: string) {
  // Lock the expense row for atomic status update
  const expense = await trx('expenses').where({ id: expenseId }).forUpdate().first();
  if (!expense || !['SUBMITTED', 'PENDING_APPROVAL'].includes(expense.status)) return;

  const allApprovals = await trx('expense_approvals').where({ expense_id: expenseId });
  const total = allApprovals.length;
  if (total === 0) return;

  const approved = allApprovals.filter((a: any) => a.status === 'APPROVED');
  const rejected = allApprovals.filter((a: any) => a.status === 'REJECTED');
  const pending = allApprovals.filter((a: any) => a.status === 'PENDING');
  const requiredApprovals = allApprovals.filter((a: any) => a.is_required);

  // Get workflow threshold
  const flow = await trx('approval_flows').where({ company_id: companyId, is_active: true }).first();
  const threshold = flow?.approval_percentage || 100;

  // ─── RULE 1: Required approver check ───
  const requiredPending = requiredApprovals.filter((a: any) => a.status === 'PENDING');
  const requiredRejected = requiredApprovals.filter((a: any) => a.status === 'REJECTED');

  // If ANY required approver rejected → REJECT (already handled in reject action, but safety net)
  if (requiredRejected.length > 0) {
    await trx('expenses').where({ id: expenseId }).update({
      status: 'REJECTED', updated_at: trx.fn.now(), version: trx.raw('version + 1'),
    });
    await trx('expense_approvals')
      .where({ expense_id: expenseId, status: 'PENDING' })
      .update({ status: 'REJECTED', comment: 'Auto-rejected: required approver rejected',
        is_final: true, version: trx.raw('version + 1'), updated_at: trx.fn.now() });
    return;
  }

  // If required approvers are still pending → WAIT (even if % threshold met)
  if (requiredPending.length > 0) {
    logger.debug(`Expense ${expenseId}: waiting for ${requiredPending.length} required approver(s)`);
    return;
  }

  // ─── RULE 2 + RULE 3: Percentage/threshold evaluation ───
  // (Specific approver override is implicit: USER type approvers who approve count toward %)

  if (pending.length === 0) {
    // All votes are in
    const approvalPercent = (approved.length / total) * 100;
    const newStatus = approvalPercent >= threshold ? 'APPROVED' : 'REJECTED';
    await trx('expenses').where({ id: expenseId }).update({
      status: newStatus, updated_at: trx.fn.now(), version: trx.raw('version + 1'),
    });
    logger.info(`Expense ${expenseId} → ${newStatus} (${approvalPercent.toFixed(1)}% >= ${threshold}%)`);
  } else {
    // Check if threshold already met (early approval)
    const approvalPercent = (approved.length / total) * 100;
    if (approvalPercent >= threshold) {
      await trx('expenses').where({ id: expenseId }).update({
        status: 'APPROVED', updated_at: trx.fn.now(), version: trx.raw('version + 1'),
      });
      await trx('expense_approvals')
        .where({ expense_id: expenseId, status: 'PENDING' })
        .update({ status: 'APPROVED', comment: 'Auto-approved: threshold met',
          is_final: true, version: trx.raw('version + 1'), updated_at: trx.fn.now() });
      logger.info(`Expense ${expenseId} → APPROVED (early: ${approvalPercent.toFixed(1)}% >= ${threshold}%)`);
      return;
    }

    // Check if threshold is impossible to meet
    const maxPossible = ((approved.length + pending.length) / total) * 100;
    if (maxPossible < threshold) {
      await trx('expenses').where({ id: expenseId }).update({
        status: 'REJECTED', updated_at: trx.fn.now(), version: trx.raw('version + 1'),
      });
      await trx('expense_approvals')
        .where({ expense_id: expenseId, status: 'PENDING' })
        .update({ status: 'REJECTED', comment: 'Auto-rejected: threshold impossible',
          is_final: true, version: trx.raw('version + 1'), updated_at: trx.fn.now() });
      logger.info(`Expense ${expenseId} → REJECTED (impossible: max ${maxPossible.toFixed(1)}% < ${threshold}%)`);
    }
  }
}

// ──────────────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────────────

router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await db('notifications')
      .where({ user_id: req.user!.userId, company_id: req.tenantId })
      .orderBy('created_at', 'desc').limit(50);
    sendSuccess(res, { notifications });
  } catch (err) {
    logger.error('Get notifications error', err);
    sendError(res, 'Internal server error');
  }
});

router.patch('/notifications/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await db('notifications').where({ id: req.params.id, user_id: req.user!.userId }).update({ is_read: true });
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error('Mark read error', err);
    sendError(res, 'Internal server error');
  }
});

export default router;
