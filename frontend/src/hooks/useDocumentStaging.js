import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { useShopApi } from './useShopApi';
import { listDocuments, uploadDocument, deleteDocument } from '../api/documents';

const MAX_DOC_MB = 10;

function newLocalId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

/**
 * Generic staged-or-live document attachment state for a create/edit form,
 * for any polymorphic document owner type (branch, vehicle, asset, ...).
 * Without an ownerId it's "staging" mode (new record, before it exists) —
 * picks are kept as local File objects and the caller uploads them via
 * commitToOwner(newId) right after the parent record is created. With an
 * ownerId every action fetches/uploads/deletes immediately against it.
 * Mirrors useEmployeeAttachments.js's document half (kept separate there
 * since it predates this generic /api/documents.js system).
 */
export function useDocumentStaging(ownerType, ownerId) {
  const isStaging = !ownerId;
  const { t } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(!isStaging);
  const [busy, setBusy] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [stagedDocs, setStagedDocs] = useState([]);

  const load = useCallback(async () => {
    if (isStaging) return;
    setLoading(true);
    try {
      const docs = await listDocuments(ownerType, ownerId, shopParams());
      setList(docs);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [isStaging, ownerType, ownerId, shopParams, error, t]);

  useEffect(() => { load(); }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitToOwner = useCallback(async (newOwnerId) => {
    const params = shopParams();
    let total = 0;
    let failed = 0;
    for (const doc of stagedDocs) {
      total += 1;
      // eslint-disable-next-line no-await-in-loop
      try {
        await uploadDocument(ownerType, newOwnerId, {
          file: doc.file, category: doc.category, expiry_date: doc.expiryDate || null, title: doc.title,
        }, params);
      } catch {
        failed += 1;
      }
    }
    return { total, failed };
  }, [ownerType, stagedDocs, shopParams]);

  const add = useCallback(async (file, title, category, expiryDate) => {
    if (!file) return;
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      error(t('fileTooLarge') || `File is too large. Max ${MAX_DOC_MB}MB.`);
      return;
    }
    if (isStaging) {
      setStagedDocs(docs => [...docs, {
        id: newLocalId(), file, title: title || '', category: category || 'other', expiryDate: expiryDate || '',
      }]);
      return;
    }
    setBusy(true);
    try {
      const doc = await uploadDocument(ownerType, ownerId, {
        file, category, expiry_date: expiryDate || null, title: (title || '').trim(),
      }, shopParams());
      setList(l => [...l, doc]);
      setDocTitle('');
      success(t('documentUploaded') || 'Document uploaded successfully');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setBusy(false);
    }
  }, [isStaging, ownerType, ownerId, shopParams, success, error, t]);

  const remove = useCallback(async (doc) => {
    if (isStaging) {
      setStagedDocs(docs => docs.filter(d => d.id !== doc.id));
      return;
    }
    if (!window.confirm(t('confirmRemoveDocument') || 'Remove this document?')) return;
    try {
      await deleteDocument(ownerType, ownerId, doc.id, shopParams());
      setList(l => l.filter(d => d.id !== doc.id));
      success(t('documentRemoved') || 'Document removed');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  }, [isStaging, ownerType, ownerId, shopParams, success, error, t]);

  const setStagedTitle = useCallback((id, title) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, title } : d)));
  }, []);
  const setStagedCategory = useCallback((id, category) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, category } : d)));
  }, []);
  const setStagedExpiry = useCallback((id, expiryDate) => {
    setStagedDocs(docs => docs.map(d => (d.id === id ? { ...d, expiryDate } : d)));
  }, []);

  return {
    isStaging,
    loading,
    shopParams,
    commitToOwner,
    documents: {
      list: isStaging ? stagedDocs : list,
      busy,
      docTitle,
      setDocTitle,
      add,
      remove,
      setTitle: setStagedTitle,
      setCategory: setStagedCategory,
      setExpiry: setStagedExpiry,
    },
  };
}
