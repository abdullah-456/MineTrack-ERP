import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Printer, Download, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { formatPKR } from '../../hooks/useShopApi';
import api from '../../api/axios';
import { downloadEmployeeSlip } from '../../utils/employeeSlipPdf';

export default function EmployeeSlipPrint() {
  const { employeeId, txnId } = useParams();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('auto_print') === '1';
  const { t, lang } = useTheme();
  const { shopName } = useAuth();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadEmployeeSlip(employeeId, txnId, shopName);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    api.get(`/employees/${employeeId}/slips/${txnId}`)
      .then(({ data }) => setData(data))
      .catch(e => setErr(e.response?.data?.message || 'Failed to load slip'))
      .finally(() => setLoading(false));
  }, [employeeId, txnId]);

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

  const { employee, transaction: txn, payroll } = data;
  const fmt = (n) => formatPKR(n, lang);
  const genDate = new Date().toLocaleString(isRTL ? 'ur-PK' : 'en-PK');
  const txnDate = new Date(txn.date).toLocaleDateString(isRTL ? 'ur-PK' : 'en-PK');

  const TITLES = {
    advance_given: t('advanceSlip') || 'Advance Slip',
    loan_given: t('loanSlip') || 'Loan Slip',
    loan_repayment: t('loanPaymentReceipt') || 'Loan Payment Receipt',
    payment_made: payroll ? (t('paySlip') || 'Pay Slip') : (t('paymentSlip') || 'Payment Slip'),
  };
  const title = TITLES[txn.type] || (t('transactionSlip') || 'Transaction Slip');
  const isIncoming = txn.type === 'loan_repayment'; // money coming INTO the business

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #e5e7eb; }
        .sheet { width: 148mm; min-height: 180mm; background: #fff; padding: 14mm; margin: 0 auto; box-shadow: 0 4px 32px rgba(0,0,0,0.12); color: #111827; }
        .print-bar { width: 148mm; margin: 0 auto 12px; display: flex; justify-content: space-between; padding: 10px 0; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 20px; border-radius: 8px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; }
        .btn-print { background: #4f46e5; color: #fff; }
        .btn-download { background: #059669; color: #fff; }
        .btn-back { background: #fff; color: #374151; border: 1px solid #d1d5db; }
        .letterhead { border-bottom: 3px solid #4f46e5; padding-bottom: 10px; margin-bottom: 16px; }
        .amount-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; text-align: center; margin: 16px 0; }
        .amount-box .big { font-size: 28px; font-weight: 800; color: ${isIncoming ? '#059669' : '#4f46e5'}; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 10px; }
        td, th { padding: 7px 4px; }
        .row td { border-bottom: 1px solid #e5e7eb; }
        .lbl { color: #6b7280; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .total-row td { border-top: 2px solid #374151; font-weight: 800; font-size: 14px; }
        .foot-note { margin-top: 24px; font-size: 10px; color: #9ca3af; text-align: center; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print {
          body { background: #fff !important; }
          .print-bar { display: none !important; }
          .sheet { width: 100%; min-height: unset; margin: 0; padding: 10mm; box-shadow: none; }
          @page { size: A5; margin: 0; }
        }
      `}</style>

      <div className="print-bar">
        <button className="btn btn-back" onClick={() => window.close()}><ArrowLeft size={15} /> {t('back') || 'Close'}</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-download" disabled={downloading} onClick={handleDownload}>
            <Download size={15} /> {t('download') || 'Download'}
          </button>
          <button className="btn btn-print" onClick={() => window.print()}><Printer size={15} /> {t('printStatement') || 'Print'}</button>
        </div>
      </div>

      <div className="sheet" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="letterhead">
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#4f46e5' }}>{shopName || 'ESMS'}</h1>
          <p style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{title}</p>
        </div>

        <table>
          <tbody>
            <tr className="row"><td className="lbl">{t('employee') || 'Employee'}</td><td style={{ textAlign: isRTL ? 'left' : 'right' }}>{employee.name}</td></tr>
            {employee.designation && (
              <tr className="row"><td className="lbl">{t('designation') || 'Designation'}</td><td style={{ textAlign: isRTL ? 'left' : 'right' }}>{employee.designation}</td></tr>
            )}
            <tr className="row"><td className="lbl">{t('date') || 'Date'}</td><td style={{ textAlign: isRTL ? 'left' : 'right' }}>{txnDate}</td></tr>
            {txn.method && (
              <tr className="row"><td className="lbl">{t('method') || 'Method'}</td><td style={{ textAlign: isRTL ? 'left' : 'right', textTransform: 'uppercase' }}>{txn.method}</td></tr>
            )}
            {txn.for_month && (
              <tr className="row"><td className="lbl">{t('forMonth') || 'For Salary Month'}</td><td style={{ textAlign: isRTL ? 'left' : 'right' }}>{txn.for_month}</td></tr>
            )}
            {txn.notes && (
              <tr className="row"><td className="lbl">{t('notes') || 'Notes'}</td><td style={{ textAlign: isRTL ? 'left' : 'right' }}>{txn.notes}</td></tr>
            )}
          </tbody>
        </table>

        {payroll ? (
          <table>
            <tbody>
              <tr className="row"><td className="lbl">{t('month') || 'Month'}</td><td className="num">{payroll.month}</td></tr>
              <tr className="row"><td className="lbl">{t('basicSalary') || 'Basic Salary'}</td><td className="num">{fmt(payroll.basic_salary)}</td></tr>
              {payroll.bonus > 0 && (
                <tr className="row"><td className="lbl">{t('bonus') || 'Bonus'}</td><td className="num" style={{ color: '#059669' }}>+{fmt(payroll.bonus)}</td></tr>
              )}
              {payroll.deductions > 0 && (
                <tr className="row"><td className="lbl">{t('deductions') || 'Deductions'}</td><td className="num" style={{ color: '#dc2626' }}>-{fmt(payroll.deductions)}</td></tr>
              )}
              <tr className="total-row"><td>{t('netPay') || 'Net Pay'}</td><td className="num">{fmt(payroll.net_pay)}</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="amount-box">
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('amount') || 'Amount'}</div>
            <div className="big">{isIncoming ? '+' : ''}{fmt(txn.amount)}</div>
          </div>
        )}

        <p className="foot-note">{shopName || 'ESMS'} — {t('generatedOn') || 'Generated'}: {genDate}</p>
      </div>
    </>
  );
}
