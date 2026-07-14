import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export function useShopApi() {
  const { user, isSuperAdmin } = useAuth();
  const [shopId, setShopId] = useState(user?.shop_id || null);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    if (user?.shop_id) {
      setShopId(user.shop_id);
    } else if (isSuperAdmin()) {
      api.get('/branches/shops').then(({ data }) => {
        const first = data.shops?.[0];
        if (first) setShopId(first.id);
      }).catch(() => {});
    }
  }, [user?.shop_id, isSuperAdmin]);

  const shopParams = useCallback(() => {
    if (isSuperAdmin() && shopId) return { shop_id: shopId };
    return {};
  }, [isSuperAdmin, shopId]);

  const fetchBranches = useCallback(async () => {
    try {
      const params = shopParams();
      const { data } = await api.get('/branches', { params });
      setBranches(data.branches || []);
    } catch {
      setBranches([]);
    }
  }, [shopParams]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  return { shopId, setShopId, shopParams, branches, fetchBranches, isSuperAdmin: isSuperAdmin() };
}

export function formatPKR(amount, lang = 'en') {
  const n = parseFloat(amount) || 0;
  return `Rs. ${n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatQty(amount, lang = 'en') {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
