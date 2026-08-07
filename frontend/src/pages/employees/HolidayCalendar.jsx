import { useState, useEffect, useCallback } from 'react';
import { PartyPopper, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY = { date: '', name: '', is_recurring_yearly: false };

export default function HolidayCalendar() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/holidays', { params: shopParams() });
      setHolidays(data.holidays || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, ...shopParams() };
      if (modal === 'create') {
        await api.post('/holidays', payload);
        success(t('holidayCreated') || 'Holiday added');
      } else {
        await api.put(`/holidays/${selected.id}`, payload);
        success(t('holidayUpdated') || 'Holiday updated');
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteHoliday'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/holidays/${h.id}`, { params: shopParams() });
      success(t('holidayDeleted') || 'Holiday deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = holidays.filter(h => !search.trim() || [h.name, h.date].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={PartyPopper}
        accent="amber"
        title={t('holidays') || 'Holidays'}
        subtitle={t('holidaysSub') || 'Public and company holidays — excluded from absence deductions'}
        action={
          <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addHoliday') || 'Add Holiday'}
          </button>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchHolidays') || 'Search holiday name or date…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('date')}</th>
                <th className="text-start p-4 font-medium">{t('holidayName') || 'Name'}</th>
                <th className="text-start p-4 font-medium">{t('recurringYearly') || 'Recurring Yearly'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{h.date}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{h.name}</td>
                  <td className="p-4">
                    {h.is_recurring_yearly && <span className="badge badge-blue text-xs">{t('yes') || 'Yes'}</span>}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setSelected(h); setForm({ date: h.date, name: h.name, is_recurring_yearly: !!h.is_recurring_yearly }); setModal('edit'); }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(h)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noHolidays') || 'No holidays found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? (t('addHoliday') || 'Add Holiday') : (t('editHoliday') || 'Edit Holiday')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <FormLabel required>{t('date')}</FormLabel>
              <input className="input" type="date" required value={form.date} onChange={setF('date')} />
            </div>
            <div>
              <FormLabel required>{t('holidayName') || 'Name'}</FormLabel>
              <input className="input" required value={form.name} onChange={setF('name')} />
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.is_recurring_yearly} onChange={e => setForm(f => ({ ...f, is_recurring_yearly: e.target.checked }))} />
              {t('recurringYearly') || 'Recurring every year'}
            </label>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
