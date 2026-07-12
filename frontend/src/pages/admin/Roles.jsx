import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Plus, Edit, Trash2, Loader2, Lock } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

const EMPTY = { name: '', description: '' };

export default function Roles() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [grants, setGrants] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const key = (m, a) => `${m}:${a}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        api.get('/roles', { params: shopParams() }),
        api.get('/roles/permissions-catalog', { params: shopParams() }),
      ]);
      setRoles(rolesRes.data.roles || []);
      setCatalog(catalogRes.data.modules || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm(EMPTY);
    setGrants(new Set());
    setModal('create');
  };

  const openEdit = (role) => {
    setSelected(role);
    setForm({ name: role.display_name, description: role.description || '' });
    setGrants(new Set(role.permissions.map(p => key(p.module, p.action))));
    setModal('edit');
  };

  const toggleGrant = (m, a) => {
    setGrants(prev => {
      const next = new Set(prev);
      const k = key(m, a);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const toggleModuleAll = (m, actions) => {
    setGrants(prev => {
      const next = new Set(prev);
      const allOn = actions.every(a => next.has(key(m, a)));
      actions.forEach(a => {
        const k = key(m, a);
        if (allOn) next.delete(k); else next.add(k);
      });
      return next;
    });
  };

  const permissionsPayload = () => Array.from(grants).map(k => {
    const idx = k.indexOf(':');
    return { module: k.slice(0, idx), action: k.slice(idx + 1) };
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, permissions: permissionsPayload(), ...shopParams() };
      if (modal === 'create') {
        await api.post('/roles', payload);
        success(t('roleCreated'));
      } else {
        await api.put(`/roles/${selected.id}`, payload);
        success(t('roleUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteRole'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/roles/${role.id}`, { params: shopParams() });
      success(t('roleDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={KeyRound}
        accent="violet"
        title={t('roles')}
        subtitle={t('rolesSub')}
        action={
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('createRole')}
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('name')}</th>
                <th className="text-start p-4 font-medium">{t('description')}</th>
                <th className="text-start p-4 font-medium">{t('type')}</th>
                <th className="text-start p-4 font-medium">{t('permissions')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {r.locked && <Lock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
                    {r.display_name}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.description || '—'}</td>
                  <td className="p-4">
                    <span className={`badge ${r.is_system ? 'badge-blue' : 'badge-green'}`}>
                      {r.is_system ? t('systemRole') : t('customRole')}
                    </span>
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.permissions.length}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={r.locked}
                        onClick={() => openEdit(r)}
                        className="icon-btn"
                        style={r.locked ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                        title={r.locked ? t('roleLocked') : t('edit')}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={r.is_system}
                        onClick={() => handleDelete(r)}
                        className="icon-btn text-red-400"
                        style={r.is_system ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                        title={r.is_system ? t('roleLocked') : t('delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noRoles')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('createRole') : t('editRole')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('name')} *</label>
                <input className="input" required disabled={modal === 'edit'} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('description')}</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>{t('permissions')}</label>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <th className="text-start p-2">{t('module')}</th>
                      <th className="text-center p-2">{t('create')}</th>
                      <th className="text-center p-2">{t('read')}</th>
                      <th className="text-center p-2">{t('update')}</th>
                      <th className="text-center p-2">{t('delete')}</th>
                      <th className="text-center p-2">{t('other')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map(({ module, actions }) => {
                      const standard = ['create', 'read', 'update', 'delete'];
                      const extra = actions.filter(a => !standard.includes(a));
                      return (
                        <tr key={module} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td className="p-2 font-medium cursor-pointer" style={{ color: 'var(--text-primary)' }} onClick={() => toggleModuleAll(module, actions)}>
                            {module}
                          </td>
                          {standard.map(a => (
                            <td key={a} className="text-center p-2">
                              {actions.includes(a) ? (
                                <input type="checkbox" checked={grants.has(key(module, a))} onChange={() => toggleGrant(module, a)} />
                              ) : '—'}
                            </td>
                          ))}
                          <td className="text-center p-2">
                            {extra.length > 0 ? extra.map(a => (
                              <label key={a} className="inline-flex items-center gap-1 me-2">
                                <input type="checkbox" checked={grants.has(key(module, a))} onChange={() => toggleGrant(module, a)} />
                                <span style={{ color: 'var(--text-muted)' }}>{a}</span>
                              </label>
                            )) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
