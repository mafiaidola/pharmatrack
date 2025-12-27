import axios from 'axios';

// Dynamic API URL - uses same hostname as frontend to support mobile/network access
// When accessed via localhost:3000, backend is localhost:8001
// When accessed via 192.168.x.x:3000, backend is 192.168.x.x:8001

/**
 * Get the backend base URL dynamically
 * For use across the application for image URLs, file downloads, etc.
 * @returns {string} Backend base URL (e.g., http://192.168.1.22:8001)
 */
export const getBackendBaseUrl = () => {
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  const hostname = window.location.hostname;
  return `http://${hostname}:8001`;
};

const getApiBaseUrl = () => {
  return getBackendBaseUrl() + '/api';
};

const API_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;