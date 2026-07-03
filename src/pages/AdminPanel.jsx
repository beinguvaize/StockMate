import React, { useState, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { PLANS, TENANT_STATUS, getPlanBadge } from '../lib/tenancy';
import { SkeletonRows } from '../components/ui/States';
import { 
  Building2, Users, Activity, Shield, ChevronRight, 
  Search, Plus, ToggleLeft, ToggleRight, Eye, 
  Zap, Crown, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('ALL');

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch user counts per tenant
      const { data: userCounts } = await supabase
        .from('users')
        .select('tenant_id');

      const countMap = {};
      (userCounts || []).forEach(u => {
        countMap[u.tenant_id] = (countMap[u.tenant_id] || 0) + 1;
      });

      setTenants((data || []).map(t => ({
        ...t,
        userCount: countMap[t.id] || 0
      })));
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
      addNotification('Failed to load tenants', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleTenantStatus = async (tenant) => {
    const newStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const { error } = await supabase
      .from('tenants')
      .update({ status: newStatus })
      .eq('id', tenant.id);

    if (error) {
      addNotification('Failed to update tenant status', 'error');
      return;
    }

    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, status: newStatus } : t));
    addNotification(`${tenant.name} ${newStatus === 'ACTIVE' ? 'activated' : 'suspended'}`, 'success');
  };

  const updatePlan = async (tenant, newPlan) => {
    const { error } = await supabase
      .from('tenants')
      .update({ plan: newPlan })
      .eq('id', tenant.id);

    if (error) {
      addNotification('Failed to update plan', 'error');
      return;
    }

    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, plan: newPlan } : t));
    addNotification(`${tenant.name} upgraded to ${newPlan}`, 'success');
  };

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.slug || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlan = selectedPlan === 'ALL' || t.plan === selectedPlan;
    return matchesSearch && matchesPlan;
  });

  // KPI calculations
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'ACTIVE').length;
  const totalUsers = tenants.reduce((sum, t) => sum + (t.userCount || 0), 0);
  const enterpriseTenants = tenants.filter(t => t.plan === 'ENTERPRISE').length;

  return (
    <div className="min-h-screen bg-canvas font-inter p-6 md:p-12">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-8 border-b border-black/5 mb-8">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-ink-primary mb-4 transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Workspace
            </button>
            <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">
              ADMIN<span className="text-accent-signature">.</span>
            </h1>
            <p className="text-[10px] font-semibold text-gray-600 opacity-80 uppercase">
              MULTI-TENANT CONTROL CENTER
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-100">
              <Shield size={14} className="text-purple-600" />
              <span className="text-[10px] font-bold text-purple-600">GLOBAL ADMIN</span>
            </div>
          </div>
        </div>

        {/* KPI Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tenants', value: totalTenants, icon: <Building2 size={20} />, color: 'text-blue-600 bg-blue-50' },
            { label: 'Active', value: activeTenants, icon: <Activity size={20} />, color: 'text-green-600 bg-green-50' },
            { label: 'Total Users', value: totalUsers, icon: <Users size={20} />, color: 'text-amber-600 bg-amber-50' },
            { label: 'Enterprise', value: enterpriseTenants, icon: <Crown size={20} />, color: 'text-purple-600 bg-purple-50' },
          ].map((kpi, i) => (
            <div key={i} className="glass-panel !rounded-bento p-5 border border-black/5">
              <div className={`w-10 h-10 rounded-xl ${kpi.color} flex items-center justify-center mb-3`}>
                {kpi.icon}
              </div>
              <p className="text-3xl font-bold text-ink-primary font-sora">{kpi.value}</p>
              <p className="text-[10px] font-semibold text-gray-600 opacity-80 uppercase mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field !pl-12 !rounded-xl !py-3 font-medium text-sm !bg-white border border-gray-300 shadow-sm w-full"
            />
          </div>
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-black/5">
            {['ALL', 'FREE', 'GROWTH', 'PRO', 'ENTERPRISE'].map(plan => (
              <button
                key={plan}
                onClick={() => setSelectedPlan(plan)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  selectedPlan === plan
                    ? 'bg-ink-primary text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {plan}
              </button>
            ))}
          </div>
        </div>

        {/* Tenant List */}
        {loading ? (
          <div className="rounded-2xl border border-black/[0.07] bg-white"><SkeletonRows rows={6} /></div>
        ) : (
          <div className="space-y-3">
            {filteredTenants.map(tenant => {
              const statusConfig = TENANT_STATUS[tenant.status] || TENANT_STATUS.ACTIVE;
              return (
                <div
                  key={tenant.id}
                  className="glass-panel !rounded-2xl p-5 border border-black/5 hover:border-accent-signature/20 transition-all group"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Tenant Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-accent-signature/10 flex items-center justify-center text-accent-signature font-bold text-lg shrink-0">
                        {tenant.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-ink-primary truncate">{tenant.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-medium text-gray-500">/{tenant.slug}</span>
                          <span className="text-[9px] text-gray-400">•</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Plan Badge */}
                    <div className="flex items-center gap-3">
                      <select
                        value={tenant.plan}
                        onChange={(e) => updatePlan(tenant, e.target.value)}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border-0 appearance-none cursor-pointer ${getPlanBadge(tenant.plan)}`}
                      >
                        <option value="FREE">FREE</option>
                        <option value="GROWTH">GROWTH</option>
                        <option value="PRO">PRO</option>
                        <option value="ENTERPRISE">ENTERPRISE</option>
                      </select>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-lg font-bold text-ink-primary">{tenant.userCount || 0}</p>
                        <p className="text-[9px] font-semibold text-gray-500 uppercase">Users</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-medium text-gray-500">
                          {new Date(tenant.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                        </p>
                        <p className="text-[9px] font-semibold text-gray-500 uppercase">Created</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTenantStatus(tenant)}
                        className={`p-2 rounded-lg transition-colors ${
                          tenant.status === 'ACTIVE'
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-red-500 hover:bg-red-50'
                        }`}
                        title={tenant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      >
                        {tenant.status === 'ACTIVE' ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        onClick={() => navigate(`/${tenant.slug}/dashboard`)}
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-ink-primary transition-colors"
                        title="Impersonate"
                      >
                        <Eye size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredTenants.length === 0 && (
              <div className="text-center py-16 text-gray-500">
                <Building2 size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm font-semibold">No tenants found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
