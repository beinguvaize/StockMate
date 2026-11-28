import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
import GSTR2BReconReport from '../components/reports/GSTR2BReconReport';
import ExpiryReport from '../components/reports/ExpiryReport';
import UnverifiedCostReport from '../components/reports/UnverifiedCostReport';
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
import ProductMovementReport from '../components/reports/ProductMovementReport';

import { BarChart3, ChevronDown, Search, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  REPORT_CATALOGUE, visibleReports, groupReports, groupChips, groupLabel,
  matchReports, searchCatalogue, findReport,
} from '../lib/reportsView';
import { FilterPills } from '../components/ui/Tabs';

// Each report's page. The list of reports, their groups, labels and
// permissions is lib/reportsView REPORT_CATALOGUE.
const PAGES = {
  BUSINESS: BusinessReport, DAILY_SALES: DailySalesReport, INVENTORY: InventoryReport,
  PROFITABILITY: ProductProfitabilityReport, LOGISTICS: LogisticsReport, HR: HRReport,
  CLIENTS: ClientOutstandingReport, EXPENSES: ExpensesReport, CLIENT_STATEMENT: ClientStatementReport,
  BILL_PROFIT: BillWiseProfitReport, LOW_STOCK: LowStockReport, EXPIRY: ExpiryReport,
  UNVERIFIED_COST: UnverifiedCostReport, IMEI_SERIAL: IMEISerialReport, SALES_BY_PARTY: SalePurchaseByPartyReport,
  PARTY_PROFIT: PartyProfitReport, CATEGORY_PROFIT: CategoryProfitReport, ALL_TRANSACTIONS: AllTransactionsReport,
  ITEM_PARTY: ItemPartyReport, PRODUCT_SALES: ProductSalesReport, PRODUCT_MOVEMENT: ProductMovementReport,
  PURCHASES: PurchasesReport,
  BALANCE_SHEET: BalanceSheetReport, TRIAL_BALANCE: TrialBalanceReport, GENERAL_LEDGER: GeneralLedgerReport,
  CASH_FLOW: CashFlowReport, AR_AGING: ARAgingReport, AP_AGING: APAgingReport,
  BUDGET_ACTUAL: BudgetVsActualReport, YOY: YoYComparisonReport, FINANCIALS: FinancialReport,
  GSTR1: GSTR1Report, GSTR3B: GSTR3BReport, PURCHASE_REGISTER: PurchaseRegisterReport, GSTR2B_RECON: GSTR2BReconReport,
};

const ReportIcon = () => (
  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-amber-soft text-amber-text" aria-hidden="true">
    <BarChart3 size={14} strokeWidth={2} />
  </span>
);

/** The searchable report picker (reports-01, 02): reports of the open group. */
function ReportPicker({ reports, current, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const list = matchReports(reports, q);
  return (
    <div className="relative w-full sm:w-auto" ref={ref}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cn('m-press flex w-full min-w-[300px] items-center gap-2.5 rounded-pill bg-surface py-[7px] pl-2 pr-3.5 font-tight text-[13.5px] font-semibold text-ink',
          open ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
        <ReportIcon />
        <b className="flex-1 truncate text-left font-semibold">{current?.label || 'Select report'}</b>
        <ChevronDown size={15} strokeWidth={2} className={cn('chevron-turn text-mute', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-pop absolute right-0 z-50 mt-2 w-full rounded-[14px] bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,.06),0_18px_40px_-14px_rgba(17,20,24,.35)] sm:w-[360px]">
          <label className="mx-0.5 mt-0.5 mb-1.5 flex items-center gap-2 rounded-[10px] bg-well px-2.5 py-2">
            <Search size={14} strokeWidth={2} className="text-mute" aria-hidden="true" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…"
              aria-label="Search reports" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-mute" />
          </label>
          <div role="listbox" className="max-h-80 overflow-y-auto">
            {list.length === 0 && <p className="px-2.5 py-[22px] text-center text-[13px] text-mute">No report matches "{q}"</p>}
            {list.map((r) => (
              <button data-card key={r.id} type="button" role="option" aria-selected={r.id === current?.id}
                onClick={() => { onPick(r.id); setOpen(false); setQ(''); }}
                className={cn('flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left font-tight text-[13px] font-semibold text-ink transition-colors duration-(--dur-press) hover:bg-tile',
                  r.id === current?.id && 'bg-tile')}>
                <BarChart3 size={16} strokeWidth={1.9} className="shrink-0 text-ink-2" aria-hidden="true" />{r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Every report in one place (reports-03). */
function ReportsHome({ grouped, total, onPick }) {
  const [q, setQ] = useState('');
  return (
    <div className="pb-16">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">Reports</h1>
          <p className="mt-[3px] text-[13px] text-body">All {total} reports in one place. Pick one to open it.</p>
        </div>
        <div className="flex-1" />
        <label className="relative w-full sm:w-[300px]">
          <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports" aria-label="Search reports"
            className="h-9 w-full rounded-pill bg-well pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
        </label>
      </div>
      {groupChips(grouped).map((g) => {
        const list = searchCatalogue(grouped[g.key], q);
        if (list.length === 0) return null;
        return (
          <section key={g.key} className="mb-[22px]">
            <div className="mb-2.5 flex items-baseline gap-2.5">
              <h3 className="font-tight text-[15px] font-semibold text-ink">{g.label}</h3>
              <small className="text-[12.5px] text-mute">{list.length} report{list.length === 1 ? '' : 's'}</small>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((r) => (
                <button data-card key={r.id} type="button" onClick={() => onPick(r.id)}
                  className="m-press rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:bg-tile">
                  <b className="block font-tight text-[14px] font-semibold text-ink">{r.label}</b>
                  <small className="mt-0.5 block text-[12px] text-mute">{r.blurb}</small>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {groupChips(grouped).every((g) => searchCatalogue(grouped[g.key], q).length === 0) && (
        <p className="py-10 text-center text-[13px] text-mute">No report matches "{q}"</p>
      )}
    </div>
  );
}

/**
 * Reports (web redesign, approved mockups reports-01 to 29). Opens on the
 * Business Report, as before; ?tab=ID opens that report in its own group.
 * "Reports" in the trail, or All reports, shows every report on one page.
 */
const Reports = () => {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const linkedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState('BUSINESS');
  const [activeGroup, setActiveGroup] = useState('OPERATIONAL');
  const [home, setHome] = useState(false);

  const reports = useMemo(() => visibleReports(hasPermission, REPORT_CATALOGUE), [hasPermission]);
  const grouped = useMemo(() => groupReports(reports), [reports]);

  // ?tab=DAILY_SALES opens a report directly, in its own group. A report
  // this person cannot open is not in the list, so the link falls back.
  useEffect(() => {
    const linked = findReport(reports, linkedTab);
    if (linked) { setActiveGroup(linked.group); setActiveTab(linked.id); setHome(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTab]);

  const visibleTabs = grouped[activeGroup] || [];
  const current = visibleTabs.find((t) => t.id === activeTab) || visibleTabs[0];

  const handleGroupChange = (group) => {
    setActiveGroup(group);
    const first = grouped[group]?.[0];
    if (first) setActiveTab(first.id);
  };
  const openReport = (id) => {
    const r = findReport(reports, id);
    if (!r) return;
    setActiveGroup(r.group);
    setActiveTab(r.id);
    setHome(false);
  };

  if (home) {
    return <ReportsHome grouped={grouped} total={reports.length} onPick={openReport} />;
  }

  const Page = current ? PAGES[current.id] : null;
  const crumbBtn = 'rounded-[4px] hover:text-ink transition-colors duration-(--dur-hover)';

  return (
    <div className="flex w-full flex-col">
      <nav aria-label="Breadcrumb" className="no-print mb-3 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">
        <button type="button" onClick={() => setHome(true)} className={crumbBtn}>Reports</button>
        <i className="mx-1.5 not-italic text-faint">/</i>{groupLabel(activeGroup)}
        <i className="mx-1.5 not-italic text-faint">/</i><b className="font-semibold text-ink-2">{current?.label}</b>
      </nav>

      <div className="no-print mb-3.5 flex flex-wrap items-center gap-2.5">
        <FilterPills ariaLabel="Report groups" value={activeGroup} onChange={handleGroupChange}
          items={groupChips(grouped).map((g) => ({ key: g.key, label: g.label, count: g.count }))} />
        <div className="flex-1" />
        <button type="button" onClick={() => setHome(true)}
          className="m-press inline-flex h-[34px] items-center gap-1.5 rounded-pill px-3 font-tight text-[13px] font-semibold text-ink-2 hover:bg-tile">
          <LayoutGrid size={15} strokeWidth={2} aria-hidden="true" />All reports
        </button>
        <ReportPicker reports={visibleTabs} current={current} onPick={setActiveTab} />
      </div>

      {Page && (
        <div key={current.id} className="m-rise">
          <Page />
        </div>
      )}
    </div>
  );
};

export default Reports;
