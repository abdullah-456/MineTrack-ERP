import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import api from '../../api/axios';

const fmt = (n) => `Rs. ${(parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f8' }}>
      <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#4f46e5' }} />
    </div>
  );
  if (err || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f8' }}>
      <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Not found'}</p>
    </div>
  );

  const { voucher, lines } = data;
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #e5e7eb; }
        .sheet { width: 190mm; min-height: 140mm; background: #fff; padding: 14mm; margin: 0 auto; box-shadow: 0 4px 32px rgba(0,0,0,0.12); }
        .print-bar { width: 190mm; margin: 0 auto 12px; display: flex; justify-content: space-between; padding: 10px 0; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 20px; border-radius: 8px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; }
        .btn-print { background: #4f46e5; color: #fff; }
        .btn-back { background: #fff; color: #374151; border: 1px solid #d1d5db; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { color: #6b7280; text-transform: uppercase; font-size: 10px; }
        .num { text-align: right; }
        .total-row td { border-top: 2px solid #374151; font-weight: 700; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print {
          body { background: #fff !important; }
          .print-bar { display: none !important; }
          .sheet { width: 100%; min-height: unset; margin: 0; padding: 10mm; box-shadow: none; }
          @page { size: A5 landscape; margin: 0; }
        }
      `}</style>

      <div className="print-bar">
        <button className="btn btn-back" onClick={() => window.close()}><ArrowLeft size={15} /> Close</button>
        <button className="btn btn-print" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </div>

      <div className="sheet">
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Voucher</h1>
        <p style={{ color: '#6b7280', marginBottom: 12 }}>{voucher.voucher_number} · {voucher.voucher_type} · {new Date(voucher.voucher_date).toLocaleDateString('en-PK')}</p>
        {voucher.narration && <p style={{ fontSize: 13, marginBottom: 8 }}>{voucher.narration}</p>}
        {voucher.created_by && <p style={{ fontSize: 11, color: '#9ca3af' }}>Created by {voucher.created_by}</p>}

        <table>
          <thead>
            <tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{l.account_code} — {l.account_name}</td>
                <td className="num">{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                <td className="num">{l.credit > 0 ? fmt(l.credit) : '—'}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>Total</td>
              <td className="num">{fmt(totalDebit)}</td>
              <td className="num">{fmt(totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
