import React from 'react';
import { Navigate, useLocation} from 'react-router-dom';
import { useAppContext} from '../context/AppContext';
import { ShieldAlert, Lock} from 'lucide-react';

export function ProtectedRoute({ children}) {
 const { session, currentUser, loading, hasPermission} = useAppContext();
 const location = useLocation();

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
 return <Navigate to="/login" state={{ from: location}} replace />;
}

 // GLOBAL ADMIN BYPASS (Safety first)
 const userEmail = currentUser?.email || session?.user?.email;
 if (userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca') {
 return children;
}

 // Granular Permission Guard
 const path = location.pathname.split('/')[1];
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
