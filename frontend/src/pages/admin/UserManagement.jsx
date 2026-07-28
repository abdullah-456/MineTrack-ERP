import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Users, Plus, Edit, Slash, RefreshCw, Search,
  Eye, EyeOff, Loader2, KeyRound, Trash2, UserCheck
} from 'lucide-react';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';

const ROLE_COLORS = {
  super_admin: 'badge-purple',
  admin:       'badge-blue',
  accountant:  'badge-green',
  user:        'badge-yellow',
};

const BRANCH_REQUIRED_ROLES = ['accountant', 'user'];

export default function UserManagement() {
  const { t, lang } = useTheme();
  const { user: me, isSuperAdmin } = useAuth();
  const { success, error, confirm } = useToast();
  const superAdmin = isSuperAdmin();
  const isRTL = lang === 'ur';

  const [users, setUsers]       = useState([]);
  const [roles, setRoles]       = useState([]);
  const [shops, setShops]       = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [shopFilter, setShopFilter]   = useState('all');
  const [roleFilter, setRoleFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalType, setModalType]       = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', password: '', role_id: '', shop_id: '', branch_id: '', status: 'active'
  });
  const [resetPw, setResetPw] = useState('');
  const [showPw, setShowPw]   = useState(false);

  const roleLabel = (name) => {
    const map = {
      super_admin: t('roleSuperAdmin'),
      admin:       t('roleAdmin'),
      accountant:  t('roleAccountant'),
      user:        t('roleUser'),
    };
    return map[name] || name;
  };

  const selectedRoleName = roles.find(r => String(r.id) === String(form.role_id))?.name;
  const needsShop = selectedRoleName && selectedRoleName !== 'super_admin';
  const needsBranch = BRANCH_REQUIRED_ROLES.includes(selectedRoleName);

  const fetchBranches = useCallback(async (shopId) => {
    if (!shopId) { setBranches([]); return; }
    try {
      const params = superAdmin ? { shop_id: shopId } : {};
      const { data } = await api.get('/branches', { params });
      setBranches(data.branches || []);
    } catch { setBranches([]); }
  }, [superAdmin]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (superAdmin && shopFilter !== 'all') params.shop_id = shopFilter;

      const requests = [
        api.get('/users', { params }),
        api.get('/users/roles'),
      ];
      if (superAdmin) requests.push(api.get('/branches/shops'));

      const results = await Promise.all(requests);
      setUsers(results[0].data.users || []);
      setRoles(results[1].data.roles || []);
      if (superAdmin) setShops(results[2].data.shops || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [shopFilter]);

  useEffect(() => {
    if (superAdmin && form.shop_id) fetchBranches(form.shop_id);
    else if (!superAdmin && me?.shop_id) fetchBranches(me.shop_id);
  }, [form.shop_id, superAdmin, me?.shop_id, fetchBranches]);

  const openCreate = () => {
    setForm({
      name: '', email: '', password: '', role_id: '', shop_id: '', branch_id: '', status: 'active'
    });
    setFormError('');
    setModalType('create');
  };

  const openEdit = (u) => {
    setSelectedUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role_id: u.Role?.id || '',
      shop_id: u.shop_id || '',
      branch_id: u.branch_id || '',
      status: u.status,
    });
    setFormError('');
    setModalType('edit');
    if (u.shop_id) fetchBranches(u.shop_id);
  };

  const openReset = (u) => {
    setSelectedUser(u);
    setResetPw(''); setShowPw(false); setFormError('');
    setModalType('reset');
  };

  const closeModal = () => { setModalType(null); setSelectedUser(null); };

  const setF = (k) => (e) => {
    const value = e.target.value;
    setForm(f => {
      const next = { ...f, [k]: value };
      if (k === 'role_id') {
        const role = roles.find(r => String(r.id) === String(value));
        if (role?.name === 'super_admin') {
          next.shop_id = '';
          next.branch_id = '';
        }
      }
      if (k === 'shop_id') next.branch_id = '';
      return next;
    });
    if (k === 'shop_id' && value) fetchBranches(value);
  };

  const buildPayload = () => {
    const payload = {
      name: form.name,
      email: form.email,
      role_id: form.role_id,
      branch_id: form.branch_id || null,
      status: form.status,
    };
    if (superAdmin && needsShop) payload.shop_id = form.shop_id;
    return payload;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await api.post('/users', { ...buildPayload(), password: form.password });
      success(t('toastUserCreated'));
      await fetchData();
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || t('errorCreatingUser');
      setFormError(msg);
      error(msg);
    } finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await api.put(`/users/${selectedUser.id}`, buildPayload());
      success(t('toastUserUpdated'));
      await fetchData();
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || t('errorUpdatingUser');
      setFormError(msg);
      error(msg);
    } finally { setSaving(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await api.post(`/users/${selectedUser.id}/reset-password`, { new_password: resetPw });
      success(t('toastPasswordReset'));
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || t('errorResettingPassword');
      setFormError(msg);
      error(msg);
    } finally { setSaving(false); }
  };

  const handleSuspend = async (u) => {
    const ok = await confirm({
      title: t('suspendUser'),
      message: t('confirmSuspend'),
      confirmLabel: t('suspendUser'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      await api.post(`/users/${u.id}/suspend`);
      success(t('toastUserSuspended'));
      await fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleActivate = async (u) => {
    const ok = await confirm({
      title: t('activateUser'),
      message: t('confirmActivate'),
      confirmLabel: t('activateUser'),
      cancelLabel: t('cancel'),
      variant: 'primary',
    });
    if (!ok) return;
    try {
      await api.post(`/users/${u.id}/activate`);
      success(t('toastUserActivated'));
      await fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleDelete = async (u) => {
    const ok = await confirm({
      title: t('deleteUser'),
      message: t('confirmDeleteUser'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${u.id}`);
      success(t('toastUserDeleted'));
      await fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = users.filter(u => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || [
      u.name, u.username, u.email, u.phone, u.status, u.Role?.name, u.Shop?.name, u.Branch?.name
    ].some(v => (v || '').toLowerCase().includes(q));
    const matchRole   = roleFilter   === 'all' || u.Role?.name === roleFilter;
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const shopBranchFields = (isEdit = false) => (
    <>
      {superAdmin && needsShop && (
        <div>
          <FormLabel variant="admin" required>{t('userShop')}</FormLabel>
          <select required value={form.shop_id} onChange={setF('shop_id')} className="input-field">
            <option value="">{t('selectShop')}</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {needsShop && (
        <div>
          <LocationPicker
            required={needsBranch}
            label={t('userBranch') || 'Branch / Godown'}
            value={{
              location_type: form.location_type || 'branch',
              branch_id: form.branch_id,
              godown_id: form.godown_id,
            }}
            onChange={(loc) => setForm(f => ({
              ...f,
              location_type: loc.location_type,
              branch_id: loc.branch_id,
              godown_id: loc.godown_id,
            }))}
          />
        </div>
      )}
      {!isEdit && superAdmin && selectedRoleName === 'super_admin' && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('superAdminNoShop')}</p>
      )}
    </>
  );

  return (
    <div className="space-y-5 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('userManagement')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('userManagementSub')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReportActions
            title={t('userManagement') || 'Users'}
            columns={[
              { header: t('userName') || 'Name', key: 'name', width: 1.6 },
              { header: t('userEmail') || 'Email', key: 'email', width: 2 },
              { header: t('userRole') || 'Role', render: u => roleLabel(u.Role?.name), width: 1.2 },
              { header: t('userBranch') || 'Branch', render: u => u.Branch?.name || '', width: 1.1 },
              { header: t('userStatus') || 'Status', key: 'status', width: 0.9 },
            ]}
            rows={filtered}
            filters={[
              roleFilter !== 'all' ? { label: t('userRole') || 'Role', value: roleLabel(roleFilter) } : null,
              statusFilter !== 'all' ? { label: t('userStatus') || 'Status', value: statusFilter } : null,
            ].filter(Boolean)}
            filename="users.pdf"
          />
          <button onClick={fetchData} className="icon-btn">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2" id="create-user-btn">
            <Plus className="w-4 h-4" /> {t('createUser')}
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap gap-3 items-center">
        <div className="search-bar flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('search')} className="bg-transparent outline-none text-sm w-full"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        {superAdmin && (
          <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
            className="input-field py-2 text-sm">
            <option value="all">{t('filterByShop')}</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="input-field py-2 text-sm" id="role-filter-select">
          <option value="all">{t('all')} {t('userRole')}</option>
          {roles.map(r => <option key={r.id} value={r.name}>{roleLabel(r.name)}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="input-field py-2 text-sm" id="status-filter-select">
          <option value="all">{t('all')} {t('userStatus')}</option>
          <option value="active">{t('active')}</option>
          <option value="disabled">{t('suspended')}</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="space-y-3 p-2">
            {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg skeleton" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-muted)' }}>{t('noUsers')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('userName')}</th>
                  <th>{t('userEmail')}</th>
                  {superAdmin && <th>{t('userShop')}</th>}
                  <th>{t('userRole')}</th>
                  <th>{t('userBranch')}</th>
                  <th>{t('userStatus')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, idx) => (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                          {u.id === me?.id && (
                            <span className="text-[10px] text-brand-400 font-medium">({t('you')})</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    {superAdmin && (
                      <td style={{ color: 'var(--text-muted)' }}>
                        {u.Shop?.name || (u.Role?.name === 'super_admin' ? '—' : t('noShop'))}
                      </td>
                    )}
                    <td>
                      <span className={`badge ${ROLE_COLORS[u.Role?.name] || 'badge-blue'}`}>
                        {roleLabel(u.Role?.name)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {u.Branch?.name || (u.Role?.name === 'admin' ? t('allBranches') : '—')}
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {u.status === 'active' ? t('active') : t('suspended')}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} className="icon-btn" title={t('editUser')}>
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => openReset(u)} className="icon-btn" title={t('resetPassword')}>
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.id !== me?.id && u.status === 'active' && (
                          <button onClick={() => handleSuspend(u)}
                            className="icon-btn text-red-400 hover:text-red-300"
                            title={t('suspendUser')}>
                            <Slash className="w-4 h-4" />
                          </button>
                        )}
                        {u.id !== me?.id && u.status === 'disabled' && (
                          <button onClick={() => handleActivate(u)}
                            className="icon-btn text-emerald-400 hover:text-emerald-300"
                            title={t('activateUser')}>
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                        {u.id !== me?.id && (
                          <button onClick={() => handleDelete(u)}
                            className="icon-btn text-red-500 hover:text-red-400"
                            title={t('deleteUser')}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalType === 'create' && (
        <Modal title={t('createUser')} onClose={closeModal}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel variant="admin" required>{t('userName')}</FormLabel>
                <input required value={form.name} onChange={setF('name')} className="input-field" id="new-user-name" />
              </div>
              <div>
                <FormLabel variant="admin" required>{t('userEmail')}</FormLabel>
                <input required type="email" value={form.email} onChange={setF('email')} className="input-field" id="new-user-email" />
              </div>
            </div>
            <div>
              <FormLabel variant="admin" required>{t('passwordLabel')}</FormLabel>
              <div className="relative">
                <input required type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={setF('password')} minLength={6} className="input-field pr-10" id="new-user-password" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel variant="admin" required>{t('userRole')}</FormLabel>
                <select required value={form.role_id} onChange={setF('role_id')} className="input-field" id="new-user-role">
                  <option value="">{t('selectRole')}</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
              </div>
              <div>
                <FormLabel variant="admin">{t('userStatus')}</FormLabel>
                <select value={form.status} onChange={setF('status')} className="input-field">
                  <option value="active">{t('active')}</option>
                  <option value="disabled">{t('suspended')}</option>
                </select>
              </div>
            </div>
            {shopBranchFields()}
            {formError && <p className="text-sm text-red-400 bg-red-500/10 p-2 rounded-lg">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('createUser')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalType === 'edit' && selectedUser && (
        <Modal title={t('editUser')} onClose={closeModal}>
          <form onSubmit={handleEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel variant="admin" required>{t('userName')}</FormLabel>
                <input required value={form.name} onChange={setF('name')} className="input-field" />
              </div>
              <div>
                <FormLabel variant="admin" required>{t('userEmail')}</FormLabel>
                <input required type="email" value={form.email} onChange={setF('email')} className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel variant="admin">{t('userRole')}</FormLabel>
                <select value={form.role_id} onChange={setF('role_id')} className="input-field">
                  <option value="">{t('selectRole')}</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
              </div>
              <div>
                <FormLabel variant="admin">{t('userStatus')}</FormLabel>
                <select value={form.status} onChange={setF('status')} className="input-field">
                  <option value="active">{t('active')}</option>
                  <option value="disabled">{t('suspended')}</option>
                </select>
              </div>
            </div>
            {shopBranchFields(true)}
            {formError && <p className="text-sm text-red-400 bg-red-500/10 p-2 rounded-lg">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalType === 'reset' && selectedUser && (
        <Modal title={`${t('resetPassword')}: ${selectedUser.name}`} onClose={closeModal}>
          <form onSubmit={handleReset} className="space-y-3">
            <div>
              <FormLabel variant="admin" required>{t('newPassword')}</FormLabel>
              <div className="relative">
                <input required type={showPw ? 'text' : 'password'}
                  value={resetPw} onChange={e => setResetPw(e.target.value)}
                  minLength={6} className="input-field pr-10" id="reset-password-input" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {formError && <p className="text-sm text-red-400 bg-red-500/10 p-2 rounded-lg">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('resetPassword')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
