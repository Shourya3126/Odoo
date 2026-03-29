import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  LayoutDashboard, Receipt, CheckCircle, Users, GitBranch,
  LogOut, Sun, Moon, Menu, X, Bell
} from 'lucide-react';

export default function Layout() {
  const { user, company, logout, theme, toggleTheme, sidebarOpen, toggleSidebar, toast } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
    { to: '/expenses', icon: Receipt, label: 'Expenses', roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
    { to: '/approvals', icon: CheckCircle, label: 'Approvals', roles: ['MANAGER', 'ADMIN'] },
    { to: '/users', icon: Users, label: 'Users', roles: ['ADMIN'] },
    { to: '/workflows', icon: GitBranch, label: 'Workflows', roles: ['ADMIN'] },
  ];

  const filteredNav = navItems.filter((item) => item.roles.includes(user?.role || ''));

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: 'white'
            }}>
              E
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                {company?.name || 'ExpenseHub'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{company?.base_currency}</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '8px 0' }}>
          {filteredNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => sidebarOpen && toggleSidebar()}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 600, fontSize: 13
            }}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.role}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={toggleTheme} className="btn btn-secondary btn-icon" title="Toggle theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={handleLogout} className="btn btn-secondary btn-icon" title="Logout" style={{ flex: 1 }}>
              <LogOut size={16} /> <span style={{ fontSize: 13 }}>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', zIndex: 30
      }}>
        <button onClick={toggleSidebar} className="btn btn-icon btn-secondary">
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{company?.name || 'ExpenseHub'}</span>
        <button className="btn btn-icon btn-secondary"><Bell size={18} /></button>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          onClick={toggleSidebar}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 35 }}
          className="md:hidden"
        />
      )}

      {/* Main content */}
      <main className="main-content" style={{ paddingTop: window.innerWidth < 768 ? 72 : 24 }}>
        <Outlet />
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
