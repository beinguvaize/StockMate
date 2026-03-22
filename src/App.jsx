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
import DayBook from './pages/DayBook';

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
        <Route path="daybook" element={<DayBook />} />
      </Route>

      {/* Catch-all: redirect to home (which will redirect based on auth) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const { initError, loading } = useAppContext();

  if (initError && !loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#141c1a] p-6 text-center">
        <div className="max-w-md w-full glass-panel border-[#dc2626]/20">
          <div className="w-16 h-16 bg-[#dc2626]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Configuration Required</h1>
          <p className="text-[#747576] text-sm mb-8 leading-relaxed">
            {initError}
          </p>
          <div className="space-y-3">
             <div className="bg-[#1a2321] rounded-xl p-4 text-left border border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-[#38e0a0] font-bold mb-2">Common Fix:</p>
                <p className="text-xs text-white/70 leading-relaxed">
                  Go to your <strong>Vercel Dashboard</strong> → <strong>Settings</strong> → <strong>Environment Variables</strong> and ensure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are correctly set.
                </p>
             </div>
             <button 
                onClick={() => window.location.reload()} 
                className="w-full bg-[#38e0a0] text-[#141c1a] font-bold py-3 rounded-xl hover:bg-[#2fb883] transition-colors"
             >
                Try Again
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
