import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import ReportShell from '../components/reports/ReportShell';
import SalesReport from '../components/reports/SalesReport';
import InventoryReport from '../components/reports/InventoryReport';
import ClientOutstandingReport from '../components/reports/ClientOutstandingReport';
import PurchasesReport from '../components/reports/PurchasesReport';
import ExpensesReport from '../components/reports/ExpensesReport';
import HRReport from '../components/reports/HRReport';
import LogisticsReport from '../components/reports/LogisticsReport';
import FinancialReport from '../components/reports/FinancialReport';

import { 
  TrendingUp, Package, UserCircle, Truck, 
  DollarSign, Briefcase, Activity, Shield, Layers,
  Globe, Landmark, BarChart3
} from 'lucide-react';

const Reports = () => {
  const { hasPermission } = useAppContext();
  const [activeTab, setActiveTab] = useState('SALES');

  // Role-based Tab Access Control (Rule 11)
  const TABS = [
    { id: 'SALES', label: 'Sales Intelligence', icon: <TrendingUp size={18} />, component: <SalesReport />, permission: 'sales' },
    { id: 'INVENTORY', label: 'Inventory Intelligence', icon: <Layers size={18} />, component: <InventoryReport />, permission: 'inventory' },
    { id: 'FINANCIALS', label: 'Financial Matrix', icon: <Landmark size={18} />, component: <FinancialReport />, permission: 'reports' },
    { id: 'LOGISTICS', label: 'Fleet Optimization', icon: <Globe size={18} />, component: <LogisticsReport />, permission: 'inventory' },
    { id: 'HR', label: 'Workforce Analysis', icon: <Briefcase size={18} />, component: <HRReport />, permission: 'reports' },
    { id: 'CLIENTS', label: 'Client Exposure', icon: <UserCircle size={18} />, component: <ClientOutstandingReport />, permission: 'clients' },
    { id: 'PURCHASES', label: 'Purchases', icon: <Truck size={18} />, component: <PurchasesReport />, permission: 'inventory' },
    { id: 'EXPENSES', label: 'Expenses', icon: <DollarSign size={18} />, component: <ExpensesReport />, permission: 'expenses' }
  ].filter(tab => hasPermission(tab.permission, 'view'));

  const currentTab = TABS.find(t => t.id === activeTab) || TABS[0];

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Universal Breadcrumb / Context Identifier */}
      <div className="no-print flex items-center gap-2 px-6 py-2 bg-white/40 backdrop-blur-md border border-black/5 rounded-pill w-fit shadow-sm">
        <Activity size={12} className="text-accent-signature" />
        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
          BI TERMINAL <span className="mx-2 opacity-30">/</span> {currentTab?.label}
        </span>
      </div>

      {/* Modern Tab Switcher (Rule 1) */}
      <div className="no-print flex items-center gap-1.5 p-1.5 bg-white/60 backdrop-blur-3xl border border-black/5 rounded-[2.5rem] shadow-glass overflow-x-auto no-scrollbar scroll-smooth">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-3 px-8 py-3 rounded-full text-[10px] font-black transition-all whitespace-nowrap uppercase tracking-widest
              ${activeTab === tab.id 
                ? 'bg-ink-primary text-white shadow-2xl scale-[1.05]' 
                : 'text-gray-500 hover:text-ink-primary hover:bg-white/40'}
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Report Node */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        {currentTab?.component}
      </div>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-4 py-12 opacity-20 no-print">
        <Shield size={16} />
        <span className="text-[8px] font-black uppercase tracking-[0.2em]">End-to-End Encrypted Analytical Node</span>
      </div>
    </div>
  );
};

export default Reports;
