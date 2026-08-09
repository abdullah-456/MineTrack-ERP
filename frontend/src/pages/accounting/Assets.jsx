import { useState, useEffect, useCallback, useMemo } from 'react';
import { Landmark, Loader2, Plus, Edit, Trash2, Search, Eye, PackageX } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import DocumentsPanel from '../../components/documents/DocumentsPanel';
import PaymentAccountSelect from '../../components/ui/PaymentAccountSelect';
import api from '../../api/axios';

const DEFAULT_CATEGORIES = ['Building', 'Machinery', 'Vehicle', 'Equipment', 'Furniture & Fixtures', 'Other'];
const ADD_NEW = '__add_new__';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  asset_name: '', category: '', branch_id: '', purchase_date: today(),
  purchase_cost: '', salvage_value: '0', useful_life_years: '', depreciation_percentage: '',
  is_paid: true, paid_via: 'cash', bank_account_id: null,
  insurance_provider: '', insurance_policy_number: '', insurance_premium: '', insurance_expiry: '',
  notes: '',
};

const EMPTY_DISPOSAL = { disposal_date: today(), disposal_value: '0', disposal_via: 'cash', bank_account_id: null, notes: '' };

export default function Assets() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { can } = useAuth();
  const { shopParams, branches } = useShopApi();

  const canCreate = can('assets', 'create');
  const canUpdate = can('assets', 'update');
  const canDelete = can('assets', 'delete');

  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [form, setForm] = useState(EMPTY);
  const [addingCategory, setAddingCategory] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const [viewAsset, setViewAsset] = useState(null);
  const [disposeAsset, setDisposeAsset] = useState(null);
  const [disposeForm, setDisposeForm] = useState(EMPTY_DISPOSAL);
  const [disposing, setDisposing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams() };
      if (statusFilter !== 'all') params.status = statusFilter;
      const [{ data }, { data: catData }] = await Promise.all([
        api.get('/assets', { params }),
        api.get('/assets/categories', { params: shopParams() }),
      ]);
      setAssets(data.assets || []);
      setCategories([...new Set([...DEFAULT_CATEGORIES, ...(catData.categories || [])])]);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, statusFilter, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.trim().toLowerCase();
    return assets.filter(a => [a.asset_name, a.asset_code, a.category].some(v => (v || '').toLowerCase().includes(q)));
  }, [assets, search]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setSelected(null); setForm(EMPTY); setAddingCategory(false); setModal('create'); };
  const openEdit = (a) => {
    setSelected(a);
    setForm({
      asset_name: a.asset_name, category: a.category, branch_id: a.branch_id || '',
      purchase_date: a.purchase_date, purchase_cost: a.purchase_cost, salvage_value: a.salvage_value ?? '0',
      useful_life_years: a.useful_life_years, depreciation_percentage: a.depreciation_percentage ?? '',
      is_paid: a.is_paid,
      paid_via: a.paid_via || 'cash', bank_account_id: a.bank_account_id || null,
      insurance_provider: a.insurance_provider || '', insurance_policy_number: a.insurance_policy_number || '',
      insurance_premium: a.insurance_premium || '', insurance_expiry: a.insurance_expiry || '',
      notes: a.notes || '',
    });
    setAddingCategory(false);
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...shopParams(),
        asset_name: form.asset_name,
        category: form.category,
        branch_id: form.branch_id || null,
        purchase_date: form.purchase_date,
        purchase_cost: form.purchase_cost,
        salvage_value: form.salvage_value || 0,
        useful_life_years: form.useful_life_years,
        depreciation_percentage: form.depreciation_percentage === '' ? null : form.depreciation_percentage,
        is_paid: form.is_paid,
        paid_via: form.is_paid ? form.paid_via : null,
        bank_account_id: form.is_paid ? form.bank_account_id : null,
        insurance_provider: form.insurance_provider || null,
        insurance_policy_number: form.insurance_policy_number || null,
        insurance_premium: form.insurance_premium || null,
        insurance_expiry: form.insurance_expiry || null,
        notes: form.notes || null,
      };
      if (modal === 'create') {
        await api.post('/assets', payload);
        success(t('assetCreated') || 'Asset added');
      } else {
        await api.put(`/assets/${selected.id}`, payload);
        success(t('assetUpdated') || 'Asset updated');
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteAsset') || 'Delete this asset? Any linked payment will be reversed.', confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      const { data } = await api.delete(`/assets/${a.id}`, { params: shopParams() });
      success(data.message === 'Asset deleted' ? (t('assetDeleted') || 'Asset deleted') : (t('deletionRequestSubmitted') || 'Deletion request submitted for approval'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const openDispose = (a) => { setDisposeAsset(a); setDisposeForm(EMPTY_DISPOSAL); };
  const handleDispose = async (e) => {
    e.preventDefault();
    setDisposing(true);
    try {
      await api.post(`/assets/${disposeAsset.id}/dispose`, { ...disposeForm, ...shopParams() });
      success(t('assetDisposed') || 'Asset disposed');
      setDisposeAsset(null);
      setViewAsset(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setDisposing(false);
    }
  };

  const statusBadge = (a) => {
    if (a.status === 'disposed') return <span className="badge badge-blue">{t('disposed') || 'Disposed'}</span>;
    return <span className="badge badge-green">{t('active') || 'Active'}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        accent="brand"
        title={t('assets') || 'Asset Management'}
        subtitle={t('assetsSub') || 'Buildings, machinery, vehicles and other fixed assets — cost, depreciation, insurance and disposal'}
        action={canCreate && (
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addAsset') || 'Add Asset'}
          </button>
        )}
      />

      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ left: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchAssets') || 'Search name, code, category…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="active">{t('active') || 'Active'}</option>
          <option value="disposed">{t('disposed') || 'Disposed'}</option>
          <option value="all">{t('all') || 'All'}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('assetCode') || 'Code'}</th>
                <th className="text-start p-4">{t('assetName') || 'Asset'}</th>
                <th className="text-start p-4">{t('category') || 'Category'}</th>
                <th className="text-end p-4">{t('purchaseCost') || 'Purchase Cost'}</th>
                <th className="text-end p-4">{t('bookValue') || 'Book Value'}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{a.asset_code}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {a.asset_name}
                    {!a.is_paid && (
                      <span className="ms-2 text-xs uppercase text-amber-400">· {t('withoutAccountAttachment') || 'without any account attachment'}</span>
                    )}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{a.category}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{formatPKR(a.purchase_cost, lang)}</td>
                  <td className="p-4 text-end font-medium" style={{ color: 'var(--text-primary)' }}>{formatPKR(a.bookValue, lang)}</td>
                  <td className="p-4">{statusBadge(a)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="icon-btn" title={t('viewDetails') || 'View'} onClick={() => setViewAsset(a)}><Eye className="w-4 h-4" /></button>
                      {canUpdate && a.status === 'active' && (
                        <button type="button" className="icon-btn" title={t('edit')} onClick={() => openEdit(a)}><Edit className="w-4 h-4" /></button>
                      )}
                      {canDelete && a.status === 'active' && (
                        <button type="button" className="icon-btn text-red-400" title={t('delete')} onClick={() => handleDelete(a)}><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noAssets') || 'No assets found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? (t('addAsset') || 'Add Asset') : (t('editAsset') || 'Edit Asset')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('assetName') || 'Asset Name'}</FormLabel>
                <input className="input" required value={form.asset_name} onChange={setF('asset_name')} />
              </div>
              <div>
                <FormLabel required>{t('category') || 'Category'}</FormLabel>
                {addingCategory ? (
                  <div className="flex gap-2">
                    <input className="input" required autoFocus placeholder={t('newCategoryName') || 'New category name'} value={form.category} onChange={setF('category')} />
                    <button type="button" className="btn-secondary" onClick={() => setAddingCategory(false)}>{t('cancel')}</button>
                  </div>
                ) : (
                  <select
                    className="input"
                    required
                    value={form.category}
                    onChange={e => {
                      if (e.target.value === ADD_NEW) { setAddingCategory(true); setForm(f => ({ ...f, category: '' })); }
                      else setForm(f => ({ ...f, category: e.target.value }));
                    }}
                  >
                    <option value="" disabled>{t('selectCategory') || 'Select category…'}</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value={ADD_NEW}>+ {t('addNewCategory') || 'Add new category'}</option>
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FormLabel required>{t('purchaseDate') || 'Purchase Date'}</FormLabel>
                <input type="date" className="input" required value={form.purchase_date} onChange={setF('purchase_date')} />
              </div>
              <div>
                <FormLabel required>{t('purchaseCost') || 'Purchase Cost'}</FormLabel>
                <input type="number" min="0.01" step="0.01" className="input" required value={form.purchase_cost} onChange={setF('purchase_cost')} />
              </div>
              <div>
                <FormLabel>{t('location') || 'Location / Mine'}</FormLabel>
                <select className="input" value={form.branch_id} onChange={setF('branch_id')}>
                  <option value="">{t('none') || '--'}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FormLabel required>{t('usefulLife') || 'Useful Life (years)'}</FormLabel>
                <input type="number" min="0.1" step="0.1" className="input" required value={form.useful_life_years} onChange={setF('useful_life_years')} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('usefulLifeHint') || 'Depreciation stops after this many years — the asset stays on your register until you dispose it.'}
                </p>
              </div>
              <div>
                <FormLabel>{t('depreciationPercentage') || 'Depreciation % (per year)'}</FormLabel>
                <input type="number" min="0" max="100" step="0.1" className="input" placeholder={t('none') || '--'} value={form.depreciation_percentage} onChange={setF('depreciation_percentage')} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('depreciationPercentageHint') || 'Reducing balance — % of the CURRENT book value, each year. Leave blank for no depreciation (e.g. land).'}
                </p>
              </div>
              <div>
                <FormLabel>{t('salvageValue') || 'Salvage Value'}</FormLabel>
                <input type="number" min="0" step="0.01" className="input" value={form.salvage_value} onChange={setF('salvage_value')} />
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <FormLabel>{t('isPaidQuestion') || 'Has this asset been paid for?'}</FormLabel>
              <div className="flex gap-3 mt-1">
                <button type="button" className={form.is_paid ? 'btn-primary flex-1' : 'btn-secondary flex-1'} onClick={() => setForm(f => ({ ...f, is_paid: true }))}>{t('yesPaid') || 'Yes, paid'}</button>
                <button type="button" className={!form.is_paid ? 'btn-primary flex-1' : 'btn-secondary flex-1'} onClick={() => setForm(f => ({ ...f, is_paid: false }))}>{t('noUnpaid') || 'No / not paid'}</button>
              </div>
              {form.is_paid ? (
                <div className="mt-3">
                  <FormLabel required>{t('paidVia') || 'Payment Method'}</FormLabel>
                  <PaymentAccountSelect
                    required
                    includeBod={false}
                    method={form.paid_via}
                    bankAccountId={form.bank_account_id}
                    onChange={({ method, bank_account_id }) => setForm(f => ({ ...f, paid_via: method, bank_account_id }))}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('paidAssetHint') || 'The purchase cost will be deducted from this account and posted to the books.'}
                  </p>
                </div>
              ) : (
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  {t('unpaidAssetHint') || 'This asset will be tracked but no money moves and no journal entry is posted — it shows up "without any account attachment".'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('insuranceProvider') || 'Insurance Provider'}</FormLabel>
                <input className="input" value={form.insurance_provider} onChange={setF('insurance_provider')} />
              </div>
              <div>
                <FormLabel>{t('insurancePolicyNumber') || 'Policy Number'}</FormLabel>
                <input className="input" value={form.insurance_policy_number} onChange={setF('insurance_policy_number')} />
              </div>
              <div>
                <FormLabel>{t('insurancePremium') || 'Premium'}</FormLabel>
                <input type="number" min="0" step="0.01" className="input" value={form.insurance_premium} onChange={setF('insurance_premium')} />
              </div>
              <div>
                <FormLabel>{t('insuranceExpiry') || 'Insurance Expiry'}</FormLabel>
                <input type="date" className="input" value={form.insurance_expiry} onChange={setF('insurance_expiry')} />
              </div>
            </div>

            <div>
              <FormLabel>{t('notes') || 'Notes'}</FormLabel>
              <textarea className="input" rows={2} value={form.notes} onChange={setF('notes')} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {viewAsset && (
        <Modal title={`${viewAsset.asset_name} (${viewAsset.asset_code})`} onClose={() => setViewAsset(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-card p-3">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('purchaseCost') || 'Purchase Cost'}</span>
                <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(viewAsset.purchase_cost, lang)}</p>
              </div>
              <div className="glass-card p-3">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('accumulatedDepreciation') || 'Accumulated Depreciation'}</span>
                <p className="font-bold text-amber-400">{formatPKR(viewAsset.accumulatedDepreciation, lang)}</p>
              </div>
              <div className="glass-card p-3">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('bookValue') || 'Book Value'}</span>
                <p className="font-bold text-emerald-400">{formatPKR(viewAsset.bookValue, lang)}</p>
              </div>
              <div className="glass-card p-3">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('status')}</span>
                <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{statusBadge(viewAsset)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span style={{ color: 'var(--text-muted)' }}>{t('category') || 'Category'}: </span>{viewAsset.category}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('purchaseDate') || 'Purchase Date'}: </span>{viewAsset.purchase_date}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('usefulLife') || 'Useful Life'}: </span>{viewAsset.useful_life_years} {t('years') || 'years'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>{t('salvageValue') || 'Salvage Value'}: </span>{formatPKR(viewAsset.salvage_value, lang)}</div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>{t('depreciationPercentage') || 'Depreciation %'}: </span>
                {viewAsset.depreciation_percentage ? `${viewAsset.depreciation_percentage}% ${t('reducingBalance') || '(reducing balance)'}` : (t('none') || '--')}
              </div>
              {viewAsset.depreciation_percentage != null && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>{t('yearsDepreciated') || 'Years Depreciated'}: </span>
                  {viewAsset.yearsElapsed} {t('of') || 'of'} {viewAsset.useful_life_years}
                  {viewAsset.is_paid && ` (${viewAsset.depreciation_years_posted || 0} ${t('posted') || 'posted'})`}
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)' }}>{t('paidVia') || 'Payment'}: </span>
                {viewAsset.is_paid ? `${viewAsset.paid_via === 'bank' ? (t('bank') || 'Bank') : (t('cash') || 'Cash')} — ${viewAsset.Voucher?.voucher_number || ''}` : (t('withoutAccountAttachment') || 'without any account attachment')}
              </div>
              {viewAsset.insurance_provider && (
                <div><span style={{ color: 'var(--text-muted)' }}>{t('insuranceProvider') || 'Insurance'}: </span>{viewAsset.insurance_provider} ({viewAsset.insurance_expiry})</div>
              )}
              {viewAsset.status === 'disposed' && (
                <>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t('disposalDate') || 'Disposal Date'}: </span>{viewAsset.disposal_date}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t('disposalValue') || 'Disposal Value'}: </span>{formatPKR(viewAsset.disposal_value, lang)}</div>
                </>
              )}
            </div>

            {viewAsset.status === 'active' && canUpdate && (
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => openDispose(viewAsset)}>
                <PackageX className="w-4 h-4" />{t('disposeAsset') || 'Dispose Asset'}
              </button>
            )}

            <DocumentsPanel ownerType="asset" ownerId={viewAsset.id} canEdit={canUpdate} />
          </div>
        </Modal>
      )}

      {disposeAsset && (
        <Modal title={`${t('disposeAsset') || 'Dispose Asset'} — ${disposeAsset.asset_name}`} onClose={() => setDisposeAsset(null)}>
          <form onSubmit={handleDispose} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('currentBookValue') || 'Current book value'}: <strong>{formatPKR(disposeAsset.bookValue, lang)}</strong>
            </p>
            <div>
              <FormLabel required>{t('disposalDate') || 'Disposal Date'}</FormLabel>
              <input type="date" className="input" required value={disposeForm.disposal_date} onChange={e => setDisposeForm(f => ({ ...f, disposal_date: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('disposalValue') || 'Disposal Value (proceeds received)'}</FormLabel>
              <input type="number" min="0" step="0.01" className="input" value={disposeForm.disposal_value} onChange={e => setDisposeForm(f => ({ ...f, disposal_value: e.target.value }))} />
            </div>
            {parseFloat(disposeForm.disposal_value) > 0 && disposeAsset.is_paid && (
              <div>
                <FormLabel required>{t('receivedInto') || 'Received Into'}</FormLabel>
                <PaymentAccountSelect
                  required
                  includeBod={false}
                  method={disposeForm.disposal_via}
                  bankAccountId={disposeForm.bank_account_id}
                  onChange={({ method, bank_account_id }) => setDisposeForm(f => ({ ...f, disposal_via: method, bank_account_id }))}
                />
              </div>
            )}
            <div>
              <FormLabel>{t('notes') || 'Notes'}</FormLabel>
              <textarea className="input" rows={2} value={disposeForm.notes} onChange={e => setDisposeForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setDisposeAsset(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={disposing} className="btn-primary flex-1">{t('confirm') || 'Confirm'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
