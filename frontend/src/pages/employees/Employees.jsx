import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Plus, Search, Edit, Loader2, BookOpen, Trash2, FileCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import api from '../../api/axios';
import { openClearancePrint } from '../../utils/employeeClearancePdf';
import TerminateEmployeeModal from '../../components/employees/TerminateEmployeeModal';
import { filterRowsByLocation } from '../../utils/locationUtils';

const EMPTY = (branches) => ({
  name: '', designation: '', cnic: '', phone: '', address: '',
  basic_salary: '', hire_date: new Date().toISOString().slice(0, 10),
  location_type: 'branch', branch_id: branches?.[0]?.id || '', godown_id: null,
  status: 'active',
});

export default function Employees() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [employees, setEmployees] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY());
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState(null);
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', status: '' });
  const [locationFilter, setLocationFilter] = useState({ location_type: 'branch', branch_id: '', godown_id: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, godRes] = await Promise.all([
        api.get('/employees', { params: { ...shopParams(), search } }),
        api.get('/godowns', { params: shopParams() }).catch(() => ({ data: { godowns: [] } })),
      ]);
      setEmployees(empRes.data.employees || []);
      setGodowns(godRes.data.godowns || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = (emp) => setTerminateTarget(emp);

  const handleSave = async (e) => {
    e.preventDefault();
    if (modal === 'edit' && form.status === 'terminated' && selected.status !== 'terminated') {
      setModal(null);
      setTerminateTarget(selected);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        basic_salary: parseFloat(form.basic_salary),
        branch_id: form.branch_id ? parseInt(form.branch_id, 10) : undefined,
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
    setForm(EMPTY(branches));
    setModal('create');
  };

  const formatLocationName = (emp) => {
    if (emp.Branch?.Godown) return `${emp.Branch.Godown.name} (${emp.Branch.name})`;
    return emp.Branch?.name || '—';
  };

  // ── Report model ────────────────────────────────────────────────────────────
  const reportSelects = [
    { key: 'status', label: t('status') || 'Status', options: [{ value: 'active', label: t('active') || 'Active' }, { value: 'inactive', label: t('inactive') || 'Inactive' }] },
  ];
  let reportRows = filterByDate(employees, 'hire_date', reportFilters.from, reportFilters.to);
  if (reportFilters.status) reportRows = reportRows.filter(e => e.status === reportFilters.status);
  reportRows = filterRowsByLocation(reportRows, locationFilter, godowns, branches);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    reportRows = reportRows.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      (e.cnic || '').toLowerCase().includes(q) ||
      (formatLocationName(e) || '').toLowerCase().includes(q) ||
      (e.status || '').toLowerCase().includes(q) ||
      (String(e.basic_salary) || '').toLowerCase().includes(q) ||
      (String(e.current_payable) || '').toLowerCase().includes(q) ||
      (e.hire_date ? new Date(e.hire_date).toLocaleDateString('en-PK') : '').toLowerCase().includes(q)
    );
  }

  const reportColumns = [
    { header: t('name') || 'Name', key: 'name', width: 1.6 },
    { header: t('designation') || 'Designation', render: e => e.designation || '', width: 1.3 },
    { header: t('location') || 'Location', render: e => formatLocationName(e), width: 1.4 },
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchEmployees')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <LocationPicker
            compact
            value={locationFilter}
            onChange={setLocationFilter}
          />
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ from: '', to: '', status: '' })}
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
                <th className="text-start p-4">{t('location') || 'Location'}</th>
                <th className="text-start p-4">{t('basicSalary')}</th>
                <th className="text-start p-4">{t('hireDate')}</th>
                <th className="text-start p-4">{t('currentPayable') || 'Current Payable'}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(emp => (
                <tr
                  key={emp.id}
                  id={`row-${emp.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(emp.id) ? 'highlight-row' : 'hover:bg-white/10'} cursor-pointer transition-colors`}
                  title={t('viewLedger') || 'View Ledger'}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    navigate(`/employees/${emp.id}`);
                  }}
                >
                  <td className="p-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.name}</div>
                    {emp.phone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.phone}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{emp.designation || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatLocationName(emp)}</td>
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
                      {emp.status === 'terminated' && (
                        <button type="button" onClick={() => openClearancePrint(emp.id)} className="icon-btn text-emerald-400" title={t('clearanceCertificate') || 'Clearance Certificate'}><FileCheck className="w-4 h-4" /></button>
                      )}
                      <button type="button" onClick={() => { setSelected(emp); setForm({ name: emp.name, designation: emp.designation || '', cnic: emp.cnic || '', phone: emp.phone || '', address: emp.address || '', basic_salary: emp.basic_salary, hire_date: emp.hire_date?.slice(0, 10) || '', location_type: emp.Branch?.godown_id ? 'godown' : 'branch', branch_id: emp.branch_id, godown_id: emp.Branch?.godown_id || null, status: emp.status }); setModal('edit'); }} className="icon-btn"><Edit className="w-4 h-4" /></button>
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
                <FormLabel required>{t('name')}</FormLabel>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <FormLabel>{t('designation')}</FormLabel>
                <input className="input" placeholder="Sales Manager" value={form.designation} onChange={setF('designation')} />
              </div>
              <div className="sm:col-span-2">
                <LocationPicker
                  required
                  label={t('userBranch') || 'Branch / Godown'}
                  value={{
                    location_type: form.location_type || 'branch',
                    branch_id: form.branch_id,
                    godown_id: form.godown_id,
                  }}
                  onChange={(loc) => setForm(f => ({
                    ...f,
                    location_type: loc.location_type,
                    branch_id: loc.branch_id,
                    godown_id: loc.godown_id,
                  }))}
                />
              </div>
              <div>
                <FormLabel required>{t('basicSalary')}</FormLabel>
                <input className="input" type="number" min="0" required value={form.basic_salary} onChange={setF('basic_salary')} />
              </div>
              <div>
                <FormLabel>{t('hireDate')}</FormLabel>
                <input className="input" type="date" value={form.hire_date} onChange={setF('hire_date')} />
              </div>
              <div>
                <FormLabel>{t('cnic')}</FormLabel>
                <input className="input" value={form.cnic} onChange={setF('cnic')} />
              </div>
              <div>
                <FormLabel>{t('phone')}</FormLabel>
                <input className="input" value={form.phone} onChange={setF('phone')} />
              </div>
              <div className="sm:col-span-2">
                <FormLabel>{t('address')}</FormLabel>
                <textarea className="input min-h-[80px]" value={form.address} onChange={setF('address')} />
              </div>
              {modal === 'edit' && (
                <div className="sm:col-span-2">
                  <FormLabel>{t('status')}</FormLabel>
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

      {terminateTarget && (
        <TerminateEmployeeModal
          employee={terminateTarget}
          onClose={() => setTerminateTarget(null)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
