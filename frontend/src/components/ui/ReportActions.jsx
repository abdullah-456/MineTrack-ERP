import { useState } from 'react';
import { Printer, Download, Loader2 } from 'lucide-react';
import { useShopApi } from '../../hooks/useShopApi';
import { useTheme } from '../../context/ThemeContext';
import {
  getCompany, printReport, downloadReportPDF, printDetail, downloadDetailPDF,
} from '../../utils/reportExport';

// Drop-in Print + Download-PDF toolbar for any module.
//
// List mode (default): pass { title, columns, rows, totals?, filters?, signature? }.
//   `rows` should already be the filtered set on screen — clear filters to print
//   everything. `columns` = [{ header, key, align?, money?, render?(row), width? }].
//
// Detail mode: pass `getReport={() => ({ kind: 'detail', title, sections, table?, signature? })}`
//   to print the currently-selected record with all its fields.
export default function ReportActions({
  title, columns, rows = [], totals, filters, signature, filename,
  getReport, label = true, className = '', groupKey,
}) {
  const { shopParams } = useShopApi();
  const { t } = useTheme();
  const [busy, setBusy] = useState(null);

  const buildModel = () => {
    if (getReport) return getReport() || {};
    return { kind: 'list', title, columns, rows, totals, filters, signature, filename, groupKey };
  };

  const run = async (mode) => {
    setBusy(mode);
    try {
      const company = await getCompany(shopParams());
      const model = buildModel();
      const payload = { company, ...model };
      if (model.kind === 'detail') {
        if (mode === 'print') printDetail(payload);
        else downloadDetailPDF(payload);
      } else {
        if (mode === 'print') printReport(payload);
        else downloadReportPDF(payload);
      }
    } catch (e) {
      console.error('report export failed', e);
    } finally {
      setTimeout(() => setBusy(null), 600);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button" onClick={() => run('print')} disabled={!!busy}
        className="btn-secondary flex items-center gap-1.5 text-sm" title={t('print') || 'Print'}
      >
        {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        {label && <span>{t('print') || 'Print'}</span>}
      </button>
      <button
        type="button" onClick={() => run('pdf')} disabled={!!busy}
        className="btn-secondary flex items-center gap-1.5 text-sm" title={t('downloadPdf') || 'Download PDF'}
      >
        {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {label && <span>PDF</span>}
      </button>
    </div>
  );
}
