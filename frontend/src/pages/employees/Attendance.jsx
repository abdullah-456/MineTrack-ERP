import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarCheck, CalendarCheck2, CalendarOff, Loader2, Save } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import AttendanceReportsView from '../../components/attendance/AttendanceReportsView';
import { STATUS_META, STATUS_ORDER, HOLIDAY_META } from '../../utils/attendanceStatus';
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
  // Name of the holiday on the selected date, or null — a shop-wide fact
  // (not per employee), fetched alongside the roster so an unmarked cell can
  // read as "day off" instead of looking like nobody got around to it.
  const [holiday, setHoliday] = useState(null);
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
      setHoliday(data.holiday || null);
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

      {holiday && (
        <div
          className="glass-card p-3 flex items-center gap-2 text-sm"
          style={{ color: HOLIDAY_META.cell, border: `1px solid ${HOLIDAY_META.cell}` }}
        >
          <CalendarOff className="w-4 h-4 shrink-0" />
          {(t('holidayOnDate') || 'This date is a holiday: {name}').replace('{name}', holiday)}
        </div>
      )}

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
                      <div className="flex items-center justify-end gap-2">
                        {/* Colour swatch keeps the at-a-glance scan the old
                            cycling button gave, while the select next to it
                            makes every option visible and reachable in one
                            action — with five statuses, cycling would take up
                            to five clicks to land on the right one. */}
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                          title={
                            status
                              ? (t(STATUS_META[status]?.labelKey) || STATUS_META[status]?.fallback)
                              : holiday
                                ? (t('holidayOnDate') || 'This date is a holiday: {name}').replace('{name}', holiday)
                                : (t('unmarked') || 'Unmarked')
                          }
                          style={{
                            // An employee left unmarked on a holiday reads as a
                            // day off, not a gap someone forgot to fill in — the
                            // dashed "nothing here" outline is reserved for a
                            // genuine working day nobody has marked yet.
                            background: status ? STATUS_META[status]?.cell : holiday ? HOLIDAY_META.cell : 'var(--bg-elevated)',
                            border: status || holiday ? 'none' : '1px dashed var(--border-subtle)',
                            color: status || holiday ? '#fff' : 'var(--text-muted)',
                            boxShadow: isDirty ? '0 0 0 2px var(--text-primary)' : 'none',
                          }}
                        >
                          {status ? STATUS_META[status]?.letter : holiday ? HOLIDAY_META.letter : ''}
                        </span>
                        <select
                          className="input text-xs py-1"
                          style={{ minWidth: '130px' }}
                          value={status || ''}
                          onChange={e => setStatus(emp.id, e.target.value)}
                        >
                          <option value="">{holiday ? (t('holiday') || 'Holiday') : (t('unmarked') || 'Unmarked')}</option>
                          {STATUS_ORDER.map(s => (
                            <option key={s} value={s}>{t(STATUS_META[s].labelKey) || STATUS_META[s].fallback}</option>
                          ))}
                        </select>
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

  const setStatus = (employeeId, day, status) => {
    if (`${data.month}-${day}` > todayStr()) return;
    setPending(p => ({ ...p, [`${employeeId}:${day}`]: status }));
  };

  // One-click backfill for an employee who simply worked every day this
  // month — stages 'present' across the whole row in one go instead of
  // clicking through up to 31 cells by hand. Future days stay untouched:
  // setStatus already refuses to edit past today, so looping through every
  // day of the month and letting it silently skip the ones ahead is the same
  // rule a single-cell edit already follows, just applied row-wide. Holiday
  // days are skipped too — a day off is the default here, not something a
  // "mark the working days present" shortcut should overwrite; anyone who
  // actually worked a holiday can still be marked present on that one cell.
  const markEmployeeMonthPresent = (employeeId) => {
    setPending(p => {
      const next = { ...p };
      days.forEach(d => {
        if (`${data.month}-${d}` > todayStr()) return;
        if (data.holidays?.[d]) return;
        next[`${employeeId}:${d}`] = 'present';
      });
      return next;
    });
  };

  const dirtyCount = Object.keys(pending).length;

  const handleSave = async () => {
    // /attendance/mark takes one date at a time, so pending edits (which can
    // span the whole month) are grouped by date and sent as one call per date
    // touched — not one call per cell.
    const byDate = {};
    Object.entries(pending).forEach(([key, status]) => {
      // Picking the blank "Unmarked" option stages an empty status — there is
      // no "unmark" write on the API, so it's simply not sent rather than
      // rejected as an invalid status on save.
      if (!status) return;
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
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: HOLIDAY_META.cell }} />
            {t(HOLIDAY_META.labelKey) || HOLIDAY_META.fallback}
          </span>
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
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{emp.name}</span>
                      <button
                        type="button"
                        onClick={() => markEmployeeMonthPresent(emp.id)}
                        title={t('markMonthPresent') || 'Mark whole month present'}
                        className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <CalendarCheck2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  {days.map(d => {
                    const status = statusFor(emp.id, d);
                    const key = `${emp.id}:${d}`;
                    const isDirty = pending[key] !== undefined;
                    const future = `${data.month}-${d}` > todayStr();
                    const dayHoliday = data.holidays?.[d];
                    return (
                      <td
                        key={d}
                        className="p-1 text-center"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        {/* A real <select> laid transparently over the colour
                            cell: the grid keeps its compact one-letter density
                            (31 full-width dropdowns per row would be unusable)
                            while status is still picked from a list instead of
                            by clicking through the options one at a time. */}
                        <div
                          className="relative w-6 h-6 mx-auto rounded flex items-center justify-center font-bold text-[10px] leading-none"
                          title={
                            status
                              ? (t(STATUS_META[status]?.labelKey) || status)
                              : dayHoliday
                                ? (t('holidayOnDate') || 'This date is a holiday: {name}').replace('{name}', dayHoliday)
                                : (t('unmarked') || 'Unmarked')
                          }
                          style={{
                            // Unmarked-but-a-holiday reads as a day off, not a
                            // gap nobody filled in — same reasoning as the
                            // Today tab's swatch above.
                            background: status ? STATUS_META[status]?.cell : dayHoliday ? HOLIDAY_META.cell : 'var(--bg-elevated)',
                            border: status || dayHoliday ? 'none' : '1px dashed var(--border-subtle)',
                            color: status || dayHoliday ? '#fff' : 'var(--text-muted)',
                            boxShadow: isDirty ? '0 0 0 2px var(--text-primary)' : 'none',
                            opacity: future ? 0.3 : 1,
                          }}
                        >
                          {status ? STATUS_META[status]?.letter : dayHoliday ? HOLIDAY_META.letter : ''}
                          <select
                            disabled={future}
                            value={status || ''}
                            onChange={e => setStatus(emp.id, d, e.target.value)}
                            aria-label={`${emp.name} ${data.month}-${d}`}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                            // The select itself stays invisible (opacity-0) so
                            // only the colour swatch behind it shows — but a
                            // browser's native dropdown POPUP still renders its
                            // option text in the select's own CSS colour, which
                            // was inheriting the swatch's white text from the
                            // parent div above. White text on the popup's own
                            // (light) background made every option unreadable
                            // except whichever one happened to be highlighted.
                            // Pinned to a fixed dark colour here so the popup is
                            // legible regardless of what status is selected.
                            style={{ color: '#111827', colorScheme: 'light' }}
                          >
                            <option value="">{dayHoliday ? (t('holiday') || 'Holiday') : (t('unmarked') || 'Unmarked')}</option>
                            {STATUS_ORDER.map(s => (
                              <option key={s} value={s}>{t(STATUS_META[s].labelKey) || STATUS_META[s].fallback}</option>
                            ))}
                          </select>
                        </div>
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
