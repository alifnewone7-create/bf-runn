// Central axios instance used across the app.
//   - Always sends the JWT from localStorage as a Bearer header.
//   - Sends cookies with every request (needed for the httpOnly refresh cookie).
//   - On a 401, transparently calls /api/auth/refresh to mint a new access token
//     from the refresh cookie, updates localStorage, and retries the original
//     request. This is what stops the "logged out after a few minutes" bug.
import axios from 'axios';

import { API_BASE as API } from './apiBase';

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bfg_token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API}/api/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        if (data && data.token) {
          localStorage.setItem('bfg_token', data.token);
          return data.token;
        }
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url = (original.url || '').toString();

    const isAuthEndpoint =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/register') ||
      url.includes('/api/auth/google') ||
      url.includes('/api/auth/refresh');

    if (status === 401 && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        const newToken = await refreshAccessToken();
        if (newToken) {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (_e) {
        // fall through — refresh failed
      }
    }
    return Promise.reject(error);
  }
);

export { API };
export default api;
