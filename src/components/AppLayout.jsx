import React, { useState, useRef} from 'react';
import { NavLink, Outlet, Navigate, useParams, useLocation} from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import SyncStatusButton from './SyncStatusButton';
import { LayoutDashboard, Package, LogOut, Truck, BarChart3, Banknote, User, ShoppingCart, ClipboardList, Wallet, Users as UsersIcon, Settings as SettingsIcon, BookOpen, ShoppingBag, Menu, X, ChevronDown, FileText, Sparkles, Shield, ScrollText, Upload, Factory} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { getDefaultAvatar } from '../lib/supabase';
import NotificationStack from './NotificationStack';
import GlobalLoading from './GlobalLoading';
import AvatarPicker from './AvatarPicker';
import SyncStatus from './SyncStatus';

const CloudStatus = ({ status, lastSyncedAt, isOnline}) => {
 const config = {
 label: 'Cloud Live',
 bg: 'bg-blue-50',
 border: 'border-blue-100',
 text: 'text-blue-600',
 circle: 'bg-blue-500'
};

 if (!isOnline || status === 'OFFLINE') {
 config.label = 'Offline';
 config.bg = 'bg-gray-100';
 config.border = 'border-gray-200';
 config.text = 'text-gray-500';
 config.circle = 'bg-gray-400';
} else if (status === 'SYNCING') {
 config.label = 'Syncing...';
 config.bg = 'bg-amber-50';
 config.border = 'border-amber-100';
 config.text = 'text-amber-600';
 config.circle = 'bg-amber-500';
} else if (status === 'ERROR') {
 config.label = 'Sync Delayed';
 config.bg = 'bg-amber-50';
 config.border = 'border-amber-100';
 config.text = 'text-amber-600';
 config.circle = 'bg-amber-500';
}

 return (
 <div className="flex items-center gap-4">
 <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500 ${config.bg} ${config.border} shadow-sm group relative`}>
 <div className={`w-1.5 h-1.5 rounded-full ${config.circle} ${status === 'SYNCING' ? 'animate-pulse' : ''}`}></div>
 <span className={`text-[10px] font-bold ${config.text}`}>{config.label}</span>
 
 {/* Tooltip on Hover */}
 <div className="absolute top-full right-0 mt-2 w-48 bg-surface rounded-lg border border-black/5 shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[120]">
 <p className="text-[10px] font-bold text-gray-700 mb-1">Status Report</p>
 <p className="text-xs text-ink-primary mb-2">
 {status === 'SYNCED' ? 'Cloud database is fully synchronized.' : 
 status === 'SYNCING' ? 'Changes are being uploaded to cloud.' :
 status === 'OFFLINE' ? 'No internet connection detected.' : 
 'Synchronization delayed by server.'}
 </p>
 <div className="flex items-center justify-between pt-2 border-t border-black/5">
 <span className="text-[9px] text-gray-700">Last Sync</span>
 <span className="text-[9px] font-bold text-ink-primary">{new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span>
 </div>
 </div>
 </div>
 </div>
 );
};

const Navbar = () => {
  const {
    currentUser, logout, hasPermission, hasRole
  } = useAuth();
  const [showAvatarPicker, setShowAvatarPicker] = React.useState(false);
  const {
    currentTenant, isModuleAllowed, isImpersonating, stopImpersonating,
    isOnline = true, syncStatus = 'SYNCED', lastSyncedAt = new Date().toISOString()
  } = useTenant();
 const { tenantSlug } = useParams();
 const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
 const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);
 const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
 const dropdownRef = React.useRef(null);
 const moreMenuRef = React.useRef(null);

 const roles = currentUser?.roles || (currentUser?.role ? [currentUser?.role] : ['STAFF']);
 const isOwner = roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN');
 const isGlobalAdmin = roles.includes('GLOBAL_ADMIN');
 const basePath = tenantSlug ? `/${tenantSlug}` : '';

 // Nav item builder with plan gating
 const navItem = (label, path, icon, moduleKey, extraHidden = false) => ({
   label,
   path: `${basePath}${path}`,
   icon,
   hidden: extraHidden || !hasPermission(moduleKey || path.replace('/', ''), 'view'),
   locked: moduleKey ? !isModuleAllowed(moduleKey) : false
 });

 const primaryNavItems = [
    navItem('Dashboard', '/dashboard', <LayoutDashboard size={20} />, 'dashboard'),
    navItem('Inventory', '/inventory', <Package size={20} />, 'inventory'),
    navItem('Sales', '/sales', <ShoppingCart size={20} />, 'sales'),
    navItem('Invoices', '/invoices', <FileText size={20} />, 'sales'),
    navItem('Purchases', '/purchases', <ShoppingBag size={20} />, 'purchases'),
    navItem('Expenses', '/expenses', <Wallet size={20} />, 'expenses'),
    navItem('Clients', '/clients', <UsersIcon size={20} />, 'clients'),
 ];

 const moreNavItems = [
   navItem('Pipeline', '/orders', <ClipboardList size={20} />, 'sales'),
   navItem('Manufacturing', '/manufacturing', <Factory size={20} />, 'inventory'),
   navItem('Suppliers', '/suppliers', <Truck size={20} />, 'suppliers'),
   navItem('Payroll', '/payroll', <Banknote size={20} />, 'payroll'),
   navItem('Day Book', '/daybook', <BookOpen size={20} />, 'daybook'),
   navItem('Vehicles', '/vehicles', <Truck size={20} />, 'vehicles'),
   navItem('Reports', '/reports', <BarChart3 size={20} />, 'reports'),
 ];

 const allNavItems = [...primaryNavItems, ...moreNavItems];
 const activeInMore = moreNavItems.some(item => window.location.pathname.startsWith(item.path));

 const adminItems = [
   navItem('Personnel Portal', '/users', <UsersIcon size={18} />, 'users'),
   navItem('Workspace Settings', '/settings', <SettingsIcon size={18} />, 'settings'),
   ...(isOwner ? [{ label: 'Audit Log', path: `${basePath}/audit-log`, icon: <ScrollText size={18} />, hidden: false, locked: false }] : []),
 ];

 React.useEffect(() => {
 const handleClickOutside = (event) => {
 if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
 setIsUserMenuOpen(false);
}
 if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
 setIsMoreMenuOpen(false);
}
};
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);

 const renderNavItem = (item, onClick = null) => {
   if (item.locked) {
     return (
       <div
         key={item.path}
         className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold text-gray-400 cursor-not-allowed relative group"
         title={`Upgrade to access ${item.label}`}
       >
         <span className="opacity-40">{item.icon}</span>
         {item.label}
         <Sparkles size={12} className="text-amber-400 ml-0.5" />
       </div>
     );
   }
   return (
     <NavLink
       key={item.path}
       to={item.path}
       onClick={onClick}
       className={({ isActive}) => `flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
         isActive 
         ? 'bg-ink-primary text-white shadow-md' 
         : 'text-gray-700 hover:text-ink-primary hover:bg-gray-100'
       }`}
     >
       {({ isActive}) => (
         <>
           <span className={isActive ? 'text-white/60' : 'opacity-70'}>{item.icon}</span>
           {item.label}
         </>
       )}
     </NavLink>
   );
 };

 return (
 <>
 <header className="sticky top-0 z-50 bg-canvas/80 backdrop-blur-md border-b border-black/5">
 <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12">
 <div className="flex items-center justify-between h-16 md:h-20">
 {/* Mobile Hamburger */}
 <button 
 onClick={() => setIsMobileMenuOpen(true)} 
 className="md:hidden w-10 h-10 rounded-xl bg-white border border-black/5 flex items-center justify-center text-ink-primary shadow-sm"
 >
 <Menu size={20} />
 </button>

 {/* Branding */}
 <div className="flex items-center gap-4">
 <img
 src={`${import.meta.env.BASE_URL}logo.png`}
 alt="Ledger Logo"
 className="h-10 md:h-14 w-auto object-contain mix-blend-multiply animate-in fade-in duration-700"
 />
 {currentTenant && (
   <div className="hidden md:flex items-center gap-2">
     <div className="w-px h-6 bg-black/10"></div>
     <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide leading-tight">{currentTenant.name}</span>
     <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
       currentTenant.plan === 'ENTERPRISE' ? 'bg-purple-50 text-purple-600' :
       currentTenant.plan === 'PRO' ? 'bg-blue-50 text-blue-600' :
       'bg-gray-100 text-gray-500'
     }`}>{currentTenant.plan}</span>
   </div>
 )}
 </div>

 {/* Pill Navigation — Desktop Only */}
 <div className="hidden md:flex items-center space-x-1 bg-white p-1.5 rounded-full shadow-sm border border-black/5">
 {primaryNavItems.filter(i => !i.hidden).map((item) => renderNavItem(item))}

 {/* More Dropdown */}
 <div className="relative" ref={moreMenuRef}>
 <button
 onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
 className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
 activeInMore 
 ? 'bg-ink-primary text-white shadow-md' 
 : 'text-gray-700 hover:text-ink-primary hover:bg-gray-100'
}`}
 >
 <span className={activeInMore ? 'text-white/60' : 'opacity-70'}><Menu size={18} /></span>
 More
 <ChevronDown size={14} className={`transition-transform duration-200 ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
 </button>

 {isMoreMenuOpen && (
 <div className="absolute top-full right-0 mt-3 w-56 bg-surface rounded-xl border border-black/5 shadow-2xl p-2 animate-in fade-in slide-in-from-top-2 duration-200 z-[110]">
 {moreNavItems.filter(i => !i.hidden).map((item) => {
   if (item.locked) {
     return (
       <div key={item.path} className="flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium text-gray-400 cursor-not-allowed">
         <span className="opacity-40">{item.icon}</span>
         {item.label}
         <Sparkles size={12} className="text-amber-400 ml-auto" />
       </div>
     );
   }
   return (
     <NavLink
       key={item.path}
       to={item.path}
       onClick={() => setIsMoreMenuOpen(false)}
       className={({ isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all ${
         isActive 
         ? 'bg-canvas text-ink-primary font-bold shadow-sm' 
         : 'text-gray-700 hover:bg-canvas/50 hover:text-ink-primary'
       }`}
     >
       <span className="opacity-60">{item.icon}</span>
       {item.label}
     </NavLink>
   );
 })}
 </div>
 )}
 </div>
 </div>

 {/* Right Section: Sync Status & User Profile */}
 <div className="flex items-center gap-3 sm:gap-4">
 <SyncStatusButton />
 <SyncStatus />

 <div className="relative" ref={dropdownRef}>
 <button
   onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
   className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white border border-black/5 shadow-sm hover:shadow-md transition-all group"
 >
   <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-black/5 flex-shrink-0">
     <img
       src={currentUser?.avatar_url || getDefaultAvatar(currentUser?.name || currentUser?.email || 'user')}
       alt={currentUser?.name || 'avatar'}
       className="w-full h-full object-cover"
     />
   </div>
   <span className="hidden sm:block text-sm font-medium text-ink-primary">{currentUser?.name?.split(' ')[0] || 'Member'}</span>
 </button>

 {isUserMenuOpen && (
   <div className="absolute top-full right-0 mt-3 w-64 bg-surface rounded-[2rem] border border-black/5 shadow-2xl p-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 z-[100]">
     {/* User identity card */}
     <div className="flex items-center gap-3 mb-4 pb-4 border-b border-black/5">
       <button
         onClick={() => { setIsUserMenuOpen(false); setShowAvatarPicker(true); }}
         className="relative group flex-shrink-0"
         title="Edit avatar"
       >
         <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-black/5">
           <img
             src={currentUser?.avatar_url || getDefaultAvatar(currentUser?.name || currentUser?.email || 'user')}
             alt={currentUser?.name || 'avatar'}
             className="w-full h-full object-cover"
           />
         </div>
         <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
           <Upload size={12} className="text-white" />
         </div>
       </button>
       <div className="min-w-0">
         <p className="text-sm font-bold text-ink-primary truncate">{currentUser?.name || 'Member'}</p>
         <p className="text-[10px] text-gray-500 truncate">{currentUser?.email}</p>
       </div>
     </div>

     <div className="mb-4 pb-4 border-b border-black/5">
       <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-2 uppercase px-1">Workspace Portal</p>
       <div className="space-y-1">
         {adminItems.filter(i => !i.hidden).map(item => (
           <NavLink
             key={item.path}
             to={item.path}
             onClick={() => setIsUserMenuOpen(false)}
             className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink-primary hover:bg-canvas rounded-xl transition-all"
           >
             {item.label}
           </NavLink>
         ))}
         {isGlobalAdmin && (
           <NavLink
             to="/nexus-hq"
             onClick={() => setIsUserMenuOpen(false)}
             className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
           >
             <Shield size={16} />
             The Nexus Console
           </NavLink>
         )}
       </div>
     </div>
     <button onClick={logout} className="w-full flex items-center gap-3 p-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition-all">
       <LogOut size={16} /> Logout
     </button>
   </div>
 )}

 {/* AvatarPicker modal — rendered here to stay inside dropdownRef scope but outside the dropdown div */}
 {showAvatarPicker && <AvatarPicker onClose={() => setShowAvatarPicker(false)} />}
 </div>
 </div>
 </div>
 </div>
 </header>

 {/* Mobile Navigation Drawer */}
 {isMobileMenuOpen && (
 <div className="fixed inset-0 z-[200] md:hidden">
 {/* Backdrop */}
 <div 
 className="absolute inset-0 bg-black/40 backdrop-blur-sm"
 onClick={() => setIsMobileMenuOpen(false)}
 />
 
 {/* Drawer */}
 <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-surface shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
 {/* Drawer Header */}
 <div className="flex items-center justify-between p-5 border-b border-black/5">
 <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="h-10 w-auto object-contain mix-blend-multiply" />
 <button 
 onClick={() => setIsMobileMenuOpen(false)}
 className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center text-ink-primary"
 >
 <X size={18} />
 </button>
 </div>

 {/* Tenant Badge in Mobile */}
 {currentTenant && (
   <div className="px-5 py-3 border-b border-black/5">
     <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 leading-tight">{currentTenant.name}</p>
     <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
       currentTenant.plan === 'ENTERPRISE' ? 'bg-purple-50 text-purple-600' :
       currentTenant.plan === 'PRO' ? 'bg-blue-50 text-blue-600' :
       'bg-gray-100 text-gray-500'
     }`}>{currentTenant.plan} Plan</span>
   </div>
 )}
 
 {/* Nav Items */}
 <nav className="flex-1 overflow-y-auto py-3 px-3">
 <p className="text-[9px] font-semibold text-gray-700 opacity-[0.85] px-3 mb-2">Navigation</p>
 {allNavItems.filter(i => !i.hidden).map(item => {
   if (item.locked) {
     return (
       <div key={item.path} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-400 cursor-not-allowed mb-0.5">
         <span className="opacity-40">{item.icon}</span>
         {item.label}
         <Sparkles size={12} className="text-amber-400 ml-auto" />
       </div>
     );
   }
   return (
     <NavLink
       key={item.path}
       to={item.path}
       onClick={() => setIsMobileMenuOpen(false)}
       className={({ isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-0.5 ${
         isActive 
         ? 'bg-ink-primary text-white shadow-md' 
         : 'text-gray-700 hover:bg-canvas'
       }`}
     >
       {({ isActive}) => (
         <>
           <span className={isActive ? 'text-accent-signature' : 'opacity-[0.85]'}>{item.icon}</span>
           {item.label}
         </>
       )}
     </NavLink>
   );
 })}
 
 {/* Admin Section */}
 {adminItems.filter(i => !i.hidden).length > 0 && (
 <>
 <div className="my-3 border-t border-black/5" />
 <p className="text-[9px] font-semibold text-gray-700 opacity-[0.85] px-3 mb-2">WORKSPACE PORTAL</p>
 {adminItems.filter(i => !i.hidden).map(item => (
 <NavLink
 key={item.path}
 to={item.path}
 onClick={() => setIsMobileMenuOpen(false)}
 className={({ isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-0.5 ${
 isActive 
 ? 'bg-ink-primary text-white shadow-md' 
 : 'text-gray-700 hover:bg-canvas'
}`}
 >
 {({ isActive}) => (
 <>
 <span className={isActive ? 'text-accent-signature' : 'opacity-[0.85]'}>{item.icon}</span>
 {item.label}
 </>
 )}
 </NavLink>
 ))}
 {isGlobalAdmin && (
   <NavLink
     to="/nexus-hq"
     onClick={() => setIsMobileMenuOpen(false)}
     className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-purple-600 hover:bg-purple-50 transition-all mb-0.5"
   >
     <Shield size={18} />
     The Nexus Console
   </NavLink>
 )}
 </>
 )}
 </nav>
 
 {/* Drawer Footer */}
 <div className="p-4 border-t border-black/5 space-y-2">
   {/* Mobile avatar row */}
   <button
     onClick={() => { setIsMobileMenuOpen(false); setShowAvatarPicker(true); }}
     className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-canvas transition-all"
   >
     <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-black/5 flex-shrink-0">
       <img
         src={currentUser?.avatar_url || getDefaultAvatar(currentUser?.name || currentUser?.email || 'user')}
         alt="avatar"
         className="w-full h-full object-cover"
       />
     </div>
     <div className="flex-1 text-left">
       <p className="text-sm font-bold text-ink-primary truncate">{currentUser?.name || 'Member'}</p>
       <p className="text-[10px] text-gray-500">Edit Avatar</p>
     </div>
   </button>
   <button
     onClick={() => { logout(); setIsMobileMenuOpen(false);}}
     className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all"
   >
     <LogOut size={18} /> Logout
   </button>
 </div>
 </div>
 </div>
 )}
 </>
 );
};

const MainContent = () => {
  const location = useLocation();
  const isSales = location.pathname.endsWith('/sales') || location.pathname.endsWith('/van-sale');
  return (
    <main
      key={location.pathname}
      className={`flex-1 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out ${
        isSales
          ? 'px-4 sm:px-6 lg:px-8 py-2 md:py-4'
          : 'max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 py-2 md:py-6'
      }`}
    >
      <Outlet />
    </main>
  );
};

const AppLayout = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { currentTenant, isImpersonating, stopImpersonating, loading: tenantLoading } = useTenant();
  // Apply saved theme on every page load
  useTheme();

  // Desktop one-time bulk pull-down splash. After the first online sign-in
  // we download every tenant table into IDB so subsequent launches render
  // every tab instantly from cache. Lazy import keeps the web bundle lean.
  const [bulkSyncDismissed, setBulkSyncDismissed] = React.useState(false);
  const [Splash, setSplash] = React.useState(null);
  React.useEffect(() => {
    const isElectron = typeof navigator !== 'undefined' &&
      (/Electron/i.test(navigator.userAgent) || !!window?.electron);
    if (!isElectron || bulkSyncDismissed || !currentTenant?.id) return;
    (async () => {
      const mod = await import('./BulkSyncSplash.jsx');
      setSplash(() => mod.default);
    })();
  }, [currentTenant?.id, bulkSyncDismissed]);

  if (authLoading || tenantLoading) {
    return <GlobalLoading />;
  }

  return (
    <div className="min-h-screen bg-canvas font-inter selection:bg-accent-signature/30 flex flex-col relative">
      {isImpersonating && (
        <div className="group fixed top-0 left-0 right-0 z-[200] h-2.5 print:hidden">
          {/* 10px hover trigger (wrapper height = 10px so nothing below gets blocked) */}
          {/* Always-visible pill, no pointer events */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[9px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-b-md shadow-md opacity-80 group-hover:opacity-0 transition-opacity duration-200 pointer-events-none flex items-center gap-1">
            <Shield size={10} /> Impersonating
          </div>
          {/* Banner absolute — out of flow, slides down on hover */}
          <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-4 shadow-xl -translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out pointer-events-auto">
            <Shield size={14} className="animate-pulse" />
            <span>Viewing as: {currentTenant?.name}</span>
            <button
              onClick={stopImpersonating}
              className="bg-white text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-50 transition-all shadow-sm active:scale-[0.98] font-semibold border border-amber-600/20"
            >
              Exit View
            </button>
          </div>
        </div>
      )}
      <Navbar />
      <NotificationStack />

      <MainContent />

      {Splash && !bulkSyncDismissed && currentTenant?.id && (
        <Splash tenantId={currentTenant.id} onDone={() => setBulkSyncDismissed(true)} />
      )}
    </div>
  );
};

export default AppLayout;
