import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

const DEFAULT_SETUP_MODAL = { open: false, initialStep: 1, focusMode: null, dismissible: false };

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading]         = useState(true);

  // Financial setup modal — first-time wizard or reopened from dashboard pills
  const [setupModal, setSetupModal]   = useState(DEFAULT_SETUP_MODAL);
  const [showCashCheckin, setShowCashCheckin] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setPermissions(data.permissions);

      // Determine which modal to show based on backend flags.
      // Opening cash now carries forward automatically from the previous day's
      // closing balance (like a bank account), so there's no daily cash
      // check-in prompt — only the first-time financial setup wizard remains.
      if (data.user?.role === 'admin' && data.user?.shop_id) {
        if (!data.setup_completed) {
          setSetupModal({ open: true, initialStep: 1, focusMode: null, dismissible: false });
        }
        setShowCashCheckin(false);
      }
    } catch (err) {
      // Only clear the session on a genuine auth rejection (401/403) — a
      // transient network error or a dev-server restart has no `.response`
      // and shouldn't log a still-valid session out.
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('accessToken');
        setUser(null);
        setPermissions([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) fetchMe();
    else setLoading(false);
  }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    setUser(data.user);
    await fetchMe();
    return data.user;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('accessToken');
    setUser(null);
    setPermissions([]);
    setSetupModal(DEFAULT_SETUP_MODAL);
    setShowCashCheckin(false);
  };

  const closeFinancialSetup = () => {
    setSetupModal(DEFAULT_SETUP_MODAL);
  };

  // Reopen setup from dashboard pills — focusMode: null | 'bank' | 'cash'
  const openFinancialSetup = (focusMode = null, initialStep = 1) => {
    setSetupModal({
      open: true,
      initialStep: focusMode === 'bank' ? 2 : focusMode === 'cash' ? 3 : initialStep,
      focusMode,
      dismissible: true,
    });
  };

  const onSetupComplete = () => {
    closeFinancialSetup();
    fetchMe();
  };

  const onCashCheckinComplete = () => {
    setShowCashCheckin(false);
  };

  // Permission check — super_admin bypasses everything
  const can = (module, action) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return permissions.includes(`${module}:${action}`) || permissions.includes('*:*');
  };

  const isSuperAdmin = () => user?.role === 'super_admin';
  const isAdmin      = () => user?.role === 'admin' || user?.role === 'super_admin';
  const shopId       = user?.shop_id || null;
  const shopName     = user?.shop_name || null;

  return (
    <AuthContext.Provider value={{
      user, permissions, loading,
      login, logout, can,
      isSuperAdmin, isAdmin,
      shopId, shopName,
      fetchMe,
      setupModal,
      showSetupModal: setupModal.open,
      openFinancialSetup,
      closeFinancialSetup,
      showCashCheckin,
      onSetupComplete,
      onCashCheckinComplete,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
