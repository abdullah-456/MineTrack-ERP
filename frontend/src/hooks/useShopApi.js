import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export function useShopApi() {
  const { user, isSuperAdmin } = useAuth();
  const [shopId, setShopId] = useState(user?.shop_id || null);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    if (!user) return;
    if (user.shop_id) {
      setShopId(user.shop_id);
    } else if (isSuperAdmin()) {
      api.get('/branches/shops').then(({ data }) => {
        const first = data.shops?.[0];
        if (first) setShopId(first.id);
      }).catch(() => {});
    }
  }, [user, isSuperAdmin]);

  const shopParams = useCallback(() => {
    if (isSuperAdmin() && shopId) return { shop_id: shopId };
    return {};
  }, [isSuperAdmin, shopId]);

  const fetchBranches = useCallback(async () => {
    if (!user) {
      setBranches([]);
      return;
    }
    try {
      const params = shopParams();
      const { data } = await api.get('/branches', { params });
      setBranches(data.branches || []);
    } catch {
      setBranches([]);
    }
  }, [shopParams, user]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  return { shopId, setShopId, shopParams, branches, fetchBranches, isSuperAdmin: isSuperAdmin() };
}

export function formatPKR(amount, lang = 'en') {
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0) {
    return '—';
  }
  return `Rs. ${n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Like formatPKR, but a genuine zero prints as "Rs. 0" instead of "—".
// formatPKR's dash means two different things at once — "nothing here" and
// "this figure wasn't computed" — which is fine in a dense transaction table
// (an empty Bonus column reads fine as a dash) but wrong on a report's money-
// flow cards: a shop's first look at Reports Hub is usually a narrow date
// range with little activity yet, so most cards are legitimately zero, and a
// row of identical dashes reads as "this isn't fetching data" even though
// every one of them was computed correctly. Only a truly missing value
// (undefined/null/NaN — the API never returned this field) still shows "—".
export function formatPKROrZero(amount, lang = 'en') {
  if (amount === undefined || amount === null) return '—';
  const n = parseFloat(amount);
  if (isNaN(n)) return '—';
  return `Rs. ${n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatQty(amount, lang = 'en') {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
