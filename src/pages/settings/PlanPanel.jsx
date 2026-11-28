import React, { useState } from 'react';
import { Check, Mail } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PLANS } from '../../lib/tenancy';
import { Button } from '../../components/ui/button';
import { PanelHead, Stack, SCard, FormRow, Pill } from './parts';
import UpgradeDialog from './UpgradeDialog';
import { trialDaysLeft } from './lib/settingsLib';
import { cn } from '../../lib/utils';

/**
 * Plan & billing (approved settings-11): the plan, the trial, logins used
 * against the plan's limit (read only, the count usePlanLimits already
 * makes), and what each plan includes.
 */

export const FEATURE_LABELS = {
  gstr_export: 'GSTR export', offline_30_days: '30 days offline', price_lists: 'Price lists', wac_costing: 'WAC costing',
  multi_location_inventory: 'Multi-location stock', api_access: 'API access', white_label: 'White label', priority_support: 'Priority support',
};
const featureText = (f) => FEATURE_LABELS[f] || String(f).replaceAll('_', ' ');

export function planLines(p) {
  const lines = [`${(p.modules || []).length} modules`, p.maxUsers === -1 ? 'Unlimited users' : p.maxUsers === 1 ? '1 user' : `Up to ${p.maxUsers} users`];
  if (p.maxInvoices > 0) lines.push(`${p.maxInvoices.toLocaleString('en-IN')} invoices a month`);
  return [...lines, ...(p.features || []).slice(0, 4).map(featureText)];
}

const splitPrice = (price = '') => {
  const [amt, per] = String(price).split('/');
  return { amt, per: per === 'yr' ? '/ year' : per ? `/ ${per}` : '' };
};

export default function PlanPanel() {
  const { currentTenant } = useTenant();
  const { userCount, maxUsers, loading } = usePlanLimits();
  const [upgrade, setUpgrade] = useState(false);
  const plan = currentTenant?.plan || 'STARTER';
  const daysLeft = trialDaysLeft(currentTenant?.trial_end_date);
  const pct = maxUsers > 0 ? Math.min(100, Math.round((userCount / maxUsers) * 100)) : null;

  return (
    <div>
      <PanelHead title="Plan & billing" sub="Your plan, the trial, and what each plan includes." />
      <Stack>
        <SCard title="Current plan" sub="What this shop has, and how long the trial runs."
          footer={<Button variant="outline" size="sm" onClick={() => setUpgrade(true)}><Mail aria-hidden="true" />Contact us</Button>}>
          <FormRow label="Plan" text>
            <span className="inline-flex flex-wrap items-center gap-2">
              <b className="font-tight text-[14px] font-semibold text-ink">{PLANS[plan]?.label || plan}</b>
              {currentTenant?.status === 'TRIAL' && daysLeft != null && (
                <Pill tone="a">Trial · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</Pill>
              )}
            </span>
          </FormRow>
          <FormRow label="Logins used" hint={maxUsers === -1 ? 'This plan has no login limit.' : maxUsers > 0 ? `This plan allows ${maxUsers} login${maxUsers === 1 ? '' : 's'}.` : undefined} text>
            {loading ? '—' : maxUsers > 0 ? (
              <>
                <span className="tabular-nums">{userCount} of {maxUsers}</span>
                <div className="mt-[7px] h-1.5 max-w-[380px] overflow-hidden rounded-pill bg-well" role="progressbar" aria-valuenow={userCount} aria-valuemin={0} aria-valuemax={maxUsers} aria-label="Logins used">
                  <i className={cn('block h-full rounded-pill', pct >= 80 ? 'bg-amber' : 'bg-ink-2')} style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : <span className="tabular-nums">{userCount}</span>}
          </FormRow>
          <FormRow label="Billing" hint="Online payments are coming soon." text>Contact us to upgrade or change plans.</FormRow>
        </SCard>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(PLANS).filter(([id, p]) => id !== 'STARTER' && p).map(([id, p]) => {
            const cur = id === plan;
            const { amt, per } = splitPrice(p.price);
            return (
              <section key={id} className={cn('rounded-[14px] bg-surface p-4', cur ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'border border-line')}>
                <div className="flex items-center justify-between font-tight text-[13px] font-semibold text-ink">
                  {p.label}{cur && <Pill tone="ink">Current</Pill>}
                </div>
                <div className="mb-2.5 mt-1.5 font-tight text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
                  {amt} {per && <small className="font-sans text-[12.5px] font-medium tracking-normal text-mute">{per}</small>}
                </div>
                <ul className="grid gap-1.5 text-[12.5px] text-ink-2">
                  {planLines(p).map((l) => (
                    <li key={l} className="flex items-start gap-[7px]"><Check size={13} className="mt-[3px] shrink-0 text-good-text" aria-hidden="true" />{l}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Stack>
      <UpgradeDialog open={upgrade} onClose={() => setUpgrade(false)} />
    </div>
  );
}
