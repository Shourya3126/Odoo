import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { expenseAPI } from '../services/api';
import { Plus, Search, Filter, Receipt } from 'lucide-react';

export default function Expenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const page = parseInt(searchParams.get('page') || '1');

  useEffect(() => { loadExpenses(); }, [page, status]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      if (status) params.status = status;
      if (search) params.search = search;
      const { data } = await expenseAPI.list(params);
      setExpenses(data.expenses);
      setTotal(data.total);
    } catch (err) {
      console.error('Load expenses error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadExpenses();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: 'badge-draft', SUBMITTED: 'badge-submitted',
      PENDING_APPROVAL: 'badge-pending', APPROVED: 'badge-approved', REJECTED: 'badge-rejected',
    };
    return `badge ${map[s] || 'badge-draft'}`;
  };

  const statuses = ['', 'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Expenses</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{total} total</p>
        </div>
        <Link to="/expenses/new" className="btn btn-primary">
          <Plus size={16} /> New Expense
        </Link>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="form-input" placeholder="Search expenses..." style={{ paddingLeft: 38 }} />
        </form>
        <div style={{ display: 'flex', gap: 6 }}>
          {statuses.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setSearchParams({ status: s, page: '1' }); }}
              className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : expenses.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Receipt size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>No expenses found</p>
            <Link to="/expenses/new" className="btn btn-primary btn-sm"><Plus size={14} /> Create Expense</Link>
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Submitted By</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp: any) => (
                  <tr key={exp.id} style={{ cursor: 'pointer' }}
                    onClick={() => window.location.href = `/expenses/${exp.id}`}>
                    <td style={{ fontWeight: 500 }}>{exp.category}</td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exp.description || '-'}
                    </td>
                    <td>{new Date(exp.expense_date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 600 }}>
                      {parseFloat(exp.amount).toLocaleString()} {exp.currency}
                      {exp.converted_amount && exp.currency !== 'USD' && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          ≈ {parseFloat(exp.converted_amount).toLocaleString()} base
                        </div>
                      )}
                    </td>
                    <td><span className={statusBadge(exp.status)}>{exp.status.replace(/_/g, ' ')}</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{exp.user_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {total > 15 && (
              <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'center', gap: 8,
                borderTop: '1px solid var(--border-color)' }}>
                {Array.from({ length: Math.ceil(total / 15) }, (_, i) => (
                  <button key={i} onClick={() => setSearchParams({ page: String(i + 1), status })}
                    className={`btn btn-sm ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
