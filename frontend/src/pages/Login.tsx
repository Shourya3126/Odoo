import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';
import { authAPI } from '../services/api';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const { data } = await authAPI.login({ email, password });
      setAuth(data.token, data.user, data.company);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      padding: 16
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', top: '20%', left: '10%', width: 300, height: 300,
        borderRadius: '50%', background: 'rgba(99, 102, 241, 0.08)',
        filter: 'blur(80px)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '20%', right: '10%', width: 250, height: 250,
        borderRadius: '50%', background: 'rgba(139, 92, 246, 0.06)',
        filter: 'blur(60px)', pointerEvents: 'none'
      }} />

      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-lg)', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: 'white'
          }}>E</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Sign in to your expense management account
          </p>
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
            <label className="form-label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="form-input" placeholder="you@company.com" required
                style={{ paddingLeft: 38 }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="form-input" placeholder="••••••••" required
                style={{ paddingLeft: 38, paddingRight: 38 }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--primary-light)', textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', padding: '12px' }}>
            {loading ? 'Signing in...' : <><LogIn size={16} /> Sign In</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 24 }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 500 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
