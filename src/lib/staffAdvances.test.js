import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import {
  detectAdvances, resetAdvancesDetection, advanceOptions, isAppUpdateRequired, isAdvanceExpense, isNonCashExpense,
  advanceExpenseLabel, advanceExpenseEmployee, cashExpenses, expenseCreditAccount, staffAdvanceLedgerLines,
  refTypeLabel, lockedAdvanceExpense,
} from './staffAdvances';
import { expensesByMoney, staffAdvanceMoney } from './dayBook';
import { cashFlowFigures } from './cashFlow';
import { allTransactionRows, moneyTotals } from './allTransactions';
import { moneyInOutBars } from './dashboardFigures';
import { runPaymentMethods } from '../hooks/usePayroll';
import { payRun, needsConfirming, chosenLines } from './payrollCommit';
import { buildPayslip, yearToDateLines } from './payslip';
import { monthToDate, yearToDate, paidByEmployeeInMonth, monthlyPayItem } from './payrollPeriods';
import { salaryStatement } from './payrollView';

// Shared fixtures. "Plain" is a shop with no advances and no write-offs: every
// fix must give it exactly the figures it had before.
const plain = [
  { id: 'e1', date: '2026-11-10', amount: 500, payment_method: 'CASH', category: 'Rent' },
  { id: 'e2', date: '2026-11-10', amount: 300, payment_method: 'UPI', category: 'Power' },
  { id: 'PAY-r1-emp1', date: '2026-11-10', amount: 7000, payment_method: 'BANK', category: 'Salary', payroll_id: 'r1' },
];
const nonCash = [
  { id: 'PAYADV-r1-emp1', date: '2026-11-10', amount: 1000, payment_method: 'ADVANCE', category: 'Salary', payroll_id: 'r1' },
  { id: 'ADVWO-op1', date: '2026-11-10', amount: 400, payment_method: 'ADVANCE', category: 'Staff advance written off' },
  { id: 'wo1', date: '2026-11-10', amount: 200, payment_method: 'ADJUSTMENT', category: 'Inventory Write-off' },
];
const advMoves = [
  { id: 'ATX-ADVGIV-a1', date: '2026-11-10', direction: 'OUT', amount: 3000, mode: 'CASH', ref_type: 'STAFF_ADVANCE', ref_id: 'a1' },
  { id: 'ATX-ADVCOL-op2', date: '2026-11-10', direction: 'IN', amount: 500, mode: 'UPI', ref_type: 'STAFF_ADVANCE', ref_id: 'ADVCOL-op2' },
];

describe('feature detection', () => {
  beforeEach(() => resetAdvancesDetection());
  const client = (error, spy = vi.fn()) => ({ from: (t) => { spy(t); return { select: () => ({ limit: async () => ({ data: [], error }) }) }; } });

  it('says yes once the advances view answers, and asks only once a session', async () => {
    const spy = vi.fn();
    const c = client(null, spy);
    expect(await detectAdvances(c)).toBe(true);
    expect(await detectAdvances(c)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('staff_advance_balances');
  });
  it('says no, without throwing, on a database without advances', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await detectAdvances(client({ message: 'relation "staff_advance_balances" does not exist' }))).toBe(false);
    resetAdvancesDetection();
    expect(await detectAdvances({ from: () => { throw new Error('offline'); } })).toBe(false);
  });
  it('builds p_options and spots APP_UPDATE_REQUIRED', () => {
    expect(advanceOptions({ skip: ['a', 'a'], recoverAll: [3] })).toEqual({ advance_aware: true, skip_advance: ['a'], recover_all: ['3'] });
    expect(isAppUpdateRequired({ message: 'APP_UPDATE_REQUIRED: X has a staff advance' })).toBe(true);
    expect(isAppUpdateRequired({ message: 'Access denied' })).toBe(false);
  });
});

describe('non-cash expenses (ADVANCE, ADJUSTMENT)', () => {
  it('are recognised and labelled', () => {
    expect(nonCash.every(isNonCashExpense)).toBe(true);
    expect(plain.some(isNonCashExpense)).toBe(false);
    expect(isAdvanceExpense(nonCash[2])).toBe(false);
    expect(advanceExpenseLabel(nonCash[0])).toBe('Advance recovered');
    expect(advanceExpenseLabel(nonCash[1])).toBe('Advance written off');
    expect(advanceExpenseEmployee(nonCash[0])).toBe('emp1');
    expect(cashExpenses([...plain, ...nonCash])).toEqual(plain);
  });

  it('Expenses page: ADVANCE rows are read-only with a link to the employee; others are not locked', () => {
    expect(lockedAdvanceExpense(nonCash[0])).toEqual({ label: 'Advance recovered', href: '/payroll/employee/emp1?tab=advances' });
    expect(lockedAdvanceExpense(nonCash[1])).toEqual({ label: 'Advance written off', href: '/payroll' });
    expect(plain.map(lockedAdvanceExpense)).toEqual([null, null, null]);
    expect(lockedAdvanceExpense(nonCash[2])).toBeNull();
  });

  it('Day Book: expenses stay expenses but move neither cash nor bank', () => {
    expect(expensesByMoney(plain)).toEqual({ total: 7800, cash: 500, bank: 7300, nonCash: 0 });
    expect(expensesByMoney([...plain, ...nonCash])).toEqual({ total: 9400, cash: 500, bank: 7300, nonCash: 1600 });
  });

  it('Day Book: staff advances given and paid back are money moves', () => {
    expect(staffAdvanceMoney([])).toEqual({ cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 });
    expect(staffAdvanceMoney([...advMoves, { ref_type: 'SALE', direction: 'IN', amount: 99, mode: 'CASH' }]))
      .toEqual({ cashIn: 0, cashOut: 3000, bankIn: 500, bankOut: 0 });
  });

  it('Cash flow: unchanged without them; non-cash expenses left out; advances counted', () => {
    const base = cashFlowFigures({ expenses: plain });
    const withNon = cashFlowFigures({ expenses: [...plain, ...nonCash] });
    expect(withNon.totalOutflow).toBe(base.totalOutflow);
    expect(withNon.operatingNet).toBe(base.operatingNet);
    expect(base.rows.some((r) => r.label.startsWith('Staff advances'))).toBe(false);
    const withAdv = cashFlowFigures({ expenses: plain, advances: advMoves });
    expect(withAdv.totalOutflow).toBe(base.totalOutflow + 3000);
    expect(withAdv.totalInflow).toBe(base.totalInflow + 500);
    expect(withAdv.rows.find((r) => r.label.startsWith('Staff advances')).amount).toBe(-2500);
    expect(withAdv.operatingNet).toBe(base.operatingNet - 2500);
  });

  it('All transactions: non-cash expenses listed but out of Money In / Out; advances in', () => {
    const base = moneyTotals(allTransactionRows({ expenses: plain }));
    expect(base).toMatchObject({ totalIn: 0, totalOut: 7800 });
    const rows = allTransactionRows({ expenses: [...plain, ...nonCash], advances: advMoves });
    expect(rows.filter((r) => r.dir === 'none')).toHaveLength(3);
    expect(moneyTotals(rows)).toMatchObject({ totalIn: 500, totalOut: 7800 + 3000 });
    expect(rows.filter((r) => r.type === 'Staff advance')).toHaveLength(2);
  });

  it('General ledger: ADVANCE credits Staff Advances, ADJUSTMENT credits Inventory, the rest Cash', () => {
    expect(plain.map((e) => expenseCreditAccount(e).accountCode)).toEqual(['1000', '1000', '1000']);
    expect(nonCash.map((e) => expenseCreditAccount(e).accountCode)).toEqual(['1300', '1300', '1200']);
    const [dr, cr] = staffAdvanceLedgerLines(advMoves[0]);
    expect([dr.accountCode, dr.debit, cr.accountCode, cr.credit]).toEqual(['1300', 3000, '1000', 3000]);
    const [dr2, cr2] = staffAdvanceLedgerLines(advMoves[1]);
    expect([dr2.accountCode, cr2.accountCode]).toEqual(['1000', '1300']);
    expect(staffAdvanceLedgerLines({ ref_type: 'SALE' })).toEqual([]);
  });

  it('Dashboard money in and out: same bars without them; non-cash out; advances in', () => {
    const keyOf = (d) => String(d).slice(0, 10);
    const days = ['2026-11-10'];
    const base = moneyInOutBars({ days, sales: [{ date: '2026-11-10', totalAmount: 1000 }], expenses: plain, keyOf });
    expect(base).toEqual([{ date: '2026-11-10', income: 1000, expense: 7800 }]);
    const withAll = moneyInOutBars({ days, sales: [{ date: '2026-11-10', totalAmount: 1000 }], expenses: [...plain, ...nonCash], advances: advMoves, keyOf });
    expect(withAll).toEqual([{ date: '2026-11-10', income: 1500, expense: 10800 }]);
  });

  it('Cash & Bank: a readable label for STAFF_ADVANCE, others as before', () => {
    expect(refTypeLabel(advMoves[0])).toBe('Staff advance given');
    expect(refTypeLabel(advMoves[1])).toBe('Staff advance paid back');
    expect(refTypeLabel({ ref_type: 'EXPENSE' })).toBe('Expense');
    expect(refTypeLabel({ ref_type: 'SOMETHING_NEW' })).toBe('SOMETHING_NEW');
  });

  it('Payroll: a run\'s payment method never reads ADVANCE', () => {
    expect(runPaymentMethods(plain)).toEqual({ r1: 'BANK' });
    expect(runPaymentMethods([nonCash[0], ...plain])).toEqual({ r1: 'BANK' });
    expect(runPaymentMethods([nonCash[0]])).toEqual({});
  });
});

describe('tick boxes and the per-person "already paid" check', () => {
  const items = [
    { employeeId: 'a', netPay: 500, needsConfirmation: false },
    { employeeId: 'b', netPay: 700, needsConfirmation: true },
  ];
  const data = { period: '2026-11', run: { items, totalNet: 1200 }, mustConfirm: true, confirmEmployeeIds: ['b'] };

  it('pays only the ticked people', async () => {
    const save = vi.fn(async () => ({ success: true }));
    const out = await payRun({ cost: async () => data, save, runId: 'r', method: 'CASH', shownTotal: 500, selected: ['a'], options: { advance_aware: true } });
    expect(out.status).toBe('saved');
    expect(save.mock.calls[0][0].items.map((i) => i.employeeId)).toEqual(['a']);
    expect(save.mock.calls[0][2]).toEqual({ advance_aware: true });
  });
  it('asks only when a ticked person needs it', async () => {
    expect(needsConfirming(data, chosenLines(data, ['a']))).toBe(false);
    expect(needsConfirming(data, chosenLines(data, ['a', 'b']))).toBe(true);
    const out = await payRun({ cost: async () => data, save: vi.fn(), runId: 'r', method: 'CASH', shownTotal: 1200, selected: null });
    expect(out.status).toBe('confirm');
  });
  it('falls back to the whole-run answer from an older server', () => {
    expect(needsConfirming({ ...data, confirmEmployeeIds: null }, chosenLines(data, ['a']))).toBe(true);
  });
  it('sends no p_options when none are given (database without advances)', async () => {
    const save = vi.fn(async () => ({ success: true }));
    await payRun({ cost: async () => ({ ...data, mustConfirm: false, confirmEmployeeIds: null }), save, runId: 'r', method: 'CASH', shownTotal: 1200 });
    expect(save.mock.calls[0][2]).toBeNull();
  });
  it('says the page is out of date on APP_UPDATE_REQUIRED', async () => {
    const save = async () => ({ success: false, error: { message: 'APP_UPDATE_REQUIRED: A has a staff advance' } });
    const out = await payRun({ cost: async () => data, save, runId: 'r', method: 'CASH', shownTotal: 500, selected: ['a'] });
    expect(out.status).toBe('update-required');
  });
});

describe('advance recovered on payslips, statements and to-date figures', () => {
  // Earned 7,500; 1,000 kept against the advance; 6,500 handed over.
  const item = { employeeId: 'emp1', employeeName: 'A', payType: 'MONTHLY', salary: 7500, basePay: 7500, periodDays: 30, cycleDays: 30,
    netPay: 6500, earnedNet: 7500, advanceRecovered: 1000 };
  const run = { id: 'r1', period: '2026-11', processed_at: '2026-11-30T10:00:00Z', items: [item] };
  const plainRun = { id: 'r0', period: '2026-10', processed_at: '2026-10-31T10:00:00Z', items: [{ ...item, netPay: 7500, earnedNet: undefined, advanceRecovered: undefined }] };

  it('payslip: net pay is what was earned; the advance and the cash are shown, no discrepancy', () => {
    const s = buildPayslip({ run, item });
    expect(s).toMatchObject({ netPay: 7500, advanceRecovered: 1000, cashPaid: 6500, discrepancy: null });
    const p = buildPayslip({ run: plainRun, item: plainRun.items[0] });
    expect(p).toMatchObject({ netPay: 7500, advanceRecovered: 0, cashPaid: 7500, discrepancy: null });
  });
  it('month and year to date keep the recovered part', () => {
    expect(monthToDate({ run, records: [run], employeeId: 'emp1' }).totalAmount).toBe(7500);
    expect(yearToDate({ run, records: [plainRun, run], employeeId: 'emp1' }).totalAmount).toBe(15000);
    expect(paidByEmployeeInMonth(2026, 11, [run]).get('emp1').amount).toBe(7500);
    expect(monthlyPayItem({ year: 2026, month1to12: 11, employeeId: 'emp1', records: [run] }).item).toMatchObject({ netPay: 6500, advanceRecovered: 1000 });
    expect(yearToDateLines({ records: [plainRun, run], employeeId: 'emp1', fyFrom: '2026-04-01', fyTo: '2027-03-31' }).net).toBe(15000);
  });

  it('statement: unchanged with no advances; with one, balance is wages due less advance owed', () => {
    const line = { employeeId: 'emp1', payType: 'MONTHLY', basePay: 15000, netPay: 7500, alreadyPaid: 7500, statutoryTotal: 0, periodDays: 30, cycleDays: 30 };
    const half = { ...run, id: 'r2', period: '2026-11-01/2026-11-15', processed_at: '2026-11-16T10:00:00Z',
      items: [{ ...item, netPay: 6500, advanceRecovered: 1000, earnedNet: 7500 }] };
    const before = salaryStatement({ line, month: '2026-11', records: [half], asOf: '2026-11-30' });
    const none = salaryStatement({ line, month: '2026-11', records: [half], asOf: '2026-11-30', advanceEntries: [] });
    expect(none).toEqual(before);
    expect(before.agrees).toBe(true);
    expect(before.closing).toBe(7500);
    const entries = [
      { id: 'ADVGIV-a1', kind: 'GIVEN', amount: 3000, on_date: '2026-11-05' },
      { id: 'ADVREC-r2-a1', kind: 'RECOVERY', amount: 1000, on_date: '2026-11-15', payroll_id: 'r2' },
    ];
    const st = salaryStatement({ line, month: '2026-11', records: [half], asOf: '2026-11-30', advanceEntries: entries });
    expect(st.advanceOutstanding).toBe(2000);
    expect(st.closing).toBe(7500 - 2000);
    expect(st.agrees).toBe(true);
    expect(st.rows.map((r) => r.type)).toEqual(['earned', 'advance', 'paid', 'recovered']);
    // a recovery from a deleted run does not count
    const gone = salaryStatement({ line, month: '2026-11', records: [], asOf: '2026-11-30', advanceEntries: entries });
    expect(gone.advanceOutstanding).toBe(3000);
  });
});
