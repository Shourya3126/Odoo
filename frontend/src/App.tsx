import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import ExpenseForm from './pages/ExpenseForm';
import ExpenseDetail from './pages/ExpenseDetail';
import Approvals from './pages/Approvals';
import Users from './pages/Users';
import Workflows from './pages/Workflows';
import Layout from './components/Layout';
import './index.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  const theme = useStore((s) => s.theme);
  
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="expenses/new" element={<ExpenseForm />} />
          <Route path="expenses/:id" element={<ExpenseDetail />} />
          <Route path="expenses/:id/edit" element={<ExpenseForm />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="users" element={<Users />} />
          <Route path="workflows" element={<Workflows />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
