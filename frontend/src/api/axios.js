import axios from 'axios';

// In dev this falls back to the local backend; in a deployed build, set
// VITE_API_URL (e.g. https://your-backend.onrender.com/api) as a build-time
// env var on the hosting platform — Vite inlines it at build time.
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
        localStorage.setItem('accessToken', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        // Only force a logout when the server actually rejected the refresh
        // token (expired/invalid) — a network blip or a dev-server restart
        // has no `.response` at all and shouldn't wipe a valid session.
        if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
