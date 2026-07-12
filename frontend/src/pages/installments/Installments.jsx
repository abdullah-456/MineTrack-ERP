import { useState, useEffect, useCallback } from 'react';
import { Calendar, Plus, Search, Loader2, ChevronDown, CheckCircle2, Clock, AlertTriangle, DollarSign, X, CreditCard, Banknote, Smartphone, Building2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import api from '../../api/axios';

const STATUS_CONFIG = {
  active:    { color: 'text-brand-400',   bg: 'bg-brand-500/15 border-brand-500/25',     icon: Clock,        label_key: 'activePlan' },
  closed:    { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25', icon: CheckCircle2, label_key: 'closedPlan' },
  defaulted: { color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/25',         icon: AlertTriangle, label_key: 'defaultedPlan' },
};

const SCHEDULE_STATUS = {
  pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', label_key: 'pending' },
  paid:    { color: 'text-emerald-400', bg: 'bg-emerald-500/15', label_key: 'paid' },
  overdue: { color: 'text-red-400',     bg: 'bg-red-500/15',     label_key: 'overdue' },
};

function ProgressBar({ paid, total }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : '#6366f1' }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
    </div>
  );
}

export default function Installments() {
  const { t, lang } = useTheme();
  const { success, error } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [planDetail, setPlanDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [modal, setModal] = useState(null); // 'detail' | 'pay'
  const [payTarget, setPayTarget] = useState(null); // schedule row being paid
  const [payForm, setPayForm] = useState({ amount_paid: '', method: 'cash', payment_date: new Date().toISOString().slice(0, 10), late_fee_charged: '0' });
  const [saving, setSaving] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams() };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/installments', { params });
      setPlans(data.plans || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, statusFilter, error, t]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openDetail = async (plan) => {
    setSelectedPlan(plan);
    setModal('detail');
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/installments/${plan.id}`, { params: shopParams() });
      setPlanDetail(data.plan);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const openPayModal = (schedule) => {
    setPayTarget(schedule);
    setPayForm({
      amount_paid: String(schedule.due_amount),
      method: 'cash',
      payment_date: new Date().toISOString().slice(0, 10),
      late_fee_charged: String(schedule.late_fee || 0),
    });
    setModal('pay');
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(
        `/installments/${planDetail.id}/pay/${payTarget.id}`,
        {
          amount_paid: parseFloat(payForm.amount_paid),
          method: payForm.method,
          payment_date: payForm.payment_date,
          late_fee_charged: parseFloat(payForm.late_fee_charged || 0),
          ...shopParams(),
        }
      );
      success(t('paymentRecorded'));
      setModal('detail');
      // Refresh detail
      const { data } = await api.get(`/installments/${planDetail.id}`, { params: shopParams() });
      setPlanDetail(data.plan);
      fetchPlans();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = plans.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.Customer?.name?.toLowerCase().includes(q) ||
      p.Sale?.invoice_number?.toLowerCase().includes(q)
    );
  });

  const filterTabs = [
    { key: 'all', label: t('allPlans') },
    { key: 'active', label: t('activeOnly') },
    { key: 'closed', label: t('closedOnly') },
  ];

  const methodIcons = {
    cash:          <Banknote className="w-4 h-4" />,
    card:          <CreditCard className="w-4 h-4" />,
    bank:          <Building2 className="w-4 h-4" />,
    mobile_wallet: <Smartphone className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Calendar}
        accent="purple"
        title={t('installments')}
        subtitle={t('installmentsSub')}
      />

      {/* Search + Filter */}
      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder={t('filterPlans')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === tab.key ? 'bg-purple-500 text-white' : 'hover:bg-white/10'
              }`}
              style={statusFilter !== tab.key ? { color: 'var(--text-secondary)' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('customer')}</th>
                <th className="text-start p-4">{t('invoiceNo')}</th>
                <th className="text-start p-4">{t('totalAmount')}</th>
                <th className="text-start p-4">{t('downPayment')}</th>
                <th className="text-start p-4">{t('remaining')}</th>
                <th className="text-start p-4">{t('progress')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.active;
                const StatusIcon = sc.icon;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                    <td className="p-4">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.Customer?.name}</p>
                      {p.Customer?.phone && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.Customer.phone}</p>}
                    </td>
                    <td className="p-4 font-mono text-rose-400 text-xs">{p.Sale?.invoice_number}</td>
                    <td className="p-4 font-semibold text-emerald-400">{formatPKR(p.total_amount, lang)}</td>
                    <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatPKR(p.down_payment, lang)}</td>
                    <td className="p-4">
                      <span className={p.remaining_amount > 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                        {formatPKR(p.remaining_amount, lang)}
                      </span>
                      {p.overdue_count > 0 && (
                        <span className="ms-2 text-xs text-red-400">⚠ {p.overdue_count} {t('overdue')}</span>
                      )}
                    </td>
                    <td className="p-4 min-w-[140px]">
                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                        {p.paid_count} {t('of')} {p.total_count} {t('paidCount')}
                      </p>
                      <ProgressBar paid={p.paid_count} total={p.total_count} />
                    </td>
                    <td className="p-4">
                      <span className={`flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-medium border ${sc.bg} ${sc.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {t(sc.label_key)}
                      </span>
                    </td>
                    <td className="p-4 text-end">
                      <button
                        type="button"
                        onClick={() => openDetail(p)}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        {t('viewSchedule')}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    {t('noInstallments')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Plan Detail Modal ── */}
      {modal === 'detail' && (
        <Modal title={t('planDetail')} onClose={() => { setModal(null); setPlanDetail(null); }} wide>
          {loadingDetail ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
          ) : planDetail ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start gap-4 p-4 rounded-xl" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="flex-1">
                  <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{planDetail.Customer?.name}</h3>
                  {planDetail.Customer?.phone && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>📞 {planDetail.Customer.phone}</p>}
                  {planDetail.Customer?.cnic && <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{planDetail.Customer.cnic}</p>}
                </div>
                <div className="text-end">
                  <p className="font-mono text-rose-400 text-sm">{planDetail.Sale?.invoice_number}</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{formatPKR(planDetail.total_amount, lang)}</p>
                  <span className={`badge mt-1 ${planDetail.status === 'closed' ? 'badge-green' : planDetail.status === 'defaulted' ? 'badge-red' : 'badge-purple'}`}>
                    {t((planDetail.status || '') + 'Plan') || planDetail.status}
                  </span>
                </div>
              </div>

              {/* Plan Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  { label: t('downPayment'),    value: formatPKR(planDetail.down_payment, lang), color: 'text-emerald-400' },
                  { label: t('numInstallments'), value: planDetail.number_of_installments, color: '' },
                  { label: t('frequency'),       value: t(planDetail.frequency), color: '' },
                ].map((item, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                    <p className={`font-semibold ${item.color}`} style={!item.color ? { color: 'var(--text-primary)' } : {}}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Schedule Table */}
              <div>
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('installmentPreview')}</h4>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                  <table className="w-full text-sm">
                    <thead style={{ background: 'var(--bg-elevated)' }}>
                      <tr>
                        <th className="text-start p-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('installmentNo')}</th>
                        <th className="text-start p-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('dueDate')}</th>
                        <th className="text-start p-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('dueAmount')}</th>
                        <th className="text-start p-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('lateFee')}</th>
                        <th className="text-start p-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('status')}</th>
                        <th className="text-end p-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(planDetail.InstallmentSchedules || [])
                        .sort((a, b) => a.installment_no - b.installment_no)
                        .map(s => {
                          const ss = SCHEDULE_STATUS[s.status] || SCHEDULE_STATUS.pending;
                          const isPaid = s.status === 'paid';
                          const lastPayment = s.InstallmentPayments?.[s.InstallmentPayments.length - 1];
                          return (
                            <tr key={s.id} style={{ borderTop: '1px solid var(--border-subtle)' }} className={isPaid ? 'opacity-70' : ''}>
                              <td className="p-3 font-mono text-purple-400">#{s.installment_no}</td>
                              <td className="p-3" style={{ color: 'var(--text-secondary)' }}>
                                {new Date(s.due_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                                {s.status === 'overdue' && (
                                  <p className="text-xs text-red-400">{t('overdue')}</p>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-emerald-400">{formatPKR(s.due_amount, lang)}</td>
                              <td className="p-3 text-amber-400">
                                {parseFloat(s.late_fee) > 0 ? formatPKR(s.late_fee, lang) : '—'}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ss.bg} ${ss.color}`}>
                                  {t(ss.label_key)}
                                </span>
                                {isPaid && lastPayment && (
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {new Date(lastPayment.payment_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                                  </p>
                                )}
                              </td>
                              <td className="p-3 text-end">
                                {!isPaid && planDetail.status !== 'closed' && (
                                  <button
                                    type="button"
                                    onClick={() => openPayModal(s)}
                                    className="btn-primary text-xs px-3 py-1.5"
                                  >
                                    {t('recordPayment')}
                                  </button>
                                )}
                                {isPaid && <CheckCircle2 className="w-4 h-4 text-emerald-400 ms-auto me-1" />}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* ── Record Payment Modal ── */}
      {modal === 'pay' && payTarget && (
        <Modal
          title={`${t('recordPayment')} — ${t('installmentNo')} #${payTarget.installment_no}`}
          onClose={() => setModal('detail')}
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            {/* Due amount info */}
            <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex justify-between mb-1">
                <span style={{ color: 'var(--text-muted)' }}>{t('dueAmount')}</span>
                <span className="font-bold text-emerald-400">{formatPKR(payTarget.due_amount, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>{t('dueDate')}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {new Date(payTarget.due_date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('amountPaid')} *</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                required
                value={payForm.amount_paid}
                onChange={e => setPayForm(p => ({ ...p, amount_paid: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>{t('paymentMethod')} *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'cash', label: t('cash'), icon: Banknote },
                  { value: 'card', label: t('card'), icon: CreditCard },
                  { value: 'bank', label: t('bank'), icon: Building2 },
                  { value: 'mobile_wallet', label: t('mobileWallet'), icon: Smartphone },
                ].map(opt => {
                  const Icon = opt.icon;
                  const active = payForm.method === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPayForm(p => ({ ...p, method: opt.value }))}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all ${
                        active ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'hover:bg-white/5'
                      }`}
                      style={!active ? { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' } : {}}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('paymentDate')}</label>
                <input className="input" type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('lateFee')}</label>
                <input className="input" type="number" min="0" step="0.01" value={payForm.late_fee_charged} onChange={e => setPayForm(p => ({ ...p, late_fee_charged: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal('detail')} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('recordPayment')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
