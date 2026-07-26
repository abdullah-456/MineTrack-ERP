/** Default branch/godown location state for forms and filters. */
export const EMPTY_LOCATION = {
  location_type: 'branch',
  branch_id: '',
  godown_id: null,
};

export function defaultLocation(branches) {
  return {
    location_type: 'branch',
    branch_id: branches[0]?.id ? String(branches[0].id) : '',
    godown_id: null,
  };
}

export function normalizeLocation(value) {
  if (value && typeof value === 'object' && 'location_type' in value) {
    return {
      location_type: value.location_type === 'godown' ? 'godown' : 'branch',
      branch_id: value.branch_id ? String(value.branch_id) : '',
      godown_id: value.godown_id ? String(value.godown_id) : null,
    };
  }
  return {
    location_type: 'branch',
    branch_id: value ? String(value) : '',
    godown_id: null,
  };
}

/** Resolve linked branch IDs for a godown record. */
export function linkedBranchIds(godown, branches = []) {
  const fromGodown = (godown?.Branches || []).map(b => String(b.id));
  if (fromGodown.length) return fromGodown;
  const fallback = branches.filter(b => String(b.godown_id) === String(godown?.id)).map(b => String(b.id));
  return fallback;
}

/** Sum product stock across branch IDs (or all branches when empty). */
export function stockForProductAtLocation(product, location, products, branches, godowns = []) {
  const p = product
    ? products.find(x => String(x.id) === String(product))
    : products.find(x => String(x.id) === String(product?.id));
  if (!p?.Stock) return 0;

  const loc = normalizeLocation(location);
  if (loc.location_type === 'godown' && loc.godown_id) {
    if (loc.branch_id) {
      const row = p.Stock.find(s => String(s.branch_id) === String(loc.branch_id));
      return parseFloat(row?.quantity_on_hand ?? 0);
    }
    const godown = godowns.find(g => String(g.id) === String(loc.godown_id));
    const branchIds = linkedBranchIds(godown, branches);
    if (!branchIds.length) return 0;
    return p.Stock
      .filter(s => branchIds.includes(String(s.branch_id)))
      .reduce((sum, s) => sum + (parseFloat(s.quantity_on_hand) || 0), 0);
  }

  const bid = loc.branch_id;
  if (bid) {
    const row = p.Stock.find(s => String(s.branch_id) === String(bid));
    return parseFloat(row?.quantity_on_hand ?? 0);
  }

  return p.Stock.reduce((sum, s) => sum + (parseFloat(s.quantity_on_hand) || 0), 0);
}

/** Filter inventory/movement rows by branch or godown location. */
export function filterRowsByLocation(rows, location, godowns = [], branches = []) {
  const loc = normalizeLocation(location);
  if (loc.location_type === 'branch') {
    if (!loc.branch_id) return rows;
    return rows.filter(r => String(r.branch_id) === String(loc.branch_id));
  }
  if (!loc.godown_id) return rows;
  const godown = godowns.find(g => String(g.id) === String(loc.godown_id));
  const branchIds = linkedBranchIds(godown, branches);
  if (!branchIds.length) return [];
  return rows.filter(r => branchIds.includes(String(r.branch_id)));
}

/** API query branch_id — single branch or first linked branch for godown filter. */
export function apiBranchFilter(location, godowns = [], branches = []) {
  const loc = normalizeLocation(location);
  if (loc.location_type === 'branch') return loc.branch_id || undefined;
  if (!loc.godown_id) return undefined;
  const godown = godowns.find(g => String(g.id) === String(loc.godown_id));
  const branchIds = linkedBranchIds(godown, branches);
  return branchIds[0] || undefined;
}
