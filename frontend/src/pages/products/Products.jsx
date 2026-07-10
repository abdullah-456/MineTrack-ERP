import { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Search, Edit, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge, { StockBadge } from '../../components/ui/StatusBadge';
import api from '../../api/axios';

const EMPTY = {
  name: '', sku: '', barcode: '', category_id: '', brand: '', unit: 'Pcs',
  cost_price: '', sale_price: '', tax_rate: '0', reorder_level: '5',
  supplier_id: '', initial_quantity: '0', branch_id: '', status: 'active',
};

export default function Products() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search };
      const [pRes, cRes, sRes] = await Promise.all([
        api.get('/products', { params }),
        api.get('/categories', { params: shopParams() }),
        api.get('/suppliers', { params: shopParams() }),
      ]);
      setProducts(pRes.data.products || []);
      setCategories(cRes.data.categories || []);
      setSuppliers(sRes.data.suppliers || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalStock = (p) => (p.Stock || []).reduce((s, x) => s + x.quantity_on_hand, 0);

  const openCreate = () => {
    setForm({ ...EMPTY, branch_id: branches[0]?.id || '' });
    setSelected(null);
    setModal('create');
  };

  const openEdit = (p) => {
    setSelected(p);
    setForm({
      name: p.name, sku: p.sku, barcode: p.barcode || '', category_id: p.category_id,
      brand: p.brand || '', unit: p.unit || 'Pcs', cost_price: p.cost_price,
      sale_price: p.sale_price, tax_rate: p.tax_rate, reorder_level: p.reorder_level,
      status: p.status, supplier_id: '', initial_quantity: '0', branch_id: '',
    });
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        cost_price: parseFloat(form.cost_price),
        sale_price: parseFloat(form.sale_price),
        tax_rate: parseFloat(form.tax_rate) || 0,
        reorder_level: parseInt(form.reorder_level, 10) || 5,
        initial_quantity: parseInt(form.initial_quantity, 10) || 0,
        supplier_id: form.supplier_id || undefined,
        branch_id: form.branch_id || undefined,
        ...shopParams(),
      };
      if (modal === 'create') {
        await api.post('/products', payload);
        success(t('productCreated'));
      } else {
        await api.put(`/products/${selected.id}`, payload);
        success(t('productUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Package}
        accent="blue"
        title={t('products')}
        subtitle={t('productsSub')}
        action={
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addProduct')}
          </button>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" style={{ [isRTL ? 'right' : 'left']: '12px' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchProducts')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('sku')}</th>
                <th className="text-start p-4">{t('name')}</th>
                <th className="text-start p-4">{t('category')}</th>
                <th className="text-start p-4">{t('totalStock')}</th>
                <th className="text-start p-4">{t('costPrice')}</th>
                <th className="text-start p-4">{t('salePrice')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-blue-400 text-xs">{p.sku}</td>
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                    {p.brand && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.brand}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{p.Category?.name}</td>
                  <td className="p-4"><StockBadge qty={totalStock(p)} reorder={p.reorder_level} /></td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatPKR(p.cost_price, lang)}</td>
                  <td className="p-4 font-semibold text-emerald-400">{formatPKR(p.sale_price, lang)}</td>
                  <td className="p-4"><StatusBadge status={p.status} /></td>
                  <td className="p-4 text-end">
                    <button type="button" onClick={() => openEdit(p)} className="icon-btn"><Edit className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noProducts')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addProduct') : t('editProduct')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('name')} *</label>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('category')} *</label>
                <select className="input" required value={form.category_id} onChange={setF('category_id')}>
                  <option value="">{t('selectCategory')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('brand')}</label>
                <input className="input" value={form.brand} onChange={setF('brand')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('sku')}</label>
                <input className="input" value={form.sku} onChange={setF('sku')} placeholder={t('autoGenerated')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('barcode')}</label>
                <input className="input" value={form.barcode} onChange={setF('barcode')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('costPrice')} *</label>
                <input className="input" type="number" min="0" step="0.01" required value={form.cost_price} onChange={setF('cost_price')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('salePrice')} *</label>
                <input className="input" type="number" min="0" step="0.01" required value={form.sale_price} onChange={setF('sale_price')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('reorderLevel')}</label>
                <input className="input" type="number" min="0" value={form.reorder_level} onChange={setF('reorder_level')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('unit')}</label>
                <input className="input" value={form.unit} onChange={setF('unit')} />
              </div>
              {modal === 'create' && (
                <>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('supplier')}</label>
                    <select className="input" value={form.supplier_id} onChange={setF('supplier_id')}>
                      <option value="">{t('optional')}</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('initialStock')}</label>
                    <input className="input" type="number" min="0" value={form.initial_quantity} onChange={setF('initial_quantity')} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('userBranch')}</label>
                    <select className="input" value={form.branch_id} onChange={setF('branch_id')}>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </>
              )}
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
