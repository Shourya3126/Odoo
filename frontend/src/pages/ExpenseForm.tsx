import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { expenseAPI, currencyAPI, ocrAPI } from '../services/api';
import { Upload, Scan, Save, Send, ArrowLeft, Loader2, DollarSign, Receipt } from 'lucide-react';

const CATEGORIES = ['Travel', 'Meals & Entertainment', 'Office Supplies', 'Software & Subscriptions',
  'Transportation', 'Training & Education', 'Miscellaneous'];

export default function ExpenseForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { showToast, company } = useStore();
  const baseCurrency = company?.base_currency || 'USD';

  const [form, setForm] = useState({
    amount: '', currency: baseCurrency, category: CATEGORIES[0],
    description: '', expense_date: new Date().toISOString().split('T')[0],
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [conversion, setConversion] = useState<{ rate: number; converted: number } | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currencies, setCurrencies] = useState<any[]>([]);

  useEffect(() => {
    loadCurrencies();
    if (isEdit) loadExpense();
  }, [id]);

  useEffect(() => {
    if (form.amount && form.currency && form.currency !== baseCurrency) {
      convertCurrency();
    } else {
      setConversion(null);
    }
  }, [form.amount, form.currency]);

  const loadCurrencies = async () => {
    try {
      const { data } = await currencyAPI.getSupported();
      setCurrencies(data.currencies);
    } catch { setCurrencies([{ code: 'USD', name: 'US Dollar' }]); }
  };

  const loadExpense = async () => {
    try {
      const { data } = await expenseAPI.get(id!);
      const exp = data.expense;
      setForm({
        amount: exp.amount.toString(), currency: exp.currency,
        category: exp.category, description: exp.description || '',
        expense_date: exp.expense_date?.split('T')[0] || '',
      });
      if (exp.receipt_url) setReceiptPreview(exp.receipt_url);
    } catch { showToast('Failed to load expense', 'error'); }
  };

  const convertCurrency = async () => {
    try {
      const amt = parseFloat(form.amount);
      if (isNaN(amt) || amt <= 0) return;
      const { data } = await currencyAPI.convert(form.currency, baseCurrency, amt);
      setConversion({ rate: data.rate, converted: data.converted_amount });
    } catch { setConversion(null); }
  };

  const handleOCR = async () => {
    if (!receipt) return;
    setOcrLoading(true);
    try {
      const { data } = await ocrAPI.process(receipt);
      if (data.ocr_success && data.extracted) {
        const { amount, date, vendor, description } = data.extracted;
        setForm((prev) => ({
          ...prev,
          amount: amount ? amount.toString() : prev.amount,
          expense_date: date || prev.expense_date,
          description: description || (vendor ? `${vendor}${prev.description ? ' - ' + prev.description : ''}` : prev.description),
        }));
        showToast('Receipt parsed! Fields auto-filled.', 'success');
      } else {
        showToast('OCR could not extract data. Fill manually.', 'info');
      }
    } catch { showToast('OCR processing failed', 'error'); }
    finally { setOcrLoading(false); }
  };

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceipt(file);
      setReceiptPreview(URL.createObjectURL(file));
      // Auto trigger OCR for max speed
    }
  };

  const handleSubmit = async (status: 'DRAFT' | 'SUBMITTED') => {
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
    setSaving(true);

    try {
      const fd = new FormData();
      fd.append('amount', form.amount);
      fd.append('currency', form.currency);
      fd.append('category', form.category);
      fd.append('description', form.description);
      fd.append('expense_date', form.expense_date);
      fd.append('status', status);
      if (conversion) {
        fd.append('converted_amount', conversion.converted.toString());
        fd.append('conversion_rate', conversion.rate.toString());
      }
      if (receipt) fd.append('receipt', receipt);

      if (isEdit) {
        await expenseAPI.update(id!, fd);
        if (status === 'SUBMITTED') {
          await expenseAPI.submit(id!);
        }
        showToast('Expense updated!', 'success');
      } else {
        await expenseAPI.create(fd);
        showToast(status === 'SUBMITTED' ? 'Expense submitted!' : 'Draft saved!', 'success');
      }
      navigate('/expenses');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to save expense', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => navigate('/expenses')} className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div className="glass-card" style={{ padding: '32px 40px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={20} style={{ color: 'var(--primary)' }} />
          </div>
          {isEdit ? 'Edit Expense' : 'Create New Expense'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 768 ? '1fr 1fr' : '1fr', gap: 40 }}>
          
          {/* Left: OCR / Receipt Camera Flow */}
          <div>
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>1. Smart Receipt Scan</div>
            <div style={{ padding: 40, borderRadius: 'var(--radius-lg)',
              border: '2px dashed var(--border-color)', textAlign: 'center', background: 'var(--bg-primary)',
              transition: 'all 0.2s ease', cursor: 'pointer', height: receiptPreview ? 'auto' : 320, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <input type="file" id="receipt-upload" accept="image/*,application/pdf" onChange={handleReceiptChange}
                style={{ display: 'none' }} />
              <label htmlFor="receipt-upload" style={{ cursor: 'pointer', display: 'block', margin: 0 }}>
                {receiptPreview ? (
                  receipt?.type === 'application/pdf' || receiptPreview.endsWith('.pdf') ? (
                    <div style={{ padding: 40, background: 'rgba(76,132,224,0.1)', borderRadius: 'var(--radius-sm)', color: 'var(--primary)', fontWeight: 500 }}>
                      📄 PDF Ready for Processing
                    </div>
                  ) : (
                    <img src={receiptPreview} alt="Receipt" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 'var(--radius-sm)', margin: '0 auto', boxShadow: 'var(--shadow-sm)' }} />
                  )
                ) : (
                  <div>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(76,132,224,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <Upload size={28} style={{ color: 'var(--primary)' }} />
                    </div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Capture or upload receipt</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Camera, JPG, PNG, PDF (Max 10MB)</p>
                  </div>
                )}
              </label>
            </div>
            {receipt && (
              <button onClick={handleOCR} disabled={ocrLoading} className="btn btn-primary"
                style={{ marginTop: 16, width: '100%', padding: 14 }}>
                {ocrLoading ? <><Loader2 size={16} className="animate-spin" /> Extracting details...</> : <><Scan size={16} /> Auto-fill from Receipt</>}
              </button>
            )}
          </div>

          {/* Right: Form Fields */}
          <div>
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>2. Confirm Details</div>
            
            <div style={{ background: 'var(--bg-primary)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label className="form-label">Total Amount <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                    <input type="number" step="0.01" min="0.01" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="form-input" placeholder="0.00" style={{ paddingLeft: 36, fontSize: 16, fontWeight: 600 }} required />
                  </div>
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="form-input" style={{ fontWeight: 500 }}>
                    {currencies.map((c: any) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              {conversion && (
                <div style={{
                  padding: '12px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 20,
                  background: 'rgba(74, 165, 154, 0.08)', border: '1px solid rgba(74, 165, 154, 0.2)',
                  fontSize: 14, color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: 8
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--success)' }}>≈ {parseFloat(conversion.converted.toFixed(2)).toLocaleString()} {baseCurrency}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(Corporate Rate: {conversion.rate.toFixed(4)})</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="form-input">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Date of Purchase</label>
                <input type="date" value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="form-input" required />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Expense Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="form-input" rows={3} placeholder="E.g., Client dinner with Acme Corp..." />
              </div>
            </div>
          </div>
          
        </div> {/* End Grid */}

        {/* Actions Footer */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
          <button onClick={() => handleSubmit('DRAFT')} disabled={saving} className="btn btn-secondary">
            <Save size={16} /> Save as Draft
          </button>
          <button onClick={() => handleSubmit('SUBMITTED')} disabled={saving} className="btn btn-primary" style={{ paddingLeft: 24, paddingRight: 24 }}>
            <Send size={16} /> {isEdit ? 'Resubmit Expense' : 'Submit Expense'}
          </button>
        </div>

      </div>
    </div>
  );
}
