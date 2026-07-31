import { useFiscalYear } from '../context/FiscalYearContext';

/**
 * Returns whether write actions (edit/delete/void/post) should be enabled.
 * When viewing a closed fiscal year, all writes are blocked.
 */
export function useFiscalYearGuard(_date) {
  const { isReadOnly, viewFY } = useFiscalYear();
  return {
    canWrite: !isReadOnly,
    isReadOnly,
    viewFY,
    readOnlyLabel: isReadOnly ? `${viewFY?.label || 'Closed year'} — read-only` : null,
  };
}

export default useFiscalYearGuard;
