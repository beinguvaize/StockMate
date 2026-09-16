import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Clock, AlertTriangle, X } from 'lucide-react';
import { PLANS } from '../lib/tenancy';

/**
 * What a tenant on trial needs to know, driven by the SAME source that decides
 * what they can reach (tenants.trial_end_date, via useTenant().trial).
 *
 * It has to be that source and not the subscriptions table, because the two
 * disagree: only four tenants have a subscription row, and Aisha Store's says
 * her trial expired in July while access is in fact still open. A banner
 * announcing one thing while the gate does another is worse than no banner.
 *
 * Access is never withdrawn without this having been on screen first -- that is
 * the whole reason grace exists, so the wording states the date and what
 * changes rather than only urging an upgrade.
 */
const COPY = {
  ENDING: (t) => ({
    tone: 'warn',
    title: `Your trial ends in ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'}.`,
    body: 'After that you move to the Free plan. Your data stays exactly as it is.',
    dismissible: true,
  }),
  GRACE: (t) => ({
    tone: 'urgent',
    title: t.graceLeft === 1
      ? 'Your trial has ended — full access stops tomorrow.'
      : `Your trial has ended — full access continues for ${t.graceLeft} more days.`,
    body: 'Choose a plan to keep it. Nothing is deleted either way; the Free plan keeps your data and reopens the basics.',
    dismissible: false,
  }),
  LAPSED: () => ({
    tone: 'urgent',
    title: 'Your trial has ended. You are on the Free plan.',
    body: 'Every record is still here. Choose a plan to reopen the rest.',
    dismissible: false,
  }),
};

/** Once a day is enough for a banner that is not yet urgent. */
const todayKey = () => `ledgr.trialBanner.${new Date().toISOString().slice(0, 10)}`;

const TrialBanner = ({ trial, planInEffect, basePath = '' }) => {
  const [hidden, setHidden] = useState(() => {
    try { return window.localStorage.getItem(todayKey()) === '1'; } catch { return false; }
  });

  if (!trial) return null;
  // A trial with weeks left is not news. Nothing shows until the last stretch.
  if (trial.kind === 'ACTIVE' && trial.daysLeft > 14) return null;

  const spec = (COPY[trial.kind] || COPY.ENDING)(trial);
  if (spec.dismissible && hidden) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(todayKey(), '1'); } catch { /* private mode */ }
    setHidden(true);
  };

  const urgent = spec.tone === 'urgent';
  const Icon = urgent ? AlertTriangle : Clock;
  const planLabel = PLANS[planInEffect]?.label || planInEffect;

  return (
    <div className={`rounded-xl px-4 py-3 mb-4 flex items-start gap-3 flex-wrap ${
      urgent ? 'bg-red-600 text-white' : 'bg-ink-primary text-white'}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-[220px]">
        <div className="text-[13px] font-bold">{spec.title}</div>
        <div className="text-[11.5px] opacity-90 mt-0.5">{spec.body}</div>
        {/* Name what they have now, so "keep it" means something concrete. */}
        {planInEffect && trial.kind !== 'LAPSED' && (
          <div className="text-[10.5px] opacity-70 mt-1">
            You currently have {planLabel} features.
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <NavLink to={`${basePath}/settings`}
          className="text-[12px] font-bold bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition-colors">
          See plans →
        </NavLink>
        {spec.dismissible && (
          <button onClick={dismiss} aria-label="Dismiss for today"
            className="p-1.5 rounded-lg hover:bg-white/15 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TrialBanner;
