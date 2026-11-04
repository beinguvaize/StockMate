import { describe, it, expect } from 'vitest';
import fx from '../../shared/fixtures/receivable_aging.json';
import { buildAging, ageBucket, daysUnpaid, tieOutLine } from './receivableAging';

// Every case lives in shared/fixtures/receivable_aging.json. The phone's suite
// (mobile_app/test/receivable_aging_contract_test.dart) runs the same file
// against the Dart port. Add a case to the JSON, not to this file.

const section = (name) => {
  const s = fx[name];
  if (!Array.isArray(s) || !s.length) throw new Error(`fixture section "${name}" is missing or empty`);
  return s;
};
const fmt = (n) => `Rs ${n.toFixed(2)}`;

describe('ageBucket', () => {
  it.each(section('ageBucket').map((c) => [c.days, c]))('%s days', (_, c) => {
    expect(ageBucket(c.days)).toBe(c.expect);
  });
});

describe('daysUnpaid', () => {
  it.each(section('daysUnpaid').map((c) => [c.sale_date, c]))('%s', (_, c) => {
    expect(daysUnpaid(c.sale_date, c.today)).toBe(c.expect);
  });
});

describe('buildAging', () => {
  it.each(section('buildAging').map((c) => [c.name, c]))('%s', (_, c) => {
    const a = buildAging(c.unpaid, c.clients, c.today);
    const { customers, bill_order: billOrder, tie_out_line: line, ...numbers } = c.expect;
    expect(a).toMatchObject(numbers);
    if (customers) expect(a.customers.map((x) => [x.client_name, x.total, x.bills, x.oldest])).toEqual(customers);
    if (billOrder) expect(a.bills.map((b) => b.sale_id)).toEqual(billOrder);
    if (line) expect(tieOutLine(a, fmt)).toBe(line);
  });
});
