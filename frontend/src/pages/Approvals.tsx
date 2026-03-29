import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { approvalAPI } from '../services/api';
import { useStore } from '../store';
import { CheckCircle, XCircle, Clock, MessageSquare, ExternalLink } from 'lucide-react';

export default function Approvals() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { showToast } = useStore();

  useEffect(() => { loadApprovals(); }, []);

  const loadApprovals = async () => {
    try {
      const { data } = await approvalAPI.getPending();
      setApprovals(data.approvals);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      if (action === 'approve') await approvalAPI.approve(id, comment[id]);
      else await approvalAPI.reject(id, comment[id]);
      showToast(`Expense ${action}d!`, 'success');
      loadApprovals();
    } catch (err: any) {
      showToast(err.response?.data?.error || `Failed to ${action}`, 'error');
    } finally { setActionLoading(null); }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Pending Approvals</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{approvals.length} awaiting your review</p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : approvals.length === 0 ? (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <CheckCircle size={40} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 500 }}>All caught up!</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>No expenses need your approval right now.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {approvals.map((a: any) => (
            <div key={a.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{a.submitter_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.submitter_email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span>{a.category}</span>
                    <span>{new Date(a.expense_date).toLocaleDateString()}</span>
                    {a.description && <span style={{ color: 'var(--text-muted)' }}>{a.description?.slice(0, 50)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {parseFloat(a.amount).toLocaleString()} {a.currency}
                  </div>
                  {!a.is_actionable && (
                    <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                      <Clock size={12} style={{ verticalAlign: 'middle' }} /> Waiting for prior approval
                    </div>
                  )}
                </div>
              </div>

              {a.is_actionable && (
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <input type="text" value={comment[a.id] || ''}
                        onChange={(e) => setComment({ ...comment, [a.id]: e.target.value })}
                        className="form-input" placeholder="Add a comment (optional)"
                        style={{ fontSize: 13 }} />
                    </div>
                    <button onClick={() => handleAction(a.id, 'approve')}
                      disabled={actionLoading === a.id} className="btn btn-success btn-sm">
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button onClick={() => handleAction(a.id, 'reject')}
                      disabled={actionLoading === a.id} className="btn btn-danger btn-sm">
                      <XCircle size={14} /> Reject
                    </button>
                    <Link to={`/expenses/${a.expense_id}`} className="btn btn-secondary btn-sm">
                      <ExternalLink size={14} />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
