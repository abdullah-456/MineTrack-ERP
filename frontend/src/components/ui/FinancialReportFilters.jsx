import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useShopApi } from '../../hooks/useShopApi';
import api from '../../api/axios';
import { linkedBranchIds } from '../../utils/locationUtils';

/**
 * Shared date + location (branch/godown) filters for financial reports.
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
  // Module-specific "narrow to one X" filter — e.g. Customer on Sales,
  // Supplier on Purchases. Only rendered when entityOptions is given, so
  // pages that don't need one (this component is shared across every report)
  // are completely unaffected.
  entityLabel,
  entityValue = '',
  entityOptions,
  onEntityChange,
}) {
  const { t } = useTheme();
  const { shopParams, shopReady } = useShopApi();
  const [godowns, setGodowns] = useState([]);

  useEffect(() => {
    if (!shopReady) return undefined;
    let unmounted = false;
    api.get('/godowns', { params: shopParams() })
      .then(({ data }) => {
        if (!unmounted) setGodowns(data.godowns || []);
      })
      .catch(() => {});
    return () => { unmounted = true; };
  }, [shopParams, shopReady]);

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
      {(branches.length > 0 || godowns.length > 0) && (
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{t('branchGodownLocation')}</span>
          <select className="input text-xs" value={branchId} onChange={e => onBranchChange?.(e.target.value)}>
            <option value="">{t('allLocations') || t('allBranches') || 'All Locations'}</option>
            {branches.length > 0 && (
              <optgroup label={t('branches') || 'Retail Branches'}>
                {branches.map(b => (
                  <option key={`br_${b.id}`} value={b.id}>
                    {b.name} {b.is_default ? `(${t('default') || 'Default'})` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {godowns.length > 0 && (
              <optgroup label={t('godowns') || 'Godowns / Warehouses'}>
                {godowns.map(g => {
                  const linked = linkedBranchIds(g, branches);
                  const targetBranchId = linked[0] || '';
                  return (
                    <option key={`gd_${g.id}`} value={targetBranchId} disabled={!linked.length}>
                      {g.name} {g.code ? `[${g.code}]` : ''}
                    </option>
                  );
                })}
              </optgroup>
            )}
          </select>
        </div>
      )}
      {entityOptions && (
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{entityLabel}</span>
          <select className="input text-xs" value={entityValue} onChange={e => onEntityChange?.(e.target.value)}>
            <option value="">{t('all') || 'All'} {entityLabel}</option>
            {entityOptions.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}
      {onRefresh && (
        <button type="button" onClick={onRefresh} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />{t('refresh') || 'Refresh'}
        </button>
      )}
    </div>
  );
}

export function buildReportFilterList({
  t, from, to, asOf, branchId, branches, mode = 'period',
  entityLabel, entityValue, entityOptions,
}) {
  const list = [];
  if (mode === 'period') {
    if (from) list.push({ label: t('from') || 'From', value: from });
    if (to) list.push({ label: t('to') || 'To', value: to });
  } else if (asOf) {
    list.push({ label: t('asOf') || 'As of', value: asOf });
  }
  if (branchId) {
    const branch = branches.find(b => String(b.id) === String(branchId));
    list.push({ label: t('location') || 'Location', value: branch?.name || branchId });
  }
  if (entityValue && entityOptions) {
    const opt = entityOptions.find(o => String(o.id) === String(entityValue));
    list.push({ label: entityLabel, value: opt?.name || entityValue });
  }
  return list;
}
