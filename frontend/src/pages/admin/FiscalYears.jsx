import { useState } from 'react';
import { Calendar, Loader2, Lock, Unlock, FileBarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useFiscalYear } from '../../context/FiscalYearContext';
import PageHeader from '../../components/ui/PageHeader';
import YearEndCloseModal from '../../components/modals/YearEndCloseModal';

export default function FiscalYears() {
  const { t } = useTheme();
  const { fiscalYears, currentFY, canClose, yearEndPrompt, loading, setViewFY } = useFiscalYear();
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const navigate = useNavigate();

  // Sets the shared year selection (the same state the top-bar dropdown drives)
  // AND navigates, so the effect is visible immediately rather than a silent
  // state change on a page that has nowhere to show it.
  const viewPeriod = (fy) => {
    setViewFY(fy);
    navigate(`/reports/trial-balance?fiscal_year_id=${fy.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Calendar}
        accent="brand"
        title={t('fiscalYears') || 'Fiscal Years'}
        subtitle={t('fiscalYearsSub') || 'Manage year-end close and view historical periods'}
        action={
          yearEndPrompt && canClose ? (
            <button type="button" className="btn-primary" onClick={() => setCloseModalOpen(true)}>
              {t('initiateYearClose') || 'Initiate year-end close'}
            </button>
          ) : null
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>{t('label') || 'Label'}</th>
                <th>{t('period') || 'Period'}</th>
                <th>{t('status') || 'Status'}</th>
                <th>{t('closedAt') || 'Closed'}</th>
                <th>{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {fiscalYears.map(fy => (
                <tr key={fy.id}>
                  <td className="font-medium">
                    {fy.label}
                    {fy.id === currentFY?.id && (
                      <span className="badge badge-green ml-2 text-[10px]">{t('current') || 'Current'}</span>
                    )}
                  </td>
                  <td className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {fy.start_date} → {fy.end_date}
                  </td>
                  <td>
                    {fy.status === 'closed' ? (
                      <span className="badge badge-yellow flex items-center gap-1 w-fit">
                        <Lock className="w-3 h-3" /> {t('closed') || 'Closed'}
                      </span>
                    ) : (
                      <span className="badge badge-green flex items-center gap-1 w-fit">
                        <Unlock className="w-3 h-3" /> {t('open') || 'Open'}
                      </span>
                    )}
                  </td>
                  <td className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {fy.closed_at ? new Date(fy.closed_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      onClick={() => viewPeriod(fy)}
                    >
                      <FileBarChart2 className="w-3 h-3" /> {t('viewPeriod') || 'View period'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <YearEndCloseModal open={closeModalOpen} onClose={() => setCloseModalOpen(false)} />
    </div>
  );
}
