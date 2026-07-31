import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Check, Lock } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useFiscalYear } from '../../context/FiscalYearContext';

function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler(e);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

export default function FiscalYearSelector() {
  const { t } = useTheme();
  const { fiscalYears, currentFY, viewFY, setViewFY, isReadOnly, loading } = useFiscalYear();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  if (loading || !currentFY || fiscalYears.length === 0) return null;

  const active = viewFY || currentFY;

  return (
    <div className="dropdown-wrap relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="topbar-btn flex items-center gap-1.5 max-w-[180px]"
        title={t('fiscalYear') || 'Fiscal Year'}
      >
        <Calendar className="w-4 h-4 flex-shrink-0" />
        <span className="text-xs font-semibold truncate hidden sm:block">{active.label}</span>
        {isReadOnly && <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="dropdown-menu min-w-[220px]">
          {fiscalYears.map(fy => {
            const isCurrent = fy.id === currentFY.id;
            const selected = fy.id === active.id;
            return (
              <div
                key={fy.id}
                className={`dropdown-item ${selected ? 'active' : ''}`}
                onClick={() => { setViewFY(fy); setOpen(false); }}
              >
                <span className="truncate">{fy.label}</span>
                <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>
                  {isCurrent ? (t('current') || 'Current') : fy.status === 'closed' ? (t('closed') || 'Closed') : ''}
                </span>
                {selected && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
