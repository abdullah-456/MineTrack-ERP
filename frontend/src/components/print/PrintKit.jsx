import { Printer, Download, ArrowLeft } from 'lucide-react';
import { amountInWords } from '../../utils/amountInWords';

// Shared building blocks for printable business documents.
// Print-safe dark ink; signature/stamp block pins near the bottom of A4.

export const INK = '#111827';
export const INK_SOFT = '#374151';
export const LINE = '#111827';
export const LINE_SOFT = '#9ca3af';
export const BRAND = '#4338ca';
export const BRAND_ACCENT = '#059669';

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
        padding: 16mm 15mm 12mm; margin: 0 auto; box-shadow: 0 4px 32px rgba(0,0,0,0.12);
        display: flex; flex-direction: column;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .sheet-body { flex: 1 1 auto; }
      /* Signature / stamp: sit near bottom of A4, a few lines above the edge — not flush under content */
      .doc-close {
        margin-top: auto;
        padding-top: 28px;
        padding-bottom: 8mm;
        page-break-inside: avoid;
        break-inside: avoid;
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

      table.doc { width: 100%; border-collapse: collapse; font-size: 12.5px; color: ${INK}; }
      table.doc th, table.doc td { border: 1px solid ${LINE}; padding: 7px 9px; vertical-align: top; }
      table.doc thead th { background: #eef0f4; font-weight: 700; text-align: left; }
      table.doc .num { text-align: right; font-variant-numeric: tabular-nums; }
      table.doc tr.total td { font-weight: 800; background: #eef0f4; }

      @keyframes spin { to { transform: rotate(360deg); } }
      @media print {
        html, body { background: #fff !important; }
        .doc-actions { display: none !important; }
        .sheet {
          width: 100%; min-height: calc(297mm - 16mm);
          margin: 0; padding: 10mm 12mm 8mm; box-shadow: none;
        }
        .doc-close { padding-bottom: 6mm; }
        @page { size: A4; margin: 8mm; }
      }
    `}</style>
  );
}

export function CompanyHeader({ company = {}, docTitle }) {
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email]
    .filter(Boolean).join('   |   ');
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 46, margin: '-16mm -15mm 0', padding: '14px 15mm',
        background: BRAND, borderBottom: `4px solid ${BRAND_ACCENT}`,
      }}>
        {company.logo_url && (
          <img
            src={company.logo_url}
            alt=""
            style={{
              position: 'absolute', left: '15mm', top: '50%', transform: 'translateY(-50%)',
              maxHeight: 52, maxWidth: 120, objectFit: 'contain',
              background: '#fff', borderRadius: 6, padding: 3,
            }}
          />
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.3, color: '#fff' }}>
            {company.name || 'Company Name'}
          </div>
          {contact && <div style={{ fontSize: 11.5, color: '#e0e7ff', marginTop: 3 }}>{contact}</div>}
          {company.owner_name && (
            <div style={{ fontSize: 11.5, color: '#e0e7ff', marginTop: 1 }}>Proprietor: {company.owner_name}</div>
          )}
        </div>
      </div>
      {docTitle && (
        <div style={{
          textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: 1.5,
          textTransform: 'uppercase', padding: '12px 0 2px', color: '#312e81',
        }}>
          {docTitle}
        </div>
      )}
    </div>
  );
}

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

export function SignatureRow({ left = 'Prepared By', right = 'Received Sign & Thumb', center }) {
  const cell = (label, align = 'left') => (
    <div style={{ width: center ? '30%' : '42%', textAlign: align }}>
      <div style={{
        height: 42, borderBottom: `1px solid ${INK}`, marginBottom: 6,
        display: 'flex', alignItems: 'flex-end', justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
      }}>
        <span style={{ fontSize: 9, color: LINE_SOFT, fontStyle: 'italic' }}>Sign / Stamp</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
      {cell(left, 'left')}
      {center && cell(center, 'center')}
      {cell(right, 'right')}
    </div>
  );
}

export function DocFooter({ company = {} }) {
  return (
    <div style={{
      marginTop: 14, paddingTop: 8, borderTop: `1px solid ${LINE_SOFT}`,
      display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK_SOFT,
    }}>
      <span>{company.name || ''} — computer generated document</span>
      <span>Generated: {new Date().toLocaleString('en-PK')}</span>
    </div>
  );
}

/** Pin signature + stamp block near the bottom of the A4 sheet. */
export function DocClose({ company = {}, left, right, center, children }) {
  return (
    <div className="doc-close">
      {children || <SignatureRow left={left} right={right} center={center} />}
      <DocFooter company={company} />
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
