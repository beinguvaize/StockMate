import { describe, it, expect } from 'vitest';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import data from '../../shared/ai_chat/guard_cases.json';

const verdict = (c) => (checkReply(c.reply, data.fixtures[c.fixture], data.stand_ins[c.fixture] ?? {}).ok ? 'should_pass' : 'should_fail');

describe('guard cases (shared/ai_chat/guard_cases.json)', () => {
  const gated = data.cases.filter((c) => !c.known_limit);

  it('still has every case', () => {
    expect(data.cases).toHaveLength(228);
    expect(gated.length).toBeGreaterThan(160);
  });

  it.each(gated.map((c) => [c.id, c]))('%s', (_id, c) => {
    expect(verdict(c)).toBe(c.expected);
  });
});

describe('guard rulings', () => {
  const ok = (text, figures, map = {}) => checkReply(text, figures, map).ok;
  const rows = (n) => ({ items: Array.from({ length: n }, (_, i) => ({ product_name: `P${'x'.repeat(i)}`, value: 100 })) });

  it('a rank cannot be longer than the list', () => {
    expect(ok('Your top 3 items did well.', rows(3))).toBe(true);
    expect(ok('Your top 3 items did well.', rows(2))).toBe(false);
    expect(ok('Your top three items did well.', rows(2))).toBe(false);
    expect(ok('Your 3rd item did well.', rows(2))).toBe(false);
    expect(ok('आपके टॉप 3 आइटम अच्छे रहे।', rows(2))).toBe(false);
    expect(ok('Your top 2 items did well.', { gross_sales: 2 })).toBe(false);   // no list at all
  });

  it('digits in a product name never pass as money', () => {
    const f = { items: [{ product_name: 'Offer Pack 99999', qty_sold: 84 }] };
    expect(ok('Sales of ₹99,999 came in.', f)).toBe(false);
    expect(ok('Sales of 99999 came in.', f)).toBe(false);
    expect(ok('पारले-जी 500 ग्राम बिका।', { items: [{ product_name: 'Parle-G 500g' }] })).toBe(true);
    expect(ok('₹500 ग्राम बिका।', { items: [{ product_name: 'Parle-G 500g' }] })).toBe(false);
  });

  it('the period span counts only as days', () => {
    const f = { period_from: '2026-11-01', period_to: '2026-12-01', value: 5 };
    expect(ok('In the next 30 days.', f)).toBe(true);
    expect(ok('You sold 30 units.', f)).toBe(false);
    expect(ok('Worth ₹30.', f)).toBe(false);
  });

  it('ratio claims and the L short form stay rejected', () => {
    expect(ok('Over half of your dues are old.', { total: 100 })).toBe(false);
    expect(ok('Sales doubled.', { total: 100 })).toBe(false);
    expect(ok('You have ₹1.86L.', { total: 186000 })).toBe(false);
  });

  it('a form name holds no figure, and only real ones pass', () => {
    expect(ok('Compare it with GSTR-3B.', { x: 1 })).toBe(true);
    expect(ok('Compare it with GSTR-4.', { x: 1 })).toBe(false);
  });

  it('a date range needs both ends in the figures', () => {
    const f = { period_from: '2026-11-01', period_to: '2026-11-04' };
    expect(ok('From 1 to 4 November.', f)).toBe(true);
    expect(ok('From 1 to 5 November.', f)).toBe(false);
    expect(ok('For November 2026.', f)).toBe(true);
    expect(ok('For October 2026.', f)).toBe(false);
  });

  it('direction must agree with change_pct, in both languages', () => {
    expect(ok('That is 15% lower.', { change_pct: 15 })).toBe(false);
    expect(ok('That is 15% higher.', { change_pct: 15 })).toBe(true);
    expect(ok('Down 15% on last week.', { change_pct: -15 })).toBe(true);
    expect(ok('Up 15% on last week.', { change_pct: -15 })).toBe(false);
    expect(ok('यह 15% कम है।', { change_pct: 15 })).toBe(false);
    expect(ok('यह 15% ज़्यादा है।', { change_pct: 15 })).toBe(true);
  });

  it('nothing is overdue, in any case', () => {
    expect(ok('This bill is Overdue.', { x: 1 })).toBe(false);
  });
});
