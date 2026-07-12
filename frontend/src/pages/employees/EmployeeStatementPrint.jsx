import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { formatPKR } from '../../hooks/useShopApi';
import api from '../../api/axios';

export default function EmployeeStatementPrint() {
  const { id } = useParams();
  const { t, lang } = useTheme();
  const { shopName } = useAuth();
  const isRTL = lang === 'ur';
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/employees/${id}/ledger`)
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

  const { employee, summary, transaction_history } = ledger;

  const TXN_LABELS = {
    salary_due: t('salaryDue') || 'Salary Due',
    advance_given: t('advanceGiven') || 'Advance Given',
    loan_given: t('loanGivenLabel') || 'Loan Given',
    payment_made: t('salaryPaid') || 'Salary Paid',
    loan_repayment: t('loanPaymentReceived') || 'Loan Payment Received',
    deduction: t('deduction') || 'Deduction',
    opening_balance: t('openingBalance') || 'Opening Balance',
    adjustment: t('adjustment') || 'Adjustment',
  };

  const IN_TYPES = new Set(['salary_due', 'loan_repayment', 'opening_balance', 'adjustment']);
  const fmt = (n) => formatPKR(n, lang);
  const genDate = new Date().toLocaleString(isRTL ? 'ur-PK' : 'en-PK');

  const summaryCards = [
    { label: t('totalSalaryAccrued') || 'Total Salary Accrued', value: summary.total_salary_accrued },
    { label: t('totalPaid') || 'Total Paid', value: summary.total_paid },
    { label: t('currentPayable') || 'Current Payable', value: summary.current_payable },
    { label: t('loanGivenLabel') || 'Loan Given', value: summary.loan_given },
    { label: t('receivable') || 'Receivable', value: summary.loan_receivable },
    { label: t('pendingAdvance') || 'Pending Advance', value: summary.advance_pending },
  ];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #e5e7eb; }
        .sheet { width: 210mm; min-height: 297mm; background: #fff; padding: 16mm; margin: 0 auto; box-shadow: 0 4px 32px rgba(0,0,0,0.12); color: #111827; }
        .print-bar { width: 210mm; margin: 0 auto 12px; display: flex; justify-content: space-between; padding: 10px 0; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 20px; border-radius: 8px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; }
        .btn-print { background: #4f46e5; color: #fff; }
        .btn-back { background: #fff; color: #374151; border: 1px solid #d1d5db; }
        .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        .summary-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
        .summary-card .lbl { font-size: 9px; letter-spacing: 0.05em; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
        .summary-card .val { font-size: 15px; font-weight: 800; color: #111827; }
        table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
        thead tr { background: #4f46e5; }
        th { padding: 9px 8px; text-align: left; color: #fff; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
        td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .in-flow { color: #059669; font-weight: 700; }
        .out-flow { color: #dc2626; font-weight: 700; }
        .tag { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 999px; margin-inline-start: 6px; }
        .tag-pending { background: #fef3c7; color: #92400e; }
        .tag-cleared { background: #d1fae5; color: #065f46; }
        .foot-note { margin-top: 18px; font-size: 10px; color: #9ca3af; text-align: center; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print {
          body { background: #fff !important; }
          .print-bar { display: none !important; }
          .sheet { width: 100%; min-height: unset; margin: 0; padding: 10mm; box-shadow: none; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="print-bar">
        <button className="btn btn-back" onClick={() => window.close()}><ArrowLeft size={15} /> {t('back') || 'Close'}</button>
        <button className="btn btn-print" onClick={() => window.print()}><Printer size={15} /> {t('printStatement') || 'Print'}</button>
      </div>

      <div className="sheet" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="letterhead">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#4f46e5' }}>{shopName || 'ESMS'}</h1>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{t('employeeStatementSub') || 'Employee Ledger Statement'}</p>
          </div>
          <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
            <p style={{ fontSize: 16, fontWeight: 700 }}>{employee.name}</p>
            <p style={{ fontSize: 11, color: '#6b7280' }}>{employee.designation || '—'}</p>
            <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{t('generatedOn') || 'Generated'}: {genDate}</p>
          </div>
        </div>

        <div className="summary-grid">
          {summaryCards.map(c => (
            <div className="summary-card" key={c.label}>
              <div className="lbl">{c.label}</div>
              <div className="val">{fmt(c.value)}</div>
            </div>
          ))}
        </div>

        <table>
          <thead>
            <tr>
              <th>{t('date') || 'Date'}</th>
              <th>{t('type') || 'Type'}</th>
              <th className="num">{t('amount') || 'Amount'}</th>
              <th>{t('method') || 'Method'}</th>
              <th>{t('notes') || 'Notes'}</th>
              <th className="num">{t('runningBalance') || 'Balance'}</th>
            </tr>
          </thead>
          <tbody>
            {transaction_history.map(txn => (
              <tr key={txn.id}>
                <td>{new Date(txn.date).toLocaleDateString(isRTL ? 'ur-PK' : 'en-PK')}</td>
                <td>
                  {TXN_LABELS[txn.type] || txn.type}
                  {txn.type === 'advance_given' && txn.for_month && (
                    <span className={`tag ${txn.cleared ? 'tag-cleared' : 'tag-pending'}`}>
                      {txn.for_month} · {txn.cleared ? (t('cleared') || 'Cleared') : (t('pending') || 'Pending')}
                    </span>
                  )}
                </td>
                <td className={`num ${IN_TYPES.has(txn.type) ? 'in-flow' : 'out-flow'}`}>
                  {IN_TYPES.has(txn.type) ? '+' : '-'}{fmt(txn.amount)}
                </td>
                <td style={{ textTransform: 'uppercase', fontSize: 10, color: '#6b7280' }}>{txn.method || '—'}</td>
                <td style={{ color: '#6b7280' }}>{txn.notes || '—'}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(txn.running_balance)}</td>
              </tr>
            ))}
            {transaction_history.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
            )}
          </tbody>
        </table>

        <p className="foot-note">{shopName || 'ESMS'} — {t('employeeStatementSub') || 'Employee Ledger Statement'}</p>
      </div>
    </>
  );
}
