import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Inject auth token
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  signup: (data: any) => api.post('/auth/signup', data),
  login: (data: any) => api.post('/auth/login', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data: any) => api.post('/auth/reset-password', data),
  getMe: () => api.get('/auth/me'),
};

// Users
export const userAPI = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  sendPassword: (id: string) => api.post(`/users/${id}/send-password`),
  getManagers: () => api.get('/users/managers/list'),
};

// Expenses
export const expenseAPI = {
  list: (params?: any) => api.get('/expenses', { params }),
  get: (id: string) => api.get(`/expenses/${id}`),
  create: (data: FormData) => api.post('/expenses', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id: string, data: FormData) => api.patch(`/expenses/${id}`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  submit: (id: string) => api.post(`/expenses/${id}/submit`),
  getCategories: () => api.get('/expenses/categories/list'),
};

// Approvals
export const approvalAPI = {
  getPending: () => api.get('/approvals/pending'),
  approve: (id: string, comment?: string) => api.post(`/approvals/${id}/approve`, { comment }),
  reject: (id: string, comment?: string) => api.post(`/approvals/${id}/reject`, { comment }),
  getFlows: () => api.get('/approvals/flows'),
  getFlow: (id: string) => api.get(`/approvals/flows/${id}`),
  createFlow: (data: any) => api.post('/approvals/flows', data),
  deleteFlow: (id: string) => api.delete(`/approvals/flows/${id}`),
  toggleFlow: (id: string) => api.patch(`/approvals/flows/${id}/toggle`),
  getNotifications: () => api.get('/approvals/notifications'),
  markRead: (id: string) => api.patch(`/approvals/notifications/${id}/read`),
};

// Currency
export const currencyAPI = {
  getRates: (base?: string) => api.get('/currency/rates', { params: { base } }),
  convert: (from: string, to: string, amount: number) =>
    api.get('/currency/convert', { params: { from, to, amount } }),
  getSupported: () => api.get('/currency/supported'),
};

// OCR
export const ocrAPI = {
  process: (file: File) => {
    const fd = new FormData();
    fd.append('receipt', file);
    return api.post('/ocr', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;
