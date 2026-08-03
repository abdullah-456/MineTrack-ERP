import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import api from '../../api/axios';
import ReportActions from '../ui/ReportActions';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import DailyReportTable from './DailyReportTable';
import AttendanceGridTable from './AttendanceGridTable';
import { STATUS_META, enumerateDates } from '../../utils/attendanceStatus';
import { exportReportXlsx } from '../../utils/xlsxExport';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = () => new Date().toISOString().slice(0, 7);
const firstOfMonth = (m) => `${m}-01`;
const lastOfMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
};

// Employee-scope description used both on-screen and in exported filter lines.
function employeeScopeLabel(selectedIds, employees, t) {
  if (selectedIds.length === 0) return t('allEmployees') || 'All Employees';
  if (selectedIds.length === 1) {
    return employees.find(e => e.id === selectedIds[0])?.name || String(selectedIds[0]);
  }
  return selectedIds
    .map(id => employees.find(e => e.id === id)?.name || id)
    .join(', ');
}

function buildDailyReportModel(report, t, filters) {
  const columns = [
    { header: t('employmentId') || 'Employment ID', key: 'employment_id', width: 1.2, excelWidth: 16 },
    { header: t('name') || 'Name', key: 'name', width: 2, excelWidth: 22 },
    { header: t('designation') || 'Designation', key: 'designation', width: 1.4, excelWidth: 18 },
    { header: t('branchGodownLocation') || 'Branch', key: 'branch', width: 1.4, excelWidth: 18, render: (r) => r.branch?.name || '' },
    {
      header: t('status') || 'Status',
      key: 'status',
      align: 'center',
      width: 1,
      excelWidth: 14,
      render: (r) => (r.status ? (t(STATUS_META[r.status]?.labelKey) || STATUS_META[r.status]?.fallback) : (t('unmarked') || 'Unmarked')),
      fill: (r) => (r.status ? STATUS_META[r.status]?.hex : null),
    },
  ];
  const meta = [
    `${t('present') || 'Present'}: ${report.totals.present}`,
    `${t('absent') || 'Absent'}: ${report.totals.absent}`,
    `${t('leave') || 'Leave'}: ${report.totals.leave}`,
    `${t('unmarked') || 'Unmarked'}: ${report.totals.unmarked}`,
  ];
  return {
    kind: 'list',
    title: t('dailyAttendanceReport') || 'Daily Attendance Report',
    meta,
    filters,
    columns,
    rows: report.employees,
    filename: `daily-attendance-${report.date}.pdf`,
  };
}

function buildGridReportModel(report, t, filters, titleKey, titleFallback, filenamePrefix) {
  const dates = enumerateDates(report.from, report.to);
  const spansMultipleMonths = dates.length > 0 && dates[0].slice(0, 7) !== dates[dates.length - 1].slice(0, 7);

  const columns = [
    { header: t('employmentId') || 'ID', key: 'employment_id', width: 1, excelWidth: 14 },
    { header: t('name') || 'Name', key: 'name', width: 1.6, excelWidth: 20 },
    ...dates.map(d => ({
      header: spansMultipleMonths ? d.slice(5).replace('-', '/') : d.slice(8, 10),
      key: `d_${d}`,
      align: 'center',
      width: 0.45,
      excelWidth: 6,
      render: (r) => {
        const status = r.days?.[d]?.status;
        return status ? STATUS_META[status].letter : '';
      },
      fill: (r) => {
        const status = r.days?.[d]?.status;
        return status ? STATUS_META[status].hex : null;
      },
    })),
    { header: t('totalPresentDays') || 'Present', key: 'present_days', align: 'center', width: 0.8, excelWidth: 10, render: (r) => r.summary.present_days },
    { header: t('totalAbsentDays') || 'Absent', key: 'absent_days', align: 'center', width: 0.8, excelWidth: 10, render: (r) => r.summary.absent_days },
    { header: t('totalLeaveDays') || 'Leave', key: 'leave_days', align: 'center', width: 0.8, excelWidth: 10, render: (r) => r.summary.leave_days },
    { header: t('attendancePercentage') || '%', key: 'percentage', align: 'center', width: 0.8, excelWidth: 8, render: (r) => `${r.summary.percentage}%` },
  ];

  return {
    kind: 'list',
    title: t(titleKey) || titleFallback,
    orientation: 'landscape',
    filters,
    columns,
    rows: report.employees,
    filename: `${filenamePrefix}-${report.from}-to-${report.to}.pdf`,
  };
}

export default function AttendanceReportsView({ shopParams, branchId, branches, t, error }) {
  const [reportType, setReportType] = useState('daily'); // 'daily' | 'monthly' | 'range'

  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(monthStr());
  const [rangeFrom, setRangeFrom] = useState(firstOfMonth(monthStr()));
  const [rangeTo, setRangeTo] = useState(todayStr());

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  // Tagged with the reportType it was fetched for, so a render never pairs a
  // grid-shaped response with <DailyReportTable> (or vice versa) even in the
  // one frame between switching tabs and the new fetch resolving — that
  // mismatch was crashing the render (report.totals undefined) and showing a
  // blank page. The previous report stays visible while a new one loads.
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);

  const fetchRoster = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const params = { ...shopParams() };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/attendance/employees', { params });
      setEmployees(data.employees || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setEmployeesLoading(false);
    }
  }, [shopParams, branchId, error, t]);

  useEffect(() => {
    fetchRoster();
    setSelectedIds([]); // scope changed (branch) — selection may no longer apply
  }, [fetchRoster]);

  const branchName = useMemo(() => branches.find(b => String(b.id) === String(branchId))?.name, [branches, branchId]);
  const employeeIdsParam = selectedIds.length ? selectedIds.join(',') : undefined;

  // Generates automatically whenever the report type, its date(s), branch or
  // employee selection change — no separate "Generate" click needed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        const params = { ...shopParams() };
        if (branchId) params.branch_id = branchId;
        if (employeeIdsParam) params.employee_ids = employeeIdsParam;

        let data;
        if (reportType === 'daily') {
          ({ data } = await api.get('/attendance/report/daily', { params: { ...params, date } }));
        } else {
          const from = reportType === 'monthly' ? firstOfMonth(month) : rangeFrom;
          const to = reportType === 'monthly' ? lastOfMonth(month) : rangeTo;
          if (reportType === 'range' && from > to) {
            if (!cancelled) error(t('invalidDateRange') || 'From date must not be after To date');
            return;
          }
          ({ data } = await api.get('/attendance/report/range', { params: { ...params, from, to } }));
        }
        if (!cancelled) setReport({ reportType, ...data });
      } catch (e) {
        if (!cancelled) error(e.response?.data?.message || t('toastErrorGeneric'));
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportType, date, month, rangeFrom, rangeTo, branchId, employeeIdsParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildFilters = () => {
    const list = [];
    if (report.reportType === 'daily') list.push({ label: t('date') || 'Date', value: report.date });
    else if (report.reportType === 'monthly') list.push({ label: t('month') || 'Month', value: report.from?.slice(0, 7) });
    else list.push({ label: t('from') || 'From', value: report.from }, { label: t('to') || 'To', value: report.to });
    if (branchName) list.push({ label: t('branchGodownLocation') || 'Branch', value: branchName });
    list.push({ label: t('selectEmployees') || 'Employees', value: employeeScopeLabel(selectedIds, employees, t) });
    return list;
  };

  const getReport = () => {
    if (!report) return null;
    const filters = buildFilters();
    if (report.reportType === 'daily') return buildDailyReportModel(report, t, filters);
    if (report.reportType === 'monthly') return buildGridReportModel(report, t, filters, 'monthlyAttendanceReport', 'Monthly Attendance Report', 'monthly-attendance');
    return buildGridReportModel(report, t, filters, 'rangeAttendanceReport', 'Date Range Attendance Report', 'range-attendance');
  };

  const handleExcel = async (model) => {
    if (!model || !model.columns) return;
    await exportReportXlsx({ ...model, filename: model.filename?.replace(/\.pdf$/i, '.xlsx') });
  };

  const refresh = () => {
    // Nudging a value the fetch effect already depends on re-fires it —
    // simplest way to offer a manual refresh without a second data path.
    setSelectedIds(ids => [...ids]);
    fetchRoster();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-3 flex flex-nowrap items-center gap-3 overflow-x-auto">
        <div className="flex gap-2 flex-shrink-0">
          {[
            { key: 'daily', label: t('dailyReport') || 'Daily' },
            { key: 'monthly', label: t('monthlyReport') || 'Monthly' },
            { key: 'range', label: t('rangeReport') || 'Date Range' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setReportType(opt.key)}
              className={reportType === opt.key ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px self-stretch flex-shrink-0" style={{ background: 'var(--border-subtle)' }} />

        {reportType === 'daily' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('date') || 'Date'}</span>
            <input className="input" type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
          </div>
        )}
        {reportType === 'monthly' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('month') || 'Month'}</span>
            <input className="input" type="month" value={month} max={monthStr()} onChange={e => setMonth(e.target.value)} />
          </div>
        )}
        {reportType === 'range' && (
          <>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('from') || 'From'}</span>
              <input className="input" type="date" value={rangeFrom} max={todayStr()} onChange={e => setRangeFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('to') || 'To'}</span>
              <input className="input" type="date" value={rangeTo} max={todayStr()} onChange={e => setRangeTo(e.target.value)} />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('selectEmployees') || 'Employees'}</span>
          <EmployeeMultiSelect employees={employees} selectedIds={selectedIds} onChange={setSelectedIds} loading={employeesLoading} />
        </div>

        <button
          type="button"
          className="icon-btn ml-auto flex-shrink-0"
          title={t('refresh') || 'Refresh'}
          disabled={generating}
          onClick={refresh}
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {report && (
        <>
          <div className="flex justify-end">
            <ReportActions getReport={getReport} onExcel={handleExcel} />
          </div>
          {report.reportType === 'daily' ? (
            <DailyReportTable report={report} t={t} />
          ) : (
            <AttendanceGridTable report={report} t={t} />
          )}
        </>
      )}

      {!report && generating && (
        <div className="glass-card p-8 text-center text-sm flex items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('loading') || 'Loading...'}
        </div>
      )}

      {!report && !generating && (
        <div className="glass-card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('noAttendanceData') || 'No data for the selected filters.'}
        </div>
      )}
    </div>
  );
}
