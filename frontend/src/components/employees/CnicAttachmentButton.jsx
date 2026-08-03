import { useRef } from 'react';
import { Paperclip, FileText, Eye, Trash2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Small inline attach/preview/replace/remove control for the CNIC attachment,
// meant to sit right next to the CNIC Number input.
export default function CnicAttachmentButton({ cnic, canEdit }) {
  const { t } = useTheme();
  const inputRef = useRef(null);
  const { src, type, loading, busy, has, pick, remove } = cnic;
  const isPdf = type === 'application/pdf';

  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) pick(file);
  };

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {has && (
        <button
          type="button"
          className="icon-btn"
          title={t('viewFile') || 'View'}
          disabled={!src}
          onClick={() => src && window.open(src, '_blank', 'noopener,noreferrer')}
        >
          {loading || busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPdf ? (
            <FileText className="w-4 h-4 text-brand-400" />
          ) : (
            <Eye className="w-4 h-4 text-brand-400" />
          )}
        </button>
      )}
      {canEdit && (
        <>
          <button
            type="button"
            className="icon-btn"
            title={has ? (t('replaceCnicAttachment') || 'Replace CNIC attachment') : (t('attachCnicFile') || 'Attach CNIC file')}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          {has && (
            <button type="button" className="icon-btn text-red-400" title={t('removeCnicImage') || 'Remove'} disabled={busy} onClick={remove}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            className="hidden"
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
}
