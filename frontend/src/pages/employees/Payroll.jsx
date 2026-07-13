import { useState, useEffect, useCallback } from 'react';
import { Landmark, Loader2, Search, Printer, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../api/axios';
import { downloadEmployeeSlip } from '../../utils/employeeSlipPdf';

export default function Payroll() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopName } = useAuth();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [employees, setEmployees] = useState([]);
  const [latestPayslips, setLatestPayslips] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const [modalEmp, setModalEmp] = useState(null); // employee row the modal is for
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [advanceForSelectedMonth, setAdvanceForSelectedMonth] = useState(0);
  const [salaryForm, setSalaryForm] = useState({ month: currentMonth, bonus: '', deductions: '', method: 'cash' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, slipsRes] = await Promise.all([
        api.get('/employees', { params: { ...shopParams(), search } }),
        api.get('/employees/latest-payslips', { params: shopParams() }),
      ]);
      setEmployees((empRes.data.employees || []).filter(e => e.status === 'active'));
      setLatestPayslips(slipsRes.data.latest || {});
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openGiveSalary = async (emp) => {
    setModalEmp(emp);
    setSalaryForm({ month: currentMonth, bonus: '', deductions: '', method: 'cash' });
    setLedgerLoading(true);
    try {
      const { data } = await api.get(`/employees/${emp.id}/ledger`, { params: shopParams() });
      const pending = (data.transaction_history || [])
        .filter(t2 => t2.type === 'advance_given' && !t2.cleared && t2.for_month === currentMonth)
        .reduce((s, t2) => s + parseFloat(t2.amount || 0), 0);
      setAdvanceForSelectedMonth(pending);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
      setAdvanceForSelectedMonth(0);
    } finally {
      setLedgerLoading(false);
    }
  };

  const refreshAdvanceForMonth = useCallback(async (month) => {
    if (!modalEmp) return;
    setLedgerLoading(true);
    try {
      const { data } = await api.get(`/employees/${modalEmp.id}/ledger`, { params: shopParams() });
      const pending = (data.transaction_history || [])
        .filter(t2 => t2.type === 'advance_given' && !t2.cleared && t2.for_month === month)
        .reduce((s, t2) => s + parseFloat(t2.amount || 0), 0);
      setAdvanceForSelectedMonth(pending);
    } catch {
      setAdvanceForSelectedMonth(0);
    } finally {
      setLedgerLoading(false);
    }
  }, [modalEmp, shopParams]);

  const handleDownloadSlip = async (employeeId, txnId) => {
    setDownloadingId(txnId);
    try {
      await downloadEmployeeSlip(employeeId, txnId, shopName);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setDownloadingId(null);
    }
  };

  const basicSalary = parseFloat(modalEmp?.basic_salary || 0);
  const bonusVal = parseFloat(salaryForm.bonus) || 0;
  const manualDeductionsVal = parseFloat(salaryForm.deductions) || 0;
  const netPayPreview = Math.round((basicSalary + bonusVal - manualDeductionsVal - advanceForSelectedMonth) * 100) / 100;

  const submitSalary = async (e) => {
    e.preventDefault();
    setSaving(true);
    // Open the tab synchronously (still inside the click gesture) so the
    // payslip can auto-print — opening it after the await gets silently
    // blocked as a non-user-initiated popup. Must NOT pass noopener/noreferrer
    // here: both make window.open() return null, which would silently break
    // this open-now-navigate-later pattern (nothing would ever print).
    const slipTab = window.open('', '_blank');
    try {
      const { data } = await api.post(`/employees/${modalEmp.id}/give-salary`, {
        month: salaryForm.month,
        bonus: bonusVal,
        deductions: manualDeductionsVal,
        method: salaryForm.method,
        ...shopParams(),
      });
      success(t('salaryGiven') || 'Salary given successfully');
      if (data.transaction_id && slipTab) {
        slipTab.location.href = `/employees/${modalEmp.id}/slip/${data.transaction_id}?auto_print=1`;
      } else if (slipTab) {
        slipTab.close();
      }
      setModalEmp(null);
      fetchData();
    } catch (err) {
      if (slipTab) slipTab.close();
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Landmark}
        accent="cyan"
        title={t('payroll') || 'Payroll'}
        subtitle={t('payrollSub') || 'Give each employee their salary for the month'}
        action={
          <ReportActions
            title={t('payroll') || 'Payroll'}
            columns={[
              { header: t('name') || 'Name', key: 'name', width: 1.6 },
              { header: t('designation') || 'Designation', render: e => e.designation || '', width: 1.3 },
              { header: t('basicSalary') || 'Basic Salary', key: 'basic_salary', money: true, width: 1.2 },
              { header: t('currentPayable') || 'Current Payable', key: 'current_payable', money: true, width: 1.3 },
              { header: t('status') || 'Status', key: 'status', width: 0.9 },
            ]}
            rows={employees}
            totals={{
              __label: t('total') || 'Total',
              basic_salary: employees.reduce((s, e) => s + parseFloat(e.basic_salary || 0), 0),
              current_payable: employees.reduce((s, e) => s + parseFloat(e.current_payable || 0), 0),
            }}
            filename="payroll-report.pdf"
          />
        }
      />

      <div className="glass-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchEmployees')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('name')}</th>
                <th className="text-start p-4">{t('designation')}</th>
                <th className="text-start p-4">{t('basicSalary')}</th>
                <th className="text-start p-4">{t('currentPayable') || 'Current Payable'}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</div>
                    {emp.phone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.phone}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.designation || '—'}</td>
                  <td className="p-4 font-semibold text-cyan-400">{formatPKR(emp.basic_salary, lang)}</td>
                  <td className="p-4 font-semibold" style={{ color: parseFloat(emp.current_payable) < 0 ? '#f87171' : 'var(--text-secondary)' }}>
                    {formatPKR(emp.current_payable, lang)}
                  </td>
                  <td className="p-4"><StatusBadge status={emp.status} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {latestPayslips[emp.id] && (
                        <>
                          <button
                            type="button"
                            title={t('printStatement') || 'Print'}
                            onClick={() => window.open(`/employees/${emp.id}/slip/${latestPayslips[emp.id].transaction_id}?auto_print=1`, '_blank')}
                            className="icon-btn"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title={t('download') || 'Download'}
                            disabled={downloadingId === latestPayslips[emp.id].transaction_id}
                            onClick={() => handleDownloadSlip(emp.id, latestPayslips[emp.id].transaction_id)}
                            className="icon-btn"
                          >
                            {downloadingId === latestPayslips[emp.id].transaction_id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => openGiveSalary(emp)} className="btn-primary flex items-center gap-2 text-sm">
                        <Landmark className="w-3.5 h-3.5" />{t('giveSalary') || 'Give Salary'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEmployees')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalEmp && (
        <Modal title={`${t('giveSalary') || 'Give Salary'} — ${modalEmp.name}`} onClose={() => setModalEmp(null)}>
          <form onSubmit={submitSalary} className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('month') || 'Month'} *</label>
              <input
                className="input" type="month" required value={salaryForm.month}
                onChange={e => { setSalaryForm(f => ({ ...f, month: e.target.value })); refreshAdvanceForMonth(e.target.value); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('bonus') || 'Bonus'}</label>
                <input className="input" type="number" step="0.01" min="0" value={salaryForm.bonus} onChange={e => setSalaryForm(f => ({ ...f, bonus: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('manualDeductions') || 'Manual Deductions'}</label>
                <input className="input" type="number" step="0.01" min="0" value={salaryForm.deductions} onChange={e => setSalaryForm(f => ({ ...f, deductions: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('method') || 'Method'} *</label>
              <select className="input" value={salaryForm.method} onChange={e => setSalaryForm(f => ({ ...f, method: e.target.value }))}>
                <option value="cash">{t('cash') || 'Cash'}</option>
                <option value="bank">{t('bank') || 'Bank'}</option>
              </select>
            </div>

            <div className="rounded-lg p-3 space-y-1 text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              {ledgerLoading ? (
                <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-cyan-400" /></div>
              ) : (
                <>
                  <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span>{t('basicSalary') || 'Basic Salary'}</span><span>{formatPKR(basicSalary, lang)}</span>
                  </div>
                  {bonusVal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>+ {t('bonus') || 'Bonus'}</span><span>+{formatPKR(bonusVal, lang)}</span>
                    </div>
                  )}
                  {manualDeductionsVal > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>- {t('manualDeductions') || 'Manual Deductions'}</span><span>-{formatPKR(manualDeductionsVal, lang)}</span>
                    </div>
                  )}
                  {advanceForSelectedMonth > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>- {t('advanceDeduction') || 'Advance Deduction'}</span><span>-{formatPKR(advanceForSelectedMonth, lang)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1" style={{ borderTop: '1px solid var(--border-subtle)', color: netPayPreview < 0 ? 'rgb(239,68,68)' : 'var(--text-primary)' }}>
                    <span>{t('netPay') || 'Net Pay'}</span><span>{formatPKR(netPayPreview, lang)}</span>
                  </div>
                  {netPayPreview < 0 && (
                    <p className="text-xs text-red-400">{t('salaryExceededHint') || "Deductions and advances exceed this month's salary."}</p>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalEmp(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving || ledgerLoading || netPayPreview < 0} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
