import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
};

const TOAST_STYLES = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  error:   'border-red-500/40 bg-red-500/10 text-red-300',
  info:    'border-brand-500/40 bg-brand-500/10 text-brand-300',
};

function ToastItem({ toast, onDismiss }) {
  const Icon = TOAST_ICONS[toast.type] || Info;
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm animate-slide-in min-w-[280px] max-w-sm ${TOAST_STYLES[toast.type]}`}
      style={{ backgroundColor: 'var(--bg-surface)' }}
      role="alert"
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="text-sm flex-1 leading-snug" style={{ color: 'var(--text-primary)' }}>{toast.message}</p>
      <button onClick={() => onDismiss(toast.id)} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ConfirmDialog({ state, onClose }) {
  if (!state) return null;
  const isDanger = state.variant !== 'primary';

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" onClick={() => onClose(false)}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{state.title}</h2>
        {state.message && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{state.message}</p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => onClose(false)} className="btn-secondary flex-1">
            {state.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={isDanger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((type, message, duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const success = useCallback((message) => showToast('success', message), [showToast]);
  const error   = useCallback((message) => showToast('error', message, 5000), [showToast]);
  const info    = useCallback((message) => showToast('info', message), [showToast]);

  const confirm = useCallback(({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger' }) => {
    return new Promise((resolve) => {
      setConfirmState({ title, message, confirmLabel, cancelLabel, variant, resolve });
    });
  }, []);

  const handleConfirmClose = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ success, error, info, confirm }}>
      {children}
      <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </div>
      <ConfirmDialog state={confirmState} onClose={handleConfirmClose} />
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
