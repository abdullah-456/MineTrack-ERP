import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Truck, Loader2, Save, ArrowLeft, Search, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const monthStr = () => new Date().toISOString().slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);

// Every day of a YYYY-MM as full ISO date strings.
function daysOfMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

const num = (v) => parseFloat(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

export default function TruckLoadingFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches, shopReady } = useShopApi();
  const navigate = useNavigate();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  // Tracks who has been COLLAPSED rather than who has been expanded: ticking an
  // employee is already the signal that you intend to set their rates and days,
  // so their card opens straight away. The chevron is then for folding away
  // someone you're done with, not the only way to reach the controls.
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggleCollapsed = (empId) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(empId)) next.delete(empId);
    else next.add(empId);
    return next;
  });

  const [form, setForm] = useState({ mine_id: '', month: monthStr(), rate: '', ton_rate: '', remarks: '' });

  // Everything below is staged locally and sent as ONE save, like the
  // attendance grid — a request per day cell would be a request per keystroke.
  const [dayCounts, setDayCounts] = useState({}); // { 'YYYY-MM-DD': { trucks, tons } }
  // { [employee_id]: { credited_days, truck_rate_enabled, truck_rate, ton_rate_enabled, ton_rate } }
  // credited_days === null means "every day logged here, including days added later".
  const [eligible, setEligible] = useState({});

  const days = useMemo(() => daysOfMonth(form.month), [form.month]);

  const fetchRoster = useCallback(async () => {
    try {
      const { data } = await api.get('/truck-loading/employees', { params: shopParams() });
      setRoster(data.employees || []);
    } catch {
      setRoster([]);
    }
  }, [shopParams]);

  const fetchLog = useCallback(async () => {
    if (!isEdit || !shopReady) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/truck-loading/${id}`, { params: shopParams() });
      const log = data.log;
      setForm({
        mine_id: String(log.mine_id),
        month: log.month,
        rate: log.rate ? String(log.rate) : '',
        ton_rate: log.ton_rate ? String(log.ton_rate) : '',
        remarks: log.remarks || '',
      });
      setDayCounts(Object.fromEntries((log.days || []).map(d => [
        d.date, { trucks: String(d.trucks ?? ''), tons: d.tons ? String(d.tons) : '' },
      ])));
      setEligible(Object.fromEntries((log.employees || []).map(e => [e.employee_id, {
        credited_days: e.credited_days,
        truck_rate_enabled: e.truck_rate_enabled,
        truck_rate: e.truck_rate ? String(e.truck_rate) : '',
        ton_rate_enabled: e.ton_rate_enabled,
        ton_rate: e.ton_rate ? String(e.ton_rate) : '',
      }])));
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      navigate('/admin/truck-loading');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, shopReady, shopParams, error, t, navigate]);

  useEffect(() => { if (shopReady) fetchRoster(); }, [shopReady, fetchRoster]);
  useEffect(() => { fetchLog(); }, [fetchLog]);

  useEffect(() => {
    if (!isEdit && !form.mine_id && branches.length) {
      setForm(f => ({ ...f, mine_id: String(branches[0].id) }));
    }
  }, [branches, isEdit, form.mine_id]);

  // Days that carry anything at all — what commission is summed over, and the
  // only days a per-employee picker offers. A day with neither trucks nor tons
  // would just be a dead checkbox.
  const loggedDays = days.filter(d => num(dayCounts[d]?.trucks) > 0 || num(dayCounts[d]?.tons) > 0);
  const totalTrucks = loggedDays.reduce((s, d) => s + num(dayCounts[d]?.trucks), 0);
  const totalTons = round3(loggedDays.reduce((s, d) => s + num(dayCounts[d]?.tons), 0));

  const setDay = (date, field, value) => setDayCounts(c => ({
    ...c, [date]: { ...c[date], [field]: value },
  }));

  // Live preview of the same rule the backend applies: sum only this
  // employee's credited days, apply their own rates, and stack the two bases.
  const amountFor = (empId) => {
    const row = eligible[empId];
    if (!row) return 0;
    const credited = Array.isArray(row.credited_days) ? new Set(row.credited_days) : null;
    const mine = loggedDays.filter(d => !credited || credited.has(d));
    const trucks = mine.reduce((s, d) => s + num(dayCounts[d]?.trucks), 0);
    const tons = round3(mine.reduce((s, d) => s + num(dayCounts[d]?.tons), 0));
    return round2(
      (row.truck_rate_enabled ? trucks * num(row.truck_rate) : 0)
      + (row.ton_rate_enabled ? tons * num(row.ton_rate) : 0),
    );
  };

  const statsFor = (empId) => {
    const row = eligible[empId];
    const credited = Array.isArray(row?.credited_days) ? new Set(row.credited_days) : null;
    const mine = loggedDays.filter(d => !credited || credited.has(d));
    return {
      days: mine.length,
      trucks: mine.reduce((s, d) => s + num(dayCounts[d]?.trucks), 0),
      tons: round3(mine.reduce((s, d) => s + num(dayCounts[d]?.tons), 0)),
    };
  };

  // Ticking an employee pre-fills their rates from their own profile default,
  // falling back to this log's mine/month default. Mirrors
  // resolveEmployeeRates on the backend exactly — including the rule that a
  // basis starts ON whenever a rate was found for it, so typing a rate at the
  // top of the page and ticking someone with a blank profile doesn't silently
  // give them zero.
  const defaultRowFor = (emp) => {
    const truckRate = num(emp.commission_per_truck) || num(form.rate);
    const tonRate = num(emp.commission_per_ton) || num(form.ton_rate);
    return {
      credited_days: null, // all logged days, now and later
      truck_rate_enabled: truckRate > 0,
      truck_rate: truckRate ? String(truckRate) : '',
      ton_rate_enabled: tonRate > 0,
      ton_rate: tonRate ? String(tonRate) : '',
    };
  };

  const toggleEmployee = (emp) => {
    // Un-collapsing on every toggle means re-ticking someone you previously
    // folded away brings their controls back, rather than silently re-adding
    // them with the card still shut.
    setCollapsed(prev => {
      if (!prev.has(emp.id)) return prev;
      const next = new Set(prev);
      next.delete(emp.id);
      return next;
    });
    setEligible(list => {
      if (list[emp.id]) {
        const { [emp.id]: _removed, ...rest } = list;
        return rest;
      }
      return { ...list, [emp.id]: defaultRowFor(emp) };
    });
  };

  const setRow = (empId, patch) => setEligible(list => ({ ...list, [empId]: { ...list[empId], ...patch } }));

  const toggleCreditedDay = (empId, date) => {
    setEligible(list => {
      const row = list[empId];
      // The first edit turns "all days" into an explicit list seeded with every
      // currently-logged day, so unticking one day doesn't wipe the rest.
      const current = Array.isArray(row.credited_days) ? row.credited_days : loggedDays;
      const next = current.includes(date) ? current.filter(d => d !== date) : [...current, date].sort();
      return { ...list, [empId]: { ...row, credited_days: next } };
    });
  };

  const filteredRoster = roster.filter(e => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return true;
    return [e.name, e.employment_id, e.designation].some(v => (v || '').toLowerCase().includes(q));
  });

  const selectAllEmployees = () => {
    const next = { ...eligible };
    filteredRoster.forEach(emp => {
      if (!next[emp.id]) next[emp.id] = defaultRowFor(emp);
    });
    setEligible(next);
  };

  const eligibleIds = Object.keys(eligible).map(Number);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.mine_id) { error(`${t('required') || 'Required'}: ${t('mineColumnLabel') || 'Mine'}`); return; }
    if (!/^\d{4}-\d{2}$/.test(form.month)) { error(`${t('required') || 'Required'}: ${t('month') || 'Month'}`); return; }

    setSaving(true);
    try {
      const payload = {
        ...shopParams(),
        mine_id: parseInt(form.mine_id, 10),
        month: form.month,
        rate: num(form.rate),
        ton_rate: num(form.ton_rate),
        remarks: form.remarks,
        days: loggedDays.map(d => ({
          date: d,
          trucks: num(dayCounts[d]?.trucks),
          tons: num(dayCounts[d]?.tons),
        })),
        employees: eligibleIds.map(empId => ({
          employee_id: empId,
          credited_days: eligible[empId].credited_days,
          truck_rate_enabled: eligible[empId].truck_rate_enabled,
          truck_rate: num(eligible[empId].truck_rate),
          ton_rate_enabled: eligible[empId].ton_rate_enabled,
          ton_rate: num(eligible[empId].ton_rate),
        })),
      };
      if (isEdit) await api.put(`/truck-loading/${id}`, payload);
      else await api.post('/truck-loading', payload);
      success(t('truckLoadingSaved') || 'Truck commission log saved');
      navigate('/admin/truck-loading');
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>;
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Truck}
        accent="amber"
        title={t('truckLoading') || 'Truck Commission'}
        subtitle={t('truckLoadingSub') || 'Log trucks and tons loaded per mine and set who earns commission this month'}
        action={
          <button type="button" onClick={() => navigate('/admin/truck-loading')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-6">
        <div className="glass-card p-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1">
            <FormLabel required>{t('mineColumnLabel') || 'Mine'}</FormLabel>
            {/* Mine and month identify the log — changing either on an existing
                one would move already-credited commission onto a different
                mine/month, so they lock after creation. */}
            <select className="input" required disabled={isEdit} value={form.mine_id} onChange={e => setForm(f => ({ ...f, mine_id: e.target.value }))}>
              <option value="">{t('select') || 'Select'}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="min-w-[160px]">
            <FormLabel required>{t('month') || 'Month'}</FormLabel>
            <input className="input" type="month" required disabled={isEdit} max={monthStr()} value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
          </div>
          {/* Mine/month DEFAULTS only. Each employee's own rate is what gets
              paid — these just pre-fill someone who has no rate on their
              profile. */}
          <div className="min-w-[160px]">
            <FormLabel>{t('commissionPerTruck') || 'Commission per Truck'}</FormLabel>
            <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
          </div>
          <div className="min-w-[160px]">
            <FormLabel>{t('commissionPerTon') || 'Commission per Ton'}</FormLabel>
            <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.ton_rate} onChange={e => setForm(f => ({ ...f, ton_rate: e.target.value }))} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 h-[42px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('save') || 'Save'}
          </button>
        </div>
        <p className="text-xs -mt-4 px-1" style={{ color: 'var(--text-muted)' }}>
          {t('logDefaultRateHint') || 'These are defaults for this mine and month — each employee below keeps their own rate, which is what actually gets paid.'}
        </p>

        {/* ── Day-wise trucks + tons ── */}
        <div className="glass-card p-4 space-y-3">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('trucksAndTonsPerDay') || 'Trucks & Tons Loaded (Day-wise)'}
          </h3>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-1.5 min-w-max">
              {days.map(d => {
                const future = d > todayStr();
                return (
                  <div key={d} className="flex flex-col gap-1" style={{ width: 62 }}>
                    <span className="text-[11px] font-semibold text-center" style={{ color: 'var(--text-muted)' }}>{d.slice(8)}</span>
                    <input
                      className="input text-xs py-1 text-center px-1"
                      type="number" min="0" step="1" placeholder={t('trucksAbbrev') || 'trk'}
                      title={`${d} — ${t('trucksLoaded') || 'Trucks'}`}
                      disabled={future}
                      value={dayCounts[d]?.trucks ?? ''}
                      onChange={e => setDay(d, 'trucks', e.target.value)}
                    />
                    <input
                      className="input text-xs py-1 text-center px-1"
                      type="number" min="0" step="0.001" placeholder={t('tonsAbbrev') || 'ton'}
                      title={`${d} — ${t('tonsLoaded') || 'Tons'}`}
                      disabled={future}
                      value={dayCounts[d]?.tons ?? ''}
                      onChange={e => setDay(d, 'tons', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            <span>{t('totalTrucks') || 'Total Trucks'}: <span className="font-bold text-amber-400">{totalTrucks.toLocaleString()}</span></span>
            <span>{t('totalTons') || 'Total Tons'}: <span className="font-bold text-amber-400">{totalTons.toLocaleString()}</span></span>
            <span>{t('eligibleEmployees') || 'Eligible Employees'}: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{eligibleIds.length}</span></span>
          </div>
        </div>

        {/* ── Eligible employees ── */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Users className="w-4 h-4" />
              {t('eligibleEmployeesTitle') || "Employees Eligible for This Mine's Commission"}
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '10px', color: 'var(--text-muted)' }} />
                <input
                  className="input text-sm" style={{ paddingInlineStart: '2.2rem', minWidth: 220 }}
                  placeholder={t('searchEmployees') || 'Search employees…'}
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                />
              </div>
              <button type="button" className="btn-secondary text-sm" onClick={selectAllEmployees}>
                {t('selectAll') || 'Select All'}
              </button>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('eligibleEmployeesHint') || 'Check an employee to add them, then pick which specific days they worked here — only trucks and tons on those days count toward their commission. Each person earns the full amount; it is not split between them.'}
          </p>

          <div className="space-y-2">
            {filteredRoster.map(emp => {
              const row = eligible[emp.id];
              const checked = !!row;
              const isOpen = checked && !collapsed.has(emp.id);
              const stats = checked ? statsFor(emp.id) : null;
              const allDays = checked && !Array.isArray(row.credited_days);
              return (
                <div
                  key={emp.id}
                  className="rounded-lg"
                  style={{
                    background: checked ? 'rgba(245,158,11,0.06)' : 'var(--bg-elevated)',
                    border: `1px solid ${checked ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <div className="flex items-center gap-3 p-3">
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input type="checkbox" checked={checked} onChange={() => toggleEmployee(emp)} />
                      <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{emp.name}</span>
                    </label>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {emp.employment_id && <span className="font-mono hidden sm:inline">{emp.employment_id}</span>}
                      {checked && (
                        <>
                          <span className="whitespace-nowrap">
                            {stats.days} {t('daysShort') || 'days'} · {stats.trucks} {t('trucksAbbrev') || 'trk'} · {stats.tons} {t('tonsAbbrev') || 'ton'}
                          </span>
                          <span className="font-bold text-amber-400 whitespace-nowrap">{formatPKR(amountFor(emp.id), lang)}</span>
                          <button type="button" className="icon-btn" onClick={() => toggleCollapsed(emp.id)}>
                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {checked && isOpen && (
                    <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      {/* Per-employee rates. Pre-filled from their profile (or
                          this log's default) but editable here — the edited
                          value is what gets snapshotted and paid. */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-xs cursor-pointer whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                            <input
                              type="checkbox"
                              checked={row.truck_rate_enabled}
                              onChange={e => setRow(emp.id, { truck_rate_enabled: e.target.checked })}
                            />
                            {t('perTruck') || 'Per Truck'}
                          </label>
                          <input
                            className="input text-xs py-1"
                            type="number" min="0" step="0.01" placeholder="0.00"
                            disabled={!row.truck_rate_enabled}
                            value={row.truck_rate}
                            onChange={e => setRow(emp.id, { truck_rate: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-xs cursor-pointer whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                            <input
                              type="checkbox"
                              checked={row.ton_rate_enabled}
                              onChange={e => setRow(emp.id, { ton_rate_enabled: e.target.checked })}
                            />
                            {t('perTon') || 'Per Ton'}
                          </label>
                          <input
                            className="input text-xs py-1"
                            type="number" min="0" step="0.01" placeholder="0.00"
                            disabled={!row.ton_rate_enabled}
                            value={row.ton_rate}
                            onChange={e => setRow(emp.id, { ton_rate: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button type="button" className="btn-secondary text-xs" onClick={() => setRow(emp.id, { credited_days: null })}>
                          {t('selectAll') || 'Select All'}
                        </button>
                        <button type="button" className="btn-secondary text-xs" onClick={() => setRow(emp.id, { credited_days: [] })}>
                          {t('clearAll') || 'Clear All'}
                        </button>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {allDays
                            ? (t('allLoggedDays') || 'All logged days')
                            : `${row.credited_days.filter(d => loggedDays.includes(d)).length} / ${loggedDays.length}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {days.map(d => {
                          const isLogged = loggedDays.includes(d);
                          const ticked = allDays ? isLogged : row.credited_days.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              // A day with nothing logged on it contributes
                              // nothing either way, so it stays inert rather
                              // than offering a tick that changes no money.
                              disabled={!isLogged}
                              onClick={() => toggleCreditedDay(emp.id, d)}
                              title={isLogged
                                ? `${d} — ${num(dayCounts[d]?.trucks)} ${t('trucksAbbrev') || 'trk'}, ${num(dayCounts[d]?.tons)} ${t('tonsAbbrev') || 'ton'}`
                                : `${d} — ${t('noDaysLogged') || 'nothing logged'}`}
                              className="w-8 h-8 rounded text-[11px] font-semibold transition-opacity"
                              style={{
                                background: ticked ? 'rgb(245,158,11)' : 'var(--bg-surface)',
                                // Border and text are deliberately NOT
                                // --border-subtle / --text-muted: on this
                                // card's warm-white tint in light mode both
                                // wash out to near-invisible. The amber outline
                                // ties the chip to the module accent and reads
                                // in either theme.
                                border: `1px solid ${ticked ? 'rgb(245,158,11)' : 'rgba(245,158,11,0.45)'}`,
                                color: ticked ? '#fff' : 'var(--text-secondary)',
                                // A day with nothing logged is dimmed to show
                                // it's inert, but stays legible — the old
                                // opacity-25 made the number unreadable.
                                opacity: isLogged ? 1 : 0.55,
                              }}
                            >
                              {d.slice(8)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredRoster.length === 0 && (
              <p className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{t('noEmployees') || 'No employees'}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate('/admin/truck-loading')}>{t('cancel') || 'Cancel'}</button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('save') || 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
