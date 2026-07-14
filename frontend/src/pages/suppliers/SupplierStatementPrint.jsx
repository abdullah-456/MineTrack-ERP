import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import api from '../../api/axios';

const TXN_LABELS = {
  stock_received: 'Stock Received',
  payment_made: 'Payment Made',
  opening_balance: 'Opening Balance',
  adjustment: 'Adjustment',
};

const fmt = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || val === 0) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function SupplierStatementPrint() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/suppliers/${id}/ledger`)
      .then(({ data }) => setLedger(data))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load statement'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f8' }}>
      <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#4f46e5' }} />
    </div>
  );
  if (err || !ledger) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f8' }}>
      <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Not found'}</p>
    </div>
  );

  const { supplier, summary, transaction_history } = ledger;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #e5e7eb; }
        .sheet { width: 210mm; min-height: 297mm; background: #fff; padding: 16mm; margin: 0 auto; box-shadow: 0 4px 32px rgba(0,0,0,0.12); }
        .print-bar { width: 210mm; margin: 0 auto 12px; display: flex; justify-content: space-between; padding: 10px 0; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 20px; border-radius: 8px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; }
        .btn-print { background: #4f46e5; color: #fff; }
        .btn-back { background: #fff; color: #374151; border: 1px solid #d1d5db; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { color: #6b7280; text-transform: uppercase; font-size: 10px; }
        .num { text-align: right; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print {
          body { background: #fff !important; }
          .print-bar { display: none !important; }
          .sheet { width: 100%; min-height: unset; margin: 0; padding: 10mm; box-shadow: none; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="print-bar">
        <button className="btn btn-back" onClick={() => window.close()}><ArrowLeft size={15} /> Close</button>
        <button className="btn btn-print" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </div>

      <div className="sheet">
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Supplier Statement</h1>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>{supplier.company_name} ({supplier.supplier_code})</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <div><div style={{ fontSize: 10, color: '#6b7280' }}>TOTAL STOCK VALUE</div><div style={{ fontWeight: 700 }}>{fmt(summary.total_stock_value)}</div></div>
          <div><div style={{ fontSize: 10, color: '#6b7280' }}>TOTAL PAID</div><div style={{ fontWeight: 700 }}>{fmt(summary.total_paid)}</div></div>
          <div><div style={{ fontSize: 10, color: '#6b7280' }}>CURRENT PAYABLE</div><div style={{ fontWeight: 700 }}>{fmt(summary.current_payable)}</div></div>
          <div><div style={{ fontSize: 10, color: '#6b7280' }}>CREDIT BALANCE</div><div style={{ fontWeight: 700 }}>{fmt(summary.credit_balance)}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Description</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Remaining</th><th>Method</th><th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {transaction_history.map(txn => (
              <tr key={txn.id}>
                <td>{new Date(txn.date).toLocaleDateString('en-PK')}</td>
                <td>{TXN_LABELS[txn.type] || txn.type}</td>
                <td style={{ fontSize: 11, color: '#374151' }}>{txn.notes || '—'}</td>
                <td className="num">{fmt(txn.total_amount)}</td>
                <td className="num">{fmt(txn.paid_amount)}</td>
                <td className="num">{fmt(txn.remaining_amount)}</td>
                <td>{txn.method || '—'}</td>
                <td className="num">{fmt(txn.running_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
