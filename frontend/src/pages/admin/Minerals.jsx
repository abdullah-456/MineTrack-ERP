import { useState, useEffect, useCallback } from 'react';
import { Gem, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';
import { MINERAL_CATEGORIES, ROYALTY_TYPES } from '../../utils/mineralOptions';
import { formatProductionTotal } from '../../utils/productionFormat';

const EMPTY_PARAM = () => ({ name: '', value: '' });
const EMPTY = { name: '', category: '', unit: 'kg', default_price: '', royalty_type: 'percentage', royalty_rate: '', quality_parameters: [] };

export default function Minerals() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [minerals, setMinerals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const categoryLabel = (value) => t(MINERAL_CATEGORIES.find(c => c.value === value)?.labelKey) || value;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/minerals', { params: shopParams() });
      setMinerals(data.minerals || []);
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
        await api.post('/minerals', payload);
        success(t('mineralCreated'));
      } else {
        await api.put(`/minerals/${selected.id}`, payload);
        success(t('mineralUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteMineral'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/minerals/${m.id}`, { params: shopParams() });
      success(t('mineralDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = minerals.filter(m => !search.trim() || [
    m.name, categoryLabel(m.category), m.unit,
  ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Gem}
        accent="cyan"
        title={t('minerals')}
        subtitle={t('mineralsSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('minerals') || 'Minerals'}
              columns={[
                { header: t('mineralName') || 'Name', key: 'name', width: 1.6 },
                { header: t('category') || 'Category', render: m => categoryLabel(m.category), width: 1.2 },
                { header: t('unit') || 'Unit', key: 'unit', width: 0.8 },
                { header: t('defaultPrice') || 'Default Price', render: m => m.default_price, money: true, width: 1 },
                { header: t('royaltyRate') || 'Royalty Rate', render: m => `${m.royalty_rate}${m.royalty_type === 'percentage' ? '%' : ''}`, width: 1 },
              ]}
              rows={filtered}
              filename="minerals.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addMineral')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchMinerals') || 'Search mineral name, category…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('mineralName')}</th>
                <th className="text-start p-4 font-medium">{t('category')}</th>
                <th className="text-start p-4 font-medium">{t('unit')}</th>
                <th className="text-start p-4 font-medium">{t('defaultPrice')}</th>
                <th className="text-start p-4 font-medium">{t('royaltyRate')}</th>
                <th className="text-start p-4 font-medium">{t('mineralProduction')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.category ? categoryLabel(m.category) : '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.unit}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{parseFloat(m.default_price).toLocaleString()}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>
                    {m.royalty_rate}{m.royalty_type === 'percentage' ? '%' : ` / ${m.unit}`}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatProductionTotal(m.production_total) || '—'}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setForm({
                            name: m.name, category: m.category || '', unit: m.unit || 'kg',
                            default_price: m.default_price != null ? String(m.default_price) : '',
                            royalty_type: m.royalty_type || 'percentage',
                            royalty_rate: m.royalty_rate != null ? String(m.royalty_rate) : '',
                            quality_parameters: Array.isArray(m.quality_parameters) ? m.quality_parameters : [],
                          });
                          setModal('edit');
                        }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(m)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noMinerals')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addMineral') : t('editMineral')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <FormLabel required>{t('mineralName')}</FormLabel>
              <input className="input" required value={form.name} onChange={setF('name')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('category')}</FormLabel>
                <select className="input" value={form.category} onChange={setF('category')}>
                  <option value="">{t('none') || '--'}</option>
                  {MINERAL_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{t(c.labelKey) || c.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>{t('unit')}</FormLabel>
                <input className="input" value={form.unit} onChange={setF('unit')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('defaultPrice')}</FormLabel>
              <input className="input" type="number" min="0" step="0.01" value={form.default_price} onChange={setF('default_price')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('royaltyType')}</FormLabel>
                <select className="input" value={form.royalty_type} onChange={setF('royalty_type')}>
                  {ROYALTY_TYPES.map(r => (
                    <option key={r.value} value={r.value}>{t(r.labelKey) || r.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>
                  {t('royaltyRate')} {form.royalty_type === 'percentage' ? '(%)' : `(/ ${form.unit || 'unit'})`}
                </FormLabel>
                <input className="input" type="number" min="0" step="0.001" value={form.royalty_rate} onChange={setF('royalty_rate')} />
              </div>
            </div>

            <div className="space-y-2">
              <FormLabel>{t('qualityParameters')}</FormLabel>
              <div className="space-y-2">
                {form.quality_parameters.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      placeholder={t('parameterName') || 'Parameter (e.g. Purity)'}
                      value={row.name || ''}
                      onChange={e => setForm(f => { const qp = [...f.quality_parameters]; qp[i] = { ...qp[i], name: e.target.value }; return { ...f, quality_parameters: qp }; })}
                    />
                    <input
                      className="input flex-1"
                      placeholder={t('parameterValue') || 'Value (e.g. 99.5%)'}
                      value={row.value || ''}
                      onChange={e => setForm(f => { const qp = [...f.quality_parameters]; qp[i] = { ...qp[i], value: e.target.value }; return { ...f, quality_parameters: qp }; })}
                    />
                    <button type="button" className="icon-btn text-red-400" onClick={() => setForm(f => ({ ...f, quality_parameters: f.quality_parameters.filter((_, j) => j !== i) }))}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-secondary flex items-center gap-2 text-sm" onClick={() => setForm(f => ({ ...f, quality_parameters: [...f.quality_parameters, EMPTY_PARAM()] }))}>
                  <Plus className="w-4 h-4" />{t('addParameter') || 'Add Parameter'}
                </button>
              </div>
            </div>

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
