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

// One in-flight refresh at a time — parallel 401s (e.g. branches + fiscal-years
// on load) used to each POST /auth/refresh and exhaust the rate limiter.
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        localStorage.setItem('accessToken', data.accessToken);
        return data.accessToken;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const hadAuth = Boolean(original?.headers?.Authorization);
    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (
      error.response?.status === 401
      && !original._retry
      && hadAuth
      && !isAuthRoute
    ) {
      original._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshError) {
        // Only force a logout when the server actually rejected the refresh
        // token (expired/invalid) — a network blip or a dev-server restart
        // has no `.response` at all and shouldn't wipe a valid session.
        if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
          localStorage.removeItem('accessToken');
          if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
