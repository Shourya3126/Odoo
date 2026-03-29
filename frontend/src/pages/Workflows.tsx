import React, { useEffect, useState } from 'react';
import { approvalAPI, userAPI } from '../services/api';
import { useStore } from '../store';
import { Plus, Trash2, ToggleLeft, ToggleRight, GitBranch, Users, Shield, ArrowRight, Settings, CheckCircle2, Play, Users as UsersIcon } from 'lucide-react';

export default function Workflows() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const { showToast, company } = useStore();

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
      case 'MANAGER': return <UsersIcon size={14} />;
      case 'USER': return <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>U</div>;
      case 'ROLE': return <Shield size={14} />;
      default: return null;
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 20px', maxWidth: 1400, margin: '0 auto' }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 900 ? '300px 1fr' : '1fr', gap: 32 }}>

        {/* Global Policy Canvas Dashboard */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Policy Canvas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Manage corporate approval matrices</p>
          
          <div className="glass-card" style={{ padding: 20, marginBottom: 20, background: 'linear-gradient(180deg, var(--bg-primary), var(--bg-secondary))' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>Configuration Overview</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Operating Base</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>{company?.base_currency || 'USD'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Active Workflows</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>{flows.filter(f => f.is_active).length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Total Mapped Users</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{companyUsers.length}</span>
                </div>
            </div>
            <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary" style={{ width: '100%', marginTop: 24 }}>
                <Plus size={16} /> Design New Workflow
            </button>
          </div>

          <div style={{ padding: 16, background: 'rgba(245, 158, 11, 0.05)', borderRadius: 'var(--radius-lg)', border: '1px dashed rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <Play size={16} style={{ color: 'var(--warning)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>Simulation Mode</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Use the preview metrics below each flow to simulate how an expense routes through the swimlanes in real-time.
              </p>
          </div>
        </div>

        {/* Visual Workflow Swimlanes Editor */}
        <div>
            {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : flows.length === 0 ? (
                <div className="glass-card" style={{ padding: 80, textAlign: 'center', borderStyle: 'dashed' }}>
                    <div style={{ width: 64, height: 64, background: 'var(--bg-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <GitBranch size={32} style={{ color: 'var(--primary)' }} />
                    </div>
                    <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>No workflows mapped</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                        Without a policy matrix, all requested expenses bypass routing and auto-approve instantly.
                    </p>
                    <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm"><Plus size={14} /> Design Initial Flow</button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 32 }}>
                {flows.map((flow: any) => (
                    <div key={flow.id} className="glass-card" style={{ padding: 0, overflow: 'hidden', border: flow.is_active ? '1px solid var(--border-color)' : '1px dashed var(--border-color)', opacity: flow.is_active ? 1 : 0.6 }}>
                        
                        {/* Flow Header */}
                        <div style={{ padding: '20px 24px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>{flow.name}</span>
                                    <span className={`badge ${flow.is_active ? 'badge-approved' : 'badge-draft'}`} style={{ marginLeft: 8 }}>
                                        {flow.is_active ? 'Active' : 'Draft Mode'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => handleToggle(flow.id)} className={`btn btn-sm ${flow.is_active ? 'btn-secondary' : 'btn-success'}`} title="Toggle Activation State">
                                    {flow.is_active ? <ToggleRight size={16} /> : <Play size={16} />} 
                                    {flow.is_active ? ' Deactivate' : ' Publish'}
                                </button>
                                <button onClick={() => handleDelete(flow.id)} className="btn btn-sm btn-secondary" style={{ color: 'var(--danger)' }} title="Delete">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Visual Swimlanes */}
                        <div style={{ padding: '32px 24px', background: 'var(--bg-secondary)', overflowX: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'stretch', gap: 16, minWidth: 'min-content' }}>
                                
                                {/* Origin Node */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 140 }}>
                                    <div style={{ width: 100, padding: '16px 12px', background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--primary-light)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                                        <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>$</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Submission</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Employee fires event</div>
                                    </div>
                                    <div style={{ flex: 1, minHeight: 24, width: 2, background: 'var(--border-color)' }}></div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <ArrowRight size={20} style={{ color: 'var(--border-color)' }} />
                                </div>

                                {/* Manager Step (if applicable) */}
                                {flow.is_manager_first && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 200 }}>
                                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: 16, boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border-color)', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>AUTO-ROUTING</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 }}>
                                                    <Users size={16} style={{ color: 'var(--primary)' }} />
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Direct Manager</span>
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>User's assigned manager reviews immediately.</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <ArrowRight size={20} style={{ color: 'var(--border-color)' }} />
                                        </div>
                                    </>
                                )}

                                {/* Designer Steps */}
                                {flow.steps?.map((step: any, i: number) => (
                                    <React.Fragment key={step.id}>
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 240, maxWidth: 280 }}>
                                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '16px', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--primary)', padding: '2px 8px', borderRadius: 12, color: 'white', fontSize: 10, fontWeight: 700 }}>
                                                    STEP {flow.is_manager_first ? i + 2 : i + 1}
                                                </div>
                                                <div style={{ position: 'absolute', top: -10, right: 16, background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 12, color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700, border: '1px solid var(--border-color)' }}>
                                                    {step.step_type}
                                                </div>
                                                
                                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {step.approvers?.map((a: any) => (
                                                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                                            {approverTypeIcon(a.approver_type)}
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {a.approver_type === 'MANAGER' ? 'Dynamic Manager' :
                                                                a.approver_type === 'ROLE' ? 'Department Head' :
                                                                    a.approver_name || 'Specific User'}
                                                                </div>
                                                            </div>
                                                            {a.is_required && <CheckCircle2 size={14} style={{ color: 'var(--danger)' }} title="Required Signer" />}
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                            </div>
                                        </div>
                                        
                                        {i < flow.steps.length - 1 && (
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <ArrowRight size={20} style={{ color: 'var(--border-color)' }} />
                                            </div>
                                        )}
                                    </React.Fragment>
                                ))}

                            </div>
                        </div>

                        {/* Simulation Metrics Bar */}
                        <div style={{ padding: '12px 24px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Requires {flow.approval_percentage}% aggregate consensus to fully clear</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[...Array(Math.floor((flow.approval_percentage / 100) * 5))].map((_, idx) => (
                                    <div key={idx} style={{ width: 16, height: 4, background: 'var(--success)', borderRadius: 2 }} />
                                ))}
                                {[...Array(5 - Math.floor((flow.approval_percentage / 100) * 5))].map((_, idx) => (
                                    <div key={idx} style={{ width: 16, height: 4, background: 'var(--border-color)', borderRadius: 2 }} />
                                ))}
                            </div>
                        </div>

                    </div>
                ))}
                </div>
            )}
        </div>

      </div>

      {/* Editor Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840, padding: 0 }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Settings size={20} style={{ color: 'var(--primary)' }} /> Visual Flow Designer
                </h3>
            </div>
            
            <form onSubmit={handleCreate} style={{ padding: 32 }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
                <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Policy Set Name</label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="form-input" placeholder="e.g., Executive Offsite Policy" required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Global Threshold Base (%)</label>
                  <input type="number" min={0} max={100} value={form.approval_percentage}
                    onChange={(e) => setForm({ ...form, approval_percentage: parseInt(e.target.value) })}
                    className="form-input" />
                </div>
              </div>

              <div style={{ marginBottom: 32, padding: 20, background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_manager_first}
                    onChange={(e) => setForm({ ...form, is_manager_first: e.target.checked })} style={{ width: 18, height: 18 }} />
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>Enforce Manager-First Priority Routing</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Automatically inserts the submitter's direct manager as Step 1.</span>
                  </div>
                </label>
              </div>

              {/* Steps Canvas Area */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <label className="form-label" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Timeline Steps</label>
                  <button type="button" onClick={addStep} className="btn btn-sm btn-secondary" style={{ color: 'var(--primary)' }}>
                    <Plus size={14} /> Add Swimlane Node
                  </button>
                </div>
                
                {form.steps.map((step, si) => (
                  <div key={si} style={{
                    padding: 24, marginBottom: 16, borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    boxShadow: 'var(--shadow-sm)', position: 'relative'
                  }}>
                    <div style={{ position: 'absolute', left: -1, top: 20, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 11, padding: '4px 8px 4px 12px', borderTopRightRadius: 16, borderBottomRightRadius: 16 }}>
                        LANE {si + 1}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20, marginLeft: 60 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Resolution logic:</span>
                        <select value={step.step_type}
                          onChange={(e) => updateStep(si, 'step_type', e.target.value)}
                          className="form-input" style={{ width: 'auto', padding: '6px 16px', fontSize: 13, fontWeight: 600 }}>
                          <option value="SEQUENTIAL">Standard (1-by-1)</option>
                          <option value="PARALLEL">Parallel (Concurrent)</option>
                        </select>
                        {form.steps.length > 1 && (
                          <button type="button" onClick={() => removeStep(si)} className="btn btn-sm btn-secondary" style={{ padding: '6px 12px', color: 'var(--danger)' }}>
                            <Trash2 size={14} /> Remove Lane
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>Assigned Approvers</div>
                        {step.approvers.map((app, ai) => (
                        <div key={ai} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                            <select value={app.approver_type}
                            onChange={(e) => updateApprover(si, ai, 'approver_type', e.target.value)}
                            className="form-input" style={{ width: 140, fontSize: 13 }}>
                            <option value="MANAGER">Direct Manager</option>
                            <option value="USER">Specific Profile</option>
                            <option value="ROLE">Role Target</option>
                            </select>
                            {app.approver_type === 'USER' && (
                            <select value={app.approver_id}
                                onChange={(e) => updateApprover(si, ai, 'approver_id', e.target.value)}
                                className="form-input" style={{ flex: 1, fontSize: 13 }}>
                                <option value="">Select identity...</option>
                                {companyUsers.filter((u: any) => u.role !== 'EMPLOYEE').map((u: any) => (
                                <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
                                ))}
                            </select>
                            )}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={app.is_required}
                                    onChange={(e) => updateApprover(si, ai, 'is_required', e.target.checked)} />
                                Mandatory Signer
                            </label>
                            {step.approvers.length > 1 && (
                            <button type="button" onClick={() => removeApprover(si, ai)} style={{
                                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: 8, borderRadius: 'var(--radius-sm)', color: 'var(--danger)', cursor: 'pointer'
                            }}><Trash2 size={14} /></button>
                            )}
                        </div>
                        ))}
                        <button type="button" onClick={() => addApprover(si)}
                            style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={14} /> Add Additional Approver Card
                        </button>
                    </div>

                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: 24, marginTop: 40 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ paddingLeft: 24, paddingRight: 24 }}>Discard</button>
                <button type="submit" className="btn btn-primary" style={{ paddingLeft: 24, paddingRight: 24 }}>Compile Workflow Config</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
