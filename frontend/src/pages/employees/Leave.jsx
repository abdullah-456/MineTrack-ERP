import { useState, useEffect, useCallback } from 'react';
import { CalendarOff, Plus, Trash2, Loader2, Search, Settings } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY_RECORD = { employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' };
const EMPTY_TYPE = { name: '', is_paid: true, default_annual_days: '' };

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00.000`);
  const b = new Date(`${end}T00:00:00.000`);
  return Math.round((b - a) / 86400000) + 1;
}

export default function Leave() {
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [records, setRecords] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'types'
  const [form, setForm] = useState(EMPTY_RECORD);
  const [saving, setSaving] = useState(false);

  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [editingTypeId, setEditingTypeId] = useState(null);

  const [balanceEmployeeId, setBalanceEmployeeId] = useState('');
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear());
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, tRes, eRes] = await Promise.all([
        api.get('/leave/records', { params: shopParams() }),
        api.get('/leave/types', { params: shopParams() }),
        api.get('/employees', { params: shopParams() }),
      ]);
      setRecords(rRes.data.leave_records || []);
      setLeaveTypes(tRes.data.leave_types || []);
      setEmployees((eRes.data.employees || []).filter(emp => emp.status === 'active'));
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchBalance = useCallback(async (employeeId, year) => {
    if (!employeeId) { setBalance(null); return; }
    setBalanceLoading(true);
    try {
      const { data } = await api.get('/leave/balance', { params: { ...shopParams(), employee_id: employeeId, year } });
      setBalance(data.balance || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [shopParams, error, t]);

  useEffect(() => { fetchBalance(balanceEmployeeId, balanceYear); }, [balanceEmployeeId, balanceYear, fetchBalance]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/leave/records', { ...form, ...shopParams() });
      success(t('leaveRecordCreated') || 'Leave recorded');
      setModal(null);
      setForm(EMPTY_RECORD);
      fetchData();
      if (String(form.employee_id) === String(balanceEmployeeId)) fetchBalance(balanceEmployeeId, balanceYear);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (r) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteLeaveRecord'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/leave/records/${r.id}`, { params: shopParams() });
      success(t('leaveRecordDeleted') || 'Leave record deleted');
      fetchData();
      if (String(r.employee_id) === String(balanceEmployeeId)) fetchBalance(balanceEmployeeId, balanceYear);
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleSaveType = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...typeForm, ...shopParams() };
      if (editingTypeId) {
        await api.put(`/leave/types/${editingTypeId}`, payload);
      } else {
        await api.post('/leave/types', payload);
      }
      success(t('leaveTypeSaved') || 'Leave type saved');
      setTypeForm(EMPTY_TYPE);
      setEditingTypeId(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async (lt) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteLeaveType'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      await api.delete(`/leave/types/${lt.id}`, { params: shopParams() });
      success(t('leaveTypeDeleted') || 'Leave type deleted');
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const filtered = records.filter(r => !search.trim() || [
    r.Employee?.name, r.LeaveType?.name, r.reason,
  ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={CalendarOff}
        accent="rose"
        title={t('leave') || 'Leave'}
        subtitle={t('leaveSub') || 'Record employee leave — immediately reflected on attendance'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModal('types')} className="btn-secondary flex items-center gap-2">
              <Settings className="w-4 h-4" />{t('leaveTypes') || 'Leave Types'}
            </button>
            <button type="button" onClick={() => { setForm(EMPTY_RECORD); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addLeave') || 'Add Leave'}
            </button>
          </div>
        }
      />

      <div className="card space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('leaveBalance') || 'Leave Balance'}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input max-w-xs" value={balanceEmployeeId} onChange={e => setBalanceEmployeeId(e.target.value)}>
            <option value="">{t('selectEmployee') || '-- Select Employee --'}</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <input className="input max-w-[120px]" type="number" value={balanceYear} onChange={e => setBalanceYear(e.target.value)} />
        </div>
        {balanceLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
        ) : balance && balance.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th className="text-start p-2">{t('leaveType') || 'Leave Type'}</th>
                  <th className="text-end p-2">{t('entitlement') || 'Entitlement'}</th>
                  <th className="text-end p-2">{t('taken') || 'Taken'}</th>
                  <th className="text-end p-2">{t('remaining') || 'Remaining'}</th>
                </tr>
              </thead>
              <tbody>
                {balance.map(b => (
                  <tr key={b.leave_type_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="p-2" style={{ color: 'var(--text-primary)' }}>{b.leave_type_name}</td>
                    <td className="p-2 text-end" style={{ color: 'var(--text-secondary)' }}>{b.entitlement ?? '—'}</td>
                    <td className="p-2 text-end" style={{ color: 'var(--text-secondary)' }}>{b.taken}</td>
                    <td className="p-2 text-end font-semibold" style={{ color: b.remaining != null && b.remaining < 0 ? 'rgb(239,68,68)' : 'var(--text-primary)' }}>
                      {b.remaining ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            {balanceEmployeeId ? (t('noLeaveTypes') || 'No leave types defined yet') : (t('selectEmployeeForBalance') || 'Select an employee to see their leave balance')}
          </p>
        )}
      </div>

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('searchLeave') || 'Search employee, leave type, reason…'}
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
                <th className="text-start p-4 font-medium">{t('employees') || 'Employee'}</th>
                <th className="text-start p-4 font-medium">{t('leaveType') || 'Leave Type'}</th>
                <th className="text-start p-4 font-medium">{t('leaveStartDate') || 'Start'}</th>
                <th className="text-start p-4 font-medium">{t('leaveEndDate') || 'End'}</th>
                <th className="text-start p-4 font-medium">{t('leaveDaysCount') || 'Days'}</th>
                <th className="text-start p-4 font-medium">{t('remarks')}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{r.Employee?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.LeaveType?.name || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.start_date}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{r.end_date}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{daysBetween(r.start_date, r.end_date)}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{r.reason || '—'}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => handleDeleteRecord(r)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noLeaveRecords') || 'No leave records found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'create' && (
        <Modal title={t('addLeave') || 'Add Leave'} onClose={() => setModal(null)}>
          <form onSubmit={handleSaveRecord} className="space-y-3">
            <div>
              <FormLabel required>{t('employees') || 'Employee'}</FormLabel>
              <select className="input" required value={form.employee_id} onChange={setF('employee_id')}>
                <option value="">{t('selectEmployee') || '-- Select Employee --'}</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel required>{t('leaveType') || 'Leave Type'}</FormLabel>
              <select className="input" required value={form.leave_type_id} onChange={setF('leave_type_id')}>
                <option value="">{t('selectLeaveType') || '-- Select Leave Type --'}</option>
                {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('leaveStartDate') || 'Start Date'}</FormLabel>
                <input className="input" type="date" required value={form.start_date} onChange={setF('start_date')} />
              </div>
              <div>
                <FormLabel required>{t('leaveEndDate') || 'End Date'}</FormLabel>
                <input className="input" type="date" required min={form.start_date || undefined} value={form.end_date} onChange={setF('end_date')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('remarks')}</FormLabel>
              <textarea className="input min-h-[70px]" value={form.reason} onChange={setF('reason')} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'types' && (
        <Modal title={t('leaveTypes') || 'Leave Types'} onClose={() => { setModal(null); setTypeForm(EMPTY_TYPE); setEditingTypeId(null); }}>
          <div className="space-y-4">
            <form onSubmit={handleSaveType} className="space-y-3">
              <div>
                <FormLabel required>{t('leaveTypeName') || 'Name'}</FormLabel>
                <input className="input" required value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FormLabel>{t('defaultAnnualDays') || 'Default Annual Days'}</FormLabel>
                  <input className="input" type="number" min="0" value={typeForm.default_annual_days} onChange={e => setTypeForm(f => ({ ...f, default_annual_days: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-sm self-end pb-2" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={typeForm.is_paid} onChange={e => setTypeForm(f => ({ ...f, is_paid: e.target.checked }))} />
                  {t('isPaidLeave') || 'Paid leave'}
                </label>
              </div>
              <div className="flex gap-3">
                {editingTypeId && (
                  <button type="button" onClick={() => { setTypeForm(EMPTY_TYPE); setEditingTypeId(null); }} className="btn-secondary">{t('cancel')}</button>
                )}
                <button type="submit" disabled={saving} className="btn-primary flex-1">{editingTypeId ? t('save') : (t('addParameter') || 'Add')}</button>
              </div>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {leaveTypes.map(lt => (
                <div key={lt.id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{lt.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {lt.default_annual_days != null ? `${lt.default_annual_days} ${t('days') || 'days'}/yr` : ''} {lt.is_paid ? '' : `· ${t('unpaid') || 'unpaid'}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="icon-btn" onClick={() => { setEditingTypeId(lt.id); setTypeForm({ name: lt.name, is_paid: lt.is_paid, default_annual_days: lt.default_annual_days ?? '' }); }}>
                      {t('edit')}
                    </button>
                    <button type="button" className="icon-btn text-red-400" onClick={() => handleDeleteType(lt)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {leaveTypes.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>{t('noLeaveTypes') || 'No leave types defined yet'}</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
