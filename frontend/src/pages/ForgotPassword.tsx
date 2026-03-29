import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { Mail, ArrowLeft, Send } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', padding: 16
    }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Reset Password</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {sent ? 'A temporary password has been sent to your email.' : 'Enter your email to receive a temporary password.'}
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: 13
          }}>{error}</div>
        )}

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Send size={28} style={{ color: 'var(--success)' }} />
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
              Check your inbox and use the temporary password to log in.
              You'll be asked to change it on your next login.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex' }}>
              <ArrowLeft size={16} /> Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="form-input" placeholder="you@company.com" required style={{ paddingLeft: 38 }} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', padding: '12px' }}>
              {loading ? 'Sending...' : 'Send Temporary Password'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}>
              <Link to="/login" style={{ color: 'var(--primary-light)', textDecoration: 'none' }}>
                <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
