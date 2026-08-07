import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarCheck, Loader2, Save } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import AttendanceReportsView from '../../components/attendance/AttendanceReportsView';
import { STATUS_META, STATUS_ORDER, nextStatus } from '../../utils/attendanceStatus';
import { SHIFTS } from '../../utils/shiftOptions';
import api from '../../api/axios';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = () => new Date().toISOString().slice(0, 7);

export default function Attendance() {
  const { t, lang } = useTheme();
  const { error, success } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [tab, setTab] = useState('today'); // 'today' | 'month' | 'reports'
  const [branchId, setBranchId] = useState('');
  const showBranchFilter = branches.length > 1;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={CalendarCheck}
        accent="emerald"
        title={t('attendance') || 'Attendance'}
        subtitle={t('attendanceSub') || 'Mark daily attendance and review the month at a glance'}
      />

      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('today')}
            className={tab === 'today' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            {t('today') || 'Today'}
          </button>
          <button
            type="button"
            onClick={() => setTab('month')}
            className={tab === 'month' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            {t('monthView') || 'Month View'}
          </button>
          <button
            type="button"
            onClick={() => setTab('reports')}
            className={tab === 'reports' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            {t('attendanceReports') || 'Reports'}
          </button>
        </div>
        {showBranchFilter && (
          <select className="input max-w-xs" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">{t('allBranches') || 'All branches'}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {tab === 'today' && (
        <TodayView shopParams={shopParams} branchId={branchId} branches={branches} t={t} error={error} success={success} />
      )}
      {tab === 'month' && (
        <MonthView shopParams={shopParams} branchId={branchId} t={t} error={error} success={success} />
      )}
      {tab === 'reports' && (
        <AttendanceReportsView shopParams={shopParams} branchId={branchId} branches={branches} t={t} error={error} />
      )}
    </div>
  );
}

// ── Today: the fast daily path ───────────────────────────────────────────────
function TodayView({ shopParams, branchId, branches, t, error, success }) {
  const [date, setDate] = useState(todayStr());
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Local edits keyed by employee id, seeded from the fetched roster and
  // merged on save — lets the whole grid be adjusted before one save call
  // instead of round-tripping per row.
  const [pending, setPending] = useState({});

  const fetchDay = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), date };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/attendance', { params });
      setEmployees(data.employees || []);
      setPending({});
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, branchId, date, error, t]);

  useEffect(() => { fetchDay(); }, [fetchDay]);

  const statusFor = (emp) => pending[emp.id]?.status ?? emp.status;
  const shiftFor = (emp) => pending[emp.id]?.shift ?? emp.shift ?? '';
  const overtimeFor = (emp) => pending[emp.id]?.overtime_hours ?? emp.overtime_hours ?? '';
  const setStatus = (empId, status) => setPending(p => ({ ...p, [empId]: { ...p[empId], status } }));
  const setShift = (empId, shift) => setPending(p => ({ ...p, [empId]: { ...p[empId], shift } }));
  const setOvertimeHours = (empId, overtime_hours) => setPending(p => ({ ...p, [empId]: { ...p[empId], overtime_hours } }));
  const cycleStatus = (emp) => setStatus(emp.id, nextStatus(statusFor(emp)));
  const markAllPresent = () => {
    const next = {};
    employees.forEach(e => { next[e.id] = { ...pending[e.id], status: 'present' }; });
    setPending(next);
  };

  const dirtyCount = Object.keys(pending).length;

  const handleSave = async () => {
    const entries = Object.keys(pending)
      .map((empId) => {
        const emp = employees.find(e => String(e.id) === empId);
        if (!emp) return null;
        const status = statusFor(emp);
        if (!status) return null;
        return {
          employee_id: parseInt(empId, 10),
          status,
          shift: shiftFor(emp) || undefined,
          overtime_hours: overtimeFor(emp) !== '' ? overtimeFor(emp) : 0,
        };
      })
      .filter(Boolean);
    if (!entries.length) return;
    setSaving(true);
    try {
      await api.post('/attendance/mark', { ...shopParams(), date, entries });
      success(t('attendanceSaved') || 'Attendance saved');
      fetchDay();
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('date') || 'Date'}</span>
          <input className="input" type="date" max={todayStr()} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button type="button" onClick={markAllPresent} className="btn-secondary text-sm self-end">
          {t('markAllPresent') || 'Mark all present'}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirtyCount || saving}
          className="btn-primary flex items-center gap-2 text-sm self-end"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('save') || 'Save'}{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('name') || 'Name'}</th>
                <th className="text-start p-4">{t('designation') || 'Designation'}</th>
                {branches.length !== 1 && <th className="text-start p-4">{t('branch') || 'Branch'}</th>}
                <th className="text-start p-4">{t('shift')}</th>
                <th className="text-start p-4">{t('overtimeHours') || 'OT (hrs)'}</th>
                <th className="text-end p-4">{t('status') || 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const status = statusFor(emp);
                const isDirty = !!pending[emp.id];
                const canEditExtras = !!status;
                return (
                  <tr
                    key={emp.id}
                    style={{ borderBottom: '1px solid var(--border-subtle)', background: isDirty ? 'rgba(16,185,129,0.05)' : undefined }}
                  >
                    <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.designation || '—'}</td>
                    {branches.length !== 1 && <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.branch?.name || '—'}</td>}
                    <td className="p-4">
                      <select
                        className="input text-xs py-1"
                        style={{ minWidth: '100px' }}
                        disabled={!canEditExtras}
                        value={shiftFor(emp)}
                        onChange={e => setShift(emp.id, e.target.value)}
                      >
                        <option value="">{t('none') || '--'}</option>
                        {SHIFTS.map(s => <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>)}
                      </select>
                    </td>
                    <td className="p-4">
                      <input
                        className="input text-xs py-1"
                        style={{ width: '70px' }}
                        type="number" min="0" step="0.5"
                        disabled={!canEditExtras}
                        value={overtimeFor(emp)}
                        onChange={e => setOvertimeHours(emp.id, e.target.value)}
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => cycleStatus(emp)}
                          title={status ? (t(STATUS_META[status]?.labelKey) || STATUS_META[status]?.fallback) : (t('unmarked') || 'Unmarked')}
                          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm transition-opacity hover:opacity-80"
                          style={{
                            background: status ? STATUS_META[status]?.cell : 'var(--bg-elevated)',
                            border: status ? 'none' : '1px dashed var(--border-subtle)',
                            color: status ? '#fff' : 'var(--text-muted)',
                            boxShadow: isDirty ? '0 0 0 2px var(--text-primary)' : 'none',
                          }}
                        >
                          {status ? STATUS_META[status]?.letter : ''}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEmployees') || 'No employees'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Month: review / backfill the whole roster at once ────────────────────────
// Mirrors TodayView's stage-then-save shape: clicking cells only edits local
// state, nothing is sent until Save is pressed. The previous version saved
// each click immediately with no Save button and no way to tell it had
// worked, and the cycle had a dead end at "leave" — clicking further did
// nothing at all, which is what read as "not saved from here".
function MonthView({ shopParams, branchId, t, error, success }) {
  const [month, setMonth] = useState(monthStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Local edits keyed by `${employeeId}:${day}`, merged over the fetched grid
  // and only sent to the server on Save.
  const [pending, setPending] = useState({});

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), month };
      if (branchId) params.branch_id = branchId;
      const { data: res } = await api.get('/attendance/month', { params });
      setData(res);
      setPending({});
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, branchId, month, error, t]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  const days = useMemo(() => {
    if (!data) return [];
    const [y, m] = data.month.split('-').map(Number);
    const count = new Date(y, m, 0).getDate();
    return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'));
  }, [data]);

  const statusFor = (employeeId, day) => {
    const key = `${employeeId}:${day}`;
    if (pending[key]) return pending[key];
    return data.employees.find(e => e.id === employeeId)?.days?.[day]?.status || null;
  };

  // Always cycles within the three real statuses — no dead end. A cell that
  // was never marked starts at "present" on the first click; from there it
  // only ever moves to the next of the three, wrapping around indefinitely.
  const cycle = (employeeId, day) => {
    if (`${data.month}-${day}` > todayStr()) return;
    setPending(p => ({ ...p, [`${employeeId}:${day}`]: nextStatus(statusFor(employeeId, day)) }));
  };

  const dirtyCount = Object.keys(pending).length;

  const handleSave = async () => {
    // /attendance/mark takes one date at a time, so pending edits (which can
    // span the whole month) are grouped by date and sent as one call per date
    // touched — not one call per cell.
    const byDate = {};
    Object.entries(pending).forEach(([key, status]) => {
      const [employeeId, day] = key.split(':');
      const date = `${data.month}-${day}`;
      (byDate[date] = byDate[date] || []).push({ employee_id: parseInt(employeeId, 10), status });
    });
    if (!Object.keys(byDate).length) return;

    setSaving(true);
    try {
      await Promise.all(Object.entries(byDate).map(([date, entries]) =>
        api.post('/attendance/mark', { ...shopParams(), date, entries })));
      success(t('attendanceSaved') || 'Attendance saved');
      fetchMonth();
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('month') || 'Month'}</span>
          <input className="input" type="month" max={monthStr()} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {STATUS_ORDER.map(s => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_META[s].cell }} />
              {t(STATUS_META[s].labelKey) || STATUS_META[s].fallback}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirtyCount || saving}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('save') || 'Save'}{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
        </button>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  className="text-start p-2 sticky start-0"
                  style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', minWidth: '140px' }}
                >
                  {t('name') || 'Name'}
                </th>
                {days.map(d => (
                  <th key={d} className="p-1 text-center" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', minWidth: '28px' }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map(emp => (
                <tr key={emp.id}>
                  <td
                    className="p-2 font-medium sticky start-0"
                    style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    {emp.name}
                  </td>
                  {days.map(d => {
                    const status = statusFor(emp.id, d);
                    const key = `${emp.id}:${d}`;
                    const isDirty = pending[key] !== undefined;
                    const future = `${data.month}-${d}` > todayStr();
                    return (
                      <td
                        key={d}
                        className="p-1 text-center"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <button
                          type="button"
                          disabled={future}
                          onClick={() => cycle(emp.id, d)}
                          title={status ? (t(STATUS_META[status]?.labelKey) || status) : (t('unmarked') || 'Unmarked')}
                          className="w-6 h-6 rounded flex items-center justify-center mx-auto font-bold text-[10px] leading-none transition-opacity hover:opacity-80 disabled:opacity-30"
                          style={{
                            background: status ? STATUS_META[status]?.cell : 'var(--bg-elevated)',
                            border: status ? 'none' : '1px dashed var(--border-subtle)',
                            color: status ? '#fff' : 'var(--text-muted)',
                            boxShadow: isDirty ? '0 0 0 2px var(--text-primary)' : 'none',
                          }}
                        >
                          {status ? STATUS_META[status]?.letter : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data.employees.length === 0 && (
                <tr><td colSpan={days.length + 1} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEmployees') || 'No employees'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
