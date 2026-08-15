import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wrench, Plus, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

function FormSection({ title, children }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div className="px-5 py-5 space-y-3">{children}</div>
    </div>
  );
}

const EMPTY_VEHICLE = { vehicle_number: '', vehicle_type: 'Truck', owner_name: '' };
const EMPTY_STAGE_LINE = { workshop_item_id: '', quantity: '' };

export default function WorkshopJobFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, shopReady, branches, shopId } = useShopApi();
  const isRTL = lang === 'ur';

  const [form, setForm] = useState({
    branch_id: '', vehicle_id: '', employee_id: '', mechanic_name: '',
    date_in: new Date().toISOString().slice(0, 10), odometer_reading: '',
    work_description: '', labor_cost: '', notes: '',
  });
  const [job, setJob] = useState(null); // populated in edit mode
  const [stagedItems, setStagedItems] = useState([]); // create mode only
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workshopItems, setWorkshopItems] = useState([]);
  const [stockByItem, setStockByItem] = useState({}); // workshop_item_id -> qty available in selected mine
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLine, setNewLine] = useState(EMPTY_STAGE_LINE);
  const [vehicleModal, setVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const fetchStock = useCallback(async (branchId) => {
    if (!branchId) { setStockByItem({}); return; }
    try {
      const { data } = await api.get('/workshops/stock', { params: { ...shopParams(), branch_id: branchId } });
      const map = {};
      (data.stock || []).forEach(s => { map[s.workshop_item_id] = parseFloat(s.quantity_on_hand || 0); });
      setStockByItem(map);
    } catch {
      setStockByItem({});
    }
  }, [shopParams]);

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [vRes, eRes, iRes] = await Promise.all([
        api.get('/vehicles', { params: { ...shopParams(), all: 1 } }),
        api.get('/employees', { params: shopParams() }),
        api.get('/workshops/items', { params: shopParams() }),
      ]);
      setVehicles(vRes.data.vehicles || []);
      setEmployees((eRes.data.employees || []).filter(e => e.status === 'active'));
      setWorkshopItems(iRes.data.items || []);

      if (isEdit) {
        const { data } = await api.get(`/workshops/jobs/${id}`, { params: shopParams() });
        const j = data.job;
        setJob(j);
        setForm({
          branch_id: String(j.branch_id), vehicle_id: String(j.vehicle_id),
          employee_id: j.employee_id ? String(j.employee_id) : '', mechanic_name: j.mechanic_name || '',
          date_in: j.date_in, odometer_reading: j.odometer_reading ? String(j.odometer_reading) : '',
          work_description: j.work_description || '', labor_cost: String(j.labor_cost || ''), notes: j.notes || '',
        });
        fetchStock(j.branch_id);
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      if (isEdit) navigate('/workshops/jobs');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, shopReady, error, t, navigate, fetchStock]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isEdit && form.branch_id) fetchStock(form.branch_id);
  }, [isEdit, form.branch_id, fetchStock]);

  const itemLabel = (itemId) => {
    const it = workshopItems.find(x => String(x.id) === String(itemId));
    if (!it) return '';
    const avail = stockByItem[it.id] ?? 0;
    return `${it.name} (${it.unit}) — ${t('workshopAvailable') || 'Available'}: ${formatQty(avail)}`;
  };

  // ── Create mode: staged local lines, submitted with the job ────────────
  const addStagedLine = () => {
    if (!newLine.workshop_item_id || !(parseFloat(newLine.quantity) > 0)) return;
    setStagedItems(items => [...items, { ...newLine }]);
    setNewLine(EMPTY_STAGE_LINE);
  };
  const removeStagedLine = (idx) => setStagedItems(items => items.filter((_, i) => i !== idx));
  const stagedLineCost = (line) => {
    const it = workshopItems.find(x => String(x.id) === String(line.workshop_item_id));
    const avail = it ? (stockByItem[it.id] ?? 0) : 0;
    const cost = it ? parseFloat(it.unit_price ?? 0) : 0;
    return { name: it?.name || '', unit: it?.unit || '', avail, estCost: cost * (parseFloat(line.quantity) || 0) };
  };
  const stagedTotal = stagedItems.reduce((s, l) => s + stagedLineCost(l).estCost, 0);

  // ── Edit mode: items already committed, add/remove hits the API live ───
  const addLiveItem = async () => {
    if (!newLine.workshop_item_id || !(parseFloat(newLine.quantity) > 0)) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/workshops/jobs/${job.id}/items`, {
        workshop_item_id: parseInt(newLine.workshop_item_id, 10),
        quantity: parseFloat(newLine.quantity),
        ...shopParams(),
      });
      setJob(data.job);
      setNewLine(EMPTY_STAGE_LINE);
      fetchStock(job.branch_id);
      success(t('workshopPartAdded') || 'Part added to job');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const removeLiveItem = async (jobItemId) => {
    const ok = await confirm({ title: t('remove') || 'Remove', message: t('confirmRemoveWorkshopPart') || 'Return this part to stock and remove it from the job?', confirmLabel: t('remove') || 'Remove', cancelLabel: t('cancel') });
    if (!ok) return;
    setSaving(true);
    try {
      const { data } = await api.delete(`/workshops/jobs/${job.id}/items/${jobItemId}`, { params: shopParams() });
      setJob(data.job);
      fetchStock(job.branch_id);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const saveHeader = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        const { data } = await api.put(`/workshops/jobs/${job.id}`, {
          employee_id: form.employee_id || null, mechanic_name: form.mechanic_name || null,
          date_in: form.date_in, odometer_reading: form.odometer_reading || null,
          work_description: form.work_description || null, labor_cost: parseFloat(form.labor_cost) || 0,
          notes: form.notes || null, ...shopParams(),
        });
        setJob(data.job);
        success(t('workshopJobUpdated') || 'Job updated');
      } else {
        const payload = {
          branch_id: parseInt(form.branch_id, 10), vehicle_id: parseInt(form.vehicle_id, 10),
          employee_id: form.employee_id || null, mechanic_name: form.mechanic_name || null,
          date_in: form.date_in, odometer_reading: form.odometer_reading || null,
          work_description: form.work_description || null, labor_cost: parseFloat(form.labor_cost) || 0,
          notes: form.notes || null,
          items: stagedItems.map(l => ({ workshop_item_id: parseInt(l.workshop_item_id, 10), quantity: parseFloat(l.quantity) })),
          ...shopParams(),
        };
        const { data } = await api.post('/workshops/jobs', payload);
        success(t('workshopJobCreated') || 'Workshop job created');
        navigate(`/workshops/jobs/${data.job.id}`);
        return;
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const completeJob = async () => {
    const ok = await confirm({ title: t('completeJob') || 'Complete Job', message: t('confirmCompleteWorkshopJob') || 'Mark this job as completed? It can no longer be edited afterwards.', confirmLabel: t('complete') || 'Complete', cancelLabel: t('cancel') });
    if (!ok) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/workshops/jobs/${job.id}/complete`, { ...shopParams() });
      success(t('workshopJobCompleted') || 'Job completed');
      navigate(`/workshops/jobs/${data.job.id}`);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const cancelJob = async () => {
    const ok = await confirm({ title: t('cancelJob') || 'Cancel Job', message: t('confirmCancelWorkshopJob') || 'Cancel this job and return all consumed parts to stock?', confirmLabel: t('cancelJob') || 'Cancel Job', cancelLabel: t('back') || 'Back' });
    if (!ok) return;
    setSaving(true);
    try {
      await api.post(`/workshops/jobs/${job.id}/cancel`, { ...shopParams() });
      success(t('workshopJobCancelled') || 'Job cancelled');
      navigate('/workshops/jobs');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const createVehicle = async (e) => {
    e.preventDefault();
    setSavingVehicle(true);
    try {
      const { data } = await api.post('/vehicles', {
        ...vehicleForm, assigned_branch_id: form.branch_id || null, ...shopParams(),
      });
      setVehicles(v => [...v, data.vehicle]);
      setForm(f => ({ ...f, vehicle_id: String(data.vehicle.id) }));
      setVehicleModal(false);
      setVehicleForm(EMPTY_VEHICLE);
      success(t('vehicleCreated') || 'Vehicle added');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSavingVehicle(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }

  const locked = isEdit && job?.status !== 'in_progress';
  const laborCost = parseFloat(form.labor_cost) || 0;
  const partsCost = isEdit ? parseFloat(job?.parts_cost || 0) : stagedTotal;
  const totalCost = isEdit ? parseFloat(job?.total_cost || 0) : laborCost + stagedTotal;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Wrench}
        accent="amber"
        title={isEdit ? `${t('workshopJob') || 'Workshop Job'} — ${job?.job_number}` : (t('newWorkshopJob') || 'New Workshop Job')}
        subtitle={t('workshopJobFormSub') || 'Record a vehicle visiting the workshop — parts used and labor cost'}
        action={
          <div className="flex flex-wrap gap-2">
            {isEdit && job?.status === 'in_progress' && (
              <>
                <button type="button" onClick={cancelJob} disabled={saving} className="btn-secondary flex items-center gap-2 text-red-400">
                  <XCircle className="w-4 h-4" />{t('cancelJob') || 'Cancel Job'}
                </button>
                <button type="button" onClick={completeJob} disabled={saving} className="btn-primary flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />{t('completeJob') || 'Complete Job'}
                </button>
              </>
            )}
            <button type="button" onClick={() => navigate('/workshops/jobs')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
          </div>
        }
      />

      <form onSubmit={saveHeader} className="space-y-5">
        <FormSection title={t('workshopJobDetails') || 'Job Details'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isEdit && (
              <div>
                <FormLabel>{t('jobNumber') || 'Job Number'}</FormLabel>
                <input className="input font-mono" value={job?.job_number || ''} readOnly disabled />
              </div>
            )}
            <div>
              <FormLabel required>{t('mine') || 'Mine'}</FormLabel>
              <select className="input" required value={form.branch_id} onChange={setF('branch_id')} disabled={isEdit}>
                <option value="">{t('selectMine') || 'Select mine…'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel required>{t('vehicle') || 'Vehicle'}</FormLabel>
              <div className="flex gap-2">
                <select className="input" required value={form.vehicle_id} onChange={setF('vehicle_id')} disabled={isEdit}>
                  <option value="">{t('selectVehicle') || 'Select vehicle…'}</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number}{v.vehicle_type ? ` (${v.vehicle_type})` : ''}</option>)}
                </select>
                {!isEdit && (
                  <button type="button" className="btn-secondary px-3" onClick={() => setVehicleModal(true)} title={t('addVehicle') || 'Add Vehicle'}>
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <FormLabel required>{t('dateIn') || 'Date In'}</FormLabel>
              <input type="date" className="input" required value={form.date_in} onChange={setF('date_in')} disabled={locked} />
            </div>
            <div>
              <FormLabel>{t('odometerReading') || 'Odometer Reading'}</FormLabel>
              <input type="number" min="0" className="input" value={form.odometer_reading} onChange={setF('odometer_reading')} disabled={locked} />
            </div>
            <div>
              <FormLabel>{t('performedByEmployee') || 'Performed By (Employee)'}</FormLabel>
              <select className="input" value={form.employee_id} onChange={setF('employee_id')} disabled={locked}>
                <option value="">{t('none') || '--'}</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>{t('performedByOther') || 'Or Mechanic Name (if not an employee)'}</FormLabel>
              <input className="input" value={form.mechanic_name} onChange={setF('mechanic_name')} disabled={locked} />
            </div>
          </div>
          <div>
            <FormLabel>{t('workDescription') || 'Work Description'}</FormLabel>
            <textarea className="input min-h-[70px]" value={form.work_description} onChange={setF('work_description')} disabled={locked} />
          </div>
          <div>
            <FormLabel>{t('laborCost') || 'Labor Cost'}</FormLabel>
            <input type="number" min="0" step="any" className="input" value={form.labor_cost} onChange={setF('labor_cost')} disabled={locked} />
          </div>
        </FormSection>

        <FormSection title={t('partsUsed') || 'Parts Used'}>
          {!locked && (
            <div className="flex flex-wrap gap-2 items-end p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex-1 min-w-[220px]">
                <FormLabel>{t('workshopItem') || 'Item'}</FormLabel>
                <select className="input" value={newLine.workshop_item_id} onChange={e => setNewLine(l => ({ ...l, workshop_item_id: e.target.value }))} disabled={!form.branch_id}>
                  <option value="">{t('selectItem') || 'Select item…'}</option>
                  {workshopItems.map(it => <option key={it.id} value={it.id}>{itemLabel(it.id)}</option>)}
                </select>
              </div>
              <div className="w-28">
                <FormLabel>{t('quantity') || 'Qty'}</FormLabel>
                <input type="number" min="0" step="any" className="input" value={newLine.quantity} onChange={e => setNewLine(l => ({ ...l, quantity: e.target.value }))} />
              </div>
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={isEdit ? addLiveItem : addStagedLine} disabled={saving || !form.branch_id}>
                <Plus className="w-4 h-4" />{t('addPart') || 'Add Part'}
              </button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {isEdit ? (
              (job?.WorkshopJobItems || []).map(ji => (
                <div key={ji.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div>
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{ji.WorkshopItem?.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatQty(ji.quantity)} {ji.WorkshopItem?.unit} × {formatPKR(ji.unit_cost)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatPKR(ji.line_total)}</span>
                    {!locked && (
                      <button type="button" onClick={() => removeLiveItem(ji.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              stagedItems.map((line, idx) => {
                const info = stagedLineCost(line);
                return (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{info.name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatQty(line.quantity)} {info.unit} · {t('workshopAvailable') || 'Available'}: {formatQty(info.avail)}
                        {parseFloat(line.quantity) > info.avail && (
                          <span className="text-red-400"> — {t('workshopExceedsStock') || 'exceeds available stock'}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatPKR(info.estCost)}</span>
                      <button type="button" onClick={() => removeStagedLine(idx)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })
            )}
            {((isEdit ? (job?.WorkshopJobItems || []).length : stagedItems.length) === 0) && (
              <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>{t('noPartsAddedYet') || 'No parts added yet'}</div>
            )}
          </div>

          <div className="pt-3 space-y-1 text-end" style={{ color: 'var(--text-secondary)' }}>
            <div>{t('laborCost') || 'Labor Cost'}: {formatPKR(laborCost)}</div>
            <div>{t('partsCost') || 'Parts Cost'}: {formatPKR(partsCost)}</div>
            <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('totalCost') || 'Total Cost'}: {formatPKR(totalCost)}</div>
          </div>
        </FormSection>

        <FormSection title={t('notes') || 'Notes'}>
          <textarea className="input min-h-[60px]" value={form.notes} onChange={setF('notes')} disabled={locked} />
        </FormSection>

        {!locked && (
          <div className="flex flex-wrap gap-3 justify-end">
            <button type="button" onClick={() => navigate('/workshops/jobs')} className="btn-secondary">{t('cancel') || 'Cancel'}</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (t('saving') || 'Saving…') : (isEdit ? (t('save') || 'Save') : (t('createWorkshopJob') || 'Create Job'))}
            </button>
          </div>
        )}
      </form>

      {vehicleModal && (
        <Modal title={t('addVehicle') || 'Add Vehicle'} onClose={() => setVehicleModal(false)}>
          <form onSubmit={createVehicle} className="space-y-3">
            <div>
              <FormLabel required>{t('vehicleNumber') || 'Vehicle Number'}</FormLabel>
              <input className="input" required value={vehicleForm.vehicle_number} onChange={e => setVehicleForm(f => ({ ...f, vehicle_number: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('vehicleType') || 'Type'}</FormLabel>
              <input className="input" value={vehicleForm.vehicle_type} onChange={e => setVehicleForm(f => ({ ...f, vehicle_type: e.target.value }))} />
            </div>
            <div>
              <FormLabel>{t('owner') || 'Owner'}</FormLabel>
              <input className="input" value={vehicleForm.owner_name} onChange={e => setVehicleForm(f => ({ ...f, owner_name: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setVehicleModal(false)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={savingVehicle} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
