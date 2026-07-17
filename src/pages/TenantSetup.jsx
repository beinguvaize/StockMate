import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowRight, Loader2, ChevronLeft, Check, Zap, Shield, Star,
  Store, UtensilsCrossed, Briefcase, ShieldCheck, CreditCard, CalendarClock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { goHref } from '../lib/nav';

const PLANS = [
  {
    id: 'FREE',
    label: 'Free',
    price: '₹0',
    tagline: 'Try everything a single shop needs.',
    features: ['Dashboard', 'Inventory', 'Sales & POS', 'GST Invoices', 'Clients', 'Expenses', '100 invoices/mo', '1 user'],
    locked: ['Purchases', 'Suppliers', 'Reports', 'Payroll'],
    icon: <Zap size={16} />,
  },
  {
    id: 'GROWTH',
    label: 'Growth',
    price: '₹2,999/yr',
    tagline: 'For a shop finding its feet.',
    badge: 'Most Popular',
    features: ['All Free features', 'Purchases & Suppliers', 'Payroll', 'Reports', 'GSTR Export', '1,000 invoices/mo', '3 users'],
    locked: ['Vehicles', 'Manufacturing', 'Multi-Location Inventory'],
    icon: <Star size={16} />,
  },
  {
    id: 'PRO',
    label: 'Pro',
    price: '₹5,999/yr',
    tagline: 'For growing teams that need the full stack.',
    features: ['All Growth features', 'Vehicles & Routes', 'Estimates', 'Manufacturing', 'Multi-Location Inventory', 'Price Lists', 'WAC Costing', 'Unlimited invoices', '5 users'],
    locked: ['White Label', 'API Access'],
    icon: <Star size={16} />,
  },
  {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    price: 'Custom',
    tagline: 'For multi-location & power operations.',
    features: ['All Pro features', 'User Management', 'Audit Log', 'API Access', 'White Label', 'Priority Support', 'Unlimited users'],
    locked: [],
    icon: <Shield size={16} />,
  },
];

const BUSINESS_TYPES = [
  { id: 'RETAIL',     label: 'Retail',     desc: 'Shop, store, wholesale & distribution', icon: <Store size={20} /> },
  { id: 'RESTAURANT', label: 'Restaurant', desc: 'Café, dine-in, kitchen & takeaway',     icon: <UtensilsCrossed size={20} /> },
  { id: 'SERVICES',   label: 'Services',   desc: 'Appointments, repairs & professionals',  icon: <Briefcase size={20} /> },
];

const TRUST = [
  { icon: <CalendarClock size={13} />, text: '60-day free trial' },
  { icon: <CreditCard size={13} />,    text: 'No credit card required' },
  { icon: <ShieldCheck size={13} />,   text: 'Cancel anytime' },
];

const TenantSetup = () => {
  const [step, setStep] = useState(1); // 1 = plan, 2 = business name + industry
  const [selectedPlan, setSelectedPlan] = useState('GROWTH');
  const [businessType, setBusinessType] = useState('RETAIL'); // industry / vertical
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
        body: JSON.stringify({ businessName: businessName.trim(), plan: selectedPlan, businessType }),
      });
      const data = await res.json();
      if (res.status === 401) {
        // Session JWT rejected by the edge function. Most often this means
        // the cached supabase session was issued by a different project.
        // Clear it and bounce back to /login so they can get a fresh token.
        await supabase.auth.signOut();
        throw new Error('Session expired. Please sign in again.');
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);

      // Redirect to onboarding instead of dashboard directly
      goHref('/onboarding');
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to create workspace. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const activePlan = PLANS.find(p => p.id === selectedPlan);
  const logo = `${import.meta.env.BASE_URL}logo-white.png`;

  return (
    <div className="min-h-screen bg-[#141c1a] flex flex-col items-center px-4 py-10 relative overflow-hidden font-inter selection:bg-accent-signature/30">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-[32rem] h-[32rem] bg-accent-signature/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[32rem] h-[32rem] bg-emerald-500/[0.07] rounded-full blur-[140px] pointer-events-none" />

      {isGlobalAdmin && (
        <div className="absolute top-6 left-6 z-50">
          <button
            onClick={() => navigate('/nexus-hq')}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all backdrop-blur-md"
          >
            <ChevronLeft size={16} />
            <span className="text-[11px] font-bold">Nexus HQ</span>
          </button>
        </div>
      )}

      {/* Shared header: brand + progress */}
      <div className="relative z-10 flex flex-col items-center mb-8">
        <img src={logo} alt="bookledger" className="h-9 w-auto object-contain mb-7"
          onError={(e) => { e.target.style.display = 'none'; }} />
        <div className="flex items-center gap-2.5">
          {[1, 2].map((n) => (
            <React.Fragment key={n}>
              <div className={`flex items-center gap-2 ${step >= n ? 'text-accent-signature' : 'text-white/30'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black border ${
                  step > n ? 'bg-accent-signature border-accent-signature text-black'
                  : step === n ? 'border-accent-signature text-accent-signature'
                  : 'border-white/20 text-white/40'
                }`}>
                  {step > n ? <Check size={12} /> : n}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest hidden sm:block">
                  {n === 1 ? 'Plan' : 'Workspace'}
                </span>
              </div>
              {n === 1 && <span className={`w-8 h-px ${step > 1 ? 'bg-accent-signature' : 'bg-white/15'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step 1: Plan selection */}
      {step === 1 && (
        <div className="w-full max-w-4xl relative z-10 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">Choose your plan</h1>
            <p className="text-[#9aa19c] text-sm font-medium">
              Start free for <span className="text-accent-signature font-bold">60 days</span> — pick the plan that fits, change it anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
            {PLANS.map((plan) => {
              const active = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`group relative text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                    active
                      ? 'border-accent-signature bg-accent-signature/[0.08] shadow-[0_0_0_4px_rgba(217,119,6,0.12)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]'
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent-signature text-black text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">
                      {plan.badge}
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? 'bg-accent-signature text-black' : 'bg-white/10 text-white group-hover:bg-white/15'}`}>
                      {plan.icon}
                    </div>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${active ? 'border-accent-signature bg-accent-signature' : 'border-white/20'}`}>
                      {active && <Check size={12} className="text-black" strokeWidth={3} />}
                    </span>
                  </div>
                  <div className="text-white font-black text-sm uppercase tracking-tight">{plan.label}</div>
                  <div className="flex items-baseline gap-1 mt-0.5 mb-1">
                    <span className={`text-2xl font-black ${active ? 'text-accent-signature' : 'text-white'}`}>{plan.price}</span>
                    <span className="text-[11px] text-gray-500 font-bold">/mo</span>
                  </div>
                  <p className="text-[11px] text-gray-400 font-medium leading-snug mb-4 min-h-[2.4em]">{plan.tagline}</p>
                  <ul className="space-y-1.5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-[11px] text-gray-200 font-medium">
                        <Check size={11} className="text-accent-signature shrink-0" strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                    {plan.locked.map(f => (
                      <li key={f} className="flex items-center gap-2 text-[11px] text-gray-600 font-medium line-through decoration-gray-700">
                        <span className="w-[11px] h-[11px] shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-5">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-8 py-3.5 bg-accent-signature hover:bg-accent-signature-hover text-black font-black rounded-xl shadow-[0_12px_28px_-12px_rgba(217,119,6,0.7)] transition-all active:scale-[0.98]"
            >
              Continue with {activePlan?.label}
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {TRUST.map(t => (
                <span key={t.text} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
                  <span className="text-accent-signature">{t.icon}</span>{t.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Workspace */}
      {step === 2 && (
        <div className="w-full max-w-lg relative z-10 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-[11px] font-bold mb-5 transition-colors"
          >
            <ChevronLeft size={14} /> Back to plans
          </button>

          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.75rem] p-6 sm:p-8">
            <div className="flex flex-col items-center mb-7 text-center">
              <div className="px-3.5 py-1.5 bg-accent-signature/15 border border-accent-signature/30 rounded-full text-[10px] font-black text-accent-signature uppercase tracking-widest mb-4">
                {activePlan?.label} · 60-day free trial
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-1">Set up your workspace</h1>
              <p className="text-[#9aa19c] text-xs font-medium">Two quick details and you're in.</p>
            </div>

            <form onSubmit={handleSetup} className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-0.5 block mb-2.5">
                  What kind of business?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {BUSINESS_TYPES.map((v) => {
                    const active = businessType === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setBusinessType(v.id)}
                        className={`flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2 p-3.5 rounded-2xl border-2 transition-all ${
                          active ? 'border-accent-signature bg-accent-signature/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                        }`}
                      >
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-accent-signature text-black' : 'bg-white/10 text-gray-300'}`}>
                          {v.icon}
                        </span>
                        <span className="sm:mt-1">
                          <span className="block text-white font-black text-[12px] uppercase tracking-tight">{v.label}</span>
                          <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{v.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-0.5 block mb-2">
                  Business name <span className="text-gray-600 normal-case font-medium tracking-normal">— shown on every invoice</span>
                </label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Krishna Traders"
                  className="w-full h-14 bg-black/40 border border-white/10 text-white px-5 rounded-xl outline-none focus:border-accent-signature/60 focus:ring-4 focus:ring-accent-signature/10 transition-all text-sm"
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-semibold text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full h-14 bg-accent-signature hover:bg-accent-signature-hover text-black font-black rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                disabled={isLoading || !businessName.trim()}
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creating your workspace…</>
                ) : (
                  <><span className="text-sm tracking-tight">Launch workspace</span><ArrowRight className="w-4 h-4" strokeWidth={2.5} /></>
                )}
              </button>

              <p className="flex items-center justify-center gap-1.5 text-[10px] text-gray-500 font-medium">
                <ShieldCheck size={12} className="text-accent-signature" />
                Free for 60 days · no card · cancel anytime
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantSetup;
