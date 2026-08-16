// Real .xlsx export (ExcelJS) — the app-wide "Export Excel" path.
//
// This used to be a CSV with a UTF-8 BOM renamed to look like a spreadsheet.
// It opened, but every figure arrived as quoted text: left-aligned, un-summable,
// un-chartable, and visibly not what anyone means by "export to Excel". A real
// workbook costs one dependency and gets numbers that are numbers, an accounting
// number format, frozen headers, and page setup that prints properly straight
// from Excel.
//
// Shares the report model used by the PDF/print engine in reportExport.js —
// columns: [{ header, key, align?, money?, qty?, numeric?, render?(row), width?,
// excelWidth?, fill?(row) => hex }] — including its row tags (__section,
// __total, __grand, __level, __spacer), so one model feeds all three formats and
// they cannot drift apart.
//
// Imported from the browser bundle specifically — plain `exceljs` pulls in
// Node core modules (stream/buffer) that Vite doesn't polyfill by default.
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { humanize } from './textFormat';

const asText = (v) => (v === null || v === undefined ? '' : String(v));
const isNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v));
const cellAlign = (col) => col.align || (col.money || col.qty || col.numeric ? 'right' : 'left');
const isFigureCol = (col) => !!(col.money || col.qty || col.numeric);

function cellValue(col, row) {
  // A column with no render is a raw DB field — humanize() only touches
  // values that look like a raw enum token, so a forgotten render can never
  // leak an unformatted status/type into the spreadsheet.
  const v = col.render ? col.render(row) : humanize(row[col.key]);
  return v === null || v === undefined ? '' : v;
}

const rowKind = (row) => {
  if (!row || typeof row !== 'object') return 'item';
  if (row.__spacer) return 'spacer';
  if (row.__section) return 'section';
  if (row.__grand) return 'grand';
  if (row.__total || row.__subtotal) return 'total';
  return 'item';
};

const isStatement = (rows = []) =>
  rows.some(r => r && (r.__section || r.__total || r.__grand || r.__subtotal));

// Accounting number formats: negatives in parentheses, thousands separated, and
// the trailing "_)" reserving a parenthesis-width space on positives so a column
// of mixed signs still aligns on the last digit.
//
// The three presentations mirror amount() in reportExport.js — parentheses for a
// genuinely abnormal line item, a minus sign for a negative bottom line, and a
// positive display for a contra account. Crucially these are NUMBER FORMATS, not
// rewritten values: the cell still holds the true negative, so SUM() and every
// total in the sheet stay correct while the display follows the convention.
const FMT_MONEY = '#,##0_);(#,##0)';
const FMT_MONEY_CUR = '"Rs. "#,##0_);("Rs. "#,##0)';
const FMT_MONEY_SIGNED = '#,##0_);-#,##0';
const FMT_MONEY_SIGNED_CUR = '"Rs. "#,##0_);-"Rs. "#,##0';
const FMT_MONEY_ABS = '#,##0;#,##0';
const FMT_MONEY_ABS_CUR = '"Rs. "#,##0;"Rs. "#,##0';
const FMT_QTY = '#,##0.0_);(#,##0.0)';

const INK = 'FF111827';
const INK_SOFT = 'FF475569';
const BRAND = 'FF1E3A8A';
const BAND = 'FFDBEAFE';   // pale blue — header + grand-total bands
const HAIR = 'FFD6DCE5';

const numFmtFor = (col, { currency = false, style = 'accounting' } = {}) => {
  if (col.qty) return FMT_QTY;
  if (style === 'signed') return currency ? FMT_MONEY_SIGNED_CUR : FMT_MONEY_SIGNED;
  if (style === 'absolute') return currency ? FMT_MONEY_ABS_CUR : FMT_MONEY_ABS;
  if (col.money) return currency ? FMT_MONEY_CUR : FMT_MONEY;
  return FMT_MONEY;
};

const isContraRow = (row) => !!(row && (row.__contra || row.is_contra));

// A computed RESULT (this period's net profit/loss, folded into a statement as
// a single figure) rather than an account's own balance — e.g. "Current Period
// Earnings" on the balance sheet, or "Net profit for the period" in the equity
// roll-forward. Accepts the backend's own `is_result` as well as the engine's
// `__signed` tag. Mirrors isResultRow() in reportExport.js.
const isResultRow = (row) => !!(row && (row.__signed || row.is_result));

// Mirrors rowAmountStyle() in reportExport.js exactly, so the workbook and the
// PDF apply the same convention to the same row.
const rowAmountStyle = (kind, row) => {
  if (kind === 'total' || kind === 'grand') return 'signed';
  if (isResultRow(row)) return 'signed';
  if (isContraRow(row)) return 'absolute';
  return 'accounting';
};

const thinBottom = { bottom: { style: 'thin', color: { argb: HAIR } } };
const ruleTop = { top: { style: 'thin', color: { argb: INK } } };
const ruleGrand = {
  top: { style: 'thin', color: { argb: INK } },
  bottom: { style: 'double', color: { argb: INK } },
};

/**
 * Write one report model into an existing worksheet starting at row `r`.
 * Returns the next free row. Shared by the list and document writers so both
 * lay tables out identically.
 */
function writeTable(ws, { columns = [], rows = [], totals, groupKey, heading }, r, opts = {}) {
  const lastCol = Math.max(columns.length, 1);
  const statement = opts.statement ?? isStatement(rows);

  if (heading) {
    ws.mergeCells(r, 1, r, lastCol);
    const cell = ws.getCell(r, 1);
    cell.value = asText(heading).toUpperCase();
    cell.font = { bold: true, size: 10, color: { argb: BRAND } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(r).height = 18;
    r += 1;
  }

  // ── Column headers ────────────────────────────────────────────────────────
  // wrapText: false everywhere — a narrow column should clip or overflow, not
  // stack short header text (e.g. a day-of-month "01") into two lines.
  const headerRow = r;
  columns.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = asText(c.header);
    cell.font = { bold: true, color: { argb: BRAND } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    cell.alignment = { horizontal: cellAlign(c), vertical: 'middle', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: INK_SOFT } } };
  });
  ws.getRow(r).height = 18;
  r += 1;

  // ── Body ──────────────────────────────────────────────────────────────────
  // Currency symbol once per section and on totals, matching the PDF.
  let needCurrency = statement;

  rows.forEach((row, idx) => {
    const kind = rowKind(row);
    if (kind === 'spacer') { r += 1; return; }

    const level = row.__level || 0;
    const nextRow = rows[idx + 1];
    const sameGroup = groupKey && nextRow && nextRow[groupKey] === row[groupKey];

    if (kind === 'section') {
      const label = row[columns[0]?.key] ?? row.label ?? row.account_name ?? '';
      const cell = ws.getCell(r, 1);
      cell.value = asText(label);
      cell.font = { bold: true, size: 11, color: { argb: BRAND } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: level };
      ws.getRow(r).height = 17;
      needCurrency = statement;
      r += 1;
      return;
    }

    const isTotal = kind === 'total' || kind === 'grand';
    const grand = kind === 'grand';
    const showCurrency = isTotal || needCurrency;
    if (needCurrency && !isTotal) needCurrency = false;
    if (isTotal) needCurrency = false;

    columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      const v = cellValue(c, row);

      if (isFigureCol(c) && isNum(v)) {
        cell.value = parseFloat(v);
        cell.numFmt = numFmtFor(c, {
          currency: statement && showCurrency,
          style: rowAmountStyle(kind, row),
        });
      } else {
        cell.value = asText(v);
      }

      cell.alignment = {
        horizontal: cellAlign(c),
        vertical: 'middle',
        wrapText: false,
        ...(i === 0 && level ? { indent: level } : {}),
      };

      if (isTotal) {
        cell.font = { bold: true, color: { argb: INK } };
        cell.border = isFigureCol(c) || i === 0
          ? (grand ? ruleGrand : ruleTop)
          : (grand ? { top: ruleGrand.top, bottom: ruleGrand.bottom } : ruleTop);
        if (grand) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      } else {
        cell.font = { color: { argb: INK } };
        if (!statement && !sameGroup) cell.border = thinBottom;
      }

      // Per-cell status colour (e.g. an attendance P/A/L day cell) keeps the
      // on-screen meaning in the spreadsheet.
      const fillHex = c.fill ? c.fill(row) : null;
      if (fillHex && !isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fillHex}` } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      }
    });
    if (isTotal) ws.getRow(r).height = 17;
    r += 1;
  });

  // Trailing totals object — the grand total when the rows didn't carry one.
  if (totals) {
    columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      if (i === 0 && totals.__label !== undefined) {
        cell.value = totals.__label || 'Total';
      } else if (totals[c.key] !== undefined) {
        if (isFigureCol(c) && isNum(totals[c.key])) {
          cell.value = parseFloat(totals[c.key]);
          cell.numFmt = numFmtFor(c, { currency: true, style: 'signed' });
        } else {
          cell.value = asText(totals[c.key]);
        }
      }
      cell.font = { bold: true, color: { argb: INK } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      cell.alignment = { horizontal: cellAlign(c), vertical: 'middle', wrapText: false };
      cell.border = ruleGrand;
    });
    ws.getRow(r).height = 17;
    r += 1;
  }

  return { next: r, headerRow, lastCol };
}

// Title block above the first table: company, document title, period, filters.
function writeTitleBlock(ws, { company = {}, title, subtitle, meta = [], filters = [] }, lastCol) {
  let r = 1;
  const line = (text, { size = 11, bold = false, italic = false, color = INK }) => {
    ws.mergeCells(r, 1, r, lastCol);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { bold, italic, size, color: { argb: color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    r += 1;
  };

  if (company.name) line(company.name, { size: 15, bold: true, color: BRAND });
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email]
    .filter(Boolean).join('   ·   ');
  if (contact) line(contact, { size: 9, color: INK_SOFT });
  line(title || 'Report', { size: 12, bold: true });
  if (subtitle) line(subtitle, { size: 10, color: INK_SOFT });
  if (filters?.length) {
    line(filters.map(f => `${f.label}: ${f.value}`).join('   ·   '), { size: 9, color: INK_SOFT });
  }
  const metaLine = [`Generated: ${new Date().toLocaleString('en-PK')}`, ...meta].filter(Boolean).join('   ·   ');
  if (metaLine) line(metaLine, { size: 8, italic: true, color: INK_SOFT });
  r += 1; // blank spacer row
  return r;
}

// A summary line BELOW the table (e.g. "12 active, 3 suspended"), merged across
// the full width. Deliberately not stuffed into a totals cell: a narrow column
// wraps that text into an unreadable stack. Same `note` field the PDF/print and
// CSV engines render, so every format agrees.
function writeNote(ws, note, r, lastCol) {
  if (!note) return r;
  r += 1;
  ws.mergeCells(r, 1, r, lastCol);
  const cell = ws.getCell(r, 1);
  cell.value = asText(note);
  cell.font = { italic: true, size: 10, color: { argb: INK_SOFT } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  return r + 1;
}

function applyColumnWidths(ws, columns) {
  // Prefer an explicit excelWidth per column (set by the report model) over the
  // PDF engine's relative `width` weight — the two engines size columns very
  // differently (proportional mm vs. character count), so reusing the PDF weight
  // directly produced columns too narrow to hold their own header.
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.excelWidth || Math.max(12, (c.width || 1) * 9);
  });
}

// Print setup so Ctrl+P straight out of Excel gives the same tidy page the PDF
// does: one page wide, header row repeated on every sheet, sensible margins.
function applyPrintSetup(ws, { orientation = 'portrait', headerRow, lastCol }) {
  ws.pageSetup = {
    orientation,
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: headerRow ? `${headerRow}:${headerRow}` : undefined,
  };
  ws.headerFooter = { oddFooter: '&L&F&C&P of &N&R&D' };

  // Gridlines off: the sheet draws its own rules under subtotals and totals, and
  // Excel's grid on top of them is the difference between a statement and a
  // spreadsheet someone typed numbers into.
  if (headerRow) {
    ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0, showGridLines: false }];
    if (lastCol > 1) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: lastCol },
      };
    }
  } else {
    ws.views = [{ showGridLines: false }];
  }
}

function downloadWorkbookBlob(buffer, filename, title) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const base = (filename || `${(title || 'report').toLowerCase().replace(/\s+/g, '-')}.xlsx`)
    .replace(/\.(pdf|csv)$/i, '.xlsx');
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

const sheetName = (title) =>
  (title || 'Report').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Report';

function newWorkbook(company) {
  const wb = new ExcelJS.Workbook();
  wb.creator = company?.name || 'Mine Track ERP';
  wb.created = new Date();
  return wb;
}

/** List report → one sheet: title block, one table, optional note. */
export async function exportReportXlsx(payload) {
  const {
    company = {}, title, subtitle, meta = [], filters = [], columns = [], rows = [],
    totals, note, filename, groupKey, orientation, statement,
  } = payload;

  const wb = newWorkbook(company);
  const ws = wb.addWorksheet(sheetName(title));
  const lastCol = Math.max(columns.length, 1);

  let r = writeTitleBlock(ws, { company, title, subtitle, meta, filters }, lastCol);
  const res = writeTable(ws, { columns, rows, totals, groupKey }, r, { statement });
  writeNote(ws, note, res.next, lastCol);

  applyColumnWidths(ws, columns);
  applyPrintSetup(ws, { orientation, headerRow: res.headerRow, lastCol: res.lastCol });

  downloadWorkbookBlob(await wb.xlsx.writeBuffer(), filename, title);
}

/**
 * Multi-section document (a single record's detail: label/value sections plus
 * one or more tables) → one sheet laid out top to bottom, mirroring the PDF.
 */
export async function exportDetailXlsx(payload) {
  const {
    company = {}, title, subtitle, meta = [], filters = [], sections = [],
    table, tables, note, filename, groupKey, orientation,
  } = payload;

  const allTables = [...(table ? [table] : []), ...(tables || [])];
  const widest = allTables.reduce((m, tb) => Math.max(m, tb?.columns?.length || 0), 2);

  const wb = newWorkbook(company);
  const ws = wb.addWorksheet(sheetName(title));

  let r = writeTitleBlock(ws, { company, title, subtitle, meta, filters }, widest);

  sections.forEach(sec => {
    const heading = sec.heading || sec.title;
    if (heading) {
      ws.mergeCells(r, 1, r, widest);
      const cell = ws.getCell(r, 1);
      cell.value = asText(heading).toUpperCase();
      cell.font = { bold: true, size: 10, color: { argb: BRAND } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(r).height = 18;
      r += 1;
    }
    (sec.rows || sec.fields || []).forEach(f => {
      const label = ws.getCell(r, 1);
      label.value = asText(f.label);
      label.font = { color: { argb: INK_SOFT } };
      label.alignment = { horizontal: 'left', vertical: 'middle' };
      label.border = thinBottom;
      const val = ws.getCell(r, 2);
      val.value = asText(f.value);
      val.font = { bold: true, color: { argb: INK } };
      val.alignment = { horizontal: 'left', vertical: 'middle' };
      val.border = thinBottom;
      r += 1;
    });
    r += 1;
  });

  let firstHeaderRow = null;
  let widestCols = [];
  allTables.forEach(tb => {
    if (!tb || !tb.columns) return;
    const res = writeTable(ws, { ...tb, groupKey }, r);
    if (firstHeaderRow === null) firstHeaderRow = res.headerRow;
    if (tb.columns.length > widestCols.length) widestCols = tb.columns;
    r = res.next + 1;
  });

  writeNote(ws, note, r, widest);

  if (widestCols.length) applyColumnWidths(ws, widestCols);
  else { ws.getColumn(1).width = 28; ws.getColumn(2).width = 42; }

  // A detail sheet has label/value blocks above the table, so freezing the
  // table header would hide them. Print setup still applies.
  applyPrintSetup(ws, { orientation, headerRow: null, lastCol: widest });

  downloadWorkbookBlob(await wb.xlsx.writeBuffer(), filename, title);
}
