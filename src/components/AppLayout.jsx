import React, { useState, useRef} from 'react';
import { NavLink, Outlet, Navigate, useParams} from 'react-router-dom';
import { useAppContext} from '../context/AppContext';
import { LayoutDashboard, Package, LogOut, Truck, BarChart3, Banknote, User, ShoppingCart, ClipboardList, Wallet, Users as UsersIcon, Settings as SettingsIcon, BookOpen, ShoppingBag, Menu, X, ChevronDown, FileText, Sparkles, Shield} from 'lucide-react';
import NotificationStack from './NotificationStack';
import GlobalLoading from './GlobalLoading';

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
 config.bg = 'bg-indigo-50';
 config.border = 'border-indigo-100';
 config.text = 'text-indigo-600';
 config.circle = 'bg-indigo-500';
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
   currentUser, logout, businessProfile, isMaintenance, hasPermission, 
   syncStatus, lastSyncedAt, isOnline, currentTenant, isModuleAllowed, hasRole,
   isImpersonating, stopImpersonating
 } = useAppContext();
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
 src="/logo.png" 
 alt="Ledger Logo" 
 className="h-10 md:h-14 w-auto object-contain mix-blend-multiply animate-in fade-in duration-700"
 />
 {currentTenant && (
   <div className="hidden md:flex items-center gap-2">
     <div className="w-px h-6 bg-black/10"></div>
     <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">{currentTenant.name}</span>
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
 <CloudStatus status={syncStatus} lastSyncedAt={lastSyncedAt} isOnline={isOnline} />

 <div className="relative" ref={dropdownRef}>
 <button 
 onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
 className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white border border-black/5 shadow-sm hover:shadow-md transition-all group"
 >
 <div className="w-8 h-8 rounded-full bg-accent-signature flex items-center justify-center text-ink-primary text-xs font-bold ring-2 ring-black/5">
 {currentUser?.name?.charAt(0).toUpperCase() || <User size={14} />}
 </div>
 <span className="hidden sm:block text-sm font-medium text-ink-primary">{currentUser?.name?.split(' ')[0] || 'Member'}</span>
 </button>

 {isUserMenuOpen && (
 <div className="absolute top-full right-0 mt-3 w-64 bg-surface rounded-[2rem] border border-black/5 shadow-2xl p-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 z-[100]">
 <div className="mb-4 pb-4 border-b border-black/5">
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">WORKSPACE PORTAL</p>
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
 <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain mix-blend-multiply" />
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
     <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{currentTenant.name}</p>
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
 <div className="p-4 border-t border-black/5">
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

const AppLayout = () => {
  const { currentUser, loading, isImpersonating, stopImpersonating, currentTenant } = useAppContext();

  if (loading) {
    return <GlobalLoading />;
  }

  return (
    <div className="min-h-screen bg-canvas font-inter selection:bg-accent-signature/30 flex flex-col relative">
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 sticky top-0 z-[200] shadow-xl">
          <Shield size={14} className="animate-pulse" />
          <span>Operations Bridge: {currentTenant?.name}</span>
          <button 
            onClick={stopImpersonating}
            className="bg-white text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-50 transition-all shadow-sm active:scale-[0.98] font-black border border-amber-600/20"
          >
            Terminal Management
          </button>
        </div>
      )}
      <Navbar />
      <NotificationStack />
      
      <main 
        key={window.location.pathname}
        className="flex-1 max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-12 py-2 md:py-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
