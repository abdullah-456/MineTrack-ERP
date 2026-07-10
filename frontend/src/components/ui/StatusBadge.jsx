import { useTheme } from '../../context/ThemeContext';

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
    closed:     'badge-green',
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
    closed:     t('closedPlan') || 'Completed',
  };

  const normalized = (status || '').toLowerCase();
  const label = labelMap[normalized] || status;
  const className = classMap[normalized] || 'badge-blue';

  return <span className={`badge ${className}`}>{label}</span>;
}

export function StockBadge({ qty, reorder = 5 }) {
  if (qty === 0) return <span className="badge badge-red">0</span>;
  if (qty <= reorder) return <span className="badge badge-yellow">{qty}</span>;
  return <span className="badge badge-green">{qty}</span>;
}
