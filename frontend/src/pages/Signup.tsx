import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';
import { authAPI } from '../services/api';
import { UserPlus, Building2, Mail, Lock, Globe, Eye, EyeOff } from 'lucide-react';

const COUNTRIES = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' }, { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' }, { code: 'AE', name: 'UAE' },
  { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' }, { code: 'CH', name: 'Switzerland' },
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' },
  { code: 'KR', name: 'South Korea' }, { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' }, { code: 'PK', name: 'Pakistan' },
];

export default function Signup() {
  const [form, setForm] = useState({ companyName: '', name: '', email: '', password: '', country: 'US' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await authAPI.signup(form);
      setAuth(data.token, data.user, data.company);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', padding: 16
    }}>
      <div style={{
        position: 'fixed', top: '15%', right: '15%', width: 300, height: 300,
        borderRadius: '50%', background: 'rgba(99, 102, 241, 0.08)', filter: 'blur(80px)', pointerEvents: 'none'
      }} />

      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: 460, padding: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-lg)', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: 'white'
          }}>E</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Create your account</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Start managing expenses for your company</p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171', fontSize: 13
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Company Name</label>
            <div style={{ position: 'relative' }}>
              <Building2 size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input type="text" value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="form-input" placeholder="Acme Inc." required style={{ paddingLeft: 38 }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Your Name</label>
            <input type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="form-input" placeholder="John Doe" required />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="form-input" placeholder="admin@company.com" required style={{ paddingLeft: 38 }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input type={showPassword ? 'text' : 'password'} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="form-input" placeholder="Min 8 characters" required minLength={8}
                style={{ paddingLeft: 38, paddingRight: 38 }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Country</label>
            <div style={{ position: 'relative' }}>
              <Globe size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <select value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="form-input" style={{ paddingLeft: 38 }}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', padding: '12px', marginTop: 8 }}>
            {loading ? 'Creating account...' : <><UserPlus size={16} /> Create Account</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 24 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
