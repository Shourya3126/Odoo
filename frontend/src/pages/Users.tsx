import React, { useEffect, useState } from 'react';
import { userAPI } from '../services/api';
import { useStore } from '../store';
import { Plus, Send, Edit, Search, UserCheck, UserX } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [managers, setManagers] = useState<any[]>([]);
  const { showToast } = useStore();

  const [form, setForm] = useState({ name: '', email: '', role: 'EMPLOYEE', manager_id: '' });

  useEffect(() => { loadUsers(); loadManagers(); }, []);

  const loadUsers = async () => {
    try {
      const { data } = await userAPI.list({ search, limit: 100 });
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadManagers = async () => {
    try { const { data } = await userAPI.getManagers(); setManagers(data.managers || []); }
    catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await userAPI.create({
        ...form,
        manager_id: form.manager_id || null,
      });
      showToast(`User created! Temp password: ${data.tempPassword}`, 'success');
      setShowModal(false);
      setForm({ name: '', email: '', role: 'EMPLOYEE', manager_id: '' });
      loadUsers();
      loadManagers();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create user', 'error');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await userAPI.update(editUser.id, {
        name: form.name, role: form.role,
        manager_id: form.manager_id || null,
      });
      showToast('User updated!', 'success');
      setEditUser(null);
      setShowModal(false);
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const handleSendPassword = async (userId: string) => {
    try {
      const { data } = await userAPI.sendPassword(userId);
      showToast(`Password generated: ${data.tempPassword}`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast('Failed to send password', 'error');
    }
  };

  const handleToggleActive = async (u: any) => {
    try {
      await userAPI.update(u.id, { is_active: !u.is_active });
      showToast(`User ${u.is_active ? 'deactivated' : 'activated'}!`, 'success');
      loadUsers();
    } catch { showToast('Failed to update', 'error'); }
  };

  const openEditModal = (u: any) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, role: u.role, manager_id: u.manager_id || '' });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditUser(null);
    setForm({ name: '', email: '', role: 'EMPLOYEE', manager_id: '' });
    setShowModal(true);
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      ADMIN: 'rgba(239,68,68,0.15)', MANAGER: 'rgba(245,158,11,0.15)', EMPLOYEE: 'rgba(59,130,246,0.15)',
    };
    const textColors: Record<string, string> = {
      ADMIN: '#f87171', MANAGER: '#fbbf24', EMPLOYEE: '#60a5fa',
    };
    return { background: colors[role], color: textColors[role] };
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>User Management</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{total} users</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary"><Plus size={16} /> Add User</button>
      </div>

      {/* Search */}
      <div className="glass-card" style={{ padding: 12, marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); loadUsers(); }} style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="form-input" placeholder="Search by name or email..." style={{ paddingLeft: 38 }} />
        </form>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td>
                    <span className="badge" style={roleBadge(u.role)}>{u.role}</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.manager_name || '-'}</td>
                  <td>
                    {u.is_active ? (
                      <span className="badge badge-approved">Active</span>
                    ) : (
                      <span className="badge badge-rejected">Inactive</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEditModal(u)} className="btn btn-sm btn-secondary" title="Edit">
                        <Edit size={13} />
                      </button>
                      <button onClick={() => handleSendPassword(u.id)} className="btn btn-sm btn-secondary" title="Send Password">
                        <Send size={13} />
                      </button>
                      <button onClick={() => handleToggleActive(u)}
                        className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`} title={u.is_active ? 'Deactivate' : 'Activate'}>
                        {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
              {editUser ? 'Edit User' : 'Create User'}
            </h3>
            <form onSubmit={editUser ? handleUpdate : handleCreate}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="form-input" required />
              </div>
              {!editUser && (
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="form-input" required />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="form-input">
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Manager</label>
                <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className="form-input">
                  <option value="">None</option>
                  {managers.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
