import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Plus, Search, Edit, Loader2, BookOpen, Trash2, FileCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import LocationPicker from '../../components/ui/LocationPicker';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { openClearancePrint } from '../../utils/employeeClearancePdf';
import TerminateEmployeeModal from '../../components/employees/TerminateEmployeeModal';
import { filterRowsByLocation } from '../../utils/locationUtils';

export default function Employees() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { can } = useAuth();
  const { shopParams, shopReady, branches } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [employees, setEmployees] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [terminateTarget, setTerminateTarget] = useState(null);
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', status: '' });
  const [locationFilter, setLocationFilter] = useState({ location_type: 'branch', branch_id: '', godown_id: null });

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [empRes, godRes] = await Promise.all([
        api.get('/employees', { params: { ...shopParams(), search } }),
        api.get('/godowns', { params: shopParams() }).catch(() => ({ data: { godowns: [] } })),
      ]);
      setEmployees(empRes.data.employees || []);
      setGodowns(godRes.data.godowns || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatLocationName = (emp) => {
    if (emp.Branch?.Godown) return `${emp.Branch.Godown.name} (${emp.Branch.name})`;
    return emp.Branch?.name || '—';
  };

  const reportSelects = [
    { key: 'status', label: t('status') || 'Status', options: [
      { value: 'active', label: t('active') || 'Active' },
      { value: 'suspended', label: t('suspended') || 'Suspended' },
      { value: 'terminated', label: t('terminated') || 'Terminated' },
    ] },
  ];
  let reportRows = filterByDate(employees, 'hire_date', reportFilters.from, reportFilters.to);
  if (reportFilters.status) reportRows = reportRows.filter(e => e.status === reportFilters.status);
  reportRows = filterRowsByLocation(reportRows, locationFilter, godowns, branches);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    reportRows = reportRows.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.employment_id || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      (e.cnic || '').toLowerCase().includes(q) ||
      (formatLocationName(e) || '').toLowerCase().includes(q) ||
      (e.status || '').toLowerCase().includes(q) ||
      (String(e.basic_salary) || '').toLowerCase().includes(q) ||
      (String(e.current_payable) || '').toLowerCase().includes(q) ||
      (e.hire_date ? new Date(e.hire_date).toLocaleDateString('en-PK') : '').toLowerCase().includes(q)
    );
  }

  const dateCell = (v) => (v ? new Date(v).toLocaleDateString('en-PK') : '');
  const reportColumns = [
    { header: t('employmentId') || 'Emp ID', render: e => e.employment_id || '', width: 1.1 },
    { header: t('name') || 'Name', key: 'name', width: 1.6 },
    { header: t('designation') || 'Designation', render: e => e.designation || '', width: 1.3 },
    { header: t('location') || 'Location', render: e => formatLocationName(e), width: 1.4 },
    { header: t('payType') || 'Pay Type', render: e => (e.employment_type === 'daily_wage' ? (t('dailyWage') || 'Daily Wage') : (t('salary') || 'Salary')), width: 1 },
    // One column for "what this employee is paid", since only one of the two
    // amounts is ever set — two mostly-empty columns would read worse.
    {
      header: t('salaryOrWage') || 'Salary / Wage',
      key: 'pay_amount',
      money: true,
      width: 1.1,
      render: e => (e.employment_type === 'daily_wage' ? e.daily_wage : e.basic_salary),
    },
    { header: t('hireDate') || 'Hire Date', render: e => dateCell(e.hire_date), width: 1.1 },
    // Both ends of the lifecycle, so an export can show WHEN a status took
    // effect and not just what it currently is.
    { header: t('suspendedOn') || 'Suspended On', render: e => dateCell(e.suspended_at), width: 1.1 },
    { header: t('terminatedOn') || 'Terminated On', render: e => dateCell(e.terminated_at), width: 1.1 },
    { header: t('currentPayable') || 'Payable', key: 'current_payable', money: true, width: 1.1 },
    { header: t('status') || 'Status', key: 'status', width: 0.9 },
  ];
  const reportTotals = {
    __label: t('total') || 'Total',
    pay_amount: reportRows.reduce((s, e) => s + parseFloat(
      (e.employment_type === 'daily_wage' ? e.daily_wage : e.basic_salary) || 0,
    ), 0),
    current_payable: reportRows.reduce((s, e) => s + parseFloat(e.current_payable || 0), 0),
  };
  // Headcount summary as a line UNDER the table, not squeezed into a totals
  // cell — a narrow column wraps this into an unreadable stack.
  const statusCounts = reportRows.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {});
  const reportNote = `${t('totalEmployees') || 'Total Employees'}: ${reportRows.length} — `
    + ['active', 'suspended', 'terminated']
      .map(s => `${t(s) || s}: ${statusCounts[s] || 0}`)
      .join(', ');

  const canUpdate = can('employees', 'update');

  const changeStatus = async (emp, status) => {
    if (status === 'terminated') {
      setTerminateTarget(emp);
      return;
    }
    if (emp.status === status) return;
    try {
      await api.patch(`/employees/${emp.id}/status`, { status, ...shopParams() });
      success(t('employeeUpdated') || 'Employee updated');
      fetchData();
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      fetchData();
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={UserCheck}
        accent="cyan"
        title={t('employees')}
        subtitle={t('employeesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('employees') || 'Employees Report'}
              columns={reportColumns}
              rows={reportRows}
              totals={reportTotals}
              note={reportNote}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="employees-report.pdf"
              columnPicker
            />
            <button type="button" onClick={() => navigate('/employees/create')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addEmployee')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchEmployees')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <LocationPicker
            compact
            value={locationFilter}
            onChange={setLocationFilter}
          />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ from: '', to: '', status: '' })}
          selects={reportSelects}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('employmentId') || 'Emp ID'}</th>
                <th className="text-start p-4">{t('name')}</th>
                <th className="text-start p-4">{t('designation')}</th>
                <th className="text-start p-4">{t('location') || 'Location'}</th>
                <th className="text-start p-4">{t('salaryOrWage') || 'Salary / Wage'}</th>
                <th className="text-start p-4">{t('hireDate')}</th>
                <th className="text-start p-4">{t('currentPayable') || 'Current Payable'}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(emp => (
                <tr
                  key={emp.id}
                  id={`row-${emp.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(emp.id) ? 'highlight-row' : 'hover:bg-white/10'} cursor-pointer transition-colors`}
                  title={t('viewLedger') || 'View Ledger'}
                  onClick={(e) => {
                    if (e.target.closest('button, select')) return;
                    navigate(`/employees/${emp.id}`);
                  }}
                >
                  <td className="p-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.employment_id || '—'}</td>
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</div>
                    {emp.phone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.phone}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.designation || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatLocationName(emp)}</td>
                  <td className="p-4 font-semibold text-cyan-400">
                    {emp.employment_type === 'daily_wage' ? (
                      <>
                        {formatPKR(emp.daily_wage, lang)}
                        <div className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>{t('perDay') || 'per day'}</div>
                      </>
                    ) : formatPKR(emp.basic_salary, lang)}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>
                    {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK') : '—'}
                    {/* Shows WHEN the current non-active status took effect, the
                        other end of the lifecycle hire_date already covered. */}
                    {emp.status === 'suspended' && emp.suspended_at && (
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {t('suspendedOn') || 'Suspended'}: {new Date(emp.suspended_at).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                      </div>
                    )}
                    {emp.status === 'terminated' && emp.terminated_at && (
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {t('terminatedOn') || 'Terminated'}: {new Date(emp.terminated_at).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                      </div>
                    )}
                  </td>
                  <td className="p-4 font-semibold" style={{ color: parseFloat(emp.current_payable) < 0 ? '#f87171' : 'var(--text-secondary)' }}>
                    {formatPKR(emp.current_payable, lang)}
                  </td>
                  <td className="p-4" onClick={e => e.stopPropagation()}>
                    {emp.status === 'terminated' || !canUpdate ? (
                      <StatusBadge status={emp.status} />
                    ) : (
                      <select
                        className="input text-xs py-1.5 px-2 min-w-[7rem]"
                        value={emp.status === 'suspended' ? 'suspended' : 'active'}
                        onChange={e => changeStatus(emp, e.target.value)}
                      >
                        <option value="active">{t('active') || 'Active'}</option>
                        <option value="suspended">{t('suspended') || 'Suspended'}</option>
                        <option value="terminated">{t('terminate') || 'Terminate'}</option>
                      </select>
                    )}
                  </td>
                  <td className="p-4 text-end">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => navigate(`/employees/${emp.id}`)} className="icon-btn" title={t('ledger')}><BookOpen className="w-4 h-4" /></button>
                      {emp.status === 'terminated' && (
                        <button type="button" onClick={() => openClearancePrint(emp.id)} className="icon-btn text-emerald-400" title={t('clearanceCertificate') || 'Clearance Certificate'}><FileCheck className="w-4 h-4" /></button>
                      )}
                      <button type="button" onClick={() => navigate(`/employees/${emp.id}/edit`)} className="icon-btn" title={t('edit') || 'Edit'}><Edit className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setTerminateTarget(emp)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEmployees')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {terminateTarget && (
        <TerminateEmployeeModal
          employee={terminateTarget}
          onClose={() => setTerminateTarget(null)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
