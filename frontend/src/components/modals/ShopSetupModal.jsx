import { useState } from 'react';
import {
  Building2, Landmark, Plus, Trash2, ChevronRight, ChevronLeft,
  Wallet, CheckCircle2, Loader2, Banknote, ArrowRight, Sparkles,
  DollarSign, CreditCard, AlertCircle
} from 'lucide-react';
import api from '../../api/axios';

/* ── Step Indicator ──────────────────────────────────────────────────────────── */
function StepDot({ step, current, label, icon: Icon }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
        done    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
        active  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30 scale-110' :
                  'border-2 text-[var(--text-muted)]'
      }`}
        style={!done && !active ? { borderColor: 'var(--border-input)' } : {}}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
      </div>
      <span className={`text-xs font-medium hidden sm:block ${
        active ? 'text-brand-400' : done ? 'text-emerald-400' : 'text-[var(--text-muted)]'
      }`}>{label}</span>
    </div>
  );
}

/* ── Bank Account Row ─────────────────────────────────────────────────────────── */
function BankRow({ acct, idx, onChange, onRemove, isOnly }) {
  return (
    <div
      className="p-4 rounded-xl border transition-all"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-input)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center">
            <Landmark className="w-3.5 h-3.5 text-brand-400" />
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Account {idx + 1}
          </span>
        </div>
        {!isOnly && (
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Account Label *
          </label>
          <input
            className="input text-sm"
            placeholder="e.g. Main Business Account"
            value={acct.account_name}
            onChange={e => onChange(idx, 'account_name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Bank Name
          </label>
          <input
            className="input text-sm"
            placeholder="e.g. HBL, Meezan Bank"
            value={acct.bank_name}
            onChange={e => onChange(idx, 'bank_name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Account Number
          </label>
          <input
            className="input text-sm"
            placeholder="Optional"
            value={acct.account_number}
            onChange={e => onChange(idx, 'account_number', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Current Balance (Rs.)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input text-sm"
            placeholder="0.00"
            value={acct.opening_balance}
            onChange={e => onChange(idx, 'opening_balance', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────────── */
export default function ShopSetupModal({ shopName, onComplete }) {
  const { shopParams } = useShopApi();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [bankAccounts, setBankAccounts] = useState([
    { account_name: '', bank_name: '', account_number: '', opening_balance: '' }
  ]);
  const [openingCash, setOpeningCash] = useState('');

  const addAccount = () => setBankAccounts(prev => [
    ...prev,
    { account_name: '', bank_name: '', account_number: '', opening_balance: '' }
  ]);

  const removeAccount = (idx) => setBankAccounts(prev => prev.filter((_, i) => i !== idx));

  const updateAccount = (idx, field, value) => {
    setBankAccounts(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const totalBankBalance = bankAccounts.reduce((s, a) => s + (parseFloat(a.opening_balance) || 0), 0);
  const totalCash = parseFloat(openingCash) || 0;
  const grandTotal = totalBankBalance + totalCash;

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const validAccounts = bankAccounts.filter(a => a.account_name.trim());
      await api.post('/financial-setup', {
        bank_accounts: validAccounts,
        opening_cash: parseFloat(openingCash) || 0,
      });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { step: 1, label: 'Welcome',  icon: Sparkles },
    { step: 2, label: 'Bank',     icon: Landmark },
    { step: 3, label: 'Cash',     icon: Wallet },
    { step: 4, label: 'Confirm',  icon: CheckCircle2 },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-input)' }}
      >
        {/* Gradient top bar */}
        <div className="h-1.5 bg-gradient-to-r from-brand-500 via-purple-500 to-emerald-500" />

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Financial Setup
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{shopName}</p>
            </div>
          </div>

          {/* Steps */}
          <div className="flex items-center justify-between mt-5 px-2">
            {steps.map((s, i) => (
              <div key={s.step} className="flex items-center flex-1">
                <StepDot {...s} current={step} />
                {i < steps.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 rounded-full transition-all duration-500"
                    style={{ backgroundColor: step > s.step ? 'rgb(16,185,129)' : 'var(--border-subtle)' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">

          {/* ── STEP 1: Welcome ── */}
          {step === 1 && (
            <div className="text-center py-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-5
                             border border-brand-500/20">
                <Sparkles className="w-9 h-9 text-brand-400" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Welcome to {shopName}!
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
                Before you begin, let's set up your financial accounts so your cash flow
                and transactions are tracked accurately from day one.
              </p>
              <div className="grid grid-cols-3 gap-3 text-left mb-6">
                {[
                  { icon: Landmark, label: 'Bank Accounts', desc: 'Opening balances', color: 'text-brand-400 bg-brand-500/15' },
                  { icon: Wallet, label: 'Cash in Hand', desc: 'Starting cash', color: 'text-emerald-400 bg-emerald-500/15' },
                  { icon: DollarSign, label: 'Cash Flow', desc: 'Auto-tracked', color: 'text-purple-400 bg-purple-500/15' },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                    <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center mb-2`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── STEP 2: Bank Accounts ── */}
          {step === 2 && (
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Bank Accounts
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Add the bank accounts your business will use. Enter their current balances.
                </p>
              </div>

              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {bankAccounts.map((acct, idx) => (
                  <BankRow
                    key={idx}
                    acct={acct}
                    idx={idx}
                    onChange={updateAccount}
                    onRemove={removeAccount}
                    isOnly={bankAccounts.length === 1}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={addAccount}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-medium transition-all hover:border-brand-500/50 hover:text-brand-400"
                style={{ borderColor: 'var(--border-input)', color: 'var(--text-muted)' }}
              >
                <Plus className="w-4 h-4" /> Add Another Account
              </button>

              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => setStep(1)}
                  className="topbar-btn flex items-center gap-1.5 flex-shrink-0">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button type="button" onClick={() => setStep(3)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Cash in Hand ── */}
          {step === 3 && (
            <div>
              <div className="mb-6">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Cash in Hand
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  How much physical cash does your shop have right now?
                </p>
              </div>

              <div
                className="p-6 rounded-2xl border mb-5 text-center"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-input)' }}
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                  <Banknote className="w-7 h-7 text-emerald-400" />
                </div>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Opening Cash Amount (Rs.)
                </label>
                <div className="relative max-w-xs mx-auto">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Rs.</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input pl-10 text-center text-xl font-bold"
                    placeholder="0"
                    value={openingCash}
                    onChange={e => setOpeningCash(e.target.value)}
                    autoFocus
                  />
                </div>
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  This is the cash physically available in your shop's drawer right now
                </p>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(2)}
                  className="topbar-btn flex items-center gap-1.5 flex-shrink-0">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button type="button" onClick={() => setStep(4)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Review Summary <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Confirm ── */}
          {step === 4 && (
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Confirm Your Setup
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Review your opening balances before saving.
                </p>
              </div>

              {/* Summary cards */}
              <div className="space-y-3 mb-4 max-h-[260px] overflow-y-auto pr-1">
                {/* Bank accounts */}
                {bankAccounts.filter(a => a.account_name.trim()).length > 0 ? (
                  bankAccounts.filter(a => a.account_name.trim()).map((a, i) => (
                    <div key={i}
                      className="flex items-center gap-3 p-3 rounded-xl border"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="w-4 h-4 text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.account_name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.bank_name || 'Bank account'}</p>
                      </div>
                      <p className="text-sm font-bold text-brand-400 flex-shrink-0">
                        Rs. {(parseFloat(a.opening_balance) || 0).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-xl border text-center" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No bank accounts added</p>
                  </div>
                )}

                {/* Cash */}
                <div
                  className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Cash in Hand</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Opening cash balance</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400">
                    Rs. {totalCash.toLocaleString()}
                  </p>
                </div>

                {/* Grand total */}
                <div
                  className="flex items-center gap-3 p-3 rounded-xl border border-brand-500/30"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))' }}
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Total Opening Balance</p>
                  </div>
                  <p className="text-base font-bold text-brand-400">
                    Rs. {grandTotal.toLocaleString()}
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-3 py-2.5 mb-4 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(3)}
                  className="topbar-btn flex items-center gap-1.5 flex-shrink-0" disabled={loading}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Complete Setup</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
