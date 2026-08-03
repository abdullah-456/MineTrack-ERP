import { useState, useEffect, useCallback, useMemo } from 'react';
import { Building2, Warehouse } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useShopApi } from '../../hooks/useShopApi';
import api from '../../api/axios';
import { normalizeLocation, linkedBranchIds } from '../../utils/locationUtils';

export default function LocationPicker({
  value,
  onChange,
  required = false,
  label = null,
  compact = false,
  showBranchWithinGodown = true,
}) {
  const { t } = useTheme();
  const { branches, shopParams, shopReady } = useShopApi();
  const [godowns, setGodowns] = useState([]);
  const [loadingGodowns, setLoadingGodowns] = useState(false);

  const location = normalizeLocation(value);

  const fetchGodowns = useCallback(async () => {
    if (!shopReady) return;
    setLoadingGodowns(true);
    try {
      const { data } = await api.get('/godowns', { params: shopParams() });
      setGodowns(data.godowns || []);
    } catch (e) {
      console.error('Failed to load godowns', e);
    } finally {
      setLoadingGodowns(false);
    }
  }, [shopParams, shopReady]);

  useEffect(() => {
    fetchGodowns();
  }, [fetchGodowns]);

  const selectedGodown = useMemo(
    () => godowns.find(g => String(g.id) === String(location.godown_id)),
    [godowns, location.godown_id],
  );

  const godownBranches = useMemo(() => {
    if (!selectedGodown) return [];
    const ids = linkedBranchIds(selectedGodown, branches);
    return branches.filter(b => ids.includes(String(b.id)));
  }, [selectedGodown, branches]);

  const emitChange = (next) => {
    onChange?.({
      location_type: next.location_type,
      branch_id: next.branch_id || '',
      godown_id: next.godown_id || null,
      linked_branch_ids: next.linked_branch_ids || [],
    });
  };

  const handleTypeChange = (newType) => {
    if (newType === 'branch') {
      const defaultBranchId = location.branch_id || (branches[0]?.id ? String(branches[0].id) : '');
      emitChange({
        location_type: 'branch',
        branch_id: defaultBranchId,
        godown_id: null,
        linked_branch_ids: defaultBranchId ? [defaultBranchId] : [],
      });
      return;
    }

    const defaultGodown = godowns.find(g => g.status !== 'inactive') || godowns[0];
    const defaultGodownId = defaultGodown ? String(defaultGodown.id) : '';
    const linked = defaultGodown ? linkedBranchIds(defaultGodown, branches) : [];
    const defaultBranchId = linked[0] || (branches[0]?.id ? String(branches[0].id) : '');
    emitChange({
      location_type: 'godown',
      branch_id: defaultBranchId,
      godown_id: defaultGodownId || null,
      linked_branch_ids: linked,
    });
  };

  const handleBranchSelect = (branchId) => {
    emitChange({
      location_type: 'branch',
      branch_id: branchId,
      godown_id: null,
      linked_branch_ids: branchId ? [branchId] : [],
    });
  };

  const handleGodownSelect = (godownId) => {
    const g = godowns.find(x => String(x.id) === String(godownId));
    const linked = g ? linkedBranchIds(g, branches) : [];
    const branchId = linked[0] || '';
    emitChange({
      location_type: 'godown',
      branch_id: branchId,
      godown_id: godownId || null,
      linked_branch_ids: linked,
    });
  };

  const handleGodownBranchSelect = (branchId) => {
    emitChange({
      location_type: 'godown',
      branch_id: branchId,
      godown_id: location.godown_id,
      linked_branch_ids: godownBranches.map(b => String(b.id)),
    });
  };

  const godownUnlinked = location.location_type === 'godown' && location.godown_id && godownBranches.length === 0;

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {label && (
        <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}

      <div className={`flex items-${godownBranches.length > 1 && showBranchWithinGodown ? 'start' : 'center'} gap-2 flex-wrap`}>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg border max-w-[200px]" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => handleTypeChange('branch')}
            className={`flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-all ${
              location.location_type === 'branch'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> {t('branch') || 'Branch'}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('godown')}
            className={`flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-all ${
              location.location_type === 'godown'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Warehouse className="w-3.5 h-3.5" /> {t('godown') || 'Godown'}
          </button>
        </div>

        <div className={`flex-1 min-w-[180px] ${godownBranches.length > 1 && showBranchWithinGodown ? 'space-y-2' : ''}`}>
          {location.location_type === 'branch' ? (
            <select
              className="input w-full text-xs"
              required={required}
              value={location.branch_id || ''}
              onChange={(e) => handleBranchSelect(e.target.value)}
            >
              <option value="">{t('selectBranch') || 'Select Branch'}</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_default ? `(${t('default') || 'Default'})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                className="input w-full text-xs"
                required={required}
                disabled={loadingGodowns}
                value={location.godown_id || ''}
                onChange={(e) => handleGodownSelect(e.target.value)}
              >
                <option value="">{t('selectGodown') || 'Select Godown'}</option>
                {godowns.map(g => {
                  const linked = linkedBranchIds(g, branches);
                  const linkedNames = linked
                    .map(id => branches.find(b => String(b.id) === id)?.name)
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <option key={g.id} value={g.id} disabled={!linked.length}>
                      {g.name} {g.code ? `[${g.code}]` : ''}{linkedNames ? ` (${linkedNames})` : ` (${t('unlinked') || 'Unlinked'})`}
                    </option>
                  );
                })}
              </select>

              {showBranchWithinGodown && godownBranches.length > 1 && (
                <select
                  className="input w-full text-xs"
                  required={required}
                  value={location.branch_id || ''}
                  onChange={(e) => handleGodownBranchSelect(e.target.value)}
                >
                  <option value="">{t('selectBranchWithinGodown') || 'Select branch within godown'}</option>
                  {godownBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      </div>

      {godownUnlinked && (
        <p className="text-xs text-amber-400">
          {t('godownNeedsLinkedBranch') || 'This godown has no linked branches. Link branches from Godowns or Branches module first.'}
        </p>
      )}
    </div>
  );
}
