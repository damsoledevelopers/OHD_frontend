import axios from 'axios';

/** Sync with login/signup storage — required when API is on another origin (e.g. Render) and cookies are unreliable. */
export const AUTH_TOKEN_STORAGE_KEY = 'ohd_auth_token';

function trimTrailingSlash(s: string): string {
  return s.replace(/\/$/, '');
}

/**
 * Backend REST root including `/api`, from `NEXT_PUBLIC_API_URL` in `.env`.
 * Example: `http://localhost:5000/api` → requests like `POST …/companies/share-registration-link`.
 */
export const API_BASE_URL = trimTrailingSlash(
  (process.env.NEXT_PUBLIC_API_URL || 'https://ohd.onrender.com/api').trim()
);

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        localStorage.removeItem('user');
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

