import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  company_id: string;
  must_reset_password: boolean;
}

interface Company {
  id: string;
  name: string;
  country: string;
  base_currency: string;
}

interface AuthState {
  user: User | null;
  company: Company | null;
  token: string | null;
  theme: 'dark' | 'light';
  sidebarOpen: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;

  setAuth: (token: string, user: User, company: Company) => void;
  logout: () => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
}

export const useStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  company: JSON.parse(localStorage.getItem('company') || 'null'),
  token: localStorage.getItem('token'),
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  sidebarOpen: false,
  toast: null,

  setAuth: (token, user, company) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('company', JSON.stringify(company));
    set({ token, user, company });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('company');
    set({ token: null, user: null, company: null });
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      return { theme: newTheme };
    });
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 4000);
  },

  clearToast: () => set({ toast: null }),
}));
