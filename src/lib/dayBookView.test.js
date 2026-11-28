import { describe, it, expect } from 'vitest';
import {
  ALL_STORES, buildDayLedger, varianceOf, varianceLook, dayPills, methodLabel, entryPill,
  dayLabel, closedAtLabel, historySummary, historyRows, timeLabel,
} from './dayBookView';

/**
 * buildDayLedger is the Day Book's ledger moved out of the page unchanged.
 * These pin the figures the page has always shown for one sample day, so the
 * redesign cannot shift a rupee.
 */
const D = '2026-11-26';
const at = (hm) => `${D}T${hm}:00+05:30`;
const data = (over = {}) => ({
  selectedDate: D,
  sales: [
    { id: 's1', date: D, totalAmount: 1240, paidAmount: 1240, paymentStatus: 'PAID', paymentMethod: 'CASH', created_at: at('09:12'), updated_at: at('09:12'), items: [{ name: 'Flour' }, { name: 'Salt' }] },
    { id: 's2', date: D, totalAmount: 2400, paidAmount: 0, paymentStatus: 'PENDING', paymentMethod: 'CREDIT', created_at: at('10:05'), updated_at: at('10:05'), customerInfo: { name: 'Shop A' }, items: [{ name: 'Rice' }] },
    { id: 's3', date: D, totalAmount: 1980, paidAmount: 1980, paymentStatus: 'PAID', paymentMethod: 'UPI', created_at: at('13:02'), updated_at: at('13:02'), location_id: 'L2' },
  ],
  saleReceipts: [
    { id: 't1', date: D, direction: 'IN', amount: 1240, mode: 'CASH', ref_type: 'SALE' },
    { id: 't3', date: D, direction: 'IN', amount: 1980, mode: 'UPI', ref_type: 'SALE', location_id: 'L2' },
  ],
  clientPayments: [{ id: 'c1', date: D, amount: 3600, payment_method: 'CASH', notes: 'November dues', created_at: at('10:40') }],
  expenses: [
    { id: 'e1', date: D, amount: 600, payment_method: 'CASH', category: 'Packing', note: 'Bags', created_at: at('14:20') },
    { id: 'e2', date: D, amount: 1200, payment_method: 'UPI', category: 'Transport', created_at: at('17:10') },
  ],
  purchases: [{ id: 'p1', date: D, total_amount: 9800, payment_type: 'BANK', created_at: at('11:30') }],
  supplierPayments: [{ id: 'sp1', date: D, amount: 2500, payment_method: 'CASH', supplier_name: 'Dairy', created_at: at('12:15') }],
  dayBook: [],
  record: { id: 'DB-1', date: D, opening_balance: 12980 },
  prevRecord: { date: '2026-11-25', closing_balance: 12980 },
  ...over,
});

describe('buildDayLedger — the figures the page shows', () => {
  const l = buildDayLedger(data());

  it('splits receipts into cash, bank and credit', () => {
    expect(l.cashSales).toBe(1240);
    expect(l.bankSales).toBe(1980);
    expect(l.creditSales).toBe(2400);
    expect(l.cashCollect).toBe(3600);
    expect(l.cashIn).toBe(4840);
    expect(l.bankIn).toBe(1980);
  });

  it('splits payments into the drawer and the bank', () => {
    expect(l.totalExpenses).toBe(1800);
    expect(l.cashExpenses).toBe(600);
    expect(l.bankPurchPaid).toBe(9800);
    expect(l.totalPurchPaid).toBe(12300);
    expect(l.cashOut).toBe(3100);
  });

  it('closes at opening + cash in − cash out, and the log ties out to it', () => {
    expect(l.openingBal).toBe(12980);
    expect(l.closingBal).toBe(14720);
    expect(l.entries[l.entries.length - 1].runningBalance).toBe(14720);
    expect(l.txCount).toBe(7);
    expect(l.expenseCount).toBe(2);
    expect(l.prevClosing).toBe(12980);
  });

  it('orders the log by time and leaves non-cash lines off the drawer', () => {
    expect(l.entries.map((e) => e.id)).toEqual(['s1', 's2', 'c1', 'p1', 'sp1', 's3', 'e1', 'e2']);
    const credit = l.entries.find((e) => e.id === 's2');
    expect(credit.type).toBe('CREDIT_SALE');
    expect(credit.movesCash).toBe(false);
    expect(credit.note).toBe('Rice · Paid 0 of 2400 · due 2400');
    expect(l.entries.find((e) => e.id === 'p1').movesCash).toBe(false);
    expect(l.entries.find((e) => e.id === 'sp1').title).toBe('Supplier — Dairy');
  });

  it('segments sales, expenses and sale receipts by store', () => {
    const one = buildDayLedger(data({ storeFilter: 'L2' }));
    expect(one.cashSales).toBe(0);
    expect(one.bankSales).toBe(1980);
    expect(one.sales.map((s) => s.id)).toEqual(['s3']);
    expect(one.cashCollect).toBe(3600); // collections are business-wide
    const all = buildDayLedger(data({ storeFilter: ALL_STORES }));
    expect(all.sales).toHaveLength(3);
  });

  it('carries an unopened day from the last closed count', () => {
    const l2 = buildDayLedger(data({
      record: undefined,
      dayBook: [{ id: 'x', date: '2026-11-25', is_closed: true, physical_cash: 12000, closing_balance: 12100 }],
    }));
    expect(l2.hasOpening).toBe(false);
    expect(l2.carried).toEqual({ opening: 12000, from: '2026-11-25', counted: true });
    expect(l2.openingBal).toBe(12000);
  });

  it('reads the closed state and the saved count from the day_book row', () => {
    const l3 = buildDayLedger(data({ record: { id: 'DB-1', opening_balance: 100, is_closed: true, closed_at: '2026-11-26T16:12:00Z', physical_cash: 50, variance: -2 } }));
    expect(l3.isLocked).toBe(true);
    expect(l3.savedPhysicalCash).toBe(50);
    expect(l3.savedVariance).toBe(-2);
  });
});

describe('display helpers', () => {
  it('variance and its words', () => {
    expect(varianceOf('', 100)).toBeNull();
    expect(varianceOf('24300', 24380)).toBe(-80);
    expect(varianceLook(-80)).toEqual({ tone: 'bad', label: 'Cash Short', exact: false });
    expect(varianceLook(5).label).toBe('Cash Over');
    expect(varianceLook(5, { surplusWord: 'Cash Surplus' }).label).toBe('Cash Surplus');
    expect(varianceLook(0.004).exact).toBe(true);
  });

  it('day pills', () => {
    expect(dayPills({ isLocked: true, hasOpening: true, isFuture: false })).toEqual([{ tone: 'good', label: 'Closed' }]);
    expect(dayPills({ isLocked: false, hasOpening: false, isFuture: false })[0].label).toBe('Opening not set');
    expect(dayPills({ isLocked: false, hasOpening: false, isFuture: true })).toEqual([{ tone: 'neutral', label: 'Future date' }]);
  });

  it('method words keep the page mapping', () => {
    expect(methodLabel('CREDIT')).toBe('Credit');
    expect(methodLabel('upi')).toBe('UPI');
    expect(methodLabel('NEFT')).toBe('Bank');
    expect(methodLabel('CASH')).toBe('Cash');
    expect(methodLabel('')).toBe('Cash');
  });

  it('type pills', () => {
    expect(entryPill({ type: 'CREDIT_SALE', category: 'Sale' })).toEqual({ tone: 'info', label: 'Credit' });
    expect(entryPill({ type: 'INCOME', category: 'Collection' }).tone).toBe('good');
    expect(entryPill({ type: 'EXPENSE', category: 'Transport' })).toEqual({ tone: 'bad', label: 'Transport' });
  });

  it('dates and times in the shop day', () => {
    expect(dayLabel('2026-11-26')).toBe('Thu 26 Nov 2026');
    expect(dayLabel('2026-11-26', { year: false })).toBe('Thu 26 Nov');
    expect(dayLabel('')).toBe('');
    expect(timeLabel('2026-11-26T03:42:00Z')).toMatch(/9:12\s?am/i);
    expect(timeLabel('2026-11-26')).toBe('');
    expect(closedAtLabel('2026-11-25T16:12:00Z')).toMatch(/^25 Nov 2026, 9:42\s?pm$/i);
    expect(closedAtLabel(null)).toBe('');
  });
});

describe('history', () => {
  const rows = [
    { id: 'a', date: '2026-11-24', opening_balance: 9120, total_sales: 17200, total_expenses: 6900, closing_balance: 10450, variance: -40, is_closed: true, closed_at: '2026-11-24T16:00:00Z' },
    { id: 'b', date: '2026-11-26', opening_balance: 12980, is_closed: false },
    { id: 'c', date: '2026-11-25', opening_balance: 10450, total_sales: 15800, total_expenses: 7300, closing_balance: 12980, variance: 0, is_closed: true },
  ];

  it('sums the strip as before', () => {
    expect(historySummary(rows)).toEqual({ totalDays: 3, closedDays: 2, totalSales: 33000, totalExp: 14200, net: 18800, discrepDays: 1, shortDays: 1 });
    expect(historySummary([]).totalDays).toBe(0);
  });

  it('lists newest first and leaves an open day’s missing totals empty', () => {
    const r = historyRows(rows, { today: '2026-11-26', selectedDate: '2026-11-25' });
    expect(r.map((x) => x.date)).toEqual(['2026-11-26', '2026-11-25', '2026-11-24']);
    expect(r[0]).toMatchObject({ isToday: true, isClosed: false, sales: null, net: null, closing: null, opening: 12980 });
    expect(r[1]).toMatchObject({ isSelected: true, net: 8500, hasDiscrep: false });
    expect(r[2]).toMatchObject({ variance: -40, hasDiscrep: true });
    expect(r[2].closedAt).toMatch(/^24 Nov, 9:30\s?pm$/i);
  });
});
