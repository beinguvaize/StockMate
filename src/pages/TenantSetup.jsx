import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Store, UtensilsCrossed, CalendarDays, Check, X, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { goHref } from '../lib/nav';
import { INDIAN_STATES, stateCodeFor } from '../lib/gstStates';
import { SETUP_STEPS, SETUP_PLANS as PLANS, canContinue, canCreate, filterStates } from '../lib/setupFlow';
import { SetupFrame, StepBar, StepQ, StepNav, navBtn, BigOption, bigBoxCls } from '../components/auth/SetupParts';
import { AuthNote, Hint, Icon } from '../components/auth/AuthParts';
import { cn } from '../lib/utils';

const BUSINESS_TYPES = [
  { id: 'RETAIL',     label: 'Retail',     desc: 'Shop, store, wholesale and distribution', icon: <Store /> },
  { id: 'RESTAURANT', label: 'Restaurant', desc: 'Café, dine-in, kitchen and takeaway',     icon: <UtensilsCrossed /> },
  { id: 'SERVICES',   label: 'Services',   desc: 'Appointments, repairs and professionals', icon: <CalendarDays /> },
];

const TRUST = ['60-day free trial', 'No card needed', 'Change plan any time'];

/**
 * First-time shop setup (approved setup-01 to 08): one question per step,
 * then "Create my shop". Shop creation is the same single call to the
 * create-tenant function, with the same body, as the old one-page form.
 */
const TenantSetup = () => {
  const [step, setStep] = useState(1); // 1 plan, 2 type, 3 name, 4 phone, 5 address, 6 state
  const [selectedPlan, setSelectedPlan] = useState('GROWTH');
  const [businessType, setBusinessType] = useState('RETAIL'); // industry / vertical
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [stateQuery, setStateQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser, logout } = useAuth();
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
        body: JSON.stringify({
          businessName: businessName.trim(),
          plan: selectedPlan,
          businessType,
          phone: businessPhone.trim(),
          address: businessAddress.trim(),
          state: businessState,
          stateCode: stateCodeFor(businessState),
        }),
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
  const form = { plan: selectedPlan, businessType, businessName, businessPhone, businessAddress, businessState };
  const total = SETUP_STEPS.length;
  const next = () => { if (canContinue(step, form)) setStep((n) => Math.min(total, n + 1)); };
  const back = () => { setError(null); setStep((n) => Math.max(1, n - 1)); };

  // Enter on a step moves on; on the last step it creates the shop.
  const onSubmit = (e) => {
    if (step === total) return handleSetup(e);
    e.preventDefault();
    next();
    return undefined;
  };

  const backBtn = <button type="button" onClick={back} disabled={isLoading} className={navBtn('sec')}>Back</button>;
  const continueBtn = <button type="submit" disabled={!canContinue(step, form)} className={navBtn('pri')}>Continue</button>;
  const states = filterStates(stateQuery, INDIAN_STATES);

  return (
    <SetupFrame wide={step === 1} onSignOut={() => logout()} onNexus={isGlobalAdmin ? () => navigate('/nexus-hq') : null}>
      <StepBar step={step} total={total} names={SETUP_STEPS} />
      <form onSubmit={onSubmit} key={step} className="m-rise">

        {/* setup-01 */}
        {step === 1 && (
          <>
            <StepQ title="Pick a plan to start with" sub="Every plan is free for 60 days. You can change it any time." />
            <div role="radiogroup" aria-label="Plan" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => {
                const on = selectedPlan === plan.id;
                return (
                  <button key={plan.id} type="button" data-card role="radio" aria-checked={on} onClick={() => setSelectedPlan(plan.id)}
                    className={cn('m-press rounded-[14px] bg-white p-4 text-left',
                      on ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
                    <div className="flex items-center justify-between font-tight text-[13px] font-semibold text-ink">
                      {plan.label}
                      {plan.badge && <span className="rounded-pill bg-amber-soft px-2 py-0.5 font-tight text-[11px] font-semibold text-amber-text">{plan.badge}</span>}
                    </div>
                    <div className="mb-2.5 mt-1.5 font-tight text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
                      {plan.price}{plan.per && <small className="ml-1 font-inter text-[12.5px] font-medium tracking-normal text-mute">{plan.per}</small>}
                    </div>
                    <Hint className="-mt-1 mb-2.5">{plan.tagline}</Hint>
                    <ul className="grid gap-1.5 text-[12.5px] text-ink-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-[7px]"><Check size={13} strokeWidth={2.4} className="mt-[3px] shrink-0 text-good-text" aria-hidden="true" />{f}</li>
                      ))}
                      {plan.locked.map((f) => (
                        <li key={f} className="flex items-start gap-[7px] text-faint line-through"><X size={13} strokeWidth={2.4} className="mt-[3px] shrink-0" aria-hidden="true" /><span><span className="sr-only">Not included: </span>{f}</span></li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <div className="mt-[18px] flex flex-wrap justify-center gap-x-[18px] gap-y-2 font-tight text-[12.5px] font-semibold text-body">
              {TRUST.map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.4} className="text-good-text" aria-hidden="true" />{t}</span>
              ))}
            </div>
            <StepNav right={<button type="submit" className={navBtn('pri')}>Continue with {activePlan?.label}</button>} />
          </>
        )}

        {/* setup-02 */}
        {step === 2 && (
          <>
            <StepQ title="What kind of business is it?" sub={`${activePlan?.label} plan · 60-day free trial`} />
            <div role="radiogroup" aria-label="Business type" className="grid gap-2.5">
              {BUSINESS_TYPES.map((v) => (
                <BigOption key={v.id} selected={businessType === v.id} onClick={() => setBusinessType(v.id)}
                  icon={v.icon} title={v.label} sub={v.desc} />
              ))}
            </div>
            <Hint className="mt-2.5">Sets the words the app uses and which modules start switched on. You can change it later in Settings.</Hint>
            <StepNav left={backBtn} right={continueBtn} />
          </>
        )}

        {/* setup-03 */}
        {step === 3 && (
          <>
            <StepQ title="What is the shop called?" sub="Printed at the top of every bill and invoice." />
            <div className={bigBoxCls}>
              <input aria-label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Business name" required disabled={isLoading} autoFocus
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mute" />
            </div>
            <Hint className="mt-2">Use the name customers know. You can change it in Settings, Business.</Hint>
            <StepNav left={backBtn} right={continueBtn} />
          </>
        )}

        {/* setup-04. Both phone and address print on every GST invoice. Asked
            here rather than left to Settings, where most tenants never went:
            of the first twelve, three had an address and three had a phone. */}
        {step === 4 && (
          <>
            <StepQ title="What number should bills show?" sub="Mobile or landline. Printed on every invoice." />
            <div className={bigBoxCls}>
              <input aria-label="Phone" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)}
                type="tel" inputMode="tel" placeholder="98765 43210" required disabled={isLoading} autoFocus
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mute" />
            </div>
            <Hint className="mt-2">Customers call this number. It is not used to sign in.</Hint>
            <StepNav left={backBtn} right={continueBtn} />
          </>
        )}

        {/* setup-05 */}
        {step === 5 && (
          <>
            <StepQ title="Where is the shop?" sub="A GST invoice must show the address." />
            <div className={cn(bigBoxCls, 'items-start py-3.5')}>
              <textarea aria-label="Business address" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)}
                rows={3} placeholder="Street, area, city and PIN code" required disabled={isLoading} autoFocus
                className="min-w-0 flex-1 resize-none bg-transparent leading-[1.5] outline-none placeholder:text-mute" />
            </div>
            <Hint className="mt-2">Street, area, city and PIN code.</Hint>
            <StepNav left={backBtn} right={continueBtn} />
          </>
        )}

        {/* setup-06 / 07 / 08. Picked by name, never typed as a number. The
            state decides CGST+SGST versus IGST and is the first two digits of
            a GSTIN, but no shopkeeper knows their own code, so we show the name
            and derive the code from it. */}
        {step === 6 && (
          <>
            <StepQ title="Which state is the shop in?" sub="Decides CGST and SGST, or IGST, on your bills. Pick the name; we work out the code." />
            <div className={bigBoxCls}>
              <Search size={17} className="shrink-0 text-mute" aria-hidden="true" />
              <input aria-label="Search states" value={stateQuery} onChange={(e) => setStateQuery(e.target.value)}
                placeholder={businessState || 'Search states'} disabled={isLoading} autoFocus
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mute" />
            </div>
            <div role="radiogroup" aria-label="State" className="mt-2.5 grid max-h-[300px] gap-2.5 overflow-y-auto p-0.5">
              {states.map((st) => (
                <BigOption key={st.code} selected={businessState === st.name} disabled={isLoading}
                  onClick={() => setBusinessState(st.name)} title={st.name} sub={`GST state code ${st.code}`} />
              ))}
              {states.length === 0 && <Hint className="py-2">No state matches “{stateQuery}”.</Hint>}
            </div>
            <Hint className="mt-2.5">Your GSTIN starts with this code.</Hint>

            {error && (
              <AuthNote tone="rd" className="mb-0 mt-4">
                <b>The shop was not created.</b> {error} Your answers are kept on this screen.
              </AuthNote>
            )}

            <StepNav left={backBtn} right={(
              <button type="submit" className={navBtn('pri')} disabled={isLoading || !canCreate(form)}>
                {isLoading && <Icon.spinner />}
                {isLoading ? 'Creating your shop…' : error ? 'Try again' : 'Create my shop'}
              </button>
            )} />
            {isLoading && (
              <Hint className="mt-2 text-right" role="status">
                Setting up {businessName.trim()} on the {activePlan?.label} trial. This takes a few seconds.
              </Hint>
            )}
          </>
        )}
      </form>
    </SetupFrame>
  );
};

export default TenantSetup;
