import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY_LOG = {
  log_date: new Date().toISOString().slice(0, 10), branch_id: '',
  working_hours: '', maintenance_hours: '', fuel_consumed: '', fuel_cost: '',
  mineral_id: '', production_quantity: '', notes: '',
};

export default function HeavyMachineryLogPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, shopReady, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [machine, setMachine] = useState(null);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState([]);
  const [minerals, setMinerals] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_LOG);
  const [saving, setSaving] = useState(false);
  // null while adding a brand-new day; the existing log row while explicitly
  // editing one via the pencil icon — only the "add" path needs to check for
  // a same-date collision, since editing is already an intentional overwrite.
  const [editingLog, setEditingLog] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [logsRes, summaryRes, mineralsRes] = await Promise.all([
        api.get(`/heavy-machinery/${id}/logs`, { params: shopParams() }),
        api.get(`/heavy-machinery/${id}/logs/summary`, { params: { ...shopParams(), year } }),
        api.get('/minerals', { params: shopParams() }),
      ]);
      setMachine(logsRes.data.machine);
      setLogs(logsRes.data.logs || []);
      setSummary(summaryRes.data.summary || []);
      setMinerals(mineralsRes.data.minerals || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [id, shopParams, shopReady, year, error, t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openNewLog = () => {
    setEditingLog(null);
    setForm({ ...EMPTY_LOG, branch_id: machine?.assigned_branch_id || '' });
    setModal(true);
  };

  const openEditLog = (log) => {
    setEditingLog(log);
    setForm({
      log_date: log.log_date, branch_id: String(log.branch_id),
      working_hours: String(log.working_hours || ''), maintenance_hours: String(log.maintenance_hours || ''),
      fuel_consumed: String(log.fuel_consumed || ''), fuel_cost: String(log.fuel_cost || ''),
      mineral_id: log.mineral_id ? String(log.mineral_id) : '', production_quantity: String(log.production_quantity || ''),
      notes: log.notes || '',
    });
    setModal(true);
  };

  const postLog = async (payload) => {
    await api.post(`/heavy-machinery/${id}/logs`, { ...payload, ...shopParams() });
    success(t('logSaved') || 'Daily log saved');
    setModal(false);
    fetchAll();
  };

  const saveLog = async (e) => {
    e.preventDefault();

    const basePayload = { ...form, branch_id: form.branch_id || null, mineral_id: form.mineral_id || null };

    // Only the "Add Day" flow (editingLog === null) can collide with an
    // existing row — the upsert is keyed on (machine, date), so saving a date
    // that's already logged would otherwise silently overwrite it.
    const existing = !editingLog && logs.find(l => l.log_date === form.log_date);
    if (existing) {
      const addToExisting = await confirm({
        title: t('logDateCollisionTitle') || 'A log already exists for this date',
        message: `${existing.log_date} already has an entry (${formatQty(existing.working_hours)}h worked, ${formatQty(existing.fuel_consumed)}L fuel, ${formatPKR(existing.fuel_cost)}). ${t('logDateCollisionMessage') || 'Add these new numbers on top of it, or replace it entirely?'}`,
        confirmLabel: t('addToExisting') || 'Add to Existing',
        cancelLabel: t('replaceEntirely') || 'Replace Entirely',
        variant: 'primary',
      });

      if (addToExisting) {
        const sameMineral = !basePayload.mineral_id || !existing.mineral_id || String(basePayload.mineral_id) === String(existing.mineral_id);
        setSaving(true);
        try {
          await postLog({
            ...basePayload,
            working_hours: (parseFloat(existing.working_hours) || 0) + (parseFloat(form.working_hours) || 0),
            maintenance_hours: (parseFloat(existing.maintenance_hours) || 0) + (parseFloat(form.maintenance_hours) || 0),
            fuel_consumed: (parseFloat(existing.fuel_consumed) || 0) + (parseFloat(form.fuel_consumed) || 0),
            fuel_cost: (parseFloat(existing.fuel_cost) || 0) + (parseFloat(form.fuel_cost) || 0),
            mineral_id: basePayload.mineral_id || existing.mineral_id || null,
            production_quantity: sameMineral
              ? (parseFloat(existing.production_quantity) || 0) + (parseFloat(form.production_quantity) || 0)
              : (parseFloat(form.production_quantity) || 0),
            notes: form.notes || existing.notes || null,
          });
        } catch (err) {
          error(err.response?.data?.message || t('toastErrorGeneric'));
        } finally {
          setSaving(false);
        }
        return;
      }
      // else: fall through and replace the existing entry with the form as-is
    }

    setSaving(true);
    try {
      await postLog(basePayload);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (log) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteLog') || 'Delete this day\'s log entry?', confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/heavy-machinery/${id}/logs/${log.id}`, { params: shopParams() });
      success(t('logDeleted') || 'Log entry deleted');
      fetchAll();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const totals = summary.reduce((acc, row) => ({
    working_hours: acc.working_hours + parseFloat(row.working_hours || 0),
    maintenance_hours: acc.maintenance_hours + parseFloat(row.maintenance_hours || 0),
    fuel_consumed: acc.fuel_consumed + parseFloat(row.fuel_consumed || 0),
    fuel_cost: acc.fuel_cost + parseFloat(row.fuel_cost || 0),
    production_quantity: acc.production_quantity + parseFloat(row.production_quantity || 0),
  }), { working_hours: 0, maintenance_hours: 0, fuel_consumed: 0, fuel_cost: 0, production_quantity: 0 });

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={CalendarClock}
        accent="amber"
        title={machine ? `${t('dailyLog') || 'Daily Log'} — ${machine.name}` : (t('dailyLog') || 'Daily Log')}
        subtitle={machine ? `${machine.machine_code} · ${machine.machine_type || ''}` : ''}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${machine?.name || ''} — ${t('dailyLog') || 'Daily Log'}`}
              signature
              columns={[
                { header: t('date') || 'Date', key: 'log_date', width: 1 },
                { header: t('mine') || 'Mine', render: l => l.Branch?.name || '', width: 1 },
                { header: t('workingHours') || 'Working Hrs', render: l => formatQty(l.working_hours), width: 0.8 },
                { header: t('maintenanceHours') || 'Maint. Hrs', render: l => formatQty(l.maintenance_hours), width: 0.8 },
                { header: t('fuelConsumed') || 'Fuel (L)', render: l => formatQty(l.fuel_consumed), width: 0.8 },
                { header: t('fuelCost') || 'Fuel Cost', render: l => formatPKR(l.fuel_cost), width: 1, money: true },
                { header: t('productionLabel') || 'Production', render: l => l.production_quantity ? `${formatQty(l.production_quantity)} ${l.production_unit} ${l.Mineral?.name || ''}` : '—', width: 1.4 },
              ]}
              rows={logs}
              filename="heavy-machinery-log.pdf"
            />
            <button type="button" onClick={openNewLog} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addDay') || 'Add Day'}
            </button>
            <button type="button" onClick={() => navigate('/heavy-machinery')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="max-w-[140px]">
          <FormLabel>{t('year') || 'Year'}</FormLabel>
          <input className="input" type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('monthlySummary') || 'Monthly Summary'} ({year})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-2">{t('month') || 'Month'}</th>
                <th className="text-start p-2">{t('workingHours') || 'Working Hrs'}</th>
                <th className="text-start p-2">{t('maintenanceHours') || 'Maint. Hrs'}</th>
                <th className="text-start p-2">{t('fuelConsumed') || 'Fuel (L)'}</th>
                <th className="text-start p-2">{t('fuelCost') || 'Fuel Cost'}</th>
                <th className="text-start p-2">{t('productionLabel') || 'Production'}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(row => (
                <tr key={row.month} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="p-2 font-medium">{row.month}</td>
                  <td className="p-2">{formatQty(row.working_hours)}</td>
                  <td className="p-2">{formatQty(row.maintenance_hours)}</td>
                  <td className="p-2">{formatQty(row.fuel_consumed)}</td>
                  <td className="p-2">{formatPKR(row.fuel_cost)}</td>
                  <td className="p-2">{formatQty(row.production_quantity)}</td>
                </tr>
              ))}
              {summary.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>{t('noLogsThisYear') || 'No logs for this year'}</td></tr>
              )}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-subtle)', fontWeight: 700 }}>
                  <td className="p-2">{t('total') || 'Total'}</td>
                  <td className="p-2">{formatQty(totals.working_hours)}</td>
                  <td className="p-2">{formatQty(totals.maintenance_hours)}</td>
                  <td className="p-2">{formatQty(totals.fuel_consumed)}</td>
                  <td className="p-2">{formatPKR(totals.fuel_cost)}</td>
                  <td className="p-2">{formatQty(totals.production_quantity)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="glass-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th className="text-start p-4 font-medium">{t('date') || 'Date'}</th>
              <th className="text-start p-4 font-medium">{t('mine') || 'Mine'}</th>
              <th className="text-start p-4 font-medium">{t('workingHours') || 'Working Hrs'}</th>
              <th className="text-start p-4 font-medium">{t('maintenanceHours') || 'Maint. Hrs'}</th>
              <th className="text-start p-4 font-medium">{t('fuelConsumed') || 'Fuel (L)'}</th>
              <th className="text-start p-4 font-medium">{t('fuelCost') || 'Fuel Cost'}</th>
              <th className="text-start p-4 font-medium">{t('productionLabel') || 'Production'}</th>
              <th className="text-end p-4 font-medium">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{l.log_date}</td>
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{l.Branch?.name || '—'}</td>
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatQty(l.working_hours)}</td>
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatQty(l.maintenance_hours)}</td>
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatQty(l.fuel_consumed)}</td>
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatPKR(l.fuel_cost)}</td>
                <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{l.production_quantity ? `${formatQty(l.production_quantity)} ${l.production_unit} ${l.Mineral?.name || ''}` : '—'}</td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="icon-btn" onClick={() => openEditLog(l)}><Edit className="w-4 h-4" /></button>
                    <button type="button" className="icon-btn text-red-400" onClick={() => removeLog(l)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noLogsYet') || 'No daily logs yet'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editingLog ? (t('editDay') || 'Edit Day') : (t('addDay') || 'Add Day')} onClose={() => setModal(false)}>
          <form onSubmit={saveLog} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('date') || 'Date'}</FormLabel>
                <input type="date" className="input" required value={form.log_date} onChange={setF('log_date')} />
              </div>
              <div>
                <FormLabel>{t('mine') || 'Mine'}</FormLabel>
                <select className="input" value={form.branch_id} onChange={setF('branch_id')}>
                  <option value="">{t('selectMine') || 'Select mine…'}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('workingHours') || 'Working Hours'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={form.working_hours} onChange={setF('working_hours')} />
              </div>
              <div>
                <FormLabel>{t('maintenanceHours') || 'Maintenance Hours'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={form.maintenance_hours} onChange={setF('maintenance_hours')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('fuelConsumed') || 'Fuel Consumed (L)'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={form.fuel_consumed} onChange={setF('fuel_consumed')} />
              </div>
              <div>
                <FormLabel>{t('fuelCostTotal') || 'Fuel Cost (Total)'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={form.fuel_cost} onChange={setF('fuel_cost')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('mineral') || 'Mineral'}</FormLabel>
                <select className="input" value={form.mineral_id} onChange={setF('mineral_id')}>
                  <option value="">{t('none') || '--'}</option>
                  {minerals.map(mn => <option key={mn.id} value={mn.id}>{mn.name} ({mn.unit})</option>)}
                </select>
              </div>
              <div>
                <FormLabel>{t('productionQty') || 'Production Quantity'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={form.production_quantity} onChange={setF('production_quantity')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('note') || 'Note'}</FormLabel>
              <textarea className="input" rows={2} value={form.notes} onChange={setF('notes')} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
