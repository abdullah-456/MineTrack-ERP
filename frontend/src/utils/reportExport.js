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
      ensure(12);
      doc.setFillColor(238, 240, 244);
      doc.rect(margin, y, contentW, 7, 'F');
      doc.setDrawColor(...BRAND_RGB);
      doc.setLineWidth(0.6);
      doc.line(margin, y, margin, y + 7);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...TITLE_RGB);
      doc.text(asText(toEnglishText(text)).toUpperCase(), margin + 3, y + 4.8);
      y += 10;
    },
    kv(rows) {
      const widths = [contentW * 0.38, contentW * 0.62];
      rows.filter(Boolean).forEach((r, idx) => {
        rowCells([
          { text: toEnglishText(r.label), align: 'left' },
          { text: toEnglishText(r.value), align: 'left' },
        ], widths, { fill: idx % 2 ? [249, 250, 251] : null });
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
    // Pin signature near bottom of the current A4 page (a few lines above the edge).
    signature(left = 'Prepared By', right = 'Received / Verified By') {
      const blockH = 38;
      const bottomReserve = 14; // space for page footer line
      const targetY = pageH - bottomReserve - blockH;
      if (y > targetY - 4) {
        drawFooter();
        doc.addPage();
        pageNo += 1;
        y = drawLetterhead(false);
      }
      if (y < targetY) y = targetY;

      doc.setDrawColor(200, 200, 210);
      doc.setLineWidth(0.2);
      doc.line(margin, y - 4, pageW - margin, y - 4);

      const colW = contentW / 2;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
      doc.text('Sign / Stamp', margin, y + 10);
      doc.text('Sign / Stamp', margin + colW + 4, y + 10);
      doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.35);
      doc.line(margin, y + 16, margin + colW - 14, y + 16);
      doc.line(margin + colW + 4, y + 16, pageW - margin, y + 16);
      y += 21;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 30, 30);
      doc.text(toEnglishText(left), margin, y);
      doc.text(toEnglishText(right), margin + colW + 4, y);
      y += 8;
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
  body { font-family: Inter, Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
  .page {
    padding: 18px 22px 14px; min-height: calc(297mm - 16mm);
    display: flex; flex-direction: column;
  }
  .page-body { flex: 1 1 auto; }
  .lh { position: relative; background: ${BRAND_HEX}; margin: -18px -22px 0; padding: 14px 22px;
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
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px; color: #111827; }
  th, td { border: 1px solid #111827; padding: 6px 8px; }
  th { background: #eef0f4; font-weight: 700; text-align: left; color: #111827; }
  .a-left { text-align: left; } .a-right { text-align: right; } .a-center { text-align: center; }
  tbody tr td { border-bottom: none; }
  tr.group-border td { border-bottom: 1px solid #111827; }
  tr.totals td { font-weight: 800; background: #e2e8f0; border-bottom: 1px solid #111827; }
  .empty { text-align: center; color: #6b7280; font-style: italic; padding: 16px; }
  .sec { margin-bottom: 12px; }
  .sec-h {
    font-size: 10.5px; font-weight: 800; color: ${TITLE_HEX}; text-transform: uppercase;
    letter-spacing: 1px; margin: 14px 0 6px; padding: 6px 8px; background: #eef0f4;
    border-left: 3px solid ${BRAND_HEX};
  }
  table.kv td { border: 1px solid #111827; font-size: 12px; }
  table.kv td.k { color: #374151; width: 38%; background: #fafafa; }
  table.kv td.v { font-weight: 700; }
  .doc-close {
    margin-top: auto; padding-top: 24px; padding-bottom: 8mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  .sign { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; gap: 24px; }
  .sign > div { width: 44%; }
  .sign .stamp {
    height: 42px; border-bottom: 1px solid #111827; margin-bottom: 6px;
    font-size: 9px; color: #9ca3af; font-style: italic; display: flex; align-items: flex-end;
  }
  .foot {
    margin-top: 12px; padding-top: 8px; border-top: 1px solid #d1d5db;
    display: flex; justify-content: space-between; font-size: 9px; color: #6b7280;
  }
  @media print { @page { size: A4; margin: 8mm; } .page { min-height: calc(297mm - 16mm); } }
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

const signHTML = (signature) => {
  if (!signature) return '';
  const left = typeof signature === 'object' && signature.left ? signature.left : 'Prepared By';
  const right = typeof signature === 'object' && signature.right ? signature.right : 'Received Sign & Thumb';
  return `<div class="doc-close">
    <div class="sign">
      <div><div class="stamp">Sign / Stamp</div>${esc(left)}</div>
      <div><div class="stamp">Sign / Stamp</div>${esc(right)}</div>
    </div>
    <div class="foot"><span>Computer generated document</span><span>${esc(nowStamp())}</span></div>
  </div>`;
};

export function buildReportHTML({ company = {}, title, meta = [], filters = [], columns, rows, totals, signature, groupKey }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Report')}</title>
  <style>${PRINT_CSS}</style></head><body>
    <div class="page">
      <div class="page-body">
        ${letterheadHTML(company, title, meta, filters)}
        ${tableHTML({ columns, rows, totals, groupKey })}
      </div>
      ${signHTML(signature)}
    </div>
  </body></html>`;
}

export function buildDetailHTML({ company = {}, title, meta = [], filters = [], sections = [], table, tables, signature, groupKey }) {
  const secHtml = sections.map(s => `
    <div class="sec">
      ${s.heading ? `<div class="sec-h">${esc(s.heading)}</div>` : ''}
      <table class="kv">${(s.rows || []).filter(Boolean).map(r => `<tr><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`).join('')}</table>
    </div>`).join('');
  const allTables = [...(table ? [table] : []), ...(tables || [])];
  const tablesHtml = allTables.map(tb => `${tb.heading ? `<div class="sec-h">${esc(tb.heading)}</div>` : ''}${tableHTML({ ...tb, groupKey })}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Detail')}</title>
  <style>${PRINT_CSS}</style></head><body>
    <div class="page">
      <div class="page-body">
        ${letterheadHTML(company, title, meta, filters)}
        ${secHtml}
        ${tablesHtml}
      </div>
      ${signHTML(signature)}
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
