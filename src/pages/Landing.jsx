/**
 * Landing — public marketing page shown to unauthenticated visitors at `/`.
 * Authenticated users are redirected straight to their dashboard.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, ShoppingCart, Package, BarChart3, Truck,
  Factory, FileCheck, Wifi, ShieldCheck, Smartphone, Monitor,
  Globe, Zap, MessageCircle, Mail,
} from 'lucide-react';

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Channels', href: '#channels' },
  { label: 'Pricing',  href: '#pricing'  },
  { label: 'FAQ',      href: '#faq'      },
];

const VALUE_PROPS = [
  {
    icon: ShoppingCart, color: '#10b981',
    title: 'Sell faster',
    body:  'POS keeps working offline and syncs when back online. Cashier never waits, customer never leaves.',
  },
  {
    icon: FileCheck, color: '#6366f1',
    title: 'GST-ready out of the box',
    body:  'Auto invoices with HSN/GST split, e-invoice ready. GSTR-1 + GSTR-3B exports straight from Reports.',
  },
  {
    icon: Globe, color: '#f59e0b',
    title: 'Web, Desktop & Android',
    body:  'Same account everywhere. Cashier on web, driver on mobile, owner on desktop — all in real time.',
  },
];

const FEATURES = [
  {
    icon: Package, title: 'FIFO inventory',
    body:  'Batch-level costing with auto-recompute on every purchase. Margin alerts when below cost or below floor.',
  },
  {
    icon: Truck, title: 'Van sales + routes',
    body:  'Driver picks load, runs route on the map, records sales offline, returns to depot — all auto-reconciled.',
  },
  {
    icon: Factory, title: 'Manufacturing BOM',
    body:  'Define recipes, run production orders, watch raw materials consume FIFO, cost rolls into finished goods.',
  },
  {
    icon: BarChart3, title: '28 premium reports',
    body:  'Sales, profit, inventory, GST, balance sheet, cash flow — all real-time with charts and CSV export.',
  },
  {
    icon: ShieldCheck, title: 'Multi-tenant & RBAC',
    body:  'Row-level security in Postgres. Owner, staff, sales, inventory, driver — granular permissions.',
  },
  {
    icon: Wifi, title: 'Offline-first',
    body:  'IndexedDB cache + outbox queue. Selling continues even when the internet drops. No lost sales.',
  },
];

const CHANNELS = [
  { icon: Monitor,    label: 'Web app',    body: 'Cashier, owner, accountant.' },
  { icon: Monitor,    label: 'Desktop',    body: 'Electron build for Mac + Windows. Auto-updates from GitHub.' },
  { icon: Smartphone, label: 'Mobile',     body: 'Android driver app — van sales, routes, fleet stock.' },
];

const TIERS = [
  {
    name: 'Trial', price: 'Free', period: 'for 3 months',
    desc: 'Everything in Pro. No credit card.',
    cta:  'Start free trial',
    features: [
      'All modules unlocked',
      'Up to 3 users',
      '1,000 transactions / month',
      'Email support',
    ],
    accent: false,
  },
  {
    name: 'Starter', price: '₹499', period: 'per month',
    desc: 'For single-shop retailers.',
    cta:  'Choose Starter',
    features: [
      'POS, inventory, billing',
      'Up to 5 users',
      'GST returns',
      '5,000 transactions / month',
      'Email + WhatsApp support',
    ],
    accent: false,
  },
  {
    name: 'Pro', price: '₹1,499', period: 'per month',
    desc: 'Distributors with vans + manufacturing.',
    cta:  'Choose Pro',
    features: [
      'Everything in Starter',
      'Unlimited users',
      'Van sales + routes',
      'Manufacturing BOM',
      'Multi-warehouse',
      'Priority support',
    ],
    accent: true,
  },
];

const FAQS = [
  {
    q: 'Is the 3-month trial really free?',
    a: 'Yes. No credit card. After 3 months you choose a plan or your data is archived (we never delete without 30 days notice).',
  },
  {
    q: 'Will it work on my old Windows laptop?',
    a: 'Web works on any modern browser. Desktop installer needs Windows 10+ or macOS 11+. Android app needs Android 8+.',
  },
  {
    q: 'Is my data safe?',
    a: 'Tenant-isolated Postgres with row-level security, daily automated backups, TLS in transit, encrypted at rest. You can export everything as CSV anytime.',
  },
  {
    q: 'Does it work without internet?',
    a: 'POS, sales and stock work fully offline. Changes queue locally and sync the moment connection returns.',
  },
  {
    q: 'GST returns supported?',
    a: 'GSTR-1, GSTR-3B exports. HSN summary. E-invoice ready (IRN/QR). Switch tax mode (inclusive/exclusive) per tenant.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Anytime. Upgrade or downgrade — your data carries over. Billed monthly with no lock-in.',
  },
];

const Landing = () => {
  const nav = useNavigate();
  const startTrial = () => nav('/welcome');
  const goLogin    = () => nav('/login');

  return (
    <div className="min-h-screen bg-canvas text-ink-primary font-inter">
      {/* ── Sticky nav ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-canvas/85 backdrop-blur-xl border-b border-black/5">
        <div className="max-w-7xl mx-auto flex items-center gap-6 px-5 py-3.5">
          <a href="/" className="flex items-center gap-2 font-black tracking-tight text-lg">
            <span className="inline-block w-7 h-7 rounded-lg bg-ink-primary text-white grid place-items-center text-[11px]">L</span>
            LedgrPro
          </a>
          <nav className="hidden md:flex items-center gap-6 ml-2">
            {NAV.map(n => (
              <a key={n.href} href={n.href}
                className="text-xs font-bold text-gray-500 hover:text-ink-primary transition-colors">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex-1" />
          <button onClick={goLogin} className="text-xs font-bold text-gray-500 hover:text-ink-primary px-3 py-2">
            Login
          </button>
          <button onClick={startTrial}
            className="text-xs font-black bg-ink-primary text-white px-4 py-2.5 rounded-xl shadow-md hover:scale-105 transition-all">
            Start free →
          </button>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-5 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-black uppercase tracking-widest mb-7">
          <Zap size={11} /> Free for the first 3 months
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.02] max-w-4xl mx-auto">
          Run your shop end-to-end<br />
          <span className="text-accent-signature">from one screen.</span>
        </h1>
        <p className="mt-7 text-base sm:text-lg text-gray-500 font-medium max-w-2xl mx-auto leading-relaxed">
          POS, inventory, GST billing, van sales, manufacturing & reports — built for Indian SMBs. Works offline. Web + Desktop + Android.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={startTrial}
            className="group flex items-center gap-2 px-7 py-4 rounded-2xl bg-ink-primary text-white text-sm font-black shadow-xl hover:scale-105 transition-all">
            Start your 3-month free trial
            <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={goLogin}
            className="px-7 py-4 rounded-2xl bg-white border border-black/10 text-sm font-black shadow-sm hover:border-black/30 transition-all">
            I already have an account
          </button>
        </div>

        {/* Trust strip */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Used by</span>
          <span className="text-gray-600">Future Dispo Industries</span>
          <span className="text-gray-600">Aisha Store</span>
          <span className="text-gray-600">Sunbook Stores</span>
          <span>+ more</span>
        </div>

        {/* Mock product screenshot tile */}
        <div className="mt-14 rounded-3xl border border-black/5 shadow-2xl overflow-hidden bg-gradient-to-br from-white to-canvas mx-auto max-w-5xl">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-black/5 bg-white">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 text-[10px] font-bold text-gray-400">ledgrpro.app/dashboard</span>
          </div>
          <div className="grid grid-cols-3 gap-4 p-8">
            {[
              { l: 'Today Sales',  v: '₹11,015', c: 'text-emerald-600' },
              { l: 'Outstanding',  v: '₹9,090',  c: 'text-red-500' },
              { l: 'Stock Value',  v: '₹1.2L',   c: 'text-indigo-600' },
            ].map(k => (
              <div key={k.l} className="rounded-2xl bg-white border border-black/5 p-5 text-left shadow-sm">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{k.l}</div>
                <div className={`mt-2 text-2xl font-black tabular-nums ${k.c}`}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value props ───────────────────────────────────────────── */}
      <section id="features" className="bg-white py-24 border-y border-black/5">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-[11px] font-black text-accent-signature uppercase tracking-widest mb-3">Why LedgrPro</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Built for how Indian shops actually run.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VALUE_PROPS.map(v => (
              <div key={v.title}
                className="bg-canvas/40 rounded-2xl border border-black/5 p-7 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: v.color + '18' }}>
                  <v.icon size={20} style={{ color: v.color }} />
                </div>
                <h3 className="text-lg font-black mb-2">{v.title}</h3>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature grid ──────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-[11px] font-black text-accent-signature uppercase tracking-widest mb-3">Everything you need</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">28 reports. 12 modules. One subscription.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.title}
                className="bg-white rounded-2xl border border-black/5 p-6 hover:border-black/15 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-ink-primary/5 flex items-center justify-center">
                    <f.icon size={16} className="text-ink-primary" />
                  </div>
                  <h3 className="font-black text-base">{f.title}</h3>
                </div>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Channels ──────────────────────────────────────────────── */}
      <section id="channels" className="bg-ink-primary text-white py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-[11px] font-black text-accent-signature uppercase tracking-widest mb-3">Where it runs</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">One account. Every device.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CHANNELS.map(c => (
              <div key={c.label} className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-7">
                <c.icon size={26} className="text-accent-signature mb-4" />
                <h3 className="font-black text-lg mb-1.5">{c.label}</h3>
                <p className="text-sm text-white/60 font-medium">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-[11px] font-black text-accent-signature uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Start free. Pay only when you grow.</h2>
            <p className="mt-3 text-sm text-gray-500 font-medium">No card. No lock-in. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {TIERS.map(t => (
              <div key={t.name}
                className={`rounded-3xl border p-7 transition-all ${
                  t.accent
                    ? 'bg-ink-primary text-white border-ink-primary shadow-2xl scale-[1.03]'
                    : 'bg-white border-black/5 shadow-sm hover:shadow-md'
                }`}>
                {t.accent && (
                  <div className="inline-block px-2.5 py-1 rounded-full bg-accent-signature text-button-text text-[9px] font-black uppercase tracking-widest mb-4">
                    Most popular
                  </div>
                )}
                <h3 className="font-black text-2xl mb-1">{t.name}</h3>
                <p className={`text-xs font-medium mb-6 ${t.accent ? 'text-white/60' : 'text-gray-500'}`}>{t.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-black tracking-tight">{t.price}</span>
                  {' '}
                  <span className={`text-xs font-bold ${t.accent ? 'text-white/60' : 'text-gray-400'}`}>{t.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {t.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm font-medium">
                      <Check size={14} className={`shrink-0 mt-0.5 ${t.accent ? 'text-accent-signature' : 'text-emerald-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={startTrial}
                  className={`w-full py-3 rounded-xl text-sm font-black transition-all ${
                    t.accent
                      ? 'bg-accent-signature text-button-text hover:scale-105'
                      : 'bg-ink-primary text-white hover:scale-105'
                  }`}>
                  {t.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="bg-white py-24 border-y border-black/5">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-12">
            <p className="text-[11px] font-black text-accent-signature uppercase tracking-widest mb-3">Questions</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Frequently asked.</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map(f => (
              <details key={f.q} className="group rounded-2xl border border-black/5 bg-canvas/30 p-5 hover:border-black/15 transition-all">
                <summary className="flex items-center justify-between cursor-pointer font-black text-sm list-none">
                  {f.q}
                  <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm text-gray-500 font-medium leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">Ready to run your shop better?</h2>
          <p className="mt-4 text-base text-gray-500 font-medium">3 months free. No card. Set up in under 10 minutes.</p>
          <button onClick={startTrial}
            className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-ink-primary text-white text-sm font-black shadow-xl hover:scale-105 transition-all">
            Start your free trial <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="bg-ink-primary text-white py-12">
        <div className="max-w-7xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 font-black tracking-tight text-lg">
            <span className="inline-block w-7 h-7 rounded-lg bg-white text-ink-primary grid place-items-center text-[11px]">L</span>
            LedgrPro
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-bold text-white/60">
            <a href="#features"  className="hover:text-white transition-colors">Features</a>
            <a href="#pricing"   className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq"       className="hover:text-white transition-colors">FAQ</a>
            <a href="/login"     className="hover:text-white transition-colors">Login</a>
            <a href="mailto:support@ledgrpro.in" className="hover:text-white transition-colors flex items-center gap-1.5">
              <Mail size={12} /> Support
            </a>
          </div>
          <div className="text-[11px] font-bold text-white/40">
            © 2026 LedgrPro
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
