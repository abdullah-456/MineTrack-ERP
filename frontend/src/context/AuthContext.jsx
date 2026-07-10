import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading]         = useState(true);

  // Modal states driven by backend flags
  const [showSetupModal, setShowSetupModal]         = useState(false);
  const [showCashCheckin, setShowCashCheckin]       = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setPermissions(data.permissions);

      // Determine which modal to show based on backend flags
      if (data.user?.role === 'admin' && data.user?.shop_id) {
        if (!data.setup_completed) {
          // First time — show the full setup wizard
          setShowSetupModal(true);
          setShowCashCheckin(false);
        } else if (!data.cash_session_today) {
          // Setup done but no cash check-in today
          setShowCashCheckin(true);
          setShowSetupModal(false);
        } else {
          setShowSetupModal(false);
          setShowCashCheckin(false);
        }
      }
    } catch {
      setUser(null);
      setPermissions([]);
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
    setShowSetupModal(false);
    setShowCashCheckin(false);
  };

  // Called when the setup wizard is completed
  const onSetupComplete = () => {
    setShowSetupModal(false);
    // Re-fetch so cash_session_today is re-evaluated
    fetchMe();
  };

  // Called when cash check-in is completed or skipped
  const onCashCheckinComplete = () => {
    setShowCashCheckin(false);
  };

  // Permission check — super_admin bypasses everything
  const can = (module, action) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return permissions.includes(`${module}:${action}`) || permissions.includes('*:*');
  };

  // Convenience helpers
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
      showSetupModal,
      showCashCheckin,
      onSetupComplete,
      onCashCheckinComplete,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
