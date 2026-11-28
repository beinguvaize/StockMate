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

// initialTab: /users opens the hub on Users & roles, so that page sits in
// the rail as drawn (users-01 to 08).
export default function SettingsHub({ initialTab } = {}) {
  const { hasPermission } = useAuth();
  const [active, setActive] = useState(() => (PANEL_IDS.has(initialTab) ? initialTab
    : tabFromSearch(typeof window !== 'undefined' ? window.location.search : '')));
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
            : active === 'users' ? <Users />
            : Panel ? <Panel key={active} /> : null}
        </div>
      </div>
    </div>
  );
}
