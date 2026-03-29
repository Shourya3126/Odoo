import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { expenseAPI, approvalAPI } from '../services/api';
import { useStore } from '../store';
import { ArrowLeft, Edit, Send, CheckCircle, XCircle, Clock, MessageSquare } from 'lucide-react';

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, showToast } = useStore();
  const [expense, setExpense] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvalComment, setApprovalComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadExpense(); }, [id]);

  const loadExpense = async () => {
    try {
      const { data } = await expenseAPI.get(id!);
      setExpense(data.expense);
      setApprovals(data.approvals || []);
      setAuditLogs(data.auditLogs || []);
    } catch { showToast('Failed to load expense', 'error'); }
    finally { setLoading(false); }
  };

  const handleApproval = async (approvalId: string, action: 'approve' | 'reject') => {
    setActionLoading(true);
    try {
      if (action === 'approve') {
        await approvalAPI.approve(approvalId, approvalComment);
      } else {
        await approvalAPI.reject(approvalId, approvalComment);
      }
      showToast(`Expense ${action}d!`, 'success');
      setApprovalComment('');
      loadExpense();
    } catch (err: any) {
      showToast(err.response?.data?.error || `Failed to ${action}`, 'error');
    } finally { setActionLoading(false); }
  };

  const handleSubmit = async () => {
    setActionLoading(true);
    try {
      await expenseAPI.submit(id!);
      showToast('Expense submitted!', 'success');
      loadExpense();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Submit failed', 'error');
    } finally { setActionLoading(false); }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle size={16} style={{ color: 'var(--success)' }} />;
      case 'REJECTED': return <XCircle size={16} style={{ color: 'var(--danger)' }} />;
      default: return <Clock size={16} style={{ color: 'var(--warning)' }} />;
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: 'badge-draft', SUBMITTED: 'badge-submitted',
      PENDING_APPROVAL: 'badge-pending', APPROVED: 'badge-approved', REJECTED: 'badge-rejected',
    };
    return `badge ${map[s] || 'badge-draft'}`;
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!expense) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Expense not found</div>;

  const pendingForMe = approvals.filter(
    (a: any) => a.approver_id === user?.userId && a.status === 'PENDING'
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ display: 'grid', gap: 20 }}>
        {/* Expense Info */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{expense.category}</h2>
              <span className={statusBadge(expense.status)}>{expense.status.replace(/_/g, ' ')}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {parseFloat(expense.amount).toLocaleString()} {expense.currency}
              </div>
              {expense.converted_amount && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  ≈ {parseFloat(expense.converted_amount).toLocaleString()} (rate: {parseFloat(expense.conversion_rate).toFixed(4)})
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Date</div>
              <div style={{ fontSize: 14 }}>{new Date(expense.expense_date).toLocaleDateString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Submitted By</div>
              <div style={{ fontSize: 14 }}>{expense.user_name}</div>
            </div>
            {expense.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Description</div>
                <div style={{ fontSize: 14 }}>{expense.description}</div>
              </div>
            )}
          </div>

          {expense.receipt_url && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Receipt</div>
              <img src={expense.receipt_url} alt="Receipt" style={{
                maxHeight: 200, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)'
              }} />
            </div>
          )}

          {/* Actions for the expense owner */}
          {expense.user_id === user?.userId && expense.status === 'DRAFT' && (
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <Link to={`/expenses/${id}/edit`} className="btn btn-secondary">
                <Edit size={16} /> Edit
              </Link>
              <button onClick={handleSubmit} disabled={actionLoading} className="btn btn-primary">
                <Send size={16} /> Submit
              </button>
            </div>
          )}
        </div>

        {/* Approval Action (for current approver) */}
        {pendingForMe.length > 0 && (
          <div className="glass-card" style={{ padding: 24, border: '1px solid rgba(99,102,241,0.3)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Your Approval Required</h3>
            <div className="form-group">
              <label className="form-label">Comment (optional)</label>
              <textarea value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)}
                className="form-input" rows={2} placeholder="Add a comment..." />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => handleApproval(pendingForMe[0].id, 'approve')}
                disabled={actionLoading} className="btn btn-success">
                <CheckCircle size={16} /> Approve
              </button>
              <button onClick={() => handleApproval(pendingForMe[0].id, 'reject')}
                disabled={actionLoading} className="btn btn-danger">
                <XCircle size={16} /> Reject
              </button>
            </div>
          </div>
        )}

        {/* Approval Timeline */}
        {approvals.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Approval Timeline</h3>
            <div>
              {approvals.map((a: any, i: number) => (
                <div key={a.id} className="timeline-item">
                  <div className={`timeline-dot ${a.status.toLowerCase()}`} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {getStatusIcon(a.status)}
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{a.approver_name}</span>
                      <span className={statusBadge(a.status)} style={{ fontSize: 11 }}>
                        {a.status}
                      </span>
                    </div>
                    {a.comment && (
                      <div style={{
                        fontSize: 13, color: 'var(--text-secondary)', marginTop: 4,
                        display: 'flex', alignItems: 'flex-start', gap: 6
                      }}>
                        <MessageSquare size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-muted)' }} />
                        {a.comment}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(a.updated_at || a.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Log */}
        {auditLogs.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Audit Trail</h3>
            {auditLogs.map((log: any) => (
              <div key={log.id} style={{
                padding: '10px 0', borderBottom: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{log.actor_name}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>{log.action}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
