import { useTheme } from '../../context/ThemeContext';
import { formatQty } from '../../hooks/useShopApi';

export default function StatusBadge({ status }) {
  const { t } = useTheme();

  const classMap = {
    active:     'badge-green',
    disabled:   'badge-red',
    suspended:  'badge-yellow',
    terminated: 'badge-red',
    completed:  'badge-green',
    held:       'badge-yellow',
    cancelled:  'badge-red',
    pending:    'badge-yellow',
    overdue:    'badge-red',
    paid:       'badge-green',
    unpaid:     'badge-red',
    closed:     'badge-green',
    partial:    'badge-yellow',
    void:       'badge-red',
  };

  const labelMap = {
    active:     t('active') || t('activePlan') || 'Active',
    disabled:   t('disabled') || 'Disabled',
    suspended:  t('suspended') || 'Suspended',
    terminated: t('terminated') || 'Terminated',
    completed:  t('completed') || 'Completed',
    held:       t('held') || 'Held',
    cancelled:  t('cancelled') || 'Cancelled',
    pending:    t('pending') || 'Pending',
    overdue:    t('overdue') || 'Overdue',
    paid:       t('paid') || 'Paid',
    unpaid:     t('unpaid') || 'Unpaid',
    closed:     t('closedPlan') || 'Completed',
    partial:    t('partial') || 'Partial',
    void:       t('void') || 'Void',
  };

  const normalized = (status || '').toLowerCase();
  const label = labelMap[normalized] || status;
  const className = classMap[normalized] || 'badge-blue';

  return <span className={`badge ${className}`}>{label}</span>;
}

export function StockBadge({ qty, reorder = 5 }) {
  const { t } = useTheme();
  const unit = t('kg') || 'kg';
  if (qty === 0) return <span className="badge badge-red">{formatQty(qty)} {unit}</span>;
  if (qty <= reorder) return <span className="badge badge-yellow">{formatQty(qty)} {unit}</span>;
  return <span className="badge badge-green">{formatQty(qty)} {unit}</span>;
}
