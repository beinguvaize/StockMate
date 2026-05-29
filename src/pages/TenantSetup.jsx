import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Building2, ArrowRight, Loader2, ChevronLeft,
  Check, Zap, Shield, Star
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { goHref } from '../lib/nav';

const PLANS = [
  {
    id: 'STARTER',
    label: 'Starter',
    price: '₹499/mo',
    badge: null,
    color: 'border-black/10',
    activeColor: 'border-accent-signature bg-accent-signature/5',
    features: ['Dashboard', 'Inventory', 'Sales & POS', 'GST Invoices', 'Clients', 'Expenses', '500 invoices/mo', '2 users'],
    locked: ['Purchases', 'Suppliers', 'Reports', 'Payroll', 'Vehicles'],
    icon: <Zap size={18} />,
  },
  {
    id: 'PRO',
    label: 'Professional',
    price: '₹1,499/mo',
    badge: 'Most Popular',
    color: 'border-black/10',
    activeColor: 'border-blue-500 bg-blue-50',
    features: ['All Starter features', 'Purchases & Suppliers', 'Vehicles & Routes', 'Payroll', 'GSTR Export', 'Price Lists', 'WAC Costing', '10 users'],
    locked: ['Multi-Location Inventory', 'White Label', 'API Access'],
    icon: <Star size={18} />,
  },
  {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    price: '₹3,499/mo',
    badge: null,
    color: 'border-black/10',
    activeColor: 'border-purple-500 bg-purple-50',
    features: ['All Pro features', 'Multi-Location Inventory', 'User Management', 'Audit Log', 'API Access', 'White Label', 'Unlimited users'],
    locked: [],
    icon: <Shield size={18} />,
  },
];

const TenantSetup = () => {
  const [step, setStep] = useState(1); // 1 = plan, 2 = business name
  const [selectedPlan, setSelectedPlan] = useState('STARTER');
  const [businessName, setBusinessName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const isGlobalAdmin = currentUser?.roles?.includes('GLOBAL_ADMIN');

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Explicitly grab the active session so the Authorization header
      // reaches the edge function. supabase.functions.invoke is supposed
      // to attach this for you, but in some embeds (Electron file://,
      // certain SDK versions) it falls back to the anon key and the
      // function rejects with 401.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('You are not signed in. Please sign in again.');
      }

      // Use a direct fetch so we have full control over the headers.
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-tenant`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ businessName: businessName.trim(), plan: selectedPlan }),
      });
      const data = await res.json();
      if (res.status === 401) {
        // Session JWT rejected by the edge function. Most often this means
        // the cached supabase session was issued by a different project
        // (e.g. user has an older build that pointed at prod, now we
        // point at dev). Clear it and bounce back to /login so they can
        // get a fresh token.
        await supabase.auth.signOut();
        throw new Error('Session expired. Please sign in again.');
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);

      // Redirect to onboarding instead of dashboard directly
      goHref(`/${data.slug}/onboarding`);
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to create workspace. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const activePlan = PLANS.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen bg-[#141c1a] flex items-center justify-center p-4 relative overflow-hidden font-inter">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#C8F135]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />

      {isGlobalAdmin && (
        <div className="absolute top-10 left-10 z-50">
          <button
            onClick={() => navigate('/nexus-hq')}
            className="flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white transition-all backdrop-blur-md"
          >
            <ChevronLeft size={18} />
            <span className="text-xs font-bold">Nexus HQ</span>
          </button>
        </div>
      )}

      {/* Step 1: Plan selection */}
      {step === 1 && (
        <div className="w-full max-w-3xl relative z-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-[#C8F135] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(200,241,53,0.3)]">
              <Building2 className="w-7 h-7 text-black" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Choose your plan</h1>
            <p className="text-[#747576] text-sm font-medium">
              All plans start with a <span className="text-[#C8F135] font-bold">60-day free trial</span>. No credit card required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                  selectedPlan === plan.id
                    ? 'border-[#C8F135] bg-[#C8F135]/10 shadow-[0_0_20px_rgba(200,241,53,0.15)]'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full">
                    {plan.badge}
                  </span>
                )}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${selectedPlan === plan.id ? 'bg-[#C8F135] text-black' : 'bg-white/10 text-white'}`}>
                  {plan.icon}
                </div>
                <div className="text-white font-black text-sm uppercase tracking-tight mb-0.5">{plan.label}</div>
                <div className={`text-lg font-black mb-4 ${selectedPlan === plan.id ? 'text-[#C8F135]' : 'text-gray-300'}`}>{plan.price}</div>
                <ul className="space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[11px] text-gray-300 font-medium">
                      <Check size={10} className="text-[#C8F135] shrink-0" />
                      {f}
                    </li>
                  ))}
                  {plan.locked.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[11px] text-gray-600 font-medium line-through">
                      <span className="w-2.5 h-2.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {selectedPlan === plan.id && (
                  <div className="mt-4 flex items-center gap-1.5 text-[10px] text-[#C8F135] font-black uppercase tracking-widest">
                    <Check size={10} /> Selected
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-8 py-4 bg-[#C8F135] hover:bg-[#b5db2f] text-black font-bold rounded-2xl shadow-[0_10px_20px_-10px_rgba(200,241,53,0.5)] transition-all"
            >
              Continue with {activePlan?.label}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Business name */}
      {step === 2 && (
        <div className="w-full max-w-md relative z-10">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-[11px] font-bold mb-6 transition-colors"
          >
            <ChevronLeft size={14} /> Back to plans
          </button>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8">
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="px-4 py-1.5 bg-[#C8F135]/20 border border-[#C8F135]/30 rounded-full text-[10px] font-black text-[#C8F135] uppercase tracking-widest mb-4">
                {activePlan?.label} · 60-day free trial
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Name your workspace</h1>
              <p className="text-[#747576] text-xs font-medium">This is your business name as it appears on invoices</p>
            </div>

            <form onSubmit={handleSetup} className="space-y-5">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 block mb-2">
                  Business Legal Name
                </label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. KRISHNA TRADERS"
                  className="w-full h-14 bg-black/40 border border-white/10 text-white px-5 rounded-xl outline-none focus:border-[#C8F135]/50 transition-all text-sm uppercase tracking-wide"
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold text-center uppercase tracking-wider">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full h-14 bg-[#C8F135] hover:bg-[#b5db2f] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || !businessName.trim()}
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creating workspace...</>
                ) : (
                  <><span className="text-sm tracking-tight">LAUNCH WORKSPACE</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantSetup;
