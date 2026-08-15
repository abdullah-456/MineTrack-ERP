import { useState } from 'react';
import { Printer, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useShopApi } from '../../hooks/useShopApi';
import { useTheme } from '../../context/ThemeContext';
import Modal from './Modal';
import {
  getCompany, printReport, downloadReportPDF, downloadReportExcel,
  printDetail, downloadDetailPDF, downloadDetailExcel,
} from '../../utils/reportExport';
import { exportReportXlsx, exportDetailXlsx } from '../../utils/xlsxExport';

// Stable identity for a column across renders. Columns are frequently defined
// with only a `render` and no `key` (see the attendance grid's day columns), so
// falling back to the header — and finally to position — is what keeps the
// picker's checked set pointing at the same columns after a re-render.
const columnId = (col, i) => col.key || col.header || `col_${i}`;

// Drop-in Print + Download-PDF + Download-Excel toolbar for any module.
//
// `columnPicker` is opt-in and defaults OFF: this component is used on nearly
// every list page, and turning the picker on globally would put an extra modal
// in front of every existing export for the sake of the one or two pages that
// asked for it.
export default function ReportActions({
  title, subtitle, columns, rows = [], totals, note, filters, signature, filename,
  getReport, label = true, className = '', groupKey, orientation,
  // Optional override for the Excel button — e.g. a real .xlsx writer instead
  // of the default CSV-with-BOM export. Receives the built report model.
  onExcel,
  columnPicker = false,
}) {
  const { shopParams } = useShopApi();
  const { t } = useTheme();
  const [busy, setBusy] = useState(null);
  // { mode, model, ids } while the picker is open — the model is built once,
  // up front, so the columns shown for picking are exactly the ones that will
  // be exported.
  const [picking, setPicking] = useState(null);

  const buildModel = () => {
    if (getReport) return getReport() || {};
    return {
      kind: 'list', title, subtitle, columns, rows, totals, note, filters,
      signature, filename, groupKey, orientation,
    };
  };

  const isExportable = (model) =>
    model && (model.columns || model.sections || model.tables || model.table);

  // Excel means a real .xlsx workbook — numbers as numbers, accounting number
  // formats, frozen headers, print setup. The CSV writers stay as a fallback so
  // a failure in the spreadsheet writer still hands the user their data rather
  // than a silent no-op.
  const exportExcel = async (model, payload) => {
    const isDoc = model.kind === 'detail' || model.kind === 'document';
    try {
      if (isDoc) await exportDetailXlsx(payload);
      else await exportReportXlsx(payload);
    } catch (e) {
      console.error('xlsx export failed, falling back to CSV', e);
      if (isDoc) downloadDetailExcel(payload);
      else downloadReportExcel(payload);
    }
  };

  const exportModel = async (mode, model) => {
    const company = await getCompany(shopParams());
    const payload = { company, ...model };
    if (mode === 'excel') {
      if (onExcel) await onExcel(payload);
      else await exportExcel(model, payload);
    } else if (model.kind === 'detail' || model.kind === 'document') {
      if (mode === 'print') printDetail(payload);
      else downloadDetailPDF(payload);
    } else {
      if (mode === 'print') printReport(payload);
      else downloadReportPDF(payload);
    }
  };

  const run = async (mode) => {
    setBusy(mode);
    try {
      const model = await Promise.resolve(buildModel());
      if (!isExportable(model)) return;

      // Only list-shaped models have a single flat column set to pick from;
      // a multi-section document has several tables and no one list to filter.
      if (columnPicker && Array.isArray(model.columns) && model.columns.length) {
        setPicking({
          mode,
          model,
          // Defaults to every column checked, so the picker never changes what
          // an export contains unless the user actually unchecks something.
          ids: model.columns.map(columnId),
        });
        return;
      }
      await exportModel(mode, model);
    } catch (e) {
      console.error('report export failed', e);
    } finally {
      setTimeout(() => setBusy(null), 600);
    }
  };

  const confirmPick = async () => {
    const { mode, model, ids } = picking;
    const chosen = new Set(ids);
    setPicking(null);
    setBusy(mode);
    try {
      await exportModel(mode, {
        ...model,
        columns: model.columns.filter((c, i) => chosen.has(columnId(c, i))),
      });
    } catch (e) {
      console.error('report export failed', e);
    } finally {
      setTimeout(() => setBusy(null), 600);
    }
  };

  const toggleId = (id) => setPicking(p => ({
    ...p,
    ids: p.ids.includes(id) ? p.ids.filter(x => x !== id) : [...p.ids, id],
  }));

  return (
    <>
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

      {picking && (
        <Modal title={t('chooseColumns') || 'Choose columns to include'} onClose={() => { setPicking(null); setBusy(null); }}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button" className="btn-secondary text-xs"
                onClick={() => setPicking(p => ({ ...p, ids: p.model.columns.map(columnId) }))}
              >
                {t('selectAll') || 'Select All'}
              </button>
              <button
                type="button" className="btn-secondary text-xs"
                onClick={() => setPicking(p => ({ ...p, ids: [] }))}
              >
                {t('clearAll') || 'Clear All'}
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 pe-1">
              {picking.model.columns.map((c, i) => {
                const id = columnId(c, i);
                return (
                  <label key={id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={picking.ids.includes(id)} onChange={() => toggleId(id)} />
                    {c.header || id}
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" className="btn-secondary flex-1" onClick={() => { setPicking(null); setBusy(null); }}>
                {t('cancel') || 'Cancel'}
              </button>
              <button
                type="button" className="btn-primary flex-1"
                disabled={!picking.ids.length}
                onClick={confirmPick}
              >
                {t('export') || 'Export'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
