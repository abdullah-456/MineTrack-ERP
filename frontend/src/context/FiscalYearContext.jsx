import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';
import { useShopApi } from '../hooks/useShopApi';

const FiscalYearContext = createContext(null);

const DISMISS_KEY = 'esms_fy_close_dismissed';

export function FiscalYearProvider({ children }) {
  const { user } = useAuth();
  const { shopParams } = useShopApi();
  const [fiscalYears, setFiscalYears] = useState([]);
  const [currentFY, setCurrentFY] = useState(null);
  const [closeTargetFY, setCloseTargetFY] = useState(null);
  const [viewFY, setViewFY] = useState(null);
  const [yearEndPrompt, setYearEndPrompt] = useState(false);
  const [yearEndOverdue, setYearEndOverdue] = useState(false);
  const [yearEndApproaching, setYearEndApproaching] = useState(false);
  const [daysUntilEnd, setDaysUntilEnd] = useState(null);
  const [canClose, setCanClose] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dismissTick, setDismissTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || user.role === 'super_admin') {
      setLoading(false);
      return;
    }
    try {
      const params = shopParams();
      const [currentRes, listRes] = await Promise.all([
        api.get('/fiscal-years/current', { params }),
        api.get('/fiscal-years', { params }),
      ]);
      const fy = currentRes.data.fiscal_year;
      const years = listRes.data.fiscal_years || [];
      setCurrentFY(fy);
      setCloseTargetFY(currentRes.data.close_target_fiscal_year || fy);
      setFiscalYears(years);
      setYearEndPrompt(!!currentRes.data.year_end_prompt);
      setYearEndOverdue(!!currentRes.data.year_end_overdue);
      setYearEndApproaching(!!currentRes.data.year_end_approaching);
      setDaysUntilEnd(currentRes.data.days_until_end ?? null);
      setCanClose(!!currentRes.data.can_close);
      setViewFY(prev => {
        if (!prev) return fy;
        const stillExists = years.find(y => y.id === prev.id);
        return stillExists || fy;
      });
    } catch {
      setFiscalYears([]);
      setCurrentFY(null);
      setCloseTargetFY(null);
      setYearEndPrompt(false);
    } finally {
      setLoading(false);
    }
  }, [user, shopParams]);

  useEffect(() => { refresh(); }, [refresh]);

  // Only a CLOSED year is read-only. An earlier year that is still open stays
  // writable on purpose: that is how a business moving off manual books enters
  // its history — switch to last year and record it there. Treating every
  // non-current year as read-only blocked exactly that.
  const isReadOnly = useMemo(() => viewFY?.status === 'closed', [viewFY]);

  // The date a new entry should default to: today while the current year is
  // selected, otherwise the end of the year being viewed, so entering a year of
  // history doesn't mean typing the date on every single record.
  const defaultEntryDate = useMemo(() => {
    if (!viewFY) return null;
    const today = new Date().toISOString().slice(0, 10);
    if (viewFY.id === currentFY?.id) return today;
    return today > viewFY.end_date ? viewFY.end_date : today;
  }, [viewFY, currentFY]);

  // Dates a report should default to for the year being viewed.
  //
  //   asOf — position reports (trial balance, balance sheet)
  //   from/to — period reports (P&L, cash flow, equity)
  //
  // Both ends are clamped to today, which matters at each edge. A PAST year —
  // open or closed, it makes no difference — reports as at its own year end, so
  // selecting FY 2025-26 states the position on 30 June 2026 rather than
  // whatever the current year happens to end on. The CURRENT year reports as at
  // today instead of its end date, because "as of 30/06/2027" while it is still
  // 2026 reads as a forecast; the figures are identical either way, since a
  // future-dated entry can't be posted.
  const reportDates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (!viewFY) return { asOf: today, from: null, to: today };
    const to = today < viewFY.end_date ? today : viewFY.end_date;
    return { asOf: to, from: viewFY.start_date, to };
  }, [viewFY]);

  const listParams = useMemo(() => {
    if (!viewFY) return {};
    if (viewFY.id === currentFY?.id) return {};
    return { fiscal_year_id: viewFY.id };
  }, [viewFY, currentFY]);

  const isCloseDismissed = useCallback(() => {
    const target = closeTargetFY || currentFY;
    if (!target) return true;
    return localStorage.getItem(`${DISMISS_KEY}_${target.id}`) === '1';
  }, [closeTargetFY, currentFY, dismissTick]);

  const dismissClosePrompt = useCallback(() => {
    const target = closeTargetFY || currentFY;
    if (target) localStorage.setItem(`${DISMISS_KEY}_${target.id}`, '1');
    setDismissTick(t => t + 1);
  }, [closeTargetFY, currentFY]);

  const value = useMemo(() => ({
    fiscalYears,
    currentFY,
    closeTargetFY,
    viewFY,
    setViewFY,
    isReadOnly,
    defaultEntryDate,
    reportDates,
    yearEndPrompt,
    yearEndOverdue,
    yearEndApproaching,
    daysUntilEnd,
    canClose,
    loading,
    refresh,
    listParams,
    isCloseDismissed,
    dismissClosePrompt,
    // legacy alias
    yearEndDue: yearEndPrompt,
  }), [
    fiscalYears, currentFY, closeTargetFY, viewFY, isReadOnly, defaultEntryDate, reportDates,
    yearEndPrompt, yearEndOverdue, yearEndApproaching, daysUntilEnd, canClose,
    loading, refresh, listParams, isCloseDismissed, dismissClosePrompt,
  ]);

  return (
    <FiscalYearContext.Provider value={value}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) throw new Error('useFiscalYear must be used within FiscalYearProvider');
  return ctx;
}

export default FiscalYearContext;
