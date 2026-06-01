import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ThemePicker from '../components/ThemePicker';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../hooks/useFinance';
import { useInventory } from '../hooks/useInventory';
import { supabase } from '../lib/supabase';
import { goHref } from '../lib/nav';
import { hasFeature, PLANS } from '../lib/tenancy';
import {
  Settings as SettingsIcon, Building, Shield, Bell, Save,
  CheckCircle2, Lock, Globe, Coins, ShieldCheck,
  Database, RotateCcw, ChevronRight, Zap, Tag, Plus, Edit2, Trash2, X, FileUp, FileDown,
  Sparkles, Mail, Receipt, MapPin, Key, Copy, RefreshCw, AlertTriangle
} from 'lucide-react';

// ── Plan usage card (data injected from parent) ──

// ── Real plan usage via inline async state ──
const PlanUsageBanner = ({ plan = 'STARTER', invoiceCount = 0, userCount = 0, maxInvoices = 500, maxUsers = 2, onUpgrade }) => {
  if (maxInvoices === -1 && maxUsers === -1) return null; // unlimited — don't show
  const invPct  = maxInvoices !== -1 ? Math.min(100, Math.round((invoiceCount / maxInvoices) * 100)) : null;
  const usrPct  = maxUsers    !== -1 ? Math.min(100, Math.round((userCount    / maxUsers)    * 100)) : null;
  const isWarn  = (invPct ?? 0) >= 80 || (usrPct ?? 0) >= 80;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${isWarn ? 'bg-amber-50 border-amber-200' : 'bg-canvas border-black/5'}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Plan Usage — {plan}</p>
        {isWarn && <button onClick={onUpgrade} className="text-[10px] font-black text-amber-600 underline">Upgrade</button>}
      </div>
      {invPct !== null && (
        <div>
          <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
            <span>Invoices this month</span>
            <span>{invoiceCount} / {maxInvoices}</span>
          </div>
          <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${invPct >= 90 ? 'bg-rose-500' : invPct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${invPct}%` }} />
          </div>
        </div>
      )}
      {usrPct !== null && (
        <div>
          <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
            <span>Active users</span>
            <span>{userCount} / {maxUsers}</span>
          </div>
          <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${usrPct >= 90 ? 'bg-rose-500' : usrPct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${usrPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { currentUser, hasPermission, isOwner } = useAuth();
  const { 
    currentTenant, currentTenantId, businessProfile, 
    updateBusinessProfile, updateTenant 
  } = useTenant();
  const {
    expenseCategories, addExpenseCategory, updateExpenseCategory, deleteExpenseCategory
  } = useFinance(currentTenantId);
  const {
    productCategories, addProductCategory, updateProductCategory, deleteProductCategory,
    inventoryLocations, addLocation, updateLocation, deleteLocation,
  } = useInventory(currentTenantId);

  // Fallback for missing businessProfile during load
  const profile = businessProfile || {};

  const plan        = currentTenant?.plan || 'STARTER';
  const planMeta    = PLANS[plan] || PLANS.STARTER;
  const isEnterprise = plan === 'ENTERPRISE';
  const isPro        = plan === 'PRO' || isEnterprise;

  const {
    invoiceCount, userCount, maxInvoices, maxUsers,
  } = usePlanLimits();


 const [newCategory, setNewCategory] = useState('');
 const [editingCategory, setEditingCategory] = useState(null);
 const [editValue, setEditValue] = useState('');
 const [newProductCategory, setNewProductCategory] = useState('');
 const [editingProductCategory, setEditingProductCategory] = useState(null);
 const [editProductValue, setEditProductValue] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [workspaceSlug, setWorkspaceSlug] = useState(currentTenant?.slug || '');
  const [isUpdatingSlug, setIsUpdatingSlug] = useState(false);

  // ── Branches ──
  const [newLocName, setNewLocName]     = useState('');
  const [newLocAddr, setNewLocAddr]     = useState('');
  const [editingLoc, setEditingLoc]     = useState(null);
  const [locSaving, setLocSaving]       = useState(false);

  // ── API Keys ──
  const [apiKey, setApiKey]             = useState(currentTenant?.api_key || '');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  const generateApiKey = useCallback(async () => {
    if (!isEnterprise) return;
    setApiKeySaving(true);
    const newKey = `sk_live_${crypto.randomUUID().replace(/-/g, '')}`;
    const { error } = await supabase
      .from('tenants')
      .update({ api_key: newKey })
      .eq('id', currentTenantId);
    if (!error) {
      setApiKey(newKey);
      setApiKeyVisible(true);
    }
    setApiKeySaving(false);
  }, [isEnterprise, currentTenantId]);

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  };

  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    setLocSaving(true);
    await addLocation({ name: newLocName.trim(), address: newLocAddr.trim() });
    setNewLocName(''); setNewLocAddr('');
    setLocSaving(false);
  };

  const handleSaveEditLoc = async () => {
    if (!editingLoc) return;
    setLocSaving(true);
    await updateLocation(editingLoc);
    setEditingLoc(null);
    setLocSaving(false);
  };

  const handleDeleteLoc = async (id) => {
    if (!window.confirm('Delete this branch/location? Stock balances will be preserved.')) return;
    const { error } = await deleteLocation(id);
    if (error) alert(error.message);
  };

  const [profileData, setProfileData] = useState({
    name: profile.name || '',
    country: profile.country || '',
    currency: profile.currency || 'USD',
    currencySymbol: profile.currencySymbol || '$',
    lowStockThreshold: profile.lowStockThreshold || 20,
    pan_no: profile.pan_no || '',
    gst_no: profile.gst_no || '',
    tax_mode: profile.tax_mode || 'EXCLUSIVE',
    auto_irn_enabled: profile.auto_irn_enabled ?? false,
    bank_name: profile.bank_name || '',
    account_no: profile.account_no || '',
    ifsc_code: profile.ifsc_code || '',
    upi_id: profile.upi_id || '',
    email: profile.email || '',
    website: profile.website || '',
    phone: profile.phone || '',
    address: profile.address || ''
  });

 const [savedStatus, setSavedStatus] = useState(false);

  // ── Bill Settings ───────────────────────────────────────────────────────
  const DEFAULT_BILL_SETTINGS = {
    show_address:        true,
    show_phone:          true,
    show_gstin:          true,
    show_customer_name:  true,
    show_customer_gstin: true,
    show_tax_breakdown:  true,
    show_upi:            true,
    // Separate toggle for GST invoice — receipts and invoices can be
    // configured independently (e.g. show QR on slip, hide on tax bill).
    show_upi_invoice:    true,
    show_discount:       true,
    bill_title:          'TAX INVOICE',
    footer_message:      'Thank You for Your Business!',
  };
  const [billSettings, setBillSettings] = useState({
    ...DEFAULT_BILL_SETTINGS,
    ...(profile.bill_settings || {}),
  });
  const [billSavedStatus, setBillSavedStatus] = useState(false);

  const toggleBill = (key) => setBillSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSaveBillSettings = async () => {
    const { success, error } = await updateBusinessProfile({ bill_settings: billSettings });
    if (success) {
      setBillSavedStatus(true);
      setTimeout(() => setBillSavedStatus(false), 3000);
    } else {
      alert('Save failed: ' + (error?.message || 'Unknown error'));
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const { success, error } = await updateBusinessProfile(profileData);
      if (success) {
        setSavedStatus(true);
        setTimeout(() => setSavedStatus(false), 3000);
      } else {
        alert('Save failed: ' + (error?.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('handleSaveProfile threw:', err);
      alert('Save failed: ' + (err?.message || 'Unexpected error'));
    }
  };

 if (!hasPermission('MANAGE_SETTINGS')) {
 return (
 <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] p-5">
 <div className="glass-panel max-w-[500px] w-full text-center p-6 border-none">
 <div className="flex justify-center mb-8">
 <div className="bg-red-50 p-5 rounded-full text-red-500">
 <Lock size={64} strokeWidth={2.5} />
 </div>
 </div>
 <h2 className="text-4xl font-semibold text-[#111] mb-4">Access Denied</h2>
 <p className="text-sm font-bold text-[#747576] opacity-70 mb-10 leading-relaxed">
 Settings are restricted to Administrators.
 </p>
 <button className="btn-signature w-full h-16" onClick={() => window.history.back()}>
 GO BACK
 <div className="icon-nest">
 <ShieldCheck size={20} />
 </div>
 </button>
 </div>
 </div>
 );
}

 return (
 <div className="animate-fade-in flex flex-col gap-5 pb-12">
 {/* Header Section */}
 <div className="flex justify-between items-center py-2 border-b border-black/5">
 <div className="flex items-center gap-3">
 <h1 className="text-xl font-black font-sora text-ink-primary leading-none">Settings<span className="text-accent-signature">.</span></h1>
 <span className="text-[10px] font-semibold text-gray-400 hidden sm:block">System configuration & preferences</span>
 </div>
 {savedStatus && (
 <div className="bg-accent-signature/10 text-ink-primary px-4 py-1.5 rounded-lg text-[10px] font-semibold border border-accent-signature/20 flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
 <CheckCircle2 size={12} className="text-accent-signature" /> Saved
 </div>
 )}
 </div>

 {/* ── Sticky tab strip — scrolls to each section ── */}
 <div className="sticky top-2 z-30 bg-canvas/85 backdrop-blur-xl rounded-2xl border border-black/5 shadow-sm p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
   {[
     { id: 'tab-business',   label: 'Business',   icon: <Building   size={13} /> },
     { id: 'tab-workspace',  label: 'Workspace',  icon: <Zap        size={13} /> },
     { id: 'tab-categories', label: 'Categories', icon: <Tag        size={13} /> },
     { id: 'tab-locations',  label: 'Locations',  icon: <Database   size={13} /> },
     { id: 'tab-billing',    label: 'Bill Template', icon: <FileUp  size={13} /> },
     { id: 'tab-data',       label: 'Data Tools', icon: <RotateCcw  size={13} /> },
     { id: 'tab-api',        label: 'API',        icon: <ShieldCheck size={13} /> },
   ].map(t => (
     <button key={t.id} type="button"
       onClick={() => {
         const el = document.getElementById(t.id);
         if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
       }}
       className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-ink-primary hover:bg-white transition-all whitespace-nowrap">
       {t.icon}{t.label}
     </button>
   ))}
 </div>

 {/* Main Config Grid */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
 {/* Left Panel: Primary Identity */}
 <div className="md:col-span-2 flex flex-col gap-5">
 <div id="tab-business" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium">
 <div className="bg-ink-primary p-6 flex items-center gap-4">
 <Building size={20} className="text-accent-signature" />
 <h2 className="text-base font-bold font-semibold text-surface">Business Details</h2>
 </div>
 
 <div className="p-6 bg-surface">
 <form onSubmit={handleSaveProfile} className="space-y-10">
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Business Name</label>
 <input
 required
 type="text"
 className="input-field !rounded-lg !py-5 font-semibold text-2xl !bg-white border border-gray-300 shadow-sm"
 value={profileData.name}
 onChange={e => setProfileData({ ...profileData, name: e.target.value})}
 placeholder="Business Name..."
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Contact Phone</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.phone}
 onChange={e => setProfileData({ ...profileData, phone: e.target.value})}
 placeholder="Phone Number..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Official Email</label>
 <input
 type="email"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.email}
 onChange={e => setProfileData({ ...profileData, email: e.target.value})}
 placeholder="Email Address..."
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Business Address</label>
 <textarea
 rows="3"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm w-full resize-none"
 value={profileData.address}
 onChange={e => setProfileData({ ...profileData, address: e.target.value})}
 placeholder="Full Physical Address..."
 />
 </div>

 <div className="pt-8 border-t border-black/5">
 <div className="flex items-center gap-3 mb-8">
 <Shield size={18} className="text-accent-signature" />
 <h3 className="text-sm font-semibold text-ink-primary">Taxation & Compliance</h3>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">GSTIN (GST Number)</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.gst_no}
 onChange={e => setProfileData({ ...profileData, gst_no: e.target.value})}
 placeholder="GSTIN..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">PAN Number</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.pan_no}
 onChange={e => setProfileData({ ...profileData, pan_no: e.target.value})}
 placeholder="Permanent Account Number..."
 />
 </div>
 </div>

 {/* Tax Mode toggle */}
 <div className="mt-5">
   <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-3">Tax Mode</label>
   <div className="grid grid-cols-2 gap-2">
     {[
       { value: 'EXCLUSIVE', label: 'Tax Exclusive', desc: 'Price shown before GST · tax added on top' },
       { value: 'INCLUSIVE', label: 'Tax Inclusive', desc: 'Price already includes GST · tax extracted from total' },
     ].map(opt => (
       <button
         key={opt.value}
         type="button"
         onClick={() => setProfileData(p => ({ ...p, tax_mode: opt.value }))}
         className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
           profileData.tax_mode === opt.value
             ? 'bg-ink-primary text-white border-ink-primary'
             : 'bg-canvas border-black/10 hover:border-black/30'
         }`}
       >
         <p className={`text-xs font-black ${profileData.tax_mode === opt.value ? 'text-white' : 'text-ink-primary'}`}>{opt.label}</p>
         <p className={`text-[10px] mt-0.5 font-medium ${profileData.tax_mode === opt.value ? 'text-white/70' : 'text-gray-400'}`}>{opt.desc}</p>
       </button>
     ))}
   </div>
   <p className="text-[10px] text-gray-400 mt-2">
     Applies to all invoices and POS sales. Save profile to update.
   </p>
 </div>

 {/* Auto IRN toggle */}
 <div className="mt-5">
   <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-3">E-Invoice (IRN)</label>
   <div className="flex items-center justify-between px-4 py-3 rounded-xl border-2 bg-canvas border-black/10">
     <div className="flex-1 pr-4">
       <p className="text-xs font-black text-ink-primary">Auto-generate IRN for every invoice</p>
       <p className="text-[10px] mt-0.5 font-medium text-gray-400">
         Required if your aggregate turnover exceeds ₹5 Cr. Queues an IRN request to the NIC portal on each invoice — fetched asynchronously by the worker.
       </p>
     </div>
     <button
       type="button"
       onClick={() => setProfileData(p => ({ ...p, auto_irn_enabled: !p.auto_irn_enabled }))}
       className={`relative w-11 h-6 rounded-full transition-colors ${profileData.auto_irn_enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
     >
       <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${profileData.auto_irn_enabled ? 'translate-x-5' : ''}`} />
     </button>
   </div>
 </div>
 </div>

 <div className="pt-8 border-t border-black/5">
 <div className="flex items-center gap-3 mb-8">
 <Zap size={18} className="text-accent-signature" />
 <h3 className="text-sm font-semibold text-ink-primary">Banking & Payments</h3>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Bank Name</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.bank_name}
 onChange={e => setProfileData({ ...profileData, bank_name: e.target.value})}
 placeholder="e.g. HDFC Bank"
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Account Number</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.account_no}
 onChange={e => setProfileData({ ...profileData, account_no: e.target.value})}
 placeholder="Bank Account No..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">IFSC Code</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.ifsc_code}
 onChange={e => setProfileData({ ...profileData, ifsc_code: e.target.value})}
 placeholder="Bank IFSC..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">UPI ID (for QR)</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-white border border-gray-300 shadow-sm"
 value={profileData.upi_id}
 onChange={e => setProfileData({ ...profileData, upi_id: e.target.value})}
 placeholder="e.g. name@bank"
 />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-8 border-t border-black/5">
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Country</label>
 <div className="relative">
 <Globe size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-primary opacity-20" />
 <select className="input-field !pl-16 !rounded-lg !py-2.5 font-medium text-sm appearance-none !bg-white border border-gray-300 shadow-sm" value={profileData.country} onChange={e => {
 const country = e.target.value;
 let currency = profileData.currency;
 let currencySymbol = profileData.currencySymbol;
 if (country === 'India') { currency = 'INR'; currencySymbol = '₹';}
 else if (country === 'United Arab Emirates') { currency = 'AED'; currencySymbol = 'AED';}
 else if (country === 'United States') { currency = 'USD'; currencySymbol = '$';}
 else if (country === 'United Kingdom') { currency = 'GBP'; currencySymbol = '£';}
 setProfileData({ ...profileData, country, currency, currencySymbol});
}}>
 <option value="United Arab Emirates">UNITED ARAB EMIRATES</option>
 <option value="United States">UNITED STATES</option>
 <option value="United Kingdom">UNITED KINGDOM</option>
 <option value="Canada">CANADA</option>
 <option value="Australia">AUSTRALIA</option>
 <option value="India">INDIA</option>
 </select>
 </div>
 </div>

 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Currency</label>
 <div className="relative">
 <Coins size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-primary opacity-20" />
 <select className="input-field !pl-16 !rounded-lg !py-2.5 font-medium text-sm appearance-none !bg-white border border-gray-300 shadow-sm" value={profileData.currency} onChange={e => setProfileData({ ...profileData, currency: e.target.value})}>
 <option value="INR">INR - INDIAN RUPEE</option>
 <option value="AED">AED - UAE DIRHAM</option>
 <option value="USD">USD - US DOLLAR</option>
 <option value="EUR">EUR - EURO</option>
 <option value="GBP">GBP - BRITISH POUND</option>
 </select>
 </div>
 </div>
 </div>

 <div className="flex gap-4 pt-8 border-t border-black/5">
 <button
   type="submit"
   disabled={savedStatus}
   className={`btn-signature w-full !rounded-lg !py-6 !text-base transition-all duration-500 ${
     savedStatus
       ? '!bg-emerald-500 !text-white scale-[0.98] shadow-emerald-500/40 shadow-lg'
       : ''
   }`}
 >
   <span className={`transition-transform duration-300 ${savedStatus ? 'scale-105' : ''}`}>
     {savedStatus ? 'SAVED' : 'SAVE SETTINGS'}
   </span>
   <div className={`icon-nest transition-transform duration-500 ${savedStatus ? 'rotate-[360deg] bg-white/20' : ''}`}>
     {savedStatus ? <CheckCircle2 size={24} className="animate-in zoom-in duration-300" /> : <Save size={24} />}
   </div>
 </button>
 </div>
 </form>
 </div>
 </div>

  {/* Workspace Management - OWNER ONLY */}
  {isOwner && (
    <div id="tab-workspace" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface mt-5">
      <div className="bg-ink-primary p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Shield size={20} className="text-accent-signature" />
          <h2 className="text-base font-bold font-semibold text-surface">Workspace Administration</h2>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[10px] font-bold text-accent-signature uppercase tracking-wider">{currentTenant?.plan} TIER</span>
        </div>
      </div>
      
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Plan Details */}
        <div className="flex flex-col gap-4">
          <div className="p-5 rounded-2xl bg-white border border-gray-300 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-700 uppercase">Current Plan</span>
              <Sparkles size={16} className="text-accent-signature" />
            </div>
            {(() => {
              const plan = (currentTenant?.plan || 'STARTER').toUpperCase();
              const isTop = plan === 'ENTERPRISE';
              const blurb = plan === 'STARTER'
                ? 'The foundational ledger for growing teams.'
                : plan === 'PRO'
                ? 'Advanced operations and pipeline tooling.'
                : 'Enterprise governance and advanced logistics active.';
              return (
                <>
                  <h3 className="text-3xl font-black text-ink-primary mb-2 uppercase tracking-tight">{plan}</h3>
                  <p className="text-[10px] font-semibold text-gray-600 opacity-70 mb-6 leading-relaxed uppercase">{blurb}</p>
                  {isTop ? (
                    <div className="w-full h-12 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                      <CheckCircle2 size={14} /> TOP TIER — ALL MODULES UNLOCKED
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      className="w-full h-12 bg-ink-primary text-surface rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      UPGRADE WORKSPACE <ChevronRight size={14} className="text-accent-signature" />
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Slug Management */}
        <div className="flex flex-col gap-4">
          <div className="p-5 rounded-2xl bg-white border border-gray-300 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Workspace Identifier (URL)</span>
              <Globe size={16} className="text-accent-signature" />
            </div>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">/</span>
              <input
                type="text"
                className="w-full !pl-8 !py-5 bg-surface border-none rounded-lg text-lg font-bold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 transition-all uppercase"
                value={workspaceSlug}
                onChange={e => setWorkspaceSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''))}
                placeholder="slug..."
              />
            </div>
            <p className="text-[9px] font-semibold text-gray-500 mt-3 mb-6 uppercase italic">Changing this will update your login URL immediately.</p>
            <button 
              disabled={workspaceSlug === currentTenant?.slug || isUpdatingSlug}
              onClick={async () => {
                setIsUpdatingSlug(true);
                const success = await updateTenant({ slug: workspaceSlug });
                if (success) {
                  goHref(`/${workspaceSlug}/settings`);
                }
                setIsUpdatingSlug(false);
              }}
              className={`w-full h-12 rounded-xl text-xs font-bold transition-all ${
                workspaceSlug === currentTenant?.slug 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-accent-signature text-button-text shadow-premium'
              }`}
            >
              {isUpdatingSlug ? 'UPDATING WORKSPACE...' : 'UPDATE WORKSPACE URL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Expense Categories Management */}
 <div id="tab-categories" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
 <div className="bg-ink-primary p-6 flex items-center justify-between">
 <div className="flex items-center gap-4">
 <Tag size={20} className="text-accent-signature" />
 <h2 className="text-base font-bold font-semibold text-surface">Expense Categories</h2>
 </div>
 <div className="text-[9px] font-semibold text-accent-signature opacity-70">Manage Categories</div>
 </div>
 
 <div className="p-6 space-y-8">
 {/* Add Category */}
 <div className="flex gap-3">
 <input
 type="text"
 placeholder="New Category..."
 className="input-field !rounded-xl !py-2.5 font-bold text-sm bg-white border border-gray-300 shadow-sm flex-1"
 value={newCategory}
 onChange={e => setNewCategory(e.target.value)}
 onKeyPress={e => {
 if (e.key === 'Enter') {
 addExpenseCategory(newCategory);
 setNewCategory('');
}
}}
 />
 <button 
 className="btn-signature !px-6 !rounded-xl transition-all hover:shadow-lg"
 onClick={() => {
 addExpenseCategory(newCategory);
 setNewCategory('');
}}
 >
 <Plus size={20} />
 </button>
 </div>

 {/* Category List */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {expenseCategories.map(cat => (
 <div key={cat} className="group flex items-center justify-between p-4 rounded-xl bg-white border border-gray-300 shadow-sm hover:border-accent-signature/30 transition-all">
 {editingCategory === cat ? (
 <div className="flex items-center gap-2 w-full">
 <input
 autoFocus
 type="text"
 className="bg-transparent border-none outline-none font-semibold text-sm text-ink-primary flex-1"
 value={editValue}
 onChange={e => setEditValue(e.target.value)}
 onBlur={() => {
 updateExpenseCategory(cat, editValue);
 setEditingCategory(null);
}}
 onKeyPress={e => {
 if (e.key === 'Enter') {
 updateExpenseCategory(cat, editValue);
 setEditingCategory(null);
}
}}
 />
 <button onClick={() => setEditingCategory(null)} className="text-gray-700 hover:text-ink-primary">
 <X size={14} />
 </button>
 </div>
 ) : (
 <>
 <span className="text-sm font-semibold text-ink-primary">{cat}</span>
 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button 
 className="p-2 rounded-lg hover:bg-black/5 text-gray-700 hover:text-ink-primary transition-colors"
 onClick={() => {
 setEditingCategory(cat);
 setEditValue(cat);
}}
 >
 <Edit2 size={14} />
 </button>
 <button 
 className="p-2 rounded-lg hover:bg-red-50 text-gray-700 hover:text-red-500 transition-colors"
 onClick={() => {
 if (window.confirm(`Delete category"${cat}"?`)) {
 deleteExpenseCategory(cat);
}
}}
 >
 <Trash2 size={14} />
 </button>
 </div>
 </>
 )}
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Product Categories Management */}
 <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
 <div className="bg-ink-primary p-6 flex items-center justify-between">
 <div className="flex items-center gap-4">
 <Tag size={20} className="text-accent-signature" />
 <h2 className="text-base font-bold font-semibold text-surface">Product Categories</h2>
 </div>
 <div className="text-[9px] font-semibold text-accent-signature opacity-70">Manage Categories</div>
 </div>
 <div className="p-6 space-y-8">
 <div className="flex gap-3">
 <input
 type="text"
 placeholder="New Category..."
 className="input-field !rounded-xl !py-2.5 font-bold text-sm bg-white border border-gray-300 shadow-sm flex-1"
 value={newProductCategory}
 onChange={e => setNewProductCategory(e.target.value)}
 onKeyPress={e => {
 if (e.key === 'Enter' && newProductCategory.trim()) {
 addProductCategory(newProductCategory.trim());
 setNewProductCategory('');
}
}}
 />
 <button
 className="btn-signature !px-6 !rounded-xl transition-all hover:shadow-lg"
 onClick={() => {
 if (newProductCategory.trim()) {
 addProductCategory(newProductCategory.trim());
 setNewProductCategory('');
}
}}
 >
 <Plus size={20} />
 </button>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {productCategories.map(cat => (
 <div key={cat.id} className="group flex items-center justify-between p-4 rounded-xl bg-white border border-gray-300 shadow-sm hover:border-accent-signature/30 transition-all">
 {editingProductCategory === cat.id ? (
 <div className="flex items-center gap-2 w-full">
 <input
 autoFocus
 type="text"
 className="bg-transparent border-none outline-none font-semibold text-sm text-ink-primary flex-1"
 value={editProductValue}
 onChange={e => setEditProductValue(e.target.value)}
 onBlur={() => {
 updateProductCategory({ id: cat.id, name: editProductValue });
 setEditingProductCategory(null);
}}
 onKeyPress={e => {
 if (e.key === 'Enter') {
 updateProductCategory({ id: cat.id, name: editProductValue });
 setEditingProductCategory(null);
}
}}
 />
 <button onClick={() => setEditingProductCategory(null)} className="text-gray-700 hover:text-ink-primary">
 <X size={14} />
 </button>
 </div>
 ) : (
 <>
 <span className="text-sm font-semibold text-ink-primary">{cat.name}</span>
 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button
 className="p-2 rounded-lg hover:bg-black/5 text-gray-700 hover:text-ink-primary transition-colors"
 onClick={() => { setEditingProductCategory(cat.id); setEditProductValue(cat.name); }}
 >
 <Edit2 size={14} />
 </button>
 <button
 className="p-2 rounded-lg hover:bg-red-50 text-gray-700 hover:text-red-500 transition-colors"
 onClick={() => { if (window.confirm(`Delete category "${cat.name}"?`)) deleteProductCategory(cat.id); }}
 >
 <Trash2 size={14} />
 </button>
 </div>
 </>
 )}
 </div>
 ))}
 {productCategories.length === 0 && (
 <p className="text-sm text-gray-500 col-span-2">No product categories yet. Add one above.</p>
 )}
 </div>
 </div>
 </div>

 {/* Threat Intelligence / Stock Alerts */}
 <div className="glass-panel !rounded-bento p-6 border border-black/5 flex flex-col md:flex-row items-center gap-4 bg-surface shadow-premium">
 <div className="w-24 h-24 rounded-pill bg-orange-50 text-orange-500 flex items-center justify-center shrink-0 shadow-sm">
 <Zap size={36} />
 </div>
 <div className="flex-1">
 <div className="text-sm font-semibold text-gray-700 opacity-70 mb-3">Inventory Alerts</div>
 <h3 className="text-2xl font-semibold text-ink-primary mb-4">Low Stock Threshold</h3>
 <div className="flex items-center gap-4">
 <input
 type="number"
 className="input-field !max-w-[140px] !rounded-lg !py-2.5 !text-center !font-semibold !text-2xl bg-white border border-gray-300 shadow-sm"
 value={profileData.lowStockThreshold}
 onChange={e => setProfileData({ ...profileData, lowStockThreshold: parseInt(e.target.value) || 0})}
 />
 <span className="text-xs font-semibold text-gray-700 opacity-70 leading-tight">Minimum Stock<br/>Level</span>
 </div>
 </div>
 </div>

 {/* Theme Picker — owner only */}
 {isOwner && <ThemePicker />}

 {/* ── Cash Bill / POS Receipt Layout ─────────────────────────────── */}
 <div id="tab-billing" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
   <div className="bg-ink-primary p-6 flex items-center justify-between">
     <div className="flex items-center gap-4">
       <Receipt size={20} className="text-accent-signature" />
       <div>
         <h2 className="text-base font-bold text-surface">Cash Bill Layout</h2>
         <p className="text-[10px] text-white/40 mt-0.5">Controls what prints on your 80mm POS receipt</p>
       </div>
     </div>
     <div className="text-[9px] font-semibold text-accent-signature opacity-70 uppercase tracking-widest">Per-Tenant</div>
   </div>
   <div className="p-6 space-y-6">

     {/* Toggle rows */}
     <div>
       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Business Info on Bill</p>
       <div className="space-y-1">
         {[
           { key: 'show_address',  label: 'Business Address' },
           { key: 'show_phone',    label: 'Business Phone' },
           { key: 'show_gstin',    label: 'GSTIN / Tax Number' },
           { key: 'show_upi',         label: 'UPI / Pay QR on Thermal Receipt' },
           { key: 'show_upi_invoice', label: 'UPI / Pay QR on GST Invoice' },
         ].map(({ key, label }) => (
           <div key={key} className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
             <span className="text-sm font-semibold text-ink-primary">{label}</span>
             <button
               onClick={() => toggleBill(key)}
               className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${billSettings[key] ? 'bg-accent-signature' : 'bg-black/10'}`}
             >
               <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${billSettings[key] ? 'translate-x-5' : 'translate-x-0'}`} />
             </button>
           </div>
         ))}
       </div>
     </div>

     <div>
       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Customer Info on Bill</p>
       <div className="space-y-1">
         {[
           { key: 'show_customer_name',  label: 'Customer Name' },
           { key: 'show_customer_gstin', label: 'Customer GSTIN' },
         ].map(({ key, label }) => (
           <div key={key} className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
             <span className="text-sm font-semibold text-ink-primary">{label}</span>
             <button
               onClick={() => toggleBill(key)}
               className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${billSettings[key] ? 'bg-accent-signature' : 'bg-black/10'}`}
             >
               <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${billSettings[key] ? 'translate-x-5' : 'translate-x-0'}`} />
             </button>
           </div>
         ))}
       </div>
     </div>

     <div>
       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Amounts & Tax</p>
       <div className="space-y-1">
         {[
           { key: 'show_tax_breakdown', label: 'Show CGST / SGST breakdown' },
           { key: 'show_discount',      label: 'Show Discount line' },
         ].map(({ key, label }) => (
           <div key={key} className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
             <span className="text-sm font-semibold text-ink-primary">{label}</span>
             <button
               onClick={() => toggleBill(key)}
               className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${billSettings[key] ? 'bg-accent-signature' : 'bg-black/10'}`}
             >
               <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${billSettings[key] ? 'translate-x-5' : 'translate-x-0'}`} />
             </button>
           </div>
         ))}
       </div>
     </div>

     {/* Bill title */}
     <div>
       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Bill Title</p>
       <div className="flex gap-2">
         {['TAX INVOICE', 'CASH BILL', 'RECEIPT', 'RETAIL INVOICE'].map(opt => (
           <button
             key={opt}
             onClick={() => setBillSettings(prev => ({ ...prev, bill_title: opt }))}
             className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${
               billSettings.bill_title === opt
                 ? 'bg-ink-primary text-white border-ink-primary'
                 : 'bg-canvas border-black/10 text-gray-500 hover:border-black/30'
             }`}
           >
             {opt}
           </button>
         ))}
       </div>
     </div>

     {/* Footer message */}
     <div>
       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Footer Message</label>
       <input
         type="text"
         value={billSettings.footer_message}
         onChange={e => setBillSettings(prev => ({ ...prev, footer_message: e.target.value }))}
         placeholder="e.g. Thank You • Visit Again"
         className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-4 py-3 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all"
       />
       <p className="text-[10px] text-gray-400 mt-1.5">Appears at the bottom of every printed bill. Leave blank to hide.</p>
     </div>

     {/* Save */}
     <button
       onClick={handleSaveBillSettings}
       disabled={billSavedStatus}
       className={`btn-signature w-full !rounded-xl !py-5 !text-xs flex items-center justify-center gap-3 transition-all duration-500 ${billSavedStatus ? '!bg-emerald-500 !text-white' : ''}`}
     >
       {billSavedStatus ? <><CheckCircle2 size={16} /> SAVED</> : <><Save size={16} /> SAVE BILL SETTINGS</>}
     </button>
   </div>
 </div>

 {/* Data Import / Export */}
 <div id="tab-data" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
 <div className="bg-ink-primary p-6 flex items-center justify-between">
 <div className="flex items-center gap-4">
 <FileUp size={20} className="text-accent-signature" />
 <h2 className="text-base font-bold font-semibold text-surface">Data Import / Export</h2>
 </div>
 <div className="text-[9px] font-semibold text-accent-signature opacity-70">CSV & JSON</div>
 </div>
 <div className="p-6 space-y-4">
 <p className="text-[11px] font-bold text-gray-700 leading-relaxed">
 Import your existing business data or export a backup. Supports CSV and JSON formats for Products, Clients, Orders, Expenses, and Employees.
 </p>
 <button
 className="btn-signature w-full !rounded-xl !py-5 !text-xs flex items-center justify-center gap-3"
 onClick={() => navigate(`/${tenantSlug}/data-tools`)}
 >
 <FileDown size={18} />
 OPEN DATA TOOLS
 <div className="icon-nest !w-9 !h-9 ml-4">
 <FileUp size={18} />
 </div>
 </button>

 {/* Phase 3 — self-heal button. Recomputes every client's outstanding
     balance from the sales ledger (the trigger keeps it correct going
     forward; this is the manual escape hatch if a tenant ever sees a
     stale number). */}
 <button
 className="w-full rounded-xl py-4 text-[11px] font-black uppercase tracking-widest border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center gap-2 text-ink-primary disabled:opacity-50"
 onClick={async () => {
   if (!currentTenantId) return;
   if (!window.confirm('Recompute every client\'s outstanding balance from the sales ledger?')) return;
   const { data, error } = await supabase.rpc('recompute_client_outstanding', { p_tenant_id: currentTenantId });
   if (error) { alert('Failed: ' + error.message); return; }
   const changed = (data || []).filter(r => Math.abs(Number(r.delta) || 0) >= 0.01);
   alert(changed.length
     ? `Adjusted ${changed.length} client balance${changed.length === 1 ? '' : 's'}.\n\n` +
       changed.slice(0, 10).map(r => `• ${r.client_name}: ${r.before_value} → ${r.after_value}`).join('\n')
     : 'All client balances already match the ledger. No changes.');
 }}
 >
 <RotateCcw size={14} />
 Refresh Outstanding Balances
 </button>
 </div>
 </div>
 </div>

 {/* Right Side: Security & Maintenance */}
 <div className="flex flex-col gap-5">
 <div className="rounded-[2rem] p-6 bg-ink-primary text-white overflow-hidden relative shadow-2xl border-none">
 <div className="absolute top-0 right-0 p-16 opacity-5 scale-200 pointer-events-none">
 <ShieldCheck size={140} />
 </div>
 <h3 className="text-xl font-semibold mb-1 pt-12">Cloud Security</h3>
 <div className="text-sm font-semibold text-accent-signature mb-10 opacity-70">Status: Cloud Live</div>
 <p className="text-sm font-medium text-white/50 leading-relaxed mb-12 relative z-10">
 Enterprise governance is active. All transactions are synchronized across the Ledgr Pro cloud infrastructure with real-time replication and encryption.
 </p>
 <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-5">
 <div className="w-full h-full bg-accent-signature"></div>
 </div>
 <div className="flex justify-between items-center relative z-10">
 <span className="text-[10px] font-semibold text-white/30">Sync Status</span>
 <span className="text-[10px] font-semibold text-accent-signature">Active & Verified</span>
 </div>
 </div>

 <div className="rounded-[2rem] p-6 bg-white border border-black/5 flex flex-col gap-10 shadow-sm">
 <div>
 <div className="flex items-center gap-4 text-indigo-500 mb-6">
 <ShieldCheck size={28} />
 <h3 className="text-base font-semibold leading-none">Security Locks</h3>
 </div>
 <p className="text-[11px] font-semibold text-indigo-900/60 leading-relaxed">
 Critical system partitions are locked for integrity. Administrative overrides require multi-factor verification.
 </p>
 </div>
 </div>

 </div>
 </div>



 {/* ── Branches / Locations (PRO+) ── */}
 <div id="tab-locations" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
   <div className="bg-ink-primary p-6 flex items-center justify-between">
     <div className="flex items-center gap-4">
       <MapPin size={20} className="text-accent-signature" />
       <div>
         <h2 className="text-base font-bold text-surface">Branches &amp; Locations</h2>
         <p className="text-[10px] text-accent-signature/60 mt-0.5">Manage warehouses, outlets, and branches</p>
       </div>
     </div>
     <span className={`text-[9px] font-black px-2 py-1 rounded-full ${planMeta.color}`}>{planMeta.label}</span>
   </div>
   <div className="p-6 space-y-4">
     {!isPro ? (
       <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
         <AlertTriangle size={16} className="text-amber-500 shrink-0" />
         <p className="text-xs font-semibold text-amber-700">Multi-branch inventory requires Professional plan or higher.</p>
         <button onClick={() => setShowUpgradeModal(true)} className="ml-auto text-[10px] font-black text-amber-600 underline underline-offset-2 whitespace-nowrap">Upgrade</button>
       </div>
     ) : (
       <>
         {/* Existing locations */}
         <div className="space-y-2">
           {inventoryLocations.map(loc => (
             <div key={loc.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-gray-300 shadow-sm">
               <MapPin size={14} className="text-gray-400 shrink-0" />
               {editingLoc?.id === loc.id ? (
                 <div className="flex-1 flex gap-2">
                   <input
                     value={editingLoc.name}
                     onChange={e => setEditingLoc(p => ({ ...p, name: e.target.value }))}
                     className="flex-1 text-xs font-semibold bg-white border border-black/10 rounded-xl px-3 py-1.5 outline-none"
                   />
                   <input
                     value={editingLoc.address || ''}
                     onChange={e => setEditingLoc(p => ({ ...p, address: e.target.value }))}
                     placeholder="Address"
                     className="flex-1 text-xs font-semibold bg-white border border-black/10 rounded-xl px-3 py-1.5 outline-none"
                   />
                   <button onClick={handleSaveEditLoc} disabled={locSaving} className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 px-2">Save</button>
                   <button onClick={() => setEditingLoc(null)} className="text-[10px] font-black text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                 </div>
               ) : (
                 <>
                   <div className="flex-1 min-w-0">
                     <p className="text-sm font-black text-ink-primary truncate">{loc.name}</p>
                     {loc.address && <p className="text-[10px] text-gray-400 truncate">{loc.address}</p>}
                   </div>
                   {loc.id !== '00000000-0000-0000-0000-000000000001' && (
                     <div className="flex gap-1.5">
                       <button onClick={() => setEditingLoc({ ...loc })} className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center transition-colors">
                         <Edit2 size={12} className="text-gray-400" />
                       </button>
                       <button onClick={() => handleDeleteLoc(loc.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors group">
                         <Trash2 size={12} className="text-gray-300 group-hover:text-red-400" />
                       </button>
                     </div>
                   )}
                   {loc.id === '00000000-0000-0000-0000-000000000001' && (
                     <span className="text-[9px] font-black text-gray-400 bg-black/5 px-2 py-0.5 rounded-full">Main</span>
                   )}
                 </>
               )}
             </div>
           ))}
         </div>
         {/* Add new location */}
         <div className="flex gap-2 pt-2">
           <input
             value={newLocName}
             onChange={e => setNewLocName(e.target.value)}
             placeholder="Branch name (e.g. Kozhikode Outlet)"
             className="flex-1 text-xs font-semibold bg-white border border-gray-300 shadow-sm rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent-signature/25"
           />
           <input
             value={newLocAddr}
             onChange={e => setNewLocAddr(e.target.value)}
             placeholder="Address (optional)"
             className="flex-1 text-xs font-semibold bg-white border border-gray-300 shadow-sm rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent-signature/25"
           />
           <button
             onClick={handleAddLocation}
             disabled={locSaving || !newLocName.trim()}
             className="px-5 py-3 bg-ink-primary text-white rounded-2xl text-xs font-black hover:bg-ink-primary/80 transition-colors disabled:opacity-40 flex items-center gap-2"
           >
             <Plus size={14} /> Add
           </button>
         </div>
       </>
     )}
   </div>
 </div>

 {/* ── API Keys (Enterprise) ── */}
 <div id="tab-api" className="scroll-mt-24 glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
   <div className="bg-ink-primary p-6 flex items-center justify-between">
     <div className="flex items-center gap-4">
       <Key size={20} className="text-accent-signature" />
       <div>
         <h2 className="text-base font-bold text-surface">API Access</h2>
         <p className="text-[10px] text-accent-signature/60 mt-0.5">Generate API keys for integrations</p>
       </div>
     </div>
     <span className={`text-[9px] font-black px-2 py-1 rounded-full ${PLANS.ENTERPRISE.color}`}>Enterprise</span>
   </div>
   <div className="p-6 space-y-4">
     {!isEnterprise ? (
       <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
         <AlertTriangle size={16} className="text-amber-500 shrink-0" />
         <p className="text-xs font-semibold text-amber-700">API access requires Enterprise plan.</p>
         <button onClick={() => setShowUpgradeModal(true)} className="ml-auto text-[10px] font-black text-amber-600 underline underline-offset-2 whitespace-nowrap">Upgrade</button>
       </div>
     ) : (
       <div className="space-y-4">
         <p className="text-xs font-semibold text-gray-500">
           Use this key to authenticate API requests. Keep it secret — treat like a password.
         </p>
         {apiKey ? (
           <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-300 shadow-sm">
             <Key size={14} className="text-gray-400 shrink-0" />
             <code className="flex-1 text-[11px] font-mono text-ink-primary tracking-tight truncate">
               {apiKeyVisible ? apiKey : '••••••••••••••••••••••••••••••••••••••••'}
             </code>
             <button
               onClick={() => setApiKeyVisible(v => !v)}
               className="text-[10px] font-black text-gray-400 hover:text-ink-primary px-2"
             >
               {apiKeyVisible ? 'Hide' : 'Show'}
             </button>
             <button
               onClick={copyApiKey}
               className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center transition-colors"
             >
               {apiKeyCopied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} className="text-gray-400" />}
             </button>
           </div>
         ) : (
           <div className="p-4 rounded-2xl bg-canvas border border-dashed border-black/10 text-center">
             <p className="text-xs font-semibold text-gray-400">No API key generated yet.</p>
           </div>
         )}
         <button
           onClick={generateApiKey}
           disabled={apiKeySaving}
           className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-black/8 text-xs font-black text-ink-primary hover:bg-black/5 transition-colors disabled:opacity-40"
         >
           <RefreshCw size={13} className={apiKeySaving ? 'animate-spin' : ''} />
           {apiKey ? 'Regenerate Key' : 'Generate API Key'}
         </button>
         {apiKey && (
           <p className="text-[10px] text-rose-500 font-semibold flex items-center gap-1.5">
             <AlertTriangle size={11} /> Regenerating invalidates the existing key immediately.
           </p>
         )}
       </div>
     )}
   </div>
 </div>

 {/* ── Plan Usage ── */}
 <PlanUsageBanner
   plan={plan}
   invoiceCount={invoiceCount}
   userCount={userCount}
   maxInvoices={maxInvoices}
   maxUsers={maxUsers}
   onUpgrade={() => setShowUpgradeModal(true)}
 />

 {/* Upgrade Modal */}
 {showUpgradeModal && (
   <div className="modal-overlay">
     <div className="glass-modal !max-w-md text-center p-8">
       <div className="flex justify-center mb-10">
         <div className="w-24 h-24 rounded-full bg-accent-signature/10 flex items-center justify-center text-accent-signature">
           <Sparkles size={48} className="animate-pulse" />
         </div>
       </div>
       <h2 className="text-3xl font-black text-ink-primary mb-4 uppercase tracking-tighter">Enter the Pro Tier<span className="text-accent-signature">.</span></h2>
       <p className="text-sm font-semibold text-gray-700 opacity-70 mb-10 leading-relaxed uppercase">
         Unlock high-density logistics tracking, enterprise RLS governance, and advanced sync engine capabilities.
       </p>
       
       <div className="space-y-3 mb-10">
         <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-300 shadow-sm">
           <div className="w-8 h-8 rounded-lg bg-ink-primary flex items-center justify-center text-accent-signature"><Database size={16} /></div>
           <span className="text-[10px] font-bold text-ink-primary uppercase tracking-wide text-left">Advanced Multi-Tenant Governance</span>
         </div>
         <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-300 shadow-sm">
           <div className="w-8 h-8 rounded-lg bg-ink-primary flex items-center justify-center text-accent-signature"><Zap size={16} /></div>
           <span className="text-[10px] font-bold text-ink-primary uppercase tracking-wide text-left">Real-time Logistics Replication</span>
         </div>
       </div>

       <div className="grid grid-cols-1 gap-4">
         <a 
           href={`mailto:pro@ledgr.pro?subject=Upgrade Request: ${currentTenant?.name}`}
           className="btn-signature !h-16 flex items-center justify-center !text-sm"
         >
           CONTACT ENTERPRISE SALES
           <div className="icon-nest ml-4">
             <Mail size={20} />
           </div>
         </a>
         <button 
           onClick={() => setShowUpgradeModal(false)}
           className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase hover:text-ink-primary transition-all"
         >
           Close
         </button>
       </div>
     </div>
   </div>
 )}
 </div>
 );
};

export default Settings;
