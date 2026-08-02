import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2, UserCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import LocationPicker from '../../components/ui/LocationPicker';
import EmployeeAttachments from '../../components/employees/EmployeeAttachments';
import api from '../../api/axios';

const EMPTY_EXP = () => ({
  organization: '', designation: '', from: '', to: '', salary: '', leaving_reason: '',
});
const EMPTY_DEP = () => ({ name: '', relation: '', age: '', dob: '' });

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
    hire_date: todayStr(),
    designation: '',
    basic_salary: '',
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
  const attachmentsRef = useRef(null);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (isEdit && !shopReady) return;
    if (!isEdit) {
      try {
        const { data } = await api.get('/employees/next-employment-id', { params: shopParams() });
        setForm(f => ({ ...emptyForm(branches), employment_id: data.employment_id || '' }));
      } catch {
        setForm(emptyForm(branches));
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
        hire_date: e.hire_date ? String(e.hire_date).slice(0, 10) : todayStr(),
        designation: e.designation || '',
        basic_salary: e.basic_salary != null ? String(e.basic_salary) : '',
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
      if (!form.designation?.trim()) return t('designation') || 'Designation';
      if (form.basic_salary === '' || Number.isNaN(parseFloat(form.basic_salary))) return t('salary') || 'Salary';
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
      const payload = {
        ...form,
        basic_salary: parseFloat(form.basic_salary),
        branch_id: form.branch_id ? parseInt(form.branch_id, 10) : undefined,
        age: form.age !== '' ? parseInt(form.age, 10) : null,
        experience: form.experience,
        dependants: form.dependants,
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
        const result = await attachmentsRef.current?.commitToEmployee(data.employee.id);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <input className="input" required placeholder="35202-1234567-1" value={form.cnic} onChange={setF('cnic')} />
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
                <input className="input" readOnly value={form.employment_id || (t('autoGeneratedOnSave'))} />
              </div>
              <div>
                <FormLabel required>{t('dateOfJoining') || 'Date of Joining'}</FormLabel>
                <input className="input" type="date" required value={form.hire_date} onChange={setF('hire_date')} />
              </div>
              <div>
                <FormLabel required>{t('designation') || 'Designation'}</FormLabel>
                <input className="input" required value={form.designation} onChange={setF('designation')} />
              </div>
              <div>
                <FormLabel required>{t('salary') || 'Salary'}</FormLabel>
                <input className="input" type="number" min="0" step="0.01" required value={form.basic_salary} onChange={setF('basic_salary')} />
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

        <EmployeeAttachments ref={attachmentsRef} employeeId={isEdit ? id : null} canEdit={isHr} />

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
