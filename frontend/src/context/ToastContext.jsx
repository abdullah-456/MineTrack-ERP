import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
};

// Solid high-contrast backgrounds so toasts are readable in BOTH light & dark mode
const TOAST_CONFIG = {
  success: {
    bg:        '#16a34a',   // green-600
    iconColor: '#bbf7d0',  // green-200
    border:    '#15803d',  // green-700
  },
  error: {
    bg:        '#dc2626',   // red-600
    iconColor: '#fecaca',  // red-200
    border:    '#b91c1c',  // red-700
  },
  info: {
    bg:        '#4f46e5',   // indigo-600
    iconColor: '#c7d2fe',  // indigo-200
    border:    '#4338ca',  // indigo-700
  },
};

function ToastItem({ toast, onDismiss }) {
  const Icon = TOAST_ICONS[toast.type] || Info;
  const cfg  = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl animate-slide-in min-w-[300px] max-w-sm"
      style={{
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.border}`,
      }}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: cfg.iconColor }} />
      <p className="text-sm flex-1 leading-snug font-medium text-white">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white transition-colors ml-1 mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ConfirmDialog({ state, onClose }) {
  if (!state) return null;
  const isDanger = state.variant !== 'primary';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 10001 }} onClick={() => onClose(false)}>
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
