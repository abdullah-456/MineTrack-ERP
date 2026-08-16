import { useTheme } from '../../context/ThemeContext';
import { formatQty } from '../../hooks/useShopApi';
import { humanize } from '../../utils/textFormat';

const CLASS_MAP = {
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

// Text-only version of the same label lookup, for report/export columns
// (which render outside React, as plain strings) — takes `t` as a parameter
// since it's called from page-level code that already has it in scope.
export function statusText(t, status) {
  const normalized = (status || '').toLowerCase();
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
  return labelMap[normalized] || humanize(status);
}

export default function StatusBadge({ status }) {
  const { t } = useTheme();
  const normalized = (status || '').toLowerCase();
  const label = statusText(t, status);
  const className = CLASS_MAP[normalized] || 'badge-blue';

  return <span className={`badge ${className}`}>{label}</span>;
}

export function StockBadge({ qty, reorder = 5 }) {
  const { t } = useTheme();
  const unit = t('kg') || 'kg';
  if (qty === 0) return <span className="badge badge-red">{formatQty(qty)} {unit}</span>;
  if (qty <= reorder) return <span className="badge badge-yellow">{formatQty(qty)} {unit}</span>;
  return <span className="badge badge-green">{formatQty(qty)} {unit}</span>;
}
