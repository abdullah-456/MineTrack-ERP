// Real .xlsx export (ExcelJS) — for reports that need a genuine binary
// spreadsheet rather than the app-wide CSV-with-BOM "Excel export" convention
// in reportExport.js (e.g. a wide attendance grid, where real spreadsheet
// column/cell handling matters more than it does for a simple list).
//
// Imported from the browser bundle specifically — plain `exceljs` pulls in
// Node core modules (stream/buffer) that Vite doesn't polyfill by default.
import ExcelJS from 'exceljs/dist/exceljs.min.js';

const asText = (v) => (v === null || v === undefined ? '' : String(v));
const cellAlign = (col) => col.align || (col.money || col.qty ? 'right' : 'left');

function cellValue(col, row) {
  const v = col.render ? col.render(row) : row[col.key];
  return v === null || v === undefined ? '' : v;
}

const THIN_BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

// Shares the same columns/rows/totals shape reportExport.js's PDF/print
// engine uses — columns: [{ header, key, align?, money?, qty?, render?(row),
// width?, fill?(row) => hex }] — so callers build one report model and hand
// it to both engines. `fill(row)` lets a cell (e.g. an attendance P/A/L day
// cell) get a colored background matching the on-screen status color.
export async function exportReportXlsx({ company = {}, title, meta = [], filters = [], columns = [], rows = [], totals, filename }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name || 'Mine Track ERP';
  wb.created = new Date();

  const safeSheetName = (title || 'Report').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Report';
  const ws = wb.addWorksheet(safeSheetName);

  let r = 1;
  const lastCol = Math.max(columns.length, 1);

  const addMergedLine = (text, size = 11) => {
    ws.mergeCells(r, 1, r, lastCol);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { bold: true, size };
    cell.alignment = { horizontal: 'center' };
    r += 1;
  };

  if (company.name) addMergedLine(company.name, 14);
  addMergedLine(title || 'Report', 12);
  const metaLine = [`Generated: ${new Date().toLocaleString('en-PK')}`, ...meta].filter(Boolean).join('   ');
  if (metaLine) addMergedLine(metaLine, 9);
  if (filters?.length) addMergedLine(filters.map(f => `${f.label}: ${f.value}`).join('   '), 9);
  r += 1; // blank spacer row

  // wrapText: false everywhere — a narrow column should clip or overflow, not
  // stack short header text (e.g. a day-of-month "01") into two lines.
  columns.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = asText(c.header);
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F4' } };
    cell.alignment = { horizontal: cellAlign(c), vertical: 'middle', wrapText: false };
    cell.border = THIN_BORDER;
  });
  ws.getRow(r).height = 18;
  r += 1;

  rows.forEach(row => {
    columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      const v = cellValue(c, row);
      if (c.money || c.qty) {
        const num = parseFloat(v);
        cell.value = Number.isNaN(num) ? '' : num;
        cell.numFmt = c.money ? '#,##0' : '#,##0.0';
      } else {
        cell.value = asText(v);
      }
      cell.alignment = { horizontal: cellAlign(c), vertical: 'middle', wrapText: false };
      cell.border = THIN_BORDER;
      const fillHex = c.fill ? c.fill(row) : null;
      if (fillHex) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fillHex}` } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      }
    });
    r += 1;
  });

  if (totals) {
    columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      if (i === 0 && totals.__label !== undefined) {
        cell.value = totals.__label || 'Total';
      } else if (totals[c.key] !== undefined) {
        cell.value = c.money || c.qty ? (parseFloat(totals[c.key]) || 0) : asText(totals[c.key]);
      }
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border = THIN_BORDER;
    });
    r += 1;
  }

  // Prefer an explicit excelWidth per column (set by the report model) over
  // the PDF engine's relative `width` weight — the two engines size columns
  // very differently (proportional mm vs. character count), so reusing the
  // PDF weight directly produced columns too narrow to hold their own header.
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.excelWidth || Math.max(10, (c.width || 1) * 8);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const base = (filename || `${(title || 'report').toLowerCase().replace(/\s+/g, '-')}.xlsx`).replace(/\.(pdf|csv)$/i, '.xlsx');
  const fname = base.endsWith('.xlsx') ? base : `${base}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
