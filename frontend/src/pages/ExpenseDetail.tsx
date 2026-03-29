import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { expenseAPI, approvalAPI } from '../services/api';
import { useStore } from '../store';
import { ArrowLeft, Edit, Send, CheckCircle, XCircle, Clock, MessageSquare, FileText, Check, X, ShieldAlert } from 'lucide-react';

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

  const getStatusIcon = (status: string, size=16) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle size={size} style={{ color: 'var(--success)' }} />;
      case 'REJECTED': return <XCircle size={size} style={{ color: 'var(--danger)' }} />;
      default: return <Clock size={size} style={{ color: 'var(--warning)' }} />;
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: 'badge-draft', SUBMITTED: 'badge-submitted',
      PENDING_APPROVAL: 'badge-pending', APPROVED: 'badge-approved', REJECTED: 'badge-rejected',
    };
    return `badge ${map[s] || 'badge-draft'}`;
  };

  if (loading) return (
     <div style={{ maxWidth: 840, margin: '0 auto', padding: '40px 0' }}>
         <div className="skeleton" style={{ height: 400, marginBottom: 24 }} />
         <div className="skeleton" style={{ height: 200 }} />
     </div>
  );
  if (!expense) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Expense not found</div>;

  const pendingForMe = approvals.filter(
    (a: any) => a.approver_id === user?.userId && a.status === 'PENDING'
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: 840, margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm" style={{ marginBottom: 24 }}>
        <ArrowLeft size={14} /> Back to List
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 768 ? '2fr 1fr' : '1fr', gap: 24 }}>
        
        {/* Left Column: Expense Detail Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="glass-card" style={{ padding: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>{expense.category}</h2>
                  <span className={statusBadge(expense.status)}>{expense.status.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {parseFloat(expense.amount).toLocaleString()} <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>{expense.currency}</span>
                  </div>
                  {expense.converted_amount && (
                    <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500, marginTop: 4 }}>
                      ≈ {parseFloat(expense.converted_amount).toLocaleString()} Base (Rate: {parseFloat(expense.conversion_rate).toFixed(4)})
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Date of Purchase</div>
                  <div style={{ fontSize: 15, color: 'var(--text-dark)' }}>{new Date(expense.expense_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Submitted By</div>
                  <div style={{ fontSize: 15, color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
                     <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{expense.user_name?.charAt(0)}</div>
                     {expense.user_name}
                  </div>
                </div>
                {expense.description && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Description</div>
                    <div style={{ fontSize: 15, color: 'var(--text-dark)', background: 'var(--bg-primary)', padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>{expense.description}</div>
                  </div>
                )}
              </div>

              {expense.receipt_url && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> Attached Receipt</div>
                  <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                     {expense.receipt_url.endsWith('.pdf') ? (
                          <div style={{ padding: 40, color: 'var(--primary)' }}>📄 PDF Document</div>
                     ) : (
                          <img src={expense.receipt_url} alt="Receipt" style={{ maxHeight: 320, borderRadius: 'var(--radius-sm)', margin: '0 auto', boxShadow: 'var(--shadow-sm)' }} />
                     )}
                  </div>
                </div>
              )}

              {/* Actions for the expense owner */}
              {expense.user_id === user?.userId && expense.status === 'DRAFT' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
                  <Link to={`/expenses/${id}/edit`} className="btn btn-secondary">
                    <Edit size={16} /> Edit Details
                  </Link>
                  <button onClick={handleSubmit} disabled={actionLoading} className="btn btn-primary" style={{ flex: 1 }}>
                    <Send size={16} /> Submit for Approval
                  </button>
                </div>
              )}
            </div>
            
            {/* Approval Action (for current approver) - Slack Style Inbox Input Inline */}
            {pendingForMe.length > 0 && (
              <div className="glass-card" style={{ padding: 24, border: '2px solid var(--primary)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-glow)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <ShieldAlert size={18} style={{ color: 'var(--primary)' }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Your Approval is Required</h3>
                </div>
                
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg-primary)', padding: '8px 8px 8px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ flex: 1 }}>
                    <input type="text" value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)}
                        className="form-input" placeholder="Type a note or explanation..." style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 }} disabled={actionLoading} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleApproval(pendingForMe[0].id, 'reject')}
                            disabled={actionLoading} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', background: 'var(--bg-secondary)' }}>
                            <X size={14} style={{ marginRight: 4 }} /> Decline
                        </button>
                        <button onClick={() => handleApproval(pendingForMe[0].id, 'approve')}
                            disabled={actionLoading} className="btn btn-primary btn-sm">
                            <Check size={14} style={{ marginRight: 4 }} /> Approve
                        </button>
                    </div>
                </div>
              </div>
            )}
        </div>

        {/* Right Column: Timelines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {approvals.length > 0 && (
            <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 24 }}>Approval Flow</h3>
                <div>
                {approvals.map((a: any, i: number) => (
                    <div key={a.id} className="timeline-item">
                    <div className={`timeline-dot ${a.status.toLowerCase()}`} />
                    <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: -6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{a.approver_name}</span>
                            {getStatusIcon(a.status, 14)}
                        </div>
                        {a.comment && (
                        <div style={{
                            fontSize: 13, color: 'var(--text-dark)', marginTop: 8, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                            display: 'flex', alignItems: 'flex-start', gap: 6, border: '1px solid rgba(40,76,84,0.05)'
                        }}>
                            <MessageSquare size={12} style={{ marginTop: 2, flexShrink: 0, color: 'var(--primary)' }} />
                            {a.comment}
                        </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        {a.status === 'PENDING' ? 'Waiting step...' : new Date(a.updated_at || a.created_at).toLocaleString()}
                        </div>
                    </div>
                    </div>
                ))}
                </div>
            </div>
            )}

            {/* Audit Log */}
            {auditLogs.length > 0 && (
            <div className="glass-card" style={{ padding: 24, background: 'var(--bg-primary)', border: '1px dashed var(--border-color)', boxShadow: 'none' }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>Audit Trail</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {auditLogs.map((log: any) => (
                    <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dark)' }}>{log.actor_name}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.action.toLowerCase().replace(/_/g, ' ')}</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(log.created_at).toLocaleString()}
                        </span>
                    </div>
                    ))}
                </div>
            </div>
            )}
        </div>

      </div>
    </div>
  );
}
