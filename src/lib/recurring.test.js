import { describe, it, expect } from 'vitest';
import fx from '../../shared/fixtures/recurring.json';
import {
  describeRecurring, recurringTemplateFor, nextRun, scheduleLine, paymentLabel, ordinal,
} from './recurring';

// Every case lives in shared/fixtures/recurring.json. The phone's suite
// (mobile_app/test/recurring_contract_test.dart) runs the same file against
// the Dart port, so a rule changed here and not there fails one of them.
// Add a case to the JSON, not to this file.

const section = (name) => {
  const s = fx[name];
  if (!Array.isArray(s) || !s.length) throw new Error(`fixture section "${name}" is missing or empty`);
  return s;
};
const show = (v) => JSON.stringify(v);

describe('shared fixture file', () => {
  it('has every section, so a missing one fails instead of passing empty', () => {
    for (const name of ['describe', 'templateFor', 'ordinal', 'nextRun', 'templateThenNextRun', 'scheduleLine', 'paymentLabel']) {
      expect(section(name).length).toBeGreaterThan(0);
    }
  });
});

describe('describeRecurring', () => {
  it.each(section('describe').map((c) => [show(c.input), c]))('%s', (_, c) => {
    expect(describeRecurring(c.input)).toBe(c.expect);
  });
});

describe('recurringTemplateFor', () => {
  // Matched key by key: keys the case does not list are not checked.
  it.each(section('templateFor').map((c) => [show(c.input), c]))('%s', (_, c) => {
    expect(recurringTemplateFor(c.input)).toMatchObject(c.expect);
  });
});

describe('ordinal', () => {
  it.each(section('ordinal').map((c) => [c.n, c]))('%s', (_, c) => {
    expect(ordinal(c.n)).toBe(c.expect);
  });
});

describe('nextRun', () => {
  it.each(section('nextRun').map((c) => [show(c.input), c]))('%s', (_, c) => {
    expect(nextRun(c.input)).toBe(c.expect);
  });
  it.each(section('templateThenNextRun').map((c) => [show(c.input), c]))('template, then %s', (_, c) => {
    expect(nextRun(recurringTemplateFor(c.input))).toBe(c.expect);
  });
});

describe('scheduleLine', () => {
  it.each(section('scheduleLine').map((c) => [show(c.input), c]))('%s', (_, c) => {
    expect(scheduleLine(c.input)).toBe(c.expect);
  });
});

describe('paymentLabel', () => {
  it.each(section('paymentLabel').map((c) => [show(c.input), c]))('%s', (_, c) => {
    expect(paymentLabel(c.input)).toBe(c.expect);
  });
});
