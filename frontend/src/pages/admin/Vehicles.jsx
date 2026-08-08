import { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Edit, Trash2, Loader2, Search, Paperclip } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import DocumentsPanel from '../../components/documents/DocumentsPanel';
import api from '../../api/axios';

const VEHICLE_TYPES = ['Truck', 'Loader', 'Excavator', 'Dumper', 'Other'];
const ALLOWED_STATUS = ['active', 'maintenance', 'inactive'];
const EMPTY = {
  vehicle_number: '', vehicle_type: 'Truck', owner_name: '', assigned_branch_id: '',
  registration_expiry: '', insurance_expiry: '', status: 'active', remarks: '',
};

export default function Vehicles() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [vehicles, setVehicles] = useState([]);
  const [mines, setMines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [docsVehicle, setDocsVehicle] = useState(null);

  const statusLabel = (s) => t(`vehicleStatus_${s}`) || s;

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [{ data }, { data: branchData }] = await Promise.all([
        api.get('/vehicles', { params: { ...shopParams(), all: 1 } }),
        api.get('/branches', { params: { ...shopParams(), all: 1 } }),
      ]);
      setVehicles(data.vehicles || []);
      setMines(branchData.branches || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, assigned_branch_id: form.assigned_branch_id || null, ...shopParams() };
      if (modal === 'create') {
        await api.post('/vehicles', payload);
        success(t('vehicleCreated') || 'Vehicle added');
      } else {
        await api.put(`/vehicles/${selected.id}`, payload);
        success(t('vehicleUpdated') || 'Vehicle updated');
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteVehicle') || 'Deactivate this vehicle?', confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/vehicles/${v.id}`, { params: shopParams() });
      success(t('vehicleDeleted') || 'Vehicle deactivated');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = vehicles.filter(v => !search.trim() || [
    v.vehicle_number, v.vehicle_type, v.owner_name, v.AssignedMine?.name,
  ].some(val => (val || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Truck}
        accent="cyan"
        title={t('vehicles') || 'Vehicles'}
        subtitle={t('vehiclesSub') || 'Trucks, loaders and other mining vehicles — registration, insurance and documents'}
        action={
          <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />{t('addVehicle') || 'Add Vehicle'}
          </button>
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchVehicles') || 'Search vehicle number, type, owner…'}
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
                <th className="text-start p-4 font-medium">{t('vehicleNumber') || 'Vehicle Number'}</th>
                <th className="text-start p-4 font-medium">{t('vehicleType') || 'Type'}</th>
                <th className="text-start p-4 font-medium">{t('owner') || 'Owner'}</th>
                <th className="text-start p-4 font-medium">{t('assignedMine') || 'Assigned Mine'}</th>
                <th className="text-start p-4 font-medium">{t('registrationExpiry') || 'Registration Expiry'}</th>
                <th className="text-start p-4 font-medium">{t('insuranceExpiry') || 'Insurance Expiry'}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{v.vehicle_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{v.vehicle_type || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{v.owner_name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{v.AssignedMine?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{v.registration_expiry || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{v.insurance_expiry || '—'}</td>
                  <td className="p-4"><span className="badge">{statusLabel(v.status)}</span></td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="icon-btn" title={t('documents') || 'Documents'} onClick={() => setDocsVehicle(v)}>
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(v);
                          setForm({
                            vehicle_number: v.vehicle_number, vehicle_type: v.vehicle_type || 'Truck',
                            owner_name: v.owner_name || '', assigned_branch_id: v.assigned_branch_id || '',
                            registration_expiry: v.registration_expiry || '', insurance_expiry: v.insurance_expiry || '',
                            status: v.status || 'active', remarks: v.remarks || '',
                          });
                          setModal('edit');
                        }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(v)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noVehicles') || 'No vehicles found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? (t('addVehicle') || 'Add Vehicle') : (t('editVehicle') || 'Edit Vehicle')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('vehicleNumber') || 'Vehicle Number'}</FormLabel>
                <input className="input" required value={form.vehicle_number} onChange={setF('vehicle_number')} />
              </div>
              <div>
                <FormLabel>{t('vehicleType') || 'Type'}</FormLabel>
                <select className="input" value={form.vehicle_type} onChange={setF('vehicle_type')}>
                  {VEHICLE_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('owner') || 'Owner'}</FormLabel>
                <input className="input" value={form.owner_name} onChange={setF('owner_name')} />
              </div>
              <div>
                <FormLabel>{t('assignedMine') || 'Assigned Mine'}</FormLabel>
                <select className="input" value={form.assigned_branch_id} onChange={setF('assigned_branch_id')}>
                  <option value="">{t('none') || '--'}</option>
                  {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('registrationExpiry') || 'Registration Expiry'}</FormLabel>
                <input type="date" className="input" value={form.registration_expiry} onChange={setF('registration_expiry')} />
              </div>
              <div>
                <FormLabel>{t('insuranceExpiry') || 'Insurance Expiry'}</FormLabel>
                <input type="date" className="input" value={form.insurance_expiry} onChange={setF('insurance_expiry')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('status')}</FormLabel>
              <select className="input" value={form.status} onChange={setF('status')}>
                {ALLOWED_STATUS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
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

      {docsVehicle && (
        <Modal title={`${t('documents') || 'Documents'} — ${docsVehicle.vehicle_number}`} onClose={() => setDocsVehicle(null)}>
          <DocumentsPanel ownerType="vehicle" ownerId={docsVehicle.id} />
        </Modal>
      )}
    </div>
  );
}
