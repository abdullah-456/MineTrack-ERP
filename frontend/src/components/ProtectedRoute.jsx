import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children, module, action, superAdminOnly = false }) {
  const { user, can, loading, isSuperAdmin } = useAuth();
  const { t } = useTheme();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (superAdminOnly && !isSuperAdmin()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('superAdminOnly')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('superAdminOnlySub')}</p>
      </div>
    );
  }

  if (module && action && !can(module, action)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('accessDenied')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('accessDeniedSub')}</p>
      </div>
    );
  }

  return children;
}
