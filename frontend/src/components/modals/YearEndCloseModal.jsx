import { useEffect, useState } from 'react';
import { Calendar, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import Modal from '../ui/Modal';
import api from '../../api/axios';
import { useShopApi } from '../../hooks/useShopApi';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { formatPKR } from '../../hooks/useShopApi';

export default function YearEndCloseModal({ open, onClose }) {
  const { t } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();
  const {
    closeTargetFY,
    yearEndOverdue,
    yearEndApproaching,
    daysUntilEnd,
    refresh,
    dismissClosePrompt,
  } = useFiscalYear();
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const targetFY = closeTargetFY;

  useEffect(() => {
    if (!open || !targetFY) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/fiscal-years/${targetFY.id}/pre-close-checklist`, { params: shopParams() })
      .then(({ data }) => { if (!cancelled) setChecklist(data); })
      .catch(() => { if (!cancelled) setChecklist(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, targetFY, shopParams]);

  const handleClose = async () => {
    if (!targetFY || !yearEndOverdue || !checklist?.can_close) return;
    setClosing(true);
    try {
      await api.post(`/fiscal-years/${targetFY.id}/close`, {}, { params: shopParams() });
      success(t('fyCloseSuccess') || 'Fiscal year closed successfully. A new year is now open.');
      dismissClosePrompt();
      await refresh();
      onClose?.();
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setClosing(false);
    }
  };

  const handleDismiss = () => {
    dismissClosePrompt();
    onClose?.();
  };

  if (!open || !targetFY) return null;

  const headline = yearEndOverdue
    ? `${targetFY.label} ended on ${targetFY.end_date}`
    : yearEndApproaching
      ? `${targetFY.label} ends on ${targetFY.end_date}${daysUntilEnd != null ? ` (${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'} left)` : ''}`
      : `${targetFY.label}`;

  return (
    <Modal open={open} onClose={handleDismiss} title={t('yearEndClose') || 'Year-End Close'} wide>
      <div className="space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <Calendar className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {headline}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {yearEndOverdue
                ? (t('yearEndCloseOverdueDesc') || 'This fiscal year is past its end date. Close it to lock records and carry balances forward.')
                : (t('yearEndCloseApproachingDesc') || 'Year-end is approaching. Review your trial balance and prepare to close when the period ends.')}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
        ) : checklist ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('totalDebit') || 'Total Debit'}</span>
                <p className="font-semibold">{formatPKR(checklist.trial_balance?.total_debit)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('totalCredit') || 'Total Credit'}</span>
                <p className="font-semibold">{formatPKR(checklist.trial_balance?.total_credit)}</p>
              </div>
            </div>

            {checklist.trial_balance?.is_balanced ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" /> {t('trialBalanceBalanced') || 'Trial balance is balanced'}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4" /> {t('trialBalanceUnbalanced') || 'Trial balance is not balanced — resolve before closing'}
              </div>
            )}

            {checklist.warnings?.length > 0 && (
              <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                {checklist.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" /> {w}
                  </li>
                ))}
              </ul>
            )}

            {yearEndOverdue && checklist.blocking_issues?.length > 0 && !checklist.can_close && (
              <ul className="text-sm text-red-400 space-y-1">
                {checklist.blocking_issues.map((issue, i) => <li key={i}>• {issue}</li>)}
              </ul>
            )}
          </>
        ) : null}

        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={handleDismiss}>
            <X className="w-4 h-4" /> {t('remindLater') || 'Remind me later'}
          </button>
          {yearEndOverdue && (
            <button
              type="button"
              className="btn-primary"
              disabled={!checklist?.can_close || closing}
              onClick={handleClose}
            >
              {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t('closeFiscalYear') || 'Close fiscal year'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
