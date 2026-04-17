import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
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
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Maintenance from './pages/Maintenance';
import Invoices from './pages/Invoices';
import ClientSettlement from './pages/ClientSettlement';
import AdminPanel from './pages/AdminPanel';
import TenantSetup from './pages/TenantSetup';
import SuperAdminPortal from './pages/admin/SuperAdminPortal';
import AuditLog from './pages/AuditLog';
import NoAccess from './pages/NoAccess';
import { ProtectedRoute } from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalLoading from './components/GlobalLoading';


/**
 * GuestRoute: Redirects authenticated users away from the login page.
 */
const GuestRoute = ({ children }) => {
  const { currentUser, currentTenant, isSyncComplete } = useAppContext();

  if (!isSyncComplete) return <GlobalLoading />;

  if (currentUser) {
    if (currentTenant) {
      return <Navigate to={`/${currentTenant.slug}/dashboard`} replace />;
    }
    // If sync is complete and we still have no tenant, they truly have no access
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * TenantResolver: Validates the :tenantSlug param matches the user's tenant.
 */
const TenantResolver = ({ children }) => {
  const { tenantSlug } = useParams();
  const { currentTenant, currentUser, loading, isImpersonating, resolveTenantBySlug, isSyncComplete } = useAppContext();
  const [isResolving, setIsResolving] = React.useState(false);
  const attemptedSlugRef = React.useRef(null);

  React.useEffect(() => {
    // If we have a slug but no tenant context, and user is a Global Admin, auto-resolve
    if (tenantSlug && !currentTenant && currentUser?.roles?.includes('GLOBAL_ADMIN') && !isResolving && attemptedSlugRef.current !== tenantSlug) {
      setIsResolving(true);
      attemptedSlugRef.current = tenantSlug;
      resolveTenantBySlug(tenantSlug).finally(() => {
        setIsResolving(false);
      });
    }
  }, [tenantSlug, currentTenant, currentUser, isResolving, resolveTenantBySlug]);

  if (loading || isResolving || !isSyncComplete) return <GlobalLoading />;

  // Allow Global Admin impersonation — skip mismatch when bridging
  if (currentTenant && tenantSlug !== currentTenant.slug && !isImpersonating) {
    if (currentUser?.roles?.includes('GLOBAL_ADMIN') && attemptedSlugRef.current !== tenantSlug) {
       return <GlobalLoading />;
    }

    return (
      <div className="flex items-center justify-center h-screen bg-[#141c1a] p-6 text-center">
        <div className="max-w-md w-full glass-panel border-[#dc2626]/20">
          <div className="w-16 h-16 bg-[#dc2626]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Workspace Not Found</h1>
          <p className="text-[#747576] text-sm mb-8 leading-relaxed">
            The workspace <strong className="text-white">/{tenantSlug}</strong> does not exist or you don't have access.
          </p>
          <button 
            onClick={() => window.location.href = `/${currentTenant?.slug || ''}/dashboard`} 
            className="w-full bg-[#38e0a0] text-[#141c1a] font-bold py-3 rounded-xl hover:bg-[#2fb883] transition-colors"
          >
            Go to My Workspace
          </button>
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
  const { currentUser, currentTenant, isSyncComplete } = useAppContext();

  if (!isSyncComplete) return <GlobalLoading />;

  if (currentUser) {
    // 1. Global Admin always lands in Nexus HQ
    if (currentUser.roles?.includes('GLOBAL_ADMIN')) {
      return <Navigate to="/nexus-hq" replace />;
    }

    // 2. Tenant Owners/Staff land in their specific dashboard
    if (currentTenant) {
      return <Navigate to={`/${currentTenant.slug}/dashboard`} replace />;
    }

    // 3. Authenticated but No Tenant/Role -> Redirect to login (Login page handles the error state)
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/login" replace />;
};

function AppRoutes() {
  const { isMaintenance, isOwner, loading, hasRole } = useAppContext();
  const location = useLocation();

  if (loading) return <GlobalLoading />;

  // Global Maintenance Block: Allows owners to bypass, otherwise restricts all routes except login.
  if (isMaintenance && !isOwner && location.pathname !== '/login' && !location.pathname.startsWith('/admin')) {
    return <Maintenance />;
  }

  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public route: Login */}
      <Route path="/login" element={
        <GuestRoute>
          <Login />
        </GuestRoute>
      } />
 
      {/* Onboarding: Setup Workspace (Global Admin Only) */}
      <Route path="/setup" element={
        <ProtectedRoute requireGlobalAdmin={true}>
          <TenantSetup />
        </ProtectedRoute>
      } />

      {/* Access Restriction */}
      <Route path="/no-access" element={<NoAccess />} />

      {/* Super-Admin Panel (no tenant prefix, GLOBAL_ADMIN only) */}
      <Route path="/admin" element={
        <ProtectedRoute requireGlobalAdmin>
          <AdminPanel />
        </ProtectedRoute>
      } />

      {/* Hidden Super Admin Control Center: ONLY for GLOBAL_ADMIN */}
      <Route path="/nexus-hq" element={
        <ProtectedRoute requireGlobalAdmin={true}>
          <SuperAdminPortal />
        </ProtectedRoute>
      } />

      {/* Tenant-scoped routes */}
      <Route path="/:tenantSlug" element={
        <TenantResolver>
          <AppLayout />
        </TenantResolver>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="vehicles" element={<ProtectedRoute><Vehicles /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="payroll" element={<ProtectedRoute><Payroll /></ProtectedRoute>} />
        <Route path="daybook" element={<ProtectedRoute><DayBook /></ProtectedRoute>} />
        <Route path="purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
        <Route path="suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="clients/settle/:id" element={<ProtectedRoute><ClientSettlement /></ProtectedRoute>} />
      </Route>

      {/* Catch-all: redirect to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppContainer() {
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
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}

const App = () => {
  return (
    <Router>
      <AppProvider>
        <AppContainer>
          <AppRoutes />
        </AppContainer>
      </AppProvider>
    </Router>
  );
};

export default App;
