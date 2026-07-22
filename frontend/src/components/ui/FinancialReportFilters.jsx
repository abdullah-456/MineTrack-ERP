import { RefreshCw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Shared date + branch filters for financial reports.
 * mode: 'period' (from/to) | 'point' (as_of only)
 */
export default function FinancialReportFilters({
  mode = 'period',
  from,
  to,
  asOf,
  branchId = '',
  branches = [],
  onFromChange,
  onToChange,
  onAsOfChange,
  onBranchChange,
  onRefresh,
}) {
  const { t } = useTheme();

  return (
    <div className="glass-card p-4 flex flex-wrap gap-4 items-end">
      {mode === 'period' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('from') || 'From'}</span>
            <input className="input" type="date" value={from} onChange={e => onFromChange?.(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('to') || 'To'}</span>
            <input className="input" type="date" value={to} onChange={e => onToChange?.(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('asOf') || 'As of'}</span>
          <input className="input" type="date" value={asOf} onChange={e => onAsOfChange?.(e.target.value)} />
        </div>
      )}
      {branches.length > 0 && (
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('userBranch') || 'Branch'}</span>
          <select className="input" value={branchId} onChange={e => onBranchChange?.(e.target.value)}>
            <option value="">{t('allBranches') || 'All Branches'}</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      <button type="button" onClick={onRefresh} className="btn-secondary flex items-center gap-2">
        <RefreshCw className="w-4 h-4" />{t('refresh') || 'Refresh'}
      </button>
    </div>
  );
}

export function buildReportFilterList({ t, from, to, asOf, branchId, branches, mode = 'period' }) {
  const list = [];
  if (mode === 'period') {
    if (from) list.push({ label: t('from') || 'From', value: from });
    if (to) list.push({ label: t('to') || 'To', value: to });
  } else if (asOf) {
    list.push({ label: t('asOf') || 'As of', value: asOf });
  }
  if (branchId) {
    const branch = branches.find(b => String(b.id) === String(branchId));
    list.push({ label: t('userBranch') || 'Branch', value: branch?.name || branchId });
  }
  return list;
}
