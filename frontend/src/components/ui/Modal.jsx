import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, wide = false, xl = false }) {
  const widthClass = xl ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`w-full ${widthClass} rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-visible`}
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-0 flex-shrink-0">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button type="button" onClick={onClose} className="icon-btn"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 pt-4 overflow-y-auto overflow-x-visible flex-1 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
