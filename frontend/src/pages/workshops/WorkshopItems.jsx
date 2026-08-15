import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Edit, PackagePlus, History, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY_ITEM = { name: '', unit: '', category: '', unit_price: '', remarks: '' };
const EMPTY_STOCK = { branch_id: '', quantity: '', unit_cost: '', note: '' };

export default function WorkshopItems() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopReady, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [stockForm, setStockForm] = useState(EMPTY_STOCK);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const { data } = await api.get('/workshops/items', { params: shopParams() });
      setItems(data.items || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setSF = (k) => (e) => setStockForm(f => ({ ...f, [k]: e.target.value }));

  const totalQty = (item) => (item.WorkshopStocks || []).reduce((s, r) => s + parseFloat(r.quantity_on_hand || 0), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, unit_price: parseFloat(form.unit_price) || 0, ...shopParams() };
      if (modal === 'create') {
        await api.post('/workshops/items', payload);
        success(t('workshopItemCreated') || 'Workshop item added');
      } else {
        await api.put(`/workshops/items/${selected.id}`, payload);
        success(t('workshopItemUpdated') || 'Workshop item updated');
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/workshops/stock/receive', {
        workshop_item_id: selected.id,
        branch_id: parseInt(stockForm.branch_id, 10),
        quantity: parseFloat(stockForm.quantity) || 0,
        unit_cost: stockForm.unit_cost ? parseFloat(stockForm.unit_cost) : undefined,
        note: stockForm.note || null,
        ...shopParams(),
      });
      success(t('workshopStockAdded') || 'Stock added');
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = items.filter(i => !search.trim() || [
    i.name, i.item_code, i.category,
  ].some(val => (val || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Package}
        accent="amber"
        title={t('workshopItems') || 'Workshop Inventory'}
        subtitle={t('workshopItemsSub') || 'Parts and consumables kept for workshop use — tracked per mine, not linked to purchases'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('workshopItems') || 'Workshop Inventory'} Report`}
              signature
              columns={[
                { header: t('itemCode') || 'Code', key: 'item_code', width: 1 },
                { header: t('itemName') || 'Name', key: 'name', width: 1.6 },
                { header: t('unit') || 'Unit', key: 'unit', width: 0.8 },
                { header: t('category') || 'Category', key: 'category', width: 1 },
                { header: t('quantityOnHand') || 'Qty on Hand', render: i => formatQty(totalQty(i)), width: 1, },
                { header: t('unitPrice') || 'Ref. Price', render: i => formatPKR(i.unit_price), width: 1, money: true },
              ]}
              rows={filtered}
              filename="workshop-items.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY_ITEM); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('newWorkshopItem') || 'New Item'}
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
            placeholder={t('searchWorkshopItems') || 'Search item name, code, category…'}
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
                <th className="text-start p-4 font-medium">{t('itemCode') || 'Code'}</th>
                <th className="text-start p-4 font-medium">{t('itemName') || 'Name'}</th>
                <th className="text-start p-4 font-medium">{t('unit') || 'Unit'}</th>
                <th className="text-start p-4 font-medium">{t('category') || 'Category'}</th>
                <th className="text-start p-4 font-medium">{t('quantityOnHand') || 'Qty on Hand'}</th>
                <th className="text-start p-4 font-medium">{t('unitPrice') || 'Ref. Price'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{i.item_code}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{i.name}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{i.unit}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{i.category || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatQty(totalQty(i))}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatPKR(i.unit_price)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="icon-btn" title={t('workshopLedger') || 'Stock Ledger'} onClick={() => navigate(`/workshops/items/${i.id}/ledger`)}>
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('addStock') || 'Add Stock'}
                        onClick={() => { setSelected(i); setStockForm(EMPTY_STOCK); setModal('stock'); }}
                      >
                        <PackagePlus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setSelected(i);
                          setForm({ name: i.name, unit: i.unit, category: i.category || '', unit_price: String(i.unit_price || ''), remarks: i.remarks || '' });
                          setModal('edit');
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noWorkshopItems') || 'No workshop items yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? (t('newWorkshopItem') || 'New Item') : (t('editWorkshopItem') || 'Edit Item')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <FormLabel required>{t('itemName') || 'Name'}</FormLabel>
              <input className="input" required value={form.name} onChange={setF('name')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('unit') || 'Unit'}</FormLabel>
                <input className="input" required value={form.unit} onChange={setF('unit')} placeholder="pcs, kg, litre…" />
              </div>
              <div>
                <FormLabel>{t('category') || 'Category'}</FormLabel>
                <input className="input" value={form.category} onChange={setF('category')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('unitPrice') || 'Reference Price'}</FormLabel>
              <input type="number" min="0" step="any" className="input" value={form.unit_price} onChange={setF('unit_price')} />
            </div>
            <div>
              <FormLabel>{t('remarks')}</FormLabel>
              <textarea className="input" rows={2} value={form.remarks} onChange={setF('remarks')} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'stock' && selected && (
        <Modal title={`${t('addStock') || 'Add Stock'} — ${selected.name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleAddStock} className="space-y-3">
            <div>
              <FormLabel required>{t('mine') || 'Mine'}</FormLabel>
              <select className="input" required value={stockForm.branch_id} onChange={setSF('branch_id')}>
                <option value="">{t('selectMine') || 'Select mine…'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('quantity') || 'Quantity'}</FormLabel>
                <input type="number" min="0" step="any" className="input" required value={stockForm.quantity} onChange={setSF('quantity')} />
              </div>
              <div>
                <FormLabel>{t('unitCost') || 'Unit Cost'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={stockForm.unit_cost} onChange={setSF('unit_cost')} placeholder={String(selected.unit_price || '')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('note') || 'Note'}</FormLabel>
              <input className="input" value={stockForm.note} onChange={setSF('note')} placeholder={t('workshopStockNotePlaceholder') || 'e.g. bought locally, opening balance…'} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('addStock') || 'Add Stock'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
