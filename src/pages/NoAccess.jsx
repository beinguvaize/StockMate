import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut, Mail, RefreshCcw } from 'lucide-react';
import { goHref } from '../lib/nav';

const NoAccess = () => {
  const { logout, currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Self-rescue for Global Admins
  React.useEffect(() => {
    const userEmail = currentUser?.email?.toLowerCase();
    const isGlobalAdmin = isAdmin || 
                         userEmail === 'uvaize@hotmail.com' || 
                         userEmail === 'gladmin@ledgrpro.ca';
                         
    console.log('NoAccess: Auth State:', { userEmail, isAdmin, isGlobalAdmin });
                         
    if (isGlobalAdmin) {
      console.log('NoAccess: Global Admin detected, redirecting to Nexus...');
      navigate('/nexus-hq', { replace: true });
    }
  }, [currentUser, isAdmin, navigate]);

  return (
    <div className="min-h-screen bg-[#141c1a] flex items-center justify-center p-4 relative overflow-hidden font-inter">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#38e0a0]/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-lg glass-panel border-white/5 bg-white/5 backdrop-blur-xl p-10 relative z-10 rounded-[2.5rem] border border-white/10 shadow-2xl text-center">
        <div className="flex justify-center mb-8">
          <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center relative">
            <ShieldAlert className="w-12 h-12 text-red-500" />
            <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping opacity-20" />
          </div>
        </div>

        <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-4 leading-none font-sora">
          Access <span className="text-red-500">Restricted</span>
        </h1>
        
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 mb-8">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">No Active Workspace Found</span>
        </div>

        <p className="text-[#747576] text-sm leading-relaxed mb-10 max-w-[340px] mx-auto font-medium">
          Hello {currentUser?.name || 'User'}, your account is authenticated but not yet associated with an active workspace. 
          <span className="block mt-2 text-white/60">Please contact your system administrator to be added to an organization.</span>
        </p>

        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={() => logout()}
            className="group w-full h-16 bg-white hover:bg-white/90 text-[#141c1a] font-bold font-sora rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm tracking-tight uppercase">Switch Account / Sign Out</span>
          </button>

          <button 
            onClick={async () => {
              console.log('Hard Reset Triggered');
              localStorage.clear();
              sessionStorage.clear();
              await logout();
              goHref('/login');
            }}
            className="w-full h-16 bg-accent-signature/10 border border-accent-signature/20 text-accent-signature font-bold font-sora rounded-2xl hover:bg-accent-signature/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <RefreshCcw className="w-5 h-5 animate-spin" />
            <span className="text-sm tracking-tight uppercase">Emergency Platform Sync</span>
          </button>

          <a 
            href="mailto:support@ledgr.pro"
            className="w-full py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-white transition-all text-center"
          >
            Infrastructure Support
          </a>
        </div>

        <div className="mt-10 pt-8 border-t border-white/5 flex flex-col items-center gap-2">
          <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-[0.3em]">
            Ledgr Infrastructure Governance
          </p>
          <div className="flex gap-4">
            <span className="text-[9px] text-red-500/60 font-black uppercase">Tier: Unauthorized</span>
            <span className="text-[9px] text-[#747576] font-black uppercase">Mode: Restricted</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoAccess;
