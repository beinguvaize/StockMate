import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Expenses from './pages/Expenses';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Vehicles from './pages/Vehicles';
import Users from './pages/Users';
import Clients from './pages/Clients';
import Reports from './pages/Reports';
import Orders from './pages/Orders';
import Payroll from './pages/Payroll';

/**
 * ProtectedRoute: Redirects to /login if the user is not authenticated.
 * Shows a loading spinner while the app initializes.
 */
const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAppContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#141c1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#38e0a0]/30 border-t-[#38e0a0] rounded-full animate-spin" />
          <span className="text-[#747576] text-xs font-bold uppercase tracking-widest">Loading...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

/**
 * GuestRoute: Redirects authenticated users away from the login page.
 */
const GuestRoute = ({ children }) => {
  const { currentUser, loading } = useAppContext();

  if (loading) return null;

  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public route: Login */}
      <Route path="/login" element={
        <GuestRoute>
          <Login />
        </GuestRoute>
      } />

      {/* Protected routes: All app pages */}
      <Route path="/" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="sales" element={<Sales />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<Users />} />
        <Route path="clients" element={<Clients />} />
        <Route path="reports" element={<Reports />} />
        <Route path="orders" element={<Orders />} />
        <Route path="payroll" element={<Payroll />} />
      </Route>

      {/* Catch-all: redirect to home (which will redirect based on auth) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AppProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AppProvider>
  );
}

export default App;
