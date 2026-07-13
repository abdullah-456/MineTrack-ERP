import { Filter, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Compact, reusable filter bar: a date range plus any number of dropdown
// filters (e.g. person, category). Fully controlled — the parent holds the
// filter state and does the actual row filtering, then passes the filtered
// rows to <ReportActions/>.
//
// props:
//   value:    { from, to, ...selectValues }
//   onChange: (key, value) => void
//   selects:  [{ key, label, options: [{ value, label }] }]
//   showDates: default true
export default function ReportFilters({ value = {}, onChange, selects = [], showDates = true, onClear }) {
  const { t } = useTheme();
  const set = (k) => (e) => onChange(k, e.target.value);
  const hasAny = (value.from || value.to || selects.some(s => value[s.key]));

  return (
    <div className="flex flex-wrap items-end gap-2">
      {showDates && (
        <>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('fromDate') || 'From'}</label>
            <input type="date" className="input h-9 text-sm" value={value.from || ''} onChange={set('from')} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('toDate') || 'To'}</label>
            <input type="date" className="input h-9 text-sm" value={value.to || ''} onChange={set('to')} />
          </div>
        </>
      )}
      {selects.map(s => (
        <div key={s.key}>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>{s.label}</label>
          <select className="input h-9 text-sm" value={value[s.key] || ''} onChange={set(s.key)}>
            <option value="">{t('all') || 'All'}</option>
            {s.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ))}
      {hasAny && (
        <button type="button" onClick={onClear} className="btn-secondary h-9 flex items-center gap-1 text-sm" title={t('clearFilters') || 'Clear filters'}>
          <X className="w-3.5 h-3.5" /> {t('clear') || 'Clear'}
        </button>
      )}
      <span className="flex items-center gap-1 text-[11px] ms-1" style={{ color: 'var(--text-faint)' }}>
        <Filter className="w-3 h-3" /> {t('filters') || 'Filters'}
      </span>
    </div>
  );
}

// Helper: filter an array of rows by a date field within [from, to] (inclusive).
export function filterByDate(rows, dateKey, from, to) {
  if (!from && !to) return rows;
  const fromT = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
  const toT = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
  return rows.filter(r => {
    const v = r[dateKey];
    if (!v) return false;
    const t = new Date(v).getTime();
    return t >= fromT && t <= toT;
  });
}

// Build the filters array (for the printed header) from the active filter state.
export function activeFilterList(value = {}, selects = [], extra = []) {
  const list = [];
  if (value.from) list.push({ label: 'From', value: value.from });
  if (value.to) list.push({ label: 'To', value: value.to });
  selects.forEach(s => {
    if (value[s.key]) {
      const opt = s.options.find(o => String(o.value) === String(value[s.key]));
      list.push({ label: s.label, value: opt ? opt.label : value[s.key] });
    }
  });
  return [...list, ...extra];
}
