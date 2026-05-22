import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import {
  CheckCircle2, ArrowRight, Package, Users, ShoppingCart,
  FileText, Building2, Zap, Star, Shield, ChevronRight,
  BarChart3, Wallet, BookOpen, Calendar
} from 'lucide-react';

// Steps for new Starter users
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to StockMate!',
    subtitle: 'Your 60-day free trial has started.',
  },
  {
    id: 'profile',
    title: 'Set up your business profile',
    subtitle: 'Add GST number, address, and logo for professional invoices.',
  },
  {
    id: 'product',
    title: 'Add your first product',
    subtitle: 'Start tracking your inventory.',
  },
  {
    id: 'client',
    title: 'Add your first client',
    subtitle: 'Save a customer for fast billing.',
  },
  {
    id: 'sale',
    title: 'Make your first sale',
    subtitle: 'Create an invoice or a POS sale.',
  },
];

const PLAN_FEATURES = {
  STARTER: {
    label: 'Starter',
    color: 'text-accent-signature',
    included: [
      { icon: <BarChart3 size={14} />, label: 'Dashboard & Analytics' },
      { icon: <Package size={14} />, label: 'Inventory Management' },
      { icon: <ShoppingCart size={14} />, label: 'Sales & Mobile POS' },
      { icon: <FileText size={14} />, label: 'GST Invoices' },
      { icon: <Users size={14} />, label: 'Client Management' },
      { icon: <Wallet size={14} />, label: 'Expense Tracking' },
      { icon: <BookOpen size={14} />, label: 'Day Book' },
      { icon: <Calendar size={14} />, label: '500 invoices/month' },
    ],
    locked: ['Purchases & Suppliers', 'Delivery Routes', 'Payroll', 'GSTR Export', 'Reports'],
    upgrade: 'PRO',
  },
  PRO: {
    label: 'Professional',
    color: 'text-blue-500',
    included: [
      { icon: <Package size={14} />, label: 'Everything in Starter' },
      { icon: <ShoppingCart size={14} />, label: 'Purchases & Suppliers' },
      { icon: <FileText size={14} />, label: 'GSTR-1 & GSTR-3B Export' },
      { icon: <BarChart3 size={14} />, label: 'Full Reports Suite' },
      { icon: <Calendar size={14} />, label: 'Payroll Management' },
      { icon: <Star size={14} />, label: 'Price Lists & WAC Costing' },
    ],
    locked: ['Multi-Location Inventory', 'White Label', 'API Access'],
    upgrade: 'ENTERPRISE',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    color: 'text-purple-500',
    included: [
      { icon: <Shield size={14} />, label: 'Everything in Pro' },
      { icon: <Package size={14} />, label: 'Multi-Location Inventory' },
      { icon: <Users size={14} />, label: 'Full User Management' },
      { icon: <FileText size={14} />, label: 'Audit Log' },
      { icon: <Zap size={14} />, label: 'API Access & White Label' },
    ],
    locked: [],
    upgrade: null,
  },
};

// Quick action cards shown at the end
const QUICK_ACTIONS = [
  { label: 'Go to Dashboard', icon: <BarChart3 size={18} />, path: 'dashboard', color: 'bg-ink-primary text-white' },
  { label: 'Add Product', icon: <Package size={18} />, path: 'inventory', color: 'bg-white border border-black/8 text-ink-primary' },
  { label: 'Create Invoice', icon: <FileText size={18} />, path: 'sales', color: 'bg-white border border-black/8 text-ink-primary' },
  { label: 'Add Client', icon: <Users size={18} />, path: 'clients', color: 'bg-white border border-black/8 text-ink-primary' },
];

const Onboarding = () => {
  const { tenantSlug } = useParams();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(new Set());

  const plan = currentTenant?.plan || 'STARTER';
  const planInfo = PLAN_FEATURES[plan] || PLAN_FEATURES.STARTER;
  const slug = tenantSlug || currentTenant?.slug;
  const isLastStep = currentStep === STEPS.length - 1;

  const markDone = () => {
    setCompleted(prev => new Set([...prev, STEPS[currentStep].id]));
    if (!isLastStep) {
      setCurrentStep(s => s + 1);
    }
  };

  const goToDashboard = () => navigate(`/${slug}/dashboard`);

  return (
    <div className="min-h-screen bg-canvas font-inter flex flex-col items-center justify-start py-12 px-4">

      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-signature flex items-center justify-center">
              <Building2 size={18} className="text-black" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Workspace Ready</div>
              <div className="text-sm font-black text-ink-primary">{currentTenant?.name || 'Your Business'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
            <Calendar size={11} className="text-amber-600" />
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">60-day trial active</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center gap-1">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.id}>
              <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 text-[10px] font-black transition-all ${
                completed.has(step.id)
                  ? 'bg-accent-signature border-accent-signature text-black'
                  : i === currentStep
                  ? 'border-ink-primary bg-ink-primary text-white'
                  : 'border-black/10 bg-white text-gray-400'
              }`}>
                {completed.has(step.id) ? <CheckCircle2 size={12} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 transition-all ${completed.has(step.id) ? 'bg-accent-signature' : 'bg-black/5'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {STEPS.map((step, i) => (
            <span key={step.id} className={`text-[8px] font-black uppercase tracking-widest ${i === currentStep ? 'text-ink-primary' : 'text-gray-400'}`}>
              {step.title.split(' ')[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="w-full max-w-2xl">

        {/* Step 0: Welcome + plan features */}
        {currentStep === 0 && (
          <div className="bg-white border border-black/5 rounded-3xl shadow-premium p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-accent-signature rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(200,241,53,0.4)]">
                <Zap size={28} className="text-black" />
              </div>
              <h1 className="text-2xl font-black text-ink-primary tracking-tight mb-2">
                Welcome, {currentTenant?.name || 'to StockMate'}!
              </h1>
              <p className="text-[12px] text-gray-500 font-medium">
                Your <span className={`font-black ${planInfo.color}`}>{planInfo.label} plan</span> is active.
                60 days free, no credit card needed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* What's included */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">What's included</div>
                <ul className="space-y-2">
                  {planInfo.included.map((f, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-[11px] font-semibold text-ink-primary">
                      <span className="text-accent-signature">{f.icon}</span>
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Locked / upgrade */}
              {planInfo.locked.length > 0 && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Unlock with upgrade</div>
                  <ul className="space-y-2 mb-4">
                    {planInfo.locked.map((f, i) => (
                      <li key={i} className="flex items-center gap-2.5 text-[11px] font-semibold text-gray-400">
                        <span className="w-3.5 h-3.5 rounded border border-black/10 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {planInfo.upgrade && (
                    <button className="text-[10px] font-black text-blue-500 hover:underline uppercase tracking-widest">
                      Upgrade to {planInfo.upgrade} →
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={markDone}
              className="w-full flex items-center justify-center gap-2 py-4 bg-ink-primary text-white rounded-2xl text-[12px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
            >
              Get Started <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Steps 1-3: Action steps */}
        {currentStep > 0 && currentStep < STEPS.length && (
          <div className="bg-white border border-black/5 rounded-3xl shadow-premium p-8">
            <div className="mb-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Step {currentStep} of {STEPS.length - 1}
              </div>
              <h2 className="text-xl font-black text-ink-primary tracking-tight">{STEPS[currentStep].title}</h2>
              <p className="text-[12px] text-gray-500 font-medium mt-1">{STEPS[currentStep].subtitle}</p>
            </div>

            {/* Step-specific content */}
            {STEPS[currentStep].id === 'profile' && (
              <div className="space-y-3 mb-6">
                <p className="text-[12px] text-gray-600 font-medium">
                  Go to <strong>Settings → Business Profile</strong> to add your GST number, address, and upload your logo. This information appears on all your invoices.
                </p>
                <button
                  onClick={() => navigate(`/${slug}/settings`)}
                  className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 shadow-sm rounded-xl text-[12px] font-black text-ink-primary hover:bg-white hover:shadow-sm transition-all"
                >
                  Open Settings <ChevronRight size={14} />
                </button>
              </div>
            )}

            {STEPS[currentStep].id === 'product' && (
              <div className="space-y-3 mb-6">
                <p className="text-[12px] text-gray-600 font-medium">
                  Add products to your inventory. Include HSN code and GST tax rate for accurate billing.
                </p>
                <button
                  onClick={() => navigate(`/${slug}/inventory`)}
                  className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 shadow-sm rounded-xl text-[12px] font-black text-ink-primary hover:bg-white hover:shadow-sm transition-all"
                >
                  Go to Inventory <ChevronRight size={14} />
                </button>
              </div>
            )}

            {STEPS[currentStep].id === 'client' && (
              <div className="space-y-3 mb-6">
                <p className="text-[12px] text-gray-600 font-medium">
                  Add a client with their GSTIN for B2B billing. Walk-in customers don't need registration.
                </p>
                <button
                  onClick={() => navigate(`/${slug}/clients`)}
                  className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 shadow-sm rounded-xl text-[12px] font-black text-ink-primary hover:bg-white hover:shadow-sm transition-all"
                >
                  Go to Clients <ChevronRight size={14} />
                </button>
              </div>
            )}

            {STEPS[currentStep].id === 'sale' && (
              <div className="space-y-3 mb-6">
                <p className="text-[12px] text-gray-600 font-medium">
                  Create your first sale. Use the <strong>Invoice Builder</strong> for formal GST invoices or <strong>POS</strong> for quick counter sales.
                </p>
                <button
                  onClick={() => navigate(`/${slug}/sales`)}
                  className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 shadow-sm rounded-xl text-[12px] font-black text-ink-primary hover:bg-white hover:shadow-sm transition-all"
                >
                  Go to Sales <ChevronRight size={14} />
                </button>
              </div>
            )}

            <div className="flex gap-3">
              {isLastStep ? (
                <button
                  onClick={goToDashboard}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-accent-signature text-black rounded-2xl text-[12px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                >
                  Go to Dashboard <ArrowRight size={14} />
                </button>
              ) : (
                <>
                  <button
                    onClick={markDone}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-ink-primary text-white rounded-2xl text-[12px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                  >
                    Done <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentStep(s => s + 1)}
                    className="px-6 py-4 border border-black/8 rounded-2xl text-[12px] font-black text-gray-500 hover:text-ink-primary hover:bg-canvas transition-all"
                  >
                    Skip
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Quick actions at bottom (always visible from step 1+) */}
        {currentStep > 0 && (
          <div className="mt-6">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Quick access</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => navigate(`/${slug}/${action.path}`)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center ${action.color}`}
                >
                  {action.icon}
                  <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skip onboarding link */}
        <div className="text-center mt-6">
          <button
            onClick={goToDashboard}
            className="text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors"
          >
            Skip onboarding → Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
