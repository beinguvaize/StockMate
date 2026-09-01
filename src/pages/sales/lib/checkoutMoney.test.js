import { describe, it, expect } from 'vitest';
import { checkoutMoney, surplusLabel } from './checkoutMoney';

/**
 * The block is the largest thing on the checkout screen, so a wrong label is a
 * wrong action: "Change to return" on a short payment means money handed out of
 * the drawer that was never taken in.
 */

describe('before anything is tendered', () => {
  it('shows the bill as amount due', () => {
    expect(checkoutMoney(1185, '', 'CASH'))
      .toEqual({ tone: 'due', label: 'Amount due', value: 1185, sub: null });
  });

  it('treats whitespace as nothing typed', () => {
    expect(checkoutMoney(1185, '   ', 'CASH').tone).toBe('due');
  });

  it('on credit, says where the money is going instead', () => {
    const m = checkoutMoney(1185, '', 'CREDIT');
    expect(m.tone).toBe('credit');
    expect(m.label).toBe('To client account');
    expect(m.value).toBe(1185);
  });
});

describe('cash tendered', () => {
  it('returns change when the customer overpays', () => {
    const m = checkoutMoney(1185, '1500', 'CASH');
    expect(m.tone).toBe('change');
    expect(m.label).toBe('Change to return');
    expect(m.value).toBeCloseTo(315, 2);
  });

  it('says what is still owed when the customer underpays', () => {
    // Never "change" — this is the branch that would hand out money that was
    // never taken in.
    const m = checkoutMoney(1185, '1000', 'CASH');
    expect(m.tone).toBe('short');
    expect(m.label).toBe('Still to collect');
    expect(m.value).toBeCloseTo(185, 2);
  });

  it('reads exact payment as paid in full, with no change', () => {
    const m = checkoutMoney(1185, '1185', 'CASH');
    expect(m.tone).toBe('exact');
    expect(m.sub).toBe('No change due');
  });

  it('tolerates float dust rather than reporting a paisa', () => {
    // 1184.9999999 is what a discount or an inclusive-tax back-out can leave.
    expect(checkoutMoney(1184.9999999, '1185', 'CASH').tone).toBe('exact');
    expect(checkoutMoney(1185.0000001, '1185', 'CASH').tone).toBe('exact');
  });

  it('ignores a negative entry rather than inventing change', () => {
    const m = checkoutMoney(1185, '-500', 'CASH');
    expect(m.tone).toBe('short');
    expect(m.value).toBeCloseTo(1185, 2);
  });

  it('handles a non-numeric entry as nothing paid', () => {
    expect(checkoutMoney(1185, 'abc', 'CASH').tone).toBe('short');
  });
});

describe('credit with a part payment', () => {
  it('shows what goes on account, not what was handed over', () => {
    const m = checkoutMoney(1185, '500', 'CREDIT');
    expect(m.tone).toBe('credit');
    expect(m.value).toBeCloseTo(685, 2);
    expect(m.sub).toContain('500.00');
  });

  it('never calls an overpayment change on credit', () => {
    // Paying more than this bill on account is settling an older debt; the
    // outstanding prompt deals with it after the sale. Calling it change here
    // would invite the cashier to hand it straight back.
    const m = checkoutMoney(1185, '2000', 'CREDIT');
    expect(m.tone).toBe('credit');
    expect(m.value).toBe(0);
  });
});

describe('robustness', () => {
  it('survives a missing total', () => {
    expect(checkoutMoney(undefined, '', 'CASH').value).toBe(0);
    expect(checkoutMoney(null, '', 'CASH').tone).toBe('due');
  });

  it('survives a missing method', () => {
    expect(checkoutMoney(100, '', undefined).tone).toBe('due');
  });

  it('is case-insensitive about the method', () => {
    expect(checkoutMoney(100, '', 'credit').tone).toBe('credit');
  });
});

describe('surplusLabel', () => {
  // "Excess received" covered two opposite outcomes: cash handed back, or a
  // surplus that cleared debt. A reader who credits already-returned cash
  // against the dues pays the same rupees out twice.
  it('is certain only about a credit sale, where nothing is collected at the till', () => {
    const credit = surplusLabel('CREDIT');
    expect(credit.label).toBe('Credited to account');
    expect(credit.certain).toBe(true);
  });

  it('refuses to guess the fate of a cash surplus', () => {
    // Checkout lets the cashier apply it to dues OR give it as change, and
    // nothing on the sale row records which. Asserting "Change returned" would
    // be the same error as "Excess received", pointing the other way.
    for (const m of ['CASH', 'cash', 'UPI', 'BANK', 'CARD', '', null, undefined]) {
      const r = surplusLabel(m);
      expect(r.label).toBe('Paid over this bill');
      expect(r.certain).toBe(false);
      expect(r.hint).toMatch(/change|dues/i);
    }
  });

  it('never says "excess", and never claims cash was kept or returned', () => {
    for (const m of ['CASH', 'CREDIT']) {
      const { label } = surplusLabel(m);
      expect(label.toLowerCase()).not.toContain('excess');
    }
    expect(surplusLabel('CASH').label).not.toMatch(/returned|change/i);
  });

  it('does not contradict what checkout showed for the same sale', () => {
    // SAL-04F680F6: 330 bill, 1515 handed over, CASH, client owing 2,785.
    // Checkout offered "Change to return"; the invoice must not assert the
    // shop kept it, nor that it was definitely handed back.
    expect(checkoutMoney(330, '1515', 'CASH').label).toBe('Change to return');
    expect(surplusLabel('CASH').label).toBe('Paid over this bill');
  });
});
