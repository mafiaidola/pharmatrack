import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import GMDashboard from './pages/GMDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import MedicalRepDashboard from './pages/MedicalRepDashboard';
import Clinics from './pages/Clinics';
import ClinicDetails from './pages/ClinicDetails';
import Visits from './pages/Visits';
import Orders from './pages/Orders';
import Expenses from './pages/Expenses';
import Users from './pages/Users';
import Products from './pages/Products';
import Approvals from './pages/Approvals';
import GPSTracking from './pages/GPSTracking';
import PerformanceDashboard from './pages/PerformanceDashboard';
import Settings from './pages/Settings';
import Returns from './pages/Returns';
import Accounting from './pages/Accounting';
import Plans from './pages/Plans';
import { Toaster } from './components/ui/sonner';
import { SiteSettingsProvider } from './contexts/SiteSettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const ProtectedRoute = ({ children, allowedRoles }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  const DashboardRoute = () => {
    if (!user) return <Navigate to="/login" replace />;

    switch (user.role) {
      case 'super_admin':
        return <SuperAdminDashboard user={user} onLogout={handleLogout} />;
      case 'gm':
        return <GMDashboard user={user} onLogout={handleLogout} />;
      case 'manager':
        return <ManagerDashboard user={user} onLogout={handleLogout} />;
      case 'accountant':
        return <Orders user={user} onLogout={handleLogout} />;
      case 'medical_rep':
        return <MedicalRepDashboard user={user} onLogout={handleLogout} />;
      default:
        return <Navigate to="/login" replace />;
    }
  };

  return (
    <ThemeProvider>
      <SiteSettingsProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Routes>
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
            />
            <Route path="/" element={<DashboardRoute />} />
            <Route
              path="/clinics"
              element={
                <ProtectedRoute>
                  <Clinics user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clinics/:id"
              element={
                <ProtectedRoute>
                  <ClinicDetails user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits"
              element={
                <ProtectedRoute>
                  <Visits user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <Orders user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'gm', 'manager']}>
                  <Users user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <Products user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/approvals"
              element={
                <ProtectedRoute allowedRoles={['manager', 'gm', 'super_admin']}>
                  <Approvals user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gps-tracking"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <GPSTracking user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/performance"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'gm', 'manager']}>
                  <PerformanceDashboard user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'gm']}>
                  <Settings user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/returns"
              element={
                <ProtectedRoute allowedRoles={['accountant', 'super_admin']}>
                  <Returns user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting"
              element={
                <ProtectedRoute allowedRoles={['accountant', 'gm', 'super_admin']}>
                  <Accounting user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plans"
              element={
                <ProtectedRoute>
                  <Plans user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </SiteSettingsProvider>
    </ThemeProvider>
  );
};

export default App;