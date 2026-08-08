import api from './axios';

export async function fetchNotificationCount(params) {
  const { data } = await api.get('/notifications/count', { params });
  return data.unread_count;
}

export async function fetchNotifications(params) {
  const { data } = await api.get('/notifications', { params });
  return data;
}

export async function markNotificationRead(id, params) {
  await api.put(`/notifications/${id}/read`, {}, { params });
}

export async function markAllNotificationsRead(params) {
  await api.put('/notifications/mark-all-read', {}, { params });
}
