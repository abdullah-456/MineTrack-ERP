import { useRef } from 'react';
import { User, Upload, Trash2, Loader2, Eye } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Fixed-size circular photo frame with a border and placeholder avatar icon,
// used for the employee's profile picture wherever it appears.
export default function EmployeePhotoFrame({ photo, canEdit }) {
  const { t } = useTheme();
  const inputRef = useRef(null);
  const { src, loading, busy, has, pick, remove } = photo;

  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) pick(file);
  };

  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <button
        type="button"
        className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center relative group"
        style={{ background: 'var(--bg-elevated)', border: '2px solid var(--border-subtle)', cursor: src ? 'pointer' : 'default' }}
        disabled={!src}
        title={src ? (t('viewFile') || 'View') : undefined}
        onClick={() => src && window.open(src, '_blank', 'noopener,noreferrer')}
      >
        {loading || busy ? (
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        ) : src ? (
          <>
            <img src={src} alt="" className="w-full h-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
              <Eye className="w-5 h-5 text-white" />
            </span>
          </>
        ) : (
          <User className="w-12 h-12" style={{ color: 'var(--text-muted)' }} />
        )}
      </button>
      {canEdit && (
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" />{has ? (t('changePhoto') || 'Change') : (t('uploadPhoto') || 'Upload')}
          </button>
          {has && (
            <button type="button" className="icon-btn text-red-400" title={t('removePhoto') || 'Remove Photo'} disabled={busy} onClick={remove}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onChange} />
        </div>
      )}
    </div>
  );
}
