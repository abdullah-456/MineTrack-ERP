import { useState, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import api from '../../api/axios';

// Dropdown of real Designation rows — replaces a free-text designation field
// so Mine Manager / Production Supervisor pickers can filter employees by
// designation. Includes an inline "add new designation" flow so creating a
// designation and using it stays a single step.
export default function DesignationSelect({ value, onChange, required, className = 'input' }) {
  const { t } = useTheme();
  const { error } = useToast();
  const { shopParams } = useShopApi();
  const [designations, setDesignations] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDesignations = useCallback(async () => {
    try {
      const { data } = await api.get('/designations', { params: shopParams() });
      setDesignations(data.designations || []);
    } catch {
      setDesignations([]);
    }
  }, [shopParams]);

  useEffect(() => { fetchDesignations(); }, [fetchDesignations]);

  const createDesignation = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/designations', { ...shopParams(), name: newName.trim() });
      await fetchDesignations();
      onChange(data.designation.id);
      setAdding(false);
      setNewName('');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          className={className}
          autoFocus
          placeholder={t('newDesignationName') || 'New designation name'}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createDesignation(); } }}
        />
        <button type="button" disabled={saving} onClick={createDesignation} className="btn-primary px-3">
          {t('add') || 'Add'}
        </button>
        <button type="button" onClick={() => { setAdding(false); setNewName(''); }} className="icon-btn"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        className={className}
        required={required}
        value={value || ''}
        onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
      >
        <option value="" disabled>{t('selectDesignation') || 'Select a designation'}</option>
        {designations.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button type="button" onClick={() => setAdding(true)} className="icon-btn flex-shrink-0" title={t('newDesignation') || 'New Designation'}>
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
