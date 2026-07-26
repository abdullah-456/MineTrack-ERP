import { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Eye, Loader2, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import ReportFilters, { filterByDate } from '../../components/ui/ReportFilters';
import api from '../../api/axios';

export default function Invoices() {
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, shopId } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [reportFilters, setReportFilters] = useState({ from: '', to: '', sale_type: '', customer_id: '' });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), type: typeFilter };
      const [invRes, custRes] = await Promise.all([
        api.get('/invoices', { params }),
        api.get('/customers', { params: shopParams() }),
      ]);
      setInvoices(invRes.data.invoices || []);
      setCustomers(custRes.data.customers || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, typeFilter, error, t]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const openInvoice = (inv) => {
    const params = shopId ? `?shop_id=${shopId}` : '';
    window.open(`/invoice/${inv.id}${params}`, '_blank', 'noopener,noreferrer');
  };

  const downloadInvoicePDF = (inv) => {
    const params = shopId ? `?shop_id=${shopId}&auto_print=1` : '?auto_print=1';
    window.open(`/invoice/${inv.id}${params}`, '_blank', 'noopener,noreferrer');
  };

  const getInvoiceTypeBadge = (type) => {
    switch (type) {
      case 'sale':     return <span className="badge badge-green">{t('sale') || 'Sale'}</span>;
      case 'purchase': return <span className="badge badge-blue">{t('purchase') || 'Purchase'}</span>;
      case 'return':   return <span className="badge bg-rose-500/10 text-rose-400 border border-rose-500/20">{t('returns') || 'Return'}</span>;
      default:         return <span className="badge">{type}</span>;
    }
  };

  const filterTabs = [
    { key: 'all',      label: t('allPlans') || 'All' },
    { key: 'sale',     label: t('sales') || 'Sales' },
    { key: 'purchase', label: t('navProcurement') || 'Purchases' },
    { key: 'return',   label: t('returns') || 'Returns' },
  ];

  // Client-side filtering
  let displayRows = filterByDate(invoices, 'date', reportFilters.from, reportFilters.to);
  if (reportFilters.sale_type)  displayRows = displayRows.filter(inv => inv.sale_type === reportFilters.sale_type);
  if (reportFilters.customer_id) displayRows = displayRows.filter(inv => String(inv.customer_id) === String(reportFilters.customer_id));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    displayRows = displayRows.filter(inv =>
      (inv.invoice_number || '').toLowerCase().includes(q) ||
      (inv.entity_name   || '').toLowerCase().includes(q) ||
      (inv.sale_type     || '').toLowerCase().includes(q) ||
      (inv.type          || '').toLowerCase().includes(q) ||
      (inv.status        || '').toLowerCase().includes(q) ||
      (String(inv.amount) || '').toLowerCase().includes(q) ||
      (inv.date ? new Date(inv.date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK') : '').toLowerCase().includes(q)
    );
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={FileText}
        accent="brand"
        title={t('invoices') || 'Invoices'}
        subtitle={t('invoicesSub') || 'View all transaction invoices (Sales, Procurement and Returns)'}
      />

      <div className="glass-card p-4 space-y-3">
        <div className="relative max-w-md">
          <Search
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }}
          />
          <input
            className="input"
            style={{ paddingInlineStart: '2.5rem' }}
            placeholder="Search invoice #, customer, supplier, type, status…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTypeFilter(tab.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                typeFilter === tab.key ? 'bg-brand-500 text-white' : 'hover:bg-[var(--bg-hover)]'
              }`}
              style={typeFilter !== tab.key ? { color: 'var(--text-secondary)' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <ReportFilters
          value={reportFilters}
          onChange={(k, v) => setReportFilters(f => ({ ...f, [k]: v }))}
          onClear={() => setReportFilters({ from: '', to: '', sale_type: '', customer_id: '' })}
          selects={[
            { key: 'sale_type',   label: t('saleType') || 'Sale Type', options: ['cash', 'bank', 'credit', 'card'].map(v => ({ value: v, label: t(v) || v })) },
            { key: 'customer_id', label: t('customer') || 'Customer',  options: customers.map(c => ({ value: c.id, label: c.name })) },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[850px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4">{t('invoiceNo')}</th>
                <th className="text-start p-4">{t('date')}</th>
                <th className="text-start p-4">{t('invoiceType') || 'Invoice Type'}</th>
                <th className="text-start p-4">{t('saleType') || 'Sale Type'}</th>
                <th className="text-start p-4">{t('customer')} / {t('supplier')}</th>
                <th className="text-start p-4">{t('total')}</th>
                <th className="text-start p-4">{t('status')}</th>
                <th className="text-end p-4">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(inv => (
                <tr
                  key={inv.id}
                  id={`row-${inv.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(inv.id) ? 'highlight-row' : 'hover:bg-white/5'} cursor-pointer transition-colors`}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    openInvoice(inv);
                  }}
                >
                  <td className="p-4 font-mono text-brand-400 text-xs font-bold">{inv.invoice_number}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(inv.date).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                  </td>
                  <td className="p-4">{getInvoiceTypeBadge(inv.type)}</td>
                  <td className="p-4 capitalize" style={{ color: 'var(--text-secondary)' }}>{inv.sale_type || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-primary)' }}>{inv.entity_name}</td>
                  <td className="p-4 font-bold text-emerald-400">{formatPKR(inv.amount, lang)}</td>
                  <td className="p-4"><StatusBadge status={inv.status} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openInvoice(inv)} className="icon-btn" title={t('view') || 'View Invoice'}>
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => downloadInvoicePDF(inv)} className="icon-btn" title="Download PDF" style={{ color: 'var(--text-secondary)' }}>
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    {t('noSales') || 'No invoices found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
