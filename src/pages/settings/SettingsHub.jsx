import React, { useState } from 'react';
import {
  User, Building, Printer, Users as UsersIcon, CreditCard,
  LifeBuoy, ChevronRight, CheckCircle2, ScanBarcode, ReceiptText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { supabase } from '../../lib/supabase';
import { PLANS } from '../../lib/tenancy';
import Settings from '../Settings';
import Users from '../Users';

// Settings hub — myBillBook-style left rail with focused panels.
// Business/Invoice/Data reuse the existing Settings page; Users reuses the
// existing Users page; Account / Print / Pricing / Support are panels here.

const NAV = [
  { id: 'account',  label: 'Account',            icon: <User size={16} /> },
  { id: 'business', label: 'Manage Business',    icon: <Building size={16} /> },
  { id: 'print',    label: 'Print Settings',     icon: <Printer size={16} /> },
  { id: 'users',    label: 'Manage Users',       icon: <UsersIcon size={16} /> },
  { id: 'pricing',  label: 'Pricing & Plan',     icon: <CreditCard size={16} /> },
  { id: 'support',  label: 'Help & Support',     icon: <LifeBuoy size={16} /> },
];

// ── Account ──────────────────────────────────────────────────────────────────
const AccountPanel = () => {
  const { currentUser, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    setMsg('');
    if (pw.length < 8) { setMsg('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setMsg('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    setMsg(error ? error.message : '✓ Password updated.');
    if (!error) { setPw(''); setPw2(''); }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5">
        <div className="text-[10px] font-black uppercase tracking-wider text-ink-tertiary mb-3">Profile</div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent-signature/15 flex items-center justify-center text-accent-signature font-black text-lg">
            {(currentUser?.name || currentUser?.email || 'U')[0].toUpperCase()}
          </div>
          <div>
            <div className="text-[14px] font-bold text-ink-primary">{currentUser?.name || '—'}</div>
            <div className="text-[12px] text-ink-tertiary">{currentUser?.email}</div>
            <div className="text-[10px] font-mono text-ink-tertiary mt-0.5">
              {(currentUser?.roles || []).join(' · ')}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5">
        <div className="text-[10px] font-black uppercase tracking-wider text-ink-tertiary mb-3">Change password</div>
        <div className="space-y-3">
          <input type="password" placeholder="New password (min 8 chars)" value={pw}
            onChange={e => setPw(e.target.value)}
            className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent-signature" />
          <input type="password" placeholder="Confirm new password" value={pw2}
            onChange={e => setPw2(e.target.value)}
            className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent-signature" />
          {msg && <div className="text-[12px] font-semibold text-ink-secondary">{msg}</div>}
          <button onClick={changePassword} disabled={busy}
            className="px-4 py-2 rounded-lg bg-ink-primary text-white text-[12px] font-black disabled:opacity-50">
            {busy ? 'Saving…' : 'Update Password'}
          </button>
        </div>
      </div>

      <button onClick={logout}
        className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-[12px] font-black hover:bg-red-50">
        Log out
      </button>
    </div>
  );
};

// ── Print settings ───────────────────────────────────────────────────────────
const PrintPanel = ({ tenantId }) => {
  const key = `print_settings_${tenantId || 'default'}`;
  const [prefs, setPrefs] = useState(() => {
    try { return { paper: '80', copies: 1, autoPrint: false, ...(JSON.parse(localStorage.getItem(key)) || {}) }; }
    catch { return { paper: '80', copies: 1, autoPrint: false }; }
  });
  const [saved, setSaved] = useState(false);
  const save = () => {
    localStorage.setItem(key, JSON.stringify(prefs));
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-ink-tertiary mb-3">
          <ReceiptText size={13} /> Receipt / thermal printer
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-ink-secondary mb-1.5">Paper width</label>
            <div className="flex gap-2">
              {[['58', '58mm (2-inch)'], ['80', '80mm (3-inch)'], ['A4', 'A4 sheet']].map(([v, l]) => (
                <button key={v} onClick={() => setPrefs({ ...prefs, paper: v })}
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-bold border ${prefs.paper === v ? 'bg-accent-signature text-white border-accent-signature' : 'border-black/10 text-ink-secondary hover:bg-surface'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-ink-secondary mb-1.5">Copies per receipt</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setPrefs({ ...prefs, copies: Math.max(1, prefs.copies - 1) })}
                className="w-8 h-8 rounded-lg border border-black/10 font-bold hover:bg-surface">−</button>
              <span className="w-8 text-center font-mono font-bold text-[14px]">{prefs.copies}</span>
              <button onClick={() => setPrefs({ ...prefs, copies: Math.min(3, prefs.copies + 1) })}
                className="w-8 h-8 rounded-lg border border-black/10 font-bold hover:bg-surface">+</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-secondary cursor-pointer">
            <input type="checkbox" checked={prefs.autoPrint}
              onChange={e => setPrefs({ ...prefs, autoPrint: e.target.checked })}
              className="accent-[#D97706]" />
            Auto-open print dialog after each sale
          </label>
          <button onClick={save}
            className="px-4 py-2 rounded-lg bg-ink-primary text-white text-[12px] font-black">
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-ink-tertiary mb-2">
          <ScanBarcode size={13} /> Barcode label printing
        </div>
        <p className="text-[12px] text-ink-tertiary mb-3">
          Label templates, per-field font sizes and bulk barcode generation live in the Labels tool.
        </p>
        <a href="labels"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-accent-signature/40 text-accent-signature text-[12px] font-black hover:bg-accent-signature/10">
          Open Labels <ChevronRight size={13} />
        </a>
      </div>
    </div>
  );
};

// ── Pricing ──────────────────────────────────────────────────────────────────
const PricingPanel = () => {
  const { currentTenant } = useTenant();
  const plan = currentTenant?.plan || 'STARTER';
  const trialEnd = currentTenant?.trial_end_date ? new Date(currentTenant.trial_end_date) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000)) : null;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="bg-white rounded-xl border border-black/5 shadow-sm p-5 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-ink-tertiary">Current plan</div>
          <div className="text-xl font-black text-ink-primary mt-1">{plan}</div>
          {currentTenant?.status === 'TRIAL' && daysLeft != null && (
            <div className="text-[12px] font-semibold text-accent-signature mt-0.5">
              Free trial · {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining
            </div>
          )}
        </div>
        <CheckCircle2 className="text-accent-signature" size={28} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {Object.entries(PLANS).map(([id, p]) => (
          <div key={id}
            className={`bg-white rounded-xl border p-5 ${id === plan ? 'border-accent-signature shadow-md' : 'border-black/5 shadow-sm'}`}>
            <div className="text-[11px] font-black uppercase tracking-wide text-ink-primary">{p.label}</div>
            <div className="text-lg font-black text-accent-signature my-1">{p.price}</div>
            <ul className="text-[11px] text-ink-secondary space-y-1 mt-2">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={11} className="text-accent-signature shrink-0" />
                {(p.modules || []).length} modules
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={11} className="text-accent-signature shrink-0" />
                {p.maxUsers === -1 ? 'Unlimited users' : `${p.maxUsers} users`}
              </li>
              {(p.features || []).slice(0, 4).map(f => (
                <li key={f} className="flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-accent-signature shrink-0" />
                  {String(f).replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
            {id === plan && (
              <div className="mt-3 text-[10px] font-black text-accent-signature uppercase">Active</div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[12px] text-ink-tertiary">
        To upgrade or change plans, contact us — online payments are coming soon.
      </p>
    </div>
  );
};

// ── Support ──────────────────────────────────────────────────────────────────
const SupportPanel = () => (
  <div className="max-w-lg space-y-4">
    {[
      ['Email support', 'support@ledgrpro.co', 'mailto:support@ledgrpro.co'],
      ['WhatsApp', 'Chat with us', 'https://wa.me/919778707474'],
      ['Report a bug', 'Use the Report Issue button at the bottom-right of any page', null],
    ].map(([t, sub, href]) => (
      <div key={t} className="bg-white rounded-xl border border-black/5 shadow-sm p-5 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-bold text-ink-primary">{t}</div>
          <div className="text-[12px] text-ink-tertiary">{sub}</div>
        </div>
        {href && (
          <a href={href} target="_blank" rel="noreferrer"
            className="px-3.5 py-2 rounded-lg border border-accent-signature/40 text-accent-signature text-[12px] font-black hover:bg-accent-signature/10">
            Open
          </a>
        )}
      </div>
    ))}
  </div>
);

// ── Hub ──────────────────────────────────────────────────────────────────────
const SettingsHub = () => {
  const { currentTenantId } = useTenant();
  const [active, setActive] = useState('account');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-black text-ink-primary mb-5">Settings</h1>
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left rail */}
        <div className="lg:w-60 shrink-0">
          <div className="bg-white rounded-xl border border-black/5 shadow-sm p-2 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
            {NAV.map(n => (
              <button key={n.id} onClick={() => setActive(n.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-bold whitespace-nowrap transition-all w-full text-left ${
                  active === n.id
                    ? 'bg-accent-signature/10 text-accent-signature'
                    : 'text-ink-secondary hover:bg-surface'
                }`}>
                {n.icon} {n.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel */}
        <div className="flex-1 min-w-0">
          {active === 'account'  && <AccountPanel />}
          {active === 'business' && <Settings embedded />}
          {active === 'print'    && <PrintPanel tenantId={currentTenantId} />}
          {active === 'users'    && <Users embedded />}
          {active === 'pricing'  && <PricingPanel />}
          {active === 'support'  && <SupportPanel />}
        </div>
      </div>
    </div>
  );
};

export default SettingsHub;
