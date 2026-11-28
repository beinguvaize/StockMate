import React from 'react';
import { Sparkles, Mail } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { PLANS } from '../../lib/tenancy';
import Dialog from '../../components/ui/Dialog';
import { buttonVariants, Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

/**
 * Upgrade your plan (approved settings-17). Upgrades are arranged with us;
 * "Contact sales" opens the same email the old upgrade box did.
 */
const priceText = (p = '') => String(p).replace('/yr', ' a year');

const OFFERS = [
  ['PRO', 'Multi-location stock, price lists, up to 5 users'],
  ['ENTERPRISE', 'Everything in Pro, API access, unlimited users'],
];

export default function UpgradeDialog({ open, onClose, reason = 'Pick the plan that fits' }) {
  const { currentTenant } = useTenant();
  return (
    <Dialog open={open} onClose={onClose} width={480} title="Upgrade your plan" subtitle={reason}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <a href={`mailto:pro@ledgr.pro?subject=Upgrade Request: ${currentTenant?.name || ''}`}
          className={cn(buttonVariants({ variant: 'default' }))}><Mail aria-hidden="true" />Contact sales</a>
      </>}>
      {OFFERS.map(([id, blurb]) => (
        <div key={id} className="flex items-center gap-3 border-t border-sep py-3 first:border-t-0">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-tile text-ink-2"><Sparkles size={16} aria-hidden="true" /></span>
          <div className="min-w-0">
            <b className="block font-tight text-[13.5px] font-semibold text-ink">{PLANS[id]?.label} · {priceText(PLANS[id]?.price)}</b>
            <small className="block text-[12px] text-mute">{blurb}</small>
          </div>
        </div>
      ))}
      <p className="mt-1.5 text-[12.5px] text-mute">Upgrades are done with us for now; online payment is coming.</p>
    </Dialog>
  );
}
