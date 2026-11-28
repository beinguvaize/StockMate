import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Store, LayoutGrid, Tag, MapPin, Printer, BellRing, Users as UsersIcon, CreditCard,
  RefreshCw, Database, KeyRound, LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Users from '../Users';
import AccountPanel from './AccountPanel';
import BusinessPanel from './BusinessPanel';
import ModulesPanel from './ModulesPanel';
import CategoriesPanel from './CategoriesPanel';
import LocationsPanel from './LocationsPanel';
import PrintPanel from './PrintPanel';
import RemindersPanel from './RemindersPanel';
import PlanPanel from './PlanPanel';
import DataPanel from './DataPanel';
import ApiPanel from './ApiPanel';
import { SupportPanel, NoSettingsAccess } from './SupportPanel';
import { cn } from '../../lib/utils';

/**
 * Settings hub (approved settings-01 to 19): a grouped rail on the left and
 * one panel at a time. ?tab=<id> opens a panel directly (the invoice page's
 * "Change" link uses ?tab=print).
 *
 * Business, Categories, Locations, Data tools and API need the Settings
 * permission, as they always have; the other panels do not.
 */

export const NAV_GROUPS = [
  { caption: 'General', items: [
    { id: 'account',  label: 'Account',  Icon: User },
    { id: 'business', label: 'Business', Icon: Store, perm: true },
    { id: 'modules',  label: 'Business type & modules', Icon: LayoutGrid },
  ]},
  { caption: 'Catalog', items: [
    { id: 'categories', label: 'Categories', Icon: Tag, perm: true },
    { id: 'locations',  label: 'Locations',  Icon: MapPin, perm: true },
  ]},
  { caption: 'Sales & printing', items: [
    { id: 'print',     label: 'Printing',          Icon: Printer },
    { id: 'reminders', label: 'Payment reminders', Icon: BellRing },
  ]},
  { caption: 'Team & billing', items: [
    { id: 'users',   label: 'Users & roles',  Icon: UsersIcon },
    { id: 'pricing', label: 'Plan & billing', Icon: CreditCard },
  ]},
  { caption: 'Advanced', items: [
    { id: 'data',    label: 'Data tools', Icon: RefreshCw, perm: true },
    { id: 'backup',  label: 'Backup & restore', Icon: Database, href: '/backup' },
    { id: 'api',     label: 'API', Icon: KeyRound, perm: true },
    { id: 'support', label: 'Help & support', Icon: LifeBuoy },
  ]},
];

const PANELS = {
  account: AccountPanel, business: BusinessPanel, modules: ModulesPanel,
  categories: CategoriesPanel, locations: LocationsPanel,
  print: PrintPanel, reminders: RemindersPanel,
  pricing: PlanPanel, data: DataPanel, api: ApiPanel, support: SupportPanel,
};

const NEEDS_PERMISSION = new Set(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.perm).map((i) => i.id));
const PANEL_IDS = new Set(NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.href).map((i) => i.id));

export const tabFromSearch = (search) => {
  try {
    const t = new URLSearchParams(search).get('tab');
    return PANEL_IDS.has(t) ? t : 'account';
  } catch { return 'account'; }
};

// Users & roles is its own page, embedded, with the same reskin as before
// until that page is redrawn.
const EMBED_SKIN_CSS = `
  .settings-embedded .glass-panel { background:#fff !important; border:1px solid #e5e7eb !important; border-radius:8px !important; box-shadow:none !important; }
  .settings-embedded [class*="shadow-"] { box-shadow:none !important; }
  .settings-embedded .bg-ink-primary { background:#f9fafb !important; border-bottom:1px solid #f3f4f6 !important; }
  .settings-embedded .bg-ink-primary h2, .settings-embedded .bg-ink-primary .text-surface,
  .settings-embedded .bg-ink-primary .text-white { color:#111827 !important; font-size:14px !important; font-weight:600 !important; }
  .settings-embedded .bg-ink-primary .text-accent-signature, .settings-embedded .bg-ink-primary svg { color:#6b7280 !important; }
  .settings-embedded .btn-signature, .settings-embedded button.bg-accent-signature, .settings-embedded a.bg-accent-signature {
    background:#111827 !important; color:#fff !important; border-radius:6px !important; box-shadow:none !important; }
  .settings-embedded .text-accent-signature { color:#374151 !important; }
  .settings-embedded .border-accent-signature { border-color:#d1d5db !important; }
  .settings-embedded h1, .settings-embedded h2 { font-size:14px !important; font-weight:600 !important; color:#111827 !important; letter-spacing:0 !important; font-family:inherit !important; }
  .settings-embedded h3, .settings-embedded h4 { font-size:13px !important; font-weight:600 !important; color:#111827 !important; letter-spacing:0 !important; }
  .settings-embedded label, .settings-embedded [class*="text-[9px]"], .settings-embedded [class*="text-[10px]"], .settings-embedded [class*="text-[11px]"] {
    font-size:12.5px !important; font-weight:500 !important; color:#6b7280 !important; letter-spacing:0 !important; text-transform:none !important; }
  .settings-embedded [class*="text-[12px]"], .settings-embedded .text-xs, .settings-embedded [class*="text-[13px]"], .settings-embedded .text-sm { font-size:13px !important; letter-spacing:0 !important; }
  .settings-embedded [class*="text-2xl"], .settings-embedded [class*="text-3xl"], .settings-embedded [class*="text-4xl"], .settings-embedded [class*="text-xl"] { font-size:15px !important; font-weight:600 !important; color:#111827 !important; }
  .settings-embedded [class*="font-black"] { font-weight:600 !important; }
  .settings-embedded [class*="uppercase"] { text-transform:none !important; letter-spacing:0 !important; }
  .settings-embedded [class*="tracking-"] { letter-spacing:0 !important; }
  .settings-embedded [class*="font-sora"] { font-family:inherit !important; }
  .settings-embedded input, .settings-embedded select, .settings-embedded textarea { border-radius:6px !important; border-color:#d1d5db !important; background:#fff !important; font-size:13px !important; color:#111827 !important; }
  .settings-embedded .rounded-pill, .settings-embedded [class*="rounded-2xl"], .settings-embedded [class*="rounded-xl"], .settings-embedded [class*="rounded-bento"] { border-radius:8px !important; }
  .settings-embedded .bg-canvas { background:#f9fafb !important; }
`;

export default function SettingsHub() {
  const { hasPermission } = useAuth();
  const [active, setActive] = useState(() => tabFromSearch(typeof window !== 'undefined' ? window.location.search : ''));
  const allowed = !NEEDS_PERMISSION.has(active) || hasPermission('MANAGE_SETTINGS');
  const Panel = PANELS[active];

  return (
    <div className="pb-16">
      <div className="grid items-start gap-6 lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings sections" className="no-scrollbar -mx-4 flex gap-px overflow-x-auto px-4 lg:sticky lg:top-0 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {NAV_GROUPS.map((g, gi) => (
            <div key={g.caption} className="flex gap-px lg:block">
              <div className={cn('hidden px-2.5 pb-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute lg:block', gi === 0 ? 'pt-0.5' : 'pt-3.5')}>
                {g.caption}
              </div>
              {g.items.map(({ id, label, Icon, href }) => {
                const on = active === id;
                const cls = cn('flex w-full items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-left font-tight text-[13.5px] transition-colors duration-(--dur-press)',
                  on ? 'bg-well font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-tile');
                const icon = <Icon size={16} strokeWidth={1.8} aria-hidden="true" className={cn('shrink-0', on ? 'text-amber' : 'text-mute')} />;
                return href
                  ? <Link key={id} to={href} className={cls}>{icon}{label}</Link>
                  : (
                    <button key={id} type="button" aria-current={on ? 'page' : undefined} onClick={() => setActive(id)} className={cls}>
                      {icon}{label}
                    </button>
                  );
              })}
            </div>
          ))}
        </nav>

        <div className="min-w-0 max-w-[820px]" data-testid="settings-panel">
          {!allowed ? <NoSettingsAccess />
            : active === 'users' ? <div className="settings-embedded"><style dangerouslySetInnerHTML={{ __html: EMBED_SKIN_CSS }} /><Users embedded /></div>
            : Panel ? <Panel key={active} /> : null}
        </div>
      </div>
    </div>
  );
}
