import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Plus, Search, Edit, Loader2, Calendar, BookOpen, Trash2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import api from '../../api/axios';

const EMPTY = {
  name: '', designation: '', cnic: '', phone: '', address: '',
  basic_salary: '', hire_date: new Date().toISOString().slice(0, 10),
  branch_id: '', status: 'active',
};

export default function Employees() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', branch_id: '', status: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees', { params: { ...shopParams(), search } });
      setEmployees(data.employees || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (emp) => {
    const ok = await confirm({ title: t('delete'), message: t('confirmDeleteEmployee'), confirmLabel: t('delete'), cancelLabel: t('cancel') });
    if (!ok) return;
    try {
      const res = await api.delete(`/employees/${emp.id}`, { params: shopParams() });
      success(res.status === 202 ? t('deletionRequestSubmitted') : t('employeeTerminated'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        basic_salary: parseFloat(form.basic_salary),
        branch_id: parseInt(form.branch_id, 10),
        ...shopParams(),
      };
      if (modal === 'create') {
        await api.post('/employees', payload);
        success(t('employeeCreated'));
      } else {
        await api.put(`/employees/${selected.id}`, payload);
        success(t('employeeUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => {
    setForm({ ...EMPTY, branch_id: branches[0]?.id || '' });
    setModal('create');
  };

  // ── Report model ────────────────────────────────────────────────────────────
  const reportSelects = [
    { key: 'branch_id', label: t('branch') || 'Branch', options: branches.map(b => ({ value: b.id, label: b.name })) },
    { key: 'status', label: t('status') || 'Status', options: [{ value: 'active', label: t('active') || 'Active' }, { value: 'inactive', label: t('inactive') || 'Inactive' }] },
  ];
  let reportRows = filterByDate(employees, 'hire_date', reportFilters.from, reportFilters.to);
  if (reportFilters.branch_id) reportRows = reportRows.filter(e => String(e.branch_id) === String(reportFilters.branch_id));
  if (reportFilters.status) reportRows = reportRows.filter(e => e.status === reportFilters.status);
  const reportColumns = [
    { header: t('name') || 'Name', key: 'name', width: 1.6 },
    { header: t('designation') || 'Designation', render: e => e.designation || '', width: 1.3 },
    { header: t('userBranch') || 'Branch', render: e => e.Branch?.name || '', width: 1.1 },
    { header: t('basicSalary') || 'Salary', key: 'basic_salary', money: true, width: 1.1 },
    { header: t('hireDate') || 'Hire Date', render: e => (e.hire_date ? new Date(e.hire_date).toLocaleDateString('en-PK') : ''), width: 1.1 },
    { header: t('currentPayable') || 'Payable', key: 'current_payable', money: true, width: 1.1 },
    { header: t('status') || 'Status', key: 'status', width: 0.9 },
  ];
  const reportTotals = {
    __label: t('total') || 'Total',
    basic_salary: reportRows.reduce((s, e) => s + parseFloat(e.basic_salary || 0), 0),
    current_payable: reportRows.reduce((s, e) => s + parseFloat(e.current_payable || 0), 0),
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={UserCheck}
        accent="cyan"
        title={t('employees')}
        subtitle={t('employeesSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('employees') || 'Employees Report'}
              columns={reportColumns}
              rows={reportRows}
              totals={reportTotals}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="employees-report.pdf"
            />
            <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addEmployee')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchEmployees')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ from: '', to: '', branch_id: '', status: '' })}
          selects={reportSelects}
        />
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
                <th className="text-start p-4">{t('userBranch')}</th>
                <th className="text-start p-4">{t('basicSalary')}</th>
                <th className="text-start p-4">{t('hireDate')}</th>
                <th className="text-start p-4">{t('currentPayable') || 'Current Payable'}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</div>
                    {emp.phone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.phone}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.designation || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.Branch?.name}</td>
                  <td className="p-4 font-semibold text-cyan-400">{formatPKR(emp.basic_salary, lang)}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>
                    {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK') : '—'}
                  </td>
                  <td className="p-4 font-semibold" style={{ color: parseFloat(emp.current_payable) < 0 ? '#f87171' : 'var(--text-secondary)' }}>
                    {formatPKR(emp.current_payable, lang)}
                  </td>
                  <td className="p-4"><StatusBadge status={emp.status} /></td>
                  <td className="p-4 text-end">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => navigate(`/employees/${emp.id}`)} className="icon-btn" title={t('viewLedger') || 'Ledger'}><BookOpen className="w-4 h-4" /></button>
                      <button type="button" onClick={() => { setSelected(emp); setForm({ name: emp.name, designation: emp.designation || '', cnic: emp.cnic || '', phone: emp.phone || '', address: emp.address || '', basic_salary: emp.basic_salary, hire_date: emp.hire_date?.slice(0, 10) || '', branch_id: emp.branch_id, status: emp.status }); setModal('edit'); }} className="icon-btn"><Edit className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(emp)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noEmployees')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? t('addEmployee') : t('editEmployee')} onClose={() => setModal(null)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('name')} *</label>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('designation')}</label>
                <input className="input" placeholder="Sales Manager" value={form.designation} onChange={setF('designation')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('userBranch')} *</label>
                <select className="input" required value={form.branch_id} onChange={setF('branch_id')}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('basicSalary')} *</label>
                <input className="input" type="number" min="0" required value={form.basic_salary} onChange={setF('basic_salary')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('hireDate')}</label>
                <input className="input" type="date" value={form.hire_date} onChange={setF('hire_date')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('cnic')}</label>
                <input className="input" value={form.cnic} onChange={setF('cnic')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('phone')}</label>
                <input className="input" value={form.phone} onChange={setF('phone')} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('address')}</label>
                <textarea className="input min-h-[80px]" value={form.address} onChange={setF('address')} />
              </div>
              {modal === 'edit' && (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('status')}</label>
                  <select className="input" value={form.status} onChange={setF('status')}>
                    <option value="active">{t('active') || 'Active'}</option>
                    <option value="suspended">{t('suspended') || 'Suspended'}</option>
                    <option value="terminated">{t('terminated') || 'Terminated'}</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
