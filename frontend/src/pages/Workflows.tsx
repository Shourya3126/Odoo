import React, { useEffect, useState } from 'react';
import { approvalAPI, userAPI } from '../services/api';
import { useStore } from '../store';
import { Plus, Trash2, ToggleLeft, ToggleRight, GitBranch, Users, User, Shield } from 'lucide-react';

export default function Workflows() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const { showToast } = useStore();

  const [form, setForm] = useState({
    name: '', is_manager_first: false, approval_percentage: 100,
    steps: [{ step_order: 0, step_type: 'SEQUENTIAL' as 'SEQUENTIAL' | 'PARALLEL', approvers: [{ approver_type: 'MANAGER' as string, approver_id: '', is_required: false }] }],
  });

  useEffect(() => { loadFlows(); loadUsers(); }, []);

  const loadFlows = async () => {
    try {
      const { data } = await approvalAPI.getFlows();
      setFlows(data.flows);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    try {
      const { data } = await userAPI.list({ limit: 200 });
      setCompanyUsers(data.users);
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await approvalAPI.createFlow({
        name: form.name,
        is_manager_first: form.is_manager_first,
        approval_percentage: form.approval_percentage,
        steps: form.steps.map((s, i) => ({
          ...s,
          step_order: i,
          approvers: s.approvers.map((a) => ({
            ...a,
            approver_id: a.approver_id || null,
          })),
        })),
      });
      showToast('Workflow created!', 'success');
      setShowModal(false);
      resetForm();
      loadFlows();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create', 'error');
    }
  };

  const resetForm = () => {
    setForm({
      name: '', is_manager_first: false, approval_percentage: 100,
      steps: [{ step_order: 0, step_type: 'SEQUENTIAL', approvers: [{ approver_type: 'MANAGER', approver_id: '', is_required: false }] }],
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    try {
      await approvalAPI.deleteFlow(id);
      showToast('Workflow deleted', 'success');
      loadFlows();
    } catch { showToast('Delete failed', 'error'); }
  };

  const handleToggle = async (id: string) => {
    try {
      await approvalAPI.toggleFlow(id);
      showToast('Status toggled', 'success');
      loadFlows();
    } catch { showToast('Toggle failed', 'error'); }
  };

  const addStep = () => {
    setForm({
      ...form,
      steps: [...form.steps, {
        step_order: form.steps.length, step_type: 'SEQUENTIAL',
        approvers: [{ approver_type: 'USER', approver_id: '', is_required: false }],
      }],
    });
  };

  const removeStep = (idx: number) => {
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) });
  };

  const addApprover = (stepIdx: number) => {
    const steps = [...form.steps];
    steps[stepIdx].approvers.push({ approver_type: 'USER', approver_id: '', is_required: false });
    setForm({ ...form, steps });
  };

  const removeApprover = (stepIdx: number, appIdx: number) => {
    const steps = [...form.steps];
    steps[stepIdx].approvers = steps[stepIdx].approvers.filter((_, i) => i !== appIdx);
    setForm({ ...form, steps });
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const steps = [...form.steps];
    (steps[idx] as any)[field] = value;
    setForm({ ...form, steps });
  };

  const updateApprover = (stepIdx: number, appIdx: number, field: string, value: any) => {
    const steps = [...form.steps];
    (steps[stepIdx].approvers[appIdx] as any)[field] = value;
    setForm({ ...form, steps });
  };

  const approverTypeIcon = (type: string) => {
    switch (type) {
      case 'MANAGER': return <Users size={14} />;
      case 'USER': return <User size={14} />;
      case 'ROLE': return <Shield size={14} />;
      default: return null;
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Approval Workflows</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Configure expense approval chains</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary">
          <Plus size={16} /> New Workflow
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : flows.length === 0 ? (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <GitBranch size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 500 }}>No workflows yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Without a workflow, expenses are auto-approved on submission.
          </p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm"><Plus size={14} /> Create</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {flows.map((flow: any) => (
            <div key={flow.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <GitBranch size={18} style={{ color: 'var(--primary)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{flow.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>{flow.steps?.length || 0} steps</span>
                      {flow.is_manager_first && <span>Manager first</span>}
                      <span>Threshold: {flow.approval_percentage}%</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${flow.is_active ? 'badge-approved' : 'badge-draft'}`}>
                    {flow.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => handleToggle(flow.id)} className="btn btn-sm btn-secondary" title="Toggle">
                    {flow.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <button onClick={() => handleDelete(flow.id)} className="btn btn-sm btn-danger" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Steps */}
              {flow.steps?.map((step: any, i: number) => (
                <div key={step.id} style={{
                  marginLeft: 8, paddingLeft: 16, borderLeft: '2px solid var(--border-color)',
                  marginBottom: 8, paddingBottom: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Step {i + 1} — <span className="badge badge-submitted" style={{ fontSize: 11 }}>{step.step_type}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {step.approvers?.map((a: any) => (
                      <span key={a.id} className="badge" style={{
                        background: 'rgba(99,102,241,0.1)', color: 'var(--primary-light)', fontSize: 12,
                        display: 'flex', alignItems: 'center', gap: 4
                      }}>
                        {approverTypeIcon(a.approver_type)}
                        {a.approver_type === 'MANAGER' ? 'Direct Manager' :
                          a.approver_type === 'ROLE' ? 'Role-based' :
                            a.approver_name || 'User'}
                        {a.is_required && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Create Workflow</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Workflow Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="form-input" placeholder="e.g., Standard Approval" required />
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_manager_first}
                    onChange={(e) => setForm({ ...form, is_manager_first: e.target.checked })} />
                  Manager First
                </label>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label className="form-label" style={{ marginBottom: 2 }}>Approval Threshold %</label>
                  <input type="number" min={0} max={100} value={form.approval_percentage}
                    onChange={(e) => setForm({ ...form, approval_percentage: parseInt(e.target.value) })}
                    className="form-input" />
                </div>
              </div>

              {/* Steps */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label className="form-label" style={{ margin: 0 }}>Steps</label>
                  <button type="button" onClick={addStep} className="btn btn-sm btn-secondary">
                    <Plus size={12} /> Add Step
                  </button>
                </div>
                {form.steps.map((step, si) => (
                  <div key={si} style={{
                    padding: 14, marginBottom: 10, borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)', background: 'var(--bg-input)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Step {si + 1}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={step.step_type}
                          onChange={(e) => updateStep(si, 'step_type', e.target.value)}
                          className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                          <option value="SEQUENTIAL">Sequential</option>
                          <option value="PARALLEL">Parallel</option>
                        </select>
                        {form.steps.length > 1 && (
                          <button type="button" onClick={() => removeStep(si)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {step.approvers.map((app, ai) => (
                      <div key={ai} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <select value={app.approver_type}
                          onChange={(e) => updateApprover(si, ai, 'approver_type', e.target.value)}
                          className="form-input" style={{ width: 120, padding: '6px 8px', fontSize: 12 }}>
                          <option value="MANAGER">Manager</option>
                          <option value="USER">Specific User</option>
                          <option value="ROLE">Role</option>
                        </select>
                        {app.approver_type === 'USER' && (
                          <select value={app.approver_id}
                            onChange={(e) => updateApprover(si, ai, 'approver_id', e.target.value)}
                            className="form-input" style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}>
                            <option value="">Select user...</option>
                            {companyUsers.filter((u: any) => u.role !== 'EMPLOYEE').map((u: any) => (
                              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                          </select>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={app.is_required}
                            onChange={(e) => updateApprover(si, ai, 'is_required', e.target.checked)} />
                          Required
                        </label>
                        {step.approvers.length > 1 && (
                          <button type="button" onClick={() => removeApprover(si, ai)} style={{
                            background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer'
                          }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addApprover(si)}
                      style={{ fontSize: 12, color: 'var(--primary-light)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                      + Add Approver
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Workflow</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
