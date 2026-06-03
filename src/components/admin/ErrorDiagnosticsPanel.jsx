import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  AlertCircle, ShieldAlert, Activity, CheckCircle2, 
  ChevronDown, ChevronUp, Filter, RefreshCcw, Search, Clock, Zap
} from 'lucide-react';

const ErrorDiagnosticsPanel = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterModule, setFilterModule] = useState('ALL');
  const [expandedRow, setExpandedRow] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    active: 0
  });

  useEffect(() => {
    fetchLogs();
    
    // 1. Real-time Subscription (Nexus Error Pulse)
    const channel = supabase
      .channel('diagnostics_pulse')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'platform_error_logs' 
      }, (payload) => {
        setLogs(prev => [payload.new, ...prev]);
        updateStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    updateStats();
  }, [logs]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching diagnostic logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('platform_error_logs')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      setLogs(prev => prev.map(log => log.id === id ? { ...log, status } : log));
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  const updateStats = () => {
    setStats({
      total: logs.length,
      critical: logs.filter(l => l.severity === 'Critical' && l.status === 'New').length,
      active: logs.filter(l => l.status === 'New').length
    });
  };

  const filteredLogs = logs.filter(log => {
    const matchesSeverity = filterSeverity === 'ALL' || log.severity === filterSeverity;
    const matchesModule = filterModule === 'ALL' || log.module === filterModule;
    return matchesSeverity && matchesModule;
  });

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 'Critical': return 'text-red-500 bg-red-50 border-red-200';
      case 'High': return 'text-orange-500 bg-orange-50 border-orange-200';
      case 'Medium': return 'text-amber-500 bg-amber-50 border-amber-200';
      default: return 'text-blue-500 bg-blue-50 border-blue-200';
    }
  };

  const StatCard = ({ label, value, icon: Icon, color }) => (
    <div className="glass-panel border-black/5 bg-white p-5 flex items-center gap-4 shadow-sm">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-${color.split('-')[1]}`}>
        <Icon size={20} />
      </div>
      <div>
        <h4 className="text-2xl font-black text-ink-primary tracking-tighter uppercase leading-none">{value}</h4>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* 1. Summary Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Logged Issues" value={stats.total} icon={Activity} color="bg-amber-600" />
        <StatCard label="Critical & Unresolved" value={stats.critical} icon={ShieldAlert} color="bg-red-600" />
        <StatCard label="Most Viral Tenant" value="LEDGR PRIMARY" icon={Zap} color="bg-emerald-600" />
      </div>

      {/* 2. Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel border-black/5 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            <select 
              value={filterSeverity} 
              onChange={e => setFilterSeverity(e.target.value)}
              className="text-[10px] font-black text-ink-primary bg-transparent outline-none uppercase tracking-widest cursor-pointer"
            >
              <option value="ALL">ALL SEVERITIES</option>
              <option value="Critical">CRITICAL</option>
              <option value="High">HIGH</option>
              <option value="Medium">MEDIUM</option>
              <option value="Low">LOW</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            <select 
              value={filterModule} 
              onChange={e => setFilterModule(e.target.value)}
              className="text-[10px] font-black text-ink-primary bg-transparent outline-none uppercase tracking-widest cursor-pointer"
            >
              <option value="ALL">ALL MODULES</option>
              <option value="Inventory">INVENTORY</option>
              <option value="Sales">SALES</option>
              <option value="Finance">FINANCE</option>
              <option value="Auth">AUTH</option>
            </select>
          </div>
        </div>

        <button 
          onClick={fetchLogs}
          className="flex items-center gap-2 text-[10px] font-black text-accent-signature uppercase tracking-widest hover:opacity-70 transition-all"
        >
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          Force Sync
        </button>
      </div>

      {/* 3. Diagnostic Table */}
      <div className="glass-panel !p-0 border-black/5 bg-white shadow-premium overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-canvas/50 border-b border-black/5">
              <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Temporal Node</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Context</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Failure Signature</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Drill-down</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filteredLogs.map((log) => (
              <React.Fragment key={log.id}>
                <tr className={`hover:bg-gray-50 transition-colors ${log.severity === 'Critical' ? 'bg-red-50/10' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-ink-primary flex items-center gap-2">
                        <Clock size={10} className="text-gray-400" />
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                      <span className="text-[9px] text-gray-400 font-bold mt-1">{new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-ink-primary uppercase tracking-tight truncate max-w-[150px]">
                        {log.tenant_id ? 'IDENTIFIED TENANT' : 'SYSTEM OVERRIDE'}
                      </span>
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-0.5">{log.module}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col max-w-sm">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border mb-2 w-fit ${getSeverityColor(log.severity)}`}>
                        {log.severity}
                      </span>
                      <p className="text-[10px] font-bold text-ink-primary truncate overflow-hidden">{log.error_message}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{log.action}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={log.status}
                      onChange={(e) => updateStatus(log.id, e.target.value)}
                      className={`text-[9px] font-black px-2 py-1 rounded-lg border outline-none
                        ${log.status === 'Resolved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                          log.status === 'Acknowledged' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                          'bg-red-50 text-red-600 border-red-100 animate-pulse'}
                      `}
                    >
                      <option value="New">NEW</option>
                      <option value="Acknowledged">ACK</option>
                      <option value="Resolved">SOLVED</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                      className="p-2 hover:bg-black/5 rounded-full text-gray-400 transition-all"
                    >
                      {expandedRow === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </td>
                </tr>
                {expandedRow === log.id && (
                  <tr className="bg-canvas border-l-4 border-l-accent-signature/50">
                    <td colSpan="5" className="px-12 py-8 transition-all animate-in slide-in-from-top-4 duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Diagnostic Trace</h5>
                          <pre className="p-4 bg-ink-primary text-gray-300 text-[10px] leading-relaxed rounded-2xl border border-white/5 overflow-x-auto selection:bg-accent-signature/30 max-h-[300px] no-scrollbar shadow-2xl">
                            {log.stack_trace || 'No manual trace captured.'}
                          </pre>
                        </div>
                        <div className="space-y-6">
                          <div>
                            <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Context Matrix</h5>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="glass-panel border-white/5 bg-white/50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-gray-400 uppercase">Tenant ID</p>
                                <p className="text-[9px] font-black text-ink-primary font-mono truncate">{log.tenant_id}</p>
                              </div>
                              <div className="glass-panel border-white/5 bg-white/50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-gray-400 uppercase">Plan Tier</p>
                                <p className="text-[9px] font-black text-amber-600">{log.plan_tier}</p>
                              </div>
                              <div className="glass-panel border-white/5 bg-white/50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-gray-400 uppercase">Actor Role</p>
                                <p className="text-[9px] font-black text-emerald-600">{log.user_role}</p>
                              </div>
                              <div className="glass-panel border-white/5 bg-white/50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-gray-400 uppercase">Postgres Code</p>
                                <p className="text-[9px] font-black text-red-600">{log.error_code}</p>
                              </div>
                            </div>
                          </div>
                          <div className="pt-4">
                            <button className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-white text-[10px] font-black uppercase rounded-pill shadow-xl shadow-black/20 hover:scale-[1.02] transition-all">
                              <ShieldAlert size={14} className="text-accent-signature" />
                              Escalate to DB Engineer
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                </tr>
                )}
              </React.Fragment>
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center gap-4 opacity-30">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">System Integrity Validated • No Active Faults</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ErrorDiagnosticsPanel;
