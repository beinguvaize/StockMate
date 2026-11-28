import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronRight, LayoutGrid, Package, FileText, Users, Store, ShoppingCart,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { ONBOARD_STEPS, planLabel, rowState, welcomeIncludes } from '../lib/setupFlow';
import { SetupFrame, StepBar, StepQ, StepNav, navBtn } from '../components/auth/SetupParts';
import { AuthMark, Hint } from '../components/auth/AuthParts';

/**
 * After the shop is created (approved setup-09 to 13): a welcome card with
 * what the plan includes, then four first-day tasks. Nothing here writes
 * anything; each task opens the page where it is done.
 */

const STEP_ICON = { profile: Store, product: Package, client: Users, sale: ShoppingCart };

// Quick action cards shown from the first task on.
const QUICK_ACTIONS = [
  { label: 'Dashboard',      Icon: LayoutGrid, path: 'dashboard' },
  { label: 'Add product',    Icon: Package,    path: 'inventory' },
  { label: 'Create invoice', Icon: FileText,   path: 'sales' },
  { label: 'Add client',     Icon: Users,      path: 'clients' },
];

const PILL = {
  done:    ['bg-good-soft text-good-text', 'Done'],
  now:     ['bg-amber-soft text-amber-text', 'Now'],
  next:    ['bg-well text-body', 'Next'],
  skipped: ['bg-well text-body', 'Skipped'],
};

const Onboarding = () => {
  const { currentTenant } = useTenant();
  const { logout } = useAuth();
  const navigate = useNavigate();
  // 0 is the welcome card; 1 to 4 are the tasks.
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(new Set());

  const plan = currentTenant?.plan || 'FREE';
  const includes = welcomeIncludes(plan);
  const label = planLabel(plan === 'STARTER' ? 'GROWTH' : plan);
  const total = ONBOARD_STEPS.length;
  const isLastStep = currentStep === total;
  const task = ONBOARD_STEPS[currentStep - 1];

  const markDone = () => {
    if (currentStep > 0) setCompleted(prev => new Set([...prev, task.id]));
    if (!isLastStep) setCurrentStep(s => s + 1);
  };

  const goToDashboard = () => navigate(`/dashboard`);

  const skipLink = (text) => (
    <p className="mt-5 text-center">
      <button type="button" onClick={goToDashboard} className="font-tight text-[13px] font-semibold text-body hover:text-ink">{text}</button>
    </p>
  );

  return (
    <SetupFrame onSignOut={() => logout()}>
      {currentStep === 0 ? (
        // setup-09
        <div className="m-rise">
          <AuthMark tone="gr"><Check size={24} aria-hidden="true" /></AuthMark>
          <StepQ className="mt-0" title={`Welcome, ${currentTenant?.name || 'to bookledger'}`}
            sub={`Your ${label} plan trial has started: 60 days free, no card needed. Four short steps get the shop ready to bill.`} />
          <section className="overflow-hidden rounded-[14px] border border-line bg-white">
            <div className="border-b border-sep px-5 pb-3.5 pt-4">
              <h4 className="font-tight text-[15px] font-semibold text-ink">What is included</h4>
              <p className="mt-0.5 text-[13px] text-body">
                {label} plan{currentTenant?.trial_end_date ? ` · trial ends ${formatDate(currentTenant.trial_end_date)}` : ''}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="grid gap-x-[18px] gap-y-1.5 text-[13.5px] text-ink-2 sm:grid-cols-2">
                {includes.items.map((f) => (
                  <span key={f} className="flex items-center gap-2"><Check size={14} strokeWidth={2.4} className="shrink-0 text-good-text" aria-hidden="true" />{f}</span>
                ))}
              </div>
              {includes.more && (
                <Hint className="mt-3">
                  {includes.more}{' '}
                  <button type="button" onClick={() => navigate('/settings?tab=pricing')}
                    className="font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">Compare plans</button>
                </Hint>
              )}
            </div>
          </section>
          <StepNav right={<button type="button" onClick={markDone} className={navBtn('pri')}>Get started</button>} />
          {skipLink('Skip, go to the Dashboard')}
        </div>
      ) : (
        // setup-10 to 13
        <>
          <StepBar step={currentStep} total={total} names={['Profile', 'Product', 'Client', 'Sale']} />
          <div key={currentStep} className="m-rise">
            <StepQ title={task.q} sub={task.qs} />
            <div className="overflow-hidden rounded-[14px] border border-line">
              {ONBOARD_STEPS.map((s, i) => {
                const st = rowState(i, currentStep - 1, completed, s.id);
                const I = st === 'done' ? Check : STEP_ICON[s.id];
                const [pillCls, pillText] = PILL[st];
                return (
                  <div key={s.id} className="flex items-center gap-3 border-t border-sep px-4 py-3.5 first:border-t-0">
                    <span className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]',
                      st === 'done' ? 'bg-good-soft text-good-text' : st === 'now' ? 'bg-ink text-white' : 'bg-tile text-ink-2')}>
                      <I size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block font-tight text-[13.5px] font-semibold text-ink">{s.title}</b>
                      <small className="block text-[12px] text-mute">{s.small}</small>
                    </div>
                    <span className={cn('whitespace-nowrap rounded-pill px-[9px] py-[3px] font-tight text-[11.5px] font-semibold', pillCls)}>{pillText}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3.5">
              <button type="button" onClick={() => navigate(task.id === 'profile' ? '/settings?tab=business' : task.path)}
                className="m-press inline-flex h-10 items-center gap-[7px] rounded-pill bg-white px-[18px] font-tight text-[13.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
                {task.go}<ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>

            {isLastStep ? (
              <StepNav
                left={<button type="button" onClick={() => setCurrentStep(s => s - 1)} className={navBtn('sec')}>Back</button>}
                right={<button type="button" onClick={goToDashboard} className={navBtn('pri')}>Go to the Dashboard</button>} />
            ) : (
              <StepNav
                left={<button type="button" onClick={() => setCurrentStep(s => s + 1)} className={navBtn('sec')}>Skip</button>}
                right={<button type="button" onClick={markDone} className={navBtn('pri')}>Done, next step</button>} />
            )}
          </div>

          <div className="mb-1.5 mt-[22px] font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Quick access</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {QUICK_ACTIONS.map(({ label: l, Icon: QI, path }) => (
              <button key={l} type="button" data-card onClick={() => navigate(`/${path}`)}
                className="m-press flex flex-col items-start gap-2 rounded-xl border border-line p-3.5 text-left font-tight text-[13px] font-semibold text-ink hover:bg-tile">
                <QI size={18} className="text-ink-2" aria-hidden="true" />{l}
              </button>
            ))}
          </div>
          {skipLink('Skip setup, go to the Dashboard')}
        </>
      )}
    </SetupFrame>
  );
};

export default Onboarding;
