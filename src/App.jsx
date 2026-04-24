import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useTenant } from './context/TenantContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Inventory from './pages/inventory/index.jsx';
import Sales from './pages/sales/index.jsx';
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
import Purchases from './pages/purchases';
import Suppliers from './pages/Suppliers';
import SupplierLedger from './pages/SupplierLedger';
import Maintenance from './pages/Maintenance';
import Invoices from './pages/Invoices';
import ClientSettlement from './pages/ClientSettlement';
import AdminPanel from './pages/AdminPanel';
import TenantSetup from './pages/TenantSetup';
import SuperAdminPortal from './pages/admin/SuperAdminPortal';
import NoAccess from './pages/NoAccess';
import { ProtectedRoute } from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalLoading from './components/GlobalLoading';

/**
 * GuestRoute: Redirects authenticated users away from the login page.
 */
const GuestRoute = ({ children }) => {
  const { currentUser } = useAuth();
  const { currentTenant, isSyncComplete } = useTenant();

  if (!isSyncComplete) return <GlobalLoading />;

  if (currentUser) {
    if (currentTenant) {
      return <Navigate to={`/${currentTenant.slug}/dashboard`} replace />;
    }
    return <Navigate to="/no-access" replace />;
  }

  return children;
};

/**
 * TenantResolver: Validates the :tenantSlug param matches the user's tenant.
 */
const TenantResolver = ({ children }) => {
  const { tenantSlug } = useParams();
  const { currentTenant, resolveTenantBySlug, isSyncComplete, isImpersonating, loading } = useTenant();
  const { currentUser } = useAuth();
  const [isResolving, setIsResolving] = React.useState(false);

  React.useEffect(() => {
    if (tenantSlug && !currentTenant && currentUser?.roles?.includes('GLOBAL_ADMIN') && !isResolving) {
      setIsResolving(true);
      resolveTenantBySlug(tenantSlug).finally(() => setIsResolving(false));
    }
  }, [tenantSlug, currentTenant, currentUser, isResolving, resolveTenantBySlug]);

  if (loading || isResolving || !isSyncComplete) return <GlobalLoading />;

  if (currentTenant && tenantSlug !== currentTenant.slug && !isImpersonating) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#141c1a] p-6 text-center">
        <div className="max-w-md w-full glass-panel border-red-500/20 p-8">
          <h1 className="text-xl font-bold text-white mb-2">Workspace Not Found</h1>
          <p className="text-gray-400 text-sm mb-6">The workspace /{tenantSlug} is inaccessible.</p>
          <button onClick={() => window.location.href = "/"} className="btn-signature w-full">Go Home</button>
        </div>
      </div>
    );
  }

  return children;
};

/**
 * RootRedirect: Sends / to /:tenantSlug/dashboard or /login
 */
const RootRedirect = () => {
  const { currentUser, isSyncComplete: authSyncComplete } = useAuth();
  const { currentTenant, isSyncComplete: tenantSyncComplete } = useTenant();
  
  const isSyncComplete = authSyncComplete && tenantSyncComplete;

  if (!isSyncComplete) return <GlobalLoading />;

  if (currentUser) {
    const userEmail = currentUser.email?.toLowerCase();
    const isGlobalAdmin = currentUser.roles?.includes('GLOBAL_ADMIN') || 
                         userEmail === 'uvaize@hotmail.com' || 
                         userEmail === 'gladmin@ledgrpro.ca';

    if (isGlobalAdmin) return <Navigate to="/nexus-hq" replace />;
    if (currentTenant) return <Navigate to={`/${currentTenant.slug}/dashboard`} replace />;
    return <Navigate to="/no-access" replace />;
  }

  return <Navigate to="/login" replace />;
};

function AppRoutes() {
  const { isOwner, hasRole, loading: authLoading } = useAuth();
  const { loading: tenantLoading } = useTenant();
  const location = useLocation();

  if (authLoading || tenantLoading) return <GlobalLoading />;

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/setup" element={<ProtectedRoute requireGlobalAdmin={true}><TenantSetup /></ProtectedRoute>} />
      <Route path="/no-access" element={<NoAccess />} />
      <Route path="/admin" element={<ProtectedRoute requireGlobalAdmin><AdminPanel /></ProtectedRoute>} />
      <Route path="/nexus-hq" element={<ProtectedRoute requireGlobalAdmin><SuperAdminPortal /></ProtectedRoute>} />

      <Route path="/:tenantSlug" element={<TenantResolver><AppLayout /></TenantResolver>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="vehicles" element={<ProtectedRoute><Vehicles /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="payroll" element={<ProtectedRoute><Payroll /></ProtectedRoute>} />
        <Route path="daybook" element={<ProtectedRoute><DayBook /></ProtectedRoute>} />
        <Route path="purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
        <Route path="suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="suppliers/ledger/:id" element={<ProtectedRoute><SupplierLedger /></ProtectedRoute>} />
        <Route path="invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="clients/settle/:id" element={<ProtectedRoute><ClientSettlement /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </Router>
  );
}

export default App;
