import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2, UserCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import { useAuth } from '../../context/AuthContext';
import { useEmployeeAttachments } from '../../hooks/useEmployeeAttachments';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import EmployeePhotoFrame from '../../components/employees/EmployeePhotoFrame';
import CnicAttachmentButton from '../../components/employees/CnicAttachmentButton';
import EmployeeDocumentsSection from '../../components/employees/EmployeeDocumentsSection';
import DesignationSelect from '../../components/ui/DesignationSelect';
import api from '../../api/axios';
import { SHIFTS } from '../../utils/shiftOptions';

const EMPTY_EXP = () => ({
  organization: '', designation: '', from: '', to: '', salary: '', leaving_reason: '',
});
const EMPTY_DEP = () => ({ name: '', relation: '', age: '', dob: '' });
const EMPTY_ALLOWANCE = () => ({ name: '', amount: '' });

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Splits an issued employment ID into its visible prefix and its sequence
// number — 'EMP-KHW-0007' → { prefix: 'KHW', seq: '0007' }. Mirrors
// parseEmploymentId in backend/utils/employmentId.js; anything that doesn't
// match returns null and is left alone rather than rewritten.
const EMPLOYMENT_ID_RE = /^EMP-(.+)-(\d+)$/;
function parseEmploymentId(employmentId) {
  const m = EMPLOYMENT_ID_RE.exec(String(employmentId || ''));
  return m ? { prefix: m[1], seq: m[2] } : null;
}

function calcAge(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
}

function emptyForm(branches) {
  return {
    name: '', father_name: '', gender: '', cnic: '', cnic_expiry: '',
    date_of_birth: '', age: '', place_of_birth: '', marital_status: '',
    religion: '', language: '', phone: '', home_tel: '',
    address: '', city: '',
    emergency_name: '', emergency_relation: '', emergency_cell: '', emergency_residence: '',
    education_institute: '', education_degree: '', education_specialization: '',
    education_grade: '', education_year: '',
    experience: [],
    dependants: [],
    remarks: '',
    employment_id: '',
    // Which mine location abbreviation the employment ID is issued under.
    // Pre-selected from the chosen mine but overridable; blank means the ID
    // falls back to the shop-id form it has always used.
    employment_abbr: '',
    hire_date: todayStr(),
    designation_id: '',
    shift: '',
    overtime_rate: '',
    // Exactly one of basic_salary / daily_wage applies, chosen by
    // employment_type — the form swaps which input is shown and only the
    // relevant amount is sent.
    employment_type: 'salary',
    basic_salary: '',
    daily_wage: '',
    // Truck-loading commission defaults. Both bases can be on at once — they
    // stack. These pre-fill the employee's row on a Truck Commission log; that
    // row can still override either one for a given mine/month.
    commission_per_truck_enabled: false,
    commission_per_truck: '',
    commission_per_ton_enabled: false,
    commission_per_ton: '',
    allowances: [],
    location_type: 'branch',
    branch_id: branches?.[0]?.id || '',
    godown_id: null,
    hr_remarks: '',
    status: 'active',
  };
}

function FormSection({ title, children }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div className="px-5 py-5 space-y-3">{children}</div>
    </div>
  );
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, branches, shopId, isSuperAdmin } = useShopApi();
  const { can, user } = useAuth();
  const isRTL = lang === 'ur';
  const isHr = can('employees', 'create') || can('employees', 'update')
    || ['admin', 'super_admin'].includes(user?.Role?.name);
  // A super_admin's shopId resolves asynchronously after mount — wait for it
  // before the edit-mode fetch, otherwise it goes out with no shop_id, 400s,
  // and bounces the user back to the list before the retry ever gets a chance.
  const shopReady = !isSuperAdmin || Boolean(shopId);

  const [form, setForm] = useState(() => emptyForm(branches));
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const attachments = useEmployeeAttachments(isEdit ? id : null);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (isEdit && !shopReady) return;
    if (!isEdit) {
      // The default mine's abbreviation seeds both the dropdown and the
      // previewed ID, so the common case needs no interaction at all.
      const base = emptyForm(branches);
      const abbr = branches.find(b => String(b.id) === String(base.branch_id))?.location_abbr || '';
      try {
        const { data } = await api.get('/employees/next-employment-id', {
          params: { ...shopParams(), abbr },
        });
        setForm(() => ({ ...base, employment_abbr: abbr, employment_id: data.employment_id || '' }));
      } catch {
        setForm({ ...base, employment_abbr: abbr });
      }
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/employees/${id}`, { params: shopParams() });
      const e = data.employee;
      const branch = e.Branch;
      setForm({
        ...emptyForm(branches),
        name: e.name || '',
        father_name: e.father_name || '',
        gender: e.gender || '',
        cnic: e.cnic || '',
        cnic_expiry: e.cnic_expiry || '',
        date_of_birth: e.date_of_birth || '',
        age: e.age != null ? String(e.age) : '',
        place_of_birth: e.place_of_birth || '',
        marital_status: e.marital_status || '',
        religion: e.religion || '',
        language: e.language || '',
        phone: e.phone || '',
        home_tel: e.home_tel || '',
        address: e.address || '',
        city: e.city || '',
        emergency_name: e.emergency_name || '',
        emergency_relation: e.emergency_relation || '',
        emergency_cell: e.emergency_cell || '',
        emergency_residence: e.emergency_residence || '',
        education_institute: e.education_institute || '',
        education_degree: e.education_degree || '',
        education_specialization: e.education_specialization || '',
        education_grade: e.education_grade || '',
        education_year: e.education_year || '',
        experience: Array.isArray(e.experience) ? e.experience : [],
        dependants: Array.isArray(e.dependants) ? e.dependants : [],
        remarks: e.remarks || '',
        employment_id: e.employment_id || '',
        // Seeded from the ID this employee already has, so the dropdown opens
        // showing their current prefix and saving without touching it is a
        // no-op. A prefix that isn't one of this shop's abbreviations (the
        // shop-number form every older ID uses) reads as blank.
        employment_abbr: (() => {
          const prefix = parseEmploymentId(e.employment_id)?.prefix || '';
          return branches.some(b => b.location_abbr === prefix) ? prefix : '';
        })(),
        hire_date: e.hire_date ? String(e.hire_date).slice(0, 10) : todayStr(),
        designation_id: e.designation_id ? String(e.designation_id) : '',
        shift: e.shift || '',
        overtime_rate: e.overtime_rate != null ? String(e.overtime_rate) : '',
        employment_type: e.employment_type === 'daily_wage' ? 'daily_wage' : 'salary',
        basic_salary: e.basic_salary != null ? String(e.basic_salary) : '',
        daily_wage: e.daily_wage != null ? String(e.daily_wage) : '',
        commission_per_truck_enabled: !!e.commission_per_truck_enabled,
        commission_per_truck: e.commission_per_truck != null ? String(e.commission_per_truck) : '',
        commission_per_ton_enabled: !!e.commission_per_ton_enabled,
        commission_per_ton: e.commission_per_ton != null ? String(e.commission_per_ton) : '',
        allowances: Array.isArray(e.allowances) ? e.allowances : [],
        location_type: branch?.godown_id ? 'godown' : 'branch',
        branch_id: e.branch_id || '',
        godown_id: branch?.godown_id || null,
        hr_remarks: e.hr_remarks || '',
        status: e.status || 'active',
      });
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      navigate('/employees');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, branches, error, t, navigate, shopReady]);

  useEffect(() => { load(); }, [load]);

  // Every distinct abbreviation defined across this shop's mines. The dropdown
  // offers all of them — not just the selected mine's — so an employee can be
  // issued an ID under a different location when that's what actually applies.
  // Derived from `branches`, which the page already holds, rather than a
  // second request.
  const abbrOptions = useMemo(() => {
    const seen = new Map();
    branches.forEach(b => {
      if (b.location_abbr && !seen.has(b.location_abbr)) seen.set(b.location_abbr, b.name);
    });
    return [...seen.entries()].map(([abbr, mineName]) => ({ abbr, mineName }));
  }, [branches]);

  // Re-previews the ID whenever the chosen abbreviation changes.
  //
  // The two modes differ in what the number means. On create the number isn't
  // allocated yet, so only the server can say what it will be. On edit the
  // employee already owns their number and keeps it — re-issuing swaps the
  // prefix and nothing else — so the preview is a local string swap and must
  // NOT ask for the next number, which would show a number belonging to
  // somebody who doesn't exist yet.
  useEffect(() => {
    if (!shopReady) return undefined;

    if (isEdit) {
      setForm(f => {
        const parsed = parseEmploymentId(f.employment_id);
        if (!parsed) return f; // unparseable/legacy — left exactly as it is
        const prefix = f.employment_abbr || String(shopId ?? parsed.prefix);
        return { ...f, employment_id: `EMP-${prefix}-${parsed.seq}` };
      });
      return undefined;
    }

    let cancelled = false;
    api.get('/employees/next-employment-id', { params: { ...shopParams(), abbr: form.employment_abbr } })
      .then(({ data }) => {
        if (!cancelled) setForm(f => ({ ...f, employment_id: data.employment_id || '' }));
      })
      .catch(() => { /* preview only — create recomputes it server-side anyway */ });
    return () => { cancelled = true; };
  }, [form.employment_abbr, isEdit, shopReady, shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDobChange = (val) => {
    setForm(f => ({ ...f, date_of_birth: val, age: calcAge(val) || f.age }));
  };

  const validateForm = () => {
    if (!form.name?.trim()) return t('fullName') || 'Full Name';
    if (!form.father_name?.trim()) return t('fatherName') || 'Father Name';
    if (!form.cnic?.trim()) return t('cnic') || 'CNIC No';
    if (!form.gender) return t('gender') || 'Gender';
    if (!form.phone?.trim()) return t('cellNo') || 'Cell No';
    if (!form.address?.trim()) return t('address') || 'Address';
    if (!form.city?.trim()) return t('city') || 'City / Location';
    if (isHr) {
      if (!form.hire_date) return t('dateOfJoining') || 'Date of Joining';
      if (!form.designation_id) return t('designation') || 'Designation';
      if (form.employment_type === 'daily_wage') {
        if (form.daily_wage === '' || Number.isNaN(parseFloat(form.daily_wage))) return t('dailyWage') || 'Daily Wage';
      } else if (form.basic_salary === '' || Number.isNaN(parseFloat(form.basic_salary))) {
        return t('salary') || 'Salary';
      }
      if (form.commission_per_truck_enabled
        && (form.commission_per_truck === '' || Number.isNaN(parseFloat(form.commission_per_truck)))) {
        return t('commissionPerTruck') || 'Commission per Truck';
      }
      if (form.commission_per_ton_enabled
        && (form.commission_per_ton === '' || Number.isNaN(parseFloat(form.commission_per_ton)))) {
        return t('commissionPerTon') || 'Commission per Ton';
      }
      if (!form.branch_id) return t('branchGodownLocation');
    }
    return null;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const missing = validateForm();
    if (missing) {
      error(`${t('required') || 'Required'}: ${missing}`);
      return;
    }
    setSaving(true);
    try {
      const isDailyWage = form.employment_type === 'daily_wage';
      const payload = {
        ...form,
        // Only the amount that matches the chosen pay type is sent; the server
        // nulls the other one out, so switching an employee's type can't leave
        // a stale figure behind for payroll to pick up.
        employment_type: form.employment_type,
        basic_salary: isDailyWage ? null : parseFloat(form.basic_salary),
        daily_wage: isDailyWage ? parseFloat(form.daily_wage) : null,
        // Same rule as the pay type above — an amount only travels with its
        // checkbox, so an unticked box can't leave a stale rate behind.
        commission_per_truck_enabled: form.commission_per_truck_enabled,
        commission_per_truck: form.commission_per_truck_enabled ? parseFloat(form.commission_per_truck) : null,
        commission_per_ton_enabled: form.commission_per_ton_enabled,
        commission_per_ton: form.commission_per_ton_enabled ? parseFloat(form.commission_per_ton) : null,
        branch_id: form.branch_id ? parseInt(form.branch_id, 10) : undefined,
        designation_id: form.designation_id ? parseInt(form.designation_id, 10) : undefined,
        age: form.age !== '' ? parseInt(form.age, 10) : null,
        experience: form.experience,
        dependants: form.dependants,
        allowances: form.allowances,
        ...shopParams(),
      };
      // Status is changed from the employees list / ledger — not via full profile save
      if (isEdit) {
        delete payload.status;
        await api.put(`/employees/${id}`, payload);
        success(t('employeeUpdated') || 'Employee updated');
        navigate('/employees');
      } else {
        const { data } = await api.post('/employees', payload);
        const result = await attachments.commitToEmployee(data.employee.id);
        success(t('employeeCreated') || 'Employee created');
        if (result?.failed) {
          error(t('someAttachmentsFailed') || 'Some attachments failed to upload. You can retry from the edit page.');
        }
        // Land on the edit page so photo/CNIC/documents can be reviewed or added to.
        navigate(`/employees/${data.employee.id}/edit`, { replace: true });
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  }

  return (
    <div className="space-y-6 w-full" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={UserCheck}
        accent="blue"
        title={isEdit ? (t('editEmployee') || 'Edit Employee') : (t('addEmployee') || 'Add Employee')}
        subtitle={isEdit ? form.employment_id : (t('employeeFormSub') || 'Full employee profile')}
        action={
          <button type="button" onClick={() => navigate('/employees')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <FormSection title={t('personalInfo') || 'Personal Info'}>
          <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
            <EmployeePhotoFrame photo={attachments.photo} canEdit={isHr} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <div>
                <FormLabel required>{t('fullName') || 'Full Name'}</FormLabel>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <FormLabel required>{t('fatherName') || 'Father Name'}</FormLabel>
                <input className="input" required value={form.father_name} onChange={setF('father_name')} />
              </div>
              <div>
                <FormLabel required>{t('cnic') || 'CNIC No'}</FormLabel>
                <div className="flex items-center gap-2">
                  <input className="input flex-1" required placeholder="35202-1234567-1" value={form.cnic} onChange={setF('cnic')} />
                  <CnicAttachmentButton cnic={attachments.cnic} canEdit={isHr} />
                </div>
              </div>
              <div>
                <FormLabel>{t('cnicExpiry') || 'CNIC Expiry Date'}</FormLabel>
                <input className="input" type="date" value={form.cnic_expiry} onChange={setF('cnic_expiry')} />
              </div>
              <div>
                <FormLabel required>{t('gender') || 'Gender'}</FormLabel>
                <select className="input" required value={form.gender} onChange={setF('gender')}>
                  <option value="">Select</option>
                  <option value="male">{t('male') || 'Male'}</option>
                  <option value="female">{t('female') || 'Female'}</option>
                  <option value="other">{t('other') || 'Other'}</option>
                </select>
              </div>
              <div>
                <FormLabel>{t('dateOfBirth') || 'Date of Birth'}</FormLabel>
                <input className="input" type="date" value={form.date_of_birth} onChange={e => onDobChange(e.target.value)} />
              </div>
              <div>
                <FormLabel>{t('age') || 'Age'}</FormLabel>
                <input className="input" type="number" min="0" value={form.age} onChange={setF('age')} />
              </div>
              <div>
                <FormLabel>{t('placeOfBirth') || 'Place of Birth'}</FormLabel>
                <input className="input" value={form.place_of_birth} onChange={setF('place_of_birth')} />
              </div>
              <div>
                <FormLabel>{t('maritalStatus') || 'Marital Status'}</FormLabel>
                <select className="input" value={form.marital_status} onChange={setF('marital_status')}>
                  <option value="">Select</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <FormLabel>{t('religion') || 'Religion'}</FormLabel>
                <input className="input" value={form.religion} onChange={setF('religion')} />
              </div>
              <div>
                <FormLabel>{t('language') || 'Language'}</FormLabel>
                <input className="input" value={form.language} onChange={setF('language')} />
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('contactEmergency') || 'Contact & Emergency'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel required>{t('cellNo') || 'Cell No'}</FormLabel>
              <input className="input" required value={form.phone} onChange={setF('phone')} />
            </div>
            <div>
              <FormLabel>{t('homeTel') || 'Home Tel No'}</FormLabel>
              <input className="input" value={form.home_tel} onChange={setF('home_tel')} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel required>{t('address') || 'Address'}</FormLabel>
              <textarea className="input min-h-[60px]" required value={form.address} onChange={setF('address')} />
            </div>
            <div>
              <FormLabel required>{t('city') || 'City / Location'}</FormLabel>
              <input className="input" required value={form.city} onChange={setF('city')} />
            </div>
          </div>
          <p className="text-xs font-semibold pt-2" style={{ color: 'var(--text-muted)' }}>{t('emergencyContact') || 'Emergency Contact'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('name') || 'Name'}</FormLabel>
              <input className="input" value={form.emergency_name} onChange={setF('emergency_name')} />
            </div>
            <div>
              <FormLabel>{t('relation') || 'Relation'}</FormLabel>
              <input className="input" value={form.emergency_relation} onChange={setF('emergency_relation')} />
            </div>
            <div>
              <FormLabel>{t('cellNo') || 'Cell No'}</FormLabel>
              <input className="input" value={form.emergency_cell} onChange={setF('emergency_cell')} />
            </div>
            <div>
              <FormLabel>{t('residenceNo') || 'Residence No'}</FormLabel>
              <input className="input" value={form.emergency_residence} onChange={setF('emergency_residence')} />
            </div>
          </div>
        </FormSection>

        <FormSection title={t('lastEducation') || 'Last Education'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('institute') || 'Institute'}</FormLabel>
              <input className="input" value={form.education_institute} onChange={setF('education_institute')} />
            </div>
            <div>
              <FormLabel>{t('certificateDegree') || 'Certificate / Degree'}</FormLabel>
              <input className="input" value={form.education_degree} onChange={setF('education_degree')} />
            </div>
            <div>
              <FormLabel>{t('specialization') || 'Specialization'}</FormLabel>
              <input className="input" value={form.education_specialization} onChange={setF('education_specialization')} />
            </div>
            <div>
              <FormLabel>{t('gradePercentage') || 'Grade / Percentage'}</FormLabel>
              <input className="input" value={form.education_grade} onChange={setF('education_grade')} />
            </div>
            <div>
              <FormLabel>{t('passingYear') || 'Passing Year'}</FormLabel>
              <input className="input" value={form.education_year} onChange={setF('education_year')} />
            </div>
          </div>
        </FormSection>

        <FormSection title={t('professionalExperience') || 'Professional Experience'}>
          <div className="space-y-3">
            {form.experience.map((row, i) => (
              <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                  <button type="button" className="icon-btn text-red-400" onClick={() => setForm(f => ({ ...f, experience: f.experience.filter((_, j) => j !== i) }))}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className="input" placeholder="Organization" value={row.organization || ''} onChange={e => setForm(f => { const experience = [...f.experience]; experience[i] = { ...experience[i], organization: e.target.value }; return { ...f, experience }; })} />
                  <input className="input" placeholder="Designation" value={row.designation || ''} onChange={e => setForm(f => { const experience = [...f.experience]; experience[i] = { ...experience[i], designation: e.target.value }; return { ...f, experience }; })} />
                  <input className="input" type="date" placeholder="From" value={row.from || ''} onChange={e => setForm(f => { const experience = [...f.experience]; experience[i] = { ...experience[i], from: e.target.value }; return { ...f, experience }; })} />
                  <input className="input" type="date" placeholder="To" value={row.to || ''} onChange={e => setForm(f => { const experience = [...f.experience]; experience[i] = { ...experience[i], to: e.target.value }; return { ...f, experience }; })} />
                  <input className="input" type="number" placeholder="Salary" value={row.salary || ''} onChange={e => setForm(f => { const experience = [...f.experience]; experience[i] = { ...experience[i], salary: e.target.value }; return { ...f, experience }; })} />
                  <input className="input" placeholder="Leaving reason" value={row.leaving_reason || ''} onChange={e => setForm(f => { const experience = [...f.experience]; experience[i] = { ...experience[i], leaving_reason: e.target.value }; return { ...f, experience }; })} />
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => setForm(f => ({ ...f, experience: [...f.experience, EMPTY_EXP()] }))}>
              <Plus className="w-4 h-4" />{t('addAnother') || 'Add another'}
            </button>
          </div>
        </FormSection>

        <FormSection title={t('dependants') || 'Dependants / Joint Family'}>
          <div className="space-y-3">
            {form.dependants.map((row, i) => (
              <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                  <button type="button" className="icon-btn text-red-400" onClick={() => setForm(f => ({ ...f, dependants: f.dependants.filter((_, j) => j !== i) }))}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className="input" placeholder="Name" value={row.name || ''} onChange={e => setForm(f => { const dependants = [...f.dependants]; dependants[i] = { ...dependants[i], name: e.target.value }; return { ...f, dependants }; })} />
                  <input className="input" placeholder="Relation" value={row.relation || ''} onChange={e => setForm(f => { const dependants = [...f.dependants]; dependants[i] = { ...dependants[i], relation: e.target.value }; return { ...f, dependants }; })} />
                  <input className="input" type="number" placeholder="Age" value={row.age || ''} onChange={e => setForm(f => { const dependants = [...f.dependants]; dependants[i] = { ...dependants[i], age: e.target.value }; return { ...f, dependants }; })} />
                  <input className="input" type="date" placeholder="D.O.B" value={row.dob || ''} onChange={e => setForm(f => { const dependants = [...f.dependants]; dependants[i] = { ...dependants[i], dob: e.target.value }; return { ...f, dependants }; })} />
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => setForm(f => ({ ...f, dependants: [...f.dependants, EMPTY_DEP()] }))}>
              <Plus className="w-4 h-4" />{t('addAnother') || 'Add another'}
            </button>
          </div>
        </FormSection>

        {isHr && (
          <FormSection title={t('employmentDetails') || 'Employment Details'}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('employmentId') || 'Employment ID'}</FormLabel>
                <input className="input font-mono" readOnly value={form.employment_id || (t('autoGeneratedOnSave'))} />
              </div>
              {/* Available on an existing employee too — only the prefix is
                  re-issued, their sequence number is carried across unchanged. */}
              <div>
                <FormLabel>{t('idLocationAbbr') || 'ID Location Abbreviation'}</FormLabel>
                <select
                  className="input font-mono"
                  value={form.employment_abbr}
                  onChange={e => setForm(f => ({ ...f, employment_abbr: e.target.value }))}
                >
                  <option value="">{t('useShopNumbering') || '— none (use shop numbering)'}</option>
                  {abbrOptions.map(o => (
                    <option key={o.abbr} value={o.abbr}>{o.abbr} — {o.mineName}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {isEdit
                    ? (t('idLocationAbbrEditHint') || 'Changing this re-issues the prefix only — the number stays the same. Anything already printed with the old ID will no longer match.')
                    : (t('idLocationAbbrHint') || 'Pre-selected from the mine chosen below. The number keeps counting across the whole shop whichever prefix is used.')}
                </p>
              </div>
              <div>
                <FormLabel required>{t('dateOfJoining') || 'Date of Joining'}</FormLabel>
                <input className="input" type="date" required value={form.hire_date} onChange={setF('hire_date')} />
              </div>
              <div>
                <FormLabel required>{t('designation') || 'Designation'}</FormLabel>
                <DesignationSelect required value={form.designation_id} onChange={(id) => setForm(f => ({ ...f, designation_id: id }))} />
              </div>
              <div>
                <FormLabel>{t('shift')}</FormLabel>
                <select className="input" value={form.shift} onChange={setF('shift')}>
                  <option value="">{t('none') || '--'}</option>
                  {SHIFTS.map(s => <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>)}
                </select>
              </div>
              <div>
                <FormLabel required>{t('payType') || 'Pay Type'}</FormLabel>
                <select className="input" value={form.employment_type} onChange={setF('employment_type')}>
                  <option value="salary">{t('payTypeSalary') || 'Fixed Monthly Salary'}</option>
                  <option value="daily_wage">{t('payTypeDailyWage') || 'Daily Wage'}</option>
                </select>
              </div>
              {form.employment_type === 'daily_wage' ? (
                <div>
                  <FormLabel required>{t('dailyWage') || 'Daily Wage'}</FormLabel>
                  <input className="input" type="number" min="0" step="0.01" required value={form.daily_wage} onChange={setF('daily_wage')} />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('dailyWageHint') || 'Monthly pay = this rate × days paid, counted from marked attendance.'}
                  </p>
                </div>
              ) : (
                <div>
                  <FormLabel required>{t('salary') || 'Salary'}</FormLabel>
                  <input className="input" type="number" min="0" step="0.01" required value={form.basic_salary} onChange={setF('basic_salary')} />
                </div>
              )}
              <div>
                <FormLabel>{t('overtimeRate')}</FormLabel>
                <input className="input" type="number" min="0" step="0.01" placeholder={t('overtimeRateHint') || 'Rate per hour'} value={form.overtime_rate} onChange={setF('overtime_rate')} />
              </div>

              {/* Truck-loading commission. Two independent bases that stack —
                  an employee with both ticked earns trucks × rate PLUS
                  tons × rate. These are defaults: the Truck Commission page
                  pre-fills from them and can still override either one for a
                  particular mine and month. */}
              <div className="sm:col-span-2 space-y-2">
                <FormLabel>{t('truckCommission') || 'Truck Loading Commission'}</FormLabel>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('commissionDefaultsHint') || 'Defaults for this employee — the Truck Commission page can still change either one for a specific mine and month.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={form.commission_per_truck_enabled}
                        onChange={e => setForm(f => ({ ...f, commission_per_truck_enabled: e.target.checked }))}
                      />
                      {t('commissionPerTruck') || 'Commission per Truck'}
                    </label>
                    <input
                      className="input" type="number" min="0" step="0.01"
                      placeholder={t('amountPerTruck') || 'Amount per truck'}
                      disabled={!form.commission_per_truck_enabled}
                      value={form.commission_per_truck}
                      onChange={setF('commission_per_truck')}
                    />
                  </div>
                  <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={form.commission_per_ton_enabled}
                        onChange={e => setForm(f => ({ ...f, commission_per_ton_enabled: e.target.checked }))}
                      />
                      {t('commissionPerTon') || 'Commission per Ton'}
                    </label>
                    <input
                      className="input" type="number" min="0" step="0.01"
                      placeholder={t('amountPerTon') || 'Amount per ton'}
                      disabled={!form.commission_per_ton_enabled}
                      value={form.commission_per_ton}
                      onChange={setF('commission_per_ton')}
                    />
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <FormLabel>{t('allowances') || 'Allowances'}</FormLabel>
                <div className="space-y-2">
                  {form.allowances.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        placeholder={t('allowanceName') || 'Allowance name (e.g. Transport)'}
                        value={row.name || ''}
                        onChange={e => setForm(f => { const allowances = [...f.allowances]; allowances[i] = { ...allowances[i], name: e.target.value }; return { ...f, allowances }; })}
                      />
                      <input
                        className="input w-36"
                        type="number" min="0" step="0.01"
                        placeholder={t('amount') || 'Amount'}
                        value={row.amount}
                        onChange={e => setForm(f => { const allowances = [...f.allowances]; allowances[i] = { ...allowances[i], amount: e.target.value }; return { ...f, allowances }; })}
                      />
                      <button type="button" className="icon-btn text-red-400" onClick={() => setForm(f => ({ ...f, allowances: f.allowances.filter((_, j) => j !== i) }))}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary flex items-center gap-2 text-sm" onClick={() => setForm(f => ({ ...f, allowances: [...f.allowances, EMPTY_ALLOWANCE()] }))}>
                    <Plus className="w-4 h-4" />{t('addAllowance') || 'Add Allowance'}
                  </button>
                </div>
                {/* Only meaningful for a fixed salary — a daily-wage employee's
                    base pay isn't known until the month's attendance is in, so
                    there is no fixed total to preview here. */}
                {form.allowances.length > 0 && form.employment_type !== 'daily_wage' && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('totalSalary') || 'Total Salary (Basic + Allowances)'}: {(
                      (parseFloat(form.basic_salary) || 0) + form.allowances.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
                    ).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <LocationPicker
                  required
                  label={t('branchGodownLocation')}
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
                    // Picking a mine re-selects its abbreviation, so the
                    // employment ID follows the location without extra clicks.
                    // Only on create — an existing employee's ID is frozen, so
                    // a transfer must not disturb it.
                    ...(isEdit ? {} : {
                      employment_abbr: branches.find(b => String(b.id) === String(loc.branch_id))?.location_abbr || '',
                    }),
                  }))}
                />
              </div>
              <div className="sm:col-span-2">
                <FormLabel>{t('hrRemarks') || 'HR Remarks'}</FormLabel>
                <textarea className="input min-h-[60px]" value={form.hr_remarks} onChange={setF('hr_remarks')} />
              </div>
            </div>
          </FormSection>
        )}

        <FormSection title={t('remarks') || 'Remarks'}>
          <textarea className="input min-h-[80px]" value={form.remarks} onChange={setF('remarks')} placeholder={t('optionalRemarks') || 'Optional remarks…'} />
        </FormSection>

        <EmployeeDocumentsSection
          employeeId={isEdit ? id : null}
          documents={attachments.documents}
          canEdit={isHr}
          isStaging={attachments.isStaging}
          shopParams={attachments.shopParams}
        />

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={() => navigate('/employees')} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-[140px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (t('save') || 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
