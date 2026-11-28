import React, { useState, useRef, useCallback} from 'react';
import { NavLink, Outlet, Navigate, useNavigate, useParams, useLocation} from 'react-router-dom';
import logoClear from '/logo-clear.png';
import logoWhite from '/logo-white.png';
import markClear from '/mark.png';
import markWhite from '/ledgrpro-mark-white.png';
import { useBilling } from '../hooks/useBilling';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import SyncStatusButton from './SyncStatusButton';
import TrialBanner from './TrialBanner';
import { LayoutDashboard, Package, LogOut, Truck, BarChart3, Banknote, ShoppingCart, Wallet, Users as UsersIcon, Settings as SettingsIcon, BookOpen, ShoppingBag, Menu, X, ChevronDown, FileText, Sparkles, Shield, ScrollText, Upload, Factory, CalendarClock, ScanBarcode, PanelLeft, Plus, Landmark, ChefHat, FilePen, Car, Search } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { getDefaultAvatar } from '../lib/supabase';
import NotificationStack from './NotificationStack';
import GlobalLoading from './GlobalLoading';
import AvatarPicker from './AvatarPicker';
import SyncStatus from './SyncStatus';
import OfflineGraceBanner from './OfflineGraceBanner';
import OfflineLockScreen from './OfflineLockScreen';
import { TopBarSlotProvider, TopBarSlotTarget } from './TopBarSlot';
import { useOfflineGrace } from '../lib/offline/useOfflineGrace';
import { Button } from './ui/button';
import SearchPalette from './shell/SearchPalette';
import NotificationsBell from './shell/NotificationsBell';
import ShopCard from './shell/ShopCard';
import { useDashboardKpis } from '../hooks/useDashboardKpis';
import { shellGates, lowStockBadge } from '../lib/shellGates';
import { isPaletteShortcut, shortcutLabel } from '../lib/globalSearch';

// Lazy: the panel, its Hindi font and its strings load only when it is opened.
const AskPanel = React.lazy(() => import('./ask/AskPanel'));

// Brand logo — dark wordmark on light themes, white logo on the dark theme.
const isDarkTheme = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
const brandLogo = () => isDarkTheme() ? logoWhite : logoClear;
// The square mark, for the 68px rail. The wordmark does not survive being
// scaled to fit there -- it becomes a smear the width of a favicon.
const brandMark = () => isDarkTheme() ? markWhite : markClear;

// ── Rail width ───────────────────────────────────────────────────────────
// The rail is rendered by Navbar and the page is inset by AppLayout, so both
// need the same answer. A tiny subscribed store rather than a context: this
// is one boolean, and a provider for it would be more machinery than the
// thing it carries.
//
// Below RAIL_AUTO_COLLAPSE_BELOW the rail collapses on its own. 1280 is where
// 248px of navigation stops being a reasonable share of the window: a laptop
// at 1280 still has a readable invoice table beside it, one at 1152 does not.
const RAIL_AUTO_COLLAPSE_BELOW = 1280;

// Open width of the side menu (web redesign: 236px, as the mockup). The
// collapsed rail stays 68px.
const RAIL_WIDE = 236;

// ── Side menu groups ─────────────────────────────────────────────────────
// The redesign groups the menu as the phone drawer does. The items, their
// paths, permission keys and module toggles are exactly the ones the menu
// had before; only their order and headings changed. `key` is for lookups
// (the "New sale" button reads the Sales item's gates); `admin` marks the
// two items the phone header's account menu also lists.
const buildNavGroups = ({ navItem, t, isOwner, basePath, ICON }) => {
  const k = (key, item, extra = {}) => ({ ...item, key, ...extra });
  return [
    { key: 'main', label: null, items: [
      k('dashboard', navItem('Dashboard', '/dashboard', <LayoutDashboard size={ICON} />, 'dashboard')),
      k('sales', navItem('Sales', '/sales', <ShoppingCart size={ICON} />, 'sales')),
      k('invoices', navItem('Invoices', '/invoices', <FileText size={ICON} />, 'sales')),
      k('inventory', navItem(t('inventory'), '/inventory', <Package size={ICON} />, 'inventory', 'inventory')),
      k('purchases', navItem('Purchases', '/purchases', <ShoppingBag size={ICON} />, 'purchases')),
    ] },
    { key: 'money', label: 'Money', items: [
      k('expenses', navItem('Expenses', '/expenses', <Wallet size={ICON} />, 'expenses')),
      k('daybook', navItem('Day Book', '/daybook', <BookOpen size={ICON} />, 'daybook')),
      k('accounts', navItem('Cash & Bank', '/accounts', <Landmark size={ICON} />, 'daybook')),
    ] },
    { key: 'people', label: 'People', items: [
      k('clients', navItem('Clients', '/clients', <UsersIcon size={ICON} />, 'clients')),
      k('suppliers', navItem('Suppliers', '/suppliers', <Truck size={ICON} />, 'suppliers')),
      k('payroll', navItem('Payroll', '/payroll', <Banknote size={ICON} />, 'payroll', 'payroll')),
    ] },
    { key: 'more', label: 'More', items: [
      k('estimates', navItem('Estimates', '/estimates', <FilePen size={ICON} />, 'sales')),
      k('manufacturing', navItem('Manufacturing', '/manufacturing', <Factory size={ICON} />, 'inventory', 'manufacturing')),
      k('kds', navItem('Kitchen', '/kds', <ChefHat size={ICON} />, 'sales', 'kot')),
      k('appointments', navItem('Appointments', '/appointments', <CalendarClock size={ICON} />, 'sales', 'appointments')),
      k('vehicles', navItem('Vehicles', '/vehicles', <Car size={ICON} />, 'vehicles', 'vehicles')),
      k('reports', navItem('Reports', '/reports', <BarChart3 size={ICON} />, 'reports')),
      k('labels', navItem('Labels', '/labels', <ScanBarcode size={ICON} />, 'inventory')),
      // Users management lives inside Settings -> Users & roles (single home)
      k('settings', navItem('Settings', '/settings', <SettingsIcon size={ICON} />, 'settings'), { admin: true }),
      ...(isOwner ? [{ key: 'audit-log', admin: true, label: 'Audit Log', path: `${basePath}/audit-log`, icon: <ScrollText size={ICON} />, hidden: false, locked: false }] : []),
    ] },
  ];
};

// Page titles for the top bar: the menu's own label for a menu page, these
// for the screens reached from inside one. Title Case, plain words.
const EXTRA_TITLES = [
  ['/vehicles/van-sale', 'Van Sale'],
  ['/suppliers/ledger', 'Supplier Ledger'],
  ['/clients/settle', 'Settle Account'],
  ['/clients/collect', 'Cash Collection'],
  ['/onboarding', 'Getting Started'],
  ['/sync-diagnostics', 'Sync Diagnostics'],
  ['/users', 'Users'],
  ['/orders', 'Orders'],
  ['/bulk-add', 'Bulk Add'],
  ['/data-tools', 'Data Tools'],
  ['/backup', 'Backup'],
];

// Bump when the meaning of a stored choice changes; the old answer is dropped
// once and the width decides again until the user re-chooses.
//
// 2 is the release that added auto-collapse. Every answer stored before it was
// made against a rail that had no automatic behaviour to opt out of, so it is
// not a choice ABOUT this -- it is just where that person happened to leave a
// button. Honouring those would have shipped the feature to nobody: everyone
// already using the app has pressed that toggle at least once.
const RAIL_CHOICE_EPOCH = '2';

const railListeners = new Set();

// null until the user presses the toggle. A stored answer outranks the width
// forever after: someone who collapsed the rail on a wide screen meant it, and
// someone who opened it on a narrow one should not have it shut again by the
// next resize. Read once -- re-reading storage on every resize event would be
// synchronous I/O in a handler that fires continuously while a window drags.
let railUserChoice = (() => {
  try {
    if (localStorage.getItem('nav_rail_epoch') !== RAIL_CHOICE_EPOCH) {
      localStorage.removeItem('nav_rail_collapsed');
      localStorage.setItem('nav_rail_epoch', RAIL_CHOICE_EPOCH);
      return null;
    }
    const v = localStorage.getItem('nav_rail_collapsed');
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }   // private window: no preference, follow the width
})();

const narrowViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < RAIL_AUTO_COLLAPSE_BELOW;

let railIsCollapsed = railUserChoice ?? narrowViewport();

const setRail = (next) => {
  if (next === railIsCollapsed) return;
  railIsCollapsed = next;
  railListeners.forEach(fn => fn(railIsCollapsed));
};

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (railUserChoice !== null) return;   // the user has decided; stop following
    setRail(narrowViewport());
  });
}

export const useRail = () => {
  const [railCollapsed, setLocal] = React.useState(railIsCollapsed);
  React.useEffect(() => {
    const fn = (v) => setLocal(v);
    railListeners.add(fn);
    return () => { railListeners.delete(fn); };
  }, []);
  const toggleRail = React.useCallback(() => {
    // Pressing the toggle is the user deciding, so the width stops being
    // consulted from here on -- in this tab immediately, and in the next one
    // via storage.
    railUserChoice = !railIsCollapsed;
    // Wrapped: storage throws in a private window, and a rail that cannot be
    // collapsed there would be worse than one that forgets.
    try { localStorage.setItem('nav_rail_collapsed', railUserChoice ? '1' : '0'); } catch { /* private window */ }
    setRail(railUserChoice);
  }, []);
  return { railCollapsed, toggleRail };
};

// ── The menu's items and gates, shared ──────────────────────────────────
// The side menu, the top bar (search, bell, "Collect payment") and the
// search palette all need the same items with the same gates, so they are
// built in one place. Three independent gates per item:
//   hidden  = role/permission (existing) OR vertical module off (Stage A)
//   locked  = plan tier doesn't include it (existing)
// `verticalKey` ties the item to a tenant.modules toggle; null = spine, always on.
const useNavModel = () => {
  const { currentUser, hasPermission } = useAuth();
  const { isModuleAllowed, isModuleOn, t } = useTenant();
  const { tenantSlug } = useParams();
  const roles = currentUser?.roles || (currentUser?.role ? [currentUser?.role] : ['STAFF']);
  const isOwner = roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN');
  const basePath = tenantSlug ? `/${tenantSlug}` : '';
  const navItem = (label, path, icon, moduleKey, verticalKey = null, extraHidden = false) => ({
    label,
    path: `${basePath}${path}`,
    icon,
    hidden: extraHidden
      || !hasPermission(moduleKey || path.replace('/', ''), 'view')
      || (verticalKey ? !isModuleOn(verticalKey) : false),
    locked: moduleKey ? !isModuleAllowed(moduleKey) : false
  });
  const navGroups = buildNavGroups({ navItem, t, isOwner, basePath, ICON: 18 });
  const allNavItems = navGroups.flatMap(g => g.items);
  const gates = shellGates(allNavItems, hasPermission);
  return { navGroups, allNavItems, basePath, isOwner, roles, gates };
};

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
 config.bg = 'bg-muted';
 config.border = 'border-border';
 config.text = 'text-muted-foreground';
 config.circle = 'bg-gray-400';
} else if (status === 'SYNCING') {
 config.label = 'Syncing...';
 config.bg = 'bg-accent-signature/10';
 config.border = 'border-accent-signature/15';
 config.text = 'text-accent-signature';
 config.circle = 'bg-accent-signature';
} else if (status === 'ERROR') {
 config.label = 'Sync Delayed';
 config.bg = 'bg-accent-signature/10';
 config.border = 'border-accent-signature/15';
 config.text = 'text-accent-signature';
 config.circle = 'bg-accent-signature';
}

 return (
 <div className="flex items-center gap-4">
 <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500 ${config.bg} ${config.border} shadow-sm group relative`}>
 <div className={`w-1.5 h-1.5 rounded-full ${config.circle} ${status === 'SYNCING' ? 'animate-pulse' : ''}`}></div>
 <span className={`text-[10px] font-bold ${config.text}`}>{config.label}</span>
 
 {/* Tooltip on Hover */}
 <div className="absolute top-full right-0 mt-2 w-48 bg-surface rounded-lg border border-black/5 shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[120]">
 <p className="text-[10px] font-bold text-ink-secondary mb-1">Status Report</p>
 <p className="text-xs text-ink-primary mb-2">
 {status === 'SYNCED' ? 'Cloud database is fully synchronized.' : 
 status === 'SYNCING' ? 'Changes are being uploaded to cloud.' :
 status === 'OFFLINE' ? 'No internet connection detected.' : 
 'Synchronization delayed by server.'}
 </p>
 <div className="flex items-center justify-between pt-2 border-t border-black/5">
 <span className="text-[9px] text-ink-secondary">Last Sync</span>
 <span className="text-[9px] font-bold text-ink-primary">{new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span>
 </div>
 </div>
 </div>
 </div>
 );
};

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const [showAvatarPicker, setShowAvatarPicker] = React.useState(false);
  const { currentTenant, currentTenantId } = useTenant();
 const navigate = useNavigate();
 const { navGroups, allNavItems, basePath, isOwner, roles, gates } = useNavModel();
 const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
 const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);
 // Remembered per browser: a shop on a small laptop collapses once, not
 // every morning. Wrapped because storage throws in private windows.
 const { railCollapsed, toggleRail } = useRail();
 const [isRailUserOpen, setIsRailUserOpen] = React.useState(false);
 const railUserRef = useRef(null);
 React.useEffect(() => {
   if (!isRailUserOpen) return;
   const onDown = (e) => { if (!railUserRef.current?.contains(e.target)) setIsRailUserOpen(false); };
   const onEsc  = (e) => { if (e.key === 'Escape') setIsRailUserOpen(false); };
   document.addEventListener('mousedown', onDown);
   document.addEventListener('keydown', onEsc);
   return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
 }, [isRailUserOpen]);

 // Hovering a collapsed rail peeks it open. The rail is `fixed` and the page's
 // inset is driven by the STORED width, not this one, so a peek overlays the
 // page instead of reflowing it -- no table re-wraps because a pointer crossed
 // 68px. Focus opens it too, or the labels would be unreachable by keyboard.
 const [peek, setPeek] = React.useState(false);
 const narrow = railCollapsed && !peek;
 const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
 const [askOpen, setAskOpen] = React.useState(false);
 const dropdownRef = React.useRef(null);
 const moreMenuRef = React.useRef(null);

 // Rollout flag per tenant (settings.ai_chat_available), set by the team, off by
 // default: merged code shows owners nothing until a shop is switched on.
 const canAsk = isOwner && currentTenant?.settings?.ai_chat_available === true;
 React.useEffect(() => {
   const open = () => { if (canAsk) setAskOpen(true); };
   window.addEventListener('ask:open', open);
   return () => window.removeEventListener('ask:open', open);
 }, [canAsk]);
 const isGlobalAdmin = roles.includes('GLOBAL_ADMIN');

 // Every item, gate and module toggle is exactly what it was (useNavModel);
 // only the grouping is the redesign's (Money / People / More, as the phone drawer).
 const adminItems = navGroups.find(g => g.key === 'more').items.filter(i => i.admin);
 // "New sale" opens Sales (it lands on the new-sale screen) and is shown only
 // to someone the Sales item itself is shown to.
 const salesItem = allNavItems.find(i => i.key === 'sales');
 const canSell = !!salesItem && !salesItem.hidden && !salesItem.locked;

 // The count beside Inventory: the Dashboard's own low-stock figure, from the
 // same shared read (useDashboardKpis), so the two always agree. Hidden while
 // unknown and when 0; read only for someone who may see the Dashboard.
 const { data: kpis } = useDashboardKpis(currentTenantId, { enabled: gates.lowStock });
 const lowStock = gates.lowStock ? lowStockBadge(kpis) : null;

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

 // ── Side menu row ────────────────────────────────────────────────────────
 // Web redesign: Inter Tight rows on the grey frame; the open page is a white
 // row with a hairline shadow and an amber icon. Every gate is unchanged:
 // `hidden` has already removed role- and vertical-blocked items upstream,
 // and `locked` still renders an inert row with the upgrade spark rather than
 // a link, so a plan-gated screen cannot be reached by clicking.
 //
 // `collapsed` drops the label and centres the glyph; the title attribute
 // becomes the only name the item has, so it is set in both states.
 // Ask opens a panel over the page rather than a route, so the dashboard stays
 // visible behind it. Owners only: the server refuses anyone else anyway.
 const askEntry = (collapsed) => canAsk && (
   <button type="button" onClick={() => setAskOpen(true)} title="Ask AI" data-testid="ask-entry"
     className={`m-press group flex items-center ${collapsed ? 'justify-center w-10 h-10' : 'w-full gap-2.5 px-2.5 py-2'} rounded-pill font-tight text-[14px] text-ink-2 font-medium hover:bg-white/60 hover:text-ink`}>
     <span className="shrink-0 text-mute group-hover:text-ink-2"><Sparkles size={18} /></span>
     {!collapsed && <span className="truncate">Ask AI</span>}
   </button>
 );

 const renderSideItem = (item, { collapsed = false, onClick = null } = {}) => {
   const count = item.key === 'inventory' && !item.locked ? lowStock : null;
   const countLabel = count ? `${count} low on stock` : '';
   const body = (isActive) => (
     <>
       <span className={`relative shrink-0 ${isActive ? 'text-amber' : 'text-mute'}`}>
         {item.icon}
         {collapsed && count && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber ring-2 ring-canvas" aria-hidden="true" />}
       </span>
       {!collapsed && <span className="truncate">{item.label}</span>}
       {!collapsed && item.locked && <Sparkles size={12} className="text-amber-text ml-auto shrink-0" />}
       {!collapsed && count && (
         <span className="ml-auto shrink-0 rounded-pill bg-amber-soft px-[7px] py-px font-tight text-[11px] font-semibold tabular-nums text-amber-text" aria-hidden="true">{count}</span>
       )}
       {count && <span className="sr-only">, {countLabel}</span>}
     </>
   );
   const shape = collapsed ? 'justify-center w-10 h-10' : 'gap-2.5 px-2.5 py-2';

   if (item.locked) {
     return (
       <div
         key={item.path}
         title={`Upgrade to access ${item.label}`}
         className={`group flex items-center ${shape} rounded-[10px] font-tight text-[14px] font-medium text-mute cursor-not-allowed`}
       >
         {body(false)}
       </div>
     );
   }

   return (
     <NavLink
       key={item.path}
       to={item.path}
       onClick={onClick}
       title={count ? `${item.label}, ${countLabel}` : item.label}
       className={({ isActive }) => `m-press group flex items-center ${shape} rounded-[10px] font-tight text-[14px] ${
         isActive
           ? 'bg-surface text-ink font-semibold shadow-[0_1px_2px_rgba(17,20,24,0.08)]'
           : 'text-ink-2 font-medium hover:bg-white/60 hover:text-ink'
       }`}
     >
       {({ isActive }) => body(isActive)}
     </NavLink>
   );
 };

 // The groups that have anything left to show after the gates.
 const visibleGroups = navGroups
   .map(g => ({ ...g, items: g.items.filter(i => !i.hidden) }))
   .filter(g => g.items.length > 0);

 const renderGroups = (collapsed, onItemClick = null) => visibleGroups.map((g, gi) => (
   <React.Fragment key={g.key}>
     {g.label && (collapsed
       ? <span className="w-6 h-px bg-black/10 my-2 shrink-0" aria-hidden="true" />
       : <div className={`px-2.5 pb-1.5 ${gi === 0 ? 'pt-1' : 'pt-3.5'} font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute`}>{g.label}</div>)}
     {g.items.map(item => renderSideItem(item, { collapsed, onClick: onItemClick }))}
     {g.key === 'more' && askEntry(collapsed)}
   </React.Fragment>
 ));

 const avatarSrc = currentUser?.avatar_url || getDefaultAvatar(currentUser?.name || currentUser?.email || 'user');
 const roleLabel = (r => r ? r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ') : '')(roles[0]);
 const shopInitials = (currentTenant?.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
 const planLabel = currentTenant?.plan ? `${currentTenant.plan.charAt(0)}${currentTenant.plan.slice(1).toLowerCase()} plan` : '';

 return (
 <>
 {/* ── Side menu ─────────────────────────────────────────────────────────
     Desktop only; the phone keeps the drawer below. Sits on the grey frame;
     the page is the white panel beside it (AppLayout). */}
 <aside
   onMouseEnter={() => railCollapsed && setPeek(true)}
   onMouseLeave={() => setPeek(false)}
   onFocus={() => railCollapsed && setPeek(true)}
   onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPeek(false); }}
   className={`hidden md:flex fixed inset-y-0 left-0 z-50 flex-col bg-canvas transition-[width] duration-200 ease-out motion-reduce:transition-none ${railCollapsed && peek ? 'shadow-2xl' : ''}`}
   style={{ width: narrow ? 68 : RAIL_WIDE }}
 >
   <div className={`flex items-center shrink-0 pt-[18px] pb-3.5 ${narrow ? 'justify-center px-0' : 'px-5'}`}>
     {narrow
       ? <img src={brandMark()} alt="bookledger" className="w-9 h-9 object-contain" />
       : <img src={brandLogo()} alt="bookledger" className="object-contain h-[26px] w-auto max-w-[140px]" />}
   </div>

   {/* The shop this workspace is. Opens a menu only when there is something
       to switch: the store new sales are rung at, for a shop with more than
       one. A user belongs to one shop, so there is no shop to switch to. */}
   {currentTenant && !narrow && (
     <div className="px-3 pb-2.5 shrink-0">
       <ShopCard tenant={currentTenant} tenantId={currentTenantId} initials={shopInitials} canSell={canSell}
         roleLabel={roleLabel} subtitle={[planLabel, roleLabel].filter(Boolean).join(' · ')} />
     </div>
   )}

   <nav aria-label="Main" data-rail
        style={{ maskImage: 'linear-gradient(to bottom, #000 calc(100% - 16px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 16px), transparent)' }}
        className={`flex-1 overflow-y-auto custom-scrollbar pb-3 flex flex-col gap-0.5 ${narrow ? 'items-center px-3' : 'px-3'}`}>
     {renderGroups(narrow)}
   </nav>

   <div className={`shrink-0 pt-2.5 pb-3.5 ${narrow ? 'px-3 flex flex-col items-center gap-2' : 'px-3'}`} ref={railUserRef}>
     {canSell && (narrow
       ? (
         <button type="button" onClick={() => navigate(`${basePath}/sales`)} title="New sale" aria-label="New sale"
           className="m-press grid place-items-center w-10 h-10 rounded-xl bg-amber text-white hover:bg-amber-hover">
           <Plus size={18} />
         </button>
       ) : (
         <button type="button" onClick={() => navigate(`${basePath}/sales`)} data-testid="new-sale"
           className="m-press w-full px-4 py-3 rounded-pill bg-amber text-white font-tight text-[13.5px] font-semibold hover:bg-amber-hover">
           New sale
         </button>
       ))}

     <div className={narrow ? 'flex flex-col items-center gap-1' : 'mt-2.5 flex items-center gap-1'}>
       <button
         type="button"
         onClick={() => setIsRailUserOpen(o => !o)}
         aria-haspopup="menu"
         aria-expanded={isRailUserOpen}
         title={currentUser?.name || 'Account'}
         className={`m-press flex items-center rounded-pill hover:bg-white/60 ${narrow ? 'justify-center p-1' : 'flex-1 min-w-0 gap-2.5 p-1.5'}`}
       >
         <span className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-black/5 shrink-0">
           <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
         </span>
         {!narrow && (
           <span className="min-w-0 flex-1 text-left">
             <span className="block font-tight text-[13px] font-semibold text-ink truncate">{currentUser?.name || 'Member'}</span>
             <span className="block text-[11px] text-mute truncate">{currentUser?.email}</span>
           </span>
         )}
         {!narrow && <ChevronDown size={14} className={`shrink-0 text-mute transition-transform ${isRailUserOpen ? 'rotate-180' : ''}`} />}
       </button>
       <button
         type="button"
         onClick={toggleRail}
         aria-label={railCollapsed ? 'Expand menu' : 'Collapse menu'}
         title={railCollapsed ? 'Expand menu' : 'Collapse menu'}
         className="m-press grid place-items-center w-9 h-9 shrink-0 rounded-xl text-mute hover:bg-white/60 hover:text-ink-2"
       >
         <PanelLeft size={18} />
       </button>
     </div>

     {isRailUserOpen && (
       /* Opens upward: the button sits at the bottom of the window, so a
          menu dropping down would open off-screen. */
       <div className="menu-pop absolute bottom-3 left-full ml-2 w-60 bg-surface rounded-2xl border border-line shadow-2xl p-3 z-[100]" style={{ '--menu-origin': 'bottom left' }}>
         <button
           onClick={() => { setIsRailUserOpen(false); setShowAvatarPicker(true); }}
           className="w-full flex items-center gap-3 p-2 rounded-pill hover:bg-tile transition-colors text-left"
         >
           <span className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-black/5 shrink-0 group">
             <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
             <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
               <Upload size={12} className="text-white" />
             </span>
           </span>
           <span className="min-w-0">
             <span className="block font-tight text-[13px] font-semibold text-ink truncate">{currentUser?.name || 'Member'}</span>
             <span className="block text-[11.5px] text-mute truncate">Change photo</span>
           </span>
         </button>

         {isGlobalAdmin && (
           <NavLink
             to="/nexus-hq"
             onClick={() => setIsRailUserOpen(false)}
             className="mt-2 w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-purple-600 hover:bg-purple-50 rounded-pill transition-colors"
           >
             <Shield size={15} /> The Nexus Console
           </NavLink>
         )}

         <button
           onClick={logout}
           className="mt-1 w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-pill transition-colors"
         >
           <LogOut size={15} /> Log out
         </button>
       </div>
     )}
   </div>
 </aside>

 {/* Phone only. The desktop header carried a hamburger the rail replaces,
     a logo the rail already shows, and one avatar -- 64px of chrome on every
     screen for nothing the rail could not hold. */}
 <header className="md:hidden sticky top-0 z-40 bg-surface border-b border-sep">
 <div className="px-4 sm:px-6 lg:px-8">
 <div className="flex items-center justify-between h-16 gap-3 min-w-0">
 {/* Mobile Hamburger */}
 <button 
 onClick={() => setIsMobileMenuOpen(true)} 
 className="md:hidden w-10 h-10 rounded-xl bg-white border border-black/5 flex items-center justify-center text-ink-primary shadow-sm"
 >
 <Menu size={20} />
 </button>

 {/* Branding — min-w-0 so a long tenant name truncates instead of widening
      the header past the window. */}
 <div className="flex items-center gap-4 min-w-0">
 {/* On desktop the mark lives at the top of the rail; repeating it here
     would be the same logo twice on one screen. */}
 <div className="flex items-center animate-in fade-in duration-700 md:hidden">
   <img src={brandLogo()} alt="bookledger" className="h-8 w-auto max-w-[150px] object-contain shrink-0 block" />
 </div>
 {/* The tenant name and plan live in the rail on desktop. Kept here for
     the phone, which has no rail -- on md+ this would sit behind it, and
     did, until the rail collapsed and it reappeared half-covered. */}
 {currentTenant && (
   <div className="flex md:hidden items-center gap-2 min-w-0">
     <div className="w-px h-6 bg-black/10"></div>
     <span className="text-[11px] font-bold text-ink-secondary uppercase tracking-wide leading-tight truncate">{currentTenant.name}</span>
   </div>
 )}
 </div>

  {/* Right Section: Sync Status & User Profile */}
 <div className="flex items-center gap-3 sm:gap-4">
 <SyncStatusButton />
 <SyncStatus />

 <div className="relative" ref={dropdownRef}>
 <button
   onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
   className="flex items-center gap-3 px-3 py-1.5 rounded-pill bg-white border border-black/5 shadow-sm hover:shadow-md transition-all group"
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
         <p className="text-[10px] text-muted-foreground truncate">{currentUser?.email}</p>
       </div>
     </div>

     <div className="mb-4 pb-4 border-b border-black/5">
       <p className="text-[10px] font-semibold text-ink-secondary opacity-80 mb-2 uppercase px-1">Workspace Portal</p>
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
     <button onClick={logout} className="w-full flex items-center gap-3 p-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-pill transition-all">
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
 {askOpen && (
   <React.Suspense fallback={null}>
     <AskPanel onClose={() => setAskOpen(false)} />
   </React.Suspense>
 )}
 {isMobileMenuOpen && (
 <div className="fixed inset-0 z-[200] md:hidden">
 {/* Backdrop */}
 <div 
 className="absolute inset-0 bg-black/40 backdrop-blur-sm"
 onClick={() => setIsMobileMenuOpen(false)}
 />
 
 {/* Drawer */}
 <div className="m-panel-left absolute left-0 top-0 bottom-0 w-[280px] bg-canvas shadow-2xl flex flex-col">
 {/* Drawer Header */}
 <div className="flex items-center justify-between px-5 pt-5 pb-3">
 <div className="flex items-center">
   <img src={brandLogo()} alt="bookledger" className="h-[26px] w-auto max-w-[140px] object-contain shrink-0 block" />
 </div>
 <button
 onClick={() => setIsMobileMenuOpen(false)}
 aria-label="Close menu"
 className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-ink"
 >
 <X size={18} />
 </button>
 </div>

 {/* The shop, as on the desktop side menu */}
 {currentTenant && (
   <div className="px-3 pb-2.5">
     <ShopCard tenant={currentTenant} tenantId={currentTenantId} initials={shopInitials} canSell={canSell}
       roleLabel={roleLabel} subtitle={[planLabel, roleLabel].filter(Boolean).join(' · ')} />
   </div>
 )}

 {/* Nav Items: the same groups and gates as the desktop side menu */}
 <nav data-rail className="flex-1 overflow-y-auto py-1 px-3 flex flex-col gap-0.5">
 {renderGroups(false, () => setIsMobileMenuOpen(false))}
 {isGlobalAdmin && (
   <NavLink
     to="/nexus-hq"
     onClick={() => setIsMobileMenuOpen(false)}
     className="mt-2 flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] font-tight text-[14px] font-medium text-purple-600 hover:bg-purple-50"
   >
     <Shield size={18} />
     The Nexus Console
   </NavLink>
 )}
 </nav>

 {canSell && (
   <div className="px-3 pt-2">
     <button type="button" onClick={() => { setIsMobileMenuOpen(false); navigate(`${basePath}/sales`); }}
       className="m-press w-full px-4 py-3 rounded-pill bg-amber text-white font-tight text-[13.5px] font-semibold hover:bg-amber-hover">
       New sale
     </button>
   </div>
 )}
 
 {/* Drawer Footer */}
 <div className="p-3 space-y-1">
   {/* Mobile avatar row */}
   <button
     onClick={() => { setIsMobileMenuOpen(false); setShowAvatarPicker(true); }}
     className="w-full flex items-center gap-3 px-3 py-2.5 rounded-pill hover:bg-white/60 transition-colors"
   >
     <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-black/5 flex-shrink-0">
       <img
         src={currentUser?.avatar_url || getDefaultAvatar(currentUser?.name || currentUser?.email || 'user')}
         alt="avatar"
         className="w-full h-full object-cover"
       />
     </div>
     <div className="flex-1 text-left">
       <p className="font-tight text-[13px] font-semibold text-ink truncate">{currentUser?.name || 'Member'}</p>
       <p className="text-[11px] text-mute">Change photo</p>
     </div>
   </button>
   <button
     onClick={() => { logout(); setIsMobileMenuOpen(false);}}
     className="w-full flex items-center gap-3 px-3 py-2.5 font-tight text-[13.5px] font-semibold text-red-600 hover:bg-red-50 rounded-pill transition-colors"
   >
     <LogOut size={18} /> Log out
   </button>
 </div>
 </div>
 </div>
 )}
 </>
 );
};

// Slim 40px bar shown in Electron when POS (Sales) is full-screen.
const KioskBar = ({ onExit }) => (
  <header className="sticky top-0 z-50 h-10 flex items-center justify-between px-4 bg-canvas/90 backdrop-blur-md border-b border-black/5 shrink-0">
    <img src={brandLogo()} alt="StockMate" className="h-5 w-auto object-contain" />
    {/* A page's own figures (TopBarSlot), as in the desktop top bar. */}
    <TopBarSlotTarget className="flex items-center min-w-0" />
    <div className="flex items-center gap-3">
      <SyncStatusButton />
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold bg-ink-primary text-white hover:opacity-80 transition-opacity"
      >
        ← Exit POS
      </button>
    </div>
  </header>
);

// ── Top bar (desktop) ────────────────────────────────────────────────────
// As the approved mockup: page title, the centred search box (Ctrl K), the
// page's own slot (TopBarSlot: Sales puts today's figures there), sync state,
// the bell, and the dark "Collect payment" pill.
//
// Room: the search box is a pill from lg (xl on Sales, whose slot carries
// figures) and a round button below that. "Collect payment" shows from lg,
// and on Sales only from 2xl, where the figures and it both fit; it is not
// drawn on the collection page itself.
const TITLE_PATHS = (t) => [
  ...buildNavGroups({ navItem: (label, path) => ({ label, path }), t, isOwner: true, basePath: '', ICON: 18 })
    .flatMap(g => g.items).map(i => [i.path, i.label]),
  ...EXTRA_TITLES,
].sort((a, b) => b[0].length - a[0].length);

export const pageTitleFor = (pathname, t = (k) => k) => {
  const hit = TITLE_PATHS(t).find(([p]) => pathname === p || pathname.endsWith(p) || pathname.includes(`${p}/`));
  return hit ? hit[1] : '';
};

/**
 * The Dashboard's quick actions: Record expense, Add purchase, Collect
 * payment, all grey (secondary) as the approved mockup draws them. Each shows
 * only when its page is open to this user and they may add there. Drawn in
 * the top bar from lg, and by the Dashboard itself above its figures below
 * that, where the top bar has no room.
 */
export const DashboardQuickActions = ({ className = '' }) => {
  const navigate = useNavigate();
  const { basePath, gates } = useNavModel();
  const quick = [
    gates.quick?.expense && { key: 'expense', label: 'Record expense', to: '/expenses?new=1' },
    gates.quick?.purchase && { key: 'purchase', label: 'Add purchase', to: '/purchases?new=1' },
    gates.collect && { key: 'collect', label: 'Collect payment', to: '/clients/collect' },
  ].filter(Boolean);
  if (!quick.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-testid="dashboard-quick-actions">
      {quick.map(q => (
        <Button key={q.key} variant="secondary" size="sm" onClick={() => navigate(`${basePath}${q.to}`)}
          data-testid={`quick-${q.key}`}>
          {q.label}
        </Button>
      ))}
    </div>
  );
};

const TopBar = ({ onOpenSearch }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, currentTenantId } = useTenant();
  const { basePath, gates } = useNavModel();
  const title = pageTitleFor(location.pathname, t);
  const isSales = location.pathname.endsWith('/sales');
  const onCollect = location.pathname.endsWith('/clients/collect');
  // The Dashboard carries three quick actions in place of the dark pill.
  const isDashboard = location.pathname.endsWith('/dashboard');
  const hint = shortcutLabel();
  return (
    <header className="hidden md:flex items-center gap-3 px-7 py-4 border-b border-sep min-h-[68px]">
      <h1 className="min-w-0 shrink truncate font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink lg:min-w-[150px]">{title}</h1>
      <div className="flex min-w-0 flex-1 justify-center">
        <button type="button" onClick={onOpenSearch} aria-label={`Search products, clients, bills (${hint})`} aria-keyshortcuts="Control+K Meta+K"
          data-testid="search-open"
          className={`m-press items-center gap-2 rounded-pill bg-well py-[9px] pl-3.5 pr-3 text-[13px] text-mute hover:bg-[#E8E8E7] ${isSales ? 'hidden xl:flex w-[300px] 2xl:w-[360px]' : 'hidden lg:flex w-[260px] xl:w-[360px]'}`}>
          <Search size={16} className="shrink-0" aria-hidden="true" />
          <span className="truncate">Search products, clients, bills</span>
          <kbd className="ml-auto shrink-0 rounded-[5px] bg-surface px-1.5 py-px font-tight text-[11px] font-semibold text-mute shadow-[0_0_0_1px_rgba(17,20,24,0.08)]">{hint}</kbd>
        </button>
      </div>
      <Button variant="secondary" size="icon" onClick={onOpenSearch} aria-label={`Search (${hint})`} title={`Search (${hint})`}
        className={`shrink-0 ${isSales ? 'xl:hidden' : 'lg:hidden'}`}>
        <Search />
      </Button>
      <TopBarSlotTarget className="flex items-center shrink-0 empty:hidden" />
      <div className="flex items-center gap-3 shrink-0">
        <SyncStatusButton />
        <SyncStatus variant="bar" />
      </div>
      <NotificationsBell tenantId={currentTenantId} gates={gates} basePath={basePath} />
      {isDashboard && <DashboardQuickActions className="hidden lg:flex shrink-0" />}
      {gates.collect && !onCollect && !isDashboard && (
        <Button variant="dark" onClick={() => navigate(`${basePath}/clients/collect`)} data-testid="collect-payment"
          className={`shrink-0 ${isSales ? 'hidden 2xl:inline-flex' : 'hidden lg:inline-flex'}`}>
          Collect payment
        </Button>
      )}
    </header>
  );
};

const MainContent = ({ kioskMode = false }) => {
  const location = useLocation();
  const { tenantSlug } = useParams();
  const { currentTenant, trial, planInEffect } = useTenant();
  const { hasRole } = useAuth();
  const billing = useBilling(currentTenant?.id);
  const isSales = location.pathname.endsWith('/sales') || location.pathname.endsWith('/van-sale');
  const basePath = tenantSlug ? `/${tenantSlug}` : '';
  const showBilling = !hasRole?.('GLOBAL_ADMIN') && (billing.expired || billing.pastDue || billing.trialEndingSoon);
  const billingMsg = billing.expired
    ? { txt: 'Your subscription has expired. Renew to keep full access.', cls: 'bg-red-600' }
    : billing.pastDue
    ? { txt: 'Payment failed. Update your billing to avoid interruption.', cls: 'bg-accent-signature' }
    : { txt: `Trial ends in ${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? '' : 's'}. Add a plan to continue.`, cls: 'bg-ink-primary' };
  return (
    <main
      className={`flex-1 w-full ${
        kioskMode
          ? 'p-0 overflow-hidden'
          : isSales
          ? 'px-4 sm:px-6 lg:px-7 py-2 md:pt-5 md:pb-4'
          : 'max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-7 py-2 md:pt-5 md:pb-8'
      }`}
    >
      <OfflineGraceBanner />
      {/* One message about status, never two. The trial banner and the billing
          banner read from different tables that disagree -- only four tenants
          have a subscription row, and Aisha Store's says her trial expired in
          July while access is in fact still open. While a tenant is on trial,
          tenants.trial_end_date is the source that gates access, so it is the
          one allowed to speak. */}
      {trial ? (
        <TrialBanner trial={trial} planInEffect={planInEffect} basePath={basePath} />
      ) : showBilling && (
        <div className={`${billingMsg.cls} text-white rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3 flex-wrap`}>
          <span className="text-[13px] font-semibold">{billingMsg.txt}</span>
          <NavLink to={`${basePath}/settings`} className="text-[12px] font-bold bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors">
            Manage billing →
          </NavLink>
        </div>
      )}
      <Outlet />
    </main>
  );
};

const AppLayout = () => {
  const { currentUser, loading: authLoading, offlineLock: startLock } = useAuth();
  // The start-up check only runs at launch; this catches a desktop left open
  // offline past its window (re-checked hourly by useOfflineGrace).
  const grace = useOfflineGrace();
  const offlineLock = startLock || ((grace?.expired || grace?.clockBack)
    ? { reason: grace.clockBack ? 'clock' : 'expired', graceDays: grace.graceDays, daysOffline: grace.daysOffline }
    : null);
  const { currentTenant, currentTenantId, isImpersonating, stopImpersonating, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const { allNavItems, basePath, gates } = useNavModel();

  // Global search (Ctrl K / Cmd K). The only key it takes is that one
  // combination, so a scanner gun typing into the Sales search box, and every
  // page's own keys ("/" on Inventory, Escape, arrows), are untouched. It does
  // not open over another open dialog, so it cannot pull a cashier out of a
  // half-finished checkout.
  const [searchOpen, setSearchOpen] = React.useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  React.useEffect(() => {
    if (!currentUser || !currentTenantId) return undefined;
    const onKey = (e) => {
      if (!isPaletteShortcut(e)) return;
      if (document.querySelector('[aria-modal="true"]:not([aria-label="Search"])')) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [currentUser, currentTenantId]);
  // Apply saved theme on every page load
  useTheme();

  // Kiosk mode: true when Electron window is in full-screen (POS Sales).
  // Driven by OS-level enter/leave-full-screen events forwarded via IPC so
  // reload recovery and Esc-key exit both work without React state loss.
  const [kioskMode, setKioskMode] = React.useState(false);
  React.useEffect(() => {
    if (!window.electron?.window) return;
    const unsub = window.electron.window.onKioskChange(({ inKiosk }) => setKioskMode(inKiosk));
    return unsub;
  }, []);

  const handleExitPOS = useCallback(() => {
    // setKiosk(false) triggers leave-full-screen → kioskChange event → setKioskMode(false)
    window.electron?.window?.setKiosk(false);
    navigate(-1);
  }, [navigate]);

  // Desktop one-time bulk pull-down splash. After the first online sign-in
  // we download every tenant table into IDB so subsequent launches render
  // every tab instantly from cache. Lazy import keeps the web bundle lean.
  const { railCollapsed } = useRail();
  const [bulkSyncDismissed, setBulkSyncDismissed] = React.useState(false);
  const [Splash, setSplash] = React.useState(null);
  React.useEffect(() => {
    if (!window.electron?.isElectron || bulkSyncDismissed || !currentTenant?.id) return;
    (async () => {
      const mod = await import('./BulkSyncSplash.jsx');
      setSplash(() => mod.default);
    })();
  }, [currentTenant?.id, bulkSyncDismissed]);

  if (authLoading || tenantLoading) {
    return <GlobalLoading />;
  }

  if (offlineLock) return <OfflineLockScreen lock={offlineLock} />;

  return (
    <TopBarSlotProvider>
    <div className="min-h-screen bg-canvas font-inter selection:bg-accent-signature/30 flex flex-col relative">
      {isImpersonating && (
        <div className="group fixed top-0 left-0 right-0 z-[200] h-2.5 print:hidden">
          {/* 10px hover trigger (wrapper height = 10px so nothing below gets blocked) */}
          {/* Always-visible pill, no pointer events */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-accent-signature text-white text-[9px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-b-md shadow-md opacity-80 group-hover:opacity-0 transition-opacity duration-200 pointer-events-none flex items-center gap-1">
            <Shield size={10} /> Impersonating
          </div>
          {/* Banner absolute — out of flow, slides down on hover */}
          <div className="absolute top-0 left-0 right-0 bg-accent-signature text-white px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-4 shadow-xl -translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out pointer-events-auto">
            <Shield size={14} className="animate-pulse" />
            <span>Viewing as: {currentTenant?.name}</span>
            <button
              onClick={stopImpersonating}
              className="bg-white text-accent-signature px-3 py-1 rounded-pill hover:bg-accent-signature/10 transition-all shadow-sm active:scale-[0.98] font-semibold border border-accent-signature/20"
            >
              Exit View
            </button>
          </div>
        </div>
      )}
      {kioskMode ? <KioskBar onExit={handleExitPOS} /> : <Navbar />}
      <NotificationStack />

      {/* Inset by the rail's width on desktop. The rail is `fixed`, so the
          page has to be moved out from under it; a flex row here would have
          meant rebuilding the kiosk bar and the mobile drawer around it for
          no gain. Kiosk (full-screen POS) has no rail and no inset.

          Web redesign: on desktop the page is a white rounded panel inset in
          the grey frame, with the top bar at its head. On the phone it is
          simply the white page under the header. */}
      {kioskMode ? (
        <div className="flex flex-col flex-1">
          <MainContent kioskMode={kioskMode} />
        </div>
      ) : (
        <div className="flex flex-col flex-1 transition-[padding] duration-200 ease-out motion-reduce:transition-none md:pl-[var(--rail-w)]"
          style={{ '--rail-w': `${railCollapsed ? 68 : RAIL_WIDE}px` }}>
          <div className="flex flex-col flex-1 min-w-0 bg-surface md:my-2.5 md:mr-2.5 md:rounded-2xl md:shadow-[0_0_0_1px_rgba(17,20,24,0.05),0_1px_3px_rgba(17,20,24,0.06)]">
            <TopBar onOpenSearch={openSearch} />
            <MainContent kioskMode={kioskMode} />
          </div>
        </div>
      )}

      <SearchPalette open={searchOpen} onClose={closeSearch} navItems={allNavItems}
        kinds={gates.search} tenantId={currentTenantId} basePath={basePath} />

      {Splash && !bulkSyncDismissed && currentTenant?.id && (
        <Splash tenantId={currentTenant.id} onDone={() => setBulkSyncDismissed(true)} />
      )}
    </div>
    </TopBarSlotProvider>
  );
};

export default AppLayout;
