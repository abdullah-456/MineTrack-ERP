import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { formatPKR } from '../../hooks/useShopApi';
import api from '../../api/axios';
import { downloadEmployeeSlip } from '../../utils/employeeSlipPdf';
import { getCompany } from '../../utils/reportExport';
import {
  PrintStyles, PrintActionBar, CompanyHeader, AmountWords, SignatureRow, DocFooter, INK, INK_SOFT,
} from '../../components/print/PrintKit';

export default function EmployeeSlipPrint() {
  const { employeeId, txnId } = useParams();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('auto_print') === '1';
  const { t, lang } = useTheme();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [company, setCompany] = useState({});
  const [err, setErr] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadEmployeeSlip(employeeId, txnId, company);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get(`/employees/${employeeId}/slips/${txnId}`).then(({ data }) => setData(data)),
      getCompany().then(setCompany),
    ]).catch(e => setErr(e.response?.data?.message || 'Failed to load slip'))
      .finally(() => setLoading(false));
  }, [employeeId, txnId]);

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

  const { employee, transaction: txn, payroll } = data;
  const fmt = (n) => formatPKR(n, lang);
  const txnDate = new Date(txn.date).toLocaleDateString('en-GB');

  const TITLES = {
    advance_given: t('advanceSlip') || 'Advance Slip',
    loan_given: t('loanSlip') || 'Loan Slip',
    loan_repayment: t('loanPaymentReceipt') || 'Loan Payment Receipt',
    payment_made: payroll ? (t('paySlip') || 'Pay Slip') : (t('paymentSlip') || 'Payment Slip'),
  };
  const title = TITLES[txn.type] || (t('transactionSlip') || 'Transaction Slip');
  const isIncoming = txn.type === 'loan_repayment';
  const headlineAmount = payroll ? payroll.net_pay : txn.amount;
  const manualDeductions = payroll ? Math.max(0, (payroll.deductions || 0) - (payroll.advance_deduction || 0)) : 0;

  return (
    <>
      <PrintStyles />
      <div className="doc-actions">
        <button className="doc-btn back" onClick={() => window.close()}>Close</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="doc-btn pdf" disabled={downloading} onClick={handleDownload}>
            <Download size={15} /> {t('download') || 'Download'}
          </button>
          <button className="doc-btn print" onClick={() => window.print()}>{t('print') || 'Print'}</button>
        </div>
      </div>

      <div className="sheet" dir={isRTL ? 'rtl' : 'ltr'}>
        <CompanyHeader company={company} docTitle={title} />

        {/* Details */}
        <table className="doc" style={{ margin: '2px 0 12px' }}>
          <tbody>
            <tr>
              <td style={{ color: INK_SOFT, width: '18%' }}>{t('employee') || 'Employee'}</td>
              <td style={{ fontWeight: 700 }}>{employee.name}</td>
            </tr>
            {employee.designation && (
              <tr><td style={{ color: INK_SOFT }}>{t('designation') || 'Designation'}</td><td style={{ fontWeight: 700 }}>{employee.designation}</td></tr>
            )}
            <tr><td style={{ color: INK_SOFT }}>{t('date') || 'Date'}</td><td style={{ fontWeight: 700 }}>{txnDate}</td></tr>
            {txn.method && (
              <tr><td style={{ color: INK_SOFT }}>{t('method') || 'Method'}</td><td style={{ fontWeight: 700, textTransform: 'uppercase' }}>{txn.method}</td></tr>
            )}
            {txn.for_month && (
              <tr><td style={{ color: INK_SOFT }}>{t('forMonth') || 'For Salary Month'}</td><td style={{ fontWeight: 700 }}>{txn.for_month}</td></tr>
            )}
            {txn.notes && (
              <tr><td style={{ color: INK_SOFT }}>{t('notes') || 'Notes'}</td><td>{txn.notes}</td></tr>
            )}
          </tbody>
        </table>

        {/* Payroll breakdown, or a single amount line */}
        {payroll ? (
          <table className="doc">
            <tbody>
              <tr><td style={{ color: INK_SOFT }}>{t('month') || 'Month'}</td><td className="num" style={{ fontWeight: 700 }}>{payroll.month}</td></tr>
              <tr><td style={{ color: INK_SOFT }}>{t('basicSalary') || 'Basic Salary'}</td><td className="num">{fmt(payroll.basic_salary)}</td></tr>
              <tr>
                <td style={{ color: INK_SOFT }}>{t('giveAdvance') || 'Advance'}</td>
                <td className="num" style={{ color: payroll.advance_deduction > 0 ? '#b91c1c' : INK }}>
                  {payroll.advance_deduction > 0 ? `−${fmt(payroll.advance_deduction)}` : '-'}
                </td>
              </tr>
              <tr>
                <td style={{ color: INK_SOFT }}>{t('bonus') || 'Bonus'}</td>
                <td className="num" style={{ color: payroll.bonus > 0 ? '#047857' : INK }}>
                  {payroll.bonus > 0 ? `+${fmt(payroll.bonus)}` : '-'}
                </td>
              </tr>
              <tr>
                <td style={{ color: INK_SOFT }}>{t('deductions') || 'Deductions'}</td>
                <td className="num" style={{ color: manualDeductions > 0 ? '#b91c1c' : INK }}>
                  {manualDeductions > 0 ? `−${fmt(manualDeductions)}` : '-'}
                </td>
              </tr>
              <tr>
                <td style={{ color: INK_SOFT }}>{t('others') || 'Others'}</td>
                <td className="num">-</td>
              </tr>
              <tr className="total"><td style={{ fontWeight: 800 }}>{t('netPay') || 'Net Pay'}</td><td className="num" style={{ fontWeight: 800 }}>{fmt(payroll.net_pay)}</td></tr>
            </tbody>
          </table>
        ) : (
          <table className="doc">
            <tbody>
              <tr className="total">
                <td style={{ fontWeight: 800 }}>{t('amount') || 'Amount'}</td>
                <td className="num" style={{ fontWeight: 800, color: isIncoming ? '#047857' : INK }}>{isIncoming ? '+' : ''}{fmt(txn.amount)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <AmountWords amount={headlineAmount} />

        <SignatureRow left="Prepared By" right="Received Sign & Thumb" />
        <DocFooter company={company} />
      </div>
    </>
  );
}
