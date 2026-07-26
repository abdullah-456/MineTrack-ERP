import { useState, useEffect, useCallback } from 'react';
import { Warehouse, Plus, Search, Edit2, Trash2, Link, Loader2, Building2, Check, Phone, MapPin } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../api/axios';

export default function Godowns() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'link' | 'delete'
  const [activeGodown, setActiveGodown] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    status: 'active',
    branch_ids: []
  });

  const [linkBranchIds, setLinkBranchIds] = useState([]);

  const fetchGodowns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/godowns', { params: shopParams() });
      setGodowns(data.godowns || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric') || 'Failed to load godowns');
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => {
    fetchGodowns();
  }, [fetchGodowns]);

  const openCreateModal = () => {
    setForm({ name: '', code: '', address: '', phone: '', status: 'active', branch_ids: [] });
    setModal('create');
  };

  const openEditModal = (g) => {
    setActiveGodown(g);
    const linkedIds = (g.Branches || []).map(b => b.id);
    setForm({
      name: g.name || '',
      code: g.code || '',
      address: g.address || '',
      phone: g.phone || '',
      status: g.status || 'active',
      branch_ids: linkedIds
    });
    setModal('edit');
  };

  const openLinkModal = (g) => {
    setActiveGodown(g);
    const linkedIds = (g.Branches || []).map(b => b.id);
    setLinkBranchIds(linkedIds);
    setModal('link');
  };

  const openDeleteModal = (g) => {
    setActiveGodown(g);
    setModal('delete');
  };

  const handleSaveGodown = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return error('Godown name is required');
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/godowns', { ...form, ...shopParams() });
        success('Godown created successfully');
      } else if (modal === 'edit') {
        await api.put(`/godowns/${activeGodown.id}`, { ...form, ...shopParams() });
        success('Godown updated successfully');
      }
      setModal(null);
      fetchGodowns();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric') || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLinkage = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/godowns/${activeGodown.id}/link-branches`, {
        branch_ids: linkBranchIds,
        ...shopParams()
      });
      success('Branches linked to godown successfully');
      setModal(null);
      fetchGodowns();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to update branch linkage');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGodown = async () => {
    setSaving(true);
    try {
      await api.delete(`/godowns/${activeGodown.id}`, { params: shopParams() });
      success('Godown deleted successfully');
      setModal(null);
      fetchGodowns();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to delete godown');
    } finally {
      setSaving(false);
    }
  };

  const filteredGodowns = godowns.filter(g => {
    const q = search.trim().toLowerCase();
    return !q || [
      g.name, g.code, g.address, g.phone, g.status,
      ...(g.Branches || []).map(b => b.name)
    ].some(v => (v || '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Warehouse}
        accent="amber"
        title={t('godowns') || 'Godowns & Warehouses'}
        subtitle={t('godownsSub') || 'Manage central godowns, storage locations, and link retail branches'}
        action={
          <button type="button" onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addGodown') || 'Add Godown'}
          </button>
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchGodowns') || 'Search godown name, code, location...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('godown') || 'Godown Name'}</th>
                <th className="text-start p-4">{t('code') || 'Code'}</th>
                <th className="text-start p-4">{t('address') || 'Location / Address'}</th>
                <th className="text-start p-4">{t('linkedBranches') || 'Linked Branches'}</th>
                <th className="text-start p-4">{t('status') || 'Status'}</th>
                <th className="text-end p-4">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredGodowns.map(g => {
                const linkedBranches = g.Branches || [];
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4 font-bold" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        <Warehouse className="w-4 h-4 text-amber-400" />
                        <span>{g.name}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-amber-400 text-xs">{g.code || '—'}</td>
                    <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {g.address ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted" />
                          <span>{g.address}</span>
                        </div>
                      ) : '—'}
                      {g.phone && (
                        <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          <Phone className="w-3 h-3" />
                          <span>{g.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      {linkedBranches.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {linkedBranches.map(b => (
                            <span key={b.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              <Building2 className="w-3 h-3" /> {b.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No branches linked</span>
                      )}
                    </td>
                    <td className="p-4"><StatusBadge status={g.status} /></td>
                    <td className="p-4 text-end whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        title={t('linkBranches') || 'Link Branches'}
                        onClick={() => openLinkModal(g)}
                        className="icon-btn"
                      >
                        <Link className="w-4 h-4 text-indigo-400" />
                      </button>
                      <button
                        type="button"
                        title={t('edit') || 'Edit Godown'}
                        onClick={() => openEditModal(g)}
                        className="icon-btn"
                      >
                        <Edit2 className="w-4 h-4 text-amber-400" />
                      </button>
                      <button
                        type="button"
                        title={t('delete') || 'Delete Godown'}
                        onClick={() => openDeleteModal(g)}
                        className="icon-btn hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredGodowns.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    {t('noGodownsFound') || 'No godowns found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / Edit Godown Modal ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? (t('addGodown') || 'Add Godown') : (t('editGodown') || 'Edit Godown')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSaveGodown} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('godownName') || 'Godown Name'}</FormLabel>
                <input
                  className="input"
                  required
                  placeholder="e.g. Central Gulberg Godown, Storage #2"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('code') || 'Godown Code'}</FormLabel>
                <input
                  className="input"
                  placeholder="e.g. GDN-01"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('phone') || 'Contact Phone'}</FormLabel>
                <input
                  className="input"
                  placeholder="e.g. 0300-1234567"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('status') || 'Status'}</FormLabel>
                <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">{t('active') || 'Active'}</option>
                  <option value="disabled">{t('disabled') || 'Disabled'}</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <FormLabel>{t('address') || 'Address / Location'}</FormLabel>
                <textarea
                  className="input min-h-[60px] resize-none"
                  placeholder="Full physical address or location description of the godown..."
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>

            {/* Branch Linkage Selector */}
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <FormLabel>{t('linkBranches') || 'Link Branches to this Godown'}</FormLabel>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Select retail or office branches that use this godown for storage and inventory dispatch:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                {branches.map(b => {
                  const isChecked = form.branch_ids.includes(b.id);
                  return (
                    <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setForm(f => ({ ...f, branch_ids: [...f.branch_ids, b.id] }));
                          } else {
                            setForm(f => ({ ...f, branch_ids: f.branch_ids.filter(id => id !== b.id) }));
                          }
                        }}
                      />
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (modal === 'create' ? (t('create') || 'Create') : (t('save') || 'Save'))}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Link Branches Modal ── */}
      {modal === 'link' && activeGodown && (
        <Modal title={`${t('linkBranches') || 'Link Branches'} — ${activeGodown.name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleSaveLinkage} className="space-y-4">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Check all branches that should be linked to <strong className="text-amber-400">{activeGodown.name}</strong>:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto p-2 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
              {branches.map(b => {
                const isChecked = linkBranchIds.includes(b.id);
                return (
                  <label key={b.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setLinkBranchIds(ids => [...ids, b.id]);
                          } else {
                            setLinkBranchIds(ids => ids.filter(id => id !== b.id));
                          }
                        }}
                      />
                      <Building2 className="w-4 h-4 text-indigo-400" />
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                    </div>
                    {isChecked && <Check className="w-4 h-4 text-emerald-400" />}
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (t('saveLinkage') || 'Save Linkage')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {modal === 'delete' && activeGodown && (
        <Modal title={t('deleteGodown') || 'Delete Godown'} onClose={() => setModal(null)}>
          <div className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Delete Godown "{activeGodown.name}"?
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                This will remove the godown and unlink any attached branches. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="button" onClick={handleDeleteGodown} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex-1 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (t('delete') || 'Delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
