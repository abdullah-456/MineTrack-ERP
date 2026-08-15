import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Forklift, Plus, Edit, CalendarClock, Loader2, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const MACHINE_TYPES = ['Excavator', 'Dumper', 'Dozer', 'Loader', 'Drill Rig', 'Truck', 'Crane', 'Other'];
const ALLOWED_STATUS = ['active', 'maintenance', 'inactive'];
const EMPTY = {
  name: '', machine_type: 'Excavator', model: '', manufacturer: '', capacity: '', fuel_type: 'Diesel',
  assigned_branch_id: '', status: 'active', acquisition_date: '', remarks: '',
};

export default function HeavyMachineryList() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopReady, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [machinery, setMachinery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const statusLabel = (s) => t(`machineryStatus_${s}`) || s;

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const { data } = await api.get('/heavy-machinery', { params: { ...shopParams(), all: 1 } });
      setMachinery(data.machinery || []);
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
        await api.post('/heavy-machinery', payload);
        success(t('machineCreated') || 'Machine added');
      } else {
        await api.put(`/heavy-machinery/${selected.id}`, payload);
        success(t('machineUpdated') || 'Machine updated');
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = machinery.filter(m => !search.trim() || [
    m.name, m.machine_code, m.machine_type, m.model, m.AssignedMine?.name,
  ].some(val => (val || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Forklift}
        accent="amber"
        title={t('heavyMachinery') || 'Heavy Machinery'}
        subtitle={t('heavyMachinerySub') || 'Excavators, dumpers and other mining equipment — assigned to mines, with daily fuel, hours and production logs'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${t('heavyMachinery') || 'Heavy Machinery'} Report`}
              signature
              columns={[
                { header: t('machineCode') || 'Code', key: 'machine_code', width: 1 },
                { header: t('machineName') || 'Name', key: 'name', width: 1.4 },
                { header: t('machineType') || 'Type', key: 'machine_type', width: 1 },
                { header: t('model') || 'Model', key: 'model', width: 1 },
                { header: t('assignedMine') || 'Assigned Mine', render: m => m.AssignedMine?.name || '', width: 1.2 },
                { header: t('status') || 'Status', render: m => statusLabel(m.status), width: 1 },
              ]}
              rows={filtered}
              filename="heavy-machinery.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('newMachine') || 'New Machine'}
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
            placeholder={t('searchMachinery') || 'Search machine name, code, type…'}
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
                <th className="text-start p-4 font-medium">{t('machineCode') || 'Code'}</th>
                <th className="text-start p-4 font-medium">{t('machineName') || 'Name'}</th>
                <th className="text-start p-4 font-medium">{t('machineType') || 'Type'}</th>
                <th className="text-start p-4 font-medium">{t('model') || 'Model'}</th>
                <th className="text-start p-4 font-medium">{t('assignedMine') || 'Assigned Mine'}</th>
                <th className="text-start p-4 font-medium">{t('status')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{m.machine_code}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.machine_type || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.model || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.AssignedMine?.name || '—'}</td>
                  <td className="p-4"><span className="badge">{statusLabel(m.status)}</span></td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="icon-btn" title={t('dailyLog') || 'Daily Log'} onClick={() => navigate(`/heavy-machinery/${m.id}/logs`)}>
                        <CalendarClock className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setForm({
                            name: m.name, machine_type: m.machine_type || 'Excavator', model: m.model || '',
                            manufacturer: m.manufacturer || '', capacity: m.capacity || '', fuel_type: m.fuel_type || 'Diesel',
                            assigned_branch_id: m.assigned_branch_id || '', status: m.status || 'active',
                            acquisition_date: m.acquisition_date || '', remarks: m.remarks || '',
                          });
                          setModal('edit');
                        }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noMachinery') || 'No machinery found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? (t('newMachine') || 'New Machine') : (t('editMachine') || 'Edit Machine')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('machineName') || 'Name'}</FormLabel>
                <input className="input" required value={form.name} onChange={setF('name')} placeholder="e.g. Excavator #3" />
              </div>
              <div>
                <FormLabel>{t('machineType') || 'Type'}</FormLabel>
                <select className="input" value={form.machine_type} onChange={setF('machine_type')}>
                  {MACHINE_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('model') || 'Model'}</FormLabel>
                <input className="input" value={form.model} onChange={setF('model')} />
              </div>
              <div>
                <FormLabel>{t('manufacturer') || 'Manufacturer'}</FormLabel>
                <input className="input" value={form.manufacturer} onChange={setF('manufacturer')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('capacity') || 'Capacity'}</FormLabel>
                <input className="input" value={form.capacity} onChange={setF('capacity')} placeholder="e.g. 20 ton" />
              </div>
              <div>
                <FormLabel>{t('fuelType') || 'Fuel Type'}</FormLabel>
                <input className="input" value={form.fuel_type} onChange={setF('fuel_type')} placeholder="Diesel, Petrol…" />
              </div>
            </div>
            <div>
              <FormLabel>{t('assignedMine') || 'Assigned Mine'}</FormLabel>
              <select className="input" value={form.assigned_branch_id} onChange={setF('assigned_branch_id')}>
                <option value="">{t('none') || '--'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('acquisitionDate') || 'Acquisition Date'}</FormLabel>
                <input type="date" className="input" value={form.acquisition_date} onChange={setF('acquisition_date')} />
              </div>
              <div>
                <FormLabel>{t('status')}</FormLabel>
                <select className="input" value={form.status} onChange={setF('status')}>
                  {ALLOWED_STATUS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
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
    </div>
  );
}
