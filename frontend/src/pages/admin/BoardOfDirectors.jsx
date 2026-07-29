import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Plus, Edit, Trash2, Loader2, Search, BookOpen } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useShopApi, formatPKR } from '../../hooks/useShopApi';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import PageHeader from '../../components/ui/PageHeader';
import ReportActions from '../../components/ui/ReportActions';
import Modal from '../../components/ui/Modal';
import FormLabel from '../../components/ui/FormLabel';
import api from '../../api/axios';

const EMPTY = {
  name: '', phone: '', cnic: '', address: '',
  investment_amount: '',
  current_cash_name: '',
  current_bank_name: '',
  current_cash_amount: '',
  current_bank_amount: '',
};

// Only the prefix is typed — "Current Cash" / "Current Bank" is fixed, so the
// stored name is always "<prefix> Current Cash". Strip it off an existing value
// when loading so editing never stacks the suffix twice.
const WALLET_SUFFIX_RE = /[\s—–-]*current\s*(?:cash|bank)\s*$/i;
const walletPrefix = (stored) => String(stored ?? '').replace(WALLET_SUFFIX_RE, '').trim();

/** Text input whose fixed wallet-type suffix is rendered inside, but not editable. */
function WalletNameInput({ value, onChange, suffix, placeholder, required }) {
  return (
    <div
      className="flex items-stretch rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border-input)', backgroundColor: 'var(--bg-input)' }}
    >
      <input
        className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm outline-none"
        style={{ color: 'var(--text-primary)' }}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <span
        className="flex items-center px-3 text-xs font-semibold whitespace-nowrap select-none"
        style={{
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-elevated)',
          borderInlineStart: '1px solid var(--border-subtle)',
        }}
      >
        {suffix}
      </span>
    </div>
  );
}

export default function BoardOfDirectors() {
  const navigate = useNavigate();
  const { t, lang } = useTheme();
  const { success, error, confirm } = useToast();
  const { shopParams } = useShopApi();
  const isRTL = lang === 'ur';
  const { isHighlighted } = useHighlightRow();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...shopParams(), search };
      const { data } = await api.get('/board-members', { params });
      setMembers(data.members || []);
    } catch (e) {
      error(e.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [shopParams, search, error, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...shopParams(),
      };
      if (modal === 'create') {
        await api.post('/board-members', payload);
        success(t('boardMemberCreated'));
      } else {
        await api.put(`/board-members/${selected.id}`, {
          name: form.name,
          phone: form.phone,
          cnic: form.cnic,
          address: form.address,
          current_cash_name: form.current_cash_name,
          current_bank_name: form.current_bank_name,
          ...shopParams(),
        });
        success(t('boardMemberUpdated'));
      }
      setModal(null);
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    const ok = await confirm({
      title: t('deleteBoardMember') || 'Delete board member',
      message: `${t('confirmDeleteBoardMember')} (${m.name})`,
      confirmLabel: t('delete') || 'Delete',
      cancelLabel: t('cancel') || 'Cancel',
    });
    if (!ok) return;
    try {
      const res = await api.delete(`/board-members/${m.id}`, { params: shopParams() });
      success(res.status === 202 ? t('deletionRequestSubmitted') : t('boardMemberDeleted'));
      fetchData();
    } catch (err) {
      error(err.response?.data?.message || t('toastErrorGeneric'));
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Crown}
        accent="amber"
        title={t('boardOfDirectors')}
        subtitle={t('boardOfDirectorsSub')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ReportActions
              title={t('boardOfDirectors') || 'Board of Directors'}
              columns={[
                { header: t('name') || 'Name', key: 'name', width: 1.8 },
                { header: t('phone') || 'Phone', render: m => m.phone || '', width: 1.2 },
                { header: t('cnic') || 'CNIC', render: m => m.cnic || '', width: 1.3 },
                { header: t('address') || 'Address', render: m => m.address || '', width: 2.5 },
                { header: t('boardMemberOpeningBalance') || 'Opening Balance', render: m => m.opening_balance != null ? Number(m.opening_balance).toLocaleString() : '0', width: 1.2 },
                { header: t('investmentBalance') || 'Investment', render: m => Number(m.investment_balance ?? m.current_balance ?? 0).toLocaleString(), width: 1.1 },
                { header: t('currentCash') || 'Current Cash', render: m => Number(m.current_cash_balance || 0).toLocaleString(), width: 1.1 },
                { header: t('currentBank') || 'Current Bank', render: m => Number(m.current_bank_balance || 0).toLocaleString(), width: 1.1 },
              ]}
              rows={members}
              filename="board-of-directors.pdf"
            />
            <button type="button" onClick={() => { setForm(EMPTY); setModal('create'); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />{t('addBoardMember')}
            </button>
          </div>
        }
      />

      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4" style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingInlineStart: '2.5rem' }} placeholder={t('searchBoardMembers')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="text-start p-4 font-medium">{t('name')}</th>
                <th className="text-start p-4 font-medium">{t('phone')}</th>
                <th className="text-start p-4 font-medium">{t('cnic')}</th>
                <th className="text-start p-4 font-medium">{t('address')}</th>
                <th className="text-start p-4 font-medium">{t('boardMemberOpeningBalance') || 'Opening Balance'}</th>
                <th className="text-end p-4 font-medium">{t('investmentBalance') || 'Investment'}</th>
                <th className="text-end p-4 font-medium">{t('currentCash') || 'Current Cash'}</th>
                <th className="text-end p-4 font-medium">{t('currentBank') || 'Current Bank'}</th>
                <th className="text-end p-4 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members
                .filter(m => !search.trim() || [
                  m.name, m.phone, m.cnic, m.address, m.email, m.status,
                  String(m.opening_balance), String(m.investment_balance), String(m.current_cash_balance), String(m.current_bank_balance), String(m.current_balance)
                ].some(v => (v || '').toLowerCase().includes(search.trim().toLowerCase())))
                .map(m => (
                <tr
                  key={m.id}
                  id={`row-${m.id}`}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  className={`${isHighlighted(m.id) ? 'highlight-row' : 'hover:bg-white/10'} cursor-pointer transition-colors`}
                  title={t('viewLedger') || 'View Ledger'}
                  onClick={(e) => {
                    if (e.target.closest('button')) return;
                    navigate(`/admin/board-of-directors/${m.id}/ledger`);
                  }}
                >
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.phone || '—'}</td>
                  <td className="p-4 font-mono" style={{ color: 'var(--text-secondary)' }}>{m.cnic || '—'}</td>
                  <td className="p-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>{m.address || '—'}</td>
                  <td className="p-4" style={{ color: 'var(--text-secondary)' }}>{m.opening_balance != null ? Number(m.opening_balance).toLocaleString() : '0'}</td>
                  <td className="p-4 text-end font-bold" style={{ color: 'var(--text-primary)' }}>{formatPKR(m.investment_balance ?? m.current_balance, lang)}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{formatPKR(m.current_cash_balance || 0, lang)}</td>
                  <td className="p-4 text-end" style={{ color: 'var(--text-secondary)' }}>{formatPKR(m.current_bank_balance || 0, lang)}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/admin/board-of-directors/${m.id}/ledger`)} title={t('viewLedger')} className="icon-btn">
                        <BookOpen className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setForm({
                            name: m.name, phone: m.phone || '', cnic: m.cnic || '', address: m.address || '',
                            current_cash_name: walletPrefix(m.current_cash_name),
                            current_bank_name: walletPrefix(m.current_bank_name),
                            investment_amount: '', current_cash_amount: '', current_bank_amount: '',
                          });
                          setModal('edit');
                        }}
                        className="icon-btn"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(m)} className="icon-btn text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('noBoardMembers')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal xl title={modal === 'create' ? t('addBoardMember') : t('editBoardMember')} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>{t('name')}</FormLabel>
                <input className="input" required value={form.name} onChange={setF('name')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('phone')}</label>
                <input className="input" value={form.phone} onChange={setF('phone')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('cnic')}</label>
                <input className="input" placeholder="35202-1234567-1" value={form.cnic} onChange={setF('cnic')} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('address')}</label>
                <input className="input" value={form.address} onChange={setF('address')} />
              </div>
            </div>
            {modal === 'create' && (
              <div className="space-y-3 rounded-lg p-4" style={{ border: '1px solid var(--border-subtle)' }}>
                <div>
                  <FormLabel>{t('openingAccounts') || 'Opening accounts'}</FormLabel>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('bodOpeningHint') || 'Investment is a memo claim (does not change Cash in Hand / Bank). Name the Current Cash & Bank wallets — those names appear in payment pickers everywhere. Capital cash only moves on Deposit or Transfer.'}
                  </p>
                </div>
                <div className="space-y-2 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                    {t('investmentAccount') || 'Investment Account (amount)'}
                  </label>
                  <input
                    className="input" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.investment_amount}
                    onChange={setF('investment_amount')}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 rounded-lg p-3 h-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                      {t('currentCashAccountName')}
                    </label>
                    <WalletNameInput
                      required
                      suffix={t('currentCashNameSuffix')}
                      placeholder={form.name || t('name')}
                      value={form.current_cash_name}
                      onChange={setF('current_cash_name')}
                    />
                    <label className="text-xs font-semibold block mt-2" style={{ color: 'var(--text-secondary)' }}>
                      {t('openingAmount') || 'Opening amount'}
                    </label>
                    <input
                      className="input" type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.current_cash_amount}
                      onChange={setF('current_cash_amount')}
                    />
                  </div>
                  <div className="space-y-2 rounded-lg p-3 h-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
                      {t('currentBankAccountName')}
                    </label>
                    <WalletNameInput
                      required
                      suffix={t('currentBankNameSuffix')}
                      placeholder={form.name || t('name')}
                      value={form.current_bank_name}
                      onChange={setF('current_bank_name')}
                    />
                    <label className="text-xs font-semibold block mt-2" style={{ color: 'var(--text-secondary)' }}>
                      {t('openingAmount') || 'Opening amount'}
                    </label>
                    <input
                      className="input" type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.current_bank_amount}
                      onChange={setF('current_bank_amount')}
                    />
                  </div>
                </div>
              </div>
            )}
            {modal === 'edit' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>{t('currentCashAccountName')}</FormLabel>
                  <WalletNameInput
                    required
                    suffix={t('currentCashNameSuffix')}
                    placeholder={form.name || t('name')}
                    value={form.current_cash_name}
                    onChange={setF('current_cash_name')}
                  />
                </div>
                <div>
                  <FormLabel required>{t('currentBankAccountName')}</FormLabel>
                  <WalletNameInput
                    required
                    suffix={t('currentBankNameSuffix')}
                    placeholder={form.name || t('name')}
                    value={form.current_bank_name}
                    onChange={setF('current_bank_name')}
                  />
                </div>
                <p className="md:col-span-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('accountNameSuffixHint')}
                </p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
