import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { approvalAPI } from '../services/api';
import { useStore } from '../store';
import { Check, X, Clock, ExternalLink, Shield, MessageSquare, Receipt, AlertCircle } from 'lucide-react';

export default function Approvals() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actioned, setActioned] = useState<Set<string>>(new Set()); 
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
    if (actioned.has(id)) {
      showToast('This approval has already been actioned', 'info');
      return;
    }

    setActionLoading(id);
    try {
      if (action === 'approve') await approvalAPI.approve(id, comment[id]);
      else await approvalAPI.reject(id, comment[id]);
      
      setActioned((prev) => new Set(prev).add(id));
      showToast(`Expense ${action}d!`, 'success');
      
      setTimeout(() => loadApprovals(), 500);
    } catch (err: any) {
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
    <div className="animate-fade-in" style={{ maxWidth: 840, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Inbox</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{approvals.length} requests awaiting your approval</p>
        </div>
      </div>

      {loading ? (
         <div style={{ display: 'grid', gap: 16 }}>
           {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 160 }} />)}
         </div>
      ) : approvals.length === 0 ? (
        <div className="glass-card" style={{ padding: 80, textAlign: 'center', background: 'var(--bg-secondary)' }}>
          <div style={{ width: 80, height: 80, background: 'rgba(74, 165, 154, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
             <Check size={40} style={{ color: 'var(--success)' }} />
          </div>
          <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Inbox Zero!</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>You have no pending approvals remaining.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {approvals.map((a: any) => {
            const isActioned = actioned.has(a.id) || a.is_final;
            
            return (
              <div key={a.id} className="glass-card" style={{
                padding: '24px',
                background: isActioned ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                opacity: isActioned ? 0.6 : 1,
                borderLeft: !isActioned && a.is_actionable ? '3px solid var(--primary)' : '1px solid var(--border-color)',
                transition: 'all 0.3s',
              }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  
                  {/* Left: Avatar */}
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 16, boxShadow: 'var(--shadow-sm)' }}>
                      {a.submitter_name?.charAt(0)?.toUpperCase()}
                    </div>
                  </div>

                  {/* Right: Content Thread */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{a.submitter_name}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>submitted a reimbursement</span>
                          {a.is_required && (
                            <span className="badge" style={{ background: 'rgba(229,62,62,0.1)', color: 'var(--danger)', fontSize: 10 }}>
                              <Shield size={10} style={{ marginRight: 4 }} /> Required Signer
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                           <span>{new Date(a.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}</span>
                           <span>•</span>
                           <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Receipt size={12} /> {a.category}</span>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {parseFloat(a.amount).toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{a.currency}</span>
                        </div>
                        {!a.is_actionable && !isActioned && (
                          <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                            <Clock size={12} /> Pending prior step
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Description bubble (Slack style) */}
                    {a.description && (
                       <div style={{ background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: 'var(--radius-md) var(--radius-md) var(--radius-md) 0', border: '1px solid var(--border-color)', margin: '16px 0', fontSize: 14, color: 'var(--text-dark)' }}>
                         {a.description}
                       </div>
                    )}

                    {/* Actions Panel */}
                    <div style={{ marginTop: 20 }}>
                      {isActioned ? (
                        <div style={{
                          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                          background: 'rgba(74,165,154,0.1)', border: '1px solid rgba(74,165,154,0.2)',
                          fontSize: 13, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <Check size={16} /> Action recorded automatically.
                        </div>
                      ) : a.is_actionable ? (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg-tertiary)', padding: '8px 8px 8px 16px', borderRadius: 'var(--radius-lg)' }}>
                          <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
                          <div style={{ flex: 1 }}>
                            <input type="text" value={comment[a.id] || ''}
                              onChange={(e) => setComment({ ...comment, [a.id]: e.target.value })}
                              className="form-input" placeholder="Type a comment or note..."
                              style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 }} disabled={actionLoading === a.id} />
                          </div>
                          
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Link to={`/expenses/${a.expense_id}`} className="btn btn-secondary btn-sm" style={{ background: 'var(--bg-secondary)' }} title="View Original">
                              <ExternalLink size={14} />
                            </Link>
                            <button onClick={() => handleAction(a.id, 'reject')}
                              disabled={actionLoading === a.id || isActioned} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', background: 'var(--bg-secondary)' }}>
                              <X size={14} style={{ marginRight: 4 }} /> Decline
                            </button>
                            <button onClick={() => handleAction(a.id, 'approve')}
                              disabled={actionLoading === a.id || isActioned} className="btn btn-primary btn-sm">
                              <Check size={14} style={{ marginRight: 4 }} /> Approve
                            </button>
                          </div>
                        </div>
                      ) : (
                         <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                           <AlertCircle size={14} /> Awaiting previous manager approval in the workflow chain.
                         </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
