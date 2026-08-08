import { jsPDF } from 'jspdf';
import api from '../api/axios';
import translations from '../translations';
import { SOFTWARE_CREDIT } from '../config/branding';

// ──────────────────────────────────────────────────────────────────────────────
// Shared reporting engine. Turns a column/row (or section/table) model into a
// downloaded PDF file or a print — both are the exact same jsPDF document
// (Print just opens it with auto-print armed), so the signature footer and
// pagination always land in the same place either way. Laid out like company
// stationery — company details on top, bordered tables, totals, optional
// signature footer. Drawn with crisp jsPDF vector primitives (no
// rasterisation), so text stays sharp and fully legible.
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

// ── Letterhead brand colours ────────────────────────────────────────────────
// A calm, professional indigo → emerald accent so every document reads as
// company stationery without hurting print legibility (all body text stays dark).
const BRAND_RGB = [67, 56, 202];        // indigo-700  → company name & main rule
const BRAND_ACCENT_RGB = [5, 150, 105]; // emerald-600 → thin accent rule
const TITLE_RGB = [49, 46, 129];        // indigo-900  → document title

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
function createWriter(company, { title, meta = [], filters = [], orientation = 'portrait' }) {
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

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientation === 'landscape' ? 'landscape' : 'portrait' });
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
    doc.setFontSize(6.5);
    doc.text(SOFTWARE_CREDIT, pageW / 2, pageH - 4, { align: 'center' });
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
    // Print the exact same vector document instead of a separate HTML/CSS
    // rendering — guarantees the signature footer lands in the same spot
    // (bottom of the last page) whether the user clicks Print or Download PDF.
    print() {
      drawFooter();
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    },
  };
}

const slugFile = (title, kind) => `${(title || kind).toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.pdf`;

// List report: one table + optional totals + optional signature.
function buildReportWriter({ company = {}, title, meta = [], filters = [], columns, rows, totals, signature, groupKey, orientation }) {
  const w = createWriter(company, { title, meta, filters, orientation });
  w.table({ columns, rows, totals, groupKey });
  if (signature) w.signature();
  return w;
}
export function downloadReportPDF(opts) {
  buildReportWriter(opts).save(opts.filename, slugFile(opts.title, 'report'));
}
export function printReport(opts) {
  buildReportWriter(opts).print();
}

// Multi-section professional document: label/value sections + one or more tables.
function buildDocumentWriter({ company = {}, title, meta = [], filters = [], sections = [], table, tables, signature, groupKey }) {
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
  return w;
}
export function downloadDocumentPDF(opts) {
  buildDocumentWriter(opts).save(opts.filename, slugFile(opts.title, 'document'));
}
export function printDetail(opts) {
  buildDocumentWriter(opts).print();
}

// A single record's detail is just a document with sections + tables.
export function downloadDetailPDF(opts) {
  return downloadDocumentPDF(opts);
}

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
  const { company = {}, title, sections = [], table, tables, filename } = payload;
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

  const allTables = [...(table ? [table] : []), ...(tables || [])];
  allTables.forEach(tb => {
    if (!tb || !tb.columns || !tb.rows) return;
    if (tb.heading) csvContent += `"${toEnglishText(tb.heading).replace(/"/g, '""')}"\n`;
    const headers = tb.columns.map(c => `"${toEnglishText(c.header || '').replace(/"/g, '""')}"`).join(',');
    csvContent += `${headers}\n`;
    tb.rows.forEach(r => {
      const rowVals = tb.columns.map(c => {
        let val = c.render ? c.render(r) : (c.key ? r[c.key] : '');
        return `"${asText(toEnglishText(val)).replace(/"/g, '""')}"`;
      });
      csvContent += `${rowVals.join(',')}\n`;
    });
    if (tb.totals) {
      const totalsValues = tb.columns.map((c, idx) => {
        if (idx === 0) return `"${toEnglishText(tb.totals.__label || 'Total').replace(/"/g, '""')}"`;
        if (c.key && tb.totals[c.key] !== undefined) {
          return `"${c.money ? money(tb.totals[c.key]) : tb.totals[c.key]}"`;
        }
        return '""';
      });
      csvContent += `${totalsValues.join(',')}\n`;
    }
    csvContent += '\n';
  });

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
