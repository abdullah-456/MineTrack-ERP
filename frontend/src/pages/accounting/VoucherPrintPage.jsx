import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import api from '../../api/axios';
import { formatVoucherNumber } from '../../utils/ledgerFormat';
import {
  PrintStyles, PrintActionBar, CompanyHeader, AmountWords, SignatureRow, DocFooter,
  INK, INK_SOFT,
} from '../../components/print/PrintKit';

const fmt = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || val === 0) return '—';
  return val.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

const TITLES = {
  payment: 'Payment Voucher',
  receipt: 'Receipt Voucher',
  journal: 'Journal Voucher',
  contra:  'Contra Voucher',
};

export default function VoucherPrintPage() {
  const { voucherId } = useParams();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('auto_print') === '1';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/accounting/vouchers/${voucherId}`)
      .then(({ data }) => setData(data))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load voucher'))
      .finally(() => setLoading(false));
  }, [voucherId]);

  useEffect(() => {
    if (!loading && data && autoPrint) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [loading, data, autoPrint]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#4f46e5' }} />
    </div>
  );
  if (err || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Not found'}</p>
    </div>
  );

  const { company = {}, voucher, lines } = data;
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const title = TITLES[voucher.voucher_type] || `${voucher.voucher_type || ''} Voucher`;

  // Party for the "Paid To / Received From" line: the counter-party account.
  const firstDebit = lines.find(l => l.debit > 0);
  const firstCredit = lines.find(l => l.credit > 0);
  const isReceipt = voucher.voucher_type === 'receipt';
  const party = isReceipt ? firstCredit?.account_name : firstDebit?.account_name;
  const partyLabel = isReceipt ? 'Received From' : 'Paid To';

  return (
    <>
      <PrintStyles />
      <PrintActionBar />

      <div className="sheet">
        <CompanyHeader company={company} docTitle={title} />

        {/* Voucher No + Date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '4px 0 10px', color: INK }}>
          <div><span style={{ color: INK_SOFT }}>Voucher No.</span> <strong>: {formatVoucherNumber(voucher.voucher_number)}</strong></div>
          <div><span style={{ color: INK_SOFT }}>Date</span> <strong>: {fmtDate(voucher.voucher_date)}</strong></div>
        </div>

        {/* Particulars — full double entry, debit & credit shown together */}
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Particulars</th>
              <th className="num" style={{ width: '18%' }}>Debit ( )</th>
              <th className="num" style={{ width: '18%' }}>Credit ( )</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <strong>{l.debit > 0 ? 'Dr' : 'Cr'}</strong>&nbsp;&nbsp;
                  {l.account_name}
                  {l.account_code && <span style={{ color: INK_SOFT }}> ({l.account_code})</span>}
                </td>
                <td className="num">{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                <td className="num">{l.credit > 0 ? fmt(l.credit) : '—'}</td>
                {i === 0 && (
                  <td rowSpan={lines.length} style={{ verticalAlign: 'top' }}>{voucher.narration || ''}</td>
                )}
              </tr>
            ))}
            <tr className="total">
              <td style={{ textAlign: 'right' }}>Total</td>
              <td className="num">{fmt(totalDebit)}</td>
              <td className="num">{fmt(totalCredit)}</td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* Paid To / Received From */}
        {party && (
          <div style={{ border: '1px solid #111827', borderTop: 'none', padding: '8px 10px', fontSize: 12.5 }}>
            <span style={{ color: INK_SOFT, fontWeight: 600 }}>{partyLabel}: </span>
            <strong>{party}</strong>
          </div>
        )}

        <AmountWords amount={Math.max(totalDebit, totalCredit)} />

        {voucher.created_by && (
          <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 8 }}>Prepared by: {voucher.created_by}</div>
        )}

        <SignatureRow left="Prepared By" right="Receiver Sign & Thumb" />
        <DocFooter company={company} />
      </div>
    </>
  );
}
