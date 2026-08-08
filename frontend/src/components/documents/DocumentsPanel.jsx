import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Eye, Download, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import FormLabel from '../ui/FormLabel';
import api from '../../api/axios';
import { listDocuments, uploadDocument, deleteDocument, documentFileUrl, DOCUMENT_CATEGORIES } from '../../api/documents';

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

async function viewBlob(url, params) {
  const { data } = await api.get(url, { responseType: 'blob', params });
  const blobUrl = URL.createObjectURL(data);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
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

// Reusable document upload/list/delete card, dropped into Mine, Supplier,
// Customer, Board Member, Company Profile and Vehicle screens. Employee
// documents keep their own separate component (EmployeeDocumentsSection)
// since that system predates this one and has its own staging-mode needs.
export default function DocumentsPanel({ ownerType, ownerId, canEdit = true, title, subtitle }) {
  const { t } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('other');
  const [expiryDate, setExpiryDate] = useState('');

  const canLoad = ownerType === 'shop' || Boolean(ownerId);

  const fetchDocs = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const docs = await listDocuments(ownerType, ownerId, shopParams());
      setDocuments(docs);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId, canLoad, shopParams, error, t]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(ownerType, ownerId, { file, category, expiry_date: expiryDate || null }, shopParams());
      setExpiryDate('');
      success(t('documentUploaded') || 'Document uploaded successfully');
      fetchDocs();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async (doc) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmRemoveDocument') || 'Remove this document?', confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await deleteDocument(ownerType, ownerId, doc.id, shopParams());
      success(t('documentRemoved') || 'Document removed');
      setDocuments(docs => docs.filter(d => d.id !== doc.id));
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const categoryLabel = (cat) => t(`docCategory_${cat}`) || cat;

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title || t('documents') || 'Documents'}</span>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle || t('documentsSub') || 'Upload licenses, contracts, and other files. Set an expiry date to get a reminder before it lapses.'}</p>
      </div>

      <div className="px-5 py-5">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
        ) : documents.length === 0 ? (
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{t('noDocumentsUploaded') || 'No documents uploaded yet'}</p>
        ) : (
          <div className="space-y-2 mb-4">
            {documents.map(doc => {
              const days = daysUntil(doc.expiry_date);
              const expiring = days !== null && days <= 30;
              const overdue = days !== null && days < 0;
              return (
                <div key={doc.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      {doc.title || doc.file_name}
                      <span className="badge badge-blue text-xs">{categoryLabel(doc.category)}</span>
                    </p>
                    <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      {doc.file_name} · {humanSize(doc.file_size)}
                      {doc.expiry_date && (
                        <span className={overdue ? 'text-red-400' : expiring ? 'text-amber-400' : ''}>
                          {' · '}{(overdue || expiring) && <AlertTriangle className="w-3 h-3 inline -mt-0.5" />} {t('expires') || 'Expires'} {doc.expiry_date}
                        </span>
                      )}
                    </p>
                  </div>
                  <button type="button" className="icon-btn" title={t('viewFile') || 'View'} onClick={() => viewBlob(documentFileUrl(ownerType, ownerId, doc.id), shopParams())}>
                    <Eye className="w-4 h-4" />
                  </button>
                  <button type="button" className="icon-btn" title={t('download') || 'Download'} onClick={() => downloadBlob(documentFileUrl(ownerType, ownerId, doc.id), doc.file_name, shopParams())}>
                    <Download className="w-4 h-4" />
                  </button>
                  {canEdit && (
                    <button type="button" className="icon-btn text-red-400" title={t('remove') || 'Remove'} onClick={() => onRemove(doc)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
            <div className="flex-1">
              <FormLabel>{t('category') || 'Category'}</FormLabel>
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {DOCUMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{categoryLabel(cat)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <FormLabel>{t('expiryDateOptional') || 'Expiry Date (optional)'}</FormLabel>
              <input type="date" className="input" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
            <button type="button" className="btn-secondary text-sm flex items-center gap-2 justify-center" disabled={uploading || !canLoad} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {t('uploadDocument') || 'Upload Document'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={onPick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
