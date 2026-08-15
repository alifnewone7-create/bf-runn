// Attaches interceptors to the DEFAULT axios instance so every page in the app
// (Dashboard, DemoTrade, Profile, AccountSwitcher, etc.) gets the same
// auto-refresh behaviour without needing to touch every file.
//
//   - Attaches the JWT from localStorage as a Bearer header on every request.
//   - Sends cookies with every request (needed for the httpOnly refresh cookie).
//   - On a 401 response, transparently calls /api/auth/refresh, saves the new
//     token in localStorage, and retries the original request one time.
import axios from 'axios';

import { API_BASE as API } from './apiBase';

axios.defaults.withCredentials = true;

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('bfg_token');
  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API}/api/auth/refresh`, {}, { withCredentials: true, _skipAuthRetry: true })
      .then(({ data }) => {
        if (data && data.token) {
          localStorage.setItem('bfg_token', data.token);
          return data.token;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

axios.interceptors.response.use(
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

    if (status === 401 && !original._retried && !isAuthEndpoint && !original._skipAuthRetry) {
      original._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return axios(original);
      }
    }
    return Promise.reject(error);
  }
);
