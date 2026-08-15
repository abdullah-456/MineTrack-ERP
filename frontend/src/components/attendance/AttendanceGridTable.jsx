import { STATUS_META, enumerateDates } from '../../utils/attendanceStatus';

// Shared grid for the Monthly and Date Range reports: employee rows × date
// columns (P/A/L/H/S letters, blank = not marked) + summary columns.
export default function AttendanceGridTable({ report, t }) {
  if (!report) return null;
  const dates = enumerateDates(report.from, report.to);
  const spansMultipleMonths = dates.length > 0 && dates[0].slice(0, 7) !== dates[dates.length - 1].slice(0, 7);
  // Name + one per date + the five summary columns below.
  const colCount = dates.length + 7;

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 text-left px-3 py-2 font-semibold whitespace-nowrap"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                {t('employee') || 'Employee'}
              </th>
              {dates.map(d => (
                <th
                  key={d}
                  className="px-1.5 py-2 font-semibold text-center"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', minWidth: '28px' }}
                >
                  {spansMultipleMonths ? d.slice(5).replace('-', '/') : d.slice(8, 10)}
                </th>
              ))}
              <th className="px-2 py-2 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{t('totalPresentDays') || 'Present'}</th>
              <th className="px-2 py-2 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{t('totalAbsentDays') || 'Absent'}</th>
              <th className="px-2 py-2 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{t('totalLeaveDays') || 'Leave'}</th>
              <th className="px-2 py-2 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{t('halfDay') || 'Half Day'}</th>
              <th className="px-2 py-2 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{t('shortLeave') || 'Short Leave'}</th>
              <th className="px-2 py-2 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{t('attendancePercentage') || '%'}</th>
            </tr>
          </thead>
          <tbody>
            {report.employees.length === 0 ? (
              <tr><td colSpan={colCount} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>{t('noEmployees') || 'No employees found'}</td></tr>
            ) : report.employees.map(emp => (
              <tr key={emp.id}>
                <td
                  className="sticky left-0 z-10 px-3 py-1.5 whitespace-nowrap"
                  style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{emp.employment_id}</div>
                </td>
                {dates.map(d => {
                  const status = emp.days?.[d]?.status || null;
                  const meta = status ? STATUS_META[status] : null;
                  return (
                    <td key={d} className="text-center py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {meta ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded font-bold text-white" style={{ background: meta.cell }}>
                          {meta.letter}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center px-2 py-1.5 font-semibold" style={{ color: STATUS_META.present.cell, borderBottom: '1px solid var(--border-subtle)' }}>{emp.summary.present_days}</td>
                <td className="text-center px-2 py-1.5 font-semibold" style={{ color: STATUS_META.absent.cell, borderBottom: '1px solid var(--border-subtle)' }}>{emp.summary.absent_days}</td>
                <td className="text-center px-2 py-1.5 font-semibold" style={{ color: STATUS_META.leave.cell, borderBottom: '1px solid var(--border-subtle)' }}>{emp.summary.leave_days}</td>
                <td className="text-center px-2 py-1.5 font-semibold" style={{ color: STATUS_META.half_day.cell, borderBottom: '1px solid var(--border-subtle)' }}>{emp.summary.half_day_days ?? 0}</td>
                <td className="text-center px-2 py-1.5 font-semibold" style={{ color: STATUS_META.short_leave.cell, borderBottom: '1px solid var(--border-subtle)' }}>{emp.summary.short_leave_days ?? 0}</td>
                <td className="text-center px-2 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>{emp.summary.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
