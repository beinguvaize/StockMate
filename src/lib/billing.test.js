import { describe, it, expect } from 'vitest';
import {
  describeSubscription, isEntitled, canManageBilling, upgradeAction, renewalText,
} from './billing';

describe('subscription state', () => {
  it('keeps a shop entitled while a payment is being retried', () => {
    // Razorpay moves to `pending` when a charge fails and it is still
    // retrying. Treating that as cancelled locks someone out of their own
    // books over a card that may well go through on the next attempt.
    expect(isEntitled('pending')).toBe(true);
    expect(describeSubscription('pending').label).toBe('Payment retrying');
  });

  it('drops entitlement once the retries are exhausted', () => {
    expect(isEntitled('halted')).toBe(false);
    expect(isEntitled('cancelled')).toBe(false);
    expect(isEntitled('expired')).toBe(false);
  });

  it('treats an unrecognised state as not entitled rather than guessing', () => {
    expect(isEntitled('something_new')).toBe(false);
    expect(describeSubscription(undefined).label).toBe('Unknown');
  });
});

describe('who may buy', () => {
  it('is owners and admins only', () => {
    expect(canManageBilling('OWNER')).toBe(true);
    expect(canManageBilling('admin')).toBe(true);
    expect(canManageBilling('STAFF')).toBe(false);
    expect(canManageBilling(null)).toBe(false);
  });

  it('hides the control entirely from staff', () => {
    expect(upgradeAction({ plan: 'PRO', currentPlan: 'FREE', role: 'STAFF' }).kind).toBe('hidden');
  });
});

describe('what the upgrade control offers', () => {
  const owner = { role: 'OWNER', currentPlan: 'FREE' };

  it('offers checkout for the self-serve plans', () => {
    expect(upgradeAction({ ...owner, plan: 'GROWTH' })).toMatchObject({ kind: 'checkout' });
    expect(upgradeAction({ ...owner, plan: 'PRO' }).label).toBe('Upgrade to Pro');
  });

  it('never offers a price for ENTERPRISE', () => {
    // It is priced per customer, so a Buy button would promise a number
    // nobody has agreed to.
    expect(upgradeAction({ ...owner, plan: 'ENTERPRISE' })).toMatchObject({ kind: 'contact' });
  });

  it('does not offer to sell the plan you are already on', () => {
    expect(upgradeAction({ role: 'OWNER', currentPlan: 'PRO', plan: 'PRO' }).kind).toBe('current');
  });
});

describe('renewal date', () => {
  it('reads as a date, not a timestamp', () => {
    expect(renewalText('2027-03-14T00:00:00Z')).toMatch(/14 March 2027/);
  });
  it('is absent rather than "Invalid Date" when there is no period', () => {
    expect(renewalText(null)).toBeNull();
    expect(renewalText('not a date')).toBeNull();
  });
});
