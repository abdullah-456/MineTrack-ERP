import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Loader2, Users } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Closes on a click outside either the trigger button or the portaled panel
// (they're no longer DOM-nested once the panel renders into document.body).
function useClickOutsideEither(refs, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (refs.some(r => r.current && r.current.contains(e.target))) return;
      handler(e);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [refs, handler]);
}

// Checkbox-list employee picker covering all three selection modes the
// attendance reports need with one control: none selected = "All Employees"
// (the report call omits employee_ids entirely), one selected = Individual,
// several = Multiple.
//
// The panel is rendered through a portal into document.body, positioned via
// fixed coordinates from the trigger's bounding box — the toolbar it lives in
// scrolls horizontally (overflow-x), and CSS forces overflow-y to clip too
// once overflow-x isn't `visible`, so an in-place absolutely-positioned panel
// was being cut off instead of floating over the page.
export default function EmployeeMultiSelect({ employees = [], selectedIds = [], onChange, loading }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  useClickOutsideEither([triggerRef, panelRef], () => setOpen(false));

  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 260) });
  };

  useLayoutEffect(() => { if (open) updateCoords(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onScrollOrResize = () => updateCoords();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.name?.toLowerCase().includes(q) || e.employment_id?.toLowerCase().includes(q));
  }, [employees, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = employees.length > 0 && selectedIds.length === employees.length;

  const toggleOne = (id) => {
    if (selectedSet.has(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };
  const toggleAll = () => {
    onChange(allSelected ? [] : employees.map(e => e.id));
  };

  const summary = selectedIds.length === 0
    ? (t('allEmployees') || 'All Employees')
    : selectedIds.length === 1
      ? (employees.find(e => e.id === selectedIds[0])?.name || (t('individualEmployee') || '1 Employee'))
      : `${selectedIds.length} ${t('employeesSelected') || 'employees selected'}`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input flex items-center justify-between gap-2 min-w-[220px] text-left"
        disabled={loading}
      >
        <span className="flex items-center gap-2 truncate">
          <Users className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="truncate">{summary}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          className="fixed rounded-xl shadow-2xl overflow-hidden z-[9999] min-w-[260px] max-w-[320px]"
          style={{ top: coords.top, left: coords.left, width: coords.width, background: 'var(--bg-surface)', border: '1px solid var(--border-input)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                className="input text-sm pl-8 py-1.5"
                placeholder={t('searchEmployees') || 'Search employees...'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <label className="dropdown-item cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="font-semibold">{t('allEmployees') || 'All Employees'}</span>
          </label>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{t('noEmployees') || 'No employees found'}</div>
            ) : filtered.map(e => (
              <label key={e.id} className="dropdown-item cursor-pointer">
                <input type="checkbox" checked={selectedSet.has(e.id)} onChange={() => toggleOne(e.id)} />
                <span className="truncate">{e.name}</span>
                {e.employment_id && <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{e.employment_id}</span>}
              </label>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
