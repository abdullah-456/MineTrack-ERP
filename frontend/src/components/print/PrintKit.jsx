import { Printer, Download, ArrowLeft } from 'lucide-react';
import { amountInWords } from '../../utils/amountInWords';

// ──────────────────────────────────────────────────────────────────────────────
// Shared building blocks for every printable business document (invoices,
// receipts, vouchers). Deliberately print-safe:
//   • Dark ink on white — never white text on a coloured fill, so nothing
//     vanishes when the browser drops backgrounds.
//   • print-color-adjust: exact so the light header fills that DO help legibility
//     are still printed.
//   • Solid borders + a consistent letterhead / signature block on all docs.
// ──────────────────────────────────────────────────────────────────────────────

export const INK = '#111827';        // primary text (near-black)
export const INK_SOFT = '#374151';   // secondary text — still high-contrast
export const LINE = '#111827';       // table & box borders
export const LINE_SOFT = '#9ca3af';  // subtle internal rules

export function PrintStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        font-family: 'Inter', system-ui, Arial, sans-serif;
        background: #e5e7eb; color: ${INK};
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .sheet {
        width: 210mm; min-height: 297mm; background: #fff; color: ${INK};
        padding: 16mm 15mm; margin: 0 auto; box-shadow: 0 4px 32px rgba(0,0,0,0.12);
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .doc-actions {
        width: 210mm; margin: 12px auto; display: flex; align-items: center;
        justify-content: space-between; gap: 8px;
      }
      .doc-btn {
        display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px;
        border-radius: 8px; border: none; font: inherit; font-size: 13px;
        font-weight: 700; cursor: pointer;
      }
      .doc-btn.print { background: #4f46e5; color: #fff; }
      .doc-btn.pdf   { background: #059669; color: #fff; }
      .doc-btn.back  { background: #fff; color: ${INK_SOFT}; border: 1px solid #d1d5db; }

      /* Bordered document tables (voucher / items) */
      table.doc { width: 100%; border-collapse: collapse; font-size: 12.5px; color: ${INK}; }
      table.doc th, table.doc td { border: 1px solid ${LINE}; padding: 7px 9px; vertical-align: top; }
      table.doc thead th { background: #eef0f4; font-weight: 700; text-align: left; }
      table.doc .num { text-align: right; font-variant-numeric: tabular-nums; }
      table.doc tr.total td { font-weight: 800; background: #eef0f4; }

      @keyframes spin { to { transform: rotate(360deg); } }
      @media print {
        html, body { background: #fff !important; }
        .doc-actions { display: none !important; }
        .sheet { width: 100%; min-height: unset; margin: 0; padding: 12mm; box-shadow: none; }
        @page { size: A4; margin: 8mm; }
      }
    `}</style>
  );
}

// Letterhead — company details on top, exactly like the stationery sample.
export function CompanyHeader({ company = {}, docTitle }) {
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email]
    .filter(Boolean).join('   |   ');
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {company.logo_url && (
          <img src={company.logo_url} alt="" style={{ height: 46, objectFit: 'contain' }} />
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.3, color: INK }}>
            {company.name || 'Company Name'}
          </div>
          {contact && <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 3 }}>{contact}</div>}
          {company.owner_name && (
            <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 1 }}>Proprietor: {company.owner_name}</div>
          )}
        </div>
      </div>
      <div style={{ borderTop: `2px solid ${INK}`, margin: '10px 0 0' }} />
      {docTitle && (
        <div style={{
          textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: 1.5,
          textTransform: 'uppercase', padding: '8px 0 2px', color: INK,
        }}>
          {docTitle}
        </div>
      )}
    </div>
  );
}

// "Rupees … Only" line, boxed like the sample.
export function AmountWords({ amount, label = 'Amount in words' }) {
  return (
    <div style={{
      border: `1px solid ${LINE}`, padding: '8px 10px', marginTop: 10,
      fontSize: 12.5, color: INK,
    }}>
      <span style={{ color: INK_SOFT, fontWeight: 600 }}>{label}: </span>
      <span style={{ fontWeight: 700 }}>{amountInWords(amount)}</span>
    </div>
  );
}

// Prepared By / Received signature lines.
export function SignatureRow({ left = 'Prepared By', right = 'Received Sign & Thumb' }) {
  const cell = (label) => (
    <div style={{ width: '42%' }}>
      <div style={{ borderTop: `1px solid ${INK}`, marginBottom: 5 }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 42 }}>
      {cell(left)}
      {cell(right)}
    </div>
  );
}

export function DocFooter({ company = {} }) {
  return (
    <div style={{
      marginTop: 18, paddingTop: 8, borderTop: `1px solid ${LINE_SOFT}`,
      display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK_SOFT,
    }}>
      <span>{company.name || ''} — computer generated document</span>
      <span>Generated: {new Date().toLocaleString('en-PK')}</span>
    </div>
  );
}

export function PrintActionBar() {
  const printDoc = () => window.print();
  return (
    <div className="doc-actions">
      <button className="doc-btn back" onClick={() => window.close()}><ArrowLeft size={15} /> Close</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="doc-btn print" onClick={printDoc}><Printer size={15} /> Print</button>
        <button className="doc-btn pdf" onClick={printDoc}><Download size={15} /> Save as PDF</button>
      </div>
    </div>
  );
}
