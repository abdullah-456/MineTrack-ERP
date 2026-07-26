import { useState, useEffect, Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { formatPKR } from '../../hooks/useShopApi';
import api from '../../api/axios';
import { getCompany } from '../../utils/reportExport';
import {
  PrintStyles, PrintActionBar, CompanyHeader, DocClose, INK, INK_SOFT,
} from '../../components/print/PrintKit';

export default function EmployeeStatementPrint() {
  const { id } = useParams();
  const { t, lang } = useTheme();
  const isRTL = lang === 'ur';
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [company, setCompany] = useState({});
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/employees/${id}/ledger`).then(({ data }) => setLedger(data)),
      getCompany().then(setCompany),
    ]).catch(e => setErr(e.response?.data?.message || 'Failed to load statement'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#4f46e5' }} />
    </div>
  );
  if (err || !ledger) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Not found'}</p>
    </div>
  );

  const { employee, summary, transaction_history } = ledger;
  const fmt = (n) => formatPKR(n, lang);

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
  // Debit side = liability to employee increases (we OWE more)
  // Credit side = cash goes out / liability reduces
  const DEBIT_TYPES = new Set(['salary_due', 'loan_given', 'advance_given', 'deduction', 'opening_balance', 'adjustment']);

  const summaryCards = [
    { label: t('totalSalaryAccrued') || 'Total Salary Accrued', value: summary.total_salary_accrued },
    { label: t('totalPaid') || 'Total Paid', value: summary.total_paid },
    { label: t('currentPayable') || 'Current Payable', value: summary.current_payable },
    { label: t('loanGivenLabel') || 'Loan Given', value: summary.loan_given },
    { label: t('receivable') || 'Receivable', value: summary.loan_receivable },
    { label: t('pendingAdvance') || 'Pending Advance', value: summary.advance_pending },
  ];
  const sumRows = [];
  for (let i = 0; i < summaryCards.length; i += 3) sumRows.push(summaryCards.slice(i, i + 3));

  return (
    <>
      <PrintStyles />
      <PrintActionBar />

      <div className="sheet" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="sheet-body">
        <CompanyHeader company={company} docTitle={t('employeeStatementSub') || 'Employee Ledger Statement'} />

        {/* Employee identity */}
        <table className="doc" style={{ margin: '2px 0 12px' }}>
          <tbody>
            <tr>
              <td style={{ color: INK_SOFT, width: '16%' }}>{t('employee') || 'Employee'}</td>
              <td style={{ fontWeight: 700, width: '34%' }}>{employee.name}</td>
              <td style={{ color: INK_SOFT, width: '16%' }}>{t('designation') || 'Designation'}</td>
              <td style={{ fontWeight: 700, width: '34%' }}>{employee.designation || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* Summary */}
        <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1, margin: '0 0 4px' }}>
          {t('summary') || 'SUMMARY'}
        </div>
        <table className="doc" style={{ marginBottom: 14 }}>
          <tbody>
            {sumRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <Fragment key={ci}>
                    <td style={{ color: INK_SOFT }}>{c.label}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(c.value)}</td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Transactions */}
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: '13%' }}>{t('date') || 'Date'}</th>
              <th>{t('type') || 'Type'}</th>
              <th className="num" style={{ width: '14%' }}>{t('debit') || 'Debit'}</th>
              <th className="num" style={{ width: '14%' }}>{t('credit') || 'Credit'}</th>
              <th style={{ width: '11%' }}>{t('method') || 'Method'}</th>
              <th>{t('description') || 'Description'}</th>
              <th className="num" style={{ width: '16%' }}>{t('runningBalance') || 'Balance'}</th>
            </tr>
          </thead>
          <tbody>
            {transaction_history.map(txn => {
              const isDebit = DEBIT_TYPES.has(txn.type);
              return (
                <tr key={txn.id}>
                  <td>{new Date(txn.date).toLocaleDateString('en-GB')}</td>
                  <td>
                    {TXN_LABELS[txn.type] || txn.type}
                    {txn.type === 'advance_given' && txn.for_month && (
                      <span style={{ color: INK_SOFT }}> · {txn.for_month} · {txn.cleared ? (t('cleared') || 'Cleared') : (t('pending') || 'Pending')}</span>
                    )}
                  </td>
                  {/* Debit column */}
                  <td className="num" style={{ fontWeight: 700, color: '#b91c1c' }}>
                    {isDebit ? fmt(txn.amount) : '—'}
                  </td>
                  {/* Credit column */}
                  <td className="num" style={{ fontWeight: 700, color: '#047857' }}>
                    {!isDebit ? fmt(txn.amount) : '—'}
                  </td>
                  <td style={{ textTransform: 'uppercase', color: INK_SOFT }}>{txn.method || '—'}</td>
                  <td style={{ color: INK }}>{txn.notes || '—'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(txn.running_balance)}</td>
                </tr>
              );
            })}
            {transaction_history.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: INK_SOFT }}>{t('noTransactions') || 'No transactions yet'}</td></tr>
            )}
          </tbody>
        </table>

        </div>

        <DocClose company={company} left="Prepared By" right="Employee Sign & Thumb" />
      </div>
    </>
  );
}
