import { describe, it, expect } from 'vitest';
import {
  clientFacts, clientRows, filterClientRows, chipCounts, clientKpis, clientSummary, spanWords,
  rangeStartFor, reminderText, phoneDigits, whatsappUrl, smsUrl, money, limitUse, creditWords,
  accountWords, ageTone, initialsOf, dayMonth,
} from './clientView';

const NOW = Date.UTC(2026, 10, 26, 12); // 26 Nov 2026

const clients = [
  { id: 'c1', name: 'Shop One', contact: 'Person A', outstanding_balance: 1000 },
  { id: 'c2', name: 'Shop Two', outstanding_balance: 500 },
  { id: 'c3', name: 'Shop Three', outstanding_balance: 0 },
  { id: 'c4', name: 'Shop Four', outstanding_balance: -200 },
];
const sales = [
  { id: 's1', shopId: 'c1', date: '2026-10-01', created_at: '2026-10-01T10:00:00Z', totalAmount: 800, paidAmount: 0 },
  { id: 's2', shopId: 'c1', date: '2026-11-20', created_at: '2026-11-20T10:00:00Z', totalAmount: 400, paidAmount: 200 },
  { id: 's3', shopId: 'c2', date: '2026-11-10', totalAmount: 500, paidAmount: 0 },
  { id: 's4', shopId: 'c3', date: '2026-11-01', totalAmount: 300, paidAmount: 300 },
  { id: 's5', shopId: 'c1', date: '2026-11-21', totalAmount: 900, paidAmount: 0, voided_at: '2026-11-21T11:00:00Z' },
];
const pays = [
  { id: 'p1', client_id: 'c1', date: '2026-11-22', amount: 300 },
  { id: 'p2', client_id: 'c2', date: '2026-10-30', amount: 100 },
];

describe('clientFacts / clientRows (today\'s rules, moved)', () => {
  const facts = clientFacts(clients, sales, pays);
  const rows = clientRows(clients, facts, NOW);

  it('lists unpaid bills oldest first and dates the oldest', () => {
    expect(facts.c1.unpaid.map((b) => b.id)).toEqual(['s1', 's2', 's5']);
    expect(facts.c1.oldestUnpaid).toBe('2026-10-01');
    expect(facts.c3.unpaid).toEqual([]);
  });

  it('takes the latest of a sale or a payment as last activity', () => {
    expect(facts.c1.lastKind).toBe('Payment');
    expect(facts.c2.lastKind).toBe('Sale');
  });

  it('sorts biggest balance first and ages only owing clients', () => {
    expect(rows.map((r) => r.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(rows[0]._age).toBe(56);
    expect(rows[2]._age).toBeNull();
  });

  it('filters Owing, Overdue and All, and searches name, contact, phone, GSTIN', () => {
    expect(filterClientRows(rows, { filter: 'OWING' }).map((r) => r.id)).toEqual(['c1', 'c2']);
    expect(filterClientRows(rows, { filter: 'OVERDUE' }).map((r) => r.id)).toEqual(['c1']);
    expect(filterClientRows(rows, { filter: 'ALL' })).toHaveLength(4);
    expect(filterClientRows(rows, { filter: 'ALL', query: 'person a' }).map((r) => r.id)).toEqual(['c1']);
    expect(chipCounts(rows)).toEqual({ OWING: 2, OVERDUE: 1, ALL: 4 });
  });

  it('counts the WHOLE balance of an overdue client in Overdue 30+ (web rule, kept)', () => {
    const k = clientKpis(clients, facts, pays, { now: NOW, monthStart: '2026-11-01' });
    expect(k.receivable).toBe(1500);
    expect(k.overdue).toBe(1000);
    expect(k.overdueCount).toBe(1);
    expect(k.oldest).toBe(56);
    expect(k.oldestName).toBe('Shop One');
    expect(k.collected).toBe(300);
    expect(k.receipts).toBe(1);
  });
});

describe('clientSummary (new)', () => {
  it('totals the client\'s bills, leaving out a voided one', () => {
    const s = clientSummary(sales, 'c1', '2026-11-26');
    expect(s.bills).toBe(2);
    expect(s.total).toBe(1200);
    expect(s.avg).toBe(600);
    expect(s.first).toBe('2026-10-01');
    expect(s.since).toBe('Oct 2026');
    expect(s.sinceSpan).toBe('1 month');
    expect(s.last).toBe('2026-11-20');
    expect(s.lastWords).toBe('20 Nov');
  });

  it('says Today for a bill today, and is empty for a client with no bills', () => {
    expect(clientSummary([{ id: 'x', shopId: 'c9', date: '2026-11-26', totalAmount: 10 }], 'c9', '2026-11-26').lastWords).toBe('Today');
    expect(clientSummary(sales, 'nobody', '2026-11-26').bills).toBe(0);
  });

  it('counts span in calendar months', () => {
    expect(spanWords('2025-03-10', '2026-11-26')).toBe('1 year 8 months');
    expect(spanWords('2025-03-30', '2026-03-29')).toBe('11 months');
    expect(spanWords('2026-11-20', '2026-11-26')).toBe('under a month');
  });
});

describe('account page period', () => {
  it('starts the month, three months back and the financial year in shop days', () => {
    expect(rangeStartFor('1M', '2026-11-26')).toBe('2026-11-01');
    expect(rangeStartFor('3M', '2026-11-26')).toBe('2026-08-26');
    expect(rangeStartFor('FY', '2026-11-26')).toBe('2026-04-01');
    expect(rangeStartFor('FY', '2027-02-10')).toBe('2026-04-01');
    expect(rangeStartFor('ALL', '2026-11-26')).toBeNull();
  });
});

describe('payment reminder (text only)', () => {
  const bills = [{ id: 'S-1', date: '2026-10-16', due: 3200 }, { id: 'S-2', date: '2026-11-08', due: 6280 }];

  it('greets the contact person and names the oldest bill', () => {
    const t = reminderText({ client: { name: 'Shop One', contact: 'Person A' }, shopName: 'Test Store', amount: 9480, bills, upi: 'test@upi' });
    expect(t).toContain('Namaste Person,');
    expect(t).toContain('₹9,480 due, the oldest bill from 16 Oct');
    expect(t).toContain('S-2 · 8 Nov · ₹6,280');
    expect(t).toContain('UPI: test@upi');
  });

  it('drops the bill list when asked and words a firm reminder', () => {
    const t = reminderText({ client: { name: 'Shop One' }, shopName: 'Test Store', amount: 100, bills, withBills: false, tone: 'FIRM' });
    expect(t).toContain('Dear Shop One');
    expect(t).not.toContain('S-1');
  });

  it('uses the phone number, never the contact name', () => {
    expect(phoneDigits('98450 11223')).toBe('919845011223');
    expect(phoneDigits('+91 98450-11223')).toBe('919845011223');
    expect(phoneDigits('')).toBe('');
    expect(whatsappUrl('9845011223', 'a b')).toBe('https://wa.me/919845011223?text=a%20b');
    expect(smsUrl('9845011223', 'hi')).toBe('sms:919845011223?body=hi');
  });
});

describe('small words', () => {
  it('formats money with Indian grouping, paise only when present', () => {
    expect(money(184300)).toBe('₹1,84,300');
    expect(money(12.5)).toBe('₹12.50');
    expect(money(12400, '₹', { paise: 'always' })).toBe('₹12,400.00');
    expect(money(-500)).toBe('−₹500');
  });

  it('describes credit and account type', () => {
    expect(creditWords({ credit_days: 30, credit_limit: 15000 })).toBe('Net 30 · limit ₹15,000');
    expect(creditWords({})).toBe('Cash on delivery');
    expect(accountWords({ client_type: 'B2B', price_tier: 'WHOLESALE' })).toBe('B2B · Wholesale price');
  });

  it('measures the credit limit the way the old bar did', () => {
    expect(limitUse(12400, 15000)).toEqual({ pct: (12400 / 15000) * 100, over: false, left: 2600 });
    expect(limitUse(16000, 15000).pct).toBe(100);
    expect(limitUse(100, 0)).toBeNull();
  });

  it('bands ages, makes initials, writes day and month', () => {
    expect([ageTone(5), ageTone(30), ageTone(60), ageTone(null)]).toEqual(['neutral', 'warn', 'bad', 'neutral']);
    expect(initialsOf('Shop One')).toBe('SO');
    expect(dayMonth('2026-10-16')).toBe('16 Oct');
  });
});
