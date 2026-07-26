import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { formatPKR } from '../../hooks/useShopApi';
import api from '../../api/axios';
import { downloadEmployeeClearance } from '../../utils/employeeClearancePdf';
import { getCompany } from '../../utils/reportExport';
import {
  PrintStyles, CompanyHeader, DocClose, SignatureRow, INK, INK_SOFT,
} from '../../components/print/PrintKit';

export default function EmployeeClearancePrint() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('auto_print') === '1';
  const { t, lang } = useTheme();
  const isRTL = lang === 'ur';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [company, setCompany] = useState({});
  const [err, setErr] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/employees/${id}/clearance-certificate`).then(({ data: d }) => setData(d)),
      getCompany().then(setCompany),
    ]).catch(e => setErr(e.response?.data?.message || 'Failed to load clearance certificate'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!loading && data && autoPrint) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [loading, data, autoPrint]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadEmployeeClearance(id, company);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
        <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#4f46e5' }} />
      </div>
    );
  }
  if (err || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
        <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Not found'}</p>
      </div>
    );
  }

  const { employee, summary, clearance } = data;
  const fmt = (n) => formatPKR(n, lang);
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');
  const certNo = `ECC-${employee.id}-${new Date(data.issued_at).toISOString().slice(0, 10).replace(/-/g, '')}`;

  const CLEARANCE_LABELS = {
    salary_payable: t('clearanceSalaryPayable') || 'Outstanding salary payable to employee',
    salary_receivable: t('clearanceSalaryReceivable') || 'Salary overpayment receivable from employee',
    loan_receivable: t('clearanceLoanReceivable') || 'Outstanding loan balance',
    advance_pending: t('clearanceAdvancePending') || 'Uncleared salary advances',
  };

  return (
    <>
      <PrintStyles />
      <div className="doc-actions">
        <button type="button" className="doc-btn back" onClick={() => window.close()}>{t('close') || 'Close'}</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="doc-btn pdf" disabled={downloading} onClick={handleDownload}>
            <Download size={15} /> {t('download') || 'Download'}
          </button>
          <button type="button" className="doc-btn print" onClick={() => window.print()}>{t('print') || 'Print'}</button>
        </div>
      </div>

      <div className="sheet" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="sheet-body">
        <CompanyHeader company={company} docTitle={t('clearanceCertificate') || 'Employee Clearance Certificate'} />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: INK_SOFT, margin: '0 0 10px' }}>
          <span>{t('certificateNo') || 'Certificate No'}: <strong style={{ color: INK }}>{certNo}</strong></span>
          <span>{t('issuedOn') || 'Issued'}: <strong style={{ color: INK }}>{fmtDate(data.issued_at)}</strong></span>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1, margin: '0 0 4px' }}>
          {(t('employeeDetails') || 'EMPLOYEE DETAILS').toUpperCase()}
        </div>
        <table className="doc" style={{ marginBottom: 12 }}>
          <tbody>
            <tr>
              <td style={{ color: INK_SOFT, width: '18%' }}>{t('name') || 'Name'}</td>
              <td style={{ fontWeight: 700 }}>{employee.name}</td>
              <td style={{ color: INK_SOFT, width: '18%' }}>{t('designation') || 'Designation'}</td>
              <td style={{ fontWeight: 700 }}>{employee.designation || '—'}</td>
            </tr>
            <tr>
              <td style={{ color: INK_SOFT }}>{t('userBranch') || 'Branch'}</td>
              <td style={{ fontWeight: 700 }}>{employee.branch || '—'}</td>
              <td style={{ color: INK_SOFT }}>{t('cnic') || 'CNIC'}</td>
              <td style={{ fontWeight: 700 }}>{employee.cnic || '—'}</td>
            </tr>
            <tr>
              <td style={{ color: INK_SOFT }}>{t('hireDate') || 'Hire Date'}</td>
              <td style={{ fontWeight: 700 }}>{fmtDate(employee.hire_date)}</td>
              <td style={{ color: INK_SOFT }}>{t('terminationDate') || 'Termination Date'}</td>
              <td style={{ fontWeight: 700 }}>{fmtDate(employee.terminated_at)}</td>
            </tr>
            <tr>
              <td style={{ color: INK_SOFT }}>{t('basicSalary') || 'Basic Salary'}</td>
              <td style={{ fontWeight: 700 }}>{fmt(employee.basic_salary)}</td>
              <td style={{ color: INK_SOFT }}>{t('phone') || 'Phone'}</td>
              <td style={{ fontWeight: 700 }}>{employee.phone || '—'}</td>
            </tr>
            {employee.termination_notes && (
              <tr>
                <td style={{ color: INK_SOFT }}>{t('terminationRemarks') || 'Remarks'}</td>
                <td colSpan={3}>{employee.termination_notes}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1, margin: '0 0 4px' }}>
          {(t('financialSummary') || 'FINANCIAL SUMMARY').toUpperCase()}
        </div>
        <table className="doc" style={{ marginBottom: 12 }}>
          <tbody>
            {[
              [t('totalSalaryAccrued') || 'Total Salary Accrued', summary.total_salary_accrued],
              [t('totalPaid') || 'Total Salary Paid', summary.total_paid],
              [t('currentPayable') || 'Current Payable', summary.current_payable],
              [t('loanGivenLabel') || 'Total Loans Given', summary.loan_given],
              [t('receivable') || 'Loan Receivable', summary.loan_receivable],
              [t('advanceGiven') || 'Total Advances Given', summary.advance_given],
              [t('pendingAdvance') || 'Uncleared Advances', summary.advance_pending],
            ].map(([label, val]) => (
              <tr key={label}>
                <td style={{ color: INK_SOFT, width: '55%' }}>{label}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{
          padding: '10px 12px',
          marginBottom: 12,
          border: `2px solid ${clearance.fully_cleared ? '#059669' : '#dc2626'}`,
          background: clearance.fully_cleared ? '#ecfdf5' : '#fef2f2',
          fontWeight: 800,
          fontSize: 12,
          color: clearance.fully_cleared ? '#047857' : '#b91c1c',
          textAlign: 'center',
        }}>
          {clearance.fully_cleared
            ? (t('fullyCleared') || 'FULLY CLEARED — No outstanding dues on either side')
            : (t('pendingClearance') || 'PENDING ITEMS — Outstanding balances listed below')}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1, margin: '0 0 4px' }}>
          {(t('clearanceChecklist') || 'CLEARANCE CHECKLIST').toUpperCase()}
        </div>
        <table className="doc" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>{t('item') || 'Item'}</th>
              <th className="num" style={{ width: '18%' }}>{t('amount') || 'Amount'}</th>
              <th style={{ width: '14%' }}>{t('status') || 'Status'}</th>
              <th style={{ width: '18%' }}>{t('remarks') || 'Remarks'}</th>
            </tr>
          </thead>
          <tbody>
            {clearance.items.map(item => (
              <tr key={item.key}>
                <td>{CLEARANCE_LABELS[item.key] || item.label}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(item.amount)}</td>
                <td style={{ fontWeight: 700, color: item.cleared ? '#047857' : '#b91c1c' }}>
                  {item.cleared ? (t('cleared') || 'CLEARED') : (t('pending') || 'PENDING')}
                </td>
                <td style={{ color: INK_SOFT }}>
                  {item.cleared ? (t('settled') || 'Settled') : (t('outstanding') || 'Outstanding')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {clearance.pending_advances?.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1, margin: '0 0 4px' }}>
              {(t('pendingAdvanceDetails') || 'PENDING ADVANCE DETAILS').toUpperCase()}
            </div>
            <table className="doc" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>{t('date') || 'Date'}</th>
                  <th className="num">{t('amount') || 'Amount'}</th>
                  <th>{t('forMonth') || 'For Month'}</th>
                  <th>{t('description') || 'Description'}</th>
                </tr>
              </thead>
              <tbody>
                {clearance.pending_advances.map(adv => (
                  <tr key={adv.id}>
                    <td>{fmtDate(adv.date)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(adv.amount)}</td>
                    <td>{adv.for_month || '—'}</td>
                    <td>{adv.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {data.payroll_history?.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1, margin: '0 0 4px' }}>
              {(t('payrollHistory') || 'PAYROLL HISTORY').toUpperCase()}
            </div>
            <table className="doc" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>{t('month') || 'Month'}</th>
                  <th className="num">{t('basicSalary') || 'Basic'}</th>
                  <th className="num">{t('bonus') || 'Bonus'}</th>
                  <th className="num">{t('deductions') || 'Deductions'}</th>
                  <th className="num">{t('netPay') || 'Net Pay'}</th>
                  <th>{t('status') || 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {data.payroll_history.map(p => (
                  <tr key={p.month}>
                    <td>{p.month}</td>
                    <td className="num">{fmt(p.basic_salary)}</td>
                    <td className="num">{fmt(p.bonus)}</td>
                    <td className="num">{fmt(p.deductions)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(p.net_pay)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p style={{ fontSize: 11.5, color: INK, lineHeight: 1.6, margin: '8px 0 16px' }}>
          {t('clearanceDeclaration') || 'This is to certify that the above-named employee has been terminated from service. All financial clearances, outstanding dues, and recoveries are recorded as stated above. This certificate is issued for official record purposes.'}
        </p>

        </div>

        <DocClose company={company}>
          <SignatureRow
            left={t('hrManager') || 'HR / Manager'}
            right={t('employeeSignThumb') || 'Employee Sign & Thumb'}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
            <div style={{ width: '42%' }}>
              <div style={{ height: 42, borderBottom: `1px solid ${INK}`, marginBottom: 6 }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{t('authorizedSignatory') || 'Authorized Signatory'}</div>
            </div>
          </div>
        </DocClose>
      </div>
    </>
  );
}
