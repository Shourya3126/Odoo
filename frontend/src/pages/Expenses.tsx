import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { expenseAPI } from '../services/api';
import { Plus, Search, Filter, Receipt, FileText, Calendar, DollarSign, ChevronRight } from 'lucide-react';
import { useStore } from '../store';

export default function Expenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const page = parseInt(searchParams.get('page') || '1');
  
  const navigate = useNavigate();
  const { company } = useStore();

  useEffect(() => { loadExpenses(); }, [page, status]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 12 };
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
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Your Expenses</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Manage and track your reimbursement claims • {total} total</p>
        </div>
        <Link to="/expenses/new" className="btn btn-primary" style={{ padding: '10px 24px', boxShadow: 'var(--shadow-md)' }}>
          <Plus size={18} /> Add Expense
        </Link>
      </div>

      {/* Filters Area */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 260, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 11, color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="form-input" placeholder="Search by vendor or description..." style={{ paddingLeft: 42, background: 'var(--bg-secondary)' }} />
        </form>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {statuses.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setSearchParams({ status: s, page: '1' }); }}
              className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`} style={{ borderRadius: 20 }}>
              {s ? s.replace('_', ' ') : 'All Expenses'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Cards List */}
      <div style={{ padding: 0 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
             {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 180 }} />)}
          </div>
        ) : expenses.length === 0 ? (
          <div className="glass-card" style={{ padding: 80, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, background: 'var(--bg-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Receipt size={40} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No expenses found</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>Get started by creating your first expense report.</p>
            <Link to="/expenses/new" className="btn btn-primary"><Plus size={16} /> Add Expense</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                {expenses.map((exp: any) => (
                  <div key={exp.id} onClick={() => navigate(`/expenses/${exp.id}`)}
                    className="glass-card" style={{ cursor: 'pointer', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    
                    {/* Card Header: Amount & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                {exp.currency === 'USD' ? '$' : exp.currency === 'EUR' ? '€' : exp.currency === 'GBP' ? '£' : ''}
                                {parseFloat(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{exp.currency}</span>
                            </div>
                            {exp.converted_amount && exp.currency !== company?.base_currency && (
                                <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, marginTop: 4 }}>
                                    ≈ {parseFloat(exp.converted_amount).toLocaleString()} {company?.base_currency} Base
                                </div>
                            )}
                        </div>
                        <span className={statusBadge(exp.status)}>{exp.status.replace(/_/g, ' ')}</span>
                    </div>

                    {/* Meta Data */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>
                            <FileText size={14} style={{ color: 'var(--primary-light)' }} /> {exp.category}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                            <Calendar size={14} /> {new Date(exp.expense_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                    </div>

                    {/* Footer Description */}
                    <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{exp.description || 'No description provided'}</span>
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)', minWidth: 14 }} />
                    </div>

                  </div>
                ))}
            </div>

            {/* Pagination Grid Standard */}
            {total > 12 && (
              <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center', gap: 8 }}>
                {Array.from({ length: Math.ceil(total / 12) }, (_, i) => (
                  <button key={i} onClick={() => setSearchParams({ page: String(i + 1), status })}
                    className={`btn btn-sm ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ minWidth: 32, borderRadius: 'var(--radius-md)' }}>
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
