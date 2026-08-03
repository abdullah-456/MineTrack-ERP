import { useRef } from 'react';
import { FileText, Paperclip, Eye, Download, Trash2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api/axios';

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Enter inside a text field here shouldn't submit the surrounding employee form.
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

// Other-documents card for the employee form — photo and CNIC attachment live
// inline in the Personal Info section, so this only handles free-form documents.
export default function EmployeeDocumentsSection({ employeeId, documents, canEdit, isStaging, shopParams }) {
  const { t } = useTheme();
  const docInputRef = useRef(null);
  const { list, busy, docTitle, setDocTitle, add, remove, setTitle } = documents;

  const onPickDoc = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) add(file, docTitle);
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('otherDocuments') || 'Other Documents'}</span>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('otherDocumentsSub') || 'Optional — additional supporting documents'}</p>
      </div>

      <div className="px-5 py-5">
        {list.length === 0 ? (
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{t('noDocumentsUploaded') || 'No documents uploaded yet'}</p>
        ) : (
          <div className="space-y-2 mb-3">
            {isStaging ? list.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <input
                  className="input flex-1 py-1.5 text-sm"
                  placeholder={t('documentTitlePlaceholder') || 'e.g. degree, experience letter…'}
                  value={doc.title}
                  onChange={e => setTitle(doc.id, e.target.value)}
                  onKeyDown={blockEnterSubmit}
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
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.title || doc.file_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{doc.file_name} · {humanSize(doc.file_size)}</p>
                </div>
                <button type="button" className="icon-btn" title={t('viewFile') || 'View'} onClick={() => viewBlob(`/employees/${employeeId}/documents/${doc.id}/file`, shopParams())}>
                  <Eye className="w-4 h-4" />
                </button>
                <button type="button" className="icon-btn" title={t('download') || 'Download'} onClick={() => downloadBlob(`/employees/${employeeId}/documents/${doc.id}/file`, doc.file_name, shopParams())}>
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
                placeholder={t('documentTitlePlaceholder') || 'e.g. degree, experience letter…'}
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                onKeyDown={blockEnterSubmit}
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
