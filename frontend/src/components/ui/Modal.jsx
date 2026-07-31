import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useHistoryModal } from '../../hooks/useHistoryModal';

/**
 * App-wide modal. Browser Back closes the overlay (via useHistoryModal).
 * Backdrop/X/Escape are ignored until the history hook arms (~400ms) so the
 * opening click cannot dismiss the modal in the same gesture.
 */
export default function Modal({ title, onClose, children, wide = false, xl = false, open = true }) {
  const widthClass = xl ? 'max-w-6xl' : wide ? 'max-w-4xl' : 'max-w-xl';
  const requestClose = useHistoryModal(onClose, { enabled: open });

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4"
      style={{ zIndex: 10000 }}
      onClick={requestClose}
    >
      <div
        className={`w-full ${widthClass} rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-visible`}
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-0 flex-shrink-0">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button type="button" onClick={requestClose} className="icon-btn"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 pt-4 overflow-y-auto overflow-x-visible flex-1 space-y-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
