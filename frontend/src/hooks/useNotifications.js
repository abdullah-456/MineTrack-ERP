import { useCallback, useEffect, useState } from 'react';
import { useShopApi } from './useShopApi';
import { fetchNotificationCount, fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../api/notifications';

const POLL_MS = 60000;

// Polls the unread count in the background (mirrors Dashboard.jsx's POLL_MS
// pattern) and fetches the full list only when the bell dropdown opens.
// markRead is optimistic — the item is grayed out and the count decremented
// immediately, matching the user's requirement that reading a notification
// visibly decrements the bell's counter without waiting on a round trip.
export function useNotifications() {
  const { shopParams, shopReady } = useShopApi();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!shopReady) return;
    try {
      const count = await fetchNotificationCount(shopParams());
      setUnreadCount(count);
    } catch {
      // silent — a failed background poll shouldn't surface an error toast
    }
  }, [shopReady, shopParams]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshCount]);

  const loadList = useCallback(async () => {
    if (!shopReady) return;
    setLoading(true);
    try {
      const { notifications: list, unread_count } = await fetchNotifications(shopParams());
      setNotifications(list);
      setUnreadCount(unread_count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [shopReady, shopParams]);

  const markRead = useCallback(async (id) => {
    setNotifications(list => list.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount(c => Math.max(0, c - 1));
    try {
      await markNotificationRead(id, shopParams());
    } catch {
      loadList();
    }
  }, [shopParams, loadList]);

  const markAllRead = useCallback(async () => {
    setNotifications(list => list.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead(shopParams());
    } catch {
      loadList();
    }
  }, [shopParams, loadList]);

  return { unreadCount, notifications, loading, loadList, markRead, markAllRead };
}
