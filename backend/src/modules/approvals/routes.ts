import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAuditLog } from '../../utils/helpers';
import { getIO } from '../../websocket';

const router = Router();
router.use(authenticate);

// Workflow CRUD schemas
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

// POST /api/approval-flows - Create workflow
router.post('/flows', authorize('ADMIN'), validate(createFlowSchema), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.tenantId!;
    const { name, is_manager_first, approval_percentage, amount_threshold, steps } = req.body;

    const result = await db.transaction(async (trx) => {
      const [flow] = await trx('approval_flows').insert({
        company_id: companyId,
        name,
        is_manager_first,
        approval_percentage,
        amount_threshold,
      }).returning('*');

      for (const step of steps) {
        const [dbStep] = await trx('approval_steps').insert({
          flow_id: flow.id,
          step_order: step.step_order,
          step_type: step.step_type,
        }).returning('*');

        for (const approver of step.approvers) {
          await trx('step_approvers').insert({
            step_id: dbStep.id,
            approver_type: approver.approver_type,
            approver_id: approver.approver_id || null,
            is_required: approver.is_required,
          });
        }
      }

      return flow;
    });

    await createAuditLog({
      company_id: companyId,
      entity_type: 'APPROVAL_FLOW',
      entity_id: result.id,
      action: 'CREATED',
      actor_id: req.user!.userId,
      details: { name, steps: steps.length },
    });

    res.status(201).json({ flow: result });
  } catch (err) {
    console.error('Create flow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/approval-flows - List flows
router.get('/flows', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const flows = await db('approval_flows')
      .where({ company_id: req.tenantId })
      .orderBy('created_at', 'desc');

    // Fetch steps and approvers for each flow
    const flowsWithSteps = await Promise.all(flows.map(async (flow: any) => {
      const steps = await db('approval_steps')
        .where({ flow_id: flow.id })
        .orderBy('step_order', 'asc');

      const stepsWithApprovers = await Promise.all(steps.map(async (step: any) => {
        const approvers = await db('step_approvers')
          .where({ step_id: step.id })
          .leftJoin('users', 'step_approvers.approver_id', 'users.id')
          .select('step_approvers.*', 'users.name as approver_name', 'users.email as approver_email');
        return { ...step, approvers };
      }));

      return { ...flow, steps: stepsWithApprovers };
    }));

    res.json({ flows: flowsWithSteps });
  } catch (err) {
    console.error('List flows error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/approval-flows/:id
router.get('/flows/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const flow = await db('approval_flows')
      .where({ id: req.params.id, company_id: req.tenantId })
      .first();

    if (!flow) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    const steps = await db('approval_steps')
      .where({ flow_id: flow.id })
      .orderBy('step_order', 'asc');

    const stepsWithApprovers = await Promise.all(steps.map(async (step: any) => {
      const approvers = await db('step_approvers')
        .where({ step_id: step.id })
        .leftJoin('users', 'step_approvers.approver_id', 'users.id')
        .select('step_approvers.*', 'users.name as approver_name', 'users.email as approver_email');
      return { ...step, approvers };
    }));

    res.json({ flow: { ...flow, steps: stepsWithApprovers } });
  } catch (err) {
    console.error('Get flow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/approval-flows/:id
router.delete('/flows/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await db('approval_flows')
      .where({ id: req.params.id, company_id: req.tenantId })
      .del();

    if (!deleted) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    res.json({ message: 'Flow deleted' });
  } catch (err) {
    console.error('Delete flow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/approval-flows/:id/toggle - Toggle active state
router.patch('/flows/:id/toggle', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const flow = await db('approval_flows')
      .where({ id: req.params.id, company_id: req.tenantId })
      .first();

    if (!flow) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    await db('approval_flows')
      .where({ id: req.params.id })
      .update({ is_active: !flow.is_active, updated_at: db.fn.now() });

    res.json({ is_active: !flow.is_active });
  } catch (err) {
    console.error('Toggle flow error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/approvals/pending - Get pending approvals for current user
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.tenantId!;

    const pending = await db('expense_approvals')
      .where({ 'expense_approvals.approver_id': userId, 'expense_approvals.status': 'PENDING' })
      .join('expenses', 'expense_approvals.expense_id', 'expenses.id')
      .join('users', 'expenses.user_id', 'users.id')
      .where({ 'expenses.company_id': companyId })
      .select(
        'expense_approvals.*',
        'expenses.amount',
        'expenses.currency',
        'expenses.converted_amount',
        'expenses.category',
        'expenses.description',
        'expenses.expense_date',
        'expenses.receipt_url',
        'expenses.status as expense_status',
        'users.name as submitter_name',
        'users.email as submitter_email'
      )
      .orderBy('expense_approvals.created_at', 'desc');

    // Check if the approval is actionable (previous sequential steps must be completed)
    const actionable = await Promise.all(pending.map(async (approval: any) => {
      if (approval.step_order === 0) return { ...approval, is_actionable: true };

      // Check if all earlier steps are approved
      const earlierPending = await db('expense_approvals')
        .where({ expense_id: approval.expense_id })
        .where('step_order', '<', approval.step_order)
        .where('status', 'PENDING')
        .first();

      return { ...approval, is_actionable: !earlierPending };
    }));

    res.json({ approvals: actionable });
  } catch (err) {
    console.error('Get pending approvals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/approvals/:id/approve
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user!.userId;
    const companyId = req.tenantId!;

    const approval = await db('expense_approvals')
      .where({ id, approver_id: userId, status: 'PENDING' })
      .first();

    if (!approval) {
      res.status(404).json({ error: 'Approval not found or already actioned' });
      return;
    }

    // Update this approval
    await db('expense_approvals').where({ id }).update({
      status: 'APPROVED',
      comment: comment || null,
      updated_at: db.fn.now(),
    });

    await createAuditLog({
      company_id: companyId,
      entity_type: 'EXPENSE',
      entity_id: approval.expense_id,
      action: 'APPROVAL_APPROVED',
      actor_id: userId,
      details: { comment, step_order: approval.step_order },
    });

    // Check if all approvals for this expense are complete
    await evaluateApprovalStatus(approval.expense_id, companyId);

    // Emit WebSocket events
    try {
      const io = getIO();
      io.to(`company:${companyId}`).emit('approval:completed', {
        expense_id: approval.expense_id,
        approver_id: userId,
        action: 'APPROVED',
      });
    } catch (e) {}

    res.json({ message: 'Approved successfully' });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/approvals/:id/reject
router.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user!.userId;
    const companyId = req.tenantId!;

    const approval = await db('expense_approvals')
      .where({ id, approver_id: userId, status: 'PENDING' })
      .first();

    if (!approval) {
      res.status(404).json({ error: 'Approval not found or already actioned' });
      return;
    }

    // Check if this approver is required
    let isRequired = false;
    if (approval.step_id) {
      const stepApprover = await db('step_approvers')
        .where({ step_id: approval.step_id, approver_id: userId })
        .first();
      isRequired = stepApprover?.is_required || false;
    }

    await db('expense_approvals').where({ id }).update({
      status: 'REJECTED',
      comment: comment || null,
      updated_at: db.fn.now(),
    });

    await createAuditLog({
      company_id: companyId,
      entity_type: 'EXPENSE',
      entity_id: approval.expense_id,
      action: 'APPROVAL_REJECTED',
      actor_id: userId,
      details: { comment, step_order: approval.step_order, is_required: isRequired },
    });

    // If required approver rejects → auto reject the expense
    if (isRequired) {
      await db('expenses').where({ id: approval.expense_id }).update({
        status: 'REJECTED',
        updated_at: db.fn.now(),
      });

      // Cancel remaining pending approvals
      await db('expense_approvals')
        .where({ expense_id: approval.expense_id, status: 'PENDING' })
        .update({ status: 'REJECTED', comment: 'Auto-rejected: required approver rejected', updated_at: db.fn.now() });
    } else {
      await evaluateApprovalStatus(approval.expense_id, companyId);
    }

    try {
      const io = getIO();
      io.to(`company:${companyId}`).emit('approval:completed', {
        expense_id: approval.expense_id,
        approver_id: userId,
        action: 'REJECTED',
      });
    } catch (e) {}

    res.json({ message: 'Rejected successfully' });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Evaluate approval status — percentage/hybrid logic
async function evaluateApprovalStatus(expenseId: string, companyId: string) {
  const allApprovals = await db('expense_approvals')
    .where({ expense_id: expenseId });

  const total = allApprovals.length;
  if (total === 0) return;

  const approved = allApprovals.filter((a: any) => a.status === 'APPROVED').length;
  const rejected = allApprovals.filter((a: any) => a.status === 'REJECTED').length;
  const pending = allApprovals.filter((a: any) => a.status === 'PENDING').length;

  // Get the flow's approval percentage
  const expense = await db('expenses').where({ id: expenseId }).first();
  if (!expense) return;

  const flow = await db('approval_flows')
    .where({ company_id: companyId, is_active: true })
    .first();

  const threshold = flow?.approval_percentage || 100;

  if (pending === 0) {
    // All votes are in
    const approvalPercent = (approved / total) * 100;
    if (approvalPercent >= threshold) {
      await db('expenses').where({ id: expenseId }).update({
        status: 'APPROVED',
        updated_at: db.fn.now(),
      });
    } else {
      await db('expenses').where({ id: expenseId }).update({
        status: 'REJECTED',
        updated_at: db.fn.now(),
      });
    }
  } else if (total > 0) {
    // Check if threshold already met
    const approvalPercent = (approved / total) * 100;
    if (approvalPercent >= threshold) {
      await db('expenses').where({ id: expenseId }).update({
        status: 'APPROVED',
        updated_at: db.fn.now(),
      });
      // Cancel remaining
      await db('expense_approvals')
        .where({ expense_id: expenseId, status: 'PENDING' })
        .update({ status: 'APPROVED', comment: 'Auto-approved: threshold met', updated_at: db.fn.now() });
    }
    // Check if impossible to meet threshold
    const maxPossible = ((approved + pending) / total) * 100;
    if (maxPossible < threshold) {
      await db('expenses').where({ id: expenseId }).update({
        status: 'REJECTED',
        updated_at: db.fn.now(),
      });
      await db('expense_approvals')
        .where({ expense_id: expenseId, status: 'PENDING' })
        .update({ status: 'REJECTED', comment: 'Auto-rejected: threshold impossible', updated_at: db.fn.now() });
    }
  }
}

// GET /api/approvals/notifications - Get notifications
router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const notifications = await db('notifications')
      .where({ user_id: userId, company_id: req.tenantId })
      .orderBy('created_at', 'desc')
      .limit(50);

    res.json({ notifications });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/approvals/notifications/:id/read
router.patch('/notifications/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await db('notifications')
      .where({ id: req.params.id, user_id: req.user!.userId })
      .update({ is_read: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
