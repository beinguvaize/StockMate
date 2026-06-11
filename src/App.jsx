import React, { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { goHref } from './lib/nav';

// Electron loads via file:// — BrowserRouter breaks there, use HashRouter.
const Router = (typeof window !== 'undefined' && window.electron?.isElectron)
  ? HashRouter
  : BrowserRouter;
import { useAuth } from './context/AuthContext';
import { useTenant } from './context/TenantContext';
import AppLayout from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalLoading from './components/GlobalLoading';
import DesktopUpdater from './components/DesktopUpdater';
import ReportIssueButton from './components/ReportIssueButton';

// ── Eager (tiny, needed immediately) ────────────────────────────────────────
import Login   from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import NoAccess from './pages/NoAccess';

// ── Lazy (loaded only when route is visited) ─────────────────────────────────
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Inventory        = lazy(() => import('./pages/inventory/index.jsx'));
const Sales            = lazy(() => import('./pages/sales/index.jsx'));
const Expenses         = lazy(() => import('./pages/Expenses'));
const Settings         = lazy(() => import('./pages/Settings'));
const SettingsHub      = lazy(() => import('./pages/settings/SettingsHub'));
const SyncDiagnostics  = lazy(() => import('./pages/SyncDiagnostics'));
const SaaSLogin        = lazy(() => import('./pages/SaaSLogin'));
// Bare-shell print routes consumed by the mobile WebView → printToPdf
// pipeline so phone-printed receipts/invoices match the web pixel-for-
// pixel. No app chrome, no protected wrapper — auth comes from the JWT
// the mobile WebView injects into localStorage before navigation.
const ReceiptEmbed     = lazy(() => import('./pages/embed/ReceiptEmbed'));
const InvoiceEmbed     = lazy(() => import('./pages/embed/InvoiceEmbed'));
// Customer-facing UPI QR for dual-monitor POS. Param-only, no auth.
const PayQrScreen      = lazy(() => import('./pages/embed/PayQrScreen'));
const Vehicles         = lazy(() => import('./pages/Vehicles'));
const Users            = lazy(() => import('./pages/Users'));
const Clients          = lazy(() => import('./pages/Clients'));
const Reports          = lazy(() => import('./pages/Reports'));
const Orders           = lazy(() => import('./pages/Orders'));
const Payroll          = lazy(() => import('./pages/Payroll'));
const DayBook          = lazy(() => import('./pages/DayBook'));
const Purchases        = lazy(() => import('./pages/purchases'));
const Suppliers        = lazy(() => import('./pages/Suppliers'));
const SupplierLedger   = lazy(() => import('./pages/SupplierLedger'));
const Invoices         = lazy(() => import('./pages/Invoices'));
const Estimates        = lazy(() => import('./pages/Estimates'));
const LabelPrinting    = lazy(() => import('./pages/LabelPrinting'));
const BulkAdd          = lazy(() => import('./pages/BulkAdd'));
const ClientSettlement = lazy(() => import('./pages/ClientSettlement'));
const AdminPanel       = lazy(() => import('./pages/AdminPanel'));
const TenantSetup      = lazy(() => import('./pages/TenantSetup'));
const SuperAdminPortal = lazy(() => import('./pages/admin/SuperAdminPortal'));
const DataToolsPage    = lazy(() => import('./pages/DataToolsPage'));
const VanSalePage      = lazy(() => import('./pages/VanSalePage'));
const Manufacturing    = lazy(() => import('./pages/Manufacturing'));
const KDS              = lazy(() => import('./pages/KDS'));
const Appointments     = lazy(() => import('./pages/Appointments'));
const AuditLog         = lazy(() => import('./pages/AuditLog'));
const Onboarding       = lazy(() => import('./pages/Onboarding'));

/**
 * GuestRoute: Redirects authenticated users away from the login page.
 */
const GuestRoute = ({ children }) => {
  const { currentUser } = useAuth();
  const { currentTenant, isSyncComplete } = useTenant();

  if (!isSyncComplete) return <GlobalLoading />;

  if (currentUser) {
    if (currentTenant) return <Navigate to="/dashboard" replace />;
    // Authenticated but no workspace yet → send to setup
    return <Navigate to="/welcome" replace />;
  }

  return children;
};

/**
 * AuthRoute: Must be authenticated (but NOT global admin).
 * Used for /welcome — new users setting up their workspace.
 * If user already has a tenant, skip setup and go to dashboard.
 */
const AuthRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const { currentTenant, isSyncComplete } = useTenant();

  if (loading || !isSyncComplete) return <GlobalLoading />;
  if (!currentUser) return <Navigate to="/login" replace />;
  // Already has workspace → skip setup
  if (currentTenant) return <Navigate to="/dashboard" replace />;
  return children;
};

/**
 * TenantGate: tenant chrome guard — slugless. Tenant comes from the session
 * (TenantContext); URLs no longer carry the workspace name.
 */
const TenantGate = ({ children }) => {
  const { loading, isSyncComplete } = useTenant();
  if (loading || !isSyncComplete) return <GlobalLoading />;
  return children;
};

/**
 * LegacyRedirect: old /:tenantSlug/* links → slugless path. For global
 * admins the slug is still resolved (deep-link impersonation keeps working).
 */
const LegacyRedirect = () => {
  const { tenantSlug, '*': rest } = useParams();
  const { currentTenant, resolveTenantBySlug } = useTenant();
  const { currentUser } = useAuth();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tenantSlug && currentUser?.roles?.includes('GLOBAL_ADMIN') &&
          currentTenant?.slug !== tenantSlug) {
        await resolveTenantBySlug(tenantSlug);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  if (!ready) return <GlobalLoading />;
  return <Navigate to={`/${rest || 'dashboard'}`} replace />;
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
    if (currentTenant) return <Navigate to="/dashboard" replace />;
    // Authenticated, no tenant → new signup → workspace setup
    return <Navigate to="/welcome" replace />;
  }

  // Unauthenticated visitor → app sign-in. Marketing lives on ledgrpro.com
  // (the amber site); the app root no longer renders an in-app landing page.
  return <Navigate to="/login" replace />;
};

function AppRoutes() {
  const { isOwner, hasRole, loading: authLoading } = useAuth();
  const { loading: tenantLoading } = useTenant();
  const location = useLocation();

  if (authLoading || tenantLoading) return <GlobalLoading />;

  return (
    <Suspense fallback={<GlobalLoading />}>
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/embed/receipt/:saleId"    element={<ReceiptEmbed />} />
      <Route path="/embed/invoice/:invoiceId" element={<InvoiceEmbed />} />
      <Route path="/embed/payqr"              element={<PayQrScreen />} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register" element={<GuestRoute><SaaSLogin /></GuestRoute>} />
      {/* /welcome — new user signup flow, auth required but NOT global admin */}
      <Route path="/welcome" element={<AuthRoute><TenantSetup /></AuthRoute>} />
      {/* /setup — legacy admin-only tenant provisioning */}
      <Route path="/setup" element={<ProtectedRoute requireGlobalAdmin={true}><TenantSetup /></ProtectedRoute>} />
      <Route path="/no-access" element={<NoAccess />} />
      <Route path="/admin" element={<ProtectedRoute requireGlobalAdmin><AdminPanel /></ProtectedRoute>} />
      <Route path="/nexus-hq" element={<ProtectedRoute requireGlobalAdmin><SuperAdminPortal /></ProtectedRoute>} />

      <Route element={<TenantGate><AppLayout /></TenantGate>}>
        <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="vehicles" element={<ProtectedRoute><Vehicles /></ProtectedRoute>} />
        <Route path="vehicles/van-sale" element={<ProtectedRoute><VanSalePage /></ProtectedRoute>} />
        <Route path="manufacturing" element={<ProtectedRoute><Manufacturing /></ProtectedRoute>} />
        <Route path="kds" element={<ProtectedRoute><KDS /></ProtectedRoute>} />
        <Route path="appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute><SettingsHub /></ProtectedRoute>} />
        <Route path="settings-classic" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="sync-diagnostics" element={<ProtectedRoute><SyncDiagnostics /></ProtectedRoute>} />
        <Route path="audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
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
        <Route path="estimates" element={<ProtectedRoute><Estimates /></ProtectedRoute>} />
        <Route path="labels" element={<ProtectedRoute><LabelPrinting /></ProtectedRoute>} />
        <Route path="bulk-add" element={<ProtectedRoute><BulkAdd /></ProtectedRoute>} />
        <Route path="clients/settle/:id" element={<ProtectedRoute><ClientSettlement /></ProtectedRoute>} />
        <Route path="data-tools" element={<ProtectedRoute><DataToolsPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      {/* Legacy workspace-slug URLs → slugless equivalents */}
      <Route path="/:tenantSlug/*" element={<LegacyRedirect />} />
    </Routes>
    </Suspense>
  );
}

// Hide the floating chrome (DesktopUpdater toast + ReportIssueButton)
// on bare embed routes. Mobile's WebPrintService rasterises the
// embed page; floating widgets would otherwise show up in the
// captured PDF and the share preview.
const FloatingChrome = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith('/embed/')) return null;
  return (
    <>
      <DesktopUpdater />
      <ReportIssueButton />
    </>
  );
};

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <FloatingChrome />
    </Router>
  );
}

export default App;
