import axios, { AxiosError } from 'axios';

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

// Unwrap standardized responses + handle errors
api.interceptors.response.use(
  (res) => {
    // Backend returns { success, data, error } — unwrap data for convenience
    if (res.data && typeof res.data === 'object' && 'success' in res.data) {
      res.data = res.data.data; // Unwrap to just the data payload
    }
    return res;
  },
  async (err: AxiosError<any>) => {
    // Handle 401 — redirect to login
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // Offline detection — queue failed requests
    if (!err.response && err.code === 'ERR_NETWORK') {
      const failedReq = err.config;
      if (failedReq) {
        addToRetryQueue(failedReq);
      }
    }

    // Extract error message from standardized response
    if (err.response?.data?.error) {
      err.message = err.response.data.error;
    }

    return Promise.reject(err);
  }
);

// ─── OFFLINE RETRY QUEUE ───

const RETRY_QUEUE_KEY = 'offlineRetryQueue';

interface QueuedRequest {
  url: string;
  method: string;
  data?: any;
  timestamp: number;
}

function addToRetryQueue(config: any) {
  try {
    const queue: QueuedRequest[] = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]');
    // Don't queue GET requests or duplicates
    if (config.method === 'get') return;
    queue.push({
      url: config.url || '',
      method: config.method || 'post',
      data: config.data,
      timestamp: Date.now(),
    });
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[Offline] Queued ${config.method?.toUpperCase()} ${config.url}`);
  } catch (e) {}
}

export async function processRetryQueue() {
  try {
    const queue: QueuedRequest[] = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    console.log(`[Online] Processing ${queue.length} queued requests`);
    const remaining: QueuedRequest[] = [];

    for (const req of queue) {
      try {
        await api({ url: req.url, method: req.method, data: req.data });
        console.log(`[Retry] Success: ${req.method.toUpperCase()} ${req.url}`);
      } catch {
        // Keep failed ones for next retry (if less than 1 hour old)
        if (Date.now() - req.timestamp < 3600000) remaining.push(req);
      }
    }

    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(remaining));
  } catch (e) {}
}

// Process queue when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Online] Network restored — processing retry queue');
    processRetryQueue();
  });
}

// ─── OFFLINE DRAFT STORAGE ───

const DRAFT_STORAGE_KEY = 'offlineDrafts';

export function saveDraftOffline(draft: any) {
  try {
    const drafts = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '[]');
    const existing = drafts.findIndex((d: any) => d.localId === draft.localId);
    if (existing >= 0) {
      drafts[existing] = { ...draft, updatedAt: Date.now() };
    } else {
      drafts.push({ ...draft, localId: draft.localId || `draft_${Date.now()}`, createdAt: Date.now() });
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {}
}

export function getOfflineDrafts(): any[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function removeOfflineDraft(localId: string) {
  try {
    const drafts = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '[]');
    const filtered = drafts.filter((d: any) => d.localId !== localId);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {}
}

// ─── API FUNCTIONS ───

export const authAPI = {
  signup: (data: any) => api.post('/auth/signup', data),
  login: (data: any) => api.post('/auth/login', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data: any) => api.post('/auth/reset-password', data),
  getMe: () => api.get('/auth/me'),
};

export const userAPI = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  sendPassword: (id: string) => api.post(`/users/${id}/send-password`),
  getManagers: () => api.get('/users/managers/list'),
};

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

export const currencyAPI = {
  getRates: (base?: string) => api.get('/currency/rates', { params: { base } }),
  convert: (from: string, to: string, amount: number) =>
    api.get('/currency/convert', { params: { from, to, amount } }),
  getSupported: () => api.get('/currency/supported'),
};

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
