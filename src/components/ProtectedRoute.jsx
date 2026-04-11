import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ShieldAlert, Lock, Sparkles } from 'lucide-react';
import { getRequiredPlan, PLANS } from '../lib/tenancy';

export function ProtectedRoute({ children, requireGlobalAdmin = false }) {
 const { session, currentUser, loading, hasPermission, currentTenant, isModuleAllowed } = useAppContext();
 const location = useLocation();
 const { tenantSlug } = useParams();

 if (loading) {
 return (
 <div className="flex items-center justify-center h-screen bg-[#141c1a]">
 <div className="flex flex-col items-center gap-4">
 <div className="w-10 h-10 border-4 border-[#38e0a0]/30 border-t-[#38e0a0] rounded-full animate-spin" />
 <span className="text-[#747576] text-xs font-bold">Loading...</span>
 </div>
 </div>
 );
 }

 // Authentication Guard
 if (!session && !currentUser) {
 return <Navigate to="/login" state={{ from: location }} replace />;
 }

 // GLOBAL ADMIN BYPASS (Safety first)
 const userEmail = currentUser?.email || session?.user?.email;
 if (userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca') {
 return children;
 }

 // Global Admin route guard
 if (requireGlobalAdmin) {
   const roles = currentUser?.roles || [];
   if (!roles.includes('GLOBAL_ADMIN')) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen p-5 bg-[#141c1a]">
         <div className="glass-panel max-w-[500px] w-full text-center p-6 border-red-500/10">
           <div className="flex justify-center mb-8">
             <div className="bg-red-500/5 p-5 rounded-full text-red-500">
               <ShieldAlert size={64} strokeWidth={2.5} />
             </div>
           </div>
           <h2 className="text-4xl font-semibold text-white mb-4 leading-none">Super Admin Only</h2>
           <p className="text-[10px] font-semibold text-[#747576] opacity-70 mb-10 leading-relaxed">
             This panel is restricted to Global Administrators.
           </p>
           <button 
             className="btn-signature w-full h-16" 
             onClick={() => window.history.back()}
           >
             RETURN TO HUB
           </button>
         </div>
       </div>
     );
   }
   return children;
 }

 // Granular Permission Guard
 const pathSegments = location.pathname.split('/');
 // With tenant routing: /:tenantSlug/:module
 const path = tenantSlug ? pathSegments[2] : pathSegments[1];

 const moduleMap = {
 'inventory': 'inventory',
 'sales': 'sales',
 'purchases': 'purchases',
 'orders': 'sales', // Pipeline is part of sales
 'expenses': 'expenses',
 'clients': 'clients',
 'suppliers': 'suppliers',
 'payroll': 'payroll',
 'daybook': 'daybook',
 'vehicles': 'vehicles',
 'reports': 'reports',
 'users': 'users',
 'settings': 'settings'
 };

 const moduleKey = moduleMap[path];

 // Plan-based module gating
 if (moduleKey && !isModuleAllowed(moduleKey)) {
   const requiredPlan = getRequiredPlan(moduleKey);
   const planConfig = PLANS[requiredPlan];
   return (
     <div className="flex flex-col items-center justify-center min-h-[80vh] p-5 animate-in fade-in zoom-in duration-500">
       <div className="glass-panel max-w-[500px] w-full text-center p-8 border-accent-signature/10">
         <div className="flex justify-center mb-8 relative">
           <div className="bg-accent-signature/5 p-5 rounded-full text-accent-signature">
             <Sparkles size={64} strokeWidth={2} />
           </div>
         </div>
         <h2 className="text-3xl font-bold text-ink-primary mb-2 leading-none font-sora">Upgrade Required</h2>
         <p className="text-sm font-semibold text-gray-600 opacity-80 mb-8 leading-relaxed">
           The <span className="text-ink-primary font-bold capitalize">{path}</span> module requires the{' '}
           <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${planConfig?.color || 'bg-blue-50 text-blue-600'}`}>
             {planConfig?.label || requiredPlan}
           </span>{' '}
           plan or higher.
         </p>
         <div className="bg-canvas rounded-2xl p-5 border border-black/5 mb-8 text-left">
           <p className="text-[10px] uppercase tracking-widest text-accent-signature font-bold mb-3">What you get with {planConfig?.label}</p>
           <div className="grid grid-cols-2 gap-2">
             {planConfig?.modules?.filter(m => !['dashboard'].includes(m)).map(m => (
               <div key={m} className="text-xs font-medium text-gray-700 capitalize flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-accent-signature"></div>
                 {m.replace('daybook', 'Day Book')}
               </div>
             ))}
           </div>
         </div>
         <button 
           className="btn-signature w-full h-14 !rounded-xl !text-sm"
           onClick={() => window.history.back()}
         >
           UPGRADE TO {planConfig?.label?.toUpperCase() || 'PRO'}
           <div className="icon-nest">
             <Sparkles size={20} />
           </div>
         </button>
       </div>
     </div>
   );
 }

 // RBAC permission guard
 if (moduleKey && !hasPermission(moduleKey, 'view')) {
 return (
 <div className="flex flex-col items-center justify-center min-h-[80vh] p-5 animate-in fade-in zoom-in duration-500">
 <div className="glass-panel max-w-[500px] w-full text-center p-6 border-red-500/10">
 <div className="flex justify-center mb-8 relative">
 <div className="bg-red-500/5 p-5 rounded-full text-red-500">
 <Lock size={64} strokeWidth={2.5} />
 </div>
 <div className="absolute -bottom-2 right-[30%] bg-white p-2 rounded-full shadow-lg border border-red-100">
 <ShieldAlert size={24} className="text-red-500" />
 </div>
 </div>
 <h2 className="text-4xl font-semibold text-[#111] mb-4 leading-none">Security Restricted</h2>
 <p className="text-[10px] font-semibold text-[#747576] opacity-70 mb-10 leading-relaxed max-w-[300px] mx-auto">
 Your current clearance level does not allow access to the <span className="text-red-500">{path}</span> segment.
 </p>
 <button 
 className="btn-signature w-full h-16 !bg-ink-primary !text-white" 
 onClick={() => window.history.back()}
 >
 RETURN TO HUB
 </button>
 </div>
 </div>
 );
 }

 return children;
}
