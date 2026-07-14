import { jsPDF } from 'jspdf';
import api from '../api/axios';
import translations from '../translations';

// ──────────────────────────────────────────────────────────────────────────────
// Shared reporting engine. Turns a column/row (or section/table) model into
// either a printable browser window (Print → Save as PDF too) or a downloaded
// PDF file. Both are laid out like the company stationery — company details on
// top, bordered tables, totals, optional signature footer. All PDFs are drawn
// with crisp jsPDF vector primitives (no rasterisation), so text stays sharp
// and fully legible.
// ──────────────────────────────────────────────────────────────────────────────

// Helper to translate any Urdu text back to English for PDF generation
// to avoid font encoding/shaping issues in jsPDF. Supports composite/partial strings.
function toEnglishText(str) {
  if (!str || typeof str !== 'string') return str;

  // Arabic/Urdu Unicode range check
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (!arabicRegex.test(str)) {
    return str;
  }

  // 1. Direct exact match
  const trimmed = str.trim();
  const urKeys = Object.keys(translations.ur);
  for (const key of urKeys) {
    if (translations.ur[key] && translations.ur[key].trim() === trimmed) {
      return translations.en[key] || str;
    }
  }

  // 2. Partial/phrase replacements (longest phrases first to avoid greedy substring matching)
  let result = str;
  const sortedKeys = urKeys.filter(k => translations.ur[k]).sort((a, b) => {
    return translations.ur[b].length - translations.ur[a].length;
  });

  for (const key of sortedKeys) {
    const urVal = translations.ur[key].trim();
    if (urVal && arabicRegex.test(urVal)) {
      // Escape regex special chars
      const escaped = urVal.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      result = result.replace(regex, translations.en[key] || '');
    }
  }

  return result;
}

// ── Company profile (cached) ────────────────────────────────────────────────
let _companyCache = null;
let _companyInflight = null;
export async function getCompany(params = {}) {
  if (_companyCache) return _companyCache;
  if (!_companyInflight) {
    _companyInflight = api.get('/company', { params })
      .then(({ data }) => { _companyCache = data.company || {}; return _companyCache; })
      .catch(() => ({}))
      .finally(() => { _companyInflight = null; });
  }
  return _companyInflight;
}
export function clearCompanyCache() { _companyCache = null; }

// ── Formatting helpers ──────────────────────────────────────────────────────
export const money = (n) =>
  `Rs. ${(parseFloat(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

// Quantity/weight fields (kg) — always exactly one decimal place, e.g. 5 → "5.0", 5.25 → "5.3"
export const qty = (n) =>
  (parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const asText = (v) => (v === null || v === undefined ? '' : String(v));

// Resolve a column definition + row into a display string.
// Column: { header, key, align?, money?, render?(row) }
function cellText(col, row) {
  const v = col.render ? col.render(row) : row[col.key];
  if (v === null || v === undefined) return '';
  if (col.money) return money(v);
  if (col.qty) return qty(v);
  return asText(v);
}
function cellAlign(col) {
  return col.align || (col.money || col.qty ? 'right' : 'left');
}

const nowStamp = () => new Date().toLocaleString('en-PK');

// Column relative widths → absolute mm within the available table width.
function resolveWidths(columns, tableWidth) {
  const weights = columns.map(c => c.width || 1);
  const totalW = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => (w / totalW) * tableWidth);
}

/* ══════════════════════════════════════════════════════════════════════════
   PDF engine (jsPDF vector) — shared by list reports & multi-section documents
   ══════════════════════════════════════════════════════════════════════════ */
function createWriter(company, { title, meta = [], filters = [] }) {
  const engCompany = {
    ...company,
    name: toEnglishText(company.name),
    address: toEnglishText(company.address),
    owner_name: toEnglishText(company.owner_name)
  };
  const engTitle = toEnglishText(title);
  const engMeta = meta.map(toEnglishText);
  const engFilters = filters.map(f => ({
    label: toEnglishText(f.label),
    value: toEnglishText(f.value)
  }));

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const lineH = 4.4, padY = 1.7, padX = 1.8;
  let pageNo = 1;
  let y = 0;

  const drawLetterhead = (full) => {
    let yy = 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(17, 24, 39);
    doc.text(engCompany.name || 'Company', pageW / 2, yy, { align: 'center' }); yy += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
    const contact = [engCompany.address, engCompany.phone && `Ph: ${engCompany.phone}`, engCompany.email].filter(Boolean).join('   |   ');
    if (contact) { doc.text(contact, pageW / 2, yy, { align: 'center' }); yy += 4; }
    if (engCompany.owner_name) { doc.text(`Proprietor: ${engCompany.owner_name}`, pageW / 2, yy, { align: 'center' }); yy += 4; }
    yy += 2; doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.5); doc.line(margin, yy, pageW - margin, yy); yy += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17, 24, 39);
    doc.text((engTitle || 'Document').toUpperCase(), pageW / 2, yy, { align: 'center' }); yy += 5;
    if (full) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70);
      doc.text([`Generated: ${nowStamp()}`, ...engMeta].join('     '), margin, yy); yy += 4;
      if (engFilters.length) {
        const fLine = 'Filters:  ' + engFilters.map(f => `${f.label}: ${f.value}`).join('     ');
        const w = doc.splitTextToSize(fLine, contentW); doc.text(w, margin, yy); yy += w.length * 4;
      }
    }
    return yy + 2;
  };

  const drawFooter = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text(engCompany.name || '', margin, pageH - 8);
    doc.text(`Page ${pageNo}`, pageW - margin, pageH - 8, { align: 'right' });
  };

  y = drawLetterhead(true);

  const ensure = (need) => {
    if (y + need > pageH - 16) { drawFooter(); doc.addPage(); pageNo += 1; y = drawLetterhead(false); }
  };

  // Draw one bordered row of cells; measures wrapped text & handles page breaks.
  const rowCells = (cells, widths, { bold = false, fill = null } = {}) => {
    let maxLines = 1;
    cells.forEach((c, i) => {
      c._lines = doc.splitTextToSize(asText(c.text), widths[i] - padX * 2);
      maxLines = Math.max(maxLines, c._lines.length);
    });
    const rowH = maxLines * lineH + padY * 2;
    ensure(rowH);
    let x = margin;
    const totalW = widths.reduce((a, b) => a + b, 0);
    if (fill) { doc.setFillColor(...fill); doc.rect(margin, y, totalW, rowH, 'F'); }
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.7); doc.setTextColor(17, 24, 39);
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.15);
    cells.forEach((c, i) => {
      let tx = x + padX;
      if (c.align === 'right') tx = x + widths[i] - padX;
      else if (c.align === 'center') tx = x + widths[i] / 2;
      doc.text(c._lines, tx, y + padY + lineH - 1.2, { align: c.align || 'left' });
      doc.rect(x, y, widths[i], rowH);
      x += widths[i];
    });
    y += rowH;
  };

  return {
    doc,
    space(mm) { y += mm; },
    heading(text) {
      ensure(9);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(17, 24, 39);
      doc.text(asText(toEnglishText(text)), margin, y + 3.5); y += 7;
    },
    kv(rows) {
      const widths = [contentW * 0.32, contentW * 0.68];
      rows.filter(Boolean).forEach(r => {
        rowCells([
          { text: toEnglishText(r.label), align: 'left' },
          { text: toEnglishText(r.value), align: 'left' },
        ], widths, { });
      });
    },
    table({ columns, rows = [], totals }) {
      const widths = resolveWidths(columns, contentW);
      const engColumns = columns.map(c => ({ ...c, header: toEnglishText(c.header) }));
      rowCells(engColumns.map(c => ({ text: c.header, align: cellAlign(c) })), widths, { bold: true, fill: [235, 238, 242] });
      if (!rows.length) rowCells([{ text: 'No records.', align: 'center' }], [contentW]);
      rows.forEach((row, idx) => {
        rowCells(engColumns.map(c => ({ text: toEnglishText(cellText(c, row)), align: cellAlign(c) })), widths, { fill: idx % 2 ? [249, 250, 251] : null });
      });
      if (totals) {
        rowCells(engColumns.map((c, i) => {
          if (i === 0 && totals.__label !== undefined) return { text: toEnglishText(totals.__label || 'Total'), align: 'left' };
          if (totals[c.key] !== undefined) return { text: c.money ? money(totals[c.key]) : c.qty ? qty(totals[c.key]) : toEnglishText(asText(totals[c.key])), align: cellAlign(c) };
          return { text: '', align: cellAlign(c) };
        }), widths, { bold: true, fill: [226, 232, 240] });
      }
    },
    signature(left = 'Prepared By', right = 'Received / Verified By') {
      ensure(30); y += 18;
      const colW = contentW / 2;
      doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
      doc.line(margin, y, margin + colW - 14, y);
      doc.line(margin + colW + 4, y, pageW - margin, y);
      y += 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
      doc.text(left, margin, y);
      doc.text(right, margin + colW + 4, y);
    },
    save(filename, fallback) { drawFooter(); doc.save(filename || fallback); },
  };
}

const slugFile = (title, kind) => `${(title || kind).toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.pdf`;

// List report: one table + optional totals + optional signature.
export function downloadReportPDF({ company = {}, title, meta = [], filters = [], columns, rows, totals, signature, filename }) {
  const w = createWriter(company, { title, meta, filters });
  w.table({ columns, rows, totals });
  if (signature) w.signature();
  w.save(filename, slugFile(title, 'report'));
}

// Multi-section professional document: label/value sections + one or more tables.
export function downloadDocumentPDF({ company = {}, title, meta = [], filters = [], sections = [], table, tables, signature, filename }) {
  const w = createWriter(company, { title, meta, filters });
  sections.forEach(s => {
    if (s.heading) w.heading(s.heading);
    w.kv(s.rows || []);
    w.space(2);
  });
  const allTables = [...(table ? [table] : []), ...(tables || [])];
  allTables.forEach(tb => {
    if (tb.heading) w.heading(tb.heading);
    w.table(tb);
    w.space(3);
  });
  if (signature) w.signature();
  w.save(filename, slugFile(title, 'document'));
}

// A single record's detail is just a document with sections + tables.
export function downloadDetailPDF(opts) {
  return downloadDocumentPDF(opts);
}

/* ══════════════════════════════════════════════════════════════════════════
   HTML print windows (browser Print → also Save as PDF). Same letterhead.
══════════════════════════════════════════════════════════════════════════ */
function esc(s) {
  return asText(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const PRINT_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 22px; }
  .company { text-align: center; }
  .company h1 { font-size: 22px; margin: 0 0 4px; color: #111827; }
  .company .contact { font-size: 11.5px; color: #374151; }
  .company .owner { font-size: 11.5px; color: #374151; margin-top: 2px; }
  hr { border: none; border-top: 2px solid #111827; margin: 10px 0 8px; }
  .title { text-align: center; font-size: 15px; font-weight: 800; letter-spacing: 1.5px;
           text-transform: uppercase; margin-bottom: 6px; color: #111827; }
  .meta { font-size: 10px; color: #374151; text-align: center; }
  .filters { font-size: 10px; color: #1f2937; margin: 8px 0; padding: 6px 8px;
             background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; color: #111827; }
  th, td { border: 1px solid #111827; padding: 6px 8px; }
  th { background: #eef0f4; font-weight: 700; text-align: left; color: #111827; }
  .a-left { text-align: left; } .a-right { text-align: right; } .a-center { text-align: center; }
  tr.totals td { font-weight: 800; background: #e2e8f0; }
  .empty { text-align: center; color: #6b7280; font-style: italic; padding: 16px; }
  .sec { margin-bottom: 12px; }
  .sec-h { font-size: 11px; font-weight: 800; color: #374151; text-transform: uppercase;
           letter-spacing: 1px; margin: 12px 0 4px; }
  table.kv td { border: 1px solid #111827; font-size: 12px; }
  table.kv td.k { color: #374151; width: 32%; } table.kv td.v { font-weight: 700; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; font-size: 12px; font-weight: 700; }
  .sign > div { width: 44%; } .sign .line { border-top: 1px solid #111827; margin-bottom: 4px; height: 1px; }
  .foot { margin-top: 20px; text-align: center; font-size: 9px; color: #6b7280; }
  @media print { body { margin: 12mm; } @page { margin: 8mm; } }
`;

function letterheadHTML(company, title, meta = [], filters = []) {
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email]
    .filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ');
  const metaLine = [`Generated: ${nowStamp()}`, ...meta].map(esc).join(' &nbsp;&nbsp; ');
  const filterLine = filters.length
    ? `<div class="filters"><strong>Filters:</strong> ${filters.map(f => `${esc(f.label)}: ${esc(f.value)}`).join(' &nbsp;&nbsp; ')}</div>`
    : '';
  return `
    <div class="company">
      <h1>${esc(company.name || 'Company')}</h1>
      ${contact ? `<div class="contact">${contact}</div>` : ''}
      ${company.owner_name ? `<div class="owner">Proprietor: ${esc(company.owner_name)}</div>` : ''}
    </div>
    <hr/>
    <div class="title">${esc(title || 'Document')}</div>
    <div class="meta">${metaLine}</div>
    ${filterLine}`;
}

function tableHTML({ columns, rows = [], totals }) {
  const head = columns.map(c => `<th class="a-${cellAlign(c)}">${esc(c.header)}</th>`).join('');
  const body = rows.length
    ? rows.map(r => `<tr>${columns.map(c => `<td class="a-${cellAlign(c)}">${esc(cellText(c, r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No records for the selected filters.</td></tr>`;
  const totalRow = totals
    ? `<tr class="totals">${columns.map((c, i) => {
        if (i === 0 && totals.__label !== undefined) return `<td class="a-left">${esc(totals.__label || 'Total')}</td>`;
        if (totals[c.key] !== undefined) return `<td class="a-${cellAlign(c)}">${esc(c.money ? money(totals[c.key]) : c.qty ? qty(totals[c.key]) : totals[c.key])}</td>`;
        return `<td></td>`;
      }).join('')}</tr>`
    : '';
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}

const signHTML = (signature) => (signature
  ? `<div class="sign"><div><div class="line"></div>Prepared By</div><div><div class="line"></div>Received Sign &amp; Thumb</div></div>`
  : '');

export function buildReportHTML({ company = {}, title, meta = [], filters = [], columns, rows, totals, signature }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Report')}</title>
  <style>${PRINT_CSS}</style></head><body>
    ${letterheadHTML(company, title, meta, filters)}
    ${tableHTML({ columns, rows, totals })}
    ${signHTML(signature)}
    <div class="foot">${esc(company.name || '')} — computer generated report</div>
  </body></html>`;
}

export function buildDetailHTML({ company = {}, title, meta = [], filters = [], sections = [], table, tables, signature }) {
  const secHtml = sections.map(s => `
    <div class="sec">
      ${s.heading ? `<div class="sec-h">${esc(s.heading)}</div>` : ''}
      <table class="kv">${s.rows.filter(Boolean).map(r => `<tr><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`).join('')}</table>
    </div>`).join('');
  const allTables = [...(table ? [table] : []), ...(tables || [])];
  const tablesHtml = allTables.map(tb => `${tb.heading ? `<div class="sec-h">${esc(tb.heading)}</div>` : ''}${tableHTML(tb)}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Detail')}</title>
  <style>${PRINT_CSS}</style></head><body>
    ${letterheadHTML(company, title, meta, filters)}
    ${secHtml}
    ${tablesHtml}
    ${signHTML(signature)}
    <div class="foot">${esc(company.name || '')} — computer generated document</div>
  </body></html>`;
}

function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to print.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 400);
}

export function printReport(opts) { openPrintWindow(buildReportHTML(opts)); }
export function printDetail(opts) { openPrintWindow(buildDetailHTML(opts)); }
