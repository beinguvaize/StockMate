import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Building2, Sparkles, ArrowRight, Loader2, ShieldCheck, ChevronLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const TenantSetup = () => {
  const [businessName, setBusinessName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser } = useAppContext();
  const navigate = useNavigate();

  const isGlobalAdmin = currentUser?.roles?.includes('GLOBAL_ADMIN');

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('create-tenant', {
        body: { businessName: businessName.trim() }
      });

      if (functionError) throw functionError;
      if (data.error) throw new Error(data.error);

      // Successfully created tenant, redirect to dashboard
      // Note: AppContext will catch the session change or we can reload
      window.location.href = `/${data.slug}/dashboard`;
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to create workspace. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141c1a] flex items-center justify-center p-4 relative overflow-hidden font-inter">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#C8F135]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />

      {/* Admin Quick Exit */}
      {isGlobalAdmin && (
        <div className="absolute top-10 left-10 z-50 animate-in fade-in slide-in-from-left-4 duration-500">
          <button 
            onClick={() => navigate('/nexus-hq')}
            className="flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white transition-all group backdrop-blur-md"
          >
            <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform">
              <ChevronLeft size={18} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#747576]">Return to</p>
              <p className="text-xs font-bold uppercase tracking-tight">The Nexus Protocol</p>
            </div>
          </button>
        </div>
      )}

      <div className="w-full max-w-md glass-panel border-white/5 bg-white/5 backdrop-blur-xl p-8 relative z-10 rounded-[2rem] border border-white/10 shadow-2xl">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-[#C8F135] rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(200,241,53,0.3)]">
            <Building2 className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-sora mb-2 uppercase">
            SaaS <span className="text-[#C8F135]">Onboarding</span>
          </h1>
          <p className="text-[#747576] text-xs font-semibold uppercase tracking-widest opacity-80">
            Let's get your workspace ready in seconds
          </p>
        </div>

        <form onSubmit={handleSetup} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
              Business Legal Name
            </label>
            <div className="relative">
               <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. ACME LOGISTICS"
                className="w-full h-14 bg-black/40 border border-white/10 text-white px-5 rounded-xl outline-none focus:border-[#C8F135]/50 transition-all font-inter text-sm uppercase tracking-wide"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold text-center uppercase tracking-wider">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full h-14 bg-[#C8F135] hover:bg-[#b5db2f] text-black font-bold font-sora rounded-xl shadow-[0_10px_20px_-10px_rgba(200,241,53,0.4)] group transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || !businessName.trim()}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span className="text-sm tracking-tight">INITIALIZE WORKSPACE</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-[8px] text-gray-500 font-bold uppercase tracking-widest">
          <Sparkles className="w-3 h-3 text-[#C8F135]" />
          Powered by Ledgr High-Density Core
        </div>
      </div>
    </div>
  );
};

export default TenantSetup;
