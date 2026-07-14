import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PrintStyles, PrintActionBar, CompanyHeader,
  AmountWords, SignatureRow, DocFooter,
  INK, INK_SOFT,
} from '../../components/print/PrintKit';

// ─── number formatter ────────────────────────────────────────────────────────
const fmt = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || val === 0) return '—';
  return val.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB'); // dd/mm/yyyy
};

// ─── Dr / Cr line builder ────────────────────────────────────────────────────
function buildLines(module, txnType, entityName, amount, method) {
  const cashAccount = method === 'bank' ? 'Bank Account' : 'Cash Account';
  const amt = parseFloat(amount) || 0;
  const dr = (account) => ({ side: 'Dr', account, val: amt });
  const cr = (account) => ({ side: 'Cr', account, val: amt });

  if (module === 'customer') {
    if (txnType === 'sale_charge')
      return [dr(entityName + ' (Customer)'), cr('Sales Revenue')];
    if (txnType === 'payment_received')
      return [dr(cashAccount), cr(entityName + ' (Customer)')];
    if (txnType === 'return_credit')
      return [dr('Sales Returns'), cr(entityName + ' (Customer)')];
    if (txnType === 'opening_balance')
      return [dr(entityName + ' (Customer)'), cr('Opening Balance Account')];
    // adjustment / default
    return [dr(entityName + ' (Customer)'), cr('General Account')];
  }

  if (module === 'supplier') {
    if (txnType === 'stock_received')
      return [dr('Inventory / Purchase Account'), cr(entityName + ' (Supplier)')];
    if (txnType === 'payment_made')
      return [dr(entityName + ' (Supplier)'), cr(cashAccount)];
    if (txnType === 'opening_balance')
      return [dr('Opening Balance Account'), cr(entityName + ' (Supplier)')];
    return [dr(entityName + ' (Supplier)'), cr('General Account')];
  }

  if (module === 'employee') {
    if (txnType === 'salary_due')
      return [dr('Salary Expense'), cr(entityName + ' (Employee)')];
    if (txnType === 'advance_given')
      return [dr(entityName + ' (Employee)'), cr(cashAccount)];
    if (txnType === 'loan_given')
      return [dr(entityName + ' (Employee)'), cr(cashAccount)];
    if (txnType === 'payment_made')
      return [dr(entityName + ' (Employee)'), cr(cashAccount)];
    if (txnType === 'loan_repayment')
      return [dr(cashAccount), cr(entityName + ' (Employee)')];
    if (txnType === 'deduction')
      return [dr('Deduction Account'), cr(entityName + ' (Employee)')];
    if (txnType === 'opening_balance')
      return [dr('Opening Balance Account'), cr(entityName + ' (Employee)')];
    return [dr(entityName + ' (Employee)'), cr('General Account')];
  }

  return [dr(entityName), cr('General Account')];
}

// ─── Voucher title ────────────────────────────────────────────────────────────
function resolveTitle(txnType) {
  if (['payment_made', 'advance_given', 'loan_given'].includes(txnType))
    return 'Payment Voucher';
  if (['payment_received', 'loan_repayment'].includes(txnType))
    return 'Receipt Voucher';
  if (txnType === 'sale_charge')   return 'Sales Voucher';
  if (txnType === 'stock_received') return 'Purchase Voucher';
  return 'Journal Voucher';
}

// ─── Paid To / Received From label ───────────────────────────────────────────
function resolvePartyLine(txnType, entityName) {
  if (['payment_made', 'advance_given', 'loan_given'].includes(txnType))
    return { label: 'Paid To', name: entityName };
  if (['payment_received', 'loan_repayment'].includes(txnType))
    return { label: 'Received From', name: entityName };
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LedgerVoucherPrint() {
  const [sp] = useSearchParams();

  const module     = sp.get('module')     || 'customer';
  const txnType    = sp.get('txnType')    || '';
  const entityName = sp.get('entityName') || 'Unknown';
  const amount     = parseFloat(sp.get('amount') || '0');
  const date       = sp.get('date')       || '';
  const method     = sp.get('method')     || '';
  const notes      = sp.get('notes')      || '';
  const voucherNo  = sp.get('voucherNo')  || '-';
  const shopName   = sp.get('shopName')   || '';
  const autoPrint  = sp.get('auto')       === '1';

  const lines       = buildLines(module, txnType, entityName, amount, method);
  const totalDebit  = lines.filter(l => l.side === 'Dr').reduce((s, l) => s + l.val, 0);
  const totalCredit = lines.filter(l => l.side === 'Cr').reduce((s, l) => s + l.val, 0);
  const docTitle    = resolveTitle(txnType);
  const partyLine   = resolvePartyLine(txnType, entityName);
  const company     = { name: shopName };

  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  // Spacer rows so the table always has some visual height
  const spacerCount = Math.max(0, 4 - lines.length);

  return (
    <>
      <PrintStyles />
      <PrintActionBar />

      <div className="sheet">
        <CompanyHeader company={company} docTitle={docTitle} />

        {/* ── Voucher No / Date ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 13, margin: '4px 0 10px', color: INK,
        }}>
          <div>
            <span style={{ color: INK_SOFT }}>Voucher No.</span>
            {'\u00a0'}<strong>: {voucherNo}</strong>
          </div>
          <div>
            <span style={{ color: INK_SOFT }}>Date</span>
            {'\u00a0'}<strong>: {fmtDate(date)}</strong>
          </div>
        </div>

        {/* ── Particulars table ── */}
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Particulars</th>
              <th className="num" style={{ width: '19%' }}>Debit ( )</th>
              <th className="num" style={{ width: '19%' }}>Credit ( )</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <strong>{l.side}</strong>
                  {'\u00a0\u00a0'}
                  {l.account}
                </td>
                <td className="num">{l.side === 'Dr' ? fmt(l.val) : '—'}</td>
                <td className="num">{l.side === 'Cr' ? fmt(l.val) : '—'}</td>
                {/* Description cell spans all entry rows */}
                {i === 0 && (
                  <td rowSpan={lines.length} style={{ verticalAlign: 'top' }}>
                    {notes || ''}
                  </td>
                )}
              </tr>
            ))}

            {/* Spacer rows for visual breathing room */}
            {Array.from({ length: spacerCount }).map((_, i) => (
              <tr key={'spacer-' + i} style={{ height: 32 }}>
                <td /><td /><td />
              </tr>
            ))}

            {/* Totals row */}
            <tr className="total">
              <td style={{ textAlign: 'right' }}></td>
              <td className="num">{fmt(totalDebit)}</td>
              <td className="num">{fmt(totalCredit)}</td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* ── Paid To / Received From strip ── */}
        {partyLine && (
          <div style={{
            border: `1px solid ${INK}`, borderTop: 'none',
            padding: '8px 10px', fontSize: 12.5,
          }}>
            <span style={{ color: INK_SOFT, fontWeight: 600 }}>
              {partyLine.label}:{' '}
            </span>
            <strong>{partyLine.name}</strong>
          </div>
        )}

        {/* ── Amount in words ── */}
        <AmountWords amount={Math.max(totalDebit, totalCredit)} />

        {/* ── Payment method note ── */}
        {method && (
          <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 6 }}>
            Payment Method:{' '}
            <strong style={{ textTransform: 'capitalize' }}>{method}</strong>
          </div>
        )}

        {/* ── Signature block ── */}
        <SignatureRow left="Prepared By" right="Receiver Sign & Thumb" />

        <DocFooter company={company} />
      </div>
    </>
  );
}
