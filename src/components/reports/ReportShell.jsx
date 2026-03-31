/**
 * ⚠️ STRICT VISUAL LOCK: GILDED GLASS ARCHITECTURE
 * -----------------------------------------------
 * This component's layout and glassmorphic styling are LOCKED.
 * Do not modify the backdrop-blur, opacity, or border tokens.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import ReportFilterBar from './ReportFilterBar';
import ReportKPICards from './ReportKPICards';
import ReportChartSection from './ReportChartSection';
import ReportTable from './ReportTable';
import ReportDetailPanel from './ReportDetailPanel';
import { 
  TrendingUp, Package, UserCircle, Truck, 
  Briefcase, Shield, LayoutGrid, DollarSign,
  Activity, Info
} from 'lucide-react';

/**
 * ReportShell Component
 * 
 * Provides the overall structure, tab management, and state persistence for all reports.
 * 
 * Props:
 * @param {Array} tabs - [{ id, label, icon, permission, table, select, dateColumn, columns, kpiConfig, chartConfig, detailFields }]
 */

const ReportShell = ({ 
  tabs = [] 
}) => {
  const { hasPermission, currentUser, businessProfile } = useAppContext();
  
  // 1. Role-based Access Control (Rule 11)
  const allowedTabs = useMemo(() => {
    return tabs.filter(tab => {
      if (!tab.permission) return true;
      return hasPermission(tab.permission, 'view');
    });
  }, [tabs, hasPermission]);

  // 2. State & Persistence (Rule 5)
  const [activeTabId, setActiveTabId] = useState(allowedTabs[0]?.id);
  const [globalFilters, setGlobalFilters] = useState({
    datePreset: 'MONTH',
    dateRange: { 
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    }
  });

  const activeTab = useMemo(() => 
    allowedTabs.find(t => t.id === activeTabId) || allowedTabs[0]
  , [activeTabId, allowedTabs]);

  // Sidebar / Detail View State (Rule 9)
  const [detailView, setDetailView] = useState({ isOpen: false, data: null });

  // Handle Tab Switch
  const handleTabChange = (tabId) => {
    setActiveTabId(tabId);
    // Note: Filter state persists as it's in globalFilters (Rule 5)
  };

  if (!activeTab) {
    return (
      <div className="flex flex-col items-center justify-center py-32 opacity-20">
        <Shield size={64} strokeWidth={1} />
        <p className="text-sm font-black uppercase mt-6 tracking-widest text-center">
          Access Denied <br /> Secure Sector Protocol Engaged
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-20">
      
      {/* 1. Header & Tab Navigation (Rule 1) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center no-print gap-6">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">
            REPORTS<span className="text-accent-signature">.</span>
          </h1>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-4 bg-accent-signature rounded-full animate-pulse" />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Business Intelligence Node — {activeTab.label} Perspective
            </p>
          </div>
        </div>

        {/* Tab Scroller (Rule 1) */}
        <div className="no-print flex items-center gap-1.5 p-1.5 bg-white/60 backdrop-blur-3xl border border-black/5 rounded-[2.5rem] shadow-glass overflow-x-auto no-scrollbar max-w-full sticky top-4 z-[40]">
          {allowedTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex items-center gap-3 px-6 py-3 rounded-full text-[10px] font-black transition-all whitespace-nowrap uppercase tracking-widest
                ${activeTabId === tab.id 
                  ? 'bg-ink-primary text-white shadow-2xl scale-[1.05] z-10' 
                  : 'text-gray-500 hover:text-ink-primary hover:bg-white/40'}
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Global Filter Bar (Rule 5) */}
      <ReportFilterBar 
        filters={globalFilters} 
        setFilters={setGlobalFilters} 
        config={activeTab.filterConfig || []}
        onExport={() => activeTab.onExport?.(globalFilters)}
        lastUpdated={new Date().toISOString()} // Simulating live sync
      />

      {/* 3. Metrics Row (KPI Cards) (Rule 4) */}
      <ReportKPICards 
        cards={activeTab.kpis || []} 
        onCardClick={(metricId) => {
          setGlobalFilters(prev => ({ ...prev, activeMetric: metricId }));
        }}
        activeCardId={globalFilters.activeMetric}
      />

      {/* 4. Chart Visualization (Rule 7) */}
      {activeTab.chartConfig && (
        <ReportChartSection 
          {...activeTab.chartConfig}
          onSegmentClick={(segment) => {
            setGlobalFilters(prev => ({ ...prev, activeSegment: segment.name }));
          }}
        />
      )}

      {/* 5. Detailed Data Table (Rule 2) */}
      <ReportTable 
        columns={activeTab.columns || []}
        data={activeTab.data || []}
        loading={activeTab.loading}
        totalsRow={activeTab.totals}
        onRowClick={(row) => setDetailView({ isOpen: true, data: row })}
        searchTerm={globalFilters.search}
      />

      {/* 6. Context Side Panel (Rule 9) */}
      <ReportDetailPanel 
        isOpen={detailView.isOpen} 
        onClose={() => setDetailView({ isOpen: false, data: null })}
        data={detailView.data}
        title={`${activeTab.label} Record`}
        fields={activeTab.detailFields || []}
      />

    </div>
  );
};

export default ReportShell;
