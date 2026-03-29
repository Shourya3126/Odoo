import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { expenseAPI, approvalAPI } from '../services/api';
import {
  Receipt, CheckCircle, Clock, XCircle, TrendingUp, Plus, ArrowUpRight
} from 'lucide-react';

export default function Dashboard() {
  const { user, company } = useStore();
  const [stats, setStats] = useState({ total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 });
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [expRes, pendRes] = await Promise.all([
        expenseAPI.list({ limit: 5 }),
        user?.role !== 'EMPLOYEE' ? approvalAPI.getPending() : Promise.resolve({ data: { approvals: [] } }),
      ]);
      setRecentExpenses(expRes.data.expenses);
      setPendingApprovals(pendRes.data.approvals?.slice(0, 5) || []);

      // Calculate stats from all expenses
      const allRes = await expenseAPI.list({ limit: 1000 });
      const all = allRes.data.expenses;
      setStats({
        total: all.length,
        draft: all.filter((e: any) => e.status === 'DRAFT').length,
        pending: all.filter((e: any) => ['SUBMITTED', 'PENDING_APPROVAL'].includes(e.status)).length,
        approved: all.filter((e: any) => e.status === 'APPROVED').length,
        rejected: all.filter((e: any) => e.status === 'REJECTED').length,
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Expenses', value: stats.total, icon: Receipt, color: 'var(--primary)', bg: 'rgba(76, 132, 224, 0.12)' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.12)' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'var(--success)', bg: 'rgba(74, 165, 154, 0.12)' },
    { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'var(--danger)', bg: 'rgba(229, 62, 62, 0.12)' },
  ];

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      DRAFT: 'badge-draft', SUBMITTED: 'badge-submitted',
      PENDING_APPROVAL: 'badge-pending', APPROVED: 'badge-approved', REJECTED: 'badge-rejected',
    };
    return `badge ${map[status] || 'badge-draft'}`;
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Here's your expense overview for <strong>{company?.name}</strong>
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {statCards.map((card) => (
          <div key={card.label} className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: card.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <card.icon size={20} style={{ color: card.color }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {loading ? '...' : card.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 900 ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Recent Expenses */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Expenses</h3>
            <Link to="/expenses" className="btn btn-sm btn-secondary">
              View All <ArrowUpRight size={14} />
            </Link>
          </div>
          <div style={{ padding: '8px 0' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : recentExpenses.length === 0 ? (
              <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 12 }}>No expenses yet</p>
                <Link to="/expenses/new" className="btn btn-primary btn-sm">
                  <Plus size={14} /> Create First
                </Link>
              </div>
            ) : (
              recentExpenses.map((exp: any) => (
                <Link key={exp.id} to={`/expenses/${exp.id}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 20px', textDecoration: 'none', color: 'inherit',
                  borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s',
                }} onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                   onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{exp.category}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(exp.expense_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {exp.amount} {exp.currency}
                    </div>
                    <span className={getStatusBadge(exp.status)}>
                      {exp.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Pending Approvals (Manager/Admin) */}
        {user?.role !== 'EMPLOYEE' && (
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Pending Approvals</h3>
              <Link to="/approvals" className="btn btn-sm btn-secondary">
                View All <ArrowUpRight size={14} />
              </Link>
            </div>
            <div style={{ padding: '8px 0' }}>
              {pendingApprovals.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  All clear! No pending approvals.
                </div>
              ) : (
                pendingApprovals.map((a: any) => (
                  <Link key={a.id} to={`/expenses/${a.expense_id}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px', textDecoration: 'none', color: 'inherit',
                    borderBottom: '1px solid var(--border-color)',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{a.submitter_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.category}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {a.amount} {a.currency}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
