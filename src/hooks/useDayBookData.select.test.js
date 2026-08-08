import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A client-side filter may only test columns the query actually fetched.
 *
 * useDayBookData narrows its cached, whole-table rows back down with
 *
 *   r.tenant_id === tenantId && r.date === selectedDate && !r.deleted_at
 *
 * but tenant_id was not in any of the select lists. Every row compared
 * undefined against the tenant id, every row was discarded, and the DayBook
 * reported "no transactions for this date" on days that had them — 7 Aug 2026
 * carried 2 sales and 3 supplier payments and rendered completely empty.
 *
 * Nothing about it looked wrong: the query was right, the filter was right, and
 * they were wrong only together. This test holds the two in agreement.
 */

const SRC = readFileSync(
  join(process.cwd(), 'src', 'hooks', 'useDayBookData.js'), 'utf8');

const selectConstants = () => {
  const out = {};
  for (const m of SRC.matchAll(/const (SEL_[A-Z]+)\s*=\s*'([^']+)'/g)) {
    out[m[1]] = m[2].split(',').map(c => c.trim());
  }
  return out;
};

describe('DayBook selects fetch what the filter reads', () => {
  const selects = selectConstants();

  it('finds the select lists at all', () => {
    // If this fails the constants were renamed and the rest is vacuous.
    expect(Object.keys(selects).length).toBeGreaterThanOrEqual(5);
  });

  it.each(Object.keys(selectConstants()))('%s fetches tenant_id', (name) => {
    expect(
      selects[name],
      `${name} omits tenant_id, but forDay() filters on it — every row would ` +
      `compare undefined and be dropped, emptying the DayBook.`
    ).toContain('tenant_id');
  });

  it.each(Object.keys(selectConstants()))('%s fetches deleted_at', (name) => {
    expect(selects[name], `${name} omits deleted_at, which forDay() filters on`)
      .toContain('deleted_at');
  });

  it.each(Object.keys(selectConstants()))('%s fetches date', (name) => {
    expect(selects[name], `${name} omits date, which forDay() matches against`)
      .toContain('date');
  });

  it('the sales select still carries updated_at', () => {
    // receivedOnDay needs it to tell counter cash from a later settlement.
    expect(selects.SEL_SALES).toContain('updated_at');
  });

  it('the filter really does read those three columns', () => {
    // Guards the other direction: if forDay stops using them this test should
    // be revisited rather than silently passing for the wrong reason.
    const filter = SRC.slice(SRC.indexOf('const forDay'), SRC.indexOf('const forDay') + 400);
    expect(filter).toMatch(/tenant_id/);
    expect(filter).toMatch(/deleted_at/);
    expect(filter).toMatch(/\.date/);
  });
});
