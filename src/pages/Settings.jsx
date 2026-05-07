import React, { useState} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ThemePicker from '../components/ThemePicker';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../hooks/useFinance';
import { useInventory } from '../hooks/useInventory';
import { 
  Settings as SettingsIcon, Building, Shield, Bell, Save, 
  CheckCircle2, Lock, Globe, Coins, ShieldCheck, 
  Database, RotateCcw, ChevronRight, Zap, Tag, Plus, Edit2, Trash2, X, FileUp, FileDown,
  Sparkles, Mail
} from 'lucide-react';

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
    productCategories, addProductCategory, updateProductCategory, deleteProductCategory
  } = useInventory(currentTenantId);

  // Fallback for missing businessProfile during load
  const profile = businessProfile || {};


 const [newCategory, setNewCategory] = useState('');
 const [editingCategory, setEditingCategory] = useState(null);
 const [editValue, setEditValue] = useState('');
 const [newProductCategory, setNewProductCategory] = useState('');
 const [editingProductCategory, setEditingProductCategory] = useState(null);
 const [editProductValue, setEditProductValue] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [workspaceSlug, setWorkspaceSlug] = useState(currentTenant?.slug || '');
  const [isUpdatingSlug, setIsUpdatingSlug] = useState(false);

  const [profileData, setProfileData] = useState({
    name: profile.name || '',
    country: profile.country || '',
    currency: profile.currency || 'USD',
    currencySymbol: profile.currencySymbol || '$',
    lowStockThreshold: profile.lowStockThreshold || 20,
    pan_no: profile.pan_no || '',
    gst_no: profile.gst_no || '',
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

 {/* Main Config Grid */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
 {/* Left Panel: Primary Identity */}
 <div className="md:col-span-2 flex flex-col gap-5">
 <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium">
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
 className="input-field !rounded-lg !py-5 font-semibold text-2xl !bg-canvas border border-black/5"
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
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
 value={profileData.phone}
 onChange={e => setProfileData({ ...profileData, phone: e.target.value})}
 placeholder="Phone Number..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Official Email</label>
 <input
 type="email"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
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
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5 w-full resize-none"
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
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
 value={profileData.gst_no}
 onChange={e => setProfileData({ ...profileData, gst_no: e.target.value})}
 placeholder="GSTIN..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">PAN Number</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
 value={profileData.pan_no}
 onChange={e => setProfileData({ ...profileData, pan_no: e.target.value})}
 placeholder="Permanent Account Number..."
 />
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
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
 value={profileData.bank_name}
 onChange={e => setProfileData({ ...profileData, bank_name: e.target.value})}
 placeholder="e.g. HDFC Bank"
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">Account Number</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
 value={profileData.account_no}
 onChange={e => setProfileData({ ...profileData, account_no: e.target.value})}
 placeholder="Bank Account No..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">IFSC Code</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
 value={profileData.ifsc_code}
 onChange={e => setProfileData({ ...profileData, ifsc_code: e.target.value})}
 placeholder="Bank IFSC..."
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-gray-700 opacity-[0.85] mb-1.5">UPI ID (for QR)</label>
 <input
 type="text"
 className="input-field !rounded-lg !py-2.5 font-medium text-sm !bg-canvas border border-black/5"
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
 <select className="input-field !pl-16 !rounded-lg !py-2.5 font-medium text-sm appearance-none !bg-canvas border border-black/5" value={profileData.country} onChange={e => {
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
 <select className="input-field !pl-16 !rounded-lg !py-2.5 font-medium text-sm appearance-none !bg-canvas border border-black/5" value={profileData.currency} onChange={e => setProfileData({ ...profileData, currency: e.target.value})}>
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
    <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface mt-5">
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
          <div className="p-5 rounded-2xl bg-canvas border border-black/5">
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
          <div className="p-5 rounded-2xl bg-canvas border border-black/5">
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
                  window.location.href = `/${workspaceSlug}/settings`;
                }
                setIsUpdatingSlug(false);
              }}
              className={`w-full h-12 rounded-xl text-xs font-bold transition-all ${
                workspaceSlug === currentTenant?.slug 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-accent-signature text-ink-primary shadow-premium'
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
 <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
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
 className="input-field !rounded-xl !py-2.5 font-bold text-sm bg-canvas border border-black/5 flex-1"
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
 <div key={cat} className="group flex items-center justify-between p-4 rounded-xl bg-canvas border border-black/5 hover:border-accent-signature/30 transition-all">
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
 className="input-field !rounded-xl !py-2.5 font-bold text-sm bg-canvas border border-black/5 flex-1"
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
 <div key={cat.id} className="group flex items-center justify-between p-4 rounded-xl bg-canvas border border-black/5 hover:border-accent-signature/30 transition-all">
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
 className="input-field !max-w-[140px] !rounded-lg !py-2.5 !text-center !font-semibold !text-2xl bg-canvas border border-black/5"
 value={profileData.lowStockThreshold}
 onChange={e => setProfileData({ ...profileData, lowStockThreshold: parseInt(e.target.value) || 0})}
 />
 <span className="text-xs font-semibold text-gray-700 opacity-70 leading-tight">Minimum Stock<br/>Level</span>
 </div>
 </div>
 </div>

 {/* Theme Picker — owner only */}
 {isOwner && <ThemePicker />}

 {/* Data Import / Export */}
 <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
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
         <div className="flex items-center gap-3 p-4 rounded-xl bg-canvas border border-black/5">
           <div className="w-8 h-8 rounded-lg bg-ink-primary flex items-center justify-center text-accent-signature"><Database size={16} /></div>
           <span className="text-[10px] font-bold text-ink-primary uppercase tracking-wide text-left">Advanced Multi-Tenant Governance</span>
         </div>
         <div className="flex items-center gap-3 p-4 rounded-xl bg-canvas border border-black/5">
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
