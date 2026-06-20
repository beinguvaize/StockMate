import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ReportShell from '../components/reports/ReportShell';
import BusinessReport from '../components/reports/BusinessReport';
import InventoryReport from '../components/reports/InventoryReport';
import ClientOutstandingReport from '../components/reports/ClientOutstandingReport';
import ExpensesReport from '../components/reports/ExpensesReport';
import HRReport from '../components/reports/HRReport';
import LogisticsReport from '../components/reports/LogisticsReport';
import FinancialReport from '../components/reports/FinancialReport';
// --- New accounting reports (P0) ---
import BalanceSheetReport from '../components/reports/BalanceSheetReport';
import TrialBalanceReport from '../components/reports/TrialBalanceReport';
import GeneralLedgerReport from '../components/reports/GeneralLedgerReport';
import CashFlowReport from '../components/reports/CashFlowReport';
import ARAgingReport from '../components/reports/ARAgingReport';
import APAgingReport from '../components/reports/APAgingReport';
import BudgetVsActualReport from '../components/reports/BudgetVsActualReport';
import YoYComparisonReport from '../components/reports/YoYComparisonReport';
import ProductProfitabilityReport from '../components/reports/ProductProfitabilityReport';
// --- GST / Tax compliance reports (P1) ---
import GSTR1Report from '../components/reports/GSTR1Report';
import GSTR3BReport from '../components/reports/GSTR3BReport';
import PurchaseRegisterReport from '../components/reports/PurchaseRegisterReport';
import ExpiryReport from '../components/reports/ExpiryReport';
import IMEISerialReport from '../components/reports/IMEISerialReport';
import DailySalesReport from '../components/reports/DailySalesReport';
// --- New operational reports ---
import ClientStatementReport from '../components/reports/ClientStatementReport';
import BillWiseProfitReport from '../components/reports/BillWiseProfitReport';
import LowStockReport from '../components/reports/LowStockReport';
import SalePurchaseByPartyReport from '../components/reports/SalePurchaseByPartyReport';
// --- New cross-analysis reports ---
import PartyProfitReport from '../components/reports/PartyProfitReport';
import CategoryProfitReport from '../components/reports/CategoryProfitReport';
import AllTransactionsReport from '../components/reports/AllTransactionsReport';
import ItemPartyReport from '../components/reports/ItemPartyReport';
import ProductSalesReport from '../components/reports/ProductSalesReport';
import PurchasesReport from '../components/reports/PurchasesReport';

import {
  TrendingUp, Package, UserCircle, Truck,
  DollarSign, Briefcase, Activity, Shield, Layers,
  Globe, Landmark, BarChart3, Scale, BookOpen, Droplets, FileWarning,
  FileText, FileCheck, Target, CalendarRange, Receipt, Tag,
  BookMarked, BarChart2, AlertTriangle, Users,
  PieChart, ArrowLeftRight, GitFork,
  Search, ChevronDown, ShoppingBag,
} from 'lucide-react';

const Reports = () => {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('BUSINESS');
  const [activeGroup, setActiveGroup] = useState('OPERATIONAL');

  // Three-level navigation: group → report
  // OPERATIONAL: day-to-day business intelligence
  // ACCOUNTING: formal financial statements (P0)
  // COMPLIANCE: GST / tax filing returns (P1)
  const TABS = [
    // --- OPERATIONAL GROUP ---
    { id: 'BUSINESS',    group: 'OPERATIONAL', label: 'Business Report',     icon: <TrendingUp size={18} />, component: <BusinessReport />,           permission: 'sales' },
    { id: 'DAILY_SALES', group: 'OPERATIONAL', label: 'Daily Sales',         icon: <BookMarked size={18} />, component: <DailySalesReport />,         permission: 'sales' },
    { id: 'INVENTORY',   group: 'OPERATIONAL', label: 'Inventory',           icon: <Layers size={18} />,     component: <InventoryReport />,          permission: 'inventory' },
    { id: 'PROFITABILITY', group: 'OPERATIONAL', label: 'Product Margins',   icon: <Tag size={18} />,        component: <ProductProfitabilityReport />, permission: 'inventory' },
    { id: 'LOGISTICS',   group: 'OPERATIONAL', label: 'Deliveries',          icon: <Globe size={18} />,      component: <LogisticsReport />,          permission: 'inventory' },
    { id: 'HR',          group: 'OPERATIONAL', label: 'Staff & Payroll',     icon: <Briefcase size={18} />,  component: <HRReport />,                 permission: 'reports' },
    { id: 'CLIENTS',     group: 'OPERATIONAL', label: 'Clients',             icon: <UserCircle size={18} />, component: <ClientOutstandingReport />,  permission: 'clients' },
    { id: 'EXPENSES',    group: 'OPERATIONAL', label: 'Expenses',            icon: <DollarSign size={18} />,     component: <ExpensesReport />,               permission: 'expenses' },
    { id: 'CLIENT_STATEMENT', group: 'OPERATIONAL', label: 'Client Statement', icon: <BookMarked size={18} />,   component: <ClientStatementReport />,        permission: 'clients' },
    { id: 'BILL_PROFIT',      group: 'OPERATIONAL', label: 'Bill Profit',      icon: <BarChart2 size={18} />,    component: <BillWiseProfitReport />,         permission: 'sales' },
    { id: 'LOW_STOCK',        group: 'OPERATIONAL', label: 'Low Stock',        icon: <AlertTriangle size={18} />,component: <LowStockReport />,               permission: 'inventory' },
    { id: 'EXPIRY',           group: 'OPERATIONAL', label: 'Expiry Tracking',  icon: <AlertTriangle size={18} />,component: <ExpiryReport />,                 permission: 'inventory' },
    { id: 'IMEI_SERIAL',      group: 'OPERATIONAL', label: 'IMEI / Serial',    icon: <Package size={18} />,      component: <IMEISerialReport />,             permission: 'inventory' },
    { id: 'SALES_BY_PARTY',   group: 'OPERATIONAL', label: 'Sales by Party',   icon: <Users size={18} />,        component: <SalePurchaseByPartyReport />,    permission: 'sales' },
    { id: 'PARTY_PROFIT',     group: 'OPERATIONAL', label: 'Party Profit',     icon: <PieChart size={18} />,     component: <PartyProfitReport />,            permission: 'reports' },
    { id: 'CATEGORY_PROFIT',  group: 'OPERATIONAL', label: 'Category Profit',  icon: <Tag size={18} />,          component: <CategoryProfitReport />,         permission: 'inventory' },
    { id: 'ALL_TRANSACTIONS', group: 'OPERATIONAL', label: 'All Transactions', icon: <ArrowLeftRight size={18} />, component: <AllTransactionsReport />,      permission: 'reports' },
    { id: 'ITEM_PARTY',       group: 'OPERATIONAL', label: 'Item × Party',     icon: <GitFork size={18} />,      component: <ItemPartyReport />,              permission: 'sales' },
    { id: 'PRODUCT_SALES',    group: 'OPERATIONAL', label: 'Product Sales',    icon: <Package size={18} />,      component: <ProductSalesReport />,           permission: 'sales' },
    { id: 'PURCHASES',        group: 'OPERATIONAL', label: 'Purchases',        icon: <ShoppingBag size={18} />,  component: <PurchasesReport />,              permission: 'purchases' },

    // --- ACCOUNTING GROUP ---
    { id: 'BALANCE_SHEET', group: 'ACCOUNTING', label: 'Balance Sheet',       icon: <Scale size={18} />,       component: <BalanceSheetReport />,   permission: 'reports' },
    { id: 'TRIAL_BALANCE', group: 'ACCOUNTING', label: 'Trial Balance',       icon: <Landmark size={18} />,    component: <TrialBalanceReport />,   permission: 'reports' },
    { id: 'GENERAL_LEDGER',group: 'ACCOUNTING', label: 'General Ledger',      icon: <BookOpen size={18} />,    component: <GeneralLedgerReport />,  permission: 'reports' },
    { id: 'CASH_FLOW',     group: 'ACCOUNTING', label: 'Cash Flow',           icon: <Droplets size={18} />,    component: <CashFlowReport />,       permission: 'reports' },
    { id: 'AR_AGING',      group: 'ACCOUNTING', label: 'Customer Aging',      icon: <FileWarning size={18} />, component: <ARAgingReport />,        permission: 'clients' },
    { id: 'AP_AGING',      group: 'ACCOUNTING', label: 'Supplier Aging',      icon: <Receipt size={18} />,     component: <APAgingReport />,        permission: 'inventory' },
    { id: 'BUDGET_ACTUAL', group: 'ACCOUNTING', label: 'Budget vs Actual',    icon: <Target size={18} />,      component: <BudgetVsActualReport />, permission: 'reports' },
    { id: 'YOY',           group: 'ACCOUNTING', label: 'Year Comparison',     icon: <CalendarRange size={18} />, component: <YoYComparisonReport />, permission: 'reports' },
    { id: 'FINANCIALS',    group: 'ACCOUNTING', label: 'Profit & Loss',       icon: <BarChart3 size={18} />,   component: <FinancialReport />,      permission: 'reports' },

    // --- COMPLIANCE GROUP (India GST) ---
    { id: 'GSTR1',  group: 'COMPLIANCE', label: 'GSTR-1',  icon: <FileText size={18} />,  component: <GSTR1Report />,  permission: 'reports' },
    { id: 'GSTR3B', group: 'COMPLIANCE', label: 'GSTR-3B', icon: <FileCheck size={18} />, component: <GSTR3BReport />, permission: 'reports' },
    { id: 'PURCHASE_REGISTER', group: 'COMPLIANCE', label: 'Purchase Register', icon: <FileText size={18} />, component: <PurchaseRegisterReport />, permission: 'reports' },
  ].filter(tab => hasPermission(tab.permission, 'view'));

  const groupedTabs = useMemo(() => {
    const groups = { OPERATIONAL: [], ACCOUNTING: [], COMPLIANCE: [] };
    TABS.forEach(t => {
      if (groups[t.group]) groups[t.group].push(t);
    });
    return groups;
  }, [TABS]);

  const visibleTabs = groupedTabs[activeGroup] || [];
  const currentTab = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];

  // Switch active tab when changing groups
  const handleGroupChange = (group) => {
    setActiveGroup(group);
    const firstTab = groupedTabs[group]?.[0];
    if (firstTab) setActiveTab(firstTab.id);
  };

  // ── Searchable report dropdown ──────────────────────────────────────
  const [tabSearch, setTabSearch]     = useState('');
  const [tabDropOpen, setTabDropOpen] = useState(false);
  const tabDropRef = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (tabDropRef.current && !tabDropRef.current.contains(e.target)) setTabDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filteredTabs = visibleTabs.filter(t =>
    t.label.toLowerCase().includes(tabSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Universal Breadcrumb / Context Identifier */}
      <div className="no-print flex items-center gap-2 px-6 py-2 bg-white/40 backdrop-blur-md border border-black/5 rounded-pill w-fit shadow-sm">
        <Activity size={12} className="text-accent-signature" />
        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
          REPORTS <span className="mx-2 opacity-30">/</span> {activeGroup} <span className="mx-2 opacity-30">/</span> {currentTab?.label}
        </span>
      </div>

      {/* Group Switcher: OPERATIONAL · ACCOUNTING · COMPLIANCE */}
      <div className="no-print flex items-center gap-2 flex-wrap">
        {[
          { key: 'OPERATIONAL', label: 'Operations', icon: <TrendingUp size={14} /> },
          { key: 'ACCOUNTING', label: 'Accounting', icon: <Scale size={14} /> },
          { key: 'COMPLIANCE', label: 'GST', icon: <FileCheck size={14} /> },
        ].map(({ key, label, icon }) => {
          const count = groupedTabs[key]?.length || 0;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => handleGroupChange(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                activeGroup === key
                  ? 'bg-ink-primary text-white shadow-lg'
                  : 'bg-white/60 text-gray-500 hover:text-ink-primary border border-black/5'
              }`}
            >
              {icon}
              {label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${
                activeGroup === key ? 'bg-white/20' : 'bg-black/5'
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Searchable report selector */}
      <div className="no-print relative w-full max-w-md" ref={tabDropRef}>
        <button
          onClick={() => setTabDropOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-3 bg-white border border-black/5 rounded-2xl shadow-sm hover:border-black/15 transition-all"
        >
          <span className="text-accent-signature shrink-0">{currentTab?.icon}</span>
          <span className="flex-1 text-left text-xs font-black uppercase tracking-widest text-ink-primary truncate">
            {currentTab?.label || 'Select report'}
          </span>
          <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${tabDropOpen ? 'rotate-180' : ''}`} />
        </button>
        {tabDropOpen && (
          <div className="absolute z-50 mt-2 left-0 right-0 bg-white border border-black/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="relative border-b border-black/5">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={tabSearch}
                onChange={e => setTabSearch(e.target.value)}
                placeholder="Search reports…"
                className="w-full pl-10 pr-4 py-3 text-xs font-semibold outline-none"
              />
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {filteredTabs.length === 0 && (
                <div className="px-4 py-6 text-center text-[11px] text-gray-400">
                  No report matches "{tabSearch}"
                </div>
              )}
              {filteredTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setTabDropOpen(false); setTabSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-accent-signature/8 text-ink-primary'
                      : 'text-gray-600 hover:bg-canvas'
                  }`}
                >
                  <span className={activeTab === tab.id ? 'text-accent-signature' : 'text-gray-400'}>{tab.icon}</span>
                  <span className="text-xs font-bold">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
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
