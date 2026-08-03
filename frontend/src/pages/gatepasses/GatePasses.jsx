import { useState, useEffect, useCallback } from 'react';
import { Ticket, Plus, Search, Eye, Printer, Trash2, Loader2, Truck, User, Calendar, FileText } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatQty } from '../../hooks/useShopApi';
import { useFiscalYear } from '../../context/FiscalYearContext';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import ReportActions from '../../components/ui/ReportActions';
import ReportFilters, { filterByDate, activeFilterList } from '../../components/ui/ReportFilters';
import LocationPicker from '../../components/ui/LocationPicker';
import { defaultLocation, filterRowsByLocation } from '../../utils/locationUtils';
import api from '../../api/axios';
import { useFiscalYearGuard } from '../../hooks/useFiscalYearGuard';

const dispatchTypeBadgeColor = {
  sale_dispatch: 'badge-green',
  pre_sale: 'badge-blue',
  transfer: 'badge-purple',
  return: 'badge-yellow',
  other: 'badge-blue'
};

export default function GatePasses() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams, shopReady, branches } = useShopApi();
  const { listParams } = useFiscalYear();
  const { canWrite } = useFiscalYearGuard();
  const isRTL = lang === 'ur';

  const [gatePasses, setGatePasses] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [locationFilter, setLocationFilter] = useState({ location_type: 'branch', branch_id: '', godown_id: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'detail' | 'delete'
  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shopReady) return;
    api.get('/godowns', { params: shopParams() })
      .then(({ data }) => setGodowns(data.godowns || []))
      .catch(() => setGodowns([]));
  }, [shopParams, shopReady]);

  const [form, setForm] = useState({
    location_type: 'branch', branch_id: '', godown_id: null,
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    gate_pass_date: new Date().toISOString().slice(0, 16),
    type: 'sale_dispatch',
    vehicle_no: '',
    driver_name: '',
    driver_phone: '',
    remarks: '',
    items: [{ product_id: '', product_name: '', quantity: 1, unit: 'kg', notes: '' }]
  });

  const [reportFilters, setReportFilters] = useState({ from: '', to: '', type: '', branch_id: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), ...listParams, search };
      const [gpRes, pRes, cRes] = await Promise.all([
        api.get('/gatepasses', { params }),
        api.get('/products', { params: shopParams() }),
        api.get('/customers', { params: shopParams() })
      ]);
      setGatePasses(gpRes.data.gate_passes || []);
      setProducts(pRes.data.products || []);
      setCustomers(cRes.data.customers || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, listParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (branches.length && !form.branch_id) {
      setForm(f => ({ ...f, ...defaultLocation(branches) }));
    }
  }, [branches, form.branch_id]);

  const addLine = () => setForm(f => ({
    ...f, items: [...f.items, { product_id: '', product_name: '', quantity: 1, unit: 'kg', notes: '' }]
  }));

  const updateLine = (i, k, v) => setForm(f => {
    const items = [...f.items];
    items[i] = { ...items[i], [k]: v };
    if (k === 'product_id') {
      const prod = products.find(p => String(p.id) === String(v));
      if (prod) {
        items[i].product_name = prod.name;
        items[i].unit = prod.unit || 'kg';
      }
    }
    return { ...f, items };
  });

  const removeLine = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const validItems = form.items.filter(i => (i.product_id || i.product_name?.trim())).map(i => ({
        product_id: i.product_id ? parseInt(i.product_id, 10) : null,
        product_name: i.product_name?.trim() || 'Item',
        quantity: parseFloat(i.quantity) || 1,
        unit: i.unit || 'kg',
        notes: i.notes?.trim() || null
      }));

      if (!validItems.length) {
        error(t('addAtLeastOneItem') || 'Add at least one product line');
        setSaving(false);
        return;
      }
      if (!form.branch_id) {
        error(t('selectBranchRequired'));
        setSaving(false);
        return;
      }

      const payload = {
        branch_id: parseInt(form.branch_id, 10),
        customer_id: form.customer_id ? parseInt(form.customer_id, 10) : null,
        customer_name: form.customer_name?.trim() || null,
        customer_phone: form.customer_phone?.trim() || null,
        gate_pass_date: form.gate_pass_date,
        type: form.type,
        vehicle_no: form.vehicle_no?.trim() || null,
        driver_name: form.driver_name?.trim() || null,
        driver_phone: form.driver_phone?.trim() || null,
        remarks: form.remarks?.trim() || null,
        items: validItems,
        ...shopParams()
      };

      const { data } = await api.post('/gatepasses', payload);
      success(t('gatepassCreatedSuccess') || 'Gatepass created successfully');
      setModal(null);
      fetchData();

      // Open print slip in new tab immediately
      if (data.gate_pass?.id) {
        window.open(`/gatepass/${data.gate_pass.id}?auto_print=1`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api.delete(`/gatepasses/${deleteTarget.id}`, { params: shopParams() });
      success('Gatepass deleted successfully');
      setModal(null);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const viewDetail = async (id) => {
    try {
      const { data } = await api.get(`/gatepasses/${id}`, { params: shopParams() });
      setDetail(data.gate_pass);
      setModal('detail');
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  // Report filters for datatable
  const reportSelects = [
    { key: 'type', label: t('gatepassType') || 'Dispatch Type', options: [
      { value: 'sale_dispatch', label: t('saleDispatch') || 'Sale Dispatch' },
      { value: 'pre_sale', label: t('preSale') || 'Pre-Sale Dispatch' },
      { value: 'transfer', label: t('stockTransfer') },
      { value: 'return', label: t('sampleReturn') || 'Return / Sample' },
      { value: 'other', label: t('otherDispatch') || 'Other' },
    ]},
    { key: 'branch_id', label: t('userBranch') || 'Branch', options: branches.map(b => ({ value: b.id, label: b.name })) }
  ];

  let filteredRows = filterByDate(gatePasses, 'gate_pass_date', reportFilters.from, reportFilters.to);
  filteredRows = filterRowsByLocation(filteredRows, locationFilter, godowns, branches);
  if (reportFilters.type) filteredRows = filteredRows.filter(gp => gp.type === reportFilters.type);
  if (reportFilters.branch_id) filteredRows = filteredRows.filter(gp => String(gp.branch_id) === String(reportFilters.branch_id));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filteredRows = filteredRows.filter(gp =>
      (gp.gate_pass_number || '').toLowerCase().includes(q) ||
      (gp.customer_name || gp.Customer?.name || '').toLowerCase().includes(q) ||
      (gp.customer_phone || '').toLowerCase().includes(q) ||
      (gp.vehicle_no || '').toLowerCase().includes(q) ||
      (gp.driver_name || '').toLowerCase().includes(q) ||
      (gp.driver_phone || '').toLowerCase().includes(q) ||
      (gp.remarks || '').toLowerCase().includes(q) ||
      (gp.type || '').toLowerCase().includes(q) ||
      (gp.Branch?.name || '').toLowerCase().includes(q) ||
      (gp.gate_pass_date ? new Date(gp.gate_pass_date).toLocaleString('en-PK') : '').toLowerCase().includes(q) ||
      (gp.GatePassItems || []).some(i => (i.product_name || i.Product?.name || '').toLowerCase().includes(q))
    );
  }

  const reportColumns = [
    { header: t('gatepassNumber') || 'Gatepass #', key: 'gate_pass_number', width: 1.4 },
    { header: t('date') || 'Date & Time', render: gp => new Date(gp.gate_pass_date).toLocaleString('en-PK'), width: 1.4 },
    { header: t('receiverName') || 'Receiver / Customer', render: gp => gp.customer_name || gp.Customer?.name || 'Walk-in', width: 1.5 },
    { header: t('userBranch') || 'Branch', render: gp => gp.Branch?.name || '', width: 1.1 },
    { header: t('gatepassType') || 'Type', render: gp => t(gp.type) || gp.type, width: 1 },
    { header: t('vehicleNo') || 'Vehicle #', render: gp => gp.vehicle_no || '—', width: 1 },
    { header: t('driverName') || 'Driver', render: gp => gp.driver_name || '—', width: 1 },
    { header: t('quantity') || 'Items Qty', render: gp => (gp.GatePassItems || []).map(i => `${formatQty(i.quantity)} ${i.unit || 'kg'}`).join(', ') || '—', width: 1.8 }
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Ticket}
        accent="indigo"
        title={t('gatepasses') || 'Gatepasses'}
        subtitle={t('gatepassSub') || 'Issue and manage gatepass clearance slips for stock dispatches'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('gatepasses') || 'Gatepasses Report'}
              columns={reportColumns}
              rows={filteredRows}
              filters={activeFilterList(reportFilters, reportSelects)}
              filename="gatepasses-report.pdf"
            />
            {canWrite && (
            <button
              type="button"
              onClick={() => {
                setForm({
                  ...defaultLocation(branches),
                  customer_id: '',
                  customer_name: '',
                  customer_phone: '',
                  gate_pass_date: new Date().toISOString().slice(0, 16),
                  type: 'sale_dispatch',
                  vehicle_no: '',
                  driver_name: '',
                  driver_phone: '',
                  remarks: '',
                  items: [{ product_id: '', product_name: '', quantity: 1, unit: 'kg', notes: '' }]
                });
                setModal('create');
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />{t('createGatepass') || 'Create Gatepass'}
            </button>
            )}
          </div>
        }
      />

      {/* Summary stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Gatepasses</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{gatePasses.length}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Today's Dispatches</p>
            <p className="text-xl font-bold text-emerald-400">
              {gatePasses.filter(g => new Date(g.gate_pass_date).toDateString() === new Date().toDateString()).length}
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sale Dispatches</p>
            <p className="text-xl font-bold text-blue-400">
              {gatePasses.filter(g => g.type === 'sale_dispatch').length}
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pre-Sale & Transfers</p>
            <p className="text-xl font-bold text-purple-400">
              {gatePasses.filter(g => g.type !== 'sale_dispatch').length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
            <input
              className="input"
              style={{ paddingInlineStart: '2.5rem' }}
              placeholder={t('searchGatepass') || 'Search gatepass #, customer, driver, vehicle...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
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
          onClear={() => setReportFilters({ from: '', to: '', type: '', branch_id: '' })}
          selects={reportSelects}
        />
      </div>

      {/* Datatable */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[850px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('gatepassNumber') || 'Gatepass #'}</th>
                <th className="text-start p-4">{t('date') || 'Date & Time'}</th>
                <th className="text-start p-4">{t('receiverName') || 'Receiver / Customer'}</th>
                <th className="text-start p-4">{t('userBranch') || 'Branch'}</th>
                <th className="text-start p-4">{t('gatepassType') || 'Type'}</th>
                <th className="text-start p-4">Vehicle / Driver</th>
                <th className="text-start p-4">Items / Qty</th>
                <th className="text-end p-4">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(gp => (
                <tr key={gp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4 font-mono text-indigo-400 font-bold text-xs">{gp.gate_pass_number}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(gp.gate_pass_date).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-primary)' }}>
                    <div className="font-semibold">{gp.customer_name || gp.Customer?.name || t('walkIn')}</div>
                    {gp.customer_phone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{gp.customer_phone}</div>}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{gp.Branch?.name}</td>
                  <td className="p-4">
                    <span className={`badge ${dispatchTypeBadgeColor[gp.type] || 'badge-blue'}`}>
                      {t(gp.type) || gp.type}
                    </span>
                  </td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {gp.vehicle_no ? <div><span className="font-medium text-amber-400">{gp.vehicle_no}</span> ({gp.driver_name || 'Driver'})</div> : '—'}
                  </td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {(gp.GatePassItems || []).map(i => `${i.product_name} (${formatQty(i.quantity)} ${i.unit})`).join(', ') || '—'}
                  </td>
                  <td className="p-4 text-end whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      title={t('printGatepass') || 'Print / Download Gatepass'}
                      onClick={() => window.open(`/gatepass/${gp.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
                      className="icon-btn"
                    >
                      <Printer className="w-4 h-4 text-indigo-400" />
                    </button>
                    <button
                      type="button"
                      title={t('viewDetails') || 'View details'}
                      onClick={() => viewDetail(gp.id)}
                      className="icon-btn"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title={t('delete') || 'Delete'}
                      onClick={() => { setDeleteTarget(gp); setModal('delete'); }}
                      className="icon-btn text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noGatepasses') || 'No gatepasses found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Gatepass Modal ── */}
      {modal === 'create' && (
        <Modal title={t('createGatepass') || 'Create Gatepass'} onClose={() => setModal(null)} wide>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <LocationPicker
                  required
                  label={t('branchGodownLocation')}
                  value={{
                    location_type: form.location_type,
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
                <FormLabel>{t('gatepassType') || 'Dispatch Type'}</FormLabel>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="sale_dispatch">{t('saleDispatch') || 'Sale Dispatch'}</option>
                  <option value="pre_sale">{t('preSale') || 'Pre-Sale Dispatch'}</option>
                  <option value="transfer">{t('stockTransfer')}</option>
                  <option value="return">{t('sampleReturn') || 'Return / Sample'}</option>
                  <option value="other">{t('otherDispatch') || 'Other Dispatch'}</option>
                </select>
              </div>

              <div>
                <FormLabel required>{t('gatepassDate') || 'Gatepass Date & Time'}</FormLabel>
                <input
                  type="datetime-local"
                  className="input"
                  required
                  value={form.gate_pass_date}
                  onChange={e => setForm(f => ({ ...f, gate_pass_date: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('receiverName') || 'Receiver / Customer'}</FormLabel>
                <select
                  className="input mb-1"
                  value={form.customer_id}
                  onChange={e => {
                    const cid = e.target.value;
                    const cust = customers.find(c => String(c.id) === String(cid));
                    setForm(f => ({
                      ...f,
                      customer_id: cid,
                      customer_name: cust ? cust.name : f.customer_name,
                      customer_phone: cust ? (cust.phone || f.customer_phone) : f.customer_phone
                    }));
                  }}
                >
                  <option value="">-- Manual / Walk-in Receiver --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || 'Registered'})</option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Or enter receiver name..."
                  value={form.customer_name}
                  onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('receiverPhone') || 'Receiver Phone'}</FormLabel>
                <input
                  className="input"
                  placeholder="Receiver phone number..."
                  value={form.customer_phone}
                  onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('vehicleNo') || 'Vehicle Number'}</FormLabel>
                <input
                  className="input"
                  placeholder="e.g. LES-1234, Suzuki Truck..."
                  value={form.vehicle_no}
                  onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('driverName') || 'Driver Name'}</FormLabel>
                <input
                  className="input"
                  placeholder="Driver full name..."
                  value={form.driver_name}
                  onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                />
              </div>

              <div>
                <FormLabel>{t('driverPhone') || 'Driver Phone'}</FormLabel>
                <input
                  className="input"
                  placeholder="Driver phone number..."
                  value={form.driver_phone}
                  onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Dispatched Products / Items<span className="text-red-400 ms-0.5">*</span>
                </span>
                <button type="button" onClick={addLine} className="text-xs text-indigo-400 hover:underline">+ {t('addLine')}</button>
              </div>

              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-lg p-2" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="sm:col-span-4">
                    <select
                      className="input text-xs"
                      value={item.product_id}
                      onChange={e => updateLine(i, 'product_id', e.target.value)}
                    >
                      <option value="">-- Pick Product or Custom --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      className="input text-xs"
                      placeholder="Item name / description..."
                      value={item.product_name}
                      onChange={e => updateLine(i, 'product_name', e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min="0.1"
                      step="0.01"
                      required
                      className="input text-xs"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={e => updateLine(i, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      className="input text-xs"
                      placeholder="Unit (kg, pcs)"
                      value={item.unit}
                      onChange={e => updateLine(i, 'unit', e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-1 text-end">
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-300 text-lg px-2">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Remarks */}
            <div>
              <FormLabel>{t('remarks') || 'Remarks / Notes'}</FormLabel>
              <textarea
                className="input min-h-[60px] resize-none"
                placeholder="Gatepass remarks, special delivery instructions, serial numbers..."
                value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (t('createGatepass') || 'Create & Print Gatepass')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Detail Modal ── */}
      {modal === 'detail' && detail && (
        <Modal title={t('gatepassDetails') || 'Gatepass Details'} onClose={() => { setModal(null); setDetail(null); }} wide>
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.open(`/gatepass/${detail.id}?auto_print=1`, '_blank', 'noopener,noreferrer')}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Printer className="w-4 h-4" />{t('printGatepass') || 'Print Gatepass Slip'}
              </button>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Ticket className="w-8 h-8 text-indigo-400" />
              <div>
                <p className="font-mono font-bold text-indigo-400 text-lg">{detail.gate_pass_number}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {new Date(detail.gate_pass_date).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                </p>
              </div>
              <div className="ms-auto text-end">
                <span className={`badge ${dispatchTypeBadgeColor[detail.type] || 'badge-blue'}`}>
                  {t(detail.type) || detail.type}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Receiver / Customer</p>
                <p className="font-medium">{detail.customer_name || detail.Customer?.name || 'Walk-in'}</p>
                {detail.customer_phone && <p className="text-xs text-indigo-400">{detail.customer_phone}</p>}
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Vehicle & Driver</p>
                <p className="font-medium text-amber-400">{detail.vehicle_no || 'No Vehicle'}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{detail.driver_name || 'No driver name'}</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Branch & Issuer</p>
                <p className="font-medium">{detail.Branch?.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Issued by: {detail.Issuer?.name || 'System'}</p>
              </div>
            </div>

            {detail.remarks && (
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Remarks</p>
                <p className="text-sm whitespace-pre-wrap">{detail.remarks}</p>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="text-start p-2">Item Description</th>
                  <th className="text-start p-2">SKU</th>
                  <th className="text-end p-2">Quantity</th>
                  <th className="text-start p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(detail.GatePassItems || []).map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="p-2 font-medium">{item.Product?.name || item.product_name}</td>
                    <td className="p-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{item.Product?.sku || '—'}</td>
                    <td className="p-2 text-end font-bold text-emerald-400">{formatQty(item.quantity)} {item.unit || 'kg'}</td>
                    <td className="p-2 text-xs" style={{ color: 'var(--text-muted)' }}>{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {modal === 'delete' && deleteTarget && (
        <Modal title={t('delete') || 'Delete Gatepass'} onClose={() => { setModal(null); setDeleteTarget(null); }}>
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('confirmDeleteGatepass') || 'Are you sure you want to delete this Gatepass?'}
            </p>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 font-mono text-xs text-red-400">
              {deleteTarget.gate_pass_number} — {deleteTarget.customer_name || 'Walk-in'}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setModal(null); setDeleteTarget(null); }} className="btn-secondary flex-1">
                {t('cancel')}
              </button>
              <button type="button" disabled={saving} onClick={handleDelete} className="btn-primary bg-red-600 hover:bg-red-700 flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
