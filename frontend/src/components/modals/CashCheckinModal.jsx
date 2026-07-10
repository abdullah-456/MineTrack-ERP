import { useState } from 'react';
import { Wallet, Loader2, CheckCircle2, AlertCircle, Banknote, Clock } from 'lucide-react';
import api from '../../api/axios';

export default function CashCheckinModal({ shopName, onComplete }) {
  const [cash, setCash] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toLocaleDateString('en-PK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const handleSubmit = async () => {
    if (!cash && cash !== '0') {
      setError('Please enter the cash amount (0 is also valid)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/cash-sessions', {
        opening_cash: parseFloat(cash) || 0,
        notes: notes.trim() || null,
      });
      onComplete();
    } catch (err) {
      if (err.response?.status === 409) {
        // Already recorded — treat as success
        onComplete();
        return;
      }
      setError(err.response?.data?.message || 'Could not save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Allow skipping but note it — just close without recording
    onComplete();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-input)' }}
      >
        {/* Green top accent */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

        <div className="p-6">
          {/* Icon + Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20
                            border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Good Morning! 🌅
            </h2>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Daily Cash Check-In
            </p>
          </div>

          {/* Date badge */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl mb-5"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            <Clock className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{today}</span>
          </div>

          <p className="text-sm text-center mb-5" style={{ color: 'var(--text-secondary)' }}>
            How much <span className="font-semibold text-emerald-400">cash is in your drawer</span> to start today?
          </p>

          {/* Cash Input */}
          <div
            className="p-4 rounded-xl mb-3 border"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-input)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-emerald-400" />
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Opening Cash (Rs.)
              </label>
            </div>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--text-muted)' }}>Rs.</span>
              <input
                type="number"
                min="0"
                step="1"
                className="input pl-10 text-center text-2xl font-bold"
                placeholder="0"
                value={cash}
                onChange={e => setCash(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Optional notes */}
          <textarea
            className="input text-sm resize-none w-full mb-4"
            placeholder="Optional notes (e.g. received change from bank)..."
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-3 py-2.5 mb-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="topbar-btn flex-shrink-0 text-xs"
              disabled={loading}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Record & Start Day</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
