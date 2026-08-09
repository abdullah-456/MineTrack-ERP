import { useRef, useState } from 'react';
import { FileText, Paperclip, Eye, Download, Trash2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { DOCUMENT_CATEGORIES, documentFileUrl } from '../../api/documents';
import api from '../../api/axios';

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Enter inside a text field here shouldn't submit the surrounding form.
function blockEnterSubmit(e) {
  if (e.key === 'Enter') e.preventDefault();
}

async function downloadBlob(url, filename, params) {
  const { data } = await api.get(url, { responseType: 'blob', params });
  const blobUrl = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function viewBlob(url, params) {
  const { data } = await api.get(url, { responseType: 'blob', params });
  const blobUrl = URL.createObjectURL(data);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function viewLocalFile(file) {
  const blobUrl = URL.createObjectURL(file);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function categoryLabel(t, cat) {
  return t(`docCategory_${cat}`) || cat;
}

// Staging-capable sibling of DocumentsPanel.jsx — that one always requires a
// real ownerId, so it can't be dropped into a "create" form before the
// parent record exists. Pair with useDocumentStaging(ownerType, ownerId):
// pass ownerId=null while creating (staged, local-only picks) and the real
// id once editing (uploads/deletes happen immediately, like DocumentsPanel).
export default function OwnerDocumentsSection({
  ownerType, ownerId, documents, canEdit = true, isStaging, shopParams, title, subtitle,
}) {
  const { t } = useTheme();
  const docInputRef = useRef(null);
  const { list, busy, docTitle, setDocTitle, add, remove, setTitle, setCategory, setExpiry } = documents;
  const [docCategory, setDocCategory] = useState('other');
  const [docExpiry, setDocExpiry] = useState('');

  const onPickDoc = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      add(file, docTitle, docCategory, docExpiry);
      setDocExpiry('');
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title || t('documents') || 'Documents'}</span>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {subtitle || t('documentsSub') || 'Upload licenses, contracts, and other files. Set an expiry date to get a reminder before it lapses.'}
        </p>
      </div>

      <div className="px-5 py-5">
        {list.length === 0 ? (
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{t('noDocumentsUploaded') || 'No documents uploaded yet'}</p>
        ) : (
          <div className="space-y-2 mb-3">
            {isStaging ? list.map(doc => (
              <div key={doc.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <input
                  className="input flex-1 py-1.5 text-sm min-w-[120px]"
                  placeholder={t('documentTitlePlaceholder') || 'e.g. mining license, lease deed…'}
                  value={doc.title}
                  onChange={e => setTitle(doc.id, e.target.value)}
                  onKeyDown={blockEnterSubmit}
                />
                <select className="input py-1.5 text-sm w-auto" value={doc.category} onChange={e => setCategory(doc.id, e.target.value)}>
                  {DOCUMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{categoryLabel(t, cat)}</option>)}
                </select>
                <input
                  type="date"
                  className="input py-1.5 text-sm w-auto"
                  title={t('expiryDateOptional') || 'Expiry Date (optional)'}
                  value={doc.expiryDate}
                  onChange={e => setExpiry(doc.id, e.target.value)}
                />
                <span className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-muted)' }} title={doc.file.name}>{doc.file.name}</span>
                <button type="button" className="icon-btn" title={t('viewFile') || 'View'} onClick={() => viewLocalFile(doc.file)}>
                  <Eye className="w-4 h-4" />
                </button>
                {canEdit && (
                  <button type="button" className="icon-btn text-red-400" title={t('remove') || 'Remove'} onClick={() => remove(doc)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )) : list.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {doc.title || doc.file_name}
                    {doc.category && <span className="badge badge-blue text-xs">{categoryLabel(t, doc.category)}</span>}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {doc.file_name} · {humanSize(doc.file_size)}
                    {doc.expiry_date && <> · {t('expires') || 'Expires'} {doc.expiry_date}</>}
                  </p>
                </div>
                <button type="button" className="icon-btn" title={t('viewFile') || 'View'} onClick={() => viewBlob(documentFileUrl(ownerType, ownerId, doc.id), shopParams())}>
                  <Eye className="w-4 h-4" />
                </button>
                <button type="button" className="icon-btn" title={t('download') || 'Download'} onClick={() => downloadBlob(documentFileUrl(ownerType, ownerId, doc.id), doc.file_name, shopParams())}>
                  <Download className="w-4 h-4" />
                </button>
                {canEdit && (
                  <button type="button" className="icon-btn text-red-400" title={t('remove') || 'Remove'} onClick={() => remove(doc)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2">
            {!isStaging && (
              <input
                className="input flex-1"
                placeholder={t('documentTitlePlaceholder') || 'e.g. mining license, lease deed…'}
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                onKeyDown={blockEnterSubmit}
              />
            )}
            {!isStaging && (
              <select className="input w-auto" value={docCategory} onChange={e => setDocCategory(e.target.value)}>
                {DOCUMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{categoryLabel(t, cat)}</option>)}
              </select>
            )}
            {!isStaging && (
              <input
                type="date"
                className="input w-auto"
                title={t('expiryDateOptional') || 'Expiry Date (optional)'}
                value={docExpiry}
                onChange={e => setDocExpiry(e.target.value)}
              />
            )}
            <button type="button" className="btn-secondary text-sm flex items-center gap-2 justify-center" disabled={busy} onClick={() => docInputRef.current?.click()}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {isStaging ? (t('addAnother') || 'Add Another') : (t('addDocument') || 'Add Document')}
            </button>
            <input
              ref={docInputRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={onPickDoc}
            />
          </div>
        )}
      </div>
    </div>
  );
}
