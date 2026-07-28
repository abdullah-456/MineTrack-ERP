import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Drive a multi-step wizard from a URL search param so browser Back/Forward
 * move between steps. New multi-step UI should use this hook.
 *
 * Preserves location.state so it can nest with useHistoryModal.
 *
 * @param {string[]} stepIds - ordered step keys (e.g. ['personal','contact'])
 * @param {{ paramName?: string, enabled?: boolean }} [options]
 */
export function useWizardSteps(stepIds, { paramName = 'step', enabled = true } = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const ids = useMemo(
    () => (Array.isArray(stepIds) && stepIds.length ? stepIds.map(String) : ['1']),
    // stepIds array identity: callers should pass a stable constant or memoized list
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.isArray(stepIds) ? stepIds.join('\0') : ''],
  );

  const raw = searchParams.get(paramName);
  const step = ids.includes(raw) ? raw : ids[0];
  const index = Math.max(0, ids.indexOf(step));

  const writeStep = useCallback((id, { replace = false } = {}) => {
    const next = new URLSearchParams(location.search);
    if (id == null) next.delete(paramName);
    else next.set(paramName, String(id));
    const search = next.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace, state: location.state },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate, paramName]);

  // Seed / repair URL with replace so Back from step 1 exits the flow
  useEffect(() => {
    if (!enabled) return;
    if (!raw || !ids.includes(raw)) {
      writeStep(ids[0], { replace: true });
    }
  }, [enabled, raw, ids, writeStep]);

  const goTo = useCallback((id, opts) => {
    const key = String(id);
    if (!ids.includes(key)) return;
    writeStep(key, opts);
  }, [ids, writeStep]);

  const goNext = useCallback(() => {
    if (index < ids.length - 1) goTo(ids[index + 1]);
  }, [goTo, ids, index]);

  const goPrev = useCallback(() => {
    if (index > 0) navigate(-1);
  }, [index, navigate]);

  const clearStepParam = useCallback(({ replace = true } = {}) => {
    writeStep(null, { replace });
  }, [writeStep]);

  return {
    step,
    index,
    stepIds: ids,
    isFirst: index <= 0,
    isLast: index >= ids.length - 1,
    goNext,
    goPrev,
    goTo,
    setStep: goTo,
    clearStepParam,
  };
}

export default useWizardSteps;
