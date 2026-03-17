import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
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

function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          {/* Default to dashboard for UI development */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="login" element={<Navigate to="/dashboard" replace />} />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;
