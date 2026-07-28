import { useCallback, useEffect, useRef } from 'react';

/**
 * Syncs an open overlay with browser history so Back closes it instead of
 * leaving the page. Use from shared Modal (or any custom overlay) while mounted.
 *
 * New overlays should use history-aware Modal (or this hook) so Back closes them.
 *
 * @param {() => void} onClose
 * @param {{ enabled?: boolean, armDelayMs?: number }} [options]
 * @returns {() => void} requestClose
 */
export function useHistoryModal(onClose, { enabled = true, armDelayMs = 400 } = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = useRef(false);
  /** Blocks dismiss until after the opening gesture fully finishes */
  const armedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    armedRef.current = false;

    if (!enabled) {
      armedRef.current = true;
      return undefined;
    }

    let removePop = null;

    const armTimer = window.setTimeout(() => {
      if (closedRef.current) return;
      armedRef.current = true;

      const prev =
        window.history.state && typeof window.history.state === 'object'
          ? { ...window.history.state }
          : {};
      window.history.pushState({ ...prev, __esmsModal: 1 }, '');

      const onPopState = () => {
        if (closedRef.current) return;
        closedRef.current = true;
        onCloseRef.current?.();
      };
      window.addEventListener('popstate', onPopState);
      removePop = () => window.removeEventListener('popstate', onPopState);
    }, armDelayMs);

    return () => {
      window.clearTimeout(armTimer);
      if (removePop) removePop();
    };
  }, [enabled, armDelayMs]);

  const requestClose = useCallback(() => {
    if (!armedRef.current) return;
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current?.();
  }, []);

  return requestClose;
}

export default useHistoryModal;
