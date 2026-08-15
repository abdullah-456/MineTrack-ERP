import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Pickaxe } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi } from '../../hooks/useShopApi';
import { useDocumentStaging } from '../../hooks/useDocumentStaging';
import PageHeader from '../../components/ui/PageHeader';
import FormLabel from '../../components/ui/FormLabel';
import OwnerDocumentsSection from '../../components/documents/OwnerDocumentsSection';
import api from '../../api/axios';
import { PAKISTAN_PROVINCES, districtsForProvince } from '../../utils/pakistanRegions';
import { MINE_STATUSES } from '../../utils/mineStatus';

const EMPTY = {
  name: '', location_abbr: '', address: '', is_default: false, godown_id: '',
  company: '', mineral_id: '', province: '', district: '', gps_coordinates: '',
  lease_number: '', lease_start_date: '', lease_expiry_date: '', area: '',
  status: 'active', manager_id: '', remarks: '',
};

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

export default function MineFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopReady } = useShopApi();
  const isRTL = lang === 'ur';

  const [form, setForm] = useState(EMPTY);
  const [godowns, setGodowns] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [minerals, setMinerals] = useState([]);
  const [previewCode, setPreviewCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const attachments = useDocumentStaging('branch', isEdit ? id : null);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const [gRes, eRes, mRes] = await Promise.all([
        api.get('/godowns', { params: shopParams() }),
        api.get('/employees', { params: shopParams() }),
        api.get('/minerals', { params: shopParams() }),
      ]);
      setGodowns(gRes.data.godowns || []);
      setEmployees((eRes.data.employees || []).filter(emp =>
        emp.status === 'active' && (emp.Designation?.name || '').trim().toLowerCase() === 'manager'
      ));
      setMinerals(mRes.data.minerals || []);

      if (isEdit) {
        const { data } = await api.get(`/branches/${id}`, { params: shopParams() });
        const m = data.branch;
        setForm({
          name: m.name, location_abbr: m.location_abbr || '', address: m.address || '', is_default: !!m.is_default,
          godown_id: m.godown_id ? String(m.godown_id) : '',
          company: m.company || '', mineral_id: m.mineral_id ? String(m.mineral_id) : '',
          province: m.province || '', district: m.district || '', gps_coordinates: m.gps_coordinates || '',
          lease_number: m.lease_number || '',
          lease_start_date: m.lease_start_date || '', lease_expiry_date: m.lease_expiry_date || '',
          area: m.area || '', status: m.status || 'active',
          manager_id: m.manager_id ? String(m.manager_id) : '', remarks: m.remarks || '',
        });
        setPreviewCode(m.mine_code || '');
      } else {
        setForm(EMPTY);
        try {
          const { data } = await api.get('/branches/next-code', { params: shopParams() });
          setPreviewCode(data.mine_code || '');
        } catch {
          setPreviewCode('');
        }
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
      if (isEdit) navigate('/admin/mines');
    } finally {
      setLoading(false);
    }
  }, [isEdit, id, shopParams, shopReady, error, t, navigate]);

  useEffect(() => { load(); }, [load]);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name?.trim()) {
      error(`${t('required') || 'Required'}: ${t('mineName')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        godown_id: form.godown_id ? parseInt(form.godown_id, 10) : null,
        manager_id: form.manager_id ? parseInt(form.manager_id, 10) : null,
        mineral_id: form.mineral_id ? parseInt(form.mineral_id, 10) : null,
        ...shopParams(),
      };
      if (isEdit) {
        await api.put(`/branches/${id}`, payload);
        success(t('branchUpdated'));
      } else {
        const { data } = await api.post('/branches', payload);
        const result = await attachments.commitToOwner(data.branch.id);
        success(t('branchCreated'));
        if (result?.failed) {
          error(t('someAttachmentsFailed') || 'Some attachments failed to upload. You can retry from the edit page.');
        }
      }
      navigate('/admin/mines');
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
        icon={Pickaxe}
        accent="cyan"
        title={isEdit ? (t('editMine') || 'Edit Mine') : (t('createMine') || 'Create Mine')}
        subtitle={isEdit ? previewCode : (t('minesSub') || 'Full mine profile')}
        action={
          <button type="button" onClick={() => navigate('/admin/mines')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <FormSection title={t('mineBasicInfo') || 'Basic Info'}>
          <div>
            <FormLabel>{t('mineCode') || 'Mine Code'}</FormLabel>
            <input className="input opacity-70" disabled value={previewCode || (t('autoGenerated') || 'Auto-generated')} />
          </div>
          <div>
            <FormLabel required>{t('mineName')}</FormLabel>
            <input className="input" required value={form.name} onChange={setF('name')} />
          </div>
          <div>
            <FormLabel>{t('locationAbbr') || 'Location Abbreviation'}</FormLabel>
            {/* Uppercased and stripped of separators as you type, matching what
                the server stores — the abbreviation becomes the visible prefix
                of an employment ID (EMP-KHW-0007), and a '-' in it would break
                where that ID's sequence number starts. */}
            <input
              className="input font-mono uppercase"
              maxLength={10}
              placeholder={t('locationAbbrPlaceholder') || 'e.g. KHW'}
              value={form.location_abbr}
              onChange={e => setForm(f => ({
                ...f,
                location_abbr: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
              }))}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('locationAbbrHint') || 'Used in employment IDs for staff at this mine — e.g. EMP-KHW-0007. Leave blank to keep the default numbering.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('company')}</FormLabel>
              <input className="input" value={form.company} onChange={setF('company')} />
            </div>
            <div>
              <FormLabel>{t('mineralType')}</FormLabel>
              <select className="input" value={form.mineral_id} onChange={setF('mineral_id')}>
                <option value="">{t('selectMineral') || '-- Select Mineral --'}</option>
                {minerals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('status')}</FormLabel>
              <select className="input" value={form.status} onChange={setF('status')}>
                {MINE_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{t(s.labelKey) || s.value}</option>
                ))}
              </select>
            </div>
            <div>
              <FormLabel>{t('manager')}</FormLabel>
              <select className="input" value={form.manager_id} onChange={setF('manager_id')}>
                <option value="">{t('selectManager') || '-- No Manager Assigned --'}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('mineLocation') || 'Location'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('province')}</FormLabel>
              <select
                className="input"
                value={form.province}
                onChange={e => setForm(f => ({ ...f, province: e.target.value, district: '' }))}
              >
                <option value="">{t('selectProvince') || '-- Select Province --'}</option>
                {PAKISTAN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>{t('district')}</FormLabel>
              <select className="input" disabled={!form.province} value={form.district} onChange={setF('district')}>
                <option value="">{t('selectDistrict') || '-- Select District --'}</option>
                {districtsForProvince(form.province).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FormLabel>{t('gpsCoordinates') || 'GPS Coordinates'}</FormLabel>
            <input className="input" placeholder="e.g. 30.1798° N, 66.9750° E" value={form.gps_coordinates} onChange={setF('gps_coordinates')} />
          </div>
          <div>
            <FormLabel>{t('branchAddress')}</FormLabel>
            <textarea className="input min-h-[70px]" value={form.address} onChange={setF('address')} />
          </div>
          <div>
            <FormLabel>{t('linkGodown') || 'Link to Godown / Warehouse'}</FormLabel>
            <select className="input" value={form.godown_id} onChange={setF('godown_id')}>
              <option value="">-- No Godown Linked --</option>
              {godowns.map(g => (
                <option key={g.id} value={g.id}>🏭 {g.name} {g.code ? `[${g.code}]` : ''}</option>
              ))}
            </select>
          </div>
        </FormSection>

        <FormSection title={t('mineLease') || 'Lease & Area'}>
          <div>
            <FormLabel>{t('leaseNumber')}</FormLabel>
            <input className="input" value={form.lease_number} onChange={setF('lease_number')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FormLabel>{t('leaseStartDate')}</FormLabel>
              <input className="input" type="date" value={form.lease_start_date || ''} onChange={setF('lease_start_date')} />
            </div>
            <div>
              <FormLabel>{t('leaseExpiryDate')}</FormLabel>
              <input className="input" type="date" value={form.lease_expiry_date || ''} onChange={setF('lease_expiry_date')} />
            </div>
          </div>
          <div>
            <FormLabel>{t('area') || 'Area (Acres/Hectares)'}</FormLabel>
            <input className="input" placeholder="e.g. 500 Acres" value={form.area} onChange={setF('area')} />
          </div>
        </FormSection>

        <OwnerDocumentsSection
          ownerType="branch"
          ownerId={isEdit ? id : null}
          documents={attachments.documents}
          canEdit
          isStaging={attachments.isStaging}
          shopParams={attachments.shopParams}
          title={t('mineDocuments') || 'Documents'}
          subtitle={t('mineDocumentsSub') || 'Mining license, lease deed, contracts and other supporting documents — add a description and set an expiry date to get a reminder before it lapses.'}
        />

        <FormSection title={t('mineOther') || 'Other'}>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
            />
            {t('defaultBranch')}
          </label>
          <div>
            <FormLabel>{t('remarks')}</FormLabel>
            <textarea className="input min-h-[70px]" value={form.remarks} onChange={setF('remarks')} />
          </div>
        </FormSection>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={() => navigate('/admin/mines')} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-[140px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (t('save') || 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
