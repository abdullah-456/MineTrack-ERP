import { UserCheck, UserX, CalendarOff, HelpCircle, Users } from 'lucide-react';
import { STATUS_META } from '../../utils/attendanceStatus';

const TOTAL_TONE = { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', fg: 'rgb(99,102,241)' };
const UNMARKED_TONE = { bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)', fg: 'rgb(100,116,139)' };
const TONE_BY_STATUS = {
  present: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', fg: 'rgb(16,185,129)' },
  absent:  { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)',  fg: 'rgb(239,68,68)' },
  leave:   { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', fg: 'rgb(245,158,11)' },
};

// Daily Attendance Report: totals + a Present/Absent/Leave list for one date.
export default function DailyReportTable({ report, t }) {
  if (!report) return null;
  const { totals, employees } = report;

  const pills = [
    { label: t('totalEmployees') || 'Total Employees', value: totals.total_employees, icon: Users, tone: TOTAL_TONE },
    { label: t('present') || 'Present', value: totals.present, icon: UserCheck, tone: TONE_BY_STATUS.present },
    { label: t('absent') || 'Absent', value: totals.absent, icon: UserX, tone: TONE_BY_STATUS.absent },
    { label: t('leave') || 'Leave', value: totals.leave, icon: CalendarOff, tone: TONE_BY_STATUS.leave },
    { label: t('unmarked') || 'Unmarked', value: totals.unmarked, icon: HelpCircle, tone: UNMARKED_TONE },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {pills.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.fg }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}: {value}
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>{t('employmentId') || 'Employment ID'}</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>{t('name') || 'Name'}</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>{t('designation') || 'Designation'}</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>{t('branchGodownLocation') || 'Branch'}</th>
              <th className="text-center px-4 py-2.5 font-semibold" style={{ color: 'var(--text-muted)' }}>{t('status') || 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-muted)' }}>{t('noEmployees') || 'No employees found'}</td></tr>
            ) : employees.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="px-4 py-2.5">{e.employment_id}</td>
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{e.name}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{e.designation}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{e.branch?.name || '—'}</td>
                <td className="px-4 py-2.5 text-center">
                  {e.status ? (
                    <span className={`badge ${STATUS_META[e.status]?.badge}`}>
                      {t(STATUS_META[e.status]?.labelKey) || STATUS_META[e.status]?.fallback}
                    </span>
                  ) : (
                    <span className="badge" style={{ background: UNMARKED_TONE.bg, color: UNMARKED_TONE.fg, border: `1px solid ${UNMARKED_TONE.border}` }}>
                      {t('unmarked') || 'Unmarked'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
