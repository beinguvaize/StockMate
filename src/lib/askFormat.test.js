import { describe, it, expect } from 'vitest';
import { dayMonth, fill, formatValue, money, screenPath, splitNumbers, usageVars } from './askFormat';
import strings from '../../shared/ai_chat/strings.json';
import registry from '../../shared/ai_chat/questions.json';

describe('askFormat', () => {
  it('formats rupees the Indian way, with paise', () => {
    expect(money(1234567.5)).toBe('₹12,34,567.50');
    expect(money(-4200)).toBe('-₹4,200.00');
  });
  it('names months in the chosen language, with Western digits', () => {
    expect(dayMonth('2026-11-18', strings.en)).toBe('18 Nov');
    expect(dayMonth('2026-11-18', strings.hi)).toBe('18 नवंबर');
  });
  it('draws each kind, and an unknown kind as plain text', () => {
    expect(formatValue(1920, 'count', strings.en)).toBe('1,920');
    expect(formatValue(12.5, 'percent', strings.en)).toBe('12.5%');
    expect(formatValue('2026-12-02', 'date', strings.hi)).toBe('2 दिसंबर');
    expect(formatValue('x', 'new_kind', strings.en)).toBe('x');
    expect(formatValue(null, 'money', strings.en)).toBe('—');
  });
  it('works out the quota month from the reset date, across a year end', () => {
    expect(usageVars({ used: 1, limit: 10, resets_on: '2026-12-01' }, strings.en)).toMatchObject({ month: 'November', reset: '1 Dec' });
    expect(usageVars({ used: 1, limit: 10, resets_on: '2027-01-01' }, strings.en)).toMatchObject({ month: 'December', reset: '1 Jan' });
  });
  it('fills a template', () => {
    expect(fill('{a} of {b}', { a: 1, b: 2 })).toBe('1 of 2');
  });
  it('sets money and percentages apart in prose', () => {
    expect(splitNumbers('Up 13.7% to ₹1,84,620.00.').filter((p) => p.number).map((p) => p.part)).toEqual(['13.7%', '₹1,84,620.00']);
  });
  it('every screen key in the registry has a route and a link label', () => {
    for (const q of registry.questions) {
      for (const key of [q.screen.key, q.screen.fallback_key].filter(Boolean)) {
        expect(screenPath(key)).toBeTruthy();
        expect(strings.en.links[key]).toBeTruthy();
        expect(strings.hi.links[key]).toBeTruthy();
      }
    }
    expect(screenPath('not_a_screen')).toBeNull();
    expect(screenPath('suppliers')).toBe('/suppliers');
    expect(screenPath('purchases', { from: '2026-08-13', to: '2026-11-11' })).toBe('/purchases');
    expect(screenPath('reports_purchase_register', { from: '2026-11-01', to: '2026-11-10' }))
      .toBe('/reports?tab=PURCHASE_REGISTER&from=2026-11-01&to=2026-11-10');
  });
});
