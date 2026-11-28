import { round2 } from '../utils/financialCalculations';
import { isNonCashMethod, staffAdvanceMoney } from './dayBook';

/**
 * The Cash Flow report's figures (components/reports/CashFlowReport.jsx),
 * kept apart from the page so they can be tested.
 *
 * Expenses with method ADVANCE (pay kept against a staff advance, an advance
 * written off) or ADJUSTMENT (a stock write-off) are real expenses but moved
 * no cash, so they are left out of every cash line here. Staff advances given
 * and paid back (account_transactions ref STAFF_ADVANCE) are cash that moved
 * with no expense row, so they get their own operating line. A shop with
 * neither gets exactly the figures it had before.
 */
export function cashFlowFigures({ sales = [], expenses: allExpenses = [], payroll = [], purchases = [], vehicles = [], advances = [] } = {}) {
  const expenses = (allExpenses || []).filter((e) => !isNonCashMethod(e?.payment_method ?? e?.paymentMethod));
  const adv = staffAdvanceMoney(advances);
  const advanceNet = (adv.cashIn + adv.bankIn) - (adv.cashOut + adv.bankOut);
  // --- Operating inflows ---
  const cashSales = sales
    .filter((s) => {
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      return m !== 'CREDIT';
    })
    .reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);

  const creditSales = sales
    .filter((s) => {
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      return m === 'CREDIT';
    })
    .reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);

  // --- Operating outflows ---
  const totalExpenses = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const totalPayroll = payroll.reduce((a, p) => a + (Number(p.amount) || 0), 0);

  const paidPurchases = purchases
    .filter((p) => p.payment_status === 'PAID' || p.paid === true)
    .reduce((a, p) => a + (Number(p.total_amount ?? p.amount) || 0), 0);

  // --- Investing ---
  const vehiclePurchases = vehicles.reduce((a, v) => a + (Number(v.book_value ?? v.cost ?? 0)), 0);

  // --- Monthly breakdown ---
  const monthly = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    monthly[key] = { name: key, Inflow: 0, Outflow: 0, Net: 0 };
  }
  const getKey = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  sales.forEach((s) => {
    const m = (s.paymentMethod || 'CASH').toUpperCase();
    if (m === 'CREDIT') return;
    const k = getKey(s.date);
    if (monthly[k]) monthly[k].Inflow += Number(s.totalAmount) || 0;
  });
  expenses.forEach((e) => {
    const k = getKey(e.date);
    if (monthly[k]) monthly[k].Outflow += Number(e.amount) || 0;
  });
  payroll.forEach((p) => {
    const k = getKey(p.processed_at);
    if (monthly[k]) monthly[k].Outflow += Number(p.amount) || 0;
  });
  (advances || []).forEach((t) => {
    if (String(t?.ref_type || '').toUpperCase() !== 'STAFF_ADVANCE') return;
    const k = getKey(t.date);
    if (!monthly[k]) return;
    if (String(t.direction).toUpperCase() === 'IN') monthly[k].Inflow += Number(t.amount) || 0;
    else monthly[k].Outflow += Number(t.amount) || 0;
  });
  Object.values(monthly).forEach((m) => { m.Net = round2(m.Inflow - m.Outflow); });

  // --- Build the statement ---
  const operatingLines = [
    { section: 'OPERATING', label: 'Cash receipts from customers (cash sales)', amount: round2(cashSales), direction: 'IN' },
    { section: 'OPERATING', label: 'Cash receipts from credit customers (collections proxy)', amount: 0, direction: 'IN', note: 'Tracked via AR reductions' },
    { section: 'OPERATING', label: 'Cash paid to suppliers (paid purchases)', amount: round2(-paidPurchases), direction: 'OUT' },
    { section: 'OPERATING', label: 'Cash paid for operating expenses', amount: round2(-totalExpenses), direction: 'OUT' },
    { section: 'OPERATING', label: 'Cash paid to employees (payroll)', amount: round2(-totalPayroll), direction: 'OUT' },
    ...(advances && advances.length ? [{ section: 'OPERATING', label: 'Staff advances (given less paid back)', amount: round2(advanceNet), direction: advanceNet < 0 ? 'OUT' : 'IN' }] : []),
  ];
  const operatingNet = operatingLines.reduce((a, l) => a + l.amount, 0);

  const investingLines = [
    { section: 'INVESTING', label: 'Investment in fixed assets (vehicles/fleet)', amount: round2(-vehiclePurchases), direction: 'OUT' },
  ];
  const investingNet = investingLines.reduce((a, l) => a + l.amount, 0);

  const financingLines = [
    { section: 'FINANCING', label: 'Owner contributions', amount: 0, direction: 'IN' },
    { section: 'FINANCING', label: 'Loan proceeds / repayments', amount: 0, direction: 'IN' },
  ];
  const financingNet = financingLines.reduce((a, l) => a + l.amount, 0);

  const netChange = round2(operatingNet + investingNet + financingNet);

  const rows = [
    ...operatingLines,
    { section: 'OPERATING', label: 'Net Cash from Operating Activities', amount: round2(operatingNet), isSubtotal: true },
    ...investingLines,
    { section: 'INVESTING', label: 'Net Cash from Investing Activities', amount: round2(investingNet), isSubtotal: true },
    ...financingLines,
    { section: 'FINANCING', label: 'Net Cash from Financing Activities', amount: round2(financingNet), isSubtotal: true },
    { section: 'SUMMARY', label: 'Net Change in Cash', amount: netChange, isSubtotal: true, isTotal: true },
  ];

  return {
    rows,
    operatingNet: round2(operatingNet),
    investingNet: round2(investingNet),
    financingNet: round2(financingNet),
    netChange,
    totalInflow: round2(cashSales + adv.cashIn + adv.bankIn),
    totalOutflow: round2(paidPurchases + totalExpenses + totalPayroll + vehiclePurchases + adv.cashOut + adv.bankOut),
    monthly: Object.values(monthly),
    creditSales: round2(creditSales),
  };
}
