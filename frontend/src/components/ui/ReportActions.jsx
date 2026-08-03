import { useState } from 'react';
import { Printer, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useShopApi } from '../../hooks/useShopApi';
import { useTheme } from '../../context/ThemeContext';
import {
  getCompany, printReport, downloadReportPDF, downloadReportExcel,
  printDetail, downloadDetailPDF, downloadDetailExcel,
} from '../../utils/reportExport';

// Drop-in Print + Download-PDF + Download-Excel toolbar for any module.
export default function ReportActions({
  title, columns, rows = [], totals, filters, signature, filename,
  getReport, label = true, className = '', groupKey,
  // Optional override for the Excel button — e.g. a real .xlsx writer instead
  // of the default CSV-with-BOM export. Receives the built report model.
  onExcel,
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
      const model = await Promise.resolve(buildModel());
      if (!model || (!model.columns && !model.sections && !model.tables && !model.table)) {
        return;
      }
      const payload = { company, ...model };
      if (mode === 'excel' && onExcel) {
        await onExcel(payload);
      } else if (model.kind === 'detail' || model.kind === 'document') {
        if (mode === 'print') printDetail(payload);
        else if (mode === 'pdf') downloadDetailPDF(payload);
        else downloadDetailExcel(payload);
      } else {
        if (mode === 'print') printReport(payload);
        else if (mode === 'pdf') downloadReportPDF(payload);
        else downloadReportExcel(payload);
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
        {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-indigo-400" />}
        {label && <span>PDF</span>}
      </button>
      <button
        type="button" onClick={() => run('excel')} disabled={!!busy}
        className="btn-secondary flex items-center gap-1.5 text-sm hover:text-emerald-400" title={t('exportExcel') || 'Export Excel'}
      >
        {busy === 'excel' ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
        {label && <span>Excel</span>}
      </button>
    </div>
  );
}
