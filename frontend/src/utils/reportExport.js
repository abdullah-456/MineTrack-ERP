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
export const money = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || val === 0) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

// Quantity/weight fields (kg) — always exactly one decimal place, e.g. 5 → "5.0 kg", 5.25 → "5.3 kg"
export const qty = (n) =>
  `${(parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

const asText = (v) => (v === null || v === undefined ? '' : String(v));

// ── Letterhead brand colours (shared by PDF + HTML) ──────────────────────────
// A calm, professional indigo → emerald accent so every document reads as
// company stationery without hurting print legibility (all body text stays dark).
const BRAND_RGB = [67, 56, 202];        // indigo-700  → company name & main rule
const BRAND_ACCENT_RGB = [5, 150, 105]; // emerald-600 → thin accent rule
const TITLE_RGB = [49, 46, 129];        // indigo-900  → document title
export const BRAND_HEX = '#4338ca';
export const BRAND_ACCENT_HEX = '#059669';
const TITLE_HEX = '#312e81';

// Draw an uploaded logo (data URL / image URL) on the left of a jsPDF letterhead.
// Returns nothing; silently skips anything jsPDF can't decode.
function drawPdfLogo(doc, logo, x, y, maxW, maxH) {
  if (!logo) return;
  try {
    const props = doc.getImageProperties(logo);
    let w = maxW, h = (w * props.height) / props.width;
    if (h > maxH) { h = maxH; w = (h * props.width) / props.height; }
    doc.addImage(logo, props.fileType || 'PNG', x, y, w, h);
  } catch { /* invalid logo — ignore */ }
}

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
    // Solid brand-colour band behind the company block (edge-to-edge), with a
    // thin accent stripe underneath — text inside the band is reversed
    // (light-on-colour) so it stays readable against the fill.
    const contact = [engCompany.address, engCompany.phone && `Ph: ${engCompany.phone}`, engCompany.email].filter(Boolean).join('   |   ');
    const lines = 1 + (contact ? 1 : 0) + (engCompany.owner_name ? 1 : 0);
    const bandH = 10 + lines * 5.4;

    doc.setFillColor(...BRAND_RGB); doc.rect(0, 0, pageW, bandH, 'F');
    doc.setFillColor(...BRAND_ACCENT_RGB); doc.rect(0, bandH, pageW, 1.6, 'F');

    const logoH = Math.min(16, bandH - 4);
    drawPdfLogo(doc, engCompany.logo_url, margin, Math.max(3, (bandH - logoH) / 2), 26, logoH);

    let yy = (bandH - lines * 5) / 2 + 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
    doc.text(engCompany.name || 'Company', pageW / 2, yy, { align: 'center' }); yy += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(224, 231, 255);
    if (contact) { doc.text(contact, pageW / 2, yy, { align: 'center' }); yy += 5; }
    if (engCompany.owner_name) { doc.text(`Proprietor: ${engCompany.owner_name}`, pageW / 2, yy, { align: 'center' }); yy += 5; }

    yy = bandH + 1.6 + 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TITLE_RGB);
    doc.text((engTitle || 'Document').toUpperCase(), pageW / 2, yy, { align: 'center' }); yy += 5;
    if (full) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70);
      doc.text([`Generated: ${nowStamp()}`, ...engMeta].join('     '), margin, yy); yy += 4;
      if (engFilters.length) {
        const fLine = engFilters.map(f => `${f.label}: ${f.value}`).join('     ');
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
  const rowCells = (cells, widths, { bold = false, fill = null, showBottomBorder = true } = {}) => {
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
    
    // Draw borders: outer box + internal vertical dividers
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.15);
    doc.line(margin, y, margin + totalW, y); // top
    doc.line(margin, y, margin, y + rowH); // left
    doc.line(margin + totalW, y, margin + totalW, y + rowH); // right
    if (showBottomBorder) {
      doc.line(margin, y + rowH, margin + totalW, y + rowH); // bottom
    }
    
    // Draw vertical dividers between cells
    let xDiv = margin;
    for (let i = 0; i < widths.length - 1; i++) {
      xDiv += widths[i];
      doc.line(xDiv, y, xDiv, y + rowH);
    }
    
    // Draw text in each cell
    cells.forEach((c, i) => {
      let tx = x + padX;
      if (c.align === 'right') tx = x + widths[i] - padX;
      else if (c.align === 'center') tx = x + widths[i] / 2;
      doc.text(c._lines, tx, y + padY + lineH - 1.2, { align: c.align || 'left' });
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
    table({ columns, rows = [], totals, groupKey }) {
      const widths = resolveWidths(columns, contentW);
      const engColumns = columns.map(c => ({ ...c, header: toEnglishText(c.header) }));
      rowCells(engColumns.map(c => ({ text: c.header, align: cellAlign(c) })), widths, { bold: true, fill: [235, 238, 242], showBottomBorder: true });
      if (!rows.length) rowCells([{ text: 'No records.', align: 'center' }], [contentW]);
      rows.forEach((row, idx) => {
        const nextRow = rows[idx + 1];
        const showBottomBorder = !nextRow || (groupKey && nextRow[groupKey] !== row[groupKey]);
        rowCells(engColumns.map(c => ({ text: toEnglishText(cellText(c, row)), align: cellAlign(c) })), widths, { fill: idx % 2 ? [249, 250, 251] : null, showBottomBorder });
      });
      if (totals) {
        rowCells(engColumns.map((c, i) => {
          if (i === 0 && totals.__label !== undefined) return { text: toEnglishText(totals.__label || 'Total'), align: 'left' };
          if (totals[c.key] !== undefined) return { text: c.money ? money(totals[c.key]) : c.qty ? qty(totals[c.key]) : toEnglishText(asText(totals[c.key])), align: cellAlign(c) };
          return { text: '', align: cellAlign(c) };
        }), widths, { bold: true, fill: [226, 232, 240], showBottomBorder: true });
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
export function downloadReportPDF({ company = {}, title, meta = [], filters = [], columns, rows, totals, signature, filename, groupKey }) {
  const w = createWriter(company, { title, meta, filters });
  w.table({ columns, rows, totals, groupKey });
  if (signature) w.signature();
  w.save(filename, slugFile(title, 'report'));
}

// Multi-section professional document: label/value sections + one or more tables.
export function downloadDocumentPDF({ company = {}, title, meta = [], filters = [], sections = [], table, tables, signature, filename, groupKey }) {
  const w = createWriter(company, { title, meta, filters });
  sections.forEach(s => {
    if (s.heading) w.heading(s.heading);
    w.kv(s.rows || []);
    w.space(2);
  });
  const allTables = [...(table ? [table] : []), ...(tables || [])];
  allTables.forEach(tb => {
    if (tb.heading) w.heading(tb.heading);
    w.table({ ...tb, groupKey });
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
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
  .page { padding: 22px; }
  .lh { position: relative; background: ${BRAND_HEX}; margin: -22px -22px 0; padding: 14px 22px;
        border-bottom: 4px solid ${BRAND_ACCENT_HEX}; }
  .lh .logo { position: absolute; left: 22px; top: 50%; transform: translateY(-50%);
              max-height: 56px; max-width: 110px; object-fit: contain; background: #fff;
              border-radius: 6px; padding: 3px; }
  .company { text-align: center; }
  .company h1 { font-size: 22px; margin: 0 0 4px; color: #ffffff; }
  .company .contact { font-size: 11.5px; color: #e0e7ff; }
  .company .owner { font-size: 11.5px; color: #e0e7ff; margin-top: 2px; }
  .title { text-align: center; font-size: 15px; font-weight: 800; letter-spacing: 1.5px;
           text-transform: uppercase; margin: 14px 0 6px; color: ${TITLE_HEX}; }
  .meta { font-size: 10px; color: #374151; text-align: center; }
  .filters { font-size: 10px; color: #1f2937; margin: 8px 0; padding: 6px 8px;
             background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; color: #111827; }
  th, td { border: 1px solid #111827; padding: 6px 8px; }
  th { background: #eef0f4; font-weight: 700; text-align: left; color: #111827; }
  .a-left { text-align: left; } .a-right { text-align: right; } .a-center { text-align: center; }
  tbody tr td { border-bottom: none; }
  tr.group-border td { border-bottom: 1px solid #111827; }
  tr.totals td { font-weight: 800; background: #e2e8f0; border-bottom: 1px solid #111827; }
  .empty { text-align: center; color: #6b7280; font-style: italic; padding: 16px; }
  .sec { margin-bottom: 12px; }
  .sec-h { font-size: 11px; font-weight: 800; color: #374151; text-transform: uppercase;
           letter-spacing: 1px; margin: 12px 0 4px; }
  table.kv td { border: 1px solid #111827; font-size: 12px; }
  table.kv td.k { color: #374151; width: 32%; } table.kv td.v { font-weight: 700; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; font-size: 12px; font-weight: 700; }
  .sign > div { width: 44%; } .sign .line { border-top: 1px solid #111827; margin-bottom: 4px; height: 1px; }
  .foot { margin-top: 20px; text-align: center; font-size: 9px; color: #6b7280; }
  @media print { @page { margin: 6mm; } }
`;

function letterheadHTML(company, title, meta = [], filters = []) {
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email]
    .filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ');
  const metaLine = [`Generated: ${nowStamp()}`, ...meta].map(esc).join(' &nbsp;&nbsp; ');
  const filterLine = filters.length
    ? `<div class="filters">${filters.map(f => `${esc(f.label)}: ${esc(f.value)}`).join(' &nbsp;&nbsp; ')}</div>`
    : '';
  return `
    <div class="lh">
      ${company.logo_url ? `<img class="logo" src="${esc(company.logo_url)}" alt=""/>` : ''}
      <div class="company">
        <h1>${esc(company.name || 'Company')}</h1>
        ${contact ? `<div class="contact">${contact}</div>` : ''}
        ${company.owner_name ? `<div class="owner">Proprietor: ${esc(company.owner_name)}</div>` : ''}
      </div>
    </div>
    <div class="title">${esc(title || 'Document')}</div>
    <div class="meta">${metaLine}</div>
    ${filterLine}`;
}

function tableHTML({ columns, rows = [], totals, groupKey }) {
  const head = columns.map(c => `<th class="a-${cellAlign(c)}">${esc(c.header)}</th>`).join('');
  const body = rows.length
    ? rows.map((r, idx) => {
        const nextRow = rows[idx + 1];
        const showBorder = !nextRow || (groupKey && nextRow[groupKey] !== r[groupKey]);
        const borderClass = showBorder ? ' group-border' : '';
        return `<tr${borderClass}>${columns.map(c => `<td class="a-${cellAlign(c)}">${esc(cellText(c, r))}</td>`).join('')}</tr>`;
      }).join('')
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

export function buildReportHTML({ company = {}, title, meta = [], filters = [], columns, rows, totals, signature, groupKey }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Report')}</title>
  <style>${PRINT_CSS}</style></head><body>
    <div class="page">
      ${letterheadHTML(company, title, meta, filters)}
      ${tableHTML({ columns, rows, totals, groupKey })}
      ${signHTML(signature)}
      <div class="foot">${esc(company.name || '')} — computer generated report</div>
    </div>
  </body></html>`;
}

export function buildDetailHTML({ company = {}, title, meta = [], filters = [], sections = [], table, tables, signature, groupKey }) {
  const secHtml = sections.map(s => `
    <div class="sec">
      ${s.heading ? `<div class="sec-h">${esc(s.heading)}</div>` : ''}
      <table class="kv">${s.rows.filter(Boolean).map(r => `<tr><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`).join('')}</table>
    </div>`).join('');
  const allTables = [...(table ? [table] : []), ...(tables || [])];
  const tablesHtml = allTables.map(tb => `${tb.heading ? `<div class="sec-h">${esc(tb.heading)}</div>` : ''}${tableHTML({ ...tb, groupKey })}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Detail')}</title>
  <style>${PRINT_CSS}</style></head><body>
    <div class="page">
      ${letterheadHTML(company, title, meta, filters)}
      ${secHtml}
      ${tablesHtml}
      ${signHTML(signature)}
      <div class="foot">${esc(company.name || '')} — computer generated document</div>
    </div>
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

// ── Excel Export (CSV with UTF-8 BOM for Excel compatibility) ──────────────────
export function downloadReportExcel(payload) {
  const { company = {}, title, columns = [], rows = [], totals, filters, filename } = payload;
  let csvContent = '\uFEFF';

  const companyName = toEnglishText(company.name || 'Business Report');
  const reportTitle = toEnglishText(title || 'Report');
  csvContent += `"${companyName.replace(/"/g, '""')}"\n`;
  csvContent += `"${reportTitle.replace(/"/g, '""')}"\n`;

  if (filters && filters.length > 0) {
    const filterText = filters.map(f => `${toEnglishText(f.label || f.key || '')}: ${toEnglishText(f.value || '')}`).join(' | ');
    csvContent += `"${filterText.replace(/"/g, '""')}"\n`;
  }
  csvContent += '\n';

  const headerRow = columns.map(c => `"${toEnglishText(c.header || '').replace(/"/g, '""')}"`).join(',');
  csvContent += `${headerRow}\n`;

  rows.forEach(r => {
    const rowValues = columns.map(c => {
      let val = '';
      if (c.render) {
        val = c.render(r);
      } else if (c.key) {
        val = r[c.key];
      }
      val = asText(toEnglishText(val)).replace(/"/g, '""');
      return `"${val}"`;
    });
    csvContent += `${rowValues.join(',')}\n`;
  });

  if (totals) {
    const totalsValues = columns.map((c, idx) => {
      if (idx === 0) return `"${toEnglishText(totals.__label || 'Total').replace(/"/g, '""')}"`;
      if (c.key && totals[c.key] !== undefined) {
        return `"${c.money ? money(totals[c.key]) : totals[c.key]}"`;
      }
      return '""';
    });
    csvContent += `${totalsValues.join(',')}\n`;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fname = (filename || `${(title || 'report').toLowerCase().replace(/\s+/g, '-')}.csv`).replace(/\.pdf$/i, '.csv');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDetailExcel(payload) {
  const { company = {}, title, sections = [], table, filename } = payload;
  let csvContent = '\uFEFF';

  const companyName = toEnglishText(company.name || 'Business Record');
  const docTitle = toEnglishText(title || 'Detail');
  csvContent += `"${companyName.replace(/"/g, '""')}"\n`;
  csvContent += `"${docTitle.replace(/"/g, '""')}"\n`;
  csvContent += '\n';

  sections.forEach(sec => {
    if (sec.heading || sec.title) csvContent += `"${toEnglishText(sec.heading || sec.title).replace(/"/g, '""')}"\n`;
    const fields = sec.rows || sec.fields || [];
    fields.forEach(f => {
      csvContent += `"${toEnglishText(f.label).replace(/"/g, '""')}","${toEnglishText(asText(f.value)).replace(/"/g, '""')}"\n`;
    });
    csvContent += '\n';
  });

  if (table && table.columns && table.rows) {
    const headers = table.columns.map(c => `"${toEnglishText(c.header || '').replace(/"/g, '""')}"`).join(',');
    csvContent += `${headers}\n`;
    table.rows.forEach(r => {
      const rowVals = table.columns.map(c => {
        let val = c.render ? c.render(r) : (c.key ? r[c.key] : '');
        return `"${asText(toEnglishText(val)).replace(/"/g, '""')}"`;
      });
      csvContent += `${rowVals.join(',')}\n`;
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fname = (filename || `${(title || 'detail').toLowerCase().replace(/\s+/g, '-')}.csv`).replace(/\.pdf$/i, '.csv');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
