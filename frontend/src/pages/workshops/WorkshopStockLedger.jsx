import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { History, ArrowLeft, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR, formatQty } from '../../hooks/useShopApi';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import api from '../../api/axios';

const REF_TYPE_LABELS = {
  stock_in: 'Stock In',
  job_usage: 'Workshop Job',
  adjustment_in: 'Adjustment In',
  adjustment_out: 'Adjustment Out',
};

export default function WorkshopStockLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { error } = useToast();
  const { shopParams, shopReady, branches } = useShopApi();
  const isRTL = lang === 'ur';

  const [item, setItem] = useState(null);
  const [movements, setMovements] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const params = { ...shopParams(), workshop_item_id: id };
      if (branchId) params.branch_id = branchId;
      const { data } = await api.get('/workshops/stock/ledger', { params });
      setItem(data.item);
      setMovements(data.movements || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, shopReady, id, branchId, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={History}
        accent="amber"
        title={item ? `${t('workshopLedger') || 'Stock Ledger'} — ${item.name}` : (t('workshopLedger') || 'Stock Ledger')}
        subtitle={item ? `${item.item_code} · ${item.unit}` : ''}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={`${item?.name || ''} — ${t('workshopLedger') || 'Stock Ledger'}`}
              signature
              columns={[
                { header: t('date') || 'Date', key: 'createdAt', width: 1, render: m => new Date(m.createdAt).toLocaleDateString('en-GB') },
                { header: t('type') || 'Type', render: m => REF_TYPE_LABELS[m.ref_type] || m.ref_type, width: 1 },
                { header: t('mine') || 'Mine', render: m => m.Branch?.name || '—', width: 1 },
                { header: t('quantity') || 'Qty', render: m => formatQty(m.quantity), width: 0.8 },
                { header: t('unitCost') || 'Unit Cost', render: m => formatPKR(m.unit_cost), width: 1, money: true },
                { header: t('balance') || 'Balance', render: m => formatQty(m.balance_after), width: 0.8 },
                { header: t('note') || 'Note', render: m => m.note || m.User?.name || '—', width: 1.4 },
              ]}
              rows={movements}
              filename="workshop-stock-ledger.pdf"
            />
            <button type="button" onClick={() => navigate('/workshops/items')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />{t('back') || 'Back'}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4">
        <div className="max-w-xs">
          <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">{t('allMines') || 'All mines'}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('date') || 'Date'}</th>
                <th className="text-start p-4 font-medium">{t('type') || 'Type'}</th>
                <th className="text-start p-4 font-medium">{t('mine') || 'Mine'}</th>
                <th className="text-start p-4 font-medium">{t('quantity') || 'Qty'}</th>
                <th className="text-start p-4 font-medium">{t('unitCost') || 'Unit Cost'}</th>
                <th className="text-start p-4 font-medium">{t('balance') || 'Balance'}</th>
                <th className="text-start p-4 font-medium">{t('note') || 'Note'}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5">
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{new Date(m.createdAt).toLocaleDateString('en-GB')}</td>
                  <td className="p-4"><span className="badge">{REF_TYPE_LABELS[m.ref_type] || m.ref_type}</span></td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.Branch?.name || '—'}</td>
                  <td className="p-4 font-medium" style={{ color: parseFloat(m.quantity) < 0 ? '#f87171' : '#4ade80' }}>
                    {parseFloat(m.quantity) > 0 ? '+' : ''}{formatQty(m.quantity)}
                  </td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{formatPKR(m.unit_cost)}</td>
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{formatQty(m.balance_after)}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.note || m.User?.name || '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noWorkshopMovements') || 'No stock movements yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
