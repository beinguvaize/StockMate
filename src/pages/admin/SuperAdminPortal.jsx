import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../lib/supabase';
import { 
  Shield, Users, Building, Activity,
  Search, Filter, Plus, ShoppingBag, Truck, ChevronRight,
  ExternalLink, Ban, CheckCircle2, AlertCircle,
  Zap, Database, Globe, RefreshCcw, Mail, Settings, X, LogIn, ShieldAlert, Hash, LayoutDashboard, LogOut
} from 'lucide-react';
import ErrorDiagnosticsPanel from '../../components/admin/ErrorDiagnosticsPanel';
import BugReportsAdmin from '../../components/admin/BugReportsAdmin';

const SuperAdminPortal = () => {
  const { currentUser, logout } = useAuth();
  const { impersonateTenant, isMaintenance, setIsMaintenance, cacheClear } = useTenant();
  const { addNotification } = useNotifications();
  const [tenants, setTenants] = useState([]);
  const [globalStats, setGlobalStats] = useState({
    totalTenants: 0,
    activeUsers: 0,
    systemHealth: 'Optimal',
    uptime: '99.99%',
    dbSize: '2.4 GB'
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProvisioningLoading, setIsProvisioningLoading] = useState(false);
  const [provisioningError, setProvisioningError] = useState(null);
  const [provisioningData, setProvisioningData] = useState({ businessName: '', plan: 'STARTER' });
  const [recentActivities, setRecentActivities] = useState([]);
  const [activeView, setActiveView] = useState('TENANTS'); // 'TENANTS' or 'DIAGNOSTICS'

  const nameRef = useRef();
  const slugRef = useRef();

  useEffect(() => {
    fetchGlobalData();
  }, []);

  const handleProvision = async () => {
    if (!provisioningData.businessName.trim() || isProvisioningLoading) return;
    
    setIsProvisioningLoading(true);
    setProvisioningError(null);

    try {
      const { data, error } = await supabase.functions.invoke('create-tenant', {
        body: { 
          businessName: provisioningData.businessName.trim(),
          plan: provisioningData.plan 
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      addNotification(`Workspace ${data.slug} provisioned successfully.`, 'success');
      setIsProvisioning(false);
      setProvisioningData({ businessName: '', plan: 'STARTER' });
      fetchGlobalData();
    } catch (err) {
      console.error("Provisioning error:", err);
      setProvisioningError(err.message || "Failed to create workspace");
    } finally {
      setIsProvisioningLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTenant || isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: nameRef.current.value,
          slug: slugRef.current.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        })
        .eq('id', selectedTenant.id);

      if (error) throw error;
      
      setIsDrawerOpen(false);
      fetchGlobalData();
      addNotification(`Tenant settings for ${selectedTenant.name} updated.`, 'success');
    } catch (err) {
      console.error("Save error:", err);
      addNotification("Failed to save tenant: " + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Tenants
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (tenantError) throw tenantError;
      setTenants(tenantData || []);
      
      // 2. Fetch Pulse Data (Parallel)
      const [salesRes, purchasesRes, movementRes] = await Promise.all([
        supabase.from('sales').select('id, totalAmount, created_at, tenant_id').order('created_at', { ascending: false }).limit(10),
        supabase.from('purchases').select('id, total_amount, created_at, tenant_id, supplier_name').order('created_at', { ascending: false }).limit(10),
        supabase.from('movement_log').select('id, type, product_name, quantity, created_at, tenant_id').order('created_at', { ascending: false }).limit(10)
      ]);

      // 3. Normalize & Merge Activities
      const activities = [];
      const tenantMap = (tenantData || []).reduce((acc, t) => ({ ...acc, [t.id]: t }), {});

      if (salesRes.data) {
        salesRes.data.forEach(s => activities.push({
          id: s.id,
          type: 'SALE',
          amount: s.totalAmount,
          date: new Date(s.created_at),
          tenant: tenantMap[s.tenant_id],
          icon: ShoppingBag,
          color: 'text-emerald-500',
          description: `Created Sale of $${(s.totalAmount || 0).toLocaleString()}`
        }));
      }

      if (purchasesRes.data) {
        purchasesRes.data.forEach(p => activities.push({
          id: p.id,
          type: 'PURCHASE',
          amount: p.total_amount,
          date: new Date(p.created_at),
          tenant: tenantMap[p.tenant_id],
          icon: Truck,
          color: 'text-blue-500',
          description: `Purchased from ${p.supplier_name || 'Supplier'}`
        }));
      }

      if (movementRes.data) {
        movementRes.data.forEach(m => activities.push({
          id: m.id,
          type: 'MOVEMENT',
          date: new Date(m.created_at),
          tenant: tenantMap[m.tenant_id],
          icon: Activity,
          color: 'text-orange-500',
          description: `Moved ${m.quantity} units of ${m.product_name}`
        }));
      }

      setRecentActivities(activities.sort((a, b) => b.date - a.date).slice(0, 15));
      
      const totalUsers = tenantData?.reduce((acc, t) => acc + (t.staff_count || 1), 0) || 0;
      setGlobalStats(prev => ({
        ...prev,
        totalTenants: tenantData?.length || 0,
        activeUsers: totalUsers
      }));
    } catch (err) {
      console.error("Nexus fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ label, value, icon: Icon, color, detail }) => (
    <div className="glass-panel !rounded-bento border border-black/5 bg-white p-6 relative overflow-hidden group shadow-sm hover:shadow-md transition-all">
      <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity text-ink-primary">
        <Icon size={120} />
      </div>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-${color.split('-')[1]}`}>
          <Icon size={20} />
        </div>
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{detail}</span>
      </div>
      <h3 className="text-3xl font-black text-ink-primary mb-1 uppercase tracking-tighter">{value}</h3>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas p-8 lg:p-12 pb-32">
      {/* Nexus Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-ink-primary text-white rounded-lg shadow-xl">
              <Shield size={24} />
            </div>
            <h1 className="text-2xl font-black text-ink-primary uppercase tracking-tighter">The Nexus Protocol</h1>
          </div>
          <p className="text-[10px] font-semibold text-gray-600 tracking-[0.2em] uppercase">Global Platform Governance & Tenant Orchestration</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-white border border-black/5 rounded-full shadow-sm">
            <button 
              onClick={() => setActiveView('TENANTS')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black transition-all ${activeView === 'TENANTS' ? 'bg-ink-primary text-white' : 'text-gray-400 hover:text-ink-primary'}`}
            >
              <Users size={14} />
              TENANTS
            </button>
            <button 
              onClick={() => setActiveView('DIAGNOSTICS')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black transition-all ${activeView === 'DIAGNOSTICS' ? 'bg-ink-primary text-white' : 'text-gray-400 hover:text-ink-primary'}`}
            >
              <Activity size={14} />
              DIAGNOSTICS
            </button>
          </div>
          
          <div className="glass-panel border-black/5 bg-white px-6 py-4 flex items-center gap-4 shadow-sm">
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Administrator</p>
              <p className="text-sm font-bold text-ink-primary">{currentUser?.name || 'Uvaize'}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-accent-signature flex items-center justify-center text-ink-primary font-black">
              {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-100 hover:border-red-200 transition-all"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Global Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-12">
        <StatCard label="Active Tenants" value={globalStats.totalTenants} icon={Building} color="bg-blue-600" detail="LIFETIME" />
        <StatCard label="Platform Users" value={globalStats.activeUsers} icon={Users} color="bg-emerald-600" detail="REAL-TIME" />
        <StatCard label="System Integrity" value={globalStats.systemHealth} icon={Activity} color="bg-amber-600" detail="STABLE" />
        <StatCard label="Database Volume" value={globalStats.dbSize} icon={Database} color="bg-purple-600" detail="94% FREE" />
      </div>

      {/* Bug Reports — tenant-submitted issues */}
      <div className="mb-12">
        <BugReportsAdmin tenants={tenants} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {activeView === 'TENANTS' ? (
          <>
            {/* Tenant Registry */}
            <div className="lg:col-span-2 space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-black text-ink-primary uppercase tracking-widest flex items-center gap-3">
                  <Globe size={16} className="text-accent-signature" />
                  Tenant Registry
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="SEARCH SLUG..." 
                      className="bg-white border border-black/10 rounded-full pl-10 pr-4 py-2 text-[10px] font-bold text-ink-primary outline-none focus:border-accent-signature/50 transition-all uppercase"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="glass-panel !p-0 border-black/5 bg-white overflow-hidden shadow-premium">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-black/5">
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Business Detail</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Slug</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Tier</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {tenants.filter(t => (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (t.slug || '').toLowerCase().includes(searchQuery.toLowerCase())).map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-accent-signature/20 flex items-center justify-center text-ink-primary font-black text-sm">
                              {tenant.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-ink-primary uppercase">{tenant.name}</p>
                              <p className="text-[9px] text-gray-500 font-semibold">{new Date(tenant.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-[10px] bg-canvas px-2 py-1 rounded text-ink-primary font-bold">/{tenant.slug}</code>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            tenant.plan === 'ENTERPRISE' ? 'bg-purple-50 text-purple-600' :
                            tenant.plan === 'PRO' ? 'bg-blue-50 text-blue-600' :
                            'bg-gray-100 text-gray-500'
                          } border border-current`}>{tenant.plan || 'STARTER'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`flex items-center gap-2 text-[10px] font-bold ${tenant.status === 'SUSPENDED' ? 'text-red-500' : 'text-emerald-600'}`}>
                            {tenant.status === 'SUSPENDED' ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                            {tenant.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setIsDrawerOpen(true);
                            }}
                            className="p-2 hover:bg-black/5 rounded-lg text-gray-400 hover:text-amber-600 transition-all"
                            title="Manage Tenant"
                          >
                            <Settings size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {loading && (
                      <tr>
                        <td colSpan="5" className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <RefreshCcw size={32} className="text-accent-signature animate-spin" />
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Accessing Nexus Records...</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Side Panel (Actions & Pulse) */}
            <div className="space-y-6">
              <h2 className="text-sm font-black text-ink-primary uppercase tracking-widest flex items-center gap-3">
                <Zap size={16} className="text-accent-signature" />
                Operational Console
              </h2>
              
              <div className="glass-panel border-black/5 bg-white p-6 space-y-6 shadow-premium">
                <p className="text-[11px] font-bold text-gray-500 uppercase mb-4">Manual Orchestration</p>
                <button 
                  onClick={() => setIsProvisioning(true)}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-canvas hover:bg-gray-100 border border-black/5 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent-signature/20 text-ink-primary"><Plus size={16} /></div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-ink-primary uppercase">Provision Workspace</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wide">Automated Database Orchestration</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 group-hover:text-accent-signature transition-colors" />
                </button>

                <button 
                  onClick={() => {
                    cacheClear();
                    addNotification('Global Cache Purge triggered successfully', 'success');
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-canvas hover:bg-gray-100 border border-black/5 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><RefreshCcw size={16} /></div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-ink-primary uppercase">Global Cache Reset</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wide">Flush Cloud Instance Data</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 group-hover:text-amber-600 transition-colors" />
                </button>

                <button 
                  onClick={() => {
                    const newState = !isMaintenance;
                    setIsMaintenance(newState);
                    addNotification(newState ? 'Platform-wide lock active' : 'Platform-wide lock released', newState ? 'warning' : 'success');
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all group ${isMaintenance ? 'bg-red-600 text-white border-red-700 hover:bg-red-700' : 'bg-red-50 hover:bg-red-100 border-red-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isMaintenance ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}><Ban size={16} /></div>
                    <div className="text-left">
                      <p className={`text-xs font-bold uppercase ${isMaintenance ? 'text-white' : 'text-red-600'}`}>{isMaintenance ? 'Release Global Lock' : 'Emergency Suspension'}</p>
                      <p className={`text-[8px] font-bold uppercase tracking-wide ${isMaintenance ? 'text-white/70' : 'text-red-400'}`}>{isMaintenance ? 'Platform is currently RESTRICTED' : 'Lock All Tenant Transactions'}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className={`transition-colors ${isMaintenance ? 'text-white/40 group-hover:text-white' : 'text-gray-400 group-hover:text-red-500'}`} />
                </button>
              </div>

              {/* Global Pulse Feed */}
              <div className="glass-panel border-black/5 bg-white p-6 shadow-premium relative overflow-hidden">
                <div className="absolute top-6 right-6 flex gap-1">
                  <div className="w-1 h-3 bg-accent-signature/20 rounded-full animate-pulse"></div>
                  <div className="w-1 h-5 bg-accent-signature/40 rounded-full animate-pulse delay-75"></div>
                  <div className="w-1 h-2 bg-accent-signature/20 rounded-full animate-pulse delay-150"></div>
                </div>
                
                <h2 className="text-[10px] font-black text-ink-primary/40 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                  <Activity size={14} className="text-accent-signature animate-pulse" />
                  Global Pulse Hub
                </h2>

                <div className="space-y-6">
                  {recentActivities.length === 0 && !loading && (
                    <p className="text-[9px] font-bold text-gray-400 uppercase text-center py-10 tracking-widest">No live telemetry detected</p>
                  )}
                  {recentActivities.map((activity, idx) => (
                    <div key={activity.id + idx} className="flex gap-4 group cursor-default transition-all">
                      <div className={`shrink-0 w-8 h-8 rounded-lg bg-white border border-gray-300 shadow-sm flex items-center justify-center ${activity.color} shadow-sm group-hover:scale-110 transition-transform`}>
                        <activity.icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-[9px] font-black text-ink-primary uppercase tracking-tight truncate">{activity.tenant?.name || 'System Override'}</p>
                          <span className="text-[8px] font-bold text-gray-400 capitalize">{new Date(activity.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-[10px] font-semibold text-gray-500 truncate">{activity.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="lg:col-span-3">
            <ErrorDiagnosticsPanel />
          </div>
        )}
      </div>

      {/* Tenant Management Drawer */}
      {isDrawerOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-black/5 animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-black/5 flex items-center justify-between bg-canvas">
              <div>
                <h2 className="text-lg font-black text-ink-primary uppercase tracking-tight">Manage Tenant</h2>
                <p className="text-[10px] font-bold text-ink-primary/40 uppercase tracking-widest">{selectedTenant.name}</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 hover:bg-black/5 rounded-full text-ink-primary/50 hover:text-ink-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <section>
                <h3 className="text-[10px] font-black text-ink-primary/30 uppercase tracking-widest mb-4">Core Identity</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-ink-primary/60 uppercase mb-1.5 ml-1">Business Name</label>
                    <input type="text" defaultValue={selectedTenant.name} ref={nameRef} autoComplete="off" className="w-full px-4 py-3 bg-white border border-gray-300 shadow-sm rounded-xl text-xs font-bold focus:ring-2 focus:ring-accent-signature/20 focus:border-accent-signature outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-ink-primary/60 uppercase mb-1.5 ml-1">Workspace Slug</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-primary/30 text-xs font-bold">/</span>
                      <input type="text" defaultValue={selectedTenant.slug} ref={slugRef} autoComplete="off" className="w-full pl-7 pr-4 py-3 bg-white border border-gray-300 shadow-sm rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-accent-signature/20 focus:border-accent-signature outline-none transition-all uppercase" />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black text-ink-primary/30 uppercase tracking-widest mb-4">Subscription Plan</h3>
                <div className="grid grid-cols-3 gap-3">
                  {['STARTER', 'PRO', 'ENTERPRISE'].map(plan => (
                    <button
                      key={plan}
                      onClick={async () => {
                        try {
                          const { error } = await supabase.from('tenants').update({ plan }).eq('id', selectedTenant.id);
                          if (error) throw error;
                          setSelectedTenant({ ...selectedTenant, plan });
                          fetchGlobalData();
                        } catch (err) {
                          console.error("Plan switch error:", err);
                        }
                      }}
                      className={`px-3 py-4 rounded-2xl border text-center transition-all ${selectedTenant.plan === plan ? 'bg-accent-signature text-white border-accent-signature shadow-xl shadow-accent-signature/20' : 'bg-white text-ink-primary/60 border-black/5 hover:border-black/20'}`}
                    >
                      <div className="text-[8px] font-black opacity-60 mb-1 tracking-tighter">TIER</div>
                      <div className="text-[10px] font-black tracking-tight">{plan}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="bg-amber-50 rounded-2xl p-5 border border-amber-100 shadow-sm">
                <div className="flex items-start mb-4">
                  <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700 mr-3 shadow-inner">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-900 uppercase tracking-tight">Operations Bridge</h4>
                    <p className="text-[10px] font-bold text-amber-700/80 mt-1 uppercase">Enter this workspace for support.</p>
                  </div>
                </div>
                <button 
                  onClick={() => impersonateTenant(selectedTenant)}
                  className="w-full py-3.5 bg-white border border-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase flex items-center justify-center hover:bg-amber-100 transition-all shadow-sm active:scale-[0.98]"
                >
                  <LogIn size={14} className="mr-2" />
                  Request Access Bridge
                </button>
              </section>

              <section>
                <h3 className="text-[10px] font-black text-ink-primary/30 uppercase tracking-widest mb-4">Risk Management</h3>
                <div className={`flex items-center justify-between p-5 rounded-2xl border ${selectedTenant.status === 'SUSPENDED' ? 'bg-red-50 border-red-200' : 'bg-canvas border-black/5'}`}>
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-3 ${selectedTenant.status === 'SUSPENDED' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'}`}></div>
                    <span className="text-[10px] font-black text-ink-primary uppercase tracking-tight">{selectedTenant.status === 'SUSPENDED' ? 'Suspended' : 'Operational'}</span>
                  </div>
                  <button 
                    onClick={async () => {
                      const newStatus = selectedTenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
                      const { error } = await supabase.from('tenants').update({ status: newStatus }).eq('id', selectedTenant.id);
                      if (!error) {
                        setSelectedTenant({ ...selectedTenant, status: newStatus });
                        fetchGlobalData();
                      }
                    }}
                    className={`text-[10px] font-black transition-colors px-4 py-2 rounded-xl border uppercase tracking-tighter ${selectedTenant.status === 'SUSPENDED' ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}
                  >
                    {selectedTenant.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                  </button>
                </div>
              </section>
            </div>

            <div className="p-6 border-t border-black/5 bg-canvas sticky bottom-0">
              <div className="flex space-x-3">
                <button onClick={() => setIsDrawerOpen(false)} className="flex-1 py-3.5 bg-white border border-black/10 text-ink-primary text-[10px] font-black uppercase rounded-xl hover:bg-black/5 shadow-sm">Discard</button>
                <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3.5 bg-ink-primary text-white text-[10px] font-black uppercase rounded-xl hover:opacity-90 disabled:opacity-50 shadow-2xl shadow-black/20">
                  {isSaving ? 'Sealing...' : 'Seal Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Provisioning Drawer */}
      {isProvisioning && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsProvisioning(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-black/5 animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-black/5 flex items-center justify-between bg-canvas">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 text-white rounded-lg shadow-lg">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-ink-primary uppercase tracking-tight">Provision Workspace</h2>
                  <p className="text-[10px] font-bold text-ink-primary/40 uppercase tracking-widest">Deploy New Infrastructure instance</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProvisioning(false)}
                className="p-2 hover:bg-black/5 rounded-full text-ink-primary/50 hover:text-ink-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <section className="space-y-6">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-800 text-[10px] font-bold uppercase leading-relaxed tracking-wide">
                  Creating a new workspace will automatically provision a unique database silo, slug, and administrator context.
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-ink-primary/60 uppercase mb-1.5 ml-1 tracking-widest">Business Legal Entity Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. ACME LOGISTICS LTD" 
                      autoComplete="off" 
                      className="w-full px-5 py-4 bg-white border border-gray-300 shadow-sm rounded-2xl text-sm font-bold focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all uppercase placeholder:text-gray-300" 
                      value={provisioningData.businessName}
                      onChange={e => setProvisioningData({...provisioningData, businessName: e.target.value})}
                      disabled={isProvisioningLoading}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-ink-primary/60 uppercase mb-1.5 ml-1 tracking-widest">Subscription Tier</label>
                    <div className="grid grid-cols-3 gap-3">
                      {['STARTER', 'PRO', 'ENTERPRISE'].map(plan => (
                        <button
                          key={plan}
                          onClick={() => setProvisioningData({...provisioningData, plan})}
                          className={`px-3 py-4 rounded-xl border text-center transition-all ${provisioningData.plan === plan ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg' : 'bg-canvas text-ink-primary/60 border-black/5 hover:border-black/10'}`}
                        >
                          <div className="text-[9px] font-black tracking-tight">{plan}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {provisioningError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[10px] font-bold text-center uppercase">
                  {provisioningError}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-black/5 bg-canvas sticky bottom-0">
              <button 
                onClick={handleProvision}
                disabled={!provisioningData.businessName.trim() || isProvisioningLoading}
                className="w-full py-4 bg-emerald-500 text-white text-xs font-black uppercase rounded-2xl hover:bg-emerald-600 disabled:opacity-50 shadow-2xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-3"
              >
                {isProvisioningLoading ? (
                  <>
                    <RefreshCcw size={16} className="animate-spin" />
                    Deploying Instance...
                  </>
                ) : (
                  <>
                    <Database size={16} />
                    INITIALIZE INFRASTRUCTURE
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminPortal;
