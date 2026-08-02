import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../config/branding';

const AUTO_CLOSE_MS = 6000;

/** Warm post-login welcome, auto-dismisses after AUTO_CLOSE_MS or via the close button. */
export default function WelcomeModal({ userName, onClose }) {
  const [remaining, setRemaining] = useState(AUTO_CLOSE_MS);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const left = AUTO_CLOSE_MS - (Date.now() - start);
      if (left <= 0) {
        clearInterval(interval);
        onClose();
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const progress = Math.max(0, (remaining / AUTO_CLOSE_MS) * 100);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 animate-fade-in"
      style={{ zIndex: 10001 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 end-3 icon-btn"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-brand-500 to-purple-600 glow">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Welcome{userName ? `, ${userName}` : ''}!
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            You're signed in to <span className="font-semibold">{APP_NAME}</span>
          </p>
          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{APP_TAGLINE}</p>
        </div>

        <div className="h-1 w-full" style={{ background: 'var(--border-subtle)' }}>
          <div
            className="h-full bg-brand-500"
            style={{ width: `${progress}%`, transition: 'width 100ms linear' }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
