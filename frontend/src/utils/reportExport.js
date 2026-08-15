import { jsPDF } from 'jspdf';
import api from '../api/axios';
import translations from '../translations';
import { SOFTWARE_CREDIT } from '../config/branding';

// ──────────────────────────────────────────────────────────────────────────────
// Shared reporting engine. Turns a column/row (or section/table) model into a
// downloaded PDF file or a print — both are the exact same jsPDF document
// (Print just opens it with auto-print armed), so the signature footer and
// pagination always land in the same place either way.
//
// Laid out the way published financial statements are, not the way a screen
// table is: a typographic letterhead, horizontal rules only (no boxed cells or
// vertical dividers), a single hairline above a subtotal, a double rule under a
// grand total, and indented line items under section headings. Drawn with crisp
// jsPDF vector primitives (no rasterisation), so text stays sharp at any zoom.
//
// Row semantics — a report model can tag any row to change how it prints:
//   __section : a section heading ("Current assets") — bold, no figures
//   __total   : a subtotal — bold, hairline rule above the figure columns
//   __grand   : a grand total — bold, tinted band, double rule under figures
//   __level   : indent depth (0,1,2…) for the label column
//   __spacer  : blank vertical gap
// Untagged rows are ordinary line items. Every export format (PDF/print here,
// xlsx in xlsxExport.js, CSV below) reads the same tags, so the three stay in
// agreement instead of drifting apart.
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

// ── PDF character safety ────────────────────────────────────────────────────
// jsPDF's built-in Helvetica can only encode WinAnsi (CP1252). A character
// outside it doesn't merely render as a wrong glyph: jsPDF measures the string
// one way and draws it another, so splitTextToSize wraps in the wrong place and
// the cell bleeds sideways into its neighbour. Ledger narrations are full of
// these — "Transfer — Cash in Hand → Bank" uses U+2192 — so anything the font
// can't encode is folded to an ASCII equivalent BEFORE it is measured.
const WINANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const CHAR_FALLBACKS = {
  '→': '->', '←': '<-', '↑': '^', '↓': 'v', '↔': '<->',
  '⇒': '=>', '⇐': '<=', '➜': '->', '➔': '->',
  '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '∞': 'inf',
  '✓': 'Yes', '✔': 'Yes', '✗': 'No', '✘': 'No', '★': '*', '☆': '*',
  '₨': 'Rs.', '₹': 'Rs.', '∑': 'Total', '−': '-', '‑': '-', '―': '-',
  // Invisible spacing characters, spelled as escapes rather than pasted in as
  // literals so they stay visible to anyone reading this file.
  '\u00A0': ' ',  // no-break space
  '\u200B': '',   // zero-width space
  '\u200C': '',   // zero-width non-joiner
  '\u2007': ' ',  // figure space
  '\u2009': ' ',  // thin space
  '\u202F': ' ',  // narrow no-break space
};

function toPdfSafe(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (!s) return s;
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code <= 0x7f) { out += ch; continue; }
    const mapped = CHAR_FALLBACKS[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    // Latin-1 and the CP1252 extras (curly quotes, en/em dashes, ellipsis…)
    // are all encodable and pass through untouched.
    if ((code >= 0xa0 && code <= 0xff) || WINANSI_EXTRAS.has(ch)) { out += ch; continue; }
    out += '?';
  }
  return out;
}

// Every string drawn into a PDF goes through this: Urdu folded to English, then
// anything the font can't encode folded to ASCII. The spreadsheet and CSV
// writers deliberately skip it — they handle Unicode natively.
const pdfText = (v) => toPdfSafe(toEnglishText(v));

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
// On-screen money. A zero reads as "—" here because in a dense transaction
// table an empty Bonus/Discount column genuinely means "nothing here".
// Printed statements deliberately do NOT use this — see amount() below.
export const money = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || val === 0) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

// Quantity/weight fields (kg) — always exactly one decimal place, e.g. 5 → "5.0 kg", 5.25 → "5.3 kg"
export const qty = (n) =>
  `${(parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

// Statement money. A genuine zero prints as "0", not a dash: on a balance sheet
// a dash means "no such line", and a column of dashes reads as a failed fetch.
// The currency symbol appears on the first figure of a group and on totals only,
// never repeated down every row.
//
// A negative figure is printed one of three ways, because "negative" means three
// different things on a financial statement and a reader must be able to tell
// them apart at a glance:
//
//   accounting (default) — (50,000). A line item that is genuinely negative:
//     an overdrawn bank account, an accumulated deficit. Something is abnormal.
//
//   signed — -50,000. A TOTAL that came out negative: a net loss, a net decrease
//     in cash. Parentheses on a total read as "this total is a deduction from
//     something above it", which is not what a bottom line means.
//
//   absolute — 50,000. A CONTRA account (Accumulated Depreciation, Treasury
//     Stock, Drawings), which is negative purely by design and is presented as a
//     positive figure under a "Less:" label. Its stored value stays negative, so
//     every total still subtracts it correctly — only the presentation changes.
export function amount(n, { currency = false, style = 'accounting' } = {}) {
  const val = parseFloat(n);
  if (n === null || n === undefined || n === '' || isNaN(val)) return '';
  const abs = Math.abs(val).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  if (style === 'absolute' || val >= 0) return currency ? `Rs. ${abs}` : abs;
  if (style === 'signed') return currency ? `-Rs. ${abs}` : `-${abs}`;
  return currency ? `Rs. (${abs})` : `(${abs})`;
}

// True when a row represents a contra account. Accepts the backend's own
// `is_contra` as well as the engine's `__contra` tag, so a page can hand report
// rows straight through without remapping them.
export const isContraRow = (row) => !!(row && (row.__contra || row.is_contra));

// A contra account is presented as a deduction from its section, so its label
// carries the "Less:" that makes the positive figure beside it unambiguous.
export const contraLabel = (name) => {
  const s = asText(name).trim();
  if (!s) return s;
  return /^less\s*:/i.test(s) ? s : `Less: ${s}`;
};

// True when a row is a computed RESULT — this period's net profit/loss folded
// into a statement as a single figure — rather than an account's own balance.
// "Current Period Earnings" on the balance sheet is the canonical case: the
// backend plugs the unclosed P&L balance in as an equity line so the sheet
// still balances before the year is closed. It is the exact same figure the
// P&L statement shows as its own grand total, so it must read the same way:
// signed when negative ("-Rs. 119,604"), not bracketed as if the BALANCE were
// abnormal — the account is a placeholder for a result, not itself the finding.
// Accepts the backend's own `is_result` as well as the engine's `__signed`
// tag, so a page can hand report rows straight through without remapping them.
export const isResultRow = (row) => !!(row && (row.__signed || row.is_result));

const asText = (v) => (v === null || v === undefined ? '' : String(v));
const isNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v));

// ── Document palette ────────────────────────────────────────────────────────
// Ink-on-paper first: every figure and label is near-black so it survives a
// cheap office laser printer and a photocopy. Colour is used only for the
// letterhead rule and as a pale tint behind headers and grand totals — the same
// restraint published balance sheets use.
const INK = [17, 24, 39];          // body text / figures
const INK_SOFT = [71, 85, 105];    // captions, contact line
const INK_FAINT = [148, 163, 175]; // page footer
const RULE_HAIR = [214, 220, 229]; // row separators
const RULE_MID = [148, 163, 175];  // under column headers
const RULE_TOTAL = [30, 41, 59];   // above subtotals / under grand totals
const BRAND = [30, 58, 138];       // letterhead name + title
const BAND = [219, 234, 254];      // pale blue — header + grand-total bands

// Draw an uploaded logo (data URL / image URL) on the left of a jsPDF letterhead.
// Returns nothing; silently skips anything jsPDF can't decode.
function drawPdfLogo(doc, logo, x, y, maxW, maxH) {
  if (!logo) return 0;
  try {
    const props = doc.getImageProperties(logo);
    let w = maxW, h = (w * props.height) / props.width;
    if (h > maxH) { h = maxH; w = (h * props.width) / props.height; }
    doc.addImage(logo, props.fileType || 'PNG', x, y, w, h);
    return w;
  } catch { return 0; /* invalid logo — ignore */ }
}

function cellAlign(col) {
  return col.align || (col.money || col.qty || col.numeric ? 'right' : 'left');
}
const isFigureCol = (col) => !!(col.money || col.qty || col.numeric);

// Resolve a column definition + row into a display string.
// Column: { header, key, align?, money?, numeric?, qty?, render?(row) }
function cellText(col, row, { currency = false, style = 'accounting' } = {}) {
  const v = col.render ? col.render(row) : row[col.key];
  if (v === null || v === undefined) return '';
  if (col.money) return isNum(v) ? amount(v, { currency, style }) : asText(v);
  if (col.qty) return qty(v);
  if (col.numeric) return isNum(v) ? amount(v, { style }) : asText(v);
  return asText(v);
}

// Which of the three negative presentations a row's figures use. A total is a
// bottom line (signed), a contra account is a deduction (absolute), anything
// else that is negative is genuinely abnormal (accounting parentheses).
function rowAmountStyle(kind, row) {
  if (kind === 'total' || kind === 'grand') return 'signed';
  // A result row (see isResultRow) needs none of a total's bold/ruled weight —
  // just the number convention: signed when negative, never bracketed.
  if (isResultRow(row)) return 'signed';
  if (isContraRow(row)) return 'absolute';
  return 'accounting';
}

const nowStamp = () => new Date().toLocaleString('en-PK');

// Column relative widths → absolute mm within the available table width.
function resolveWidths(columns, tableWidth) {
  const weights = columns.map(c => c.width || 1);
  const totalW = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => (w / totalW) * tableWidth);
}

// Longest run of characters with no space in it — the part that cannot be
// wrapped without mangling it.
function widestToken(text) {
  const s = asText(text);
  if (!s) return '';
  return s.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
}

const rowKind = (row) => {
  if (!row || typeof row !== 'object') return 'item';
  if (row.__spacer) return 'spacer';
  if (row.__section) return 'section';
  if (row.__grand) return 'grand';
  if (row.__total || row.__subtotal) return 'total';
  return 'item';
};

/* ══════════════════════════════════════════════════════════════════════════
   PDF engine (jsPDF vector) — shared by list reports & multi-section documents
   ══════════════════════════════════════════════════════════════════════════ */
function createWriter(company, { title, subtitle, meta = [], filters = [], orientation = 'portrait' }) {
  const engCompany = {
    ...company,
    name: pdfText(company.name),
    address: pdfText(company.address),
    phone: pdfText(company.phone),
    email: pdfText(company.email),
    owner_name: pdfText(company.owner_name)
  };
  const engTitle = pdfText(title);
  const engSubtitle = pdfText(subtitle);
  const engMeta = meta.map(pdfText);
  const engFilters = filters.map(f => ({
    label: pdfText(f.label),
    value: pdfText(f.value)
  }));

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientation === 'landscape' ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const lineH = 4.0, padY = 1.35, padX = 2.2;
  const footerReserve = 16;
  let pageNo = 1;
  let y = 0;

  const setInk = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const hLine = (x1, x2, yy, rgb, w) => {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(w);
    doc.line(x1, yy, x2, yy);
  };

  // Typographic letterhead: company name and contact set in ink on white, closed
  // by a brand rule. A heavy full-bleed colour band behind reversed white text
  // is the single loudest thing a printed report can do — it eats toner, greys
  // out on a photocopy, and reads as a template rather than company stationery.
  const drawLetterhead = (full) => {
    const contact = [
      engCompany.address,
      engCompany.phone && `Ph: ${engCompany.phone}`,
      engCompany.email,
    ].filter(Boolean).join('   ·   ');

    // Company block centred over the page, with the logo held at the left
    // margin — the arrangement letterhead stationery actually uses, and it puts
    // the company name on the same centre line as the document title below it.
    const top = margin;
    const logoW = drawPdfLogo(doc, engCompany.logo_url, margin, top, 24, 14);
    const centreX = pageW / 2;

    let yy = top + 5.6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); setInk(BRAND);
    doc.text(engCompany.name || 'Company', centreX, yy, { align: 'center' });
    yy += 4.6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); setInk(INK_SOFT);
    if (contact) { doc.text(contact, centreX, yy, { align: 'center' }); yy += 3.8; }
    if (engCompany.owner_name) {
      doc.text(`Proprietor: ${engCompany.owner_name}`, centreX, yy, { align: 'center' });
      yy += 3.8;
    }

    yy = Math.max(yy, top + (logoW ? 15 : 0)) + 1.5;
    hLine(margin, pageW - margin, yy, BRAND, 0.7);
    hLine(margin, pageW - margin, yy + 0.9, RULE_MID, 0.15);
    yy += 7.5;

    // Document title, centred and letter-spaced — the statement's own headline,
    // distinct from the company's.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); setInk(INK);
    doc.text((engTitle || 'Document').toUpperCase(), pageW / 2, yy, { align: 'center', charSpace: 0.4 });
    yy += 4.8;

    // The period line ("As at 30 June 2026" / "1 Jan – 30 Jun 2026") belongs
    // directly under the title on a financial statement — it is part of the
    // statement's identity, not a filter footnote.
    if (engSubtitle) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setInk(INK_SOFT);
      doc.text(engSubtitle, pageW / 2, yy, { align: 'center' });
      yy += 4.6;
    }

    if (full) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); setInk(INK_SOFT);
      if (engFilters.length) {
        const fLine = engFilters.map(f => `${f.label}: ${f.value}`).join('     ·     ');
        const wrapped = doc.splitTextToSize(fLine, contentW);
        doc.text(wrapped, pageW / 2, yy, { align: 'center' });
        yy += wrapped.length * 3.6;
      }
      if (engMeta.length) {
        const mLine = engMeta.join('     ·     ');
        const wrapped = doc.splitTextToSize(mLine, contentW);
        doc.text(wrapped, pageW / 2, yy, { align: 'center' });
        yy += wrapped.length * 3.6;
      }
      yy += 1.5;
    }
    return yy + 2.5;
  };

  const drawFooter = () => {
    hLine(margin, pageW - margin, pageH - 11, RULE_HAIR, 0.15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); setInk(INK_FAINT);
    doc.text(engCompany.name || '', margin, pageH - 7.6);
    doc.text(`Generated ${nowStamp()}`, pageW / 2, pageH - 7.6, { align: 'center' });
    doc.text(`Page ${pageNo}`, pageW - margin, pageH - 7.6, { align: 'right' });
    doc.setFontSize(6.2);
    doc.text(SOFTWARE_CREDIT, pageW / 2, pageH - 4, { align: 'center' });
  };

  y = drawLetterhead(true);

  // While a table is being drawn this holds a callback that re-draws its column
  // header band, so a ledger running to five pages identifies its columns on
  // every one of them instead of only the first. Cleared when the table ends.
  // (The xlsx writer does the same thing via pageSetup.printTitlesRow.)
  let repeatHeader = null;
  let inRepeat = false;

  const ensure = (need) => {
    if (y + need > pageH - footerReserve) {
      drawFooter(); doc.addPage(); pageNo += 1; y = drawLetterhead(false);
      if (repeatHeader && !inRepeat) {
        // Guarded: the header is itself drawn with drawRow, which calls ensure.
        inRepeat = true;
        try { repeatHeader(); } finally { inRepeat = false; }
      }
      return true;
    }
    return false;
  };

  // Wrap a row's cells to their column widths and return the height it will
  // occupy, stashing the wrapped lines on each cell for drawing. Separated from
  // drawRow so a row's height can be known BEFORE committing to draw it — which
  // is what lets a multi-row voucher be measured whole and kept off a page it
  // doesn't fit on.
  const layoutRow = (cells, widths, { bold = false, size = 8.8, indent = 0, minH = 0 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    let maxLines = 1;
    cells.forEach((c, i) => {
      const extra = i === 0 ? indent : 0;
      c._lines = doc.splitTextToSize(asText(c.text), Math.max(6, widths[i] - padX * 2 - extra));
      maxLines = Math.max(maxLines, c._lines.length);
    });
    return Math.max(minH, maxLines * lineH + padY * 2);
  };

  // Draw one row of cells. Rules are horizontal only — no cell boxes, no
  // vertical dividers. `ruleTop`/`ruleBottom` accept 'figures' to span only the
  // numeric columns, which is what puts an accounting subtotal rule directly
  // over the figures it sums instead of across the whole page.
  const drawRow = (cells, widths, {
    bold = false, size = 8.8, fill = null, ink = INK, indent = 0,
    ruleTop = null, ruleBottom = null, doubleBottom = false,
    figureStart = null, minH = 0, caps = false, reserve = 0,
  } = {}) => {
    const totalW = widths.reduce((a, b) => a + b, 0);
    const rowH = layoutRow(cells, widths, { bold, size, indent, minH });
    // `reserve` keeps a row glued to what must follow it — a subtotal is never
    // stranded at the top of a fresh page away from the figures it sums.
    ensure(rowH + (ruleBottom ? 1.5 : 0) + reserve);

    // ensure() may have started a new page, and drawing the letterhead there
    // leaves ITS font selected — 12.5pt bold, the document title. The row's
    // height and line breaks were already measured at the row's own size, so
    // drawing at the letterhead's size made the first row of every continuation
    // page render oversized: too wide for its column (clipped at the right edge)
    // and overlapping the rows beneath it. Re-select the row's font here, after
    // any page break, and before a single glyph is drawn.
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);

    if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(margin, y, totalW, rowH, 'F'); }

    // A rule scoped to 'figures' starts at the first numeric column.
    const ruleX1 = (scope) => {
      if (scope !== 'figures' || figureStart === null) return margin;
      return margin + widths.slice(0, figureStart).reduce((a, b) => a + b, 0);
    };
    if (ruleTop) {
      hLine(ruleX1(ruleTop.scope), margin + totalW, y, ruleTop.color || RULE_TOTAL, ruleTop.width ?? 0.35);
    }

    setInk(ink);
    let x = margin;
    cells.forEach((c, i) => {
      const extra = i === 0 ? indent : 0;
      let tx = x + padX + extra;
      if (c.align === 'right') tx = x + widths[i] - padX;
      else if (c.align === 'center') tx = x + widths[i] / 2;
      const capsCell = caps && i === 0;
      doc.text(capsCell ? c._lines.map(l => l.toUpperCase()) : c._lines, tx, y + padY + lineH - 1.3, {
        align: c.align || 'left',
        charSpace: capsCell ? 0.25 : 0,
      });
      x += widths[i];
    });

    y += rowH;
    if (ruleBottom) {
      hLine(ruleX1(ruleBottom.scope), margin + totalW, y, ruleBottom.color || RULE_TOTAL, ruleBottom.width ?? 0.35);
      if (doubleBottom) {
        hLine(ruleX1(ruleBottom.scope), margin + totalW, y + 0.9, ruleBottom.color || RULE_TOTAL, ruleBottom.width ?? 0.35);
        y += 0.9;
      }
    }
  };

  // Proportional column widths, then widened so no column ends up narrower than
  // the longest unbreakable token it must hold. A code like "EMP-0001" or an
  // invoice number has no space to wrap at, so a column too narrow for it does
  // not wrap gracefully — it shatters the code across two lines and doubles the
  // height of every row in the table. Space is reclaimed from whichever columns
  // still have slack, so the table keeps its full width either way.
  const fitWidths = (columns, rows, statement, totals) => {
    const base = resolveWidths(columns, contentW);
    const sample = rows.length > 400 ? rows.slice(0, 400) : rows;
    const maxLevel = sample.reduce((m, r) => Math.max(m, (r && r.__level) || 0), 0);

    // Text columns only need to fit their longest unbreakable word — the rest
    // can wrap. Figure columns must fit their whole contents: "Rs. 1,608,300"
    // has a space in it, and wrapping there strands "Rs." on its own line.
    // Measures the same sanitised string that will actually be drawn — "→"
    // becomes "->" and changes width, so measuring the raw text would put the
    // fitting back out of step with the rendering.
    const measure = (text, { bold = false, size = 8.8, full = false } = {}) => {
      const safe = pdfText(text);
      const s = full ? asText(safe) : widestToken(safe);
      if (!s) return 0;
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      return doc.getTextWidth(s);
    };

    const need = columns.map((col, i) => {
      // Only the DATA in a figure column must stay on one line. A header is a
      // short label that wraps perfectly well onto two lines — forcing e.g.
      // "Capital (Cash + Bank)" to fit unbroken would hand that column a third
      // of the page and squeeze every other column into wrapping instead.
      const full = isFigureCol(col);
      let w = measure(col.header, { bold: true, size: 8.6 });

      sample.forEach(row => {
        const kind = rowKind(row);
        if (kind === 'spacer') return;
        // Totals and section headings are set bold and a little larger, so they
        // need measuring at their own size — measuring everything at body size
        // is what let the "Total" row wrap its own figures.
        const bold = kind !== 'item';
        const size = kind === 'grand' ? 9.4 : kind === 'total' ? 9 : kind === 'section' ? 9.4 : 8.8;
        const text = kind === 'section'
          ? (i === 0 ? asText(row[col.key] ?? row.label ?? row.account_name ?? '') : '')
          : cellText(col, row, {
            currency: (statement && isFigureCol(col)) || kind === 'total' || kind === 'grand',
            style: rowAmountStyle(kind, row),
          });
        w = Math.max(w, measure(text, { bold, size, full }));
      });

      // The trailing totals row is drawn bold at 9.4 with the currency symbol —
      // wider than anything in the body, and previously not measured at all.
      if (totals) {
        const text = i === 0 && totals.__label !== undefined
          ? asText(totals.__label || 'Total')
          : totals[col.key] !== undefined
            ? (col.money ? amount(totals[col.key], { currency: true, style: 'signed' })
              : col.qty ? qty(totals[col.key])
                : col.numeric ? amount(totals[col.key], { style: 'signed' })
                  : asText(totals[col.key]))
            : '';
        w = Math.max(w, measure(text, { bold: true, size: 9.4, full }));
      }

      // The label column also has to fit its deepest indent. The 1mm is slack
      // against rounding, so a cell that measures as an exact fit isn't wrapped
      // by a fraction of a millimetre.
      return Math.min(w + padX * 2 + 1 + (i === 0 ? maxLevel * 5 : 0), contentW * 0.5);
    });

    const widths = base.slice();
    let deficit = 0;
    columns.forEach((c, i) => {
      if (widths[i] < need[i]) { deficit += need[i] - widths[i]; widths[i] = need[i]; }
    });
    if (deficit <= 0) return widths;

    const slack = widths.map((w, i) => Math.max(0, w - need[i]));
    const totalSlack = slack.reduce((a, b) => a + b, 0);
    if (totalSlack <= 0) {
      // Every column is already at its minimum — scale them all down together
      // rather than let the table run off the edge of the page.
      const total = widths.reduce((a, b) => a + b, 0);
      return widths.map(w => (w / total) * contentW);
    }
    const take = Math.min(deficit, totalSlack);
    return widths.map((w, i) => w - (slack[i] / totalSlack) * take);
  };

  return {
    doc,
    space(mm) { y += mm; },

    heading(text) {
      ensure(13);
      y += 1;
      doc.setFillColor(BAND[0], BAND[1], BAND[2]);
      doc.rect(margin, y, contentW, 7.2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); setInk(BRAND);
      doc.text(asText(pdfText(text)).toUpperCase(), margin + 3, y + 4.9, { charSpace: 0.4 });
      y += 10;
    },

    // Label/value block for record details. Two columns, hairline separated —
    // no boxes, so it reads as a form rather than a spreadsheet.
    kv(rows) {
      const widths = [contentW * 0.34, contentW * 0.66];
      const list = rows.filter(Boolean);
      list.forEach((r, idx) => {
        drawRow([
          { text: pdfText(r.label), align: 'left' },
          { text: pdfText(asText(r.value)), align: 'left' },
        ], widths, {
          ink: INK,
          ruleBottom: idx === list.length - 1
            ? { color: RULE_HAIR, width: 0.15 }
            : { color: RULE_HAIR, width: 0.1 },
        });
      });
    },

    /**
     * Render a table. Rows may carry the __section/__total/__grand/__level tags
     * documented at the top of this file; untagged rows print as line items.
     */
    table({ columns, rows = [], totals, groupKey, statement = false }) {
      const engColumns = columns.map(c => ({ ...c, header: pdfText(c.header) }));
      const widths = fitWidths(engColumns, rows, statement, totals);
      const figureStart = engColumns.findIndex(isFigureCol);
      const fs = figureStart === -1 ? null : figureStart;

      // Column headers: pale band, dark text, a rule beneath. No fill on the
      // body rows, so the header is the only tinted thing on the page and the
      // eye goes straight to it.
      const drawHeader = () => drawRow(
        engColumns.map(c => ({ text: c.header, align: cellAlign(c) })),
        widths,
        {
          bold: true, size: 8.6, fill: BAND, ink: BRAND, figureStart: fs,
          ruleBottom: { color: RULE_MID, width: 0.3 }, minH: 8,
        }
      );
      drawHeader();
      repeatHeader = drawHeader;

      if (!rows.length) {
        drawRow([{ text: 'No records.', align: 'center' }], [contentW], {
          ink: INK_SOFT, size: 8.6, minH: 10,
          ruleBottom: { color: RULE_HAIR, width: 0.15 },
        });
      }

      // In statement mode the currency symbol is printed once per section (on
      // its first figure) and on every total — repeating "Rs." down 40 rows is
      // the single clearest tell of a machine-generated report.
      let needCurrency = statement;

      // Height of the run of spacer/subtotal/grand-total rows that immediately
      // follows row `from`. The last line item of a section reserves it so the
      // section's own total can never be pushed onto the next page alone —
      // an orphaned "Total Liabilities & Equity" is the classic broken-looking
      // export, and it is exactly what a balance sheet must not do.
      const tailReserve = (from) => {
        let h = 0;
        for (let i = from; i < rows.length; i++) {
          const k = rowKind(rows[i]);
          if (k === 'spacer') { h += 3; continue; }
          if (k === 'total') { h += 8; continue; }
          if (k === 'grand') { h += 11; continue; }
          break;
        }
        return h;
      };

      // Cells for an ordinary line item — built here so a row can be measured
      // without being drawn.
      const itemCells = (row) => engColumns.map(c => ({
        text: pdfText(cellText(c, row, { currency: false })),
        align: cellAlign(c),
      }));

      // A grouped report (a general ledger keyed on voucher number) has rows
      // that are one indivisible record: the debit and credit legs of a single
      // double-entry voucher. Splitting them across a page break shows a reader
      // half a transaction and makes the two pages appear not to balance, so the
      // first leg reserves the height of every remaining leg — if the whole
      // voucher doesn't fit in what's left of the page, all of it moves over.
      // Returns the combined height of the rows after `from` that belong to the
      // same group, and the index of the first row past the group.
      const groupSpan = (from) => {
        if (!groupKey) return { height: 0, end: from + 1 };
        const key = rows[from][groupKey];
        if (key === undefined || key === null) return { height: 0, end: from + 1 };
        let height = 0;
        let i = from + 1;
        while (i < rows.length && rowKind(rows[i]) === 'item' && rows[i][groupKey] === key) {
          height += layoutRow(itemCells(rows[i]), widths, { indent: (rows[i].__level || 0) * 5 });
          i += 1;
        }
        return { height, end: i };
      };

      rows.forEach((row, idx) => {
        const kind = rowKind(row);
        const nextRow = rows[idx + 1];
        const level = row.__level || 0;
        const indent = level * 5;

        if (kind === 'spacer') { ensure(3); y += 3; return; }

        if (kind === 'section') {
          y += 2;
          drawRow(
            engColumns.map((c, i) => ({
              text: i === 0 ? pdfText(asText(row[c.key] ?? row.label ?? row.account_name ?? '')) : '',
              align: cellAlign(c),
            })),
            widths,
            {
              bold: true, size: 9.4, ink: BRAND, indent, figureStart: fs,
              // A heading alone at the foot of a page is a dangling promise —
              // hold back enough room for it plus its first couple of lines.
              reserve: 16,
            }
          );
          needCurrency = statement; // restart the symbol for the new section
          return;
        }

        if (kind === 'total' || kind === 'grand') {
          const grand = kind === 'grand';
          drawRow(
            engColumns.map(c => ({
              text: pdfText(cellText(c, row, {
                currency: statement && isFigureCol(c),
                style: rowAmountStyle(kind, row),
              })),
              align: cellAlign(c),
            })),
            widths,
            {
              bold: true,
              size: grand ? 9.4 : 9,
              ink: INK,
              fill: grand ? BAND : null,
              indent: grand ? 0 : indent,
              figureStart: fs,
              ruleTop: { scope: 'figures', color: RULE_TOTAL, width: grand ? 0.4 : 0.3 },
              ruleBottom: grand ? { scope: 'figures', color: RULE_TOTAL, width: 0.4 } : null,
              doubleBottom: grand,
              minH: grand ? 8.5 : 0,
            }
          );
          if (grand) y += 1.5;
          needCurrency = false;
          return;
        }

        // Ordinary line item. Separator suppressed inside a group (attendance
        // uses this to keep one employee's days visually welded together).
        const sameGroup = groupKey && nextRow && nextRow[groupKey] === row[groupKey];
        const showCurrency = needCurrency;
        if (showCurrency) needCurrency = false;

        // Only the FIRST row of a group reserves the rest of it. Reserving on
        // every row would push each leg over individually and defeat the point.
        const prevRow = rows[idx - 1];
        const startsGroup = !!groupKey
          && (!prevRow || rowKind(prevRow) !== 'item' || prevRow[groupKey] !== row[groupKey]);
        const span = startsGroup ? groupSpan(idx) : null;
        let reserve = span
          ? span.height + tailReserve(span.end)
          : tailReserve(idx + 1);

        // A group taller than a page can never be kept whole, and reserving for
        // it would break to a fresh page that cannot hold it either — costing a
        // near-empty page and changing nothing. Let those flow instead.
        if (span && reserve > pageH - footerReserve - 60) reserve = tailReserve(idx + 1);

        drawRow(
          engColumns.map(c => ({
            text: pdfText(cellText(c, row, {
              currency: showCurrency && isFigureCol(c),
              style: rowAmountStyle(kind, row),
            })),
            align: cellAlign(c),
          })),
          widths,
          {
            ink: INK, indent, figureStart: fs,
            ruleBottom: statement || sameGroup ? null : { color: RULE_HAIR, width: 0.1 },
            reserve,
          }
        );
      });

      // Trailing totals object (the pre-existing `totals` prop) prints as the
      // grand total when the rows themselves didn't already carry one.
      if (totals) {
        drawRow(
          engColumns.map((c, i) => {
            if (i === 0 && totals.__label !== undefined) {
              return { text: pdfText(totals.__label || 'Total'), align: 'left' };
            }
            if (totals[c.key] !== undefined) {
              return {
                // A bottom line that came out negative prints signed, not in
                // parentheses — see amount().
                text: c.money ? amount(totals[c.key], { currency: true, style: 'signed' })
                  : c.qty ? qty(totals[c.key])
                    : c.numeric ? amount(totals[c.key], { style: 'signed' })
                      : pdfText(asText(totals[c.key])),
                align: cellAlign(c),
              };
            }
            return { text: '', align: cellAlign(c) };
          }),
          widths,
          {
            bold: true, size: 9.4, ink: INK, fill: BAND, figureStart: fs, minH: 8.5,
            ruleTop: { scope: 'figures', color: RULE_TOTAL, width: 0.4 },
            ruleBottom: { scope: 'figures', color: RULE_TOTAL, width: 0.4 },
            doubleBottom: true,
          }
        );
        y += 1.5;
      } else if (rows.length && !statement) {
        hLine(margin, pageW - margin, y, RULE_MID, 0.25);
      }

      // The table is finished — a later page break (a note, a signature, the
      // next table) must not resurrect this table's header.
      repeatHeader = null;
    },

    // A single line of text under the table — e.g. a headcount summary
    // ("12 active, 3 suspended, 2 terminated"). Deliberately its own concept
    // rather than an extra totals cell: a summary squeezed into one narrow
    // column wraps into an unreadable stack. Rendered by every export format
    // (print/PDF here, CSV below, xlsx in xlsxExport.js) so they agree.
    note(text) {
      if (!text) return;
      const engText = pdfText(asText(text));
      const lines = doc.splitTextToSize(engText, contentW);
      ensure(lines.length * lineH + 5);
      y += 3.5;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.2); setInk(INK_SOFT);
      doc.text(lines, margin, y + lineH - 1.3);
      y += lines.length * lineH + 2;
    },

    // Signature block, at the foot of the page where it belongs. It only starts
    // a new page when the block genuinely cannot fit in what's left — the old
    // rule reserved the full block height plus slack from the bottom margin, so
    // a table that comfortably filled a page still exiled two signature lines
    // onto a sheet that was otherwise blank.
    signature(left = 'Prepared By', right = 'Received / Verified By') {
      const blockH = 26;
      const gap = 10;
      const bottomLimit = pageH - footerReserve;
      if (y + gap + blockH > bottomLimit) {
        drawFooter(); doc.addPage(); pageNo += 1; y = drawLetterhead(false);
      }
      // Sink to the foot of the sheet when there's room, but never pull upward
      // into content already drawn.
      y = Math.max(y + gap, bottomLimit - blockH);

      const colW = contentW / 2;
      hLine(margin, margin + colW - 16, y, INK, 0.3);
      hLine(margin + colW + 6, pageW - margin, y, INK, 0.3);
      y += 4.2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); setInk(INK);
      doc.text(pdfText(left), margin, y);
      doc.text(pdfText(right), margin + colW + 6, y);
      y += 3.8;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); setInk(INK_FAINT);
      doc.text('Signature / Stamp', margin, y);
      doc.text('Signature / Stamp', margin + colW + 6, y);
      y += 6;
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

// A report is a "statement" when its rows carry accounting structure. Detected
// rather than declared, so the five financial statements get the published-
// accounts treatment automatically once they tag their rows — no page has to
// remember to pass a style flag.
export function isStatementModel(rows = []) {
  return rows.some(r => r && (r.__section || r.__total || r.__grand || r.__subtotal));
}

// List report: one table + optional totals + optional signature.
function buildReportWriter({
  company = {}, title, subtitle, meta = [], filters = [], columns, rows = [],
  totals, note, signature, groupKey, orientation, statement,
}) {
  const w = createWriter(company, { title, subtitle, meta, filters, orientation });
  w.table({
    columns, rows, totals, groupKey,
    statement: statement ?? isStatementModel(rows),
  });
  w.note(note);
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
function buildDocumentWriter({
  company = {}, title, subtitle, meta = [], filters = [], sections = [],
  table, tables, note, signature, groupKey, orientation,
}) {
  const w = createWriter(company, { title, subtitle, meta, filters, orientation });
  sections.forEach(s => {
    if (s.heading) w.heading(s.heading);
    w.kv(s.rows || []);
    w.space(3);
  });
  const allTables = [...(table ? [table] : []), ...(tables || [])];
  allTables.forEach(tb => {
    if (tb.heading) w.heading(tb.heading);
    w.table({ ...tb, groupKey, statement: tb.statement ?? isStatementModel(tb.rows || []) });
    w.space(4);
  });
  w.note(note);
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

/* ══════════════════════════════════════════════════════════════════════════
   CSV fallback. The primary Excel path is the real .xlsx writer in
   xlsxExport.js; these remain for callers that explicitly want plain CSV
   (and as a safety net if the spreadsheet writer ever fails to load).
   ══════════════════════════════════════════════════════════════════════════ */
const csvCell = (v) => `"${asText(toEnglishText(v)).replace(/"/g, '""')}"`;

// Figures go out as bare numbers, not "Rs. 1,234" — a CSV whose money column is
// text can't be summed, sorted, or charted, which defeats the point of it.
function csvValue(col, row) {
  const v = col.render ? col.render(row) : (col.key ? row[col.key] : '');
  if ((col.money || col.qty || col.numeric) && isNum(v)) return String(parseFloat(v));
  return csvCell(v);
}

function triggerDownload(blob, fname) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadReportExcel(payload) {
  const { company = {}, title, subtitle, columns = [], rows = [], totals, note, filters, filename } = payload;
  let csv = '\uFEFF';

  csv += `${csvCell(company.name || 'Business Report')}\n`;
  csv += `${csvCell(title || 'Report')}\n`;
  if (subtitle) csv += `${csvCell(subtitle)}\n`;
  if (filters?.length) {
    csv += `${csvCell(filters.map(f => `${toEnglishText(f.label || f.key || '')}: ${toEnglishText(f.value || '')}`).join(' | '))}\n`;
  }
  csv += '\n';

  csv += `${columns.map(c => csvCell(c.header || '')).join(',')}\n`;

  rows.forEach(r => {
    const kind = rowKind(r);
    if (kind === 'spacer') { csv += '\n'; return; }
    csv += `${columns.map(c => csvValue(c, r)).join(',')}\n`;
  });

  if (totals) {
    csv += `${columns.map((c, idx) => {
      if (idx === 0) return csvCell(totals.__label || 'Total');
      if (c.key && totals[c.key] !== undefined) {
        return (c.money || c.qty || c.numeric) && isNum(totals[c.key])
          ? String(parseFloat(totals[c.key]))
          : csvCell(totals[c.key]);
      }
      return '""';
    }).join(',')}\n`;
  }

  // Summary line under the table, on its own row rather than inside a column —
  // same `note` the PDF/print and xlsx engines render.
  if (note) csv += `\n${csvCell(note)}\n`;

  const fname = (filename || `${(title || 'report').toLowerCase().replace(/\s+/g, '-')}.csv`).replace(/\.(pdf|xlsx)$/i, '.csv');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fname);
}

export function downloadDetailExcel(payload) {
  const { company = {}, title, subtitle, sections = [], table, tables, note, filename } = payload;
  let csv = '\uFEFF';

  csv += `${csvCell(company.name || 'Business Record')}\n`;
  csv += `${csvCell(title || 'Detail')}\n`;
  if (subtitle) csv += `${csvCell(subtitle)}\n`;
  csv += '\n';

  sections.forEach(sec => {
    if (sec.heading || sec.title) csv += `${csvCell(sec.heading || sec.title)}\n`;
    (sec.rows || sec.fields || []).forEach(f => {
      csv += `${csvCell(f.label)},${csvCell(f.value)}\n`;
    });
    csv += '\n';
  });

  const allTables = [...(table ? [table] : []), ...(tables || [])];
  allTables.forEach(tb => {
    if (!tb || !tb.columns || !tb.rows) return;
    if (tb.heading) csv += `${csvCell(tb.heading)}\n`;
    csv += `${tb.columns.map(c => csvCell(c.header || '')).join(',')}\n`;
    tb.rows.forEach(r => {
      if (rowKind(r) === 'spacer') { csv += '\n'; return; }
      csv += `${tb.columns.map(c => csvValue(c, r)).join(',')}\n`;
    });
    if (tb.totals) {
      csv += `${tb.columns.map((c, idx) => {
        if (idx === 0) return csvCell(tb.totals.__label || 'Total');
        if (c.key && tb.totals[c.key] !== undefined) {
          return (c.money || c.qty || c.numeric) && isNum(tb.totals[c.key])
            ? String(parseFloat(tb.totals[c.key]))
            : csvCell(tb.totals[c.key]);
        }
        return '""';
      }).join(',')}\n`;
    }
    csv += '\n';
  });

  if (note) csv += `${csvCell(note)}\n`;

  const fname = (filename || `${(title || 'detail').toLowerCase().replace(/\s+/g, '-')}.csv`).replace(/\.(pdf|xlsx)$/i, '.csv');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fname);
}
