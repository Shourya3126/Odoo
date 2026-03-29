import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { approvalAPI } from '../services/api';
import { useStore } from '../store';
import { CheckCircle, XCircle, Clock, ExternalLink, Shield } from 'lucide-react';

export default function Approvals() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actioned, setActioned] = useState<Set<string>>(new Set()); // Track actioned IDs for idempotency
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
    // IDEMPOTENCY: prevent duplicate clicks
    if (actioned.has(id)) {
      showToast('This approval has already been actioned', 'info');
      return;
    }

    setActionLoading(id);
    try {
      if (action === 'approve') await approvalAPI.approve(id, comment[id]);
      else await approvalAPI.reject(id, comment[id]);
      
      // Mark as FINAL — UI shows status badge, buttons disappear
      setActioned((prev) => new Set(prev).add(id));
      showToast(`Expense ${action}d!`, 'success');
      
      // Refresh list after brief delay so animation is visible
      setTimeout(() => loadApprovals(), 500);
    } catch (err: any) {
      // Handle 409 (already actioned by another user/tab) gracefully
      if (err.response?.status === 409) {
        setActioned((prev) => new Set(prev).add(id));
        showToast('This approval was already processed', 'info');
        setTimeout(() => loadApprovals(), 500);
      } else {
        showToast(err.response?.data?.error || err.message || `Failed to ${action}`, 'error');
      }
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
          {approvals.map((a: any) => {
            const isActioned = actioned.has(a.id) || a.is_final;
            
            return (
              <div key={a.id} className="glass-card" style={{
                padding: 20,
                opacity: isActioned ? 0.6 : 1,
                transition: 'opacity 0.3s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{a.submitter_name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.submitter_email}</span>
                      {a.is_required && (
                        <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 10 }}>
                          <Shield size={10} /> Required
                        </span>
                      )}
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
                    {!a.is_actionable && !isActioned && (
                      <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                        <Clock size={12} style={{ verticalAlign: 'middle' }} /> Waiting for prior approval
                      </div>
                    )}
                  </div>
                </div>

                {/* After action: show status badge instead of buttons */}
                {isActioned ? (
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)',
                    fontSize: 13, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <CheckCircle size={16} /> Action recorded — this approval is final.
                  </div>
                ) : a.is_actionable ? (
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <input type="text" value={comment[a.id] || ''}
                          onChange={(e) => setComment({ ...comment, [a.id]: e.target.value })}
                          className="form-input" placeholder="Add a comment (optional)"
                          style={{ fontSize: 13 }} disabled={actionLoading === a.id} />
                      </div>
                      <button onClick={() => handleAction(a.id, 'approve')}
                        disabled={actionLoading === a.id || isActioned} className="btn btn-success btn-sm">
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => handleAction(a.id, 'reject')}
                        disabled={actionLoading === a.id || isActioned} className="btn btn-danger btn-sm">
                        <XCircle size={14} /> Reject
                      </button>
                      <Link to={`/expenses/${a.expense_id}`} className="btn btn-secondary btn-sm">
                        <ExternalLink size={14} />
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
