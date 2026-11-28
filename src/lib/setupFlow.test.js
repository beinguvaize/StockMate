import { describe, it, expect } from 'vitest';
import {
  SETUP_STEPS, SETUP_PLANS, canContinue, canCreate, filterStates, planLabel, welcomeIncludes,
  ONBOARD_STEPS, rowState,
} from './setupFlow';
import { PLANS as TENANCY_PLANS } from './tenancy';

const full = {
  plan: 'GROWTH', businessType: 'RETAIL', businessName: 'Test Shop', businessPhone: '90000 00000',
  businessAddress: '1 Test Road', businessState: 'Kerala',
};

describe('setup steps', () => {
  it('has the six drawn steps in order', () => {
    expect(SETUP_STEPS).toEqual(['Plan', 'Type', 'Name', 'Phone', 'Address', 'State']);
  });

  it('needs each field, trimmed, before Continue', () => {
    expect(canContinue(3, { ...full, businessName: '   ' })).toBe(false);
    expect(canContinue(3, full)).toBe(true);
    expect(canContinue(4, { ...full, businessPhone: '' })).toBe(false);
    expect(canContinue(5, { ...full, businessAddress: ' \n ' })).toBe(false);
    expect(canContinue(6, { ...full, businessState: '' })).toBe(false);
    expect(canContinue(1, full)).toBe(true);
    expect(canContinue(2, full)).toBe(true);
    expect(canContinue(7, full)).toBe(false);
  });

  it('creates only with every field present, as the old form did', () => {
    expect(canCreate(full)).toBe(true);
    for (const k of ['businessName', 'businessPhone', 'businessAddress', 'businessState']) {
      expect(canCreate({ ...full, [k]: '' })).toBe(false);
    }
    expect(canCreate({ ...full, businessName: '  ' })).toBe(false);
  });
});

describe('state search', () => {
  const list = [{ name: 'Kerala', code: '32' }, { name: 'Karnataka', code: '29' }, { name: 'Tamil Nadu', code: '33' }];
  it('matches by part of the name, any case', () => {
    expect(filterStates('kar', list).map((s) => s.name)).toEqual(['Karnataka']);
    expect(filterStates('  TAMIL   nadu ', list).map((s) => s.name)).toEqual(['Tamil Nadu']);
  });
  it('matches the GST code too, and returns all for an empty query', () => {
    expect(filterStates('32', list).map((s) => s.name)).toEqual(['Kerala']);
    expect(filterStates('', list)).toHaveLength(3);
  });
  it('searches the real list by default', () => {
    expect(filterStates('kerala').map((s) => s.code)).toEqual(['32']);
  });
});

describe('plan cards', () => {
  it('offer the four plans at the prices tenancy.js charges', () => {
    expect(SETUP_PLANS.map((p) => p.id)).toEqual(['FREE', 'GROWTH', 'PRO', 'ENTERPRISE']);
    for (const p of SETUP_PLANS) {
      expect(TENANCY_PLANS[p.id].price.replace('/yr', '')).toBe(p.price);
    }
  });
  it('names a plan, old STARTER rows aside', () => {
    expect(planLabel('growth')).toBe('Growth');
    expect(planLabel('nonsense')).toBe('Free');
  });
});

describe('welcome card', () => {
  it('lists the plan the shop is on, STARTER read as Growth', () => {
    expect(welcomeIncludes('GROWTH').items).toContain('1,000 invoices a month');
    expect(welcomeIncludes('STARTER')).toBe(welcomeIncludes('GROWTH'));
    expect(welcomeIncludes('ENTERPRISE').more).toBeNull();
    expect(welcomeIncludes(undefined)).toBe(welcomeIncludes('FREE'));
  });
});

describe('first-day checklist', () => {
  it('has the four tasks, each opening an existing page', () => {
    expect(ONBOARD_STEPS.map((s) => s.path)).toEqual(['/settings', '/inventory', '/clients', '/sales']);
  });
  it('marks rows done, now, skipped or next', () => {
    const done = new Set(['profile']);
    expect(rowState(0, 2, done, 'profile')).toBe('done');
    expect(rowState(1, 2, done, 'product')).toBe('skipped');
    expect(rowState(2, 2, done, 'client')).toBe('now');
    expect(rowState(3, 2, done, 'sale')).toBe('next');
  });
});
