import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, IdCard, FileText, Upload, Trash2, Download, Loader2, Paperclip, Eye } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import { useAuthedImage } from '../../hooks/useAuthedImage';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { uploadEmployeePhoto, uploadEmployeeCnicImage, uploadEmployeeDocument } from '../../api/employeeAttachments';
import api from '../../api/axios';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
// CNIC attachment doubles as a scan of the physical card, so PDF is allowed too.
const CNIC_TYPES = [...IMAGE_TYPES, 'application/pdf'];
const MAX_IMAGE_MB = 5;
const MAX_DOC_MB = 10;

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newLocalId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
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

// Opens the file in a new tab for viewing (browser renders images/PDFs inline;
// other types fall back to the browser's own download prompt).
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

/**
 * Photo/CNIC image/document attachments manager.
 *
 * With an `employeeId`, it's "live": every action fetches/uploads/deletes
 * immediately against that employee. Without one (new-employee form, before
 * the record exists), it's "staging": picks are kept as local File objects
 * and previewed via object URLs. The parent calls `commitToEmployee(newId)`
 * via ref right after creating the employee to upload everything staged.
 */
const EmployeeAttachments = forwardRef(function EmployeeAttachments({ employeeId, canEdit }, ref) {
  const isStaging = !employeeId;
  const { t } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopId, isSuperAdmin } = useShopApi();
  // A super_admin's shopId resolves asynchronously (fetched from /branches/shops
  // after mount), so wait for it before firing the first request — otherwise it
  // goes out with no shop_id and 400s.
  const shopReady = !isSuperAdmin || Boolean(shopId);

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(!isStaging);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [busyCnic, setBusyCnic] = useState(false);
  const [busyDoc, setBusyDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');

  const [stagedPhoto, setStagedPhoto] = useState(null);
  const [stagedCnic, setStagedCnic] = useState(null);
  const [stagedDocs, setStagedDocs] = useState([]);

  const photoInputRef = useRef(null);
  const cnicInputRef = useRef(null);
  const docInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/employees/${employeeId}`, { params: shopParams() });
      setEmployee(data.employee);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!isStaging && shopReady) load(); }, [employeeId, shopReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // shop_id must ride along on every request (including <img> blob fetches) for
  // super_admin sessions, which have no shop_id of their own to fall back on.
  const qs = useMemo(() => {
    const p = new URLSearchParams(shopParams());
    return p.toString() ? `?${p.toString()}` : '';
  }, [shopParams]);

  const { src: liveePhotoSrc, loading: photoLoading } = useAuthedImage(!isStaging && employee?.photo_path ? `/employees/${employeeId}/photo${qs}` : null);
  const { src: liveCnicSrc, loading: cnicLoading, contentType: liveCnicType } = useAuthedImage(!isStaging && employee?.cnic_image_path ? `/employees/${employeeId}/cnic-image${qs}` : null);
  const stagedPhotoSrc = useObjectUrl(stagedPhoto);
  const stagedCnicSrc = useObjectUrl(stagedCnic);

  const photoSrc = isStaging ? stagedPhotoSrc : liveePhotoSrc;
  const cnicSrc = isStaging ? stagedCnicSrc : liveCnicSrc;
  const cnicType = isStaging ? (stagedCnic?.type || null) : liveCnicType;
  const cnicIsPdf = cnicType === 'application/pdf';
  const hasPhoto = isStaging ? Boolean(stagedPhoto) : Boolean(employee?.photo_path);
  const hasCnic = isStaging ? Boolean(stagedCnic) : Boolean(employee?.cnic_image_path);

  useImperativeHandle(ref, () => ({
    async commitToEmployee(newEmployeeId) {
      const params = shopParams();
      let total = 0;
      let failed = 0;
      if (stagedPhoto) {
        total += 1;
        try { await uploadEmployeePhoto(newEmployeeId, stagedPhoto, params); } catch { failed += 1; }
      }
      if (stagedCnic) {
        total += 1;
        try { await uploadEmployeeCnicImage(newEmployeeId, stagedCnic, params); } catch { failed += 1; }
      }
      for (const doc of stagedDocs) {
        total += 1;
        // eslint-disable-next-line no-await-in-loop
        try { await uploadEmployeeDocument(newEmployeeId, doc.file, doc.title, params); } catch { failed += 1; }
      }
      return { total, failed };
    },
  }), [stagedPhoto, stagedCnic, stagedDocs, shopParams]);

  const validateImage = (file, allowedTypes = IMAGE_TYPES, unsupportedLabel) => {
    if (!allowedTypes.includes(file.type)) {
      error(unsupportedLabel || t('unsupportedFileType') || 'Please choose a PNG, JPG, GIF or WEBP image.');
      return false;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      error(t('fileTooLarge') || `File is too large. Max ${MAX_IMAGE_MB}MB.`);
      return false;
    }
    return true;
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validateImage(file, IMAGE_TYPES, t('unsupportedFileTypeImage'))) return;
    if (isStaging) { setStagedPhoto(file); return; }
    setBusyPhoto(true);
    try {
      const emp = await uploadEmployeePhoto(employeeId, file, shopParams());
      setEmployee(emp);
      success(t('photoUploaded') || 'Photo uploaded successfully');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusyPhoto(false);
    }
  };

  const removePhoto = async () => {
    if (isStaging) { setStagedPhoto(null); return; }
    if (!window.confirm(t('confirmRemovePhoto') || 'Remove this photo?')) return;
    setBusyPhoto(true);
    try {
      const { data } = await api.delete(`/employees/${employeeId}/photo`, { params: shopParams() });
      setEmployee(data.employee);
      success(t('photoRemoved') || 'Photo removed');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusyPhoto(false);
    }
  };

  const onPickCnic = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validateImage(file, CNIC_TYPES, t('unsupportedFileTypeCnic'))) return;
    if (isStaging) { setStagedCnic(file); return; }
    setBusyCnic(true);
    try {
      const emp = await uploadEmployeeCnicImage(employeeId, file, shopParams());
      setEmployee(emp);
      success(t('cnicImageUploaded') || 'CNIC attachment uploaded successfully');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusyCnic(false);
    }
  };

  const removeCnic = async () => {
    if (isStaging) { setStagedCnic(null); return; }
    if (!window.confirm(t('confirmRemoveCnicImage') || 'Remove this CNIC attachment?')) return;
    setBusyCnic(true);
    try {
      const { data } = await api.delete(`/employees/${employeeId}/cnic-image`, { params: shopParams() });
      setEmployee(data.employee);
      success(t('cnicImageRemoved') || 'CNIC attachment removed');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusyCnic(false);
    }
  };

  const onPickDoc = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      error(t('fileTooLarge') || `File is too large. Max ${MAX_DOC_MB}MB.`);
      return;
    }
    if (isStaging) {
      setStagedDocs(docs => [...docs, { id: newLocalId(), file, title: '' }]);
      return;
    }
    setBusyDoc(true);
    try {
      const doc = await uploadEmployeeDocument(employeeId, file, docTitle.trim(), shopParams());
      setEmployee(emp => ({ ...emp, EmployeeDocuments: [...(emp.EmployeeDocuments || []), doc] }));
      setDocTitle('');
      success(t('documentUploaded') || 'Document uploaded successfully');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusyDoc(false);
    }
  };

  const removeDoc = async (doc) => {
    if (isStaging) {
      setStagedDocs(docs => docs.filter(d => d.id !== doc.id));
      return;
    }
    if (!window.confirm(t('confirmRemoveDocument') || 'Remove this document?')) return;
    try {
      await api.delete(`/employees/${employeeId}/documents/${doc.id}`, { params: shopParams() });
      setEmployee(emp => ({ ...emp, EmployeeDocuments: (emp.EmployeeDocuments || []).filter(d => d.id !== doc.id) }));
      success(t('documentRemoved') || 'Document removed');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const setStagedDocTitle = (id, title) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, title } : d)));
  };

  const documents = isStaging ? stagedDocs : (employee?.EmployeeDocuments || []);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('attachments') || 'Attachments'}</span>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('attachmentsSub') || 'Optional — photo, CNIC image and other documents'}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      ) : (
        <div className="px-5 py-5 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Photo */}
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('employeePhoto') || 'Employee Photo'}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 relative group"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', cursor: photoSrc ? 'pointer' : 'default' }}
                  disabled={!photoSrc}
                  title={photoSrc ? (t('viewFile') || 'View') : undefined}
                  onClick={() => photoSrc && window.open(photoSrc, '_blank', 'noopener,noreferrer')}
                >
                  {photoLoading || busyPhoto ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
                  ) : photoSrc ? (
                    <>
                      <img src={photoSrc} alt="" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
                        <Eye className="w-5 h-5 text-white" />
                      </span>
                    </>
                  ) : (
                    <ImageIcon className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>
                {canEdit && (
                  <div className="flex flex-col gap-1.5">
                    <button type="button" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" disabled={busyPhoto} onClick={() => photoInputRef.current?.click()}>
                      <Upload className="w-3.5 h-3.5" />{hasPhoto ? (t('changePhoto') || 'Change Photo') : (t('uploadPhoto') || 'Upload Photo')}
                    </button>
                    {hasPhoto && (
                      <button type="button" className="text-xs text-red-400 flex items-center gap-1.5" disabled={busyPhoto} onClick={removePhoto}>
                        <Trash2 className="w-3.5 h-3.5" />{t('removePhoto') || 'Remove Photo'}
                      </button>
                    )}
                    <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onPickPhoto} />
                  </div>
                )}
              </div>
            </div>

            {/* CNIC image */}
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('cnicImage') || 'CNIC Image'}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 relative group"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', cursor: cnicSrc ? 'pointer' : 'default' }}
                  disabled={!cnicSrc}
                  title={cnicSrc ? (t('viewFile') || 'View') : undefined}
                  onClick={() => cnicSrc && window.open(cnicSrc, '_blank', 'noopener,noreferrer')}
                >
                  {cnicLoading || busyCnic ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
                  ) : cnicSrc && cnicIsPdf ? (
                    <>
                      <FileText className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
                        <Eye className="w-5 h-5 text-white" />
                      </span>
                    </>
                  ) : cnicSrc ? (
                    <>
                      <img src={cnicSrc} alt="" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
                        <Eye className="w-5 h-5 text-white" />
                      </span>
                    </>
                  ) : (
                    <IdCard className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>
                {canEdit && (
                  <div className="flex flex-col gap-1.5">
                    <button type="button" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" disabled={busyCnic} onClick={() => cnicInputRef.current?.click()}>
                      <Upload className="w-3.5 h-3.5" />{hasCnic ? (t('changeCnicImage') || 'Change CNIC Image') : (t('uploadCnicImage') || 'Upload CNIC Image')}
                    </button>
                    {hasCnic && (
                      <button type="button" className="text-xs text-red-400 flex items-center gap-1.5" disabled={busyCnic} onClick={removeCnic}>
                        <Trash2 className="w-3.5 h-3.5" />{t('removeCnicImage') || 'Remove CNIC Image'}
                      </button>
                    )}
                    <input ref={cnicInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" className="hidden" onChange={onPickCnic} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Other documents */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{t('otherDocuments') || 'Other Documents'}</p>

            {documents.length === 0 ? (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{t('noDocumentsUploaded') || 'No documents uploaded yet'}</p>
            ) : (
              <div className="space-y-2 mb-3">
                {isStaging ? documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <input
                      className="input flex-1 py-1.5 text-sm"
                      placeholder={t('documentTitlePlaceholder') || 'e.g. degree, experience letter…'}
                      value={doc.title}
                      onChange={e => setStagedDocTitle(doc.id, e.target.value)}
                      onKeyDown={blockEnterSubmit}
                    />
                    <span className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-muted)' }} title={doc.file.name}>{doc.file.name}</span>
                    <button type="button" className="icon-btn" title={t('viewFile') || 'View'} onClick={() => viewLocalFile(doc.file)}>
                      <Eye className="w-4 h-4" />
                    </button>
                    {canEdit && (
                      <button type="button" className="icon-btn text-red-400" title={t('remove') || 'Remove'} onClick={() => removeDoc(doc)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )) : documents.map(doc => (
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
                      <button type="button" className="icon-btn text-red-400" title={t('remove') || 'Remove'} onClick={() => removeDoc(doc)}>
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
                <button type="button" className="btn-secondary text-sm flex items-center gap-2 justify-center" disabled={busyDoc} onClick={() => docInputRef.current?.click()}>
                  {busyDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
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
      )}
    </div>
  );
});

export default EmployeeAttachments;
