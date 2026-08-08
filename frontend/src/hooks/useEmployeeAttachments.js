import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { useShopApi } from './useShopApi';
import { useAuthedImage } from './useAuthedImage';
import { useObjectUrl } from './useObjectUrl';
import { uploadEmployeePhoto, uploadEmployeeCnicImage, uploadEmployeeDocument } from '../api/employeeAttachments';
import api from '../api/axios';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
// CNIC attachment doubles as a scan of the physical card, so PDF is allowed too.
const CNIC_TYPES = [...IMAGE_TYPES, 'application/pdf'];
const MAX_IMAGE_MB = 5;
const MAX_DOC_MB = 10;

function newLocalId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

/**
 * Shared state/logic for an employee's photo, CNIC attachment and other
 * documents. Without an employeeId it's "staging" mode (new-employee form,
 * before the record exists) — picks are kept as local File objects and the
 * caller uploads them via commitToEmployee(newId) right after the employee
 * is created. With an employeeId every action fetches/uploads/deletes
 * immediately against that employee.
 */
export function useEmployeeAttachments(employeeId) {
  const isStaging = !employeeId;
  const { t } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopId, isSuperAdmin } = useShopApi();
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/employees/${employeeId}`, { params: shopParams() });
      setEmployee(data.employee);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [employeeId, shopParams, error, t]);

  useEffect(() => { if (!isStaging && shopReady) load(); }, [employeeId, shopReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // shop_id must ride along on every request (including image blob fetches) for
  // super_admin sessions, which have no shop_id of their own to fall back on.
  const qs = useMemo(() => {
    const p = new URLSearchParams(shopParams());
    return p.toString() ? `?${p.toString()}` : '';
  }, [shopParams]);

  const { src: livePhotoSrc, loading: photoLoading } = useAuthedImage(!isStaging && employee?.photo_path ? `/employees/${employeeId}/photo${qs}` : null);
  const { src: liveCnicSrc, loading: cnicLoading, contentType: liveCnicType } = useAuthedImage(!isStaging && employee?.cnic_image_path ? `/employees/${employeeId}/cnic-image${qs}` : null);
  const stagedPhotoSrc = useObjectUrl(stagedPhoto);
  const stagedCnicSrc = useObjectUrl(stagedCnic);

  const photoSrc = isStaging ? stagedPhotoSrc : livePhotoSrc;
  const cnicSrc = isStaging ? stagedCnicSrc : liveCnicSrc;
  const cnicType = isStaging ? (stagedCnic?.type || null) : liveCnicType;
  const hasPhoto = isStaging ? Boolean(stagedPhoto) : Boolean(employee?.photo_path);
  const hasCnic = isStaging ? Boolean(stagedCnic) : Boolean(employee?.cnic_image_path);

  const commitToEmployee = useCallback(async (newEmployeeId) => {
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
      try { await uploadEmployeeDocument(newEmployeeId, doc.file, doc.title, params, doc.category, doc.expiryDate); } catch { failed += 1; }
    }
    return { total, failed };
  }, [stagedPhoto, stagedCnic, stagedDocs, shopParams]);

  const validateFile = useCallback((file, allowedTypes, tooLargeLabel, unsupportedLabel) => {
    if (!allowedTypes.includes(file.type)) {
      error(unsupportedLabel);
      return false;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      error(tooLargeLabel);
      return false;
    }
    return true;
  }, [error]);

  const pickPhoto = useCallback(async (file) => {
    if (!file) return;
    const ok = validateFile(
      file, IMAGE_TYPES,
      t('fileTooLarge') || `File is too large. Max ${MAX_IMAGE_MB}MB.`,
      t('unsupportedFileTypeImage') || 'Please choose a PNG, JPG, GIF or WEBP image.',
    );
    if (!ok) return;
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
  }, [isStaging, employeeId, shopParams, success, error, t, validateFile]);

  const removePhoto = useCallback(async () => {
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
  }, [isStaging, employeeId, shopParams, success, error, t]);

  const pickCnic = useCallback(async (file) => {
    if (!file) return;
    const ok = validateFile(
      file, CNIC_TYPES,
      t('fileTooLarge') || `File is too large. Max ${MAX_IMAGE_MB}MB.`,
      t('unsupportedFileTypeCnic') || 'Please choose a PNG, JPG or PDF file.',
    );
    if (!ok) return;
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
  }, [isStaging, employeeId, shopParams, success, error, t, validateFile]);

  const removeCnic = useCallback(async () => {
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
  }, [isStaging, employeeId, shopParams, success, error, t]);

  const addDoc = useCallback(async (file, title, category, expiryDate) => {
    if (!file) return;
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      error(t('fileTooLarge') || `File is too large. Max ${MAX_DOC_MB}MB.`);
      return;
    }
    if (isStaging) {
      setStagedDocs(docs => [...docs, { id: newLocalId(), file, title: title || '', category: category || 'other', expiryDate: expiryDate || '' }]);
      return;
    }
    setBusyDoc(true);
    try {
      const doc = await uploadEmployeeDocument(employeeId, file, (title || '').trim(), shopParams(), category, expiryDate);
      setEmployee(emp => ({ ...emp, EmployeeDocuments: [...(emp.EmployeeDocuments || []), doc] }));
      setDocTitle('');
      success(t('documentUploaded') || 'Document uploaded successfully');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusyDoc(false);
    }
  }, [isStaging, employeeId, shopParams, success, error, t]);

  const removeDoc = useCallback(async (doc) => {
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
  }, [isStaging, employeeId, shopParams, success, error, t]);

  const setStagedDocTitle = useCallback((id, title) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, title } : d)));
  }, []);

  const setStagedDocCategory = useCallback((id, category) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, category } : d)));
  }, []);

  const setStagedDocExpiry = useCallback((id, expiryDate) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, expiryDate } : d)));
  }, []);

  const documentList = isStaging ? stagedDocs : (employee?.EmployeeDocuments || []);

  return {
    isStaging,
    loading,
    shopParams,
    photo: { src: photoSrc, loading: photoLoading, busy: busyPhoto, has: hasPhoto, pick: pickPhoto, remove: removePhoto },
    cnic: { src: cnicSrc, type: cnicType, loading: cnicLoading, busy: busyCnic, has: hasCnic, pick: pickCnic, remove: removeCnic },
    documents: {
      list: documentList,
      busy: busyDoc,
      docTitle,
      setDocTitle,
      add: addDoc,
      remove: removeDoc,
      setTitle: setStagedDocTitle,
      setCategory: setStagedDocCategory,
      setExpiry: setStagedDocExpiry,
    },
    commitToEmployee,
  };
}
