import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../hooks/useNotifications';

function useClickOutside(ref, handler) {
  useEffect(() => {
    function listener(e) {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler();
    }
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

export default function NotificationBell() {
  const { t } = useTheme();
  const { unreadCount, notifications, loading, loadList, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => { if (open) loadList(); }, [open, loadList]);

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button
        className="topbar-btn relative"
        title={t('notifications')}
        id="notifications-btn"
        onClick={() => setOpen(o => !o)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2"
            style={{ '--tw-ring-color': 'var(--bg-surface)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="dropdown-menu" style={{ width: '360px', maxWidth: '90vw', padding: 0, maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('notifications') || 'Notifications'}</span>
            {unreadCount > 0 && (
              <button type="button" className="text-xs flex items-center gap-1 text-brand-400 hover:underline" onClick={markAllRead}>
                <CheckCheck className="w-3.5 h-3.5" />{t('markAllRead') || 'Mark all read'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
          ) : notifications.length === 0 ? (
            <p className="text-xs text-center py-8 px-4" style={{ color: 'var(--text-muted)' }}>{t('noNotifications') || 'No notifications'}</p>
          ) : (
            <div>
              {notifications.map(n => {
                const days = daysUntil(n.due_date);
                const overdue = days < 0;
                return (
                  <div
                    key={n.id}
                    className="px-4 py-3 flex items-start gap-2 cursor-pointer hover:bg-white/5"
                    style={{ borderBottom: '1px solid var(--border-subtle)', opacity: n.is_read ? 0.55 : 1 }}
                    onClick={() => !n.is_read && markRead(n.id)}
                  >
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${overdue ? 'text-red-400' : 'text-amber-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        {n.title}
                        {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        {n.module_label} · {overdue ? (t('overdue') || 'Overdue') : `${days} ${t('daysLeft') || 'days left'}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
